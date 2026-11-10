ALTER TABLE public.profiles ADD COLUMN titles text[] NOT NULL DEFAULT '{}';
GRANT SELECT (titles) ON public.profiles TO authenticated;