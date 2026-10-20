BEGIN TRANSACTION READ ONLY;
-- Use an authorized role with complete read access; record policies to detect filtered results.
SELECT now() observed_at,current_user database_role;
SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user;
WITH owners AS (SELECT owner_id FROM public.teams GROUP BY owner_id HAVING count(*)>1),
 membership AS (SELECT id team_id,owner_id user_id FROM public.teams UNION SELECT team_id,profile_id FROM public.team_members WHERE profile_id IS NOT NULL UNION SELECT team_id,user_id FROM public.team_captains),
 conflicts AS (SELECT user_id FROM membership GROUP BY user_id HAVING count(*)>1)
SELECT (SELECT count(*) FROM owners) users_with_multiple_owned_teams,
 (SELECT count(*) FROM conflicts) users_with_cross_team_membership,
 (SELECT count(*) FROM public.team_members WHERE profile_id IS NULL) unlinked_text_members;
-- Read only. Run with an approved read-only production connection, never infer identities by nickname.
SELECT now() AS observed_at, current_user AS database_role;
SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('teams','team_members','profiles','tournaments')
AND column_name IN ('owner_id','profile_id','user_id','verified','verified_mmr','status') ORDER BY 1,2;

SELECT t.owner_id,p.nickname,count(*) AS team_count,
  jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) ORDER BY t.id) AS teams
FROM public.teams t LEFT JOIN public.profiles p ON p.id=t.owner_id
GROUP BY t.owner_id,p.nickname HAVING count(*)>1 ORDER BY t.owner_id;

SELECT m.id,m.team_id,t.name AS team_name,m.nickname,m.profile_id
FROM public.team_members m LEFT JOIN public.teams t ON t.id=m.team_id
WHERE m.profile_id IS NULL ORDER BY m.team_id,m.id;

SELECT m.id,m.team_id,t.name AS team_name,m.nickname,m.profile_id
FROM public.team_members m LEFT JOIN public.teams t ON t.id=m.team_id
LEFT JOIN public.profiles p ON p.id=m.profile_id
WHERE m.profile_id IS NOT NULL AND p.id IS NULL ORDER BY m.team_id,m.id;

-- Include future automatic owners and legacy captains in conflict/capacity checks.
WITH memberships AS (
  SELECT team_id,profile_id AS user_id FROM public.team_members WHERE profile_id IS NOT NULL
  UNION SELECT id,owner_id FROM public.teams
  UNION SELECT team_id,user_id FROM public.team_captains
)
SELECT user_id,array_agg(team_id ORDER BY team_id) AS team_ids FROM memberships
GROUP BY user_id HAVING count(*)>1;

WITH memberships AS (
  SELECT team_id,profile_id AS user_id FROM public.team_members WHERE profile_id IS NOT NULL
  UNION SELECT id,owner_id FROM public.teams
  UNION SELECT team_id,user_id FROM public.team_captains
)
SELECT team_id,count(*) AS members_after_owner_captain_backfill FROM memberships
GROUP BY team_id HAVING count(*)>7;

-- RLS may limit all preceding results: record effective policies/grants separately.
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('teams','team_members','team_captains','profiles');
SELECT * FROM pg_policies WHERE schemaname='public' AND tablename IN ('teams','team_members','team_captains','profiles');
-- Duplicate rows within one team also require manual review before UNIQUE(profile_id).
SELECT profile_id,array_agg(id ORDER BY id) member_ids FROM public.team_members WHERE profile_id IS NOT NULL GROUP BY profile_id HAVING count(*)>1;
ROLLBACK;
