import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Lock,
  LogOut,
  Upload,
  Download,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Loader2,
  KeyRound,
  Eye,
  Share2,
  History,
  Activity as ActivityIcon,
} from "lucide-react";
import { ShareDialog } from "@/components/vault/ShareDialog";
import { FilePreview } from "@/components/vault/FilePreview";
import { VersionsDialog } from "@/components/vault/VersionsDialog";
import { ThemeToggle } from "@/components/ThemeToggle";

import { supabase } from "@/integrations/supabase/client";
import { useVault } from "@/lib/vault/vault-context";
import {
  getVaultRow,
  initializeVault,
  unlockVault,
} from "@/lib/vault/vault-service";
import {
  decryptFileMeta,
  deleteFile,
  downloadAndDecrypt,
  listFiles,
  uploadEncryptedFile,
  type DecryptedFileMeta,
  type EncryptedFileRow,
} from "@/lib/vault/file-service";
import { logActivity } from "@/lib/vault/activity-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/vault")({
  component: VaultPage,
});

function VaultPage() {
  const { user } = Route.useRouteContext();
  const { isUnlocked } = useVault();
  const navigate = useNavigate();

  async function handleSignOut() {
    await logActivity({ action: "auth.signout", targetType: "auth" });
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <Lock className="h-4 w-4 text-primary" strokeWidth={2.5} />
            <span>Vaultline</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-xs uppercase tracking-widest text-muted-foreground sm:inline">
              {user.email}
            </span>
            <Link
              to="/activity"
              className="inline-flex h-9 items-center rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Activity log"
            >
              <ActivityIcon className="h-4 w-4" />
              <span className="ml-1.5 hidden sm:inline">Activity</span>
            </Link>
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {isUnlocked ? <UnlockedVault userId={user.id} /> : <UnlockGate userId={user.id} />}
      </main>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Passphrase gate: bootstrap OR unlock, depending on whether user_vault exists.
// -----------------------------------------------------------------------------

function UnlockGate({ userId }: { userId: string }) {
  const { unlock } = useVault();
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const {
    data: vaultRow,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["user-vault", userId],
    queryFn: () => getVaultRow(userId),
  });

  const isBootstrap = vaultRow === null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (passphrase.length < 12) {
      toast.error("Passphrase must be at least 12 characters");
      return;
    }
    if (isBootstrap && passphrase !== confirm) {
      toast.error("Passphrases don't match");
      return;
    }
    setLoading(true);
    try {
      const key = isBootstrap
        ? await initializeVault(userId, passphrase)
        : await unlockVault(vaultRow!, passphrase);
      unlock(key);
      toast.success(isBootstrap ? "Vault created" : "Vault unlocked");
      logActivity({
        action: isBootstrap ? "vault.created" : "vault.unlocked",
        targetType: "vault",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unlock");
    } finally {
      setLoading(false);
      setPassphrase("");
      setConfirm("");
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-center text-sm text-destructive">
        Failed to load vault: {(error as Error).message}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-xl border border-border bg-surface p-6">
        <KeyRound className="h-5 w-5 text-primary" strokeWidth={2.5} />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          {isBootstrap ? "Set your vault passphrase" : "Unlock your vault"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isBootstrap
            ? "This derives your encryption key locally. If you forget it, your files cannot be recovered — not even by us."
            : "Your passphrase is used to derive your encryption key in this browser only."}
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="passphrase">Passphrase</Label>
            <Input
              id="passphrase"
              type="password"
              autoComplete={isBootstrap ? "new-password" : "current-password"}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="At least 12 characters"
              required
              minLength={12}
              maxLength={512}
            />
          </div>
          {isBootstrap && (
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm passphrase</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={12}
                maxLength={512}
              />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Deriving key…" : isBootstrap ? "Create vault" : "Unlock"}
          </Button>
        </form>
      </div>

      <p className="mt-6 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
        PBKDF2-SHA256 · 310,000 iterations
      </p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Unlocked vault: upload zone + file list
// -----------------------------------------------------------------------------

function UnlockedVault({ userId }: { userId: string }) {
  const { masterKey, lock } = useVault();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<Record<string, number>>({});

  const filesQuery = useQuery({
    queryKey: ["files", userId],
    queryFn: listFiles,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!masterKey) throw new Error("Vault is locked");
      const uploadId = crypto.randomUUID();
      setUploads((u) => ({ ...u, [uploadId]: 0 }));
      try {
        await uploadEncryptedFile({
          file,
          userId,
          masterKey,
          onProgress: (frac) => setUploads((u) => ({ ...u, [uploadId]: frac })),
        });
      } finally {
        setUploads((u) => {
          const next = { ...u };
          delete next[uploadId];
          return next;
        });
      }
      return file.name;
    },
    onSuccess: (name) => {
      toast.success(`Encrypted and uploaded "${name}"`);
      queryClient.invalidateQueries({ queryKey: ["files", userId] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      Array.from(list).forEach((file) => {
        if (file.size > 100 * 1024 * 1024) {
          toast.error(`"${file.name}" exceeds the 100 MB limit for this slice`);
          return;
        }
        uploadMutation.mutate(file);
      });
    },
    [uploadMutation],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your vault</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Files are encrypted in your browser before upload. The server sees
            only ciphertext.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            logActivity({ action: "vault.locked", targetType: "vault" });
            lock();
          }}
        >
          <Lock className="mr-1.5 h-3.5 w-3.5" />
          Lock vault
        </Button>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
          dragging
            ? "border-primary bg-accent"
            : "border-border bg-surface hover:border-muted-foreground/40"
        }`}
      >
        <Upload className="mx-auto h-6 w-6 text-muted-foreground" strokeWidth={2} />
        <p className="mt-3 text-sm font-medium">Drop files to encrypt & upload</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Or click to browse. Up to 100 MB per file.
        </p>
        <div className="mt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            Browse files
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {Object.entries(uploads).length > 0 && (
          <div className="mx-auto mt-6 max-w-md space-y-2">
            {Object.entries(uploads).map(([id, frac]) => (
              <div key={id} className="text-left">
                <div className="mb-1 flex items-center justify-between text-xs font-mono text-muted-foreground">
                  <span>Encrypting & uploading…</span>
                  <span>{Math.round(frac * 100)}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${frac * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* File list */}
      <FileList rows={filesQuery.data ?? []} loading={filesQuery.isLoading} />
    </div>
  );
}

function FileList({
  rows,
  loading,
}: {
  rows: EncryptedFileRow[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-12 text-center">
        <FileText className="mx-auto h-6 w-6 text-muted-foreground" strokeWidth={2} />
        <p className="mt-3 text-sm font-medium">No files yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Upload your first encrypted file above.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="hidden border-b border-border px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-muted-foreground sm:grid sm:grid-cols-[1fr_120px_140px_140px]">
        <span>Name</span>
        <span>Size</span>
        <span>Added</span>
        <span className="text-right">Actions</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <FileRow key={row.id} row={row} />
        ))}
      </ul>
    </div>
  );
}

function FileRow({ row }: { row: EncryptedFileRow }) {
  const { masterKey } = useVault();
  const queryClient = useQueryClient();
  const [meta, setMeta] = useState<DecryptedFileMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [integrity, setIntegrity] = useState<"unknown" | "verified" | "failed">(
    "unknown",
  );
  const [shareOpen, setShareOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [preview, setPreview] = useState<{
    bytes: Uint8Array;
    name: string;
    mime: string | null;
    verified: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!masterKey) return;
    decryptFileMeta(row, masterKey)
      .then((m) => {
        if (!cancelled) setMeta(m);
      })
      .catch(() => {
        if (!cancelled)
          setMeta({
            id: row.id,
            name: "⟨undecryptable⟩",
            mimeHint: row.mime_hint,
            sizeBytes: row.size_bytes,
            createdAt: row.created_at,
            sha256B64: row.sha256,
          });
      });
    return () => {
      cancelled = true;
    };
  }, [row, masterKey]);

  const sizeLabel = useMemo(() => humanBytes(row.size_bytes), [row.size_bytes]);
  const dateLabel = useMemo(
    () => new Date(row.created_at).toLocaleString(),
    [row.created_at],
  );

  async function handleDownload() {
    if (!masterKey) return;
    setBusy(true);
    try {
      const result = await downloadAndDecrypt(row, masterKey);
      setIntegrity(result.integrityVerified ? "verified" : "failed");
      if (!result.integrityVerified) {
        toast.error("Integrity check FAILED — file may be corrupted or tampered with");
        return;
      }
      const blob = new Blob([new Uint8Array(result.bytes)], {
        type: row.mime_hint || "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.meta.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded & verified "${result.meta.name}"`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview() {
    if (!masterKey) return;
    setBusy(true);
    try {
      const result = await downloadAndDecrypt(row, masterKey);
      setIntegrity(result.integrityVerified ? "verified" : "failed");
      setPreview({
        bytes: result.bytes,
        name: result.meta.name,
        mime: row.mime_hint,
        verified: result.integrityVerified,
      });
      logActivity({
        action: "file.previewed",
        targetType: "file",
        targetId: row.id,
      });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${meta?.name ?? "this file"}"? This can't be undone.`))
      return;
    setBusy(true);
    try {
      await deleteFile(row);
      toast.success("File deleted");
      queryClient.invalidateQueries({ queryKey: ["files", row.user_id] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[1fr_120px_140px_180px] sm:items-center sm:gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
          <span className="truncate text-sm font-medium">
            {meta?.name ?? "Decrypting…"}
          </span>
          {integrity === "verified" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-success">
              <ShieldCheck className="h-3 w-3" strokeWidth={2.5} />
              Verified
            </span>
          )}
          {integrity === "failed" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-destructive">
              <ShieldAlert className="h-3 w-3" strokeWidth={2.5} />
              Tampered
            </span>
          )}
        </div>
      </div>
      <div className="font-mono text-xs text-muted-foreground">{sizeLabel}</div>
      <div className="font-mono text-xs text-muted-foreground">{dateLabel}</div>
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={handlePreview} disabled={busy || !meta} aria-label="Preview">
          <Eye className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={handleDownload} disabled={busy || !meta} aria-label="Download">
          <Download className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setVersionsOpen(true)} disabled={busy || !meta} aria-label="Version history">
          <History className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShareOpen(true)} disabled={busy || !meta} aria-label="Share">
          <Share2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={handleDelete} disabled={busy} aria-label="Delete">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {shareOpen && meta && masterKey && (
        <ShareDialog
          file={row}
          filename={meta.name}
          masterKey={masterKey}
          onClose={() => setShareOpen(false)}
        />
      )}
      {versionsOpen && meta && masterKey && (
        <VersionsDialog
          file={row}
          filename={meta.name}
          masterKey={masterKey}
          onClose={() => setVersionsOpen(false)}
        />
      )}
      {preview && (
        <FilePreview
          bytes={preview.bytes}
          name={preview.name}
          mimeHint={preview.mime}
          integrityVerified={preview.verified}
          onClose={() => setPreview(null)}
        />
      )}
    </li>
  );
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
