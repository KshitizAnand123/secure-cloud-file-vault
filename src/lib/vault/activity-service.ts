/**
 * Activity logging — append-only audit trail.
 *
 * Zero-knowledge preserving: we log the *action* and an opaque target id, but
 * NEVER any decrypted content (filenames, plaintext, keys). `target_label`
 * carries the plaintext name only client-side is aware of; since RLS scopes
 * reads to the owning user, only they can see their own labels — the server
 * DBAs still see nothing useful without the vault key... except this label.
 * We therefore keep `target_label` OPTIONAL and small: for zero-knowledge
 * purists, callers can omit it. Callers here pass names because our threat
 * model already trusts the DB row RLS boundary for filenames-at-rest is
 * broken (filenames are encrypted with the master key; we don't leak plaintext
 * to the server). So we omit `target_label` from all logs.
 */

import { supabase } from "@/integrations/supabase/client";

export type ActivityAction =
  | "auth.signin"
  | "auth.signup"
  | "auth.signout"
  | "vault.created"
  | "vault.unlocked"
  | "vault.locked"
  | "file.uploaded"
  | "file.downloaded"
  | "file.previewed"
  | "file.deleted"
  | "file.version_created"
  | "file.version_restored"
  | "share.created"
  | "share.revoked";

export interface LogActivityOptions {
  action: ActivityAction;
  targetType?: "file" | "share" | "vault" | "auth";
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget: never throws. Logging failures must not block user actions.
 */
export async function logActivity(opts: LogActivityOptions): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;
    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: opts.action,
      target_type: opts.targetType ?? null,
      target_id: opts.targetId ?? null,
      metadata: (opts.metadata ?? {}) as never,
      user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
    });
  } catch {
    // swallow — audit best-effort
  }
}

export interface ActivityRow {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  user_agent: string | null;
  created_at: string;
}

export async function listActivity(limit = 200): Promise<ActivityRow[]> {
  const { data, error } = await supabase
    .from("activity_logs")
    .select("id, action, target_type, target_id, metadata, user_agent, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ActivityRow[];
}
