CREATE OR REPLACE FUNCTION public.update_my_profile(p_nickname text, p_bio text, p_role_position text, p_profile_url text, p_team_name text, p_team_role text, p_looking_for_team boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF char_length(btrim(coalesce(p_nickname,''))) NOT BETWEEN 2 AND 32 THEN RAISE EXCEPTION 'invalid_nickname'; END IF;
  IF char_length(coalesce(p_bio,'')) > 500 THEN RAISE EXCEPTION 'invalid_bio'; END IF;
  IF coalesce(p_profile_url,'') <> '' AND p_profile_url !~* '^https?://\S+$' THEN RAISE EXCEPTION 'invalid_url'; END IF;
  UPDATE public.profiles SET
    nickname = btrim(p_nickname),
    bio = btrim(coalesce(p_bio,'')),
    role_position = left(coalesce(p_role_position,''), 40),
    profile_url = left(btrim(coalesce(p_profile_url,'')), 300),
    team_name = left(btrim(coalesce(p_team_name,'')), 40),
    team_role = left(btrim(coalesce(p_team_role,'')), 40),
    looking_for_team = coalesce(p_looking_for_team, false),
    updated_at = now()
  WHERE id = uid;
END $$;

CREATE OR REPLACE FUNCTION public.set_my_avatar(p_avatar_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_avatar_url IS NOT NULL AND (char_length(p_avatar_url) > 200000 OR p_avatar_url !~ '^(data:image/(png|jpeg|webp);base64,|https://)') THEN
    RAISE EXCEPTION 'invalid_avatar';
  END IF;
  UPDATE public.profiles SET avatar_url = p_avatar_url, updated_at = now() WHERE id = auth.uid();
END $$;

REVOKE ALL ON FUNCTION public.update_my_profile(text,text,text,text,text,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_my_avatar(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text,text,text,text,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_avatar(text) TO authenticated;