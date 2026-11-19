CREATE TABLE public.profile_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  caption text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.profile_photos(profile_id, created_at DESC);
GRANT SELECT ON public.profile_photos TO anon, authenticated;
GRANT ALL ON public.profile_photos TO service_role;
ALTER TABLE public.profile_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profile photos are public" ON public.profile_photos FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.add_profile_photo(p_profile_id uuid, p_image_url text, p_caption text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;
  IF p_image_url IS NULL OR p_image_url NOT LIKE 'data:image/%' OR length(p_image_url) > 3000000 THEN
    RAISE EXCEPTION 'Некорректное изображение';
  END IF;
  INSERT INTO public.profile_photos(profile_id, image_url, caption, created_by)
  VALUES (p_profile_id, p_image_url, left(coalesce(p_caption,''), 300), auth.uid()) RETURNING id INTO v_id;
  PERFORM public.write_audit('profile_photo.add','profile_photos',v_id::text,NULL,NULL,NULL,jsonb_build_object('profile_id',p_profile_id));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_profile_photo(p_photo_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile uuid;
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;
  DELETE FROM public.profile_photos WHERE id = p_photo_id RETURNING profile_id INTO v_profile;
  PERFORM public.write_audit('profile_photo.delete','profile_photos',p_photo_id::text,NULL,NULL,jsonb_build_object('profile_id',v_profile),NULL);
END $$;

REVOKE ALL ON FUNCTION public.add_profile_photo(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_profile_photo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_profile_photo(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_profile_photo(uuid) TO authenticated;