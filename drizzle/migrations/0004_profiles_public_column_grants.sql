GRANT SELECT (id, nickname, avatar_url, bio, mmr, role_position, profile_url, team_name, team_role, looking_for_team, competitive_rating, created_at, updated_at) ON public.profiles TO anon, authenticated;
GRANT ALL ON public.profiles TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.applications FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.audit_log FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.publish_draft_result(integer, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_draft_result(integer, jsonb) TO authenticated;