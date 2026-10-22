-- Additive legacy rollout. No existing team/profile/captain rows are modified.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
LOCK TABLE public.teams,public.team_members,public.team_captains IN SHARE ROW EXCLUSIVE MODE;
CREATE FUNCTION public.is_team_owner(_uid uuid,_team_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT _uid IS NOT NULL AND EXISTS(SELECT 1 FROM public.teams WHERE id=_team_id AND owner_id=_uid) $$;
CREATE OR REPLACE FUNCTION public.is_team_captain(_uid uuid,_team_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT public.is_team_owner(_uid,_team_id) $$;
CREATE TABLE public.team_write_guard(team_id uuid PRIMARY KEY,revision bigint NOT NULL DEFAULT 1);
CREATE TABLE public.team_tag_guard(tag text PRIMARY KEY,revision bigint NOT NULL DEFAULT 1);
ALTER TABLE public.team_write_guard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_tag_guard ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_write_guard,public.team_tag_guard FROM PUBLIC,anon,authenticated,service_role;
-- Actual revision writes make stale REPEATABLE READ transactions abort (40001).
-- Acquire identity first, then team, consistently with the legacy membership guard.
CREATE FUNCTION public.lock_team_user(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF p_user IS NOT NULL THEN INSERT INTO public.team_membership_guard(user_id,revision) VALUES(p_user,1) ON CONFLICT(user_id) DO UPDATE SET revision=team_membership_guard.revision+1; END IF;
END $$;
CREATE FUNCTION public.lock_team_write(p_team uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 INSERT INTO public.team_write_guard(team_id,revision) VALUES(p_team,1) ON CONFLICT(team_id) DO UPDATE SET revision=team_write_guard.revision+1;
END $$;
CREATE VIEW public.team_roster WITH (security_invoker=true) AS
 SELECT m.id,m.team_id,m.profile_id,m.position,m.created_at,m.updated_at,coalesce(p.nickname,m.nickname) nickname,p.mmr,(m.profile_id=t.owner_id) is_captain,CASE WHEN m.position<5 THEN 'main' ELSE 'reserve' END roster_slot
 FROM public.team_members m LEFT JOIN public.profiles p ON p.id=m.profile_id JOIN public.teams t ON t.id=m.team_id;
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
REVOKE INSERT,UPDATE,DELETE ON public.teams,public.team_members,public.team_captains,public.team_invites FROM PUBLIC,anon,authenticated;
DO $$ DECLARE tbl text; cols text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['teams','team_members','team_captains','team_invites'] LOOP
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
CREATE FUNCTION public.create_team(p_name text,p_tag text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.team_actor(); result uuid;
BEGIN
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 100 OR p_tag IS NULL OR length(btrim(p_tag)) NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'invalid_team_name_or_tag'; END IF;
  PERFORM public.lock_team_user(u);
  INSERT INTO public.team_tag_guard(tag,revision) VALUES(lower(btrim(p_tag)),1) ON CONFLICT(tag) DO UPDATE SET revision=team_tag_guard.revision+1;
  IF EXISTS(SELECT 1 FROM public.teams WHERE lower(btrim(tag))=lower(btrim(p_tag))) THEN RAISE EXCEPTION 'teams_unique_tag'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u) THEN RAISE EXCEPTION 'profile_required'; END IF;
  IF EXISTS(SELECT 1 FROM public.team_members WHERE profile_id=u) OR EXISTS(SELECT 1 FROM public.teams WHERE owner_id=u) OR EXISTS(SELECT 1 FROM public.team_captains WHERE user_id=u) THEN
    RAISE EXCEPTION 'already_in_team'; END IF;
  INSERT INTO public.teams(name,tag,owner_id) VALUES(btrim(p_name),btrim(p_tag),u) RETURNING id INTO result;
  INSERT INTO public.team_members(team_id,profile_id,position,nickname) VALUES(result,u,0,'');
  PERFORM public.write_audit('create_team','teams',result::text,NULL,NULL,NULL,NULL);
  RETURN result;
END $$;
CREATE FUNCTION public.invite_player(p_team_id uuid,p_user_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.team_actor(); result uuid;
BEGIN
  PERFORM public.lock_team_user(p_user_id);
  PERFORM public.lock_team_write(p_team_id);
  IF NOT public.is_team_owner(u,p_team_id) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN RAISE EXCEPTION 'profile_required'; END IF;
  IF EXISTS(SELECT 1 FROM public.team_members WHERE profile_id=p_user_id) OR EXISTS(SELECT 1 FROM public.teams WHERE owner_id=p_user_id) OR EXISTS(SELECT 1 FROM public.team_captains WHERE user_id=p_user_id) THEN
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
  SELECT * INTO inv FROM public.team_invites WHERE id=p_invite_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  PERFORM public.lock_team_user(inv.invited_user_id);
  PERFORM public.lock_team_write(inv.team_id);
  SELECT * INTO inv FROM public.team_invites WHERE id=p_invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  IF inv.invited_user_id<>u THEN RAISE EXCEPTION 'not_invitation_recipient'; END IF;
  IF inv.status<>'pending' THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;
  IF EXISTS(SELECT 1 FROM public.team_members WHERE profile_id=u) OR EXISTS(SELECT 1 FROM public.teams WHERE owner_id=u) OR EXISTS(SELECT 1 FROM public.team_captains WHERE user_id=u) THEN
    RAISE EXCEPTION 'already_in_team'; END IF;
  IF (SELECT count(*) FROM public.team_members WHERE team_id=inv.team_id)>=7 THEN RAISE EXCEPTION 'team_full'; END IF;
  SELECT min(n) INTO pos FROM generate_series(0,6) n
    WHERE NOT EXISTS(SELECT 1 FROM public.team_members WHERE team_id=inv.team_id AND position=n);
  IF pos IS NULL THEN RAISE EXCEPTION 'team_full'; END IF;
  INSERT INTO public.team_members(team_id,profile_id,position,nickname) VALUES(inv.team_id,u,pos,'');
  UPDATE public.team_invites SET status='accepted' WHERE id=p_invite_id;
  UPDATE public.team_invites SET status='cancelled' WHERE invited_user_id=u AND id<>p_invite_id AND status='pending';
  PERFORM public.write_audit('accept_invite','team_invites',p_invite_id::text,NULL,NULL,to_jsonb(inv),NULL);
END $$;
CREATE FUNCTION public.decline_invite(p_invite_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.team_actor(); inv public.team_invites;
BEGIN
  SELECT * INTO inv FROM public.team_invites WHERE id=p_invite_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  PERFORM public.lock_team_user(inv.invited_user_id);
  PERFORM public.lock_team_write(inv.team_id);
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
  SELECT * INTO inv FROM public.team_invites WHERE id=p_invite_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  PERFORM public.lock_team_user(inv.invited_user_id);
  PERFORM public.lock_team_write(inv.team_id);
  SELECT * INTO inv FROM public.team_invites WHERE id=p_invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  IF NOT public.is_team_owner(u,inv.team_id) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF inv.status<>'pending' THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;
  UPDATE public.team_invites SET status='cancelled' WHERE id=p_invite_id;
  PERFORM public.write_audit('cancel_invite','team_invites',p_invite_id::text,NULL,NULL,to_jsonb(inv),NULL);
END $$;
CREATE FUNCTION public.manage_team(p_team_id uuid,p_action text,p_user_id uuid DEFAULT NULL,p_value text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.team_actor(); owner uuid; lock_user uuid;
BEGIN
  FOR lock_user IN SELECT DISTINCT x FROM (
    SELECT owner_id x FROM public.teams WHERE id=p_team_id
    UNION SELECT profile_id FROM public.team_members WHERE team_id=p_team_id
    UNION SELECT user_id FROM public.team_captains WHERE team_id=p_team_id
    UNION SELECT invited_user_id FROM public.team_invites WHERE team_id=p_team_id
    UNION SELECT u UNION SELECT p_user_id
  ) ids WHERE x IS NOT NULL ORDER BY x LOOP PERFORM public.lock_team_user(lock_user); END LOOP;
  PERFORM public.lock_team_write(p_team_id);
  SELECT owner_id INTO owner FROM public.teams WHERE id=p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'team_not_found'; END IF;
  IF p_action='leave' THEN
    IF u=owner THEN RAISE EXCEPTION 'owner_cannot_leave'; END IF;
    IF EXISTS(SELECT 1 FROM public.team_members WHERE team_id=p_team_id AND profile_id=u AND (nickname<>'' OR role<>'' OR mmr IS NOT NULL)) THEN RAISE EXCEPTION 'legacy_data_requires_review'; END IF;
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
      IF EXISTS(SELECT 1 FROM public.team_members WHERE team_id=p_team_id AND (profile_id IS NULL OR nickname<>'' OR role<>'' OR mmr IS NOT NULL)) OR EXISTS(SELECT 1 FROM public.team_captains WHERE team_id=p_team_id) THEN RAISE EXCEPTION 'legacy_data_requires_review'; END IF;
      DELETE FROM public.teams WHERE id=p_team_id;
    ELSIF p_action='remove' THEN
      IF p_user_id=owner THEN RAISE EXCEPTION 'cannot_remove_owner'; END IF;
      IF EXISTS(SELECT 1 FROM public.team_members WHERE team_id=p_team_id AND profile_id=p_user_id AND (nickname<>'' OR role<>'' OR mmr IS NOT NULL)) THEN RAISE EXCEPTION 'legacy_data_requires_review'; END IF;
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
      AND NOT EXISTS(SELECT 1 FROM public.team_captains c WHERE c.user_id=p.id)
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

REVOKE ALL ON FUNCTION public.team_actor(),public.lock_team_user(uuid),public.lock_team_write(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.is_team_owner(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_owner(uuid,uuid) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.create_team(text,text),public.invite_player(uuid,uuid),public.accept_invite(uuid),public.decline_invite(uuid),public.cancel_invite(uuid),public.manage_team(uuid,text,uuid,text),public.search_team_players(uuid,text),public.list_team_invites(),public.team_system_version() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_team(text,text),public.invite_player(uuid,uuid),public.accept_invite(uuid),public.decline_invite(uuid),public.cancel_invite(uuid),public.manage_team(uuid,text,uuid,text),public.search_team_players(uuid,text),public.list_team_invites(),public.team_system_version() TO authenticated;

-- Legacy import cannot create free-text participants or bypass identity rules.
CREATE OR REPLACE FUNCTION public.import_legacy_team(p jsonb) RETURNS uuid LANGUAGE plpgsql
SECURITY DEFINER SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'registered_profiles_required'; END $$;
REVOKE ALL ON FUNCTION public.import_legacy_team(jsonb) FROM PUBLIC,anon,authenticated;


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
    'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('nickname', coalesce(p.nickname,m.nickname), 'mmr', p.mmr, 'profile_id', m.profile_id) ORDER BY m.position)
      FROM public.team_members m LEFT JOIN public.profiles p ON p.id=m.profile_id WHERE m.team_id = t.id), '[]'::jsonb))
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
  SELECT * INTO _app FROM public.applications WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'application_not_found'; END IF;
  SELECT * INTO _t FROM public.tournaments WHERE id = _app.tournament_id FOR UPDATE;
  SELECT * INTO _app FROM public.applications WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'application_not_found'; END IF;
  IF NOT public.is_team_owner(_uid, _app.team_id) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF _app.status NOT IN ('pending','accepted') THEN RAISE EXCEPTION 'application_not_active'; END IF;
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


COMMIT;
