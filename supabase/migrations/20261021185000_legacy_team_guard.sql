-- Additive protection for the deployed legacy schema. No existing roster,
-- owner, captain, profile or tournament row is changed or removed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.teams, public.team_members, public.team_captains IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.team_membership_guard (
  user_id uuid PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1
);
ALTER TABLE public.team_membership_guard ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_membership_guard FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.guard_legacy_team_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  old_user uuid;
  new_user uuid;
  old_team uuid;
  new_team uuid;
  old_row uuid;
  lock_user uuid;
BEGIN
  IF TG_TABLE_NAME='teams' THEN
    IF TG_OP<>'INSERT' THEN old_user:=OLD.owner_id; old_team:=OLD.id; old_row:=OLD.id; END IF;
    IF TG_OP<>'DELETE' THEN new_user:=NEW.owner_id; new_team:=NEW.id; END IF;
  ELSIF TG_TABLE_NAME='team_members' THEN
    IF TG_OP<>'INSERT' THEN old_user:=OLD.profile_id; old_team:=OLD.team_id; old_row:=OLD.id; END IF;
    IF TG_OP<>'DELETE' THEN new_user:=NEW.profile_id; new_team:=NEW.team_id; END IF;
  ELSIF TG_TABLE_NAME='team_captains' THEN
    IF TG_OP<>'INSERT' THEN old_user:=OLD.user_id; old_team:=OLD.team_id; END IF;
    IF TG_OP<>'DELETE' THEN new_user:=NEW.user_id; new_team:=NEW.team_id; END IF;
  ELSE RAISE EXCEPTION 'unexpected_membership_table'; END IF;

  -- In particular, legacy duplicate identities can still change names/logos
  -- or free-text roster attributes without attempting to repair their data.
  IF TG_OP='UPDATE' AND old_user IS NOT DISTINCT FROM new_user
      AND old_team IS NOT DISTINCT FROM new_team THEN RETURN NEW; END IF;

  -- A real row UPDATE (not merely an advisory lock) is essential here.
  -- READ COMMITTED obtains a fresh SPI snapshot for the following check.
  -- REPEATABLE READ/SERIALIZABLE must abort a stale competing snapshot with
  -- SQLSTATE 40001 when this UPSERT encounters the concurrently changed row.
  -- Ordered old/new keys also serialize moves and removals with new joins.
  FOR lock_user IN SELECT DISTINCT u FROM unnest(ARRAY[old_user,new_user]) u
                   WHERE u IS NOT NULL ORDER BY u LOOP
    INSERT INTO public.team_membership_guard(user_id,revision) VALUES(lock_user,1)
    ON CONFLICT(user_id) DO UPDATE SET revision=team_membership_guard.revision+1;
  END LOOP;

  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  -- Unlinked legacy text rows have no account identity. Binding one to a
  -- real profile later follows the same guard as a new registered member.
  IF new_user IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.teams t WHERE t.owner_id=new_user AND t.id<>new_team
      AND (TG_TABLE_NAME<>'teams' OR old_row IS NULL OR t.id<>old_row)
  ) OR EXISTS (
    SELECT 1 FROM public.team_members m WHERE m.profile_id=new_user AND m.team_id<>new_team
      AND (TG_TABLE_NAME<>'team_members' OR old_row IS NULL OR m.id<>old_row)
  ) OR EXISTS (
    SELECT 1 FROM public.team_captains c WHERE c.user_id=new_user AND c.team_id<>new_team
      AND (TG_TABLE_NAME<>'team_captains' OR old_user IS NULL
           OR c.user_id<>old_user OR c.team_id<>old_team)
  ) THEN RAISE EXCEPTION 'already_in_team'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_legacy_team_membership() FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER legacy_teams_membership_guard BEFORE INSERT OR UPDATE OR DELETE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_team_membership();
CREATE TRIGGER legacy_members_membership_guard BEFORE INSERT OR UPDATE OR DELETE ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_team_membership();
CREATE TRIGGER legacy_captains_membership_guard BEFORE INSERT OR UPDATE OR DELETE ON public.team_captains
FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_team_membership();
COMMIT;
