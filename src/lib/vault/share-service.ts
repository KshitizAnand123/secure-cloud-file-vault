/**
 * Client-side share creation & recipient decryption.
 *
 * Create flow (owner, authenticated):
 *   1. Unwrap the file's content key with the master key.
 *      (Re-unwrapped as *extractable* so we can rewrap it under the share key.)
 *   2. Generate a random 256-bit share token + optional PBKDF2 salt.
 *   3. Derive share key in-browser (token, or token+password).
 *   4. Rewrap the content key under the share key + re-encrypt the filename
 *      under the share key.
 *   5. INSERT a `file_shares` row storing SHA-256(token), the rewrapped key,
 *      the re-encrypted filename, and the file's storage snapshot.
 *   6. Return a share URL of the form `${origin}/s/{shareId}#{tokenB64url}`.
 *
 * Recipient flow (anonymous, in the public /s/$id page):
 *   1. Parse tokenB64url from the URL fragment.
 *   2. Compute SHA-256(token) hex.
 *   3. POST to /api/public/share/$id (verb=lookup) with the hash — server
 *      returns metadata (and password_salt if password-protected).
 *   4. If password required, prompt user and re-derive share key.
 *   5. POST to /api/public/share/$id (verb=download) — server verifies
 *      the hash, atomically enforces expiry/max_downloads/revoked, and
 *      streams the ciphertext.
 *   6. Unwrap content key with share key, decrypt bytes, verify SHA-256.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  IV_LENGTH,
  PBKDF2_ITERATIONS,
  aesGcmDecrypt,
  aesGcmEncrypt,
  base64ToBytes,
  bytesToBase64,
  constantTimeEqual,
  randomBytes,
  sha256,
} from "@/lib/crypto";
import {
  bytesToBase64Url,
  base64UrlToBytes,
  deriveShareKey,
  hashTokenHex,
  newPasswordSalt,
  newShareToken,
} from "@/lib/crypto/share";
import type { EncryptedFileRow } from "./file-service";

// -----------------------------------------------------------------------------
// Owner: unwrap content key as *extractable* so we can rewrap under share key.
// (Symmetric to unwrapContentKey but extractable — used only in-browser.)
// -----------------------------------------------------------------------------

async function unwrapContentKeyExtractable(
  wrapped: Uint8Array,
  iv: Uint8Array,
  masterKey: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    wrapped as BufferSource,
    masterKey,
    { name: "AES-GCM", iv: iv as BufferSource },
    { name: "AES-GCM", length: 256 },
    /* extractable */ true,
    ["encrypt", "decrypt"],
  );
}

async function wrapKeyUnder(
  contentKey: CryptoKey,
  wrappingKey: CryptoKey,
): Promise<{ wrapped: Uint8Array; iv: Uint8Array }> {
  const iv = randomBytes(IV_LENGTH);
  const wrapped = await crypto.subtle.wrapKey("raw", contentKey, wrappingKey, {
    name: "AES-GCM",
    iv: iv as BufferSource,
  });
  return { wrapped: new Uint8Array(wrapped), iv };
}

// -----------------------------------------------------------------------------
// Create share
// -----------------------------------------------------------------------------

export interface CreateShareOptions {
  file: EncryptedFileRow;
  masterKey: CryptoKey;
  filename: string;
  password?: string;
  expiresAt?: Date | null;
  maxDownloads?: number | null;
}

export interface CreateShareResult {
  shareId: string;
  url: string;
}

