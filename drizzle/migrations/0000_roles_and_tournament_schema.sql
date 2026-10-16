
-- ============ A. ROLES ============
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_per_user ON public.user_roles(user_id);

INSERT INTO public.user_roles(user_id, role)
SELECT u.id, 'user'::public.app_role FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, nickname, avatar_url, discord_id, discord_username, discord_global_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'nickname', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'global_name', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'preferred_username', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'user_name', ''),
      split_part(COALESCE(NEW.email, 'player'), '@', 1)
    ),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'avatar_url', ''), NULLIF(NEW.raw_user_meta_data ->> 'picture', '')),
    NULLIF(NEW.raw_user_meta_data ->> 'discord_id', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'discord_username', ''), ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'discord_global_name', ''), '')
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user') ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND public.has_role(_uid, 'admin')
$$;

-- last-admin guard (serialized by advisory lock)
CREATE OR REPLACE FUNCTION public.guard_last_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.role = 'admin' AND (TG_OP = 'DELETE' OR NEW.role <> 'admin') THEN
    PERFORM pg_advisory_xact_lock(hashtext('tdl_admin_roles'));
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin' AND user_id <> OLD.user_id) THEN
      RAISE EXCEPTION 'last_admin: cannot remove or demote the last admin';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER user_roles_guard_last_admin BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.guard_last_admin();

-- ============ B. ENUMS ============
CREATE TYPE public.tournament_status AS ENUM ('draft','announced','registration_open','registration_closed','live','finished','cancelled');
CREATE TYPE public.tournament_mode AS ENUM ('online','offline');
CREATE TYPE public.tournament_format AS ENUM ('groups_playoff','single_elim','round_robin');
CREATE TYPE public.application_status AS ENUM ('pending','accepted','rejected','withdrawn');
CREATE TYPE public.match_stage AS ENUM ('group','playoff');
CREATE TYPE public.regulation_status AS ENUM ('draft','published');

CREATE OR REPLACE FUNCTION public.bump_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.version = OLD.version + 1; NEW.updated_at = now(); RETURN NEW; END $$;

-- ============ TABLES ============
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  tag text NOT NULL DEFAULT '',
  logo_url text,
  owner_id uuid NOT NULL,
  legacy_id text UNIQUE,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.teams(owner_id);

CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  role text NOT NULL DEFAULT '',
  mmr int CHECK (mmr IS NULL OR mmr >= 0),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.team_members(team_id);
CREATE INDEX ON public.team_members(profile_id);

CREATE TABLE public.team_captains (
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX ON public.team_captains(user_id);

CREATE TABLE public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  image_url text,
  starts_at timestamptz,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  mode public.tournament_mode NOT NULL DEFAULT 'online',
  venue_name text,
  venue_address text,
  prize_amount numeric CHECK (prize_amount IS NULL OR prize_amount >= 0),
  prize_currency text,
  prize_tba boolean NOT NULL DEFAULT false,
  team_limit int NOT NULL DEFAULT 16 CHECK (team_limit >= 2),
  description text NOT NULL DEFAULT '',
  format public.tournament_format NOT NULL DEFAULT 'single_elim',
  status public.tournament_status NOT NULL DEFAULT 'draft',
  cancel_reason text,
  closed_reason text,
  winner_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  created_by uuid,
  legacy_id text UNIQUE,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reg_close_before_start CHECK (registration_closes_at IS NULL OR starts_at IS NULL OR registration_closes_at <= starts_at),
  CONSTRAINT reg_open_before_close CHECK (registration_opens_at IS NULL OR registration_closes_at IS NULL OR registration_opens_at < registration_closes_at),
  CONSTRAINT offline_needs_venue CHECK (mode <> 'offline' OR (venue_address IS NOT NULL AND length(btrim(venue_address)) > 0))
);
CREATE INDEX ON public.tournaments(status);

CREATE TABLE public.regulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Регламент',
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.regulation_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulation_id uuid NOT NULL REFERENCES public.regulations(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  status public.regulation_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  effective_from timestamptz,
  author_id uuid,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.regulation_versions.body IS 'Markdown/plain text; must be rendered sanitized (no raw HTML).';

CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL,
  status public.application_status NOT NULL DEFAULT 'pending',
  roster_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  regulation_version_id uuid REFERENCES public.regulation_versions(id),
  reject_reason text,
  decided_by uuid,
  decided_at timestamptz,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submitted_by, idempotency_key)
);
CREATE UNIQUE INDEX applications_one_active ON public.applications(tournament_id, team_id) WHERE status IN ('pending','accepted');
CREATE INDEX ON public.applications(tournament_id, status);

