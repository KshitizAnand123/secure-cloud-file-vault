
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