export async function createShare({
  file,
  masterKey,
  filename,
  password,
  expiresAt,
  maxDownloads,
}: CreateShareOptions): Promise<CreateShareResult> {
  const { data: authData } = await supabase.auth.getUser();
  const ownerId = authData.user?.id;
  if (!ownerId) throw new Error("Not authenticated");

  // 1. Unwrap file's content key (extractable, so we can rewrap it).
  const contentKey = await unwrapContentKeyExtractable(
    base64ToBytes(file.wrapped_key),
    base64ToBytes(file.wrap_iv),
    masterKey,
  );

  // 2. Fresh token + optional password salt.
  const token = newShareToken();
  const tokenHash = await hashTokenHex(token);
  const passwordSalt = password ? newPasswordSalt() : undefined;

  // 3. Derive share key locally.
  const shareKey = await deriveShareKey({
    token,
    password: password || undefined,
    passwordSalt,
    passwordIterations: PBKDF2_ITERATIONS,
  });

  // 4. Rewrap content key & re-encrypt filename under share key.
  const { wrapped: wrappedShareKey, iv: wrapIv } = await wrapKeyUnder(
    contentKey,
    shareKey,
  );
  const nameIv = randomBytes(IV_LENGTH);
  const { ciphertext: nameCt } = await aesGcmEncrypt(
    shareKey,
    new TextEncoder().encode(filename),
    nameIv,
  );

  // 5. Insert share row.
  const { data, error } = await supabase
    .from("file_shares")
    .insert({
      file_id: file.id,
      owner_id: ownerId,
      token_hash: tokenHash,
      wrapped_share_key: bytesToBase64(wrappedShareKey),
      wrap_iv: bytesToBase64(wrapIv),
      name_ciphertext: bytesToBase64(nameCt),
      name_iv: bytesToBase64(nameIv),
      mime_hint: file.mime_hint,
      sha256: file.sha256,
      size_bytes: file.size_bytes,
      storage_path: file.storage_path,
      content_iv: file.content_iv,
      password_salt: passwordSalt ? bytesToBase64(passwordSalt) : null,
      password_iterations: password ? PBKDF2_ITERATIONS : null,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      max_downloads: maxDownloads ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const url = `${window.location.origin}/s/${data.id}#${bytesToBase64Url(token)}`;
  return { shareId: data.id, url };
}

// -----------------------------------------------------------------------------
// Owner: list & revoke shares
// -----------------------------------------------------------------------------

export interface ShareRow {
  id: string;
  file_id: string;
  expires_at: string | null;
  max_downloads: number | null;
  download_count: number;
  revoked: boolean;
  password_salt: string | null;
  created_at: string;
}

export async function listSharesForFile(fileId: string): Promise<ShareRow[]> {
  const { data, error } = await supabase
    .from("file_shares")
    .select("id, file_id, expires_at, max_downloads, download_count, revoked, password_salt, created_at")
    .eq("file_id", fileId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ShareRow[];
}

export async function revokeShare(shareId: string): Promise<void> {
  const { error } = await supabase
    .from("file_shares")
    .update({ revoked: true })
    .eq("id", shareId);
  if (error) throw error;
}

// -----------------------------------------------------------------------------
// Recipient: lookup + download via public server route
// -----------------------------------------------------------------------------

export interface ShareLookupResponse {
  id: string;
  passwordProtected: boolean;
  passwordSalt: string | null;
  passwordIterations: number | null;
  mimeHint: string | null;
  sizeBytes: number;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  createdAt: string;
}

export async function lookupShare(
  shareId: string,
  token: Uint8Array,
): Promise<ShareLookupResponse> {
  const tokenHash = await hashTokenHex(token);
  const res = await fetch(`/api/public/share/${shareId}?op=lookup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tokenHash }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Share unavailable (${res.status})`);
  }
  return (await res.json()) as ShareLookupResponse;
}

export interface DecryptedShare {
  bytes: Uint8Array;
  name: string;
  mimeHint: string | null;
  sizeBytes: number;
  integrityVerified: boolean;
}

export async function downloadShare(
  shareId: string,
  token: Uint8Array,
  password?: string,
): Promise<DecryptedShare> {
  const tokenHash = await hashTokenHex(token);
  const res = await fetch(`/api/public/share/${shareId}?op=download`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tokenHash }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Download failed (${res.status})`);
  }

  // Server returns JSON: { ciphertextB64, wrappedShareKey, wrapIv,
  // nameCiphertext, nameIv, contentIv, sha256, mimeHint, sizeBytes,
  // passwordSalt, passwordIterations }.
  const payload = (await res.json()) as {
    ciphertextB64: string;
    wrappedShareKey: string;
    wrapIv: string;
    nameCiphertext: string;
    nameIv: string;
    contentIv: string;
    sha256: string;
    mimeHint: string | null;
    sizeBytes: number;
    passwordSalt: string | null;
    passwordIterations: number | null;
  };

  const shareKey = await deriveShareKey({
    token,
    password: password || undefined,
    passwordSalt: payload.passwordSalt ? base64ToBytes(payload.passwordSalt) : undefined,
    passwordIterations: payload.passwordIterations ?? PBKDF2_ITERATIONS,
  });

  let contentKey: CryptoKey;
  try {
    contentKey = await crypto.subtle.unwrapKey(
      "raw",
      base64ToBytes(payload.wrappedShareKey) as BufferSource,
      shareKey,
      { name: "AES-GCM", iv: base64ToBytes(payload.wrapIv) as BufferSource },
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
  } catch {
    throw new Error(
      payload.passwordSalt
        ? "Incorrect password"
        : "Invalid share token",
    );
  }

  const nameBytes = await aesGcmDecrypt(
    shareKey,
    base64ToBytes(payload.nameCiphertext),
    base64ToBytes(payload.nameIv),
  );
  const name = new TextDecoder().decode(nameBytes);

  const plaintext = await aesGcmDecrypt(
    contentKey,
    base64ToBytes(payload.ciphertextB64),
    base64ToBytes(payload.contentIv),
  );

  const actual = await sha256(plaintext);
  const expected = base64ToBytes(payload.sha256);
  const integrityVerified = constantTimeEqual(actual, expected);

  return {
    bytes: plaintext,
    name,
    mimeHint: payload.mimeHint,
    sizeBytes: payload.sizeBytes,
    integrityVerified,
  };
}

export function parseShareFragment(): Uint8Array | null {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  try {
    return base64UrlToBytes(hash);
  } catch {
    return null;
  }
}
