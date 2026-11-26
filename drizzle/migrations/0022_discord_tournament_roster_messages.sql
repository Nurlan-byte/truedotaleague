CREATE TABLE public.discord_roster_messages (
 tournament_id uuid PRIMARY KEY,
 message_id text,
 webhook_key text,
 team_ids uuid[] NOT NULL DEFAULT '{}',
 lock_token uuid,
 locked_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.discord_roster_messages TO service_role;
ALTER TABLE public.discord_roster_messages ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.claim_discord_roster(p_tournament_id uuid, p_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 INSERT INTO public.discord_roster_messages(tournament_id) VALUES(p_tournament_id) ON CONFLICT DO NOTHING;
 UPDATE public.discord_roster_messages SET lock_token=p_token, locked_until=now()+interval '2 minutes'
 WHERE tournament_id=p_tournament_id AND (locked_until IS NULL OR locked_until<now());
 RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_discord_roster(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_discord_roster(uuid,uuid) TO service_role;