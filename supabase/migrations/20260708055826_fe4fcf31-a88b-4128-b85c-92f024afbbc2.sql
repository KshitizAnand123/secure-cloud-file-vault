
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
