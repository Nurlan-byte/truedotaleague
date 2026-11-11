ALTER TYPE public.tournament_format ADD VALUE IF NOT EXISTS 'double_elim';

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS bracket text NOT NULL DEFAULT 'upper' CHECK (bracket IN ('upper','lower','grand'));
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS loser_next_match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS loser_next_match_slot char(1) CHECK (loser_next_match_slot IN ('a','b'));

DROP INDEX IF EXISTS public.matches_playoff_slot;
CREATE UNIQUE INDEX matches_playoff_slot ON public.matches(tournament_id, bracket, round, slot) WHERE stage = 'playoff';

CREATE OR REPLACE FUNCTION public.propagate_match_winner(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cur public.matches; _next public.matches; _loser uuid;
BEGIN
  SELECT * INTO _cur FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF _cur.next_match_id IS NOT NULL THEN
    SELECT * INTO _next FROM public.matches WHERE id = _cur.next_match_id FOR UPDATE;
    IF _cur.next_match_slot = 'a' AND _next.team_a_id IS DISTINCT FROM _cur.winner_id THEN
      UPDATE public.matches SET team_a_id = _cur.winner_id, score_a = NULL, score_b = NULL, winner_id = NULL WHERE id = _next.id;
      PERFORM public.propagate_match_winner(_next.id);
    ELSIF _cur.next_match_slot = 'b' AND _next.team_b_id IS DISTINCT FROM _cur.winner_id THEN
      UPDATE public.matches SET team_b_id = _cur.winner_id, score_a = NULL, score_b = NULL, winner_id = NULL WHERE id = _next.id;
      PERFORM public.propagate_match_winner(_next.id);
    END IF;
  END IF;
  IF _cur.loser_next_match_id IS NOT NULL THEN
    _loser := CASE WHEN _cur.winner_id IS NULL THEN NULL
                   WHEN _cur.winner_id = _cur.team_a_id THEN _cur.team_b_id ELSE _cur.team_a_id END;
    SELECT * INTO _next FROM public.matches WHERE id = _cur.loser_next_match_id FOR UPDATE;
    IF _cur.loser_next_match_slot = 'a' AND _next.team_a_id IS DISTINCT FROM _loser THEN
      UPDATE public.matches SET team_a_id = _loser, score_a = NULL, score_b = NULL, winner_id = NULL WHERE id = _next.id;
      PERFORM public.propagate_match_winner(_next.id);
    ELSIF _cur.loser_next_match_slot = 'b' AND _next.team_b_id IS DISTINCT FROM _loser THEN
      UPDATE public.matches SET team_b_id = _loser, score_a = NULL, score_b = NULL, winner_id = NULL WHERE id = _next.id;
      PERFORM public.propagate_match_winner(_next.id);
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_match_score(p_match_id uuid, p_score_a int, p_score_b int, p_reason text DEFAULT NULL)
RETURNS public.matches LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _m public.matches; _before jsonb; _winner uuid; _next public.matches;
BEGIN
  SELECT * INTO _m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF NOT public.is_staff_for(_uid, _m.tournament_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF (p_score_a IS NULL) <> (p_score_b IS NULL) OR p_score_a < 0 OR p_score_b < 0 THEN RAISE EXCEPTION 'invalid_score'; END IF;
  IF (_m.score_a IS NOT NULL OR _m.score_b IS NOT NULL) AND (p_reason IS NULL OR length(btrim(p_reason)) = 0) THEN
    RAISE EXCEPTION 'reason_required'; END IF;
  IF p_score_a IS NOT NULL AND p_score_a <> p_score_b THEN
    _winner := CASE WHEN p_score_a > p_score_b THEN _m.team_a_id ELSE _m.team_b_id END;
  ELSIF _m.stage = 'playoff' AND _m.bracket = 'upper' AND _m.loser_next_match_id IS NULL AND _m.team_a_id IS NOT NULL AND _m.team_b_id IS NULL THEN _winner := _m.team_a_id;
  ELSIF _m.stage = 'playoff' AND _m.bracket = 'upper' AND _m.loser_next_match_id IS NULL AND _m.team_b_id IS NOT NULL AND _m.team_a_id IS NULL THEN _winner := _m.team_b_id;
  END IF;
  IF _winner IS DISTINCT FROM _m.winner_id AND (_m.next_match_id IS NOT NULL OR _m.loser_next_match_id IS NOT NULL) AND NOT public.is_admin(_uid) THEN
    IF EXISTS (SELECT 1 FROM public.matches WHERE id IN (_m.next_match_id, _m.loser_next_match_id) AND (score_a IS NOT NULL OR score_b IS NOT NULL)) THEN
      RAISE EXCEPTION 'admin_required: dependent matches already have results'; END IF;
  END IF;
  _before := to_jsonb(_m);
  UPDATE public.matches SET score_a = p_score_a, score_b = p_score_b, winner_id = _winner WHERE id = p_match_id RETURNING * INTO _m;
  PERFORM public.propagate_match_winner(p_match_id);
  PERFORM public.write_audit('set_match_score', 'matches', p_match_id::text, _m.tournament_id, p_reason, _before, to_jsonb(_m));
  RETURN _m;
END $$;

CREATE OR REPLACE FUNCTION public.generate_structure(p_tournament_id uuid, p_kind text, p_payload jsonb, p_confirm_reset boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.tournaments; _stage public.match_stage; _has_scores boolean; _before jsonb; _g jsonb; _m jsonb; _gid uuid; _gids uuid[] := '{}'; _i int := 0; _n int := 0; _a uuid; _b uuid; _sa int; _sb int; _w uuid; _r record;
  _double boolean := COALESCE((p_payload->>'double')::boolean, false); _keys jsonb := '{}'::jsonb; _newid uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_kind NOT IN ('groups','bracket') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
  SELECT * INTO _t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament_not_found'; END IF;
  IF _t.status IN ('finished','cancelled') AND NOT COALESCE((p_payload->>'import')::boolean, false) THEN RAISE EXCEPTION 'tournament_locked'; END IF;
  _stage := CASE WHEN p_kind = 'groups' THEN 'group'::public.match_stage ELSE 'playoff'::public.match_stage END;
  SELECT EXISTS (SELECT 1 FROM public.matches WHERE tournament_id = p_tournament_id AND stage = _stage AND (score_a IS NOT NULL OR score_b IS NOT NULL)) INTO _has_scores;
  IF _has_scores AND NOT p_confirm_reset THEN RAISE EXCEPTION 'reset_confirmation_required'; END IF;
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
    UPDATE public.matches SET next_match_id = NULL, loser_next_match_id = NULL WHERE tournament_id = p_tournament_id AND stage = 'playoff';
    DELETE FROM public.matches WHERE tournament_id = p_tournament_id AND stage = 'playoff';
    FOR _m IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'matches','[]'::jsonb)) LOOP
      _sa := (_m->>'score_a')::int; _sb := (_m->>'score_b')::int;
      _a := (_m->>'team_a_id')::uuid; _b := (_m->>'team_b_id')::uuid;
      _w := CASE WHEN NOT _double AND _a IS NOT NULL AND _b IS NULL AND (_m->>'round')::int = 1 THEN _a
                 WHEN NOT _double AND _b IS NOT NULL AND _a IS NULL AND (_m->>'round')::int = 1 THEN _b
                 WHEN _sa IS NOT NULL AND _sb IS NOT NULL AND _sa <> _sb THEN CASE WHEN _sa > _sb THEN _a ELSE _b END END;
      INSERT INTO public.matches(tournament_id, stage, bracket, round, slot, team_a_id, team_b_id, score_a, score_b, winner_id, scheduled_at)
      VALUES (p_tournament_id, 'playoff', CASE WHEN _double THEN COALESCE(_m->>'bracket','upper') ELSE 'upper' END,
        (_m->>'round')::int, (_m->>'slot')::int, _a, _b, _sa, _sb, _w, (_m->>'scheduled_at')::timestamptz)
      RETURNING id INTO _newid;
      IF _double THEN _keys := _keys || jsonb_build_object(_m->>'key', _newid); END IF;
      _n := _n + 1;
    END LOOP;
    IF _double THEN
      FOR _m IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'matches','[]'::jsonb)) LOOP
        UPDATE public.matches SET
          next_match_id = (_keys->>(_m->>'next_key'))::uuid,
          next_match_slot = CASE WHEN _m ? 'next_key' THEN _m->>'next_slot' END,
          loser_next_match_id = (_keys->>(_m->>'loser_key'))::uuid,
          loser_next_match_slot = CASE WHEN _m ? 'loser_key' THEN _m->>'loser_slot' END
        WHERE id = (_keys->>(_m->>'key'))::uuid;
      END LOOP;
    ELSE
      UPDATE public.matches m SET next_match_id = nx.id, next_match_slot = CASE WHEN m.slot % 2 = 0 THEN 'a' ELSE 'b' END
        FROM public.matches nx
        WHERE m.tournament_id = p_tournament_id AND m.stage = 'playoff' AND nx.tournament_id = p_tournament_id AND nx.stage = 'playoff'
          AND nx.round = m.round + 1 AND nx.slot = m.slot / 2;
    END IF;
    FOR _r IN SELECT id FROM public.matches WHERE tournament_id = p_tournament_id AND stage = 'playoff' AND winner_id IS NOT NULL ORDER BY bracket DESC, round LOOP
      PERFORM public.propagate_match_winner(_r.id);
    END LOOP;
  END IF;
  PERFORM public.write_audit('generate_' || p_kind, 'tournaments', p_tournament_id::text, p_tournament_id,
    CASE WHEN _has_scores THEN 'reset with results' END, _before, jsonb_build_object('matches_created', _n));
  RETURN _n;
END $$;