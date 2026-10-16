DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.generate_structure(p_tournament_id uuid, p_kind text, p_payload jsonb, p_confirm_reset boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.tournaments; _stage public.match_stage; _has_scores boolean; _before jsonb; _g jsonb; _m jsonb; _gid uuid; _gids uuid[] := '{}'; _i int := 0; _n int := 0; _a uuid; _b uuid; _sa int; _sb int; _w uuid; _r record;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_kind NOT IN ('groups','bracket') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
  SELECT * INTO _t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament_not_found'; END IF;
  IF _t.status IN ('finished','cancelled') AND NOT COALESCE((p_payload->>'import')::boolean, false) THEN RAISE EXCEPTION 'tournament_locked'; END IF;
  _stage := CASE WHEN p_kind = 'groups' THEN 'group'::public.match_stage ELSE 'playoff'::public.match_stage END;
  SELECT EXISTS (SELECT 1 FROM public.matches WHERE tournament_id = p_tournament_id AND stage = _stage AND (score_a IS NOT NULL OR score_b IS NOT NULL)) INTO _has_scores;
  IF _has_scores AND NOT p_confirm_reset THEN RAISE EXCEPTION 'reset_confirmation_required'; END IF;
  -- every team must be a participant
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_payload->'matches','[]'::jsonb)) m,
      LATERAL (VALUES (m->>'team_a_id'), (m->>'team_b_id')) v(tid)
    WHERE v.tid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tournament_participants tp WHERE tp.tournament_id = p_tournament_id AND tp.team_id = v.tid::uuid)
  ) THEN RAISE EXCEPTION 'team_not_participant'; END IF;
  SELECT jsonb_build_object('matches', COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)) INTO _before FROM public.matches x WHERE tournament_id = p_tournament_id AND stage = _stage;

  IF p_kind = 'groups' THEN
    DELETE FROM public.matches WHERE tournament_id = p_tournament_id AND stage = 'group';
    DELETE FROM public.groups WHERE tournament_id = p_tournament_id;
    FOR _g IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'groups','[]'::jsonb)) LOOP
      INSERT INTO public.groups(tournament_id, idx, name, team_ids)
      VALUES (p_tournament_id, _i, COALESCE(_g->>'name', 'Группа ' || (_i + 1)),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(_g->'team_ids'))::uuid[], '{}'))
      RETURNING id INTO _gid;
      _gids := _gids || _gid; _i := _i + 1;
    END LOOP;
    FOR _m IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'matches','[]'::jsonb)) LOOP
      _sa := (_m->>'score_a')::int; _sb := (_m->>'score_b')::int;
      _a := (_m->>'team_a_id')::uuid; _b := (_m->>'team_b_id')::uuid;
      _w := CASE WHEN _sa IS NOT NULL AND _sb IS NOT NULL AND _sa <> _sb THEN CASE WHEN _sa > _sb THEN _a ELSE _b END END;
      INSERT INTO public.matches(tournament_id, stage, group_id, round, slot, team_a_id, team_b_id, score_a, score_b, winner_id, scheduled_at)
      VALUES (p_tournament_id, 'group', _gids[(_m->>'group_idx')::int + 1], 1, _n, _a, _b, _sa, _sb, _w, (_m->>'scheduled_at')::timestamptz);
      _n := _n + 1;
    END LOOP;
  ELSE
    DELETE FROM public.matches WHERE tournament_id = p_tournament_id AND stage = 'playoff';
    FOR _m IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'matches','[]'::jsonb)) LOOP
      _sa := (_m->>'score_a')::int; _sb := (_m->>'score_b')::int;
      _a := (_m->>'team_a_id')::uuid; _b := (_m->>'team_b_id')::uuid;
      _w := CASE WHEN _a IS NOT NULL AND _b IS NULL AND (_m->>'round')::int = 1 THEN _a
                 WHEN _b IS NOT NULL AND _a IS NULL AND (_m->>'round')::int = 1 THEN _b
                 WHEN _sa IS NOT NULL AND _sb IS NOT NULL AND _sa <> _sb THEN CASE WHEN _sa > _sb THEN _a ELSE _b END END;
      INSERT INTO public.matches(tournament_id, stage, round, slot, team_a_id, team_b_id, score_a, score_b, winner_id, scheduled_at)
      VALUES (p_tournament_id, 'playoff', (_m->>'round')::int, (_m->>'slot')::int, _a, _b, _sa, _sb, _w, (_m->>'scheduled_at')::timestamptz);
      _n := _n + 1;
    END LOOP;
    UPDATE public.matches m SET next_match_id = nx.id, next_match_slot = CASE WHEN m.slot % 2 = 0 THEN 'a' ELSE 'b' END
      FROM public.matches nx
      WHERE m.tournament_id = p_tournament_id AND m.stage = 'playoff' AND nx.tournament_id = p_tournament_id AND nx.stage = 'playoff'
        AND nx.round = m.round + 1 AND nx.slot = m.slot / 2;
    FOR _r IN SELECT id FROM public.matches WHERE tournament_id = p_tournament_id AND stage = 'playoff' AND round = 1 AND winner_id IS NOT NULL LOOP
      PERFORM public.propagate_match_winner(_r.id);
    END LOOP;
  END IF;
  PERFORM public.write_audit('generate_' || p_kind, 'tournaments', p_tournament_id::text, p_tournament_id,
    CASE WHEN _has_scores THEN 'reset with results' END, _before, jsonb_build_object('matches_created', _n));
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.delete_draft_tournament(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.tournaments;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO _t FROM public.tournaments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament_not_found'; END IF;
  IF _t.status <> 'draft' THEN RAISE EXCEPTION 'only_drafts_deletable'; END IF;
  IF EXISTS (SELECT 1 FROM public.applications WHERE tournament_id = p_id) THEN RAISE EXCEPTION 'has_applications'; END IF;
  IF EXISTS (SELECT 1 FROM public.points_ledger WHERE tournament_id = p_id) THEN RAISE EXCEPTION 'has_results'; END IF;
  UPDATE public.matches SET next_match_id = NULL WHERE tournament_id = p_id;
  DELETE FROM public.matches WHERE tournament_id = p_id;
  DELETE FROM public.groups WHERE tournament_id = p_id;
  DELETE FROM public.placements WHERE tournament_id = p_id;
  DELETE FROM public.tournament_participants WHERE tournament_id = p_id;
  DELETE FROM public.tournament_moderators WHERE tournament_id = p_id;
  DELETE FROM public.tournaments WHERE id = p_id;
  PERFORM public.write_audit('delete_draft_tournament', 'tournaments', p_id::text, NULL, NULL, to_jsonb(_t), NULL);
END $$;

CREATE OR REPLACE FUNCTION public.reacknowledge_regulation(p_application_id uuid, p_version_id uuid)
RETURNS public.applications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _app public.applications; _before jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _app FROM public.applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'application_not_found'; END IF;
  IF NOT public.is_team_captain(auth.uid(), _app.team_id) THEN RAISE EXCEPTION 'not_team_captain'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regulation_versions WHERE id = p_version_id AND status = 'published') THEN RAISE EXCEPTION 'regulation_not_acknowledged'; END IF;
  _before := to_jsonb(_app);
  UPDATE public.applications SET regulation_version_id = p_version_id WHERE id = p_application_id RETURNING * INTO _app;
  PERFORM public.write_audit('reacknowledge_regulation', 'applications', p_application_id::text, _app.tournament_id, NULL, _before, to_jsonb(_app));
  RETURN _app;
