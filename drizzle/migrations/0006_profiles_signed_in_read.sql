DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
REVOKE SELECT ON public.profiles FROM anon;
CREATE POLICY "Profiles are viewable by signed-in users" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);