CREATE OR REPLACE FUNCTION public.admin_delete_team(p_team_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin_required'; END IF;
  SELECT to_jsonb(t) INTO v_before FROM public.teams t WHERE id = p_team_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'team_not_found'; END IF;
  UPDATE public.matches SET team_a_id = NULL WHERE team_a_id = p_team_id;
  UPDATE public.matches SET team_b_id = NULL WHERE team_b_id = p_team_id;
  UPDATE public.matches SET winner_id = NULL WHERE winner_id = p_team_id;
  UPDATE public.tournaments SET winner_team_id = NULL WHERE winner_team_id = p_team_id;
  DELETE FROM public.points_ledger WHERE team_id = p_team_id;
  DELETE FROM public.placements WHERE team_id = p_team_id;
  DELETE FROM public.tournament_participants WHERE team_id = p_team_id;
  DELETE FROM public.applications WHERE team_id = p_team_id;
  DELETE FROM public.team_invites WHERE team_id = p_team_id;
  DELETE FROM public.team_invite_links WHERE team_id = p_team_id;
  DELETE FROM public.team_captains WHERE team_id = p_team_id;
  DELETE FROM public.team_members WHERE team_id = p_team_id;
  DELETE FROM public.teams WHERE id = p_team_id;
  PERFORM public.write_audit('delete_team', 'team', p_team_id::text, NULL, NULL, v_before, NULL);
END $$;
REVOKE ALL ON FUNCTION public.admin_delete_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_team(uuid) TO authenticated;