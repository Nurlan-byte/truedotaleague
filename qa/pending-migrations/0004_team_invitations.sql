BEGIN;
-- Release gate: never repair or delete ambiguous legacy identities.
LOCK TABLE public.teams, public.team_members, public.team_captains IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.teams GROUP BY owner_id HAVING count(*)>1) THEN RAISE EXCEPTION 'legacy_duplicate_owners'; END IF;
 IF EXISTS(SELECT 1 FROM public.team_members m LEFT JOIN public.profiles p ON p.id=m.profile_id WHERE p.id IS NULL) THEN RAISE EXCEPTION 'legacy_unlinked_members'; END IF;
 IF EXISTS(WITH membership AS (SELECT id team_id,owner_id u FROM public.teams UNION SELECT team_id,profile_id FROM public.team_members UNION SELECT team_id,user_id FROM public.team_captains) SELECT 1 FROM membership GROUP BY u HAVING count(*)>1) THEN RAISE EXCEPTION 'legacy_conflicting_membership'; END IF;
 IF EXISTS(SELECT 1 FROM public.team_members GROUP BY profile_id HAVING count(*)>1) THEN RAISE EXCEPTION 'legacy_duplicate_members'; END IF;
 IF EXISTS(SELECT 1 FROM public.teams t LEFT JOIN public.profiles p ON p.id=t.owner_id WHERE p.id IS NULL) OR EXISTS(SELECT 1 FROM public.team_captains c LEFT JOIN public.profiles p ON p.id=c.user_id WHERE p.id IS NULL) THEN RAISE EXCEPTION 'legacy_missing_profile'; END IF;
 IF EXISTS(WITH membership AS (SELECT id team_id,owner_id u FROM public.teams UNION SELECT team_id,profile_id FROM public.team_members UNION SELECT team_id,user_id FROM public.team_captains) SELECT 1 FROM membership GROUP BY team_id HAVING count(*)>7) THEN RAISE EXCEPTION 'legacy_team_full'; END IF;
END $$;
ALTER TABLE public.teams ADD CONSTRAINT teams_one_owner UNIQUE(owner_id);
-- Preserve the original snapshots before switching to live profile attributes.
CREATE TABLE public.team_roster_legacy_snapshot AS SELECT * FROM public.team_members;
REVOKE ALL ON public.team_roster_legacy_snapshot FROM PUBLIC,anon,authenticated;
ALTER TABLE public.team_roster_legacy_snapshot ENABLE ROW LEVEL SECURITY;
INSERT INTO public.team_members(team_id,profile_id,nickname,role,mmr)
SELECT x.team_id,p.id,p.nickname,p.role_position,p.mmr FROM
 (SELECT id team_id,owner_id u FROM public.teams UNION SELECT team_id,user_id FROM public.team_captains) x
 JOIN public.profiles p ON p.id=x.u WHERE NOT EXISTS(SELECT 1 FROM public.team_members m WHERE m.profile_id=x.u);
