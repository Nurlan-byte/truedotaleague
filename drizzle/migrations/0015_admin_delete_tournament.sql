CREATE OR REPLACE FUNCTION public.admin_delete_tournament(p_id uuid, p_expected_version integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.tournaments;
BEGIN
  IF NOT COALESCE(public.is_admin(auth.uid()), false) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO _t FROM public.tournaments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament_not_found'; END IF;
  IF p_expected_version IS NULL OR _t.version <> p_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;
  UPDATE public.points_ledger SET reverses_entry_id = NULL WHERE reverses_entry_id IN (SELECT id FROM public.points_ledger WHERE tournament_id = p_id);
  DELETE FROM public.points_ledger WHERE tournament_id = p_id;
  DELETE FROM public.tournaments WHERE id = p_id;
  PERFORM public.write_audit('admin_delete_tournament', 'tournaments', p_id::text, NULL, 'Полное удаление турнира', to_jsonb(_t), NULL);
END $$;
REVOKE ALL ON FUNCTION public.admin_delete_tournament(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_tournament(uuid, integer) TO authenticated;
COMMENT ON FUNCTION public.admin_delete_tournament(uuid, integer) IS 'Admin-only hard deletion in any status; cascades tournament data, removes its points, preserves teams/profiles and audit history. Discord post records stay available for webhook cleanup.';