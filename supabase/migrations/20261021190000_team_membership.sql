-- Requires the existing league schema (drizzle 0000/0001). Never auto-repair live data.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.teams, public.team_members, public.team_captains IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.teams GROUP BY owner_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'migration_duplicate_owners'; END IF;
  IF EXISTS (SELECT 1 FROM public.teams GROUP BY lower(btrim(tag)) HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM public.teams WHERE btrim(tag) = '') THEN
    RAISE EXCEPTION 'migration_conflicting_tags'; END IF;
  IF EXISTS (SELECT 1 FROM public.team_members m LEFT JOIN public.profiles p ON p.id=m.profile_id WHERE p.id IS NULL) THEN
    RAISE EXCEPTION 'migration_unlinked_members'; END IF;
  IF EXISTS (SELECT 1 FROM public.team_members GROUP BY profile_id HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM public.team_members m JOIN public.teams t ON t.owner_id=m.profile_id WHERE t.id<>m.team_id) THEN
    RAISE EXCEPTION 'migration_conflicting_membership'; END IF;
  IF EXISTS (SELECT 1 FROM public.teams t LEFT JOIN public.profiles p ON p.id=t.owner_id WHERE p.id IS NULL) THEN
    RAISE EXCEPTION 'migration_owner_profile_missing'; END IF;
  -- Removing these columns/table would destroy legacy data. Resolve its disposition
  -- in a separately approved migration; do not disable this release gate.
  IF EXISTS (SELECT 1 FROM public.team_captains) OR EXISTS (
    SELECT 1 FROM public.team_members WHERE nickname<>'' OR role<>'' OR mmr IS NOT NULL
  ) THEN RAISE EXCEPTION 'migration_legacy_data_requires_approval'; END IF;
  IF EXISTS (SELECT 1 FROM public.team_members WHERE position NOT BETWEEN 0 AND 6)
     OR EXISTS (SELECT 1 FROM public.team_members GROUP BY team_id,position HAVING count(*)>1)
     OR EXISTS (SELECT 1 FROM public.team_members m JOIN public.teams t ON t.id=m.team_id
                WHERE (m.profile_id=t.owner_id) IS DISTINCT FROM (m.position=0)) THEN
    RAISE EXCEPTION 'migration_roster_positions_require_review'; END IF;
END $$;

-- Superseded only after the full migration's data-preservation gate succeeds.
-- These objects contain coordination revisions, never roster/profile data.
DROP TRIGGER IF EXISTS legacy_teams_membership_guard ON public.teams;
DROP TRIGGER IF EXISTS legacy_members_membership_guard ON public.team_members;
DROP TRIGGER IF EXISTS legacy_captains_membership_guard ON public.team_captains;
DROP FUNCTION IF EXISTS public.guard_legacy_team_membership();
DROP TABLE IF EXISTS public.team_membership_guard;

