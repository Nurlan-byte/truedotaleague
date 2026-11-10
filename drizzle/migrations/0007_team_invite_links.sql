CREATE TABLE public.team_invite_links (
  team_id uuid PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.team_invite_links TO service_role;
ALTER TABLE public.team_invite_links ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_team_invite_link(p_team_id uuid, p_regenerate boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE u uuid := public.team_actor(); t text;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id=p_team_id AND owner_id=u) THEN RAISE EXCEPTION 'owner_required'; END IF;
  SELECT token INTO t FROM public.team_invite_links WHERE team_id=p_team_id;
  IF t IS NULL OR p_regenerate THEN
    t := encode(extensions.gen_random_bytes(18),'hex');
    INSERT INTO public.team_invite_links(team_id,token,created_by) VALUES(p_team_id,t,u)
      ON CONFLICT (team_id) DO UPDATE SET token=EXCLUDED.token, created_by=EXCLUDED.created_by, created_at=now();
    PERFORM public.write_audit('invite_link','team_invite_links',p_team_id::text,NULL,NULL,NULL,NULL);
  END IF;
  RETURN t;
END $$;

CREATE OR REPLACE FUNCTION public.preview_team_invite_link(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT jsonb_build_object('team_id',t.id,'name',t.name,'tag',t.tag,'logo_url',t.logo_url,
    'members',(SELECT count(*) FROM public.team_members m WHERE m.team_id=t.id))
  FROM public.team_invite_links l JOIN public.teams t ON t.id=l.team_id WHERE l.token=p_token;
$$;

CREATE OR REPLACE FUNCTION public.join_team_by_link(p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE u uuid := public.team_actor(); tid uuid; pos int;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT team_id INTO tid FROM public.team_invite_links WHERE token=p_token;
  IF tid IS NULL THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  PERFORM public.lock_team_user(u);
  PERFORM public.lock_team_write(tid);
  IF EXISTS(SELECT 1 FROM public.team_members WHERE profile_id=u) OR EXISTS(SELECT 1 FROM public.teams WHERE owner_id=u) OR EXISTS(SELECT 1 FROM public.team_captains WHERE user_id=u) THEN
    RAISE EXCEPTION 'already_in_team'; END IF;
  SELECT min(n) INTO pos FROM generate_series(0,6) n
    WHERE NOT EXISTS(SELECT 1 FROM public.team_members WHERE team_id=tid AND position=n);
  IF pos IS NULL THEN RAISE EXCEPTION 'team_full'; END IF;
  INSERT INTO public.team_members(team_id,profile_id,position,nickname) VALUES(tid,u,pos,'');
  UPDATE public.team_invites SET status='cancelled' WHERE invited_user_id=u AND status='pending';
  PERFORM public.write_audit('join_by_link','team_members',tid::text,NULL,NULL,NULL,NULL);
  RETURN tid;
END $$;

REVOKE ALL ON FUNCTION public.get_team_invite_link(uuid,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_team_by_link(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_invite_link(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_team_by_link(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_team_invite_link(text) TO anon, authenticated;