CREATE TABLE public.tournament_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  team_name text NOT NULL,
  team_tag text NOT NULL DEFAULT '',
  logo_url text,
  roster_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  seed int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, team_id)
);

CREATE TABLE public.tournament_moderators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE UNIQUE INDEX tournament_moderators_active ON public.tournament_moderators(tournament_id, user_id) WHERE revoked_at IS NULL;

CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  idx int NOT NULL,
  name text NOT NULL DEFAULT '',
  team_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, idx)
);

CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  stage public.match_stage NOT NULL,
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  round int NOT NULL DEFAULT 1,
  slot int NOT NULL DEFAULT 0,
  team_a_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  team_b_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  score_a int CHECK (score_a IS NULL OR score_a >= 0),
  score_b int CHECK (score_b IS NULL OR score_b >= 0),
  scheduled_at timestamptz,
  winner_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  next_match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  next_match_slot char(1) CHECK (next_match_slot IN ('a','b')),
  legacy_id text,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_match_has_group CHECK (stage <> 'group' OR group_id IS NOT NULL)
);
CREATE INDEX ON public.matches(tournament_id, stage, round, slot);
CREATE UNIQUE INDEX matches_playoff_slot ON public.matches(tournament_id, round, slot) WHERE stage = 'playoff';

CREATE TABLE public.placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  team_name text NOT NULL DEFAULT '',
  place int NOT NULL CHECK (place >= 1),
  points int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, team_id),
  UNIQUE (tournament_id, place)
);

CREATE TABLE public.points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE RESTRICT,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  points int NOT NULL,
  reason text NOT NULL DEFAULT '',
  reverses_entry_id uuid UNIQUE REFERENCES public.points_ledger(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.points_ledger(tournament_id);
CREATE INDEX ON public.points_ledger(team_id);

CREATE TABLE public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  tournament_id uuid,
  reason text,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.audit_log(tournament_id);
CREATE INDEX ON public.audit_log(created_at DESC);

-- timestamps / versions
CREATE TRIGGER teams_ver BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.bump_version();
CREATE TRIGGER tournaments_ver BEFORE UPDATE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION public.bump_version();
CREATE TRIGGER regver_ver BEFORE UPDATE ON public.regulation_versions FOR EACH ROW EXECUTE FUNCTION public.bump_version();
CREATE TRIGGER matches_ver BEFORE UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.bump_version();
CREATE TRIGGER team_members_upd BEFORE UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER regulations_upd BEFORE UPDATE ON public.regulations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER applications_upd BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER groups_upd BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.is_staff_for(_uid uuid, _tournament_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    public.is_admin(_uid) OR (
      public.has_role(_uid, 'moderator') AND EXISTS (
        SELECT 1 FROM public.tournament_moderators m
        WHERE m.tournament_id = _tournament_id AND m.user_id = _uid AND m.revoked_at IS NULL)))
$$;

CREATE OR REPLACE FUNCTION public.is_team_captain(_uid uuid, _team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.teams t WHERE t.id = _team_id AND t.owner_id = _uid)
    OR EXISTS (SELECT 1 FROM public.team_captains c WHERE c.team_id = _team_id AND c.user_id = _uid))
$$;

CREATE OR REPLACE FUNCTION public.tournament_is_public(_tournament_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tournaments WHERE id = _tournament_id AND status <> 'draft')
$$;