CREATE FUNCTION public.is_team_owner(_uid uuid, _team_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT _uid IS NOT NULL AND EXISTS(SELECT 1 FROM public.teams WHERE id=_team_id AND owner_id=_uid)
$$;
DROP POLICY "teams owner insert" ON public.teams;
DROP POLICY "teams captain update" ON public.teams;
DROP POLICY "teams owner delete" ON public.teams;
DROP POLICY "members captain write" ON public.team_members;
DROP POLICY "applications own or staff read" ON public.applications;
CREATE POLICY "applications owner or staff read" ON public.applications FOR SELECT TO authenticated
  USING (public.is_team_owner(auth.uid(),team_id) OR public.is_staff_for(auth.uid(),tournament_id));
DROP TABLE public.team_captains;

ALTER TABLE public.teams ADD CONSTRAINT teams_single_owner UNIQUE(owner_id);
ALTER TABLE public.teams ADD CONSTRAINT teams_valid_tag CHECK(length(btrim(tag)) BETWEEN 1 AND 8);
CREATE UNIQUE INDEX teams_unique_tag ON public.teams(lower(btrim(tag)));
ALTER TABLE public.team_members ALTER COLUMN profile_id SET NOT NULL;
ALTER TABLE public.team_members DROP CONSTRAINT team_members_profile_id_fkey;
ALTER TABLE public.team_members ADD CONSTRAINT team_members_profile_id_fkey
  FOREIGN KEY(profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.team_members ADD CONSTRAINT team_members_single_team UNIQUE(profile_id);
ALTER TABLE public.team_members ADD CONSTRAINT team_members_identity UNIQUE(team_id,profile_id);
ALTER TABLE public.team_members ADD CONSTRAINT team_members_position_range CHECK(position BETWEEN 0 AND 6);
ALTER TABLE public.team_members ADD CONSTRAINT team_members_position_unique UNIQUE(team_id,position);
ALTER TABLE public.team_members DROP COLUMN nickname, DROP COLUMN role, DROP COLUMN mmr;
INSERT INTO public.team_members(team_id,profile_id,position)
  SELECT id,owner_id,0 FROM public.teams t
  WHERE NOT EXISTS (SELECT 1 FROM public.team_members m WHERE m.team_id=t.id AND m.profile_id=t.owner_id);
-- The deferred FK plus UNIQUE(profile_id) enforces cross-table exclusivity even
-- for concurrent INSERTs, not only for the RPC's read-then-write checks.
ALTER TABLE public.teams ADD CONSTRAINT teams_owner_membership
  FOREIGN KEY(id,owner_id) REFERENCES public.team_members(team_id,profile_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION public.team_owner_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN RAISE EXCEPTION 'owner_transfer_disabled'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER team_owner_immutable BEFORE UPDATE OF owner_id ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.team_owner_immutable();
CREATE FUNCTION public.team_add_owner() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.team_members(team_id,profile_id,position) VALUES(NEW.id,NEW.owner_id,0);
  RETURN NEW;
END $$;
CREATE TRIGGER team_add_owner AFTER INSERT ON public.teams FOR EACH ROW EXECUTE FUNCTION public.team_add_owner();
CREATE FUNCTION public.team_member_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.profile_id IS DISTINCT FROM OLD.profile_id) THEN
    RAISE EXCEPTION 'membership_identity_immutable'; END IF;
  IF EXISTS(SELECT 1 FROM public.teams WHERE id=NEW.team_id AND owner_id=NEW.profile_id) <> (NEW.position=0) THEN
    RAISE EXCEPTION 'owner_first_member'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER team_member_identity_guard BEFORE INSERT OR UPDATE ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.team_member_identity_guard();

CREATE VIEW public.team_roster WITH (security_invoker=true) AS
  SELECT m.id,m.team_id,m.profile_id,m.position,m.created_at,m.updated_at,p.nickname,p.mmr,
         t.owner_id=m.profile_id AS is_captain,
         CASE WHEN m.position<5 THEN 'main' ELSE 'reserve' END AS roster_slot
  FROM public.team_members m JOIN public.profiles p ON p.id=m.profile_id JOIN public.teams t ON t.id=m.team_id;
GRANT SELECT ON public.team_roster TO anon,authenticated;

CREATE TABLE public.team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  invited_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX team_invites_pending_unique ON public.team_invites(team_id,invited_user_id) WHERE status='pending';
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invites parties read" ON public.team_invites FOR SELECT TO authenticated
  USING(invited_user_id=auth.uid() OR public.is_team_owner(auth.uid(),team_id));
GRANT SELECT ON public.team_invites TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.teams,public.team_members,public.team_invites FROM PUBLIC,anon,authenticated;
DO $$ DECLARE tbl text; cols text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['teams','team_members','team_invites'] LOOP
    SELECT string_agg(quote_ident(column_name),',') INTO cols FROM information_schema.columns
      WHERE table_schema='public' AND table_name=tbl;
    EXECUTE format('REVOKE INSERT (%s), UPDATE (%s) ON public.%I FROM PUBLIC,anon,authenticated',cols,cols,tbl);
    IF has_any_column_privilege('authenticated','public.'||tbl,'INSERT') OR
       has_any_column_privilege('authenticated','public.'||tbl,'UPDATE') OR
       has_table_privilege('authenticated','public.'||tbl,'DELETE') THEN
      RAISE EXCEPTION 'unexpected_inherited_write_privilege: %',tbl;
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION public.team_actor() RETURNS uuid LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN auth.uid();
END $$;
-- Only ~100 users: a single transaction gate is simpler than a lock hierarchy.
CREATE FUNCTION public.team_gate() RETURNS void LANGUAGE sql SET search_path='' AS $$
  SELECT pg_advisory_xact_lock(620261021,1)
$$;
CREATE FUNCTION public.create_team(p_name text,p_tag text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.team_actor(); result uuid;
BEGIN
  PERFORM public.team_gate();
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 100 OR p_tag IS NULL OR length(btrim(p_tag)) NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'invalid_team_name_or_tag'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u) THEN RAISE EXCEPTION 'profile_required'; END IF;
  IF EXISTS(SELECT 1 FROM public.team_members WHERE profile_id=u) OR EXISTS(SELECT 1 FROM public.teams WHERE owner_id=u) THEN
    RAISE EXCEPTION 'already_in_team'; END IF;
  INSERT INTO public.teams(name,tag,owner_id) VALUES(btrim(p_name),btrim(p_tag),u) RETURNING id INTO result;
  PERFORM public.write_audit('create_team','teams',result::text,NULL,NULL,NULL,NULL);
  RETURN result;
END $$;
CREATE FUNCTION public.invite_player(p_team_id uuid,p_user_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.team_actor(); result uuid;
BEGIN
  PERFORM public.team_gate();
  IF NOT public.is_team_owner(u,p_team_id) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN RAISE EXCEPTION 'profile_required'; END IF;
  IF EXISTS(SELECT 1 FROM public.team_members WHERE profile_id=p_user_id) OR EXISTS(SELECT 1 FROM public.teams WHERE owner_id=p_user_id) THEN
    RAISE EXCEPTION 'already_in_team'; END IF;
  IF (SELECT count(*) FROM public.team_members WHERE team_id=p_team_id)>=7 THEN RAISE EXCEPTION 'team_full'; END IF;
  INSERT INTO public.team_invites(team_id,invited_user_id) VALUES(p_team_id,p_user_id) RETURNING id INTO result;
  PERFORM public.write_audit('invite_player','team_invites',result::text,NULL,NULL,NULL,NULL);
  RETURN result;
END $$;
CREATE FUNCTION public.accept_invite(p_invite_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.team_actor(); inv public.team_invites; pos int;
BEGIN
  PERFORM public.team_gate();
  SELECT * INTO inv FROM public.team_invites WHERE id=p_invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  IF inv.invited_user_id<>u THEN RAISE EXCEPTION 'not_invitation_recipient'; END IF;
  IF inv.status<>'pending' THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;
  IF EXISTS(SELECT 1 FROM public.team_members WHERE profile_id=u) OR EXISTS(SELECT 1 FROM public.teams WHERE owner_id=u) THEN
    RAISE EXCEPTION 'already_in_team'; END IF;
  SELECT min(n) INTO pos FROM generate_series(1,6) n
    WHERE NOT EXISTS(SELECT 1 FROM public.team_members WHERE team_id=inv.team_id AND position=n);
  IF pos IS NULL THEN RAISE EXCEPTION 'team_full'; END IF;
  INSERT INTO public.team_members(team_id,profile_id,position) VALUES(inv.team_id,u,pos);
  UPDATE public.team_invites SET status='accepted' WHERE id=p_invite_id;
  UPDATE public.team_invites SET status='cancelled' WHERE invited_user_id=u AND id<>p_invite_id AND status='pending';
  PERFORM public.write_audit('accept_invite','team_invites',p_invite_id::text,NULL,NULL,to_jsonb(inv),NULL);
END $$;
CREATE FUNCTION public.decline_invite(p_invite_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.team_actor(); inv public.team_invites;
BEGIN
  PERFORM public.team_gate();
  SELECT * INTO inv FROM public.team_invites WHERE id=p_invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  IF inv.invited_user_id<>u THEN RAISE EXCEPTION 'not_invitation_recipient'; END IF;
  IF inv.status<>'pending' THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;
  UPDATE public.team_invites SET status='declined' WHERE id=p_invite_id;
  PERFORM public.write_audit('decline_invite','team_invites',p_invite_id::text,NULL,NULL,to_jsonb(inv),NULL);
END $$;
CREATE FUNCTION public.cancel_invite(p_invite_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.team_actor(); inv public.team_invites;
BEGIN
  PERFORM public.team_gate();
  SELECT * INTO inv FROM public.team_invites WHERE id=p_invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  IF NOT public.is_team_owner(u,inv.team_id) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF inv.status<>'pending' THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;
  UPDATE public.team_invites SET status='cancelled' WHERE id=p_invite_id;
  PERFORM public.write_audit('cancel_invite','team_invites',p_invite_id::text,NULL,NULL,to_jsonb(inv),NULL);
END $$;
CREATE FUNCTION public.manage_team(p_team_id uuid,p_action text,p_user_id uuid DEFAULT NULL,p_value text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.team_actor(); owner uuid;
BEGIN
  PERFORM public.team_gate();
  SELECT owner_id INTO owner FROM public.teams WHERE id=p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'team_not_found'; END IF;
  IF p_action='leave' THEN
    IF u=owner THEN RAISE EXCEPTION 'owner_cannot_leave'; END IF;
    DELETE FROM public.team_members WHERE team_id=p_team_id AND profile_id=u;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_in_team'; END IF;
  ELSE
    IF u<>owner THEN RAISE EXCEPTION 'owner_required'; END IF;
    IF p_action='logo' THEN UPDATE public.teams SET logo_url=p_value WHERE id=p_team_id;
    ELSIF p_action='delete' THEN
      IF EXISTS(SELECT 1 FROM public.applications WHERE team_id=p_team_id)
         OR EXISTS(SELECT 1 FROM public.tournament_participants WHERE team_id=p_team_id)
         OR EXISTS(SELECT 1 FROM public.placements WHERE team_id=p_team_id)
         OR EXISTS(SELECT 1 FROM public.points_ledger WHERE team_id=p_team_id)
         OR EXISTS(SELECT 1 FROM public.matches WHERE team_a_id=p_team_id OR team_b_id=p_team_id OR winner_id=p_team_id) THEN
        RAISE EXCEPTION 'team_has_history';
      END IF;
      DELETE FROM public.teams WHERE id=p_team_id;
    ELSIF p_action='remove' THEN
      IF p_user_id=owner THEN RAISE EXCEPTION 'cannot_remove_owner'; END IF;
      DELETE FROM public.team_members WHERE team_id=p_team_id AND profile_id=p_user_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'member_required'; END IF;
    ELSE RAISE EXCEPTION 'invalid_action'; END IF;
  END IF;
  PERFORM public.write_audit('manage_team','teams',p_team_id::text,NULL,p_action,NULL,jsonb_build_object('user_id',p_user_id));
END $$;
CREATE FUNCTION public.search_team_players(p_team_id uuid,p_query text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.is_team_owner(public.team_actor(),p_team_id) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF p_query IS NULL OR length(btrim(p_query))<2 THEN RETURN '[]'::jsonb; END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM (
    SELECT p.id,p.nickname,p.mmr FROM public.profiles p
    WHERE strpos(lower(p.nickname),lower(btrim(p_query)))>0
      AND NOT EXISTS(SELECT 1 FROM public.team_members m WHERE m.profile_id=p.id)
      AND NOT EXISTS(SELECT 1 FROM public.teams t WHERE t.owner_id=p.id)
    ORDER BY p.nickname,p.id LIMIT 20
  ) r);
END $$;
CREATE FUNCTION public.list_team_invites() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC),'[]'::jsonb) FROM (
    SELECT i.*,t.name team_name,t.tag team_tag,p.nickname invited_user_name,o.nickname invited_by_name
    FROM public.team_invites i JOIN public.teams t ON t.id=i.team_id
    JOIN public.profiles p ON p.id=i.invited_user_id JOIN public.profiles o ON o.id=t.owner_id
    WHERE i.invited_user_id=auth.uid() OR t.owner_id=auth.uid()
  ) r
$$;
CREATE FUNCTION public.team_system_version() RETURNS integer LANGUAGE sql STABLE SET search_path='' AS $$ SELECT 2 $$;

REVOKE ALL ON FUNCTION public.team_actor(),public.team_gate(),public.team_add_owner(),public.team_owner_immutable(),public.team_member_identity_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.is_team_owner(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_owner(uuid,uuid) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.create_team(text,text),public.invite_player(uuid,uuid),public.accept_invite(uuid),public.decline_invite(uuid),public.cancel_invite(uuid),public.manage_team(uuid,text,uuid,text),public.search_team_players(uuid,text),public.list_team_invites(),public.team_system_version() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_team(text,text),public.invite_player(uuid,uuid),public.accept_invite(uuid),public.decline_invite(uuid),public.cancel_invite(uuid),public.manage_team(uuid,text,uuid,text),public.search_team_players(uuid,text),public.list_team_invites(),public.team_system_version() TO authenticated;

-- Legacy import cannot create free-text participants or bypass identity rules.
CREATE OR REPLACE FUNCTION public.import_legacy_team(p jsonb) RETURNS uuid LANGUAGE plpgsql
SECURITY DEFINER SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'registered_profiles_required'; END $$;
REVOKE ALL ON FUNCTION public.import_legacy_team(jsonb) FROM PUBLIC,anon,authenticated;

-- Tournament RPC replacements follow; historical JSON snapshots are not rewritten.

CREATE OR REPLACE FUNCTION public.submit_application(p_tournament_id uuid, p_team_id uuid, p_regulation_version_id uuid, p_idempotency_key text)
RETURNS public.applications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _t public.tournaments; _app public.applications; _snap jsonb; _accepted int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO _app FROM public.applications WHERE submitted_by = _uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN _app; END IF;

  SELECT * INTO _t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament_not_found'; END IF;
  IF _t.status <> 'registration_open' THEN RAISE EXCEPTION 'registration_not_open'; END IF;
  IF _t.registration_opens_at IS NOT NULL AND now() < _t.registration_opens_at THEN RAISE EXCEPTION 'registration_not_open'; END IF;
  IF _t.registration_closes_at IS NULL OR now() >= _t.registration_closes_at THEN RAISE EXCEPTION 'registration_closed'; END IF;
  IF NOT public.is_team_owner(_uid, p_team_id) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regulation_versions WHERE id = p_regulation_version_id AND status = 'published') THEN
    RAISE EXCEPTION 'regulation_not_acknowledged'; END IF;

  SELECT * INTO _app FROM public.applications
   WHERE tournament_id = p_tournament_id AND team_id = p_team_id AND status IN ('pending','accepted');
  IF FOUND THEN RETURN _app; END IF;

  SELECT count(*) INTO _accepted FROM public.applications WHERE tournament_id = p_tournament_id AND status = 'accepted';
  IF _accepted >= _t.team_limit THEN RAISE EXCEPTION 'tournament_full'; END IF;

  SELECT jsonb_build_object('name', t.name, 'tag', t.tag, 'logo_url', t.logo_url,
    'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('nickname', p.nickname, 'mmr', p.mmr, 'profile_id', m.profile_id) ORDER BY m.position)
      FROM public.team_members m JOIN public.profiles p ON p.id=m.profile_id WHERE m.team_id = t.id), '[]'::jsonb))
  INTO _snap FROM public.teams t WHERE t.id = p_team_id;

  INSERT INTO public.applications(tournament_id, team_id, submitted_by, roster_snapshot, regulation_version_id, idempotency_key)
  VALUES (p_tournament_id, p_team_id, _uid, _snap, p_regulation_version_id, p_idempotency_key) RETURNING * INTO _app;
  PERFORM public.write_audit('submit_application', 'applications', _app.id::text, p_tournament_id, NULL, NULL, to_jsonb(_app));
  RETURN _app;
END $$;

CREATE OR REPLACE FUNCTION public.withdraw_application(p_id uuid)
RETURNS public.applications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _app public.applications; _before jsonb; _t public.tournaments;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _app FROM public.applications WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'application_not_found'; END IF;
  IF NOT public.is_team_owner(_uid, _app.team_id) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF _app.status NOT IN ('pending','accepted') THEN RAISE EXCEPTION 'application_not_active'; END IF;
  SELECT * INTO _t FROM public.tournaments WHERE id = _app.tournament_id FOR UPDATE;
  IF _t.registration_closes_at IS NULL OR now() >= _t.registration_closes_at OR _t.status NOT IN ('announced','registration_open') THEN
    RAISE EXCEPTION 'deadline_passed'; END IF;
  _before := to_jsonb(_app);
  DELETE FROM public.tournament_participants WHERE tournament_id = _app.tournament_id AND team_id = _app.team_id;
  UPDATE public.applications SET status = 'withdrawn' WHERE id = p_id RETURNING * INTO _app;
  PERFORM public.write_audit('withdraw_application', 'applications', p_id::text, _app.tournament_id, NULL, _before, to_jsonb(_app));
  RETURN _app;
END $$;

CREATE OR REPLACE FUNCTION public.decide_application(p_id uuid, p_accept boolean, p_reason text DEFAULT NULL)
RETURNS public.applications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _app public.applications; _t public.tournaments; _before jsonb; _accepted int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _app FROM public.applications WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'application_not_found'; END IF;
  SELECT * INTO _t FROM public.tournaments WHERE id = _app.tournament_id FOR UPDATE;
  SELECT * INTO _app FROM public.applications WHERE id = p_id FOR UPDATE;
  IF NOT public.is_staff_for(_uid, _app.tournament_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.is_admin(_uid) AND (public.is_team_owner(_uid, _app.team_id)
     OR EXISTS (SELECT 1 FROM public.team_members WHERE team_id = _app.team_id AND profile_id = _uid)) THEN
    RAISE EXCEPTION 'conflict_of_interest'; END IF;
  IF _app.status <> 'pending' THEN RAISE EXCEPTION 'application_not_pending'; END IF;
  _before := to_jsonb(_app);
  IF p_accept THEN
    SELECT count(*) INTO _accepted FROM public.applications WHERE tournament_id = _t.id AND status = 'accepted';
    IF _accepted >= _t.team_limit THEN RAISE EXCEPTION 'tournament_full'; END IF;
    UPDATE public.applications SET status = 'accepted', decided_by = _uid, decided_at = now(), reject_reason = NULL
      WHERE id = p_id RETURNING * INTO _app;
    INSERT INTO public.tournament_participants(tournament_id, team_id, application_id, team_name, team_tag, logo_url, roster_snapshot)
    VALUES (_t.id, _app.team_id, _app.id,
      COALESCE(_app.roster_snapshot->>'name', ''), COALESCE(_app.roster_snapshot->>'tag', ''),
      _app.roster_snapshot->>'logo_url', _app.roster_snapshot)
    ON CONFLICT (tournament_id, team_id) DO NOTHING;
  ELSE
    IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN RAISE EXCEPTION 'reason_required'; END IF;
    UPDATE public.applications SET status = 'rejected', decided_by = _uid, decided_at = now(), reject_reason = btrim(p_reason)
      WHERE id = p_id RETURNING * INTO _app;
  END IF;
  PERFORM public.write_audit(CASE WHEN p_accept THEN 'accept_application' ELSE 'reject_application' END,
    'applications', p_id::text, _t.id, p_reason, _before, to_jsonb(_app));
  RETURN _app;
END $$;

CREATE OR REPLACE FUNCTION public.reacknowledge_regulation(p_application_id uuid, p_version_id uuid)
RETURNS public.applications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _app public.applications; _before jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _app FROM public.applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'application_not_found'; END IF;
  IF NOT public.is_team_owner(auth.uid(), _app.team_id) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regulation_versions WHERE id = p_version_id AND status = 'published') THEN RAISE EXCEPTION 'regulation_not_acknowledged'; END IF;
  _before := to_jsonb(_app);
  UPDATE public.applications SET regulation_version_id = p_version_id WHERE id = p_application_id RETURNING * INTO _app;
  PERFORM public.write_audit('reacknowledge_regulation', 'applications', p_application_id::text, _app.tournament_id, NULL, _before, to_jsonb(_app));
  RETURN _app;
END $$;

CREATE OR REPLACE FUNCTION public.import_legacy_tournament(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _tid text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF COALESCE(p->>'legacy_id','') = '' THEN RAISE EXCEPTION 'legacy_id_required'; END IF;
  SELECT id INTO _id FROM public.tournaments WHERE legacy_id = p->>'legacy_id';
  IF FOUND THEN RETURN jsonb_build_object('id', _id, 'skipped', true); END IF;
  INSERT INTO public.tournaments(title, starts_at, team_limit, format, created_by, legacy_id, description)
  VALUES (COALESCE(NULLIF(btrim(p->>'title'),''), 'Импортированный турнир'), (p->>'starts_at')::timestamptz,
    GREATEST(2, jsonb_array_length(COALESCE(p->'team_ids','[]'::jsonb))),
    CASE WHEN jsonb_array_length(COALESCE(p->'groups','[]'::jsonb)) > 0 THEN 'groups_playoff'::public.tournament_format ELSE 'single_elim'::public.tournament_format END,
    auth.uid(), p->>'legacy_id', 'Импортировано из старой версии сайта.')
  RETURNING id INTO _id;
  FOR _tid IN SELECT jsonb_array_elements_text(COALESCE(p->'team_ids','[]'::jsonb)) LOOP
    INSERT INTO public.tournament_participants(tournament_id, team_id, team_name, team_tag, logo_url, roster_snapshot)
    SELECT _id, t.id, t.name, t.tag, t.logo_url, jsonb_build_object('name', t.name, 'tag', t.tag, 'logo_url', t.logo_url,
      'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('nickname', p.nickname, 'mmr', p.mmr) ORDER BY m.position) FROM public.team_members m JOIN public.profiles p ON p.id=m.profile_id WHERE m.team_id = t.id), '[]'::jsonb))
    FROM public.teams t WHERE t.id = _tid::uuid
    ON CONFLICT (tournament_id, team_id) DO NOTHING;
  END LOOP;
  IF jsonb_array_length(COALESCE(p->'groups','[]'::jsonb)) > 0 THEN
    PERFORM public.generate_structure(_id, 'groups', jsonb_build_object('import', true, 'groups', p->'groups', 'matches', COALESCE(p->'group_matches','[]'::jsonb)), true);
  END IF;
  IF jsonb_array_length(COALESCE(p->'bracket','[]'::jsonb)) > 0 THEN
    PERFORM public.generate_structure(_id, 'bracket', jsonb_build_object('import', true, 'matches', p->'bracket'), true);
  END IF;
  IF COALESCE((p->>'finished')::boolean, false) AND jsonb_array_length(COALESCE(p->'placements','[]'::jsonb)) > 0 THEN
    UPDATE public.tournaments SET status = 'live' WHERE id = _id;
    PERFORM public.finish_tournament(_id, p->'placements', 'legacy import');
  END IF;
  PERFORM public.write_audit('import_legacy_tournament', 'tournaments', _id::text, _id, NULL, NULL, jsonb_build_object('legacy_id', p->>'legacy_id', 'finished', p->'finished'));
  RETURN jsonb_build_object('id', _id, 'skipped', false);
END $$;

DROP FUNCTION public.is_team_captain(uuid,uuid);
COMMIT;
