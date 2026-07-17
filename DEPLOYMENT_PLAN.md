# Secure Cloud File Vault Deployment Plan

## 1. Project Summary

This project is a zero-knowledge encrypted file vault built with:

- TanStack Start + React 19
- Vite 8
- Tailwind CSS 4
- Supabase Auth, Postgres, Row Level Security, and private Storage
- Nitro Cloudflare Worker output

The application is not a static-only frontend. It includes a server route at `src/routes/api/public/share.$id.ts` for public share lookup/download, so deployment must support server-side runtime environment variables.

## 2. Recommended Deployment Target

Use Cloudflare Workers as the main deployment target.

Reasons:

- The current Vite/Nitro config already builds with Nitro's `cloudflare-module` preset.
- `npm run build` successfully generates `.output/server/index.mjs`.
- The app needs server-side secrets for the public share endpoint.
- Cloudflare Workers is suitable for a final-year demo because it is fast, HTTPS by default, and simple to redeploy.

Avoid static-only hosting such as plain GitHub Pages because `/api/public/share/$id` requires a server runtime.

## 3. Pre-Deployment Checklist

Before deploying, confirm these items:

- `npm install` or `bun install` has completed.
- `.env` exists locally and is not committed.
- Supabase project is created.
- Supabase SQL schema has been applied.
- Private Supabase Storage bucket `vault-files` exists.
- Supabase Auth email/password provider is enabled.
- Production URL is added to Supabase Auth URL settings.
- Cloudflare environment variables and secrets are configured.

## 4. Supabase Setup

### 4.1 Create Supabase Project

Create a project from the Supabase dashboard.

Record:

- Project URL
- Publishable or anon key
- Project ref
- Service role key

Keep the service role key private. It bypasses Row Level Security and must only be stored as a server-side secret.

### 4.2 Apply Database Schema

Open Supabase SQL Editor and run:

```sql
-- Paste the full contents of supabase/schema.sql
```

This creates:

- `user_vault`
- `files`
- `file_versions`
- `file_shares`
- `activity_logs`
- RLS policies
- storage object policies for the `vault-files` bucket

### 4.3 Create Storage Bucket

In Supabase Storage, create:

- Bucket name: `vault-files`
- Public access: disabled/private

### 4.4 Configure Auth

In Supabase Authentication:

- Enable Email provider.
- For demo convenience, decide whether email confirmation should be enabled.
- Set Site URL to the production app URL.
- Add redirect URLs:
  - `http://localhost:8080/auth/callback`
  - `https://YOUR-PRODUCTION-DOMAIN/auth/callback`

## 5. Environment Variables

Set these locally in `.env` and in Cloudflare Workers settings.

Client-visible variables:

```bash
VITE_SUPABASE_URL="https://YOUR-PROJECT-REF.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="YOUR-PUBLISHABLE-OR-ANON-KEY"
VITE_SUPABASE_PROJECT_ID="YOUR-PROJECT-REF"
VITE_SITE_URL="https://YOUR-PRODUCTION-DOMAIN/auth/callback"
```

Server-only variables:

```bash
SUPABASE_URL="https://YOUR-PROJECT-REF.supabase.co"
SUPABASE_PUBLISHABLE_KEY="YOUR-PUBLISHABLE-OR-ANON-KEY"
SUPABASE_PROJECT_ID="YOUR-PROJECT-REF"
SUPABASE_SERVICE_ROLE_KEY="YOUR-SERVICE-ROLE-KEY"
```

Important:

- Never prefix `SUPABASE_SERVICE_ROLE_KEY` with `VITE_`.
- Never commit `.env`.
- Mark `SUPABASE_SERVICE_ROLE_KEY` as a secret in Cloudflare.

## 6. Build and Deploy

### 6.1 Local Build Verification

Run:

```bash
npm run build
```

Expected result:

- Client assets generated in `.output/public`
- Worker entry generated at `.output/server/index.mjs`
- Wrangler config generated at `.output/server/wrangler.json`

### 6.2 Deploy to Cloudflare Workers

Install or use Wrangler:

```bash
npx wrangler login
npm run build
npx wrangler deploy .output/server/index.mjs
```

After deployment, copy the deployed URL and add it to:

- Supabase Auth Site URL
- Supabase Auth Redirect URLs
- Cloudflare environment variable `VITE_SITE_URL`

## 7. Post-Deployment Test Plan

Use a fresh browser profile or incognito window.

Test these flows:

1. Open the deployed URL.
2. Create a new account.
3. Sign in.
4. Create a vault passphrase.
5. Upload a small test file.
6. Download the file and verify it opens.
7. Preview a supported file type.
8. Create a share link.
9. Open the share link in another browser/incognito window.
10. Download the shared file.
11. Revoke the share and confirm the old link no longer works.
12. Upload a new version of a file and test version restore.
13. Open the activity page and confirm audit events appear.

## 8. Current Verification Status

Checked locally:

- `npm run build`: passed.
- Cloudflare Worker output generated successfully.
- Supabase schema and storage policies are present.
- Public share endpoint uses the server-only Supabase service role client.

Current issue to clean before final submission:

- `npm run lint` fails because many files use Windows CRLF line endings while Prettier expects LF. This does not block the production build, but it should be fixed before final project submission.

Suggested cleanup:

```bash
npm run format
npm run lint
npm run build
```

## 9. Final-Year Demo Preparation

Prepare these demo materials:

- A short architecture diagram:
  - Browser encryption
  - Supabase Auth
  - Supabase Postgres with RLS
  - Supabase private Storage
  - Cloudflare Worker server route
- A 3-5 minute demo script.
- Two test accounts.
- A sample PDF/image/text file for upload.
- A share link demo prepared in advance.
- A backup local build in case internet access is unstable.

Recommended explanation for evaluators:

> Files are encrypted in the browser before upload. Supabase stores only ciphertext and encrypted metadata. The vault passphrase and plaintext never leave the user's device. The server route only verifies share token hashes and streams encrypted blobs from private storage.

## 10. Risk Checklist

High-priority risks:

- Losing the vault passphrase means files cannot be recovered.
- Exposing the service role key compromises the backend.
- Static-only hosting will break public share downloads.
- Missing Supabase redirect URLs will break auth in production.
- Missing private bucket `vault-files` will break uploads/downloads.

Before the final showcase, do one complete deployment rehearsal from a clean browser session.
