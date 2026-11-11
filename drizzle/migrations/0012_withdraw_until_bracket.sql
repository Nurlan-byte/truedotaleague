CREATE OR REPLACE FUNCTION public.withdraw_application(p_id uuid)
RETURNS public.applications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _app public.applications; _before jsonb; _t public.tournaments;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _app FROM public.applications WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'application_not_found'; END IF;
  SELECT * INTO _t FROM public.tournaments WHERE id = _app.tournament_id FOR UPDATE;
  SELECT * INTO _app FROM public.applications WHERE id = p_id FOR UPDATE;
  IF NOT public.is_team_owner(_uid, _app.team_id) AND NOT public.is_team_captain(_uid, _app.team_id) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF _app.status NOT IN ('pending','accepted') THEN RAISE EXCEPTION 'application_not_active'; END IF;
  -- Сняться можно до старта турнира и пока команда не поставлена в сетку или группы.
  IF _t.status NOT IN ('announced','registration_open','registration_closed') THEN RAISE EXCEPTION 'deadline_passed'; END IF;
  IF EXISTS (SELECT 1 FROM public.matches WHERE tournament_id = _app.tournament_id AND _app.team_id IN (team_a_id, team_b_id))
     OR EXISTS (SELECT 1 FROM public.groups WHERE tournament_id = _app.tournament_id AND _app.team_id = ANY(team_ids)) THEN
    RAISE EXCEPTION 'already_in_bracket'; END IF;
  _before := to_jsonb(_app);
  DELETE FROM public.tournament_participants WHERE tournament_id = _app.tournament_id AND team_id = _app.team_id;
  UPDATE public.applications SET status = 'withdrawn' WHERE id = p_id RETURNING * INTO _app;
  PERFORM public.write_audit('withdraw_application', 'applications', p_id::text, _app.tournament_id, NULL, _before, to_jsonb(_app));
  RETURN _app;
END $$;