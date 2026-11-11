CREATE TABLE public.discord_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  tournament_id uuid,
  message_id text NOT NULL,
  webhook text NOT NULL DEFAULT 'amateur',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.discord_posts TO service_role;
ALTER TABLE public.discord_posts ENABLE ROW LEVEL SECURITY;
CREATE INDEX discord_posts_team_idx ON public.discord_posts(team_id);