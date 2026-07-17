/**
 * File versioning — every mutation of a file's content is snapshotted into
 * `file_versions`. Snapshots reference their own storage object so restoring
 * an old version is a metadata swap and never a re-encryption.
 *
 * Semantics:
 *   - Version 1 is created alongside the initial upload (see file-service).
 *   - "Upload new version" creates version N+1: uploads fresh ciphertext,
 *     inserts a new file_versions row, and updates the `files` row to point
 *     at that new storage object / IVs / hash.
 *   - "Restore" swaps `files` to reference a prior version's crypto envelope,
 *     and appends a new version row noting the restore (so history is
 *     append-only from an audit POV).
 *
 * Zero-knowledge: all encryption happens client-side, with the same master
 * key that owns the current `files` row.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  IV_LENGTH,
  aesGcmEncrypt,
  base64ToBytes,
  bytesToBase64,
  generateContentKey,
  randomBytes,
  sha256,
  wrapContentKey,
} from "@/lib/crypto";
import type { EncryptedFileRow } from "./file-service";

const BUCKET = "vault-files";

export interface FileVersionRow {
  id: string;
  file_id: string;
  user_id: string;
  version_number: number;
  storage_path: string;
  wrapped_key: string;
  wrap_iv: string;
  content_iv: string;
  sha256: string;
  size_bytes: number;
  name_ciphertext: string;
  name_iv: string;
  mime_hint: string | null;
  note: string | null;
  created_at: string;
}

export async function listVersions(fileId: string): Promise<FileVersionRow[]> {
  const { data, error } = await supabase
    .from("file_versions")
    .select("*")
    .eq("file_id", fileId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as FileVersionRow[];
}

async function nextVersionNumber(fileId: string): Promise<number> {
  const { data, error } = await supabase
    .from("file_versions")
    .select("version_number")
    .eq("file_id", fileId)
    .order("version_number", { ascending: false })
    .limit(1);
  if (error) throw error;
  const max = data?.[0]?.version_number ?? 0;
  return (max as number) + 1;
}

/**
 * Snapshot an EncryptedFileRow into file_versions.
 * Used for the initial version and for post-restore audit rows.
 */
export async function snapshotFileAsVersion(
  file: EncryptedFileRow,
  opts: { note?: string; versionNumber?: number } = {},
): Promise<FileVersionRow> {
  const version =
    opts.versionNumber ?? (await nextVersionNumber(file.id));
  const { data, error } = await supabase
    .from("file_versions")
    .insert({
      file_id: file.id,
      user_id: file.user_id,
      version_number: version,
      storage_path: file.storage_path,
      wrapped_key: file.wrapped_key,
      wrap_iv: file.wrap_iv,
      content_iv: file.content_iv,
      sha256: file.sha256,
      size_bytes: file.size_bytes,
      name_ciphertext: file.name_ciphertext,
      name_iv: file.name_iv,
      mime_hint: file.mime_hint,
      note: opts.note ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as FileVersionRow;
}

// -----------------------------------------------------------------------------
// Upload a new version of an existing file (client-side encryption).
// -----------------------------------------------------------------------------

export interface UploadVersionOptions {
  file: EncryptedFileRow; // current `files` row
  newBlob: File;          // freshly picked file bytes
  masterKey: CryptoKey;
  onProgress?: (fraction: number) => void;
}

export async function uploadNewVersion({
  file,
  newBlob,
  masterKey,
  onProgress,
}: UploadVersionOptions): Promise<{
  updatedFile: EncryptedFileRow;
  version: FileVersionRow;
}> {
  onProgress?.(0.05);
  const plaintext = new Uint8Array(await newBlob.arrayBuffer());
  onProgress?.(0.15);
  const hash = await sha256(plaintext);

  const contentKey = await generateContentKey();
  const { wrapped, iv: wrapIv } = await wrapContentKey(contentKey, masterKey);

  const contentIv = randomBytes(IV_LENGTH);
  const { ciphertext } = await aesGcmEncrypt(contentKey, plaintext, contentIv);
  onProgress?.(0.55);

  // Reuse the file's encrypted filename — versioning shouldn't rename the file
  // unless the user explicitly renames. Keep name_ciphertext/name_iv as-is.

  // Upload as a new object so old versions remain retrievable.
  const versionObjectId = crypto.randomUUID();
  const storagePath = `${file.user_id}/${file.id}/${versionObjectId}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, ciphertext, {
      contentType: "application/octet-stream",
      upsert: false,
    });
  if (uploadError) throw uploadError;
  onProgress?.(0.8);

  const version = await snapshotFileAsVersion(
    {
      ...file,
      storage_path: storagePath,
      wrapped_key: bytesToBase64(wrapped),
      wrap_iv: bytesToBase64(wrapIv),
      content_iv: bytesToBase64(contentIv),
      sha256: bytesToBase64(hash),
      size_bytes: ciphertext.length,
      mime_hint: newBlob.type || file.mime_hint,
    },
    { note: `Uploaded new version (${newBlob.name})` },
  );

  // Point `files` at the newest version's envelope.
  const { data: updated, error: updateError } = await supabase
    .from("files")
    .update({
      storage_path: storagePath,
      wrapped_key: bytesToBase64(wrapped),
      wrap_iv: bytesToBase64(wrapIv),
      content_iv: bytesToBase64(contentIv),
      sha256: bytesToBase64(hash),
      size_bytes: ciphertext.length,
      mime_hint: newBlob.type || file.mime_hint,
    })
    .eq("id", file.id)
    .select()
    .single();
  if (updateError) throw updateError;
  onProgress?.(1);

  return { updatedFile: updated as EncryptedFileRow, version };
}

// -----------------------------------------------------------------------------
// Restore an earlier version → point `files` at it, add audit version row.
// -----------------------------------------------------------------------------

export async function restoreVersion(
  file: EncryptedFileRow,
  version: FileVersionRow,
): Promise<EncryptedFileRow> {
  const { data: updated, error } = await supabase
    .from("files")
    .update({
      storage_path: version.storage_path,
      wrapped_key: version.wrapped_key,
      wrap_iv: version.wrap_iv,
      content_iv: version.content_iv,
      sha256: version.sha256,
      size_bytes: version.size_bytes,
      name_ciphertext: version.name_ciphertext,
      name_iv: version.name_iv,
      mime_hint: version.mime_hint,
    })
    .eq("id", file.id)
    .select()
    .single();
  if (error) throw error;

  // Append audit row (new version number, points at the restored object).
  await snapshotFileAsVersion(updated as EncryptedFileRow, {
    note: `Restored from version ${version.version_number}`,
  });

  return updated as EncryptedFileRow;
}

// -----------------------------------------------------------------------------
// Ensure v1 exists for a fresh upload.
// -----------------------------------------------------------------------------

export async function ensureInitialVersion(
  file: EncryptedFileRow,
): Promise<void> {
  const existing = await listVersions(file.id);
  if (existing.length > 0) return;
  await snapshotFileAsVersion(file, {
    versionNumber: 1,
    note: "Initial upload",
  });
}

// Base64 pass-through so we don't need to re-import in callers.
export { base64ToBytes as _b64d };
