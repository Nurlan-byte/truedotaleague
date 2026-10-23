-- Manual closing: preserves every existing row and historical closing-date value.
-- Requires the invitations and minimum-five roster migrations.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Obsolete closing dates must not constrain future start/open edits.
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS reg_close_before_start;
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS reg_open_before_close;

CREATE OR REPLACE FUNCTION public.submit_application(p_tournament_id uuid, p_team_id uuid, p_regulation_version_id uuid, p_idempotency_key text)
RETURNS public.applications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _t public.tournaments; _app public.applications; _snap jsonb; _accepted int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO _app FROM public.applications WHERE submitted_by = _uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN _app; END IF;

  -- No identity lock is acquired here: submission never changes membership.
  -- Team gate precedes tournament/app locks, serializing the roster snapshot
  -- with accept/leave/remove; revision writes reject stale RR snapshots.
  PERFORM public.lock_team_write(p_team_id);
  SELECT * INTO _t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament_not_found'; END IF;
  IF _t.status <> 'registration_open' THEN RAISE EXCEPTION 'registration_not_open'; END IF;
  IF _t.registration_opens_at IS NOT NULL AND now() < _t.registration_opens_at THEN RAISE EXCEPTION 'registration_not_open'; END IF;
  IF NOT public.is_team_owner(_uid, p_team_id) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regulation_versions WHERE id = p_regulation_version_id AND status = 'published') THEN
    RAISE EXCEPTION 'regulation_not_acknowledged'; END IF;

  SELECT * INTO _app FROM public.applications
   WHERE tournament_id = p_tournament_id AND team_id = p_team_id AND status IN ('pending','accepted');
  IF FOUND THEN RETURN _app; END IF;

  IF (SELECT count(DISTINCT m.profile_id) FROM public.team_members m JOIN public.profiles p ON p.id=m.profile_id WHERE m.team_id=p_team_id AND m.position BETWEEN 0 AND 4)<5
     OR (SELECT count(DISTINCT m.position) FROM public.team_members m JOIN public.profiles p ON p.id=m.profile_id WHERE m.team_id=p_team_id AND m.position BETWEEN 0 AND 4)<5 THEN
    RAISE EXCEPTION 'minimum_five_main_players';
  END IF;

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
  IF _t.status NOT IN ('announced','registration_open') THEN
    RAISE EXCEPTION 'deadline_passed'; END IF;
  _before := to_jsonb(_app);
  DELETE FROM public.tournament_participants WHERE tournament_id = _app.tournament_id AND team_id = _app.team_id;
  UPDATE public.applications SET status = 'withdrawn' WHERE id = p_id RETURNING * INTO _app;
  PERFORM public.write_audit('withdraw_application', 'applications', p_id::text, _app.tournament_id, NULL, _before, to_jsonb(_app));
  RETURN _app;
END $$;

COMMIT;
