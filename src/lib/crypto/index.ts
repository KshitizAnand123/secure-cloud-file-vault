/**
 * Zero-knowledge crypto module.
 *
 * All primitives run in the browser via WebCrypto. The server MUST NEVER see:
 *   - the user's vault passphrase
 *   - the derived master key
 *   - any per-file content key in the clear
 *   - any plaintext file bytes or filename
 *
 * Design:
 *   - Master key: PBKDF2-SHA256(passphrase, salt, 310k iterations) → 256-bit AES-GCM key.
 *     (OWASP 2023 recommendation for PBKDF2-SHA256. Argon2id would be stronger but
 *      is not in WebCrypto; we intentionally avoid pulling a WASM Argon2 into the
 *      hot path of this first slice — swap-in point is `deriveMasterKey`.)
 *   - Per-file content key: 256-bit random, wrapped by the master key with AES-GCM.
 *   - File bytes: AES-256-GCM with a fresh 96-bit IV per file.
 *   - Filename: AES-256-GCM with the master key + fresh 96-bit IV per file.
 *   - Integrity: SHA-256 of the plaintext, computed client-side, verified on download.
 *
 * All bytes cross the wire as base64. IVs are 12 bytes (GCM standard).
 */

export const PBKDF2_ITERATIONS = 310_000;
export const AES_KEY_LENGTH = 256;
export const IV_LENGTH = 12;
export const SALT_LENGTH = 16;

// -----------------------------------------------------------------------------
// Encoding helpers
// -----------------------------------------------------------------------------

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return buf;
}

// -----------------------------------------------------------------------------
// Key derivation
// -----------------------------------------------------------------------------

/**
 * Derive a non-extractable AES-256-GCM CryptoKey from a passphrase.
 * The key never leaves the browser and cannot be exported.
 */
export async function deriveMasterKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    /* extractable */ false,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
  );
}

// -----------------------------------------------------------------------------
// AES-GCM primitives
// -----------------------------------------------------------------------------

export async function aesGcmEncrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
  iv: Uint8Array = randomBytes(IV_LENGTH),
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plaintext as BufferSource,
  );
  return { ciphertext: new Uint8Array(ct), iv };
}

export async function aesGcmDecrypt(
  key: CryptoKey,
  ciphertext: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ciphertext as BufferSource,
  );
  return new Uint8Array(pt);
}

// -----------------------------------------------------------------------------
// Per-file content key (extractable so we can wrap it, then discard)
// -----------------------------------------------------------------------------

export async function generateContentKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    /* extractable */ true,
    ["encrypt", "decrypt"],
  );
}

/** Encrypt (wrap) a per-file key with the master key, using AES-GCM. */
export async function wrapContentKey(
  contentKey: CryptoKey,
  masterKey: CryptoKey,
): Promise<{ wrapped: Uint8Array; iv: Uint8Array }> {
  const iv = randomBytes(IV_LENGTH);
  const wrapped = await crypto.subtle.wrapKey("raw", contentKey, masterKey, {
    name: "AES-GCM",
    iv: iv as BufferSource,
  });
  return { wrapped: new Uint8Array(wrapped), iv };
}

export async function unwrapContentKey(
  wrapped: Uint8Array,
  iv: Uint8Array,
  masterKey: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    wrapped as BufferSource,
    masterKey,
    { name: "AES-GCM", iv: iv as BufferSource },
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    /* extractable */ false,
    ["encrypt", "decrypt"],
  );
}

// -----------------------------------------------------------------------------
// Integrity
// -----------------------------------------------------------------------------

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return new Uint8Array(digest);
}

/** Timing-safe compare for equal-length byte arrays. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
