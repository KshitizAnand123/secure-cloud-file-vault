
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
