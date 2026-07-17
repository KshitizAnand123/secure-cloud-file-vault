/**
 * Vault bootstrap and unlock helpers.
 *
 * These helpers derive the browser-only master key from the user's passphrase,
 * then persist the vault metadata to Supabase. The passphrase and key never leave
 * the browser.
 */

import { createContext, createElement, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  base64ToBytes,
  bytesToBase64,
  constantTimeEqual,
  deriveMasterKey,
  IV_LENGTH,
  PBKDF2_ITERATIONS,
  randomBytes,
  SALT_LENGTH,
} from "@/lib/crypto";

interface VaultState {
  masterKey: CryptoKey | null;
  isUnlocked: boolean;
  unlock: (key: CryptoKey) => void;
  lock: () => void;
}

interface VaultRow {
  user_id: string;
  kdf_salt: string;
  kdf_iterations: number;
  verifier_ciphertext: string;
  verifier_iv: string;
  created_at: string;
  updated_at: string;
}

const VaultContext = createContext<VaultState | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);

  const unlock = useCallback((key: CryptoKey) => setMasterKey(key), []);
  const lock = useCallback(() => setMasterKey(null), []);

  const value = useMemo<VaultState>(
    () => ({ masterKey, isUnlocked: masterKey !== null, unlock, lock }),
    [masterKey, unlock, lock],
  );

  return createElement(VaultContext.Provider, { value }, children);
}

export function useVault(): VaultState {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used inside <VaultProvider>");
  return ctx;
}

function getVaultVerifierMaterial(): Uint8Array {
  return new TextEncoder().encode("vault-verifier-material");
}

async function encryptVaultVerifier(masterKey: CryptoKey, verifier: Uint8Array): Promise<{ ciphertext: string; iv: string }> {
  const iv = randomBytes(IV_LENGTH);
  const { ciphertext } = await aesGcmEncrypt(masterKey, verifier, iv);
  return {
    ciphertext: bytesToBase64(ciphertext),
    iv: bytesToBase64(iv),
  };
}

async function deriveMasterKeyFromPassphrase(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  return deriveMasterKey(passphrase, salt, PBKDF2_ITERATIONS);
}

export async function getVaultRow(userId: string): Promise<VaultRow | null> {
  const { data, error } = await supabase
    .from("user_vault")
    .select("user_id, kdf_salt, kdf_iterations, verifier_ciphertext, verifier_iv, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as VaultRow | null;
}

export async function initializeVault(userId: string, passphrase: string): Promise<CryptoKey> {
  const salt = randomBytes(SALT_LENGTH);
  const masterKey = await deriveMasterKeyFromPassphrase(passphrase, salt);
  const verifier = getVaultVerifierMaterial();
  const { ciphertext, iv } = await encryptVaultVerifier(masterKey, verifier);

  const { error } = await supabase.from("user_vault").insert({
    user_id: userId,
    kdf_salt: bytesToBase64(salt),
    kdf_iterations: PBKDF2_ITERATIONS,
    verifier_ciphertext: ciphertext,
    verifier_iv: iv,
  });
  if (error) throw error;

  return masterKey;
}

export async function unlockVault(vaultRow: VaultRow, passphrase: string): Promise<CryptoKey> {
  const salt = base64ToBytes(vaultRow.kdf_salt);
  const masterKey = await deriveMasterKeyFromPassphrase(passphrase, salt);
  const verifier = getVaultVerifierMaterial();
  let decryptedVerifier: Uint8Array;
  try {
    decryptedVerifier = await aesGcmDecrypt(
      masterKey,
      base64ToBytes(vaultRow.verifier_ciphertext),
      base64ToBytes(vaultRow.verifier_iv),
    );
  } catch {
    throw new Error("Incorrect passphrase");
  }

  if (!constantTimeEqual(decryptedVerifier, verifier)) {
    throw new Error("Incorrect passphrase");
  }
  return masterKey;
}
