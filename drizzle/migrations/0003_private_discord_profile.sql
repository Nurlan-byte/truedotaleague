-- Keep public player cards readable without exposing linked Discord identities.
-- A table-level SELECT grant overrides any narrower column grant, so remove it first.
REVOKE SELECT ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, nickname, avatar_url, created_at, updated_at, bio, mmr,
  role_position, profile_url, team_name, team_role, looking_for_team
) ON public.profiles TO anon, authenticated;

-- No caller-supplied profile ID: the authenticated JWT selects its own row.
CREATE OR REPLACE FUNCTION public.get_my_discord_identity()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'discord_id', p.discord_id,
    'discord_username', p.discord_username,
    'discord_global_name', p.discord_global_name
  )
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.get_my_discord_identity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_discord_identity() TO authenticated;
