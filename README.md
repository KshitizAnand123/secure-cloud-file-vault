# Secure Cloud File Vault

Secure Cloud File Vault is a zero-knowledge, end-to-end encrypted file storage application. Files are encrypted in the browser before upload, and the server stores only ciphertext, encrypted metadata, and access-control records.

The project demonstrates secure file upload, private cloud storage, encrypted sharing, file versioning, and activity auditing using a modern TypeScript web stack.

## Features

- Client-side file encryption with WebCrypto
- AES-256-GCM encryption for file content
- PBKDF2-SHA256 key derivation for vault passphrases
- Encrypted file names and encrypted per-file keys
- Private Supabase Storage bucket for encrypted file blobs
- Supabase Auth for user accounts
- Row Level Security policies for user-scoped database access
- Secure public sharing with token-hash verification
- Optional share password protection
- Share expiry, download limits, and revocation
- File version history and restore support
- Activity logs for user actions
- Light and dark theme support

## Tech Stack

- TanStack Start
- React 19
- TypeScript
- Vite
- Tailwind CSS
- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Cloudflare Workers

## Security Model

The application is designed around a zero-knowledge model:

- Files are encrypted in the browser before being uploaded.
- The vault passphrase never leaves the user's device.
- The server never receives plaintext files, plaintext file names, or vault keys.
- Supabase stores encrypted metadata and encrypted file blobs.
- Public share links use URL-fragment tokens so the raw token is not sent to the server.
- The server stores only the SHA-256 hash of a share token.
- Row Level Security restricts database access to each authenticated user's own records.

Important limitation: if a user loses their vault passphrase, encrypted files cannot be recovered.

## Project Structure

```text
src/
  components/
    ui/                 Reusable UI components
    vault/              Vault-specific dialogs and preview components
  hooks/                Shared React hooks
  integrations/
    supabase/           Supabase clients and generated database types
  lib/
    crypto/             Browser cryptography helpers
    vault/              File, share, version, activity, and vault services
  routes/               TanStack Start routes and API routes
  router.tsx            Router setup
  server.ts             Server entry wrapper
  start.ts              TanStack Start middleware setup
  styles.css            Global styles

supabase/
  migrations/           Database migration history
  schema.sql            Consolidated database schema
```

## Prerequisites

- Node.js 20 or newer
- npm or Bun
- Supabase project
- Cloudflare account for deployment

## Environment Variables

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Required variables:

```bash
VITE_SUPABASE_URL="https://YOUR-PROJECT-REF.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="YOUR-PUBLISHABLE-OR-ANON-KEY"
VITE_SUPABASE_PROJECT_ID="YOUR-PROJECT-REF"

SUPABASE_URL="https://YOUR-PROJECT-REF.supabase.co"
SUPABASE_PUBLISHABLE_KEY="YOUR-PUBLISHABLE-OR-ANON-KEY"
SUPABASE_PROJECT_ID="YOUR-PROJECT-REF"
SUPABASE_SERVICE_ROLE_KEY="YOUR-SERVICE-ROLE-KEY"
```

For production auth redirects, also set:

```bash
VITE_SITE_URL="https://YOUR-DOMAIN/auth/callback"
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` in client-side code. It must remain a server-side secret.

## Supabase Setup

1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. Run the full contents of `supabase/schema.sql`.
4. Create a private Storage bucket named `vault-files`.
5. Enable Email authentication.
6. Add your local and production redirect URLs in Authentication settings.

Recommended redirect URLs:

```text
http://localhost:8080/auth/callback
https://YOUR-DOMAIN/auth/callback
```

## Local Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:8080
```

## Production Build

```bash
npm run build
```

The production output is generated in `.output/`.

## Deployment

This project is configured for Cloudflare Workers.

Log in to Wrangler:

```bash
npx wrangler login
```

Build and deploy:

```bash
npm run build
npx wrangler deploy .output/server/index.mjs --config .output/server/wrangler.json
```

Set the required environment variables in the Cloudflare Worker settings. Mark `SUPABASE_SERVICE_ROLE_KEY` as a secret.

After deployment, update Supabase Authentication settings:

- Site URL: `https://YOUR-DOMAIN`
- Redirect URL: `https://YOUR-DOMAIN/auth/callback`

## Test Checklist

After deployment, verify:

- User signup and signin
- Vault passphrase setup
- File upload
- File download
- File preview
- Share link creation
- Shared file download from another browser
- Share revocation
- File version restore
- Activity log entries

## Available Scripts

```bash
npm run dev       # Start local development server
npm run build     # Create production build
npm run preview   # Preview production build locally
npm run lint      # Run ESLint
npm run format    # Format files with Prettier
```

## Notes

- The app requires a server runtime because public share downloads are handled by a server route.
- Static-only hosting is not suitable for the full application.
- The private Storage bucket must be named `vault-files`.
- The service role key should be rotated immediately if it is ever exposed.
