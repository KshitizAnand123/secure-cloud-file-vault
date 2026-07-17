/**
 * Encrypted file operations. All crypto happens in the browser.
 *
 * Upload flow:
 *   1. Read plaintext bytes.
 *   2. Compute SHA-256 fingerprint of plaintext (client-side).
 *   3. Generate a random 256-bit content key.
 *   4. Encrypt bytes with content key (AES-256-GCM, random IV).
 *   5. Wrap content key with the master key (AES-GCM, random IV).
 *   6. Encrypt filename with master key (AES-GCM, random IV).
 *   7. PUT ciphertext into `vault-files/{userId}/{fileId}`.
 *   8. INSERT metadata row (all bytes base64-encoded).
 *
 * Download flow:
 *   1. Fetch metadata row.
 *   2. Unwrap content key with master key.
 *   3. Fetch ciphertext from storage.
 *   4. Decrypt bytes.
 *   5. Recompute SHA-256 and compare against stored fingerprint → integrity badge.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  base64ToBytes,
  bytesToBase64,
  constantTimeEqual,
  generateContentKey,
  randomBytes,
  sha256,
  unwrapContentKey,
  wrapContentKey,
  IV_LENGTH,
} from "@/lib/crypto";
import { logActivity } from "./activity-service";

const BUCKET = "vault-files";

export interface EncryptedFileRow {
  id: string;
  user_id: string;
  name_ciphertext: string;
  name_iv: string;
  mime_hint: string | null;
  size_bytes: number;
  storage_path: string;
  wrapped_key: string;
  wrap_iv: string;
  content_iv: string;
  sha256: string;
  created_at: string;
  updated_at: string;
}

export interface DecryptedFileMeta {
  id: string;
  name: string;
  mimeHint: string | null;
  sizeBytes: number;
  createdAt: string;
  sha256B64: string;
}

export interface DownloadResult {
  bytes: Uint8Array;
  meta: DecryptedFileMeta;
  integrityVerified: boolean;
}

// -----------------------------------------------------------------------------
// Upload
// -----------------------------------------------------------------------------

export interface UploadOptions {
  file: File;
  userId: string;
  masterKey: CryptoKey;
  onProgress?: (fraction: number) => void;
}

export async function uploadEncryptedFile({
  file,
  userId,
  masterKey,
  onProgress,
}: UploadOptions): Promise<EncryptedFileRow> {
  onProgress?.(0.05);

  // 1. Read + hash plaintext.
  const plaintext = new Uint8Array(await file.arrayBuffer());
  onProgress?.(0.15);
  const hash = await sha256(plaintext);
  onProgress?.(0.25);

  // 2. Generate + wrap content key.
  const contentKey = await generateContentKey();
  const { wrapped, iv: wrapIv } = await wrapContentKey(contentKey, masterKey);

  // 3. Encrypt bytes.
  const contentIv = randomBytes(IV_LENGTH);
  const { ciphertext } = await aesGcmEncrypt(contentKey, plaintext, contentIv);
  onProgress?.(0.55);

  // 4. Encrypt filename with master key.
  const nameIv = randomBytes(IV_LENGTH);
  const { ciphertext: nameCt } = await aesGcmEncrypt(
    masterKey,
    new TextEncoder().encode(file.name),
    nameIv,
  );

  // 5. Upload ciphertext to storage. Object key includes the user id so the
  //    storage RLS policy (auth.uid()::text = first folder) applies.
  const fileId = crypto.randomUUID();
  const storagePath = `${userId}/${fileId}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, ciphertext, {
      contentType: "application/octet-stream",
      upsert: false,
    });
  if (uploadError) throw uploadError;
  onProgress?.(0.85);

  // 6. Insert metadata row.
  const row = {
    id: fileId,
    user_id: userId,
    name_ciphertext: bytesToBase64(nameCt),
    name_iv: bytesToBase64(nameIv),
    mime_hint: file.type || null,
    size_bytes: ciphertext.length,
    storage_path: storagePath,
    wrapped_key: bytesToBase64(wrapped),
    wrap_iv: bytesToBase64(wrapIv),
    content_iv: bytesToBase64(contentIv),
    sha256: bytesToBase64(hash),
  };
  const { data, error } = await supabase
    .from("files")
    .insert(row)
    .select()
    .single();
  if (error) {
    // Best-effort cleanup on metadata failure.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw error;
  }
  onProgress?.(0.92);

  // Snapshot as version 1 (fire-and-forget; audit trail is best-effort).
  try {
    await supabase.from("file_versions").insert({
      file_id: (data as EncryptedFileRow).id,
      user_id: userId,
      version_number: 1,
      storage_path: row.storage_path,
      wrapped_key: row.wrapped_key,
      wrap_iv: row.wrap_iv,
      content_iv: row.content_iv,
      sha256: row.sha256,
      size_bytes: row.size_bytes,
      name_ciphertext: row.name_ciphertext,
      name_iv: row.name_iv,
      mime_hint: row.mime_hint,
      note: "Initial upload",
    });
  } catch {
    /* audit-only, ignore */
  }
  await logActivity({
    action: "file.uploaded",
    targetType: "file",
    targetId: (data as EncryptedFileRow).id,
    metadata: { size: ciphertext.length, mime: file.type || null },
  });

  onProgress?.(1);
  return data as EncryptedFileRow;
}

// -----------------------------------------------------------------------------
// List + decrypt metadata
// -----------------------------------------------------------------------------

export async function listFiles(): Promise<EncryptedFileRow[]> {
  const { data, error } = await supabase
    .from("files")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EncryptedFileRow[];
}

export async function decryptFileMeta(
  row: EncryptedFileRow,
  masterKey: CryptoKey,
): Promise<DecryptedFileMeta> {
  const nameBytes = await aesGcmDecrypt(
    masterKey,
    base64ToBytes(row.name_ciphertext),
    base64ToBytes(row.name_iv),
  );
  return {
    id: row.id,
    name: new TextDecoder().decode(nameBytes),
    mimeHint: row.mime_hint,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    sha256B64: row.sha256,
  };
}

// -----------------------------------------------------------------------------
// Download + verify
// -----------------------------------------------------------------------------

export async function downloadAndDecrypt(
  row: EncryptedFileRow,
  masterKey: CryptoKey,
): Promise<DownloadResult> {
  const meta = await decryptFileMeta(row, masterKey);

  const contentKey = await unwrapContentKey(
    base64ToBytes(row.wrapped_key),
    base64ToBytes(row.wrap_iv),
    masterKey,
  );

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(row.storage_path);
  if (error) throw error;

  const ciphertext = new Uint8Array(await data.arrayBuffer());
  const plaintext = await aesGcmDecrypt(
    contentKey,
    ciphertext,
    base64ToBytes(row.content_iv),
  );

  const expected = base64ToBytes(row.sha256);
  const actual = await sha256(plaintext);
  const integrityVerified = constantTimeEqual(expected, actual);

  await logActivity({
    action: "file.downloaded",
    targetType: "file",
    targetId: row.id,
    metadata: { integrity: integrityVerified },
  });

  return { bytes: plaintext, meta, integrityVerified };
}

// -----------------------------------------------------------------------------
// Delete
// -----------------------------------------------------------------------------

export async function deleteFile(row: EncryptedFileRow): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([row.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from("files").delete().eq("id", row.id);
  if (error) throw error;
  await logActivity({
    action: "file.deleted",
    targetType: "file",
    targetId: row.id,
  });
}