CREATE OR REPLACE FUNCTION public.write_audit(_action text, _entity text, _entity_id text, _tournament_id uuid, _reason text, _before jsonb, _after jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.audit_log(actor_id, action, entity, entity_id, tournament_id, reason, before, after)
  VALUES (auth.uid(), _action, _entity, _entity_id, _tournament_id, _reason, _before, _after)
$$;

CREATE OR REPLACE FUNCTION public.place_points(_place int)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _place WHEN 1 THEN 50 WHEN 2 THEN 25 WHEN 3 THEN 12 WHEN 4 THEN 6 ELSE 0 END
$$;

-- ============ GRANTS ============
GRANT SELECT ON public.teams, public.team_members, public.team_captains, public.tournaments, public.regulations,
  public.regulation_versions, public.tournament_participants, public.groups, public.matches, public.placements,
  public.points_ledger TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.teams, public.team_members, public.team_captains, public.tournaments,
  public.regulations, public.regulation_versions, public.tournament_participants, public.tournament_moderators,
  public.groups, public.matches, public.placements TO authenticated;
GRANT SELECT ON public.applications, public.tournament_moderators, public.audit_log TO authenticated;
GRANT ALL ON public.teams, public.team_members, public.team_captains, public.tournaments, public.regulations,
  public.regulation_versions, public.applications, public.tournament_participants, public.tournament_moderators,
  public.groups, public.matches, public.placements, public.points_ledger, public.audit_log TO service_role;

-- ============ C. RLS ============
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_captains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_moderators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- teams: public read; owner manages own; admin all
CREATE POLICY "teams public read" ON public.teams FOR SELECT USING (true);
CREATE POLICY "teams owner insert" ON public.teams FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "teams captain update" ON public.teams FOR UPDATE TO authenticated
  USING (public.is_team_captain(auth.uid(), id) OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_team_captain(auth.uid(), id) OR public.is_admin(auth.uid()));
CREATE POLICY "teams owner delete" ON public.teams FOR DELETE TO authenticated USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "members public read" ON public.team_members FOR SELECT USING (true);
CREATE POLICY "members captain write" ON public.team_members FOR ALL TO authenticated
  USING (public.is_team_captain(auth.uid(), team_id) OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_team_captain(auth.uid(), team_id) OR public.is_admin(auth.uid()));

CREATE POLICY "captains public read" ON public.team_captains FOR SELECT USING (true);
CREATE POLICY "captains owner write" ON public.team_captains FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()) OR public.is_admin(auth.uid()));

CREATE POLICY "tournaments public read" ON public.tournaments FOR SELECT USING (status <> 'draft' OR public.is_admin(auth.uid()));
CREATE POLICY "tournaments admin write" ON public.tournaments FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "regulations public read" ON public.regulations FOR SELECT USING (true);
CREATE POLICY "regulations admin write" ON public.regulations FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "regver published read" ON public.regulation_versions FOR SELECT USING (status = 'published' OR public.is_admin(auth.uid()));
CREATE POLICY "regver admin write" ON public.regulation_versions FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "applications own or staff read" ON public.applications FOR SELECT TO authenticated
  USING (submitted_by = auth.uid() OR public.is_team_captain(auth.uid(), team_id) OR public.is_staff_for(auth.uid(), tournament_id));

CREATE POLICY "participants public read" ON public.tournament_participants FOR SELECT USING (public.tournament_is_public(tournament_id) OR public.is_admin(auth.uid()));
CREATE POLICY "participants admin write" ON public.tournament_participants FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "moderators read" ON public.tournament_moderators FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "moderators admin write" ON public.tournament_moderators FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "groups public read" ON public.groups FOR SELECT USING (public.tournament_is_public(tournament_id) OR public.is_admin(auth.uid()));
CREATE POLICY "groups admin write" ON public.groups FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "matches public read" ON public.matches FOR SELECT USING (public.tournament_is_public(tournament_id) OR public.is_admin(auth.uid()));
CREATE POLICY "matches admin write" ON public.matches FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "placements public read" ON public.placements FOR SELECT USING (public.tournament_is_public(tournament_id) OR public.is_admin(auth.uid()));
CREATE POLICY "placements admin write" ON public.placements FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "ledger public read" ON public.points_ledger FOR SELECT USING (public.tournament_is_public(tournament_id) OR public.is_admin(auth.uid()));

