CREATE OR REPLACE FUNCTION public.initialize_freedom_season(p_image_url text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.tournaments;
BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('tdl-freedom-season-2'));
 SELECT * INTO t FROM public.tournaments WHERE legacy_id='tdl-freedom-season-2' OR title='TDL FREEDOM LEAGUE #2' ORDER BY created_at LIMIT 1;
 IF FOUND THEN RETURN t.id; END IF;
 t:=public.upsert_tournament(jsonb_build_object('title','TDL FREEDOM LEAGUE #2','legacy_id','tdl-freedom-season-2','image_url',p_image_url,'starts_at','2026-12-04T07:00:00Z','registration_closes_at','2026-12-04T07:00:00Z','mode','online','team_limit',16,'format','round_robin','prize_tba',false,'prize_amount',100000,'prize_currency','KZT','description','Новый тестовый сезон: 4–27 декабря 2026. До 16 команд, 15 туров и 120 Bo2 при полном составе. Каждый с каждым, без плей-офф. Победа 2:0 — 3 очка, ничья 1:1 — 1, поражение 0:2 — 0. Матчи по субботам и воскресеньям, 12:00–16:00 (UTC+5). Без ограничений MMR. Взнос: 50 000 ₸ с команды, возможны 4 платежа по 12 500 ₸. Стартовый призовой фонд: 100 000 ₸. При 8 командах — 350 000 ₸, 12 — 525 000 ₸, 16 — 700 000 ₸. При 16 командах: 1 место 400 000 ₸, 2 место 200 000 ₸, 3 место 100 000 ₸. Стримы с комментатором.'));
 PERFORM public.change_tournament_status(t.id,'announced');
 PERFORM public.change_tournament_status(t.id,'registration_open');
 RETURN t.id;
END $$;
REVOKE ALL ON FUNCTION public.initialize_freedom_season(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.initialize_freedom_season(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_freedom_calendar(p_tournament_id uuid,p_matches jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.tournaments; ids uuid[]; n int; rounds int; total int;
BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO t FROM public.tournaments WHERE id=p_tournament_id FOR UPDATE;
 IF NOT FOUND OR t.legacy_id IS DISTINCT FROM 'tdl-freedom-season-2' OR t.format<>'round_robin' THEN RAISE EXCEPTION 'invalid_freedom_season'; END IF;
 IF t.status NOT IN ('registration_closed','live') THEN RAISE EXCEPTION 'Закройте регистрацию перед созданием календаря'; END IF;
 IF EXISTS(SELECT 1 FROM public.matches WHERE tournament_id=t.id) THEN RAISE EXCEPTION 'Календарь уже создан'; END IF;
 SELECT array_agg(team_id ORDER BY team_id),count(*) INTO ids,n FROM public.tournament_participants WHERE tournament_id=t.id;
 IF n<2 OR n>16 THEN RAISE EXCEPTION 'Требуется от 2 до 16 команд'; END IF;
 rounds:=CASE WHEN n%2=0 THEN n-1 ELSE n END;
 IF jsonb_typeof(p_matches) IS DISTINCT FROM 'array' OR jsonb_array_length(p_matches)<>n*(n-1)/2 THEN RAISE EXCEPTION 'invalid_calendar'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_matches) m WHERE (m->>'team_a_id') IS NULL OR (m->>'team_b_id') IS NULL OR (m->>'round') IS NULL OR NOT ((m->>'team_a_id')::uuid=ANY(ids)) OR NOT ((m->>'team_b_id')::uuid=ANY(ids)) OR m->>'team_a_id'=m->>'team_b_id' OR (m->>'round')::int NOT BETWEEN 1 AND rounds) THEN RAISE EXCEPTION 'invalid_calendar'; END IF;
 IF (SELECT count(DISTINCT least(m->>'team_a_id',m->>'team_b_id')||':'||greatest(m->>'team_a_id',m->>'team_b_id')) FROM jsonb_array_elements(p_matches) m)<>n*(n-1)/2 THEN RAISE EXCEPTION 'duplicate_pair'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_matches) m CROSS JOIN LATERAL (VALUES(m->>'team_a_id'),(m->>'team_b_id')) v(team) GROUP BY m->>'round',v.team HAVING count(*)>1) THEN RAISE EXCEPTION 'team_twice_in_round'; END IF;
 SELECT public.generate_structure(t.id,'groups',jsonb_build_object('groups',jsonb_build_array(jsonb_build_object('name','Freedom League','team_ids',to_jsonb(ids))),'matches',(SELECT jsonb_agg(m||jsonb_build_object('group_idx',0)) FROM jsonb_array_elements(p_matches) m)),false) INTO total;
 UPDATE public.matches mm SET round=(e.m->>'round')::int FROM jsonb_array_elements(p_matches) WITH ORDINALITY e(m,idx) WHERE mm.tournament_id=t.id AND mm.stage='group' AND mm.slot=e.idx-1;
 PERFORM public.write_audit('generate_freedom_calendar','tournaments',t.id::text,t.id,NULL,NULL,jsonb_build_object('rounds',rounds,'matches',total));
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.generate_freedom_calendar(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_freedom_calendar(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_freedom_match() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE local_time timestamp;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.tournaments WHERE id=NEW.tournament_id AND legacy_id='tdl-freedom-season-2') THEN RETURN NEW; END IF;
 IF NEW.stage<>'group' THEN RAISE EXCEPTION 'Freedom League проводится без плей-офф'; END IF;
 IF (NEW.score_a IS NULL)<>(NEW.score_b IS NULL) OR (NEW.score_a IS NOT NULL AND (NEW.score_a NOT BETWEEN 0 AND 2 OR NEW.score_b NOT BETWEEN 0 AND 2 OR NEW.score_a+NEW.score_b<>2)) THEN RAISE EXCEPTION 'Bo2: допустимы только 2:0, 1:1 и 0:2'; END IF;
 IF NEW.scheduled_at IS NOT NULL THEN
 local_time:=NEW.scheduled_at AT TIME ZONE 'Asia/Qyzylorda';
 IF local_time::date NOT BETWEEN DATE '2026-12-04' AND DATE '2026-12-27' OR extract(isodow FROM local_time) NOT IN (6,7) OR local_time::time < TIME '12:00' OR local_time::time >= TIME '16:00' THEN RAISE EXCEPTION 'Матчи лиги: выходные 4–27 декабря, начало с 12:00 до 16:00 (UTC+5)'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_freedom_match BEFORE INSERT OR UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.validate_freedom_match();