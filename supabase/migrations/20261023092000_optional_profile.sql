-- Remove the review workflow without rewriting historical verification data or roles.
-- The old RPC signature remains usable by a cached client during UI rollout.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.save_profile_for_review(
  p_nickname text,p_mmr integer,p_profile_url text,
  p_role_position text DEFAULT '',p_bio text DEFAULT '',p_looking_for_team boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); p public.profiles; v public.profile_verifications;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_nickname IS NULL OR length(btrim(p_nickname)) NOT BETWEEN 2 AND 32 THEN
    RAISE EXCEPTION 'invalid_nickname'; END IF;
  IF p_mmr IS NOT NULL AND p_mmr NOT BETWEEN 0 AND 15000 THEN RAISE EXCEPTION 'invalid_mmr'; END IF;
  IF length(btrim(coalesce(p_profile_url,'')))>2048 OR
    (btrim(coalesce(p_profile_url,''))<>'' AND
      btrim(p_profile_url) !~* '^https?://[^[:space:]/?#]+[^[:space:]]*$') THEN
    RAISE EXCEPTION 'invalid_profile_url'; END IF;
  IF length(coalesce(p_bio,''))>500 OR length(coalesce(p_role_position,''))>100 THEN
    RAISE EXCEPTION 'invalid_profile_details'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id=u FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_required'; END IF;
  UPDATE public.profiles SET nickname=btrim(p_nickname),mmr=p_mmr,
    profile_url=btrim(coalesce(p_profile_url,'')),role_position=btrim(coalesce(p_role_position,'')),
    bio=btrim(coalesce(p_bio,'')),looking_for_team=coalesce(p_looking_for_team,false) WHERE id=u;
  PERFORM public.write_audit('save_profile','profiles',u::text,NULL,NULL,
    jsonb_build_object('nickname',p.nickname,'mmr',p.mmr,'profile_url',p.profile_url),
    jsonb_build_object('nickname',btrim(p_nickname),'mmr',p_mmr,'profile_url',btrim(coalesce(p_profile_url,''))));
  -- Compatibility fields only: no INSERT/UPDATE of the archived verification state.
  SELECT * INTO v FROM public.profile_verifications WHERE profile_id=u;
  RETURN jsonb_build_object('saved',true,'status',coalesce(v.status,'unverified'),'submitted_at',v.submitted_at);
END $$;

CREATE OR REPLACE FUNCTION public.list_profile_reviews() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator')) THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  RETURN '[]'::jsonb;
END $$;

CREATE OR REPLACE FUNCTION public.decide_profile_review(p_profile_id uuid,p_submitted_at timestamptz,p_approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator')) THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  RAISE EXCEPTION 'profile_review_disabled';
END $$;

-- Keep self-profile and identity protection: no new table grants or role grants.
REVOKE ALL ON FUNCTION public.save_profile_for_review(text,integer,text,text,text,boolean),
  public.list_profile_reviews(),public.decide_profile_review(uuid,timestamptz,boolean)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_profile_for_review(text,integer,text,text,text,boolean),
  public.list_profile_reviews(),public.decide_profile_review(uuid,timestamptz,boolean) TO authenticated;
COMMIT;
