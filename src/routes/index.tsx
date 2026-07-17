import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock, ShieldCheck, KeyRound, FileCheck2 } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Lock className="h-4 w-4 text-primary" strokeWidth={2.5} />
          <span>Vaultline</span>
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <ThemeToggle />
          <Link
            to="/auth"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Create account
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-16 pb-24 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Zero-knowledge · AES-256-GCM
          </div>
          <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Your files, encrypted before they ever leave your browser.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            Vaultline is a cloud file vault built on zero-knowledge principles.
            We store only ciphertext. Only you hold the passphrase. Not us, not
            our infrastructure provider, not anyone.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Start your vault
            </Link>
            <Link
              to="/auth"
              className="inline-flex h-11 items-center rounded-md border border-border bg-surface px-6 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Sign in
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-6 sm:grid-cols-3">
          {[
            {
              icon: KeyRound,
              title: "Passphrase-derived keys",
              body: "PBKDF2-SHA256 with 310,000 iterations. Your key is derived in-browser and never transmitted.",
            },
            {
              icon: ShieldCheck,
              title: "Per-file content keys",
              body: "Each file is encrypted with its own random 256-bit key, wrapped by your master key.",
            },
            {
              icon: FileCheck2,
              title: "SHA-256 integrity",
              body: "Fingerprints are computed client-side and verified on every download.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-lg border border-border bg-surface p-5"
            >
              <Icon className="h-4 w-4 text-primary" strokeWidth={2.5} />
              <h3 className="mt-4 text-sm font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <span>Vaultline · v0.1</span>
          <span>End-to-end encrypted</span>
        </div>
      </footer>
    </div>
  );
}
