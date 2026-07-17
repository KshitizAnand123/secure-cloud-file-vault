/**
 * Share dialog: creates a zero-knowledge share link for a single file.
 *
 * The share token is embedded in the URL fragment (#…) and never sent to
 * the server. The optional password further protects the derived share
 * key via PBKDF2 — the server cannot verify passwords, so a wrong one
 * simply fails to unwrap the content key (indistinguishable from an
 * invalid token, which is the desired property).
 */

import { useEffect, useState } from "react";
import { X, Copy, Check, Trash2, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createShare,
  listSharesForFile,
  revokeShare,
  type ShareRow,
} from "@/lib/vault/share-service";
import type { EncryptedFileRow } from "@/lib/vault/file-service";
import { logActivity } from "@/lib/vault/activity-service";

interface ShareDialogProps {
  file: EncryptedFileRow;
  filename: string;
  masterKey: CryptoKey;
  onClose: () => void;
}

const EXPIRY_OPTIONS: Array<{ label: string; hours: number | null }> = [
  { label: "1 hour", hours: 1 },
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
  { label: "No expiry", hours: null },
];

export function ShareDialog({ file, filename, masterKey, onClose }: ShareDialogProps) {
  const [password, setPassword] = useState("");
  const [expiryHours, setExpiryHours] = useState<number | null>(24);
  const [maxDownloads, setMaxDownloads] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [loadingShares, setLoadingShares] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listSharesForFile(file.id)
      .then((rows) => {
        if (!cancelled) setShares(rows);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => !cancelled && setLoadingShares(false));
    return () => {
      cancelled = true;
    };
  }, [file.id]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const maxDl = maxDownloads.trim() ? Number.parseInt(maxDownloads, 10) : null;
      if (maxDl !== null && (!Number.isFinite(maxDl) || maxDl < 1 || maxDl > 10000)) {
        toast.error("Max downloads must be between 1 and 10000");
        return;
      }
      if (password && password.length < 8) {
        toast.error("Password must be at least 8 characters");
        return;
      }
      const expiresAt =
        expiryHours === null ? null : new Date(Date.now() + expiryHours * 3600_000);
      const { url, shareId } = await createShare({
        file,
        masterKey,
        filename,
        password: password || undefined,
        expiresAt,
        maxDownloads: maxDl,
      });
      setCreatedUrl(url);
      logActivity({
        action: "share.created",
        targetType: "share",
        targetId: shareId,
        metadata: {
          file_id: file.id,
          password_protected: Boolean(password),
          expires_at: expiresAt?.toISOString() ?? null,
          max_downloads: maxDl,
        },
      });
      const rows = await listSharesForFile(file.id);
      setShares(rows);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    if (!createdUrl) return;
    await navigator.clipboard.writeText(createdUrl);
    setCopied(true);
    toast.success("Share link copied");
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this share link? It will stop working immediately.")) return;
    try {
      await revokeShare(id);
      const rows = await listSharesForFile(file.id);
      setShares(rows);
      toast.success("Share revoked");
      logActivity({
        action: "share.revoked",
        targetType: "share",
        targetId: id,
        metadata: { file_id: file.id },
      });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" strokeWidth={2.5} />
            <h2 className="text-sm font-semibold tracking-tight">Share “{filename}”</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto px-5 py-5">
          {!createdUrl ? (
            <form className="space-y-4" onSubmit={handleCreate}>
              <div className="space-y-1.5">
                <Label htmlFor="share-password">
                  Password{" "}
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    optional
                  </span>
                </Label>
                <Input
                  id="share-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Adds a second factor for the recipient"
                  autoComplete="new-password"
                  maxLength={256}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Expires in</Label>
                <div className="flex flex-wrap gap-1.5">
                  {EXPIRY_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setExpiryHours(opt.hours)}
                      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                        expiryHours === opt.hours
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="max-dl">
                  Max downloads{" "}
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    optional
                  </span>
                </Label>
                <Input
                  id="max-dl"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={maxDownloads}
                  onChange={(e) => setMaxDownloads(e.target.value.replace(/\D/g, ""))}
                  placeholder="Unlimited"
                  maxLength={5}
                />
              </div>

              <p className="rounded-md border border-border bg-background px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Zero-knowledge · Token lives only in the URL fragment
              </p>

              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Creating share…
                  </>
                ) : (
                  "Create share link"
                )}
              </Button>
            </form>
          ) : (
            <div className="space-y-3">
              <Label>Share link</Label>
              <div className="flex gap-2">
                <Input readOnly value={createdUrl} className="font-mono text-xs" />
                <Button type="button" variant="secondary" onClick={handleCopy}>
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Anyone with this link{password ? " and the password" : ""} can decrypt the file.
                The token after <code>#</code> is never sent to our servers.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCreatedUrl(null);
                  setPassword("");
                  setMaxDownloads("");
                }}
              >
                Create another
              </Button>
            </div>
          )}

          <div className="border-t border-border pt-4">
            <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Existing shares
            </h3>
            {loadingShares ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : shares.length === 0 ? (
              <p className="text-xs text-muted-foreground">No shares for this file yet.</p>
            ) : (
              <ul className="space-y-2">
                {shares.map((s) => {
                  const expired =
                    s.expires_at && new Date(s.expires_at).getTime() <= Date.now();
                  const exhausted =
                    s.max_downloads !== null && s.download_count >= s.max_downloads;
                  const status = s.revoked
                    ? "Revoked"
                    : expired
                      ? "Expired"
                      : exhausted
                        ? "Exhausted"
                        : "Active";
                  return (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono text-[10px] uppercase tracking-widest ${
                              status === "Active"
                                ? "text-success"
                                : "text-muted-foreground"
                            }`}
                          >
                            {status}
                          </span>
                          {s.password_salt && (
                            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                              · pw
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-muted-foreground">
                          {s.download_count}
                          {s.max_downloads !== null && `/${s.max_downloads}`} downloads ·{" "}
                          {s.expires_at
                            ? `expires ${new Date(s.expires_at).toLocaleString()}`
                            : "no expiry"}
                        </div>
                      </div>
                      {!s.revoked && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRevoke(s.id)}
                          aria-label="Revoke share"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
