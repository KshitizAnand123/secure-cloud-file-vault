import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Clock,
  Download,
  History,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  aesGcmDecrypt,
  base64ToBytes,
  constantTimeEqual,
  sha256,
  unwrapContentKey,
} from "@/lib/crypto";
import { supabase } from "@/integrations/supabase/client";
import type { EncryptedFileRow } from "@/lib/vault/file-service";
import {
  listVersions,
  restoreVersion,
  uploadNewVersion,
  type FileVersionRow,
} from "@/lib/vault/version-service";
import { logActivity } from "@/lib/vault/activity-service";

interface Props {
  file: EncryptedFileRow;
  filename: string;
  masterKey: CryptoKey;
  onClose: () => void;
}

const BUCKET = "vault-files";

export function VersionsDialog({ file, filename, masterKey, onClose }: Props) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const versionsQuery = useQuery({
    queryKey: ["file-versions", file.id],
    queryFn: () => listVersions(file.id),
  });

  const uploadMutation = useMutation({
    mutationFn: (blob: File) =>
      uploadNewVersion({
        file,
        newBlob: blob,
        masterKey,
        onProgress: setProgress,
      }),
    onSuccess: async ({ version }) => {
      toast.success(`Saved as version ${version.version_number}`);
      await logActivity({
        action: "file.version_created",
        targetType: "file",
        targetId: file.id,
        metadata: { version: version.version_number },
      });
      queryClient.invalidateQueries({ queryKey: ["file-versions", file.id] });
      queryClient.invalidateQueries({ queryKey: ["files", file.user_id] });
    },
    onError: (err) => toast.error((err as Error).message),
    onSettled: () => setProgress(null),
  });

  const restoreMutation = useMutation({
    mutationFn: (v: FileVersionRow) => restoreVersion(file, v),
    onSuccess: async (_updated, v) => {
      toast.success(`Restored version ${v.version_number}`);
      await logActivity({
        action: "file.version_restored",
        targetType: "file",
        targetId: file.id,
        metadata: { restored_from: v.version_number },
      });
      queryClient.invalidateQueries({ queryKey: ["file-versions", file.id] });
      queryClient.invalidateQueries({ queryKey: ["files", file.user_id] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleDownloadVersion(v: FileVersionRow) {
    setBusyId(v.id);
    try {
      const contentKey = await unwrapContentKey(
        base64ToBytes(v.wrapped_key),
        base64ToBytes(v.wrap_iv),
        masterKey,
      );
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .download(v.storage_path);
      if (error) throw error;
      const ct = new Uint8Array(await data.arrayBuffer());
      const pt = await aesGcmDecrypt(contentKey, ct, base64ToBytes(v.content_iv));
      const actual = await sha256(pt);
      if (!constantTimeEqual(actual, base64ToBytes(v.sha256))) {
        toast.error("Integrity check failed for this version");
        return;
      }
      const blob = new Blob([new Uint8Array(pt)], {
        type: v.mime_hint || "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename} (v${v.version_number})`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const rows = versionsQuery.data ?? [];
  const currentSha = file.sha256;
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => b.version_number - a.version_number),
    [rows],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" strokeWidth={2.5} />
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                Version history
              </h2>
              <p className="text-xs text-muted-foreground">{filename}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="border-b border-border bg-surface px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Upload a new version</p>
              <p className="text-xs text-muted-foreground">
                Encrypts locally and adds it to this file's history.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploadMutation.isPending}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {uploadMutation.isPending ? "Uploading…" : "Choose file"}
            </Button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (f.size > 100 * 1024 * 1024) {
                  toast.error("File exceeds the 100 MB limit");
                  return;
                }
                uploadMutation.mutate(f);
              }}
            />
          </div>
          {progress !== null && (
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {versionsQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sortedRows.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              No version history yet.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {sortedRows.map((v) => {
                const isCurrent = v.sha256 === currentSha;
                return (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                          v{v.version_number}
                        </span>
                        {isCurrent && (
                          <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{new Date(v.created_at).toLocaleString()}</span>
                        <span>·</span>
                        <span>{humanBytes(v.size_bytes)}</span>
                      </div>
                      {v.note && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {v.note}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownloadVersion(v)}
                        disabled={busyId === v.id}
                        aria-label="Download this version"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (isCurrent) return;
                          if (
                            confirm(
                              `Restore version ${v.version_number}? The current bytes will remain in history.`,
                            )
                          ) {
                            restoreMutation.mutate(v);
                          }
                        }}
                        disabled={isCurrent || restoreMutation.isPending}
                        aria-label="Restore this version"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
