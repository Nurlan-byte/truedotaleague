ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS team_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS team_role text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS looking_for_team boolean NOT NULL DEFAULT false;