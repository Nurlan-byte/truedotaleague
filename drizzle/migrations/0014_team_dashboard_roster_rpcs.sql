CREATE OR REPLACE FUNCTION public.rename_team(p_team_id uuid, p_name text, p_tag text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE u uuid:=public.team_actor();
BEGIN
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 100 OR p_tag IS NULL OR length(btrim(p_tag)) NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'invalid_team_name_or_tag'; END IF;
  PERFORM public.lock_team_write(p_team_id);
  IF NOT public.is_team_owner(u,p_team_id) THEN RAISE EXCEPTION 'owner_required'; END IF;
  INSERT INTO public.team_tag_guard(tag,revision) VALUES(lower(btrim(p_tag)),1) ON CONFLICT(tag) DO UPDATE SET revision=team_tag_guard.revision+1;
  IF EXISTS(SELECT 1 FROM public.teams WHERE id<>p_team_id AND lower(btrim(tag))=lower(btrim(p_tag))) THEN RAISE EXCEPTION 'teams_unique_tag'; END IF;
  UPDATE public.teams SET name=btrim(p_name), tag=btrim(p_tag) WHERE id=p_team_id;
  PERFORM public.write_audit('rename_team','teams',p_team_id::text,NULL,NULL,NULL,jsonb_build_object('name',btrim(p_name),'tag',btrim(p_tag)));
END $$;

-- Positions 0-4 = main five, 5-6 = bench. Moving onto an occupied slot swaps the two players.
CREATE OR REPLACE FUNCTION public.set_member_slot(p_team_id uuid, p_user_id uuid, p_position integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE u uuid:=public.team_actor(); cur int; other uuid;
BEGIN
  IF p_position IS NULL OR p_position NOT BETWEEN 0 AND 6 THEN RAISE EXCEPTION 'invalid_position'; END IF;
  PERFORM public.lock_team_write(p_team_id);
  IF NOT public.is_team_owner(u,p_team_id) THEN RAISE EXCEPTION 'owner_required'; END IF;
  SELECT position INTO cur FROM public.team_members WHERE team_id=p_team_id AND profile_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_in_team'; END IF;
  IF cur=p_position THEN RETURN; END IF;
  SELECT id INTO other FROM public.team_members WHERE team_id=p_team_id AND position=p_position AND profile_id IS DISTINCT FROM p_user_id LIMIT 1 FOR UPDATE;
  UPDATE public.team_members SET position=-1 WHERE team_id=p_team_id AND profile_id=p_user_id;
  IF other IS NOT NULL THEN UPDATE public.team_members SET position=cur WHERE id=other; END IF;
  UPDATE public.team_members SET position=p_position WHERE team_id=p_team_id AND profile_id=p_user_id;
  IF (SELECT count(*) FROM public.team_members WHERE team_id=p_team_id AND position BETWEEN 0 AND 4)>5
     OR (SELECT count(*) FROM public.team_members WHERE team_id=p_team_id AND position BETWEEN 5 AND 6)>2 THEN
    RAISE EXCEPTION 'roster_slots_full'; END IF;
  PERFORM public.write_audit('set_member_slot','team_members',p_team_id::text,NULL,NULL,jsonb_build_object('user',p_user_id,'from',cur),jsonb_build_object('to',p_position));
END $$;

CREATE OR REPLACE FUNCTION public.transfer_team_owner(p_team_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE u uuid:=public.team_actor();
BEGIN
  PERFORM public.lock_team_write(p_team_id);
  IF NOT public.is_team_owner(u,p_team_id) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF p_user_id=u THEN RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.team_members WHERE team_id=p_team_id AND profile_id=p_user_id) THEN RAISE EXCEPTION 'not_in_team'; END IF;
  UPDATE public.teams SET owner_id=p_user_id WHERE id=p_team_id;
  PERFORM public.write_audit('transfer_team_owner','teams',p_team_id::text,NULL,NULL,jsonb_build_object('owner',u),jsonb_build_object('owner',p_user_id));
END $$;

REVOKE ALL ON FUNCTION public.rename_team(uuid,text,text), public.set_member_slot(uuid,uuid,integer), public.transfer_team_owner(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_team(uuid,text,text), public.set_member_slot(uuid,uuid,integer), public.transfer_team_owner(uuid,uuid) TO authenticated;