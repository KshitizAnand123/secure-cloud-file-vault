import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Download,
  Eye,
  FileUp,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  RotateCcw,
  Share2,
  ShieldOff,
  Trash2,
  Unlock,
  UserPlus,
} from "lucide-react";
import { listActivity, type ActivityRow } from "@/lib/vault/activity-service";

export const Route = createFileRoute("/_authenticated/activity")({
  component: ActivityPage,
});

const LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  "auth.signin": { label: "Signed in", icon: LogIn },
  "auth.signup": { label: "Created account", icon: UserPlus },
  "auth.signout": { label: "Signed out", icon: LogOut },
  "vault.created": { label: "Vault created", icon: KeyRound },
  "vault.unlocked": { label: "Vault unlocked", icon: Unlock },
  "vault.locked": { label: "Vault locked", icon: Lock },
  "file.uploaded": { label: "Uploaded file", icon: FileUp },
  "file.downloaded": { label: "Downloaded file", icon: Download },
  "file.previewed": { label: "Previewed file", icon: Eye },
  "file.deleted": { label: "Deleted file", icon: Trash2 },
  "file.version_created": { label: "New version uploaded", icon: FileUp },
  "file.version_restored": { label: "Restored version", icon: RotateCcw },
  "share.created": { label: "Created share link", icon: Share2 },
  "share.revoked": { label: "Revoked share link", icon: ShieldOff },
};

function ActivityPage() {
  const { user } = Route.useRouteContext();
  const query = useQuery({
    queryKey: ["activity", user.id],
    queryFn: () => listActivity(300),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link
            to="/vault"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to vault
          </Link>
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <Activity className="h-4 w-4 text-primary" strokeWidth={2.5} />
            <span>Activity log</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Append-only audit trail of actions on your account. Only you can
            read this — we never see decrypted content.
          </p>
        </div>

        <div className="mt-8 overflow-hidden rounded-xl border border-border bg-surface">
          {query.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : query.error ? (
            <p className="p-6 text-sm text-destructive">
              Failed to load activity: {(query.error as Error).message}
            </p>
          ) : (query.data ?? []).length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              No activity yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {(query.data ?? []).map((row) => (
                <ActivityItem key={row.id} row={row} />
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

function ActivityItem({ row }: { row: ActivityRow }) {
  const info = LABELS[row.action] ?? { label: row.action, icon: Activity };
  const Icon = info.icon;
  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{info.label}</span>
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {row.action}
          </span>
        </div>
        <div className="mt-0.5 font-mono text-xs text-muted-foreground">
          {new Date(row.created_at).toLocaleString()}
          {row.target_id && (
            <>
              <span className="mx-1.5">·</span>
              <span title={row.target_id}>{row.target_id.slice(0, 8)}</span>
            </>
          )}
        </div>
        {row.metadata && Object.keys(row.metadata).length > 0 && (
          <pre className="mt-1.5 overflow-x-auto rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground">
            {JSON.stringify(row.metadata)}
          </pre>
        )}
      </div>
    </li>
  );
}
