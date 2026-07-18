/**
 * Public share recipient page. Unauthenticated.
 *
 * The token lives in `window.location.hash` and never touches the server.
 * If the share is password-protected, we prompt for the password after the
 * lookup — the server can't verify passwords, so a wrong password fails to
 * unwrap the content key (indistinguishable from an invalid token).
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, Loader2, Download, ShieldCheck, ShieldAlert, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  downloadShare,
  lookupShare,
  parseShareFragment,
  type ShareLookupResponse,
} from "@/lib/vault/share-service";
import { FilePreview } from "@/components/vault/FilePreview";

export const Route = createFileRoute("/s/$id")({
  component: SharePage,
  head: () => ({
    meta: [
      { title: "Encrypted share · Vaultline" },
      {
        name: "description",
        content:
          "Decrypt a file shared with you via Vaultline. All decryption happens in your browser.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Stage =
  | { kind: "loading" }
  | { kind: "no-token" }
  | { kind: "error"; message: string }
  | { kind: "ready"; info: ShareLookupResponse; token: Uint8Array }
  | {
      kind: "decrypted";
      bytes: Uint8Array;
      name: string;
      mimeHint: string | null;
      integrityVerified: boolean;
    };

function SharePage() {
  const { id } = Route.useParams();
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const token = parseShareFragment();
    if (!token) {
      setStage({ kind: "no-token" });
      return;
    }
    lookupShare(id, token)
      .then((info) => setStage({ kind: "ready", info, token }))
      .catch((e) =>
        setStage({ kind: "error", message: (e as Error).message || "Unavailable" }),
      );
  }, [id]);

  async function handleDecrypt() {
    if (stage.kind !== "ready") return;
    if (stage.info.passwordProtected && !password) {
      toast.error("Password required");
      return;
    }
    setBusy(true);
    try {
      const result = await downloadShare(id, stage.token, password || undefined);
      setStage({
        kind: "decrypted",
        bytes: result.bytes,
        name: result.name,
        mimeHint: result.mimeHint,
        integrityVerified: result.integrityVerified,
      });
      setPassword("");
      if (!result.integrityVerified) {
        toast.error("Integrity check FAILED — the file may have been tampered with");
      } else {
        toast.success("Decrypted & integrity verified");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleDownload() {
    if (stage.kind !== "decrypted") return;
    const blob = new Blob([new Uint8Array(stage.bytes)], {
      type: stage.mimeHint || "application/octet-stream",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = stage.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link
            to="/"
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <Lock className="h-4 w-4 text-primary" strokeWidth={2.5} />
            <span>Vaultline</span>
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Encrypted share
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-16">
        {stage.kind === "loading" && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Verifying share…
            </p>
          </div>
        )}

        {stage.kind === "no-token" && (
          <ErrorBox
            title="Share token missing"
            body="The share link is incomplete. The secret token lives after the # in the URL and must be copied in full."
          />
        )}

        {stage.kind === "error" && (
          <ErrorBox title="Share unavailable" body={stage.message} />
        )}

        {stage.kind === "ready" && (
          <div className="rounded-xl border border-border bg-surface p-6">
            <h1 className="text-xl font-semibold tracking-tight">
              A file was shared with you
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Decryption runs in your browser — Vaultline's servers cannot read
              this file, even in transit to you.
            </p>

            <dl className="mt-5 grid grid-cols-2 gap-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              <div>
                <dt>Size</dt>
                <dd className="mt-0.5 text-foreground">
                  {stage.info.sizeBytes.toLocaleString()} bytes
                </dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd className="mt-0.5 truncate text-foreground">
                  {stage.info.mimeHint || "unknown"}
                </dd>
              </div>
              <div>
                <dt>Downloads</dt>
                <dd className="mt-0.5 text-foreground">
                  {stage.info.downloadCount}
                  {stage.info.maxDownloads !== null && `/${stage.info.maxDownloads}`}
                </dd>
              </div>
              <div>
                <dt>Expires</dt>
                <dd className="mt-0.5 text-foreground">
                  {stage.info.expiresAt
                    ? new Date(stage.info.expiresAt).toLocaleString()
                    : "never"}
                </dd>
              </div>
            </dl>

            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                handleDecrypt();
              }}
            >
              {stage.info.passwordProtected && (
                <div className="space-y-1.5">
                  <Label htmlFor="share-pw">Password</Label>
                  <Input
                    id="share-pw"
                    type="password"
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Decrypting…
                  </>
                ) : (
                  "Decrypt & preview"
                )}
              </Button>
            </form>
          </div>
        )}

        {stage.kind === "decrypted" && (
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-tight">
                {stage.name}
              </h1>
              {stage.integrityVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-success">
                  <ShieldCheck className="h-3 w-3" strokeWidth={2.5} /> Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-destructive">
                  <ShieldAlert className="h-3 w-3" strokeWidth={2.5} /> Tampered
                </span>
              )}
            </div>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {stage.mimeHint || "application/octet-stream"} ·{" "}
              {stage.bytes.length.toLocaleString()} bytes
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => setShowPreview(true)}>
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                Preview
              </Button>
              <Button variant="secondary" onClick={handleDownload}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download
              </Button>
            </div>
            {showPreview && (
              <FilePreview
                bytes={stage.bytes}
                name={stage.name}
                mimeHint={stage.mimeHint}
                integrityVerified={stage.integrityVerified}
                onClose={() => setShowPreview(false)}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function ErrorBox({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
      <h1 className="text-lg font-semibold tracking-tight text-destructive">
        {title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <Link
        to="/"
        className="mt-4 inline-flex items-center text-xs font-medium text-primary hover:underline"
      >
        ← Back to Vaultline
      </Link>
    </div>
  );
}
