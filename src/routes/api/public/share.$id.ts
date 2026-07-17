/**
 * Public share endpoint. Zero-knowledge boundary.
 *
 * The server sees only `token_hash` (SHA-256 of the recipient's share token)
 * and can therefore:
 *   - decide whether a share exists, is not revoked, not expired, and has
 *     remaining downloads,
 *   - stream the (still-encrypted) file bytes and the wrapped share key,
 *   - atomically increment `download_count` at download time.
 *
 * It CANNOT decrypt anything: the share key is derived in the recipient's
 * browser from the token (+ optional password), never sent to the server.
 *
 * POST /api/public/share/:id?op=lookup   { tokenHash } → metadata
 * POST /api/public/share/:id?op=download { tokenHash } → metadata + ciphertext
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.object({
  tokenHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/, "Invalid token hash"),
});

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

function unavailable(): Response {
  // Generic message — do NOT leak whether the id or the token was wrong.
  return new Response("Share not found or no longer available", { status: 404 });
}

export const Route = createFileRoute("/api/public/share/$id")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const shareId = params.id;
        if (!ID_RE.test(shareId)) return unavailable();

        const url = new URL(request.url);
        const op = url.searchParams.get("op");
        if (op !== "lookup" && op !== "download") {
          return new Response("Bad request", { status: 400 });
        }

        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Look up by (id, token_hash) — matches only if the recipient
        // presented the correct token AND the row is still valid.
        const { data: share, error } = await supabaseAdmin
          .from("file_shares")
          .select("*")
          .eq("id", shareId)
          .eq("token_hash", body.tokenHash)
          .maybeSingle();

        if (error || !share) return unavailable();
        if (share.revoked) return unavailable();
        if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) {
          return unavailable();
        }
        if (
          share.max_downloads !== null &&
          share.download_count >= share.max_downloads
        ) {
          return unavailable();
        }

        if (op === "lookup") {
          return json({
            id: share.id,
            passwordProtected: share.password_salt !== null,
            passwordSalt: share.password_salt,
            passwordIterations: share.password_iterations,
            mimeHint: share.mime_hint,
            sizeBytes: share.size_bytes,
            expiresAt: share.expires_at,
            maxDownloads: share.max_downloads,
            downloadCount: share.download_count,
            createdAt: share.created_at,
          });
        }

        // op === 'download'. Atomically consume one download slot.
        // The WHERE clause guards against races with concurrent downloads
        // and against another turn revoking / expiring the share.
        const nowIso = new Date().toISOString();
        const consumeQ = supabaseAdmin
          .from("file_shares")
          .update({ download_count: share.download_count + 1 })
          .eq("id", shareId)
          .eq("token_hash", body.tokenHash)
          .eq("download_count", share.download_count)
          .eq("revoked", false);
        // Only apply the max_downloads / expires_at filters when they're set,
        // so NULL columns don't spuriously fail the row match.
        let consume = consumeQ;
        if (share.max_downloads !== null) {
          consume = consume.lt("download_count", share.max_downloads);
        }
        if (share.expires_at) {
          consume = consume.gt("expires_at", nowIso);
        }
        const { data: consumed, error: consumeErr } = await consume
          .select("id")
          .maybeSingle();
        if (consumeErr || !consumed) return unavailable();

        // Fetch encrypted bytes from private storage using the service role.
        const { data: blob, error: dlErr } = await supabaseAdmin.storage
          .from("vault-files")
          .download(share.storage_path);
        if (dlErr || !blob) {
          // Roll the counter back on best-effort basis.
          await supabaseAdmin
            .from("file_shares")
            .update({ download_count: share.download_count })
            .eq("id", shareId);
          return new Response("Storage error", { status: 502 });
        }

        const buf = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < buf.length; i += CHUNK) {
          binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
        }
        const ciphertextB64 = btoa(binary);

        return json({
          ciphertextB64,
          wrappedShareKey: share.wrapped_share_key,
          wrapIv: share.wrap_iv,
          nameCiphertext: share.name_ciphertext,
          nameIv: share.name_iv,
          contentIv: share.content_iv,
          sha256: share.sha256,
          mimeHint: share.mime_hint,
          sizeBytes: share.size_bytes,
          passwordSalt: share.password_salt,
          passwordIterations: share.password_iterations,
        });
      },
    },
  },
});