ALTER TABLE public.team_members ALTER COLUMN profile_id SET NOT NULL;
-- Account deletion cannot silently turn members back into text records.
ALTER TABLE public.team_members DROP CONSTRAINT team_members_profile_id_fkey;
ALTER TABLE public.team_members ADD CONSTRAINT team_members_profile_id_fkey FOREIGN KEY(profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.team_members ADD CONSTRAINT team_members_one_team UNIQUE(profile_id);
ALTER TABLE public.team_members ADD COLUMN roster_slot text NOT NULL DEFAULT 'main' CHECK(roster_slot IN ('main','reserve'));
WITH ranked AS (SELECT id,row_number() OVER(PARTITION BY team_id ORDER BY position,created_at,id) n FROM public.team_members)
UPDATE public.team_members m SET roster_slot=CASE WHEN r.n<=5 THEN 'main' ELSE 'reserve' END FROM ranked r WHERE r.id=m.id;
ALTER TABLE public.team_members ADD COLUMN roster_place integer;
WITH r AS (SELECT id,row_number() OVER(PARTITION BY team_id,roster_slot ORDER BY position,created_at,id)::integer n FROM public.team_members)
UPDATE public.team_members m SET roster_place=r.n FROM r WHERE r.id=m.id;
ALTER TABLE public.team_members ALTER COLUMN roster_place SET NOT NULL;
ALTER TABLE public.team_members ADD CONSTRAINT roster_place_range CHECK(roster_place BETWEEN 1 AND CASE WHEN roster_slot='main' THEN 5 ELSE 2 END);
ALTER TABLE public.team_members ADD CONSTRAINT roster_place_unique UNIQUE(team_id,roster_slot,roster_place);
UPDATE public.team_members m SET nickname=p.nickname,role=p.role_position,mmr=p.mmr FROM public.profiles p WHERE p.id=m.profile_id;
CREATE TABLE public.team_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid NOT NULL REFERENCES public.teams ON DELETE CASCADE,
 invited_user_id uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE, invited_by uuid NOT NULL REFERENCES public.profiles ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX team_invitations_one_pending ON public.team_invitations(team_id,invited_user_id) WHERE status='pending';
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitation_read ON public.team_invitations FOR SELECT TO authenticated USING(invited_user_id=auth.uid() OR public.is_team_captain(auth.uid(),team_id));
GRANT SELECT ON public.team_invitations TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.teams,public.team_members,public.team_captains,public.team_invitations FROM PUBLIC,anon,authenticated;
-- Close column grants too; an old permissive policy must never restore client writes.
DO $$ DECLARE t text; cols text; BEGIN FOREACH t IN ARRAY ARRAY['teams','team_members','team_captains','team_invitations'] LOOP
 SELECT string_agg(quote_ident(column_name),',') INTO cols FROM information_schema.columns WHERE table_schema='public' AND table_name=t;
 EXECUTE format('REVOKE INSERT (%s),UPDATE (%s) ON public.%I FROM PUBLIC,anon,authenticated',cols,cols,t);
 IF has_any_column_privilege('authenticated','public.'||t,'INSERT') OR has_any_column_privilege('authenticated','public.'||t,'UPDATE') OR has_table_privilege('authenticated','public.'||t,'DELETE') THEN RAISE EXCEPTION 'unexpected_inherited_write_privilege: %',t; END IF;
END LOOP; END $$;
-- One transaction-scoped gate serializes all team mutations, including competing accepts
-- across different teams and create-vs-accept. Unique constraints provide a second boundary.
CREATE FUNCTION public.team_gate() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT pg_advisory_xact_lock(620261020,1) $$;
CREATE FUNCTION public.team_actor() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF; RETURN auth.uid(); END $$;
CREATE FUNCTION public.team_member_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.profiles; BEGIN
 PERFORM public.team_gate();
 IF TG_OP='UPDATE' AND (NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.profile_id IS DISTINCT FROM OLD.profile_id) THEN RAISE EXCEPTION 'membership_identity_immutable'; END IF;
 IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.teams WHERE owner_id=NEW.profile_id AND id<>NEW.team_id) THEN RAISE EXCEPTION 'already_in_team'; END IF;
 IF (SELECT count(*) FROM public.team_members WHERE team_id=NEW.team_id AND roster_slot=NEW.roster_slot AND id<>NEW.id)>=(CASE WHEN NEW.roster_slot='main' THEN 5 ELSE 2 END) THEN RAISE EXCEPTION 'slot_full'; END IF;
 IF TG_OP='INSERT' OR NEW.roster_slot IS DISTINCT FROM OLD.roster_slot THEN
 SELECT min(n) INTO NEW.roster_place FROM generate_series(1,CASE WHEN NEW.roster_slot='main' THEN 5 ELSE 2 END) n
 WHERE NOT EXISTS(SELECT 1 FROM public.team_members m WHERE m.team_id=NEW.team_id AND m.roster_slot=NEW.roster_slot AND m.roster_place=n AND m.id<>NEW.id);
 IF NEW.roster_place IS NULL THEN RAISE EXCEPTION 'slot_full'; END IF;
 END IF;
 SELECT * INTO STRICT p FROM public.profiles WHERE id=NEW.profile_id;
 NEW.nickname:=p.nickname;NEW.role:=p.role_position;NEW.mmr:=p.mmr;RETURN NEW;
END $$;
CREATE TRIGGER team_members_guard BEFORE INSERT OR UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.team_member_guard();
CREATE FUNCTION public.team_profile_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 UPDATE public.team_members SET nickname=NEW.nickname,role=NEW.role_position,mmr=NEW.mmr WHERE profile_id=NEW.id;RETURN NEW;
END $$;
CREATE TRIGGER team_profile_sync AFTER UPDATE OF nickname,role_position,mmr ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.team_profile_sync();
-- Enforce cross-table membership even for approved import/service paths.
CREATE FUNCTION public.team_owner_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM public.team_gate();
 IF TG_OP='UPDATE' AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN RAISE EXCEPTION 'owner_transfer_disabled'; END IF;
 IF EXISTS(SELECT 1 FROM public.team_members WHERE profile_id=NEW.owner_id AND team_id<>NEW.id) THEN RAISE EXCEPTION 'already_in_team'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER team_owner_guard BEFORE INSERT OR UPDATE OF owner_id ON public.teams FOR EACH ROW EXECUTE FUNCTION public.team_owner_guard();
