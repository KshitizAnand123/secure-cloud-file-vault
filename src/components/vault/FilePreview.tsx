/**
 * In-browser preview for decrypted file bytes.
 *
 * The decrypted plaintext is wrapped in a Blob and rendered via an object URL
 * that is revoked on unmount — the bytes never leave memory as a downloadable
 * file unless the user explicitly clicks "Download".
 *
 * Supported previews (matched by mime hint):
 *   - image/*           → <img>
 *   - application/pdf   → <iframe>
 *   - text/*, application/json, application/xml → <pre> (first 200 KB)
 * Everything else falls back to a "Download to view" affordance.
 */

import { useEffect, useMemo, useState } from "react";
import { X, Download, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface FilePreviewProps {
  bytes: Uint8Array;
  name: string;
  mimeHint: string | null;
  integrityVerified?: boolean;
  onClose: () => void;
}

const TEXT_LIMIT = 200 * 1024;

function isTexty(mime: string | null): boolean {
  if (!mime) return false;
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/javascript" ||
    mime === "application/x-yaml"
  );
}

export function FilePreview({
  bytes,
  name,
  mimeHint,
  integrityVerified,
  onClose,
}: FilePreviewProps) {
  const mime = mimeHint || "application/octet-stream";

  const blobUrl = useMemo(() => {
    const blob = new Blob([new Uint8Array(bytes)], { type: mime });
    return URL.createObjectURL(blob);
  }, [bytes, mime]);

  useEffect(() => {
    return () => URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  const [textSnippet, setTextSnippet] = useState<string | null>(null);
  useEffect(() => {
    if (!isTexty(mime)) return;
    const slice = bytes.subarray(0, TEXT_LIMIT);
    try {
      const decoder = new TextDecoder("utf-8", { fatal: false });
      setTextSnippet(decoder.decode(slice));
    } catch {
      setTextSnippet("⟨binary — cannot render as text⟩");
    }
  }, [bytes, mime]);

  function handleDownload() {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf";
  const isText = isTexty(mime);
  const truncated = isText && bytes.length > TEXT_LIMIT;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${name}`}
    >
      <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-surface">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{name}</span>
              {integrityVerified === true && (
                <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-success">
                  <ShieldCheck className="h-3 w-3" strokeWidth={2.5} /> Verified
                </span>
              )}
              {integrityVerified === false && (
                <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-destructive">
                  <ShieldAlert className="h-3 w-3" strokeWidth={2.5} /> Tampered
                </span>
              )}
            </div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {mime} · {bytes.length.toLocaleString()} bytes
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleDownload}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-auto bg-background">
          {isImage && (
            <div className="flex h-full items-center justify-center p-4">
              <img
                src={blobUrl}
                alt={name}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}
          {isPdf && (
            <iframe
              src={blobUrl}
              title={name}
              className="h-full w-full"
              sandbox=""
            />
          )}
          {isText && (
            <div className="p-4">
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
                {textSnippet ?? "Decoding…"}
              </pre>
              {truncated && (
                <p className="mt-4 rounded border border-border bg-surface px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Showing first {(TEXT_LIMIT / 1024).toFixed(0)} KB — download for the full file.
                </p>
              )}
            </div>
          )}
          {!isImage && !isPdf && !isText && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                In-browser preview isn't available for <code>{mime}</code>.
              </p>
              <Button onClick={handleDownload}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download to view
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