END $$;

CREATE OR REPLACE FUNCTION public.import_legacy_team(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _m jsonb; _pos int := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF COALESCE(p->>'legacy_id','') = '' THEN RAISE EXCEPTION 'legacy_id_required'; END IF;
  SELECT id INTO _id FROM public.teams WHERE legacy_id = p->>'legacy_id';
  IF FOUND THEN RETURN _id; END IF;
  INSERT INTO public.teams(name, tag, logo_url, owner_id, legacy_id)
  VALUES (COALESCE(NULLIF(btrim(p->>'name'),''), 'Команда'), COALESCE(p->>'tag',''), NULLIF(p->>'logo_url',''), auth.uid(), p->>'legacy_id')
  RETURNING id INTO _id;
  FOR _m IN SELECT * FROM jsonb_array_elements(COALESCE(p->'members','[]'::jsonb)) LOOP
    INSERT INTO public.team_members(team_id, nickname, role, mmr, position)
    VALUES (_id, COALESCE(_m->>'nickname','Игрок'), COALESCE(_m->>'role',''), (_m->>'mmr')::int, _pos);
    _pos := _pos + 1;
  END LOOP;
  PERFORM public.write_audit('import_legacy_team', 'teams', _id::text, NULL, NULL, NULL, p - 'logo_url');
  RETURN _id;
END $$;

-- payload: legacy_id, title, starts_at, finished bool, team_ids uuid[], placements [{team_id,place}], groups, group_matches, bracket
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
      'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('nickname', m.nickname, 'role', m.role, 'mmr', m.mmr) ORDER BY m.position) FROM public.team_members m WHERE m.team_id = t.id), '[]'::jsonb))
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

REVOKE EXECUTE ON FUNCTION public.generate_structure(uuid, text, jsonb, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_draft_tournament(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reacknowledge_regulation(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.import_legacy_team(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.import_legacy_tournament(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_structure(uuid, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_draft_tournament(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reacknowledge_regulation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_team(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_tournament(jsonb) TO authenticated;