CREATE POLICY "audit admin read" ON public.audit_log FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- ============ D. RPCs ============
CREATE OR REPLACE FUNCTION public.set_user_role(target uuid, new_role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old public.app_role;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target) THEN RAISE EXCEPTION 'user_not_found'; END IF;
  SELECT role INTO _old FROM public.user_roles WHERE user_id = target FOR UPDATE;
  INSERT INTO public.user_roles(user_id, role) VALUES (target, new_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  PERFORM public.write_audit('set_user_role', 'user_roles', target::text, NULL, NULL,
    jsonb_build_object('role', _old), jsonb_build_object('role', new_role));
END $$;

CREATE OR REPLACE FUNCTION public.submit_application(p_tournament_id uuid, p_team_id uuid, p_regulation_version_id uuid, p_idempotency_key text)
RETURNS public.applications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _t public.tournaments; _app public.applications; _snap jsonb; _accepted int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO _app FROM public.applications WHERE submitted_by = _uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN _app; END IF;

  SELECT * INTO _t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament_not_found'; END IF;
  IF _t.status <> 'registration_open' THEN RAISE EXCEPTION 'registration_not_open'; END IF;
  IF _t.registration_opens_at IS NOT NULL AND now() < _t.registration_opens_at THEN RAISE EXCEPTION 'registration_not_open'; END IF;
  IF _t.registration_closes_at IS NULL OR now() >= _t.registration_closes_at THEN RAISE EXCEPTION 'registration_closed'; END IF;
  IF NOT public.is_team_captain(_uid, p_team_id) THEN RAISE EXCEPTION 'not_team_captain'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regulation_versions WHERE id = p_regulation_version_id AND status = 'published') THEN
    RAISE EXCEPTION 'regulation_not_acknowledged'; END IF;

  SELECT * INTO _app FROM public.applications
   WHERE tournament_id = p_tournament_id AND team_id = p_team_id AND status IN ('pending','accepted');
  IF FOUND THEN RETURN _app; END IF;

  SELECT count(*) INTO _accepted FROM public.applications WHERE tournament_id = p_tournament_id AND status = 'accepted';
  IF _accepted >= _t.team_limit THEN RAISE EXCEPTION 'tournament_full'; END IF;

  SELECT jsonb_build_object('name', t.name, 'tag', t.tag, 'logo_url', t.logo_url,
    'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('nickname', m.nickname, 'role', m.role, 'mmr', m.mmr, 'profile_id', m.profile_id) ORDER BY m.position)
      FROM public.team_members m WHERE m.team_id = t.id), '[]'::jsonb))
  INTO _snap FROM public.teams t WHERE t.id = p_team_id;

  INSERT INTO public.applications(tournament_id, team_id, submitted_by, roster_snapshot, regulation_version_id, idempotency_key)
  VALUES (p_tournament_id, p_team_id, _uid, _snap, p_regulation_version_id, p_idempotency_key) RETURNING * INTO _app;
  PERFORM public.write_audit('submit_application', 'applications', _app.id::text, p_tournament_id, NULL, NULL, to_jsonb(_app));
  RETURN _app;
END $$;

CREATE OR REPLACE FUNCTION public.withdraw_application(p_id uuid)
RETURNS public.applications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _app public.applications; _before jsonb; _t public.tournaments;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _app FROM public.applications WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'application_not_found'; END IF;
  IF NOT public.is_team_captain(_uid, _app.team_id) THEN RAISE EXCEPTION 'not_team_captain'; END IF;
  IF _app.status NOT IN ('pending','accepted') THEN RAISE EXCEPTION 'application_not_active'; END IF;
  SELECT * INTO _t FROM public.tournaments WHERE id = _app.tournament_id FOR UPDATE;
  IF _t.registration_closes_at IS NULL OR now() >= _t.registration_closes_at OR _t.status NOT IN ('announced','registration_open') THEN
    RAISE EXCEPTION 'deadline_passed'; END IF;
  _before := to_jsonb(_app);
  DELETE FROM public.tournament_participants WHERE tournament_id = _app.tournament_id AND team_id = _app.team_id;
  UPDATE public.applications SET status = 'withdrawn' WHERE id = p_id RETURNING * INTO _app;
  PERFORM public.write_audit('withdraw_application', 'applications', p_id::text, _app.tournament_id, NULL, _before, to_jsonb(_app));
  RETURN _app;
END $$;

CREATE OR REPLACE FUNCTION public.decide_application(p_id uuid, p_accept boolean, p_reason text DEFAULT NULL)
RETURNS public.applications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _app public.applications; _t public.tournaments; _before jsonb; _accepted int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _app FROM public.applications WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'application_not_found'; END IF;
  SELECT * INTO _t FROM public.tournaments WHERE id = _app.tournament_id FOR UPDATE;
  SELECT * INTO _app FROM public.applications WHERE id = p_id FOR UPDATE;
  IF NOT public.is_staff_for(_uid, _app.tournament_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.is_admin(_uid) AND (public.is_team_captain(_uid, _app.team_id)
     OR EXISTS (SELECT 1 FROM public.team_members WHERE team_id = _app.team_id AND profile_id = _uid)) THEN
    RAISE EXCEPTION 'conflict_of_interest'; END IF;
  IF _app.status <> 'pending' THEN RAISE EXCEPTION 'application_not_pending'; END IF;
  _before := to_jsonb(_app);
  IF p_accept THEN
    SELECT count(*) INTO _accepted FROM public.applications WHERE tournament_id = _t.id AND status = 'accepted';
    IF _accepted >= _t.team_limit THEN RAISE EXCEPTION 'tournament_full'; END IF;
    UPDATE public.applications SET status = 'accepted', decided_by = _uid, decided_at = now(), reject_reason = NULL
      WHERE id = p_id RETURNING * INTO _app;
    INSERT INTO public.tournament_participants(tournament_id, team_id, application_id, team_name, team_tag, logo_url, roster_snapshot)
    VALUES (_t.id, _app.team_id, _app.id,
      COALESCE(_app.roster_snapshot->>'name', ''), COALESCE(_app.roster_snapshot->>'tag', ''),
      _app.roster_snapshot->>'logo_url', _app.roster_snapshot)
    ON CONFLICT (tournament_id, team_id) DO NOTHING;
  ELSE
    IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN RAISE EXCEPTION 'reason_required'; END IF;
    UPDATE public.applications SET status = 'rejected', decided_by = _uid, decided_at = now(), reject_reason = btrim(p_reason)
      WHERE id = p_id RETURNING * INTO _app;
  END IF;
  PERFORM public.write_audit(CASE WHEN p_accept THEN 'accept_application' ELSE 'reject_application' END,
    'applications', p_id::text, _t.id, p_reason, _before, to_jsonb(_app));
  RETURN _app;
END $$;

CREATE OR REPLACE FUNCTION public.set_match_schedule(p_match_id uuid, p_scheduled_at timestamptz, p_reason text DEFAULT NULL)
RETURNS public.matches LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.matches; _before jsonb;
BEGIN
  SELECT * INTO _m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF NOT public.is_staff_for(auth.uid(), _m.tournament_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _before := to_jsonb(_m);
  UPDATE public.matches SET scheduled_at = p_scheduled_at WHERE id = p_match_id RETURNING * INTO _m;
  PERFORM public.write_audit('set_match_schedule', 'matches', p_match_id::text, _m.tournament_id, p_reason, _before, to_jsonb(_m));
  RETURN _m;
END $$;

-- internal: push winner into next match, clearing downstream results when teams change
CREATE OR REPLACE FUNCTION public.propagate_match_winner(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cur public.matches; _next public.matches;
BEGIN
  SELECT * INTO _cur FROM public.matches WHERE id = p_match_id;
  LOOP
    EXIT WHEN _cur.next_match_id IS NULL;
    SELECT * INTO _next FROM public.matches WHERE id = _cur.next_match_id FOR UPDATE;
    IF _cur.next_match_slot = 'a' THEN
      EXIT WHEN _next.team_a_id IS NOT DISTINCT FROM _cur.winner_id;
      UPDATE public.matches SET team_a_id = _cur.winner_id, score_a = NULL, score_b = NULL, winner_id = NULL WHERE id = _next.id RETURNING * INTO _next;
    ELSE
      EXIT WHEN _next.team_b_id IS NOT DISTINCT FROM _cur.winner_id;
      UPDATE public.matches SET team_b_id = _cur.winner_id, score_a = NULL, score_b = NULL, winner_id = NULL WHERE id = _next.id RETURNING * INTO _next;
    END IF;
    _cur := _next;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.set_match_score(p_match_id uuid, p_score_a int, p_score_b int, p_reason text DEFAULT NULL)
RETURNS public.matches LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _m public.matches; _before jsonb; _winner uuid; _next public.matches;
BEGIN
  SELECT * INTO _m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF NOT public.is_staff_for(_uid, _m.tournament_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF (p_score_a IS NULL) <> (p_score_b IS NULL) OR p_score_a < 0 OR p_score_b < 0 THEN RAISE EXCEPTION 'invalid_score'; END IF;
  IF (_m.score_a IS NOT NULL OR _m.score_b IS NOT NULL) AND (p_reason IS NULL OR length(btrim(p_reason)) = 0) THEN
    RAISE EXCEPTION 'reason_required'; END IF;
  IF p_score_a IS NOT NULL AND p_score_a <> p_score_b THEN
    _winner := CASE WHEN p_score_a > p_score_b THEN _m.team_a_id ELSE _m.team_b_id END;
  ELSIF _m.stage = 'playoff' AND _m.team_a_id IS NOT NULL AND _m.team_b_id IS NULL THEN _winner := _m.team_a_id;
  ELSIF _m.stage = 'playoff' AND _m.team_b_id IS NOT NULL AND _m.team_a_id IS NULL THEN _winner := _m.team_b_id;
  END IF;
  IF _winner IS DISTINCT FROM _m.winner_id AND _m.next_match_id IS NOT NULL AND NOT public.is_admin(_uid) THEN
    SELECT * INTO _next FROM public.matches WHERE id = _m.next_match_id;
    IF _next.score_a IS NOT NULL OR _next.score_b IS NOT NULL THEN RAISE EXCEPTION 'admin_required: dependent matches already have results'; END IF;
  END IF;
  _before := to_jsonb(_m);
  UPDATE public.matches SET score_a = p_score_a, score_b = p_score_b, winner_id = _winner WHERE id = p_match_id RETURNING * INTO _m;
  PERFORM public.propagate_match_winner(p_match_id);
  PERFORM public.write_audit('set_match_score', 'matches', p_match_id::text, _m.tournament_id, p_reason, _before, to_jsonb(_m));
  RETURN _m;
END $$;

CREATE OR REPLACE FUNCTION public.change_tournament_status(p_id uuid, p_new_status public.tournament_status, p_reason text DEFAULT NULL)
RETURNS public.tournaments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.tournaments; _before jsonb; _old public.tournament_status; _has_reason boolean := p_reason IS NOT NULL AND length(btrim(p_reason)) > 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO _t FROM public.tournaments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament_not_found'; END IF;
  _old := _t.status; _before := to_jsonb(_t);
  IF p_new_status = _old THEN RETURN _t; END IF;
  IF p_new_status = 'cancelled' THEN
    IF NOT _has_reason THEN RAISE EXCEPTION 'reason_required'; END IF;
  ELSIF (_old, p_new_status) IN (('draft','announced'),('announced','registration_open'),('registration_open','registration_closed'),
                                 ('registration_closed','live'),('live','finished')) THEN
    NULL;
  ELSIF (_old, p_new_status) IN (('registration_closed','registration_open'),('finished','live')) THEN
    IF NOT _has_reason THEN RAISE EXCEPTION 'reason_required'; END IF;
  ELSE
    RAISE EXCEPTION 'invalid_transition: % -> %', _old, p_new_status;
  END IF;
  IF p_new_status = 'registration_open' AND NOT EXISTS (SELECT 1 FROM public.regulation_versions WHERE status = 'published') THEN
    RAISE EXCEPTION 'regulation_not_published'; END IF;
  UPDATE public.tournaments SET status = p_new_status,
    cancel_reason = CASE WHEN p_new_status = 'cancelled' THEN btrim(p_reason) ELSE cancel_reason END,
    closed_reason = CASE WHEN p_new_status = 'registration_closed' AND _has_reason THEN btrim(p_reason) ELSE closed_reason END
  WHERE id = p_id RETURNING * INTO _t;
  PERFORM public.write_audit('change_tournament_status', 'tournaments', p_id::text, p_id, p_reason, _before, to_jsonb(_t));
  RETURN _t;
END $$;

CREATE OR REPLACE FUNCTION public.finish_tournament(p_id uuid, p_placements jsonb, p_reason text DEFAULT NULL)
RETURNS public.tournaments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _t public.tournaments; _before jsonb; _new jsonb; _cur jsonb; _e record; _p record; _had_ledger boolean;
BEGIN
  IF NOT public.is_admin(_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO _t FROM public.tournaments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament_not_found'; END IF;
  IF _t.status NOT IN ('live','finished') THEN RAISE EXCEPTION 'tournament_not_live'; END IF;
  IF jsonb_typeof(p_placements) <> 'array' OR jsonb_array_length(p_placements) < 1 THEN RAISE EXCEPTION 'invalid_placements'; END IF;

  -- normalize & validate
  SELECT jsonb_agg(jsonb_build_object('team_id', (x->>'team_id')::uuid, 'place', (x->>'place')::int) ORDER BY (x->>'place')::int)
    INTO _new FROM jsonb_array_elements(p_placements) x;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_new) x WHERE (x->>'place')::int < 1
             OR NOT EXISTS (SELECT 1 FROM public.tournament_participants tp WHERE tp.tournament_id = p_id AND tp.team_id = (x->>'team_id')::uuid)) THEN
    RAISE EXCEPTION 'invalid_placements: team not a participant'; END IF;
  IF (SELECT count(DISTINCT x->>'team_id') FROM jsonb_array_elements(_new) x) <> jsonb_array_length(_new)
     OR (SELECT count(DISTINCT x->>'place') FROM jsonb_array_elements(_new) x) <> jsonb_array_length(_new) THEN
    RAISE EXCEPTION 'invalid_placements: duplicates'; END IF;

  SELECT jsonb_agg(jsonb_build_object('team_id', team_id, 'place', place) ORDER BY place) INTO _cur FROM public.placements WHERE tournament_id = p_id;
  SELECT EXISTS (SELECT 1 FROM public.points_ledger WHERE tournament_id = p_id) INTO _had_ledger;
  IF _t.status = 'finished' AND _cur IS NOT DISTINCT FROM _new THEN RETURN _t; END IF; -- idempotent
  IF _had_ledger AND (p_reason IS NULL OR length(btrim(p_reason)) = 0) THEN RAISE EXCEPTION 'reason_required'; END IF;

  _before := jsonb_build_object('tournament', to_jsonb(_t), 'placements', _cur);

  -- reverse every live (non-reversed, non-reversal) entry
  FOR _e IN SELECT l.* FROM public.points_ledger l
    WHERE l.tournament_id = p_id AND l.reverses_entry_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.points_ledger r WHERE r.reverses_entry_id = l.id) LOOP
    INSERT INTO public.points_ledger(tournament_id, team_id, points, reason, reverses_entry_id, created_by)
    VALUES (p_id, _e.team_id, -_e.points, COALESCE(p_reason, 'correction'), _e.id, _uid);
  END LOOP;

  DELETE FROM public.placements WHERE tournament_id = p_id;
  FOR _p IN SELECT (x->>'team_id')::uuid AS team_id, (x->>'place')::int AS place FROM jsonb_array_elements(_new) x LOOP
    INSERT INTO public.placements(tournament_id, team_id, team_name, place, points)
    SELECT p_id, _p.team_id, tp.team_name, _p.place, public.place_points(_p.place)
      FROM public.tournament_participants tp WHERE tp.tournament_id = p_id AND tp.team_id = _p.team_id;
    IF public.place_points(_p.place) > 0 THEN
      INSERT INTO public.points_ledger(tournament_id, team_id, points, reason, created_by)
      VALUES (p_id, _p.team_id, public.place_points(_p.place), 'place ' || _p.place, _uid);
    END IF;
  END LOOP;

  UPDATE public.tournaments SET status = 'finished',
    winner_team_id = (SELECT (x->>'team_id')::uuid FROM jsonb_array_elements(_new) x WHERE (x->>'place')::int = 1)
  WHERE id = p_id RETURNING * INTO _t;
  PERFORM public.write_audit('finish_tournament', 'tournaments', p_id::text, p_id, p_reason, _before,
    jsonb_build_object('tournament', to_jsonb(_t), 'placements', _new));
  RETURN _t;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_tournament(payload jsonb, expected_version int DEFAULT NULL)
RETURNS public.tournaments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _t public.tournaments; _before jsonb; _id uuid := NULLIF(payload->>'id','')::uuid; _accepted int;
BEGIN
  IF NOT public.is_admin(_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.tournaments(title, image_url, starts_at, registration_opens_at, registration_closes_at, mode, venue_name, venue_address,
      prize_amount, prize_currency, prize_tba, team_limit, description, format, created_by, legacy_id)
    VALUES (payload->>'title', payload->>'image_url', (payload->>'starts_at')::timestamptz, (payload->>'registration_opens_at')::timestamptz,
      (payload->>'registration_closes_at')::timestamptz, COALESCE((payload->>'mode')::public.tournament_mode, 'online'),
      payload->>'venue_name', payload->>'venue_address', (payload->>'prize_amount')::numeric, payload->>'prize_currency',
      COALESCE((payload->>'prize_tba')::boolean, false), COALESCE((payload->>'team_limit')::int, 16), COALESCE(payload->>'description', ''),
      COALESCE((payload->>'format')::public.tournament_format, 'single_elim'), _uid, payload->>'legacy_id')
    RETURNING * INTO _t;
    PERFORM public.write_audit('create_tournament', 'tournaments', _t.id::text, _t.id, NULL, NULL, to_jsonb(_t));
    RETURN _t;
  END IF;

  SELECT * INTO _t FROM public.tournaments WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament_not_found'; END IF;
  IF expected_version IS NULL OR _t.version <> expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;
  IF payload ? 'team_limit' THEN
    SELECT count(*) INTO _accepted FROM public.applications WHERE tournament_id = _id AND status = 'accepted';
    IF (payload->>'team_limit')::int < _accepted THEN RAISE EXCEPTION 'team_limit_below_accepted'; END IF;
  END IF;
  _before := to_jsonb(_t);
  UPDATE public.tournaments SET
    title = CASE WHEN payload ? 'title' THEN payload->>'title' ELSE title END,
    image_url = CASE WHEN payload ? 'image_url' THEN payload->>'image_url' ELSE image_url END,
    starts_at = CASE WHEN payload ? 'starts_at' THEN (payload->>'starts_at')::timestamptz ELSE starts_at END,
    registration_opens_at = CASE WHEN payload ? 'registration_opens_at' THEN (payload->>'registration_opens_at')::timestamptz ELSE registration_opens_at END,
    registration_closes_at = CASE WHEN payload ? 'registration_closes_at' THEN (payload->>'registration_closes_at')::timestamptz ELSE registration_closes_at END,
    mode = CASE WHEN payload ? 'mode' THEN (payload->>'mode')::public.tournament_mode ELSE mode END,
    venue_name = CASE WHEN payload ? 'venue_name' THEN payload->>'venue_name' ELSE venue_name END,
    venue_address = CASE WHEN payload ? 'venue_address' THEN payload->>'venue_address' ELSE venue_address END,
    prize_amount = CASE WHEN payload ? 'prize_amount' THEN (payload->>'prize_amount')::numeric ELSE prize_amount END,
    prize_currency = CASE WHEN payload ? 'prize_currency' THEN payload->>'prize_currency' ELSE prize_currency END,
    prize_tba = CASE WHEN payload ? 'prize_tba' THEN COALESCE((payload->>'prize_tba')::boolean, false) ELSE prize_tba END,
    team_limit = CASE WHEN payload ? 'team_limit' THEN (payload->>'team_limit')::int ELSE team_limit END,
    description = CASE WHEN payload ? 'description' THEN COALESCE(payload->>'description', '') ELSE description END,
    format = CASE WHEN payload ? 'format' THEN (payload->>'format')::public.tournament_format ELSE format END
  WHERE id = _id RETURNING * INTO _t;
  PERFORM public.write_audit('update_tournament', 'tournaments', _id::text, _id, NULL, _before, to_jsonb(_t));
  RETURN _t;
END $$;

CREATE OR REPLACE FUNCTION public.assign_moderator(p_tournament_id uuid, p_user_id uuid)
RETURNS public.tournament_moderators LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.tournament_moderators;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.has_role(p_user_id, 'moderator') THEN RAISE EXCEPTION 'user_not_moderator'; END IF;
  SELECT * INTO _r FROM public.tournament_moderators WHERE tournament_id = p_tournament_id AND user_id = p_user_id AND revoked_at IS NULL;
  IF FOUND THEN RETURN _r; END IF;
  INSERT INTO public.tournament_moderators(tournament_id, user_id, assigned_by) VALUES (p_tournament_id, p_user_id, auth.uid()) RETURNING * INTO _r;
  PERFORM public.write_audit('assign_moderator', 'tournament_moderators', _r.id::text, p_tournament_id, NULL, NULL, to_jsonb(_r));
  RETURN _r;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_moderator(p_tournament_id uuid, p_user_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.tournament_moderators SET revoked_at = now()
   WHERE tournament_id = p_tournament_id AND user_id = p_user_id AND revoked_at IS NULL;
  PERFORM public.write_audit('revoke_moderator', 'tournament_moderators', p_user_id::text, p_tournament_id, p_reason, NULL, NULL);
END $$;

CREATE OR REPLACE FUNCTION public.publish_regulation(p_version_id uuid, p_effective_from timestamptz DEFAULT NULL)
RETURNS public.regulation_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v public.regulation_versions; _before jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO _v FROM public.regulation_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'regulation_version_not_found'; END IF;
  IF _v.status = 'published' THEN RETURN _v; END IF;
  _before := to_jsonb(_v);
  UPDATE public.regulation_versions SET status = 'published', published_at = now(), effective_from = COALESCE(p_effective_from, now())
   WHERE id = p_version_id RETURNING * INTO _v;
  PERFORM public.write_audit('publish_regulation', 'regulation_versions', p_version_id::text, NULL, NULL, _before, to_jsonb(_v));
  RETURN _v;
END $$;

-- ============ EXECUTE privileges ============
REVOKE EXECUTE ON FUNCTION public.write_audit(text,text,text,uuid,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.propagate_match_winner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_last_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_application(uuid,uuid,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.withdraw_application(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decide_application(uuid,boolean,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_match_schedule(uuid,timestamptz,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_match_score(uuid,int,int,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.change_tournament_status(uuid,public.tournament_status,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finish_tournament(uuid,jsonb,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.upsert_tournament(jsonb,int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assign_moderator(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_moderator(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.publish_regulation(uuid,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, public.app_role), public.submit_application(uuid,uuid,uuid,text),
  public.withdraw_application(uuid), public.decide_application(uuid,boolean,text), public.set_match_schedule(uuid,timestamptz,text),
  public.set_match_score(uuid,int,int,text), public.change_tournament_status(uuid,public.tournament_status,text),
  public.finish_tournament(uuid,jsonb,text), public.upsert_tournament(jsonb,int), public.assign_moderator(uuid,uuid),
  public.revoke_moderator(uuid,uuid,text), public.publish_regulation(uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid), public.is_staff_for(uuid,uuid), public.is_team_captain(uuid,uuid),
  public.tournament_is_public(uuid), public.place_points(int) TO anon, authenticated;
