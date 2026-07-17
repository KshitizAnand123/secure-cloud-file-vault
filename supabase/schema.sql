
-- =====================================================
-- USER VAULT (per-user KDF salt + passphrase verifier)
-- =====================================================
CREATE TABLE public.user_vault (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  kdf_salt BYTEA NOT NULL,
  kdf_iterations INTEGER NOT NULL DEFAULT 310000,
  verifier_ciphertext BYTEA NOT NULL,
  verifier_iv BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_vault TO authenticated;
GRANT ALL ON public.user_vault TO service_role;

ALTER TABLE public.user_vault ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own vault"
  ON public.user_vault FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- FILES (encrypted metadata + storage pointer)
-- =====================================================
CREATE TABLE public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Filename encrypted client-side; server sees only ciphertext + IV
  name_ciphertext BYTEA NOT NULL,
  name_iv BYTEA NOT NULL,

  -- Optional client-provided hint (never trusted server-side). Nullable.
  mime_hint TEXT,

  -- Ciphertext size in bytes (includes GCM tag)
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),

  -- Storage object key inside the private `vault-files` bucket
  storage_path TEXT NOT NULL UNIQUE,

  -- Per-file random content key, wrapped by the user's master key
  wrapped_key BYTEA NOT NULL,
  wrap_iv BYTEA NOT NULL,

  -- IV used to encrypt the file bytes with the content key
  content_iv BYTEA NOT NULL,

  -- SHA-256 of the *plaintext*, computed client-side, for integrity verification
  sha256 BYTEA NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX files_user_id_created_at_idx ON public.files (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.files TO authenticated;
GRANT ALL ON public.files TO service_role;

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own files"
  ON public.files FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own files"
  ON public.files FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own files"
  ON public.files FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own files"
  ON public.files FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================
-- updated_at trigger
-- =====================================================
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_user_vault_updated_at
  BEFORE UPDATE ON public.user_vault
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER set_files_updated_at
  BEFORE UPDATE ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =====================================================
-- STORAGE POLICIES: files live under {user_id}/... in the private `vault-files` bucket
-- =====================================================
CREATE POLICY "Users read own vault objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'vault-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users upload own vault objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'vault-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users update own vault objects"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'vault-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own vault objects"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'vault-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

ALTER TABLE public.user_vault
  ALTER COLUMN kdf_salt TYPE TEXT USING encode(kdf_salt, 'base64'),
  ALTER COLUMN verifier_ciphertext TYPE TEXT USING encode(verifier_ciphertext, 'base64'),
  ALTER COLUMN verifier_iv TYPE TEXT USING encode(verifier_iv, 'base64');

ALTER TABLE public.files
  ALTER COLUMN name_ciphertext TYPE TEXT USING encode(name_ciphertext, 'base64'),
  ALTER COLUMN name_iv TYPE TEXT USING encode(name_iv, 'base64'),
  ALTER COLUMN wrapped_key TYPE TEXT USING encode(wrapped_key, 'base64'),
  ALTER COLUMN wrap_iv TYPE TEXT USING encode(wrap_iv, 'base64'),
  ALTER COLUMN content_iv TYPE TEXT USING encode(content_iv, 'base64'),
  ALTER COLUMN sha256 TYPE TEXT USING encode(sha256, 'base64');

CREATE TABLE public.file_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  wrapped_share_key text NOT NULL,
  wrap_iv text NOT NULL,
  name_ciphertext text NOT NULL,
  name_iv text NOT NULL,
  mime_hint text,
  sha256 text NOT NULL,
  size_bytes bigint NOT NULL,
  storage_path text NOT NULL,
  content_iv text NOT NULL,
  password_salt text,
  password_iterations integer,
  expires_at timestamptz,
  max_downloads integer,
  download_count integer NOT NULL DEFAULT 0,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_shares TO authenticated;
GRANT ALL ON public.file_shares TO service_role;

ALTER TABLE public.file_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read own shares"   ON public.file_shares FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners insert own shares" ON public.file_shares FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update own shares" ON public.file_shares FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete own shares" ON public.file_shares FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE INDEX file_shares_owner_idx ON public.file_shares(owner_id);
CREATE INDEX file_shares_file_idx  ON public.file_shares(file_id);

CREATE TRIGGER file_shares_set_updated_at
BEFORE UPDATE ON public.file_shares
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
-- =========================================================================
-- File versions: full history of encrypted content, one row per version.
-- =========================================================================
CREATE TABLE public.file_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  version_number INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  wrapped_key TEXT NOT NULL,
  wrap_iv TEXT NOT NULL,
  content_iv TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  name_ciphertext TEXT NOT NULL,
  name_iv TEXT NOT NULL,
  mime_hint TEXT,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (file_id, version_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_versions TO authenticated;
GRANT ALL ON public.file_versions TO service_role;

ALTER TABLE public.file_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own file versions" ON public.file_versions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own file versions" ON public.file_versions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own file versions" ON public.file_versions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX file_versions_file_id_idx ON public.file_versions(file_id, version_number DESC);

-- =========================================================================
-- Activity logs: append-only audit trail per user.
-- =========================================================================
CREATE TABLE public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  target_label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Append-only from the user's perspective: read own + insert own, no update/delete.
CREATE POLICY "Users read own activity" ON public.activity_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own activity" ON public.activity_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX activity_logs_user_created_idx ON public.activity_logs(user_id, created_at DESC);
