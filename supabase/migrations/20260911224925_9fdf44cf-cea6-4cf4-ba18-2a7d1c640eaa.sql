ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS discord_id text,
  ADD COLUMN IF NOT EXISTS discord_username text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS discord_global_name text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_discord_id_key ON public.profiles (discord_id) WHERE discord_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nickname, avatar_url, discord_id, discord_username, discord_global_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'nickname', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'global_name', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'preferred_username', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'user_name', ''),
      split_part(COALESCE(NEW.email, 'player'), '@', 1)
    ),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'avatar_url', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'picture', '')
    ),
    NULLIF(NEW.raw_user_meta_data ->> 'discord_id', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'discord_username', ''), ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'discord_global_name', ''), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;