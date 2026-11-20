DROP POLICY IF EXISTS "Public profile fields are viewable by everyone" ON public.profiles;
CREATE POLICY "Guests can view profiles of rostered players" ON public.profiles FOR SELECT TO anon
USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.profile_id = profiles.id));