-- Additive review state. Existing profile values/roles are not changed or backfilled.
-- A missing verification row means unverified; OAuth metadata is never trusted.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.profile_verifications (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified','pending','verified')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  CHECK(status <> 'pending' OR submitted_at IS NOT NULL),
  CHECK(status <> 'verified' OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL))
);
ALTER TABLE public.profile_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_verifications FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT(profile_id,status) ON public.profile_verifications TO anon,authenticated;
CREATE POLICY "verification public status" ON public.profile_verifications FOR SELECT USING(true);

CREATE FUNCTION public.initialize_profile_verification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.profile_verifications(profile_id,status) VALUES(NEW.id,'unverified')
    ON CONFLICT(profile_id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.initialize_profile_verification() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER initialize_profile_verification AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.initialize_profile_verification();

-- Mandatory fields can only change together with the review submission.
-- Keep the existing independent avatar uploader usable. Historical manual team
-- fields remain stored, but clients cannot write them or Discord identities.
REVOKE INSERT,UPDATE,DELETE ON public.profiles FROM PUBLIC,anon,authenticated;
DO $$ DECLARE cols text; BEGIN
  SELECT string_agg(quote_ident(column_name),',') INTO cols FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles';
  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s) ON public.profiles FROM PUBLIC,anon,authenticated',cols,cols);
  IF has_any_column_privilege('authenticated','public.profiles','INSERT') OR
     has_any_column_privilege('authenticated','public.profiles','UPDATE') OR
     has_table_privilege('authenticated','public.profiles','DELETE') THEN
    RAISE EXCEPTION 'unexpected_inherited_profile_write_privilege';
  END IF;
END $$;
GRANT UPDATE(avatar_url) ON public.profiles TO authenticated;

CREATE FUNCTION public.get_my_profile_verification() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.profile_verifications;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v FROM public.profile_verifications WHERE profile_id=auth.uid();
  RETURN jsonb_build_object('status',coalesce(v.status,'unverified'),
    'submitted_at',v.submitted_at,'reviewed_at',v.reviewed_at);
END $$;

CREATE FUNCTION public.save_profile_for_review(
  p_nickname text,p_mmr integer,p_profile_url text,
  p_role_position text DEFAULT '',p_bio text DEFAULT '',p_looking_for_team boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); p public.profiles; v public.profile_verifications;
  next_status text; submitted timestamptz;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_nickname IS NULL OR length(btrim(p_nickname)) NOT BETWEEN 2 AND 32 THEN
    RAISE EXCEPTION 'invalid_nickname'; END IF;
  IF p_mmr IS NULL OR p_mmr NOT BETWEEN 0 AND 15000 THEN RAISE EXCEPTION 'invalid_mmr'; END IF;
  IF p_profile_url IS NULL OR length(btrim(p_profile_url))>2048
      OR btrim(p_profile_url) !~* '^https?://[^[:space:]/?#]+[^[:space:]]*$' THEN
    RAISE EXCEPTION 'invalid_profile_url'; END IF;
  IF length(coalesce(p_bio,''))>500 OR length(coalesce(p_role_position,''))>100 THEN
    RAISE EXCEPTION 'invalid_profile_details'; END IF;
  -- Shared lock order with moderation: profile first, review second.
  SELECT * INTO p FROM public.profiles WHERE id=u FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_required'; END IF;
  SELECT * INTO v FROM public.profile_verifications WHERE profile_id=u FOR UPDATE;
  next_status:=CASE WHEN v.status='verified' AND p.nickname=btrim(p_nickname)
    AND p.mmr=p_mmr AND p.profile_url=btrim(p_profile_url) THEN 'verified' ELSE 'pending' END;
  submitted:=CASE WHEN next_status='verified' THEN v.submitted_at ELSE clock_timestamp() END;
  UPDATE public.profiles SET nickname=btrim(p_nickname),mmr=p_mmr,profile_url=btrim(p_profile_url),
    role_position=btrim(coalesce(p_role_position,'')),bio=btrim(coalesce(p_bio,'')),
    looking_for_team=coalesce(p_looking_for_team,false) WHERE id=u;
  INSERT INTO public.profile_verifications(profile_id,status,submitted_at,reviewed_at,reviewed_by)
    VALUES(u,next_status,submitted,CASE WHEN next_status='verified' THEN v.reviewed_at END,
      CASE WHEN next_status='verified' THEN v.reviewed_by END)
    ON CONFLICT(profile_id) DO UPDATE SET status=excluded.status,submitted_at=excluded.submitted_at,
      reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by;
  PERFORM public.write_audit('submit_profile_review','profiles',u::text,NULL,NULL,
    jsonb_build_object('status',coalesce(v.status,'unverified')),
    jsonb_build_object('status',next_status,'nickname',btrim(p_nickname),'mmr',p_mmr,
      'profile_url',btrim(p_profile_url),'submitted_at',submitted));
  RETURN jsonb_build_object('status',next_status,'submitted_at',submitted);
END $$;

CREATE FUNCTION public.list_profile_reviews() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator')) THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('profile_id',p.id,'nickname',p.nickname,
    'mmr',p.mmr,'profile_url',p.profile_url,'role_position',p.role_position,'bio',p.bio,
    'submitted_at',v.submitted_at) ORDER BY v.submitted_at)
    FROM public.profile_verifications v JOIN public.profiles p ON p.id=v.profile_id
    WHERE v.status='pending'),'[]'::jsonb);
END $$;

CREATE FUNCTION public.decide_profile_review(p_profile_id uuid,p_submitted_at timestamptz,p_approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); v public.profile_verifications; p public.profiles;
BEGIN
  IF u IS NULL OR NOT (public.has_role(u,'admin') OR public.has_role(u,'moderator')) THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  IF u=p_profile_id THEN RAISE EXCEPTION 'cannot_review_own_profile'; END IF;
  IF p_approve IS NULL THEN RAISE EXCEPTION 'invalid_review_decision'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id=p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_required'; END IF;
  SELECT * INTO v FROM public.profile_verifications WHERE profile_id=p_profile_id FOR UPDATE;
  IF NOT FOUND OR v.status<>'pending' OR p_submitted_at IS NULL
      OR v.submitted_at IS DISTINCT FROM p_submitted_at THEN RAISE EXCEPTION 'stale_profile_review'; END IF;
  UPDATE public.profile_verifications SET status=CASE WHEN p_approve THEN 'verified' ELSE 'unverified' END,
    reviewed_at=clock_timestamp(),reviewed_by=u WHERE profile_id=p_profile_id;
  PERFORM public.write_audit(CASE WHEN p_approve THEN 'approve_profile' ELSE 'reject_profile' END,
    'profiles',p_profile_id::text,NULL,NULL,to_jsonb(v),
    jsonb_build_object('status',CASE WHEN p_approve THEN 'verified' ELSE 'unverified' END,
      'nickname',p.nickname,'mmr',p.mmr,'profile_url',p.profile_url,'submitted_at',v.submitted_at));
END $$;

REVOKE ALL ON FUNCTION public.get_my_profile_verification(),
  public.save_profile_for_review(text,integer,text,text,text,boolean),public.list_profile_reviews(),
  public.decide_profile_review(uuid,timestamptz,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_profile_verification(),
  public.save_profile_for_review(text,integer,text,text,text,boolean),public.list_profile_reviews(),
  public.decide_profile_review(uuid,timestamptz,boolean) TO authenticated;
COMMIT;
