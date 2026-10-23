-- Additive one-use links. Existing teams, memberships and addressed invites are unchanged.
-- Deploy only after separate production approval. Requires the existing legacy team guards.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE TABLE public.team_invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  accepted_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  CHECK ((status='accepted' AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL)
      OR (status<>'accepted' AND accepted_by IS NULL AND accepted_at IS NULL))
);
CREATE INDEX team_invite_links_team_id_idx ON public.team_invite_links(team_id);
ALTER TABLE public.team_invite_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_invite_links FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.create_team_invite_link(p_team_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.team_actor(); raw_token text; link_id uuid;
BEGIN
  PERFORM public.lock_team_write(p_team_id);
  IF NOT public.is_team_owner(u,p_team_id) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF (SELECT count(*) FROM public.team_members WHERE team_id=p_team_id)>=7 THEN RAISE EXCEPTION 'team_full'; END IF;
  -- Core PostgreSQL CSPRNG UUIDs supply more than 256 bits of entropy; SHA256 gives a
  -- fixed-length URL-safe token. Neither this token nor its hash enters audit data.
  raw_token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  INSERT INTO public.team_invite_links(team_id,token_hash)
    VALUES(p_team_id,encode(sha256(convert_to(raw_token,'UTF8')),'hex')) RETURNING id INTO link_id;
  PERFORM public.write_audit('create_team_invite_link','team_invite_links',link_id::text,NULL,NULL,NULL,jsonb_build_object('team_id',p_team_id));
  RETURN jsonb_build_object('id',link_id,'token',raw_token,'status','pending');
END $$;

CREATE FUNCTION public.list_team_invite_links(p_team_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.is_team_owner(public.team_actor(),p_team_id) THEN RAISE EXCEPTION 'owner_required'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'created_at',created_at) ORDER BY created_at DESC,id),'[]'::jsonb)
    FROM public.team_invite_links WHERE team_id=p_team_id);
END $$;

CREATE FUNCTION public.preview_team_invite_link(p_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('status','unavailable'); END IF;
  SELECT jsonb_build_object('status',l.status,'team_id',t.id,'name',t.name,'tag',t.tag,'logo_url',t.logo_url)
    INTO result FROM public.team_invite_links l JOIN public.teams t ON t.id=l.team_id
    WHERE l.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  RETURN coalesce(result,jsonb_build_object('status','unavailable'));
END $$;

CREATE FUNCTION public.revoke_team_invite_link(p_link_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.team_actor(); link public.team_invite_links;
BEGIN
  SELECT * INTO link FROM public.team_invite_links WHERE id=p_link_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_link_unavailable'; END IF;
  PERFORM public.lock_team_write(link.team_id);
  SELECT * INTO link FROM public.team_invite_links WHERE id=p_link_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_link_unavailable'; END IF;
  IF NOT public.is_team_owner(u,link.team_id) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF link.status='accepted' THEN RAISE EXCEPTION 'invitation_link_used'; END IF;
  IF link.status='revoked' THEN RETURN; END IF;
  UPDATE public.team_invite_links SET status='revoked' WHERE id=p_link_id;
  PERFORM public.write_audit('revoke_team_invite_link','team_invite_links',p_link_id::text,NULL,NULL,NULL,jsonb_build_object('team_id',link.team_id));
END $$;

CREATE FUNCTION public.accept_team_invite_link(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.team_actor(); link public.team_invite_links; pos int;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invitation_link_unavailable'; END IF;
  SELECT * INTO link FROM public.team_invite_links WHERE token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_link_unavailable'; END IF;
  -- Same identity -> team -> invite order as addressed invitations. Revision writes
  -- also reject stale REPEATABLE READ/SERIALIZABLE transactions with SQLSTATE 40001.
  PERFORM public.lock_team_user(u);
  PERFORM public.lock_team_write(link.team_id);
  SELECT * INTO link FROM public.team_invite_links WHERE id=link.id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.teams WHERE id=link.team_id) THEN RAISE EXCEPTION 'invitation_link_unavailable'; END IF;
  IF link.status='accepted' THEN
    IF link.accepted_by=u THEN RETURN jsonb_build_object('team_id',link.team_id,'status','accepted','already_accepted',true); END IF;
    RAISE EXCEPTION 'invitation_link_used';
  END IF;
  IF link.status<>'pending' THEN RAISE EXCEPTION 'invitation_link_unavailable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u) THEN RAISE EXCEPTION 'profile_required'; END IF;
  IF EXISTS(SELECT 1 FROM public.team_members WHERE profile_id=u)
     OR EXISTS(SELECT 1 FROM public.teams WHERE owner_id=u)
     OR EXISTS(SELECT 1 FROM public.team_captains WHERE user_id=u) THEN RAISE EXCEPTION 'already_in_team'; END IF;
  IF (SELECT count(*) FROM public.team_members WHERE team_id=link.team_id)>=7 THEN RAISE EXCEPTION 'team_full'; END IF;
  SELECT min(n) INTO pos FROM generate_series(0,6) n
    WHERE NOT EXISTS(SELECT 1 FROM public.team_members WHERE team_id=link.team_id AND position=n);
  IF pos IS NULL THEN RAISE EXCEPTION 'team_full'; END IF;
  INSERT INTO public.team_members(team_id,profile_id,position,nickname) VALUES(link.team_id,u,pos,'');
  UPDATE public.team_invite_links SET status='accepted',accepted_by=u,accepted_at=now() WHERE id=link.id;
  PERFORM public.write_audit('accept_team_invite_link','team_invite_links',link.id::text,NULL,NULL,NULL,jsonb_build_object('team_id',link.team_id));
  RETURN jsonb_build_object('team_id',link.team_id,'status','accepted','already_accepted',false);
END $$;

REVOKE ALL ON FUNCTION public.create_team_invite_link(uuid),public.list_team_invite_links(uuid),public.preview_team_invite_link(text),public.revoke_team_invite_link(uuid),public.accept_team_invite_link(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_team_invite_link(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_team_invite_link(uuid),public.list_team_invite_links(uuid),public.revoke_team_invite_link(uuid),public.accept_team_invite_link(text) TO authenticated;
COMMIT;