ALTER TABLE public.team_members ADD CONSTRAINT team_members_team_profile UNIQUE(team_id,profile_id);
ALTER TABLE public.team_captains ADD CONSTRAINT team_captains_member FOREIGN KEY(team_id,user_id) REFERENCES public.team_members(team_id,profile_id) ON DELETE CASCADE;
REVOKE ALL ON FUNCTION public.team_owner_guard() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.create_team(p_name text,p_tag text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.team_actor(); t uuid; BEGIN
 PERFORM public.team_gate();
 IF EXISTS(SELECT 1 FROM public.teams WHERE owner_id=u) OR EXISTS(SELECT 1 FROM public.team_members WHERE profile_id=u) THEN RAISE EXCEPTION 'already_in_team'; END IF;
 IF length(btrim(p_name))=0 OR length(p_name)>100 OR length(p_tag)>8 THEN RAISE EXCEPTION 'invalid_team_name'; END IF;
 INSERT INTO public.teams(name,tag,owner_id) VALUES(btrim(p_name),btrim(p_tag),u) RETURNING id INTO t;
 INSERT INTO public.team_members(team_id,profile_id,nickname) VALUES(t,u,'');
 PERFORM public.write_audit('create_team','teams',t::text,NULL,NULL,NULL,NULL);RETURN t;
END $$;
CREATE FUNCTION public.create_team_invitation(p_team_id uuid,p_user_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.team_actor(); i uuid; BEGIN
 PERFORM public.team_gate();
 IF NOT public.is_team_captain(u,p_team_id) THEN RAISE EXCEPTION 'not_team_captain'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN RAISE EXCEPTION 'profile_required'; END IF;
 IF EXISTS(SELECT 1 FROM public.team_members WHERE profile_id=p_user_id) OR EXISTS(SELECT 1 FROM public.teams WHERE owner_id=p_user_id) THEN RAISE EXCEPTION 'already_in_team'; END IF;
 INSERT INTO public.team_invitations(team_id,invited_user_id,invited_by) VALUES(p_team_id,p_user_id,u) RETURNING id INTO i;
 PERFORM public.write_audit('invite_player','team_invitations',i::text,NULL,NULL,NULL,NULL);RETURN i;
END $$;
CREATE FUNCTION public.respond_team_invitation(p_id uuid,p_action text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.team_actor(); i public.team_invitations; slot text; BEGIN
 PERFORM public.team_gate(); SELECT * INTO i FROM public.team_invitations WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
 IF p_action='cancel' THEN
  IF NOT public.is_team_captain(u,i.team_id) THEN RAISE EXCEPTION 'not_team_captain'; END IF;
 ELSIF p_action IN ('accept','decline') THEN
  IF i.invited_user_id<>u THEN RAISE EXCEPTION 'not_invitation_recipient'; END IF;
 ELSE RAISE EXCEPTION 'invalid_action'; END IF;
 IF i.status<>'pending' THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;
 IF p_action='accept' THEN
  IF EXISTS(SELECT 1 FROM public.team_members WHERE profile_id=u) OR EXISTS(SELECT 1 FROM public.teams WHERE owner_id=u) THEN RAISE EXCEPTION 'already_in_team'; END IF;
  PERFORM 1 FROM public.teams WHERE id=i.team_id FOR UPDATE;
  IF (SELECT count(*) FROM public.team_members WHERE team_id=i.team_id AND roster_slot='main')<5 THEN slot:='main';
  ELSIF (SELECT count(*) FROM public.team_members WHERE team_id=i.team_id AND roster_slot='reserve')<2 THEN slot:='reserve';
  ELSE RAISE EXCEPTION 'team_full'; END IF;
  INSERT INTO public.team_members(team_id,profile_id,nickname,roster_slot) VALUES(i.team_id,u,'',slot);
  UPDATE public.team_invitations SET status='cancelled' WHERE invited_user_id=u AND status='pending' AND id<>p_id;
 END IF;
 UPDATE public.team_invitations SET status=CASE p_action WHEN 'accept' THEN 'accepted' WHEN 'decline' THEN 'declined' ELSE 'cancelled' END WHERE id=p_id RETURNING status INTO slot;
 PERFORM public.write_audit('respond_invitation','team_invitations',p_id::text,NULL,p_action,NULL,NULL);RETURN slot;
END $$;
CREATE FUNCTION public.manage_team(p_team_id uuid,p_action text,p_user_id uuid DEFAULT NULL,p_value text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.team_actor(); owner uuid; BEGIN
 PERFORM public.team_gate();SELECT owner_id INTO owner FROM public.teams WHERE id=p_team_id FOR UPDATE;
 IF owner IS NULL THEN RAISE EXCEPTION 'team_not_found'; END IF;
 IF p_action='leave' THEN
  IF owner=u THEN RAISE EXCEPTION 'owner_cannot_leave'; END IF;
  DELETE FROM public.team_captains WHERE team_id=p_team_id AND user_id=u;
  DELETE FROM public.team_members WHERE team_id=p_team_id AND profile_id=u;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_in_team'; END IF;
 ELSIF p_action='logo' THEN
  IF NOT public.is_team_captain(u,p_team_id) THEN RAISE EXCEPTION 'not_team_captain'; END IF;
  UPDATE public.teams SET logo_url=p_value WHERE id=p_team_id;
 ELSE
  IF owner<>u THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF p_action='delete' THEN DELETE FROM public.teams WHERE id=p_team_id;
  ELSIF p_action IN ('remove','captain','uncaptain','main','reserve') THEN
   IF p_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.team_members WHERE team_id=p_team_id AND profile_id=p_user_id) THEN RAISE EXCEPTION 'member_required'; END IF;
   IF p_user_id=owner AND p_action IN ('remove','captain','uncaptain') THEN RAISE EXCEPTION 'cannot_remove_owner'; END IF;
   IF p_action='captain' THEN INSERT INTO public.team_captains(team_id,user_id) VALUES(p_team_id,p_user_id) ON CONFLICT DO NOTHING;
   ELSIF p_action='uncaptain' THEN DELETE FROM public.team_captains WHERE team_id=p_team_id AND user_id=p_user_id;
   ELSIF p_action IN ('main','reserve') THEN UPDATE public.team_members SET roster_slot=p_action WHERE team_id=p_team_id AND profile_id=p_user_id;
   ELSE DELETE FROM public.team_captains WHERE team_id=p_team_id AND user_id=p_user_id;DELETE FROM public.team_members WHERE team_id=p_team_id AND profile_id=p_user_id; END IF;
  ELSE RAISE EXCEPTION 'invalid_action'; END IF;
 END IF;
 PERFORM public.write_audit('manage_team','teams',p_team_id::text,NULL,p_action,NULL,jsonb_build_object('user_id',p_user_id));
END $$;
CREATE FUNCTION public.list_team_invitations() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC),'[]'::jsonb) FROM (
 SELECT i.*,t.name team_name,t.tag team_tag,p.nickname invited_by_name,r.nickname invited_user_name
 FROM public.team_invitations i JOIN public.teams t ON t.id=i.team_id JOIN public.profiles p ON p.id=i.invited_by JOIN public.profiles r ON r.id=i.invited_user_id
 WHERE i.invited_user_id=auth.uid() OR public.is_team_captain(auth.uid(),i.team_id)) r
$$;
CREATE FUNCTION public.search_team_players(p_team_id uuid,p_query text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NOT public.is_team_captain(public.team_actor(),p_team_id) THEN RAISE EXCEPTION 'not_team_captain'; END IF;
 IF length(btrim(p_query))<2 THEN RETURN '[]'::jsonb; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM (SELECT p.id,p.nickname,p.role_position,p.mmr FROM public.profiles p WHERE strpos(lower(p.nickname),lower(btrim(p_query)))>0 AND NOT EXISTS(SELECT 1 FROM public.team_members m WHERE m.profile_id=p.id) AND NOT EXISTS(SELECT 1 FROM public.teams t WHERE t.owner_id=p.id) ORDER BY p.nickname,p.id LIMIT 20) r);
END $$;
REVOKE ALL ON FUNCTION public.team_gate(),public.team_actor(),public.team_member_guard(),public.team_profile_sync() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_team(text,text),public.create_team_invitation(uuid,uuid),public.respond_team_invitation(uuid,text),public.manage_team(uuid,text,uuid,text),public.list_team_invitations(),public.search_team_players(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_team(text,text),public.create_team_invitation(uuid,uuid),public.respond_team_invitation(uuid,text),public.manage_team(uuid,text,uuid,text),public.list_team_invitations(),public.search_team_players(uuid,text) TO authenticated;
-- This endpoint switches the UI on only after this entire transaction commits.
CREATE FUNCTION public.team_system_version() RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT 1 $$;
REVOKE ALL ON FUNCTION public.team_system_version() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.team_system_version() TO authenticated;
COMMIT;
