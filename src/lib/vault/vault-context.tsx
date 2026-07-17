/**
 * In-memory master-key context.
 *
 * The unlocked master key lives *only* in React state — never localStorage,
 * sessionStorage, or IndexedDB. Reloading the page locks the vault.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface VaultState {
  masterKey: CryptoKey | null;
  isUnlocked: boolean;
  unlock: (key: CryptoKey) => void;
  lock: () => void;
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

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultState {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used inside <VaultProvider>");
  return ctx;
}
