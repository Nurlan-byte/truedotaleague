-- One public result; the private draft setup and history stay in the lead's browser.
CREATE TABLE IF NOT EXISTS public.draft_publications (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  result jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id)
);

ALTER TABLE public.draft_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.draft_publications FROM PUBLIC, anon, authenticated;
GRANT SELECT (result, version, updated_at) ON public.draft_publications TO anon, authenticated;
CREATE POLICY "draft published result public read" ON public.draft_publications
  FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.publish_draft_result(
  p_expected_version integer,
  p_result jsonb
) RETURNS public.draft_publications
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old_row public.draft_publications;
  new_row public.draft_publications;
  team jsonb;
  player jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'invalid version';
  END IF;
  IF p_result IS NULL OR pg_column_size(p_result) > 65536
     OR jsonb_typeof(p_result) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid result';
  END IF;
  IF jsonb_typeof(p_result -> 'title') IS DISTINCT FROM 'string'
     OR length(COALESCE(p_result ->> 'title', '')) NOT BETWEEN 1 AND 160
     OR jsonb_typeof(p_result -> 'captainPlays') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_result -> 'teams') IS DISTINCT FROM 'array'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_result) AS k(name)
                WHERE k.name NOT IN ('title', 'captainPlays', 'teams')) THEN
    RAISE EXCEPTION 'invalid result';
  END IF;
  IF jsonb_array_length(p_result -> 'teams') NOT BETWEEN 2 AND 32 THEN
    RAISE EXCEPTION 'invalid result';
  END IF;
  FOR team IN SELECT value FROM jsonb_array_elements(p_result -> 'teams') LOOP
    IF jsonb_typeof(team) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'invalid team';
    END IF;
    IF jsonb_typeof(team -> 'name') IS DISTINCT FROM 'string'
       OR length(COALESCE(team ->> 'name', '')) NOT BETWEEN 1 AND 160
       OR jsonb_typeof(team -> 'captain') IS DISTINCT FROM 'string'
       OR length(COALESCE(team ->> 'captain', '')) NOT BETWEEN 1 AND 160
       OR (team ? 'captainNick' AND (jsonb_typeof(team -> 'captainNick') IS DISTINCT FROM 'string'
            OR length(COALESCE(team ->> 'captainNick', '')) > 160))
       OR jsonb_typeof(team -> 'players') IS DISTINCT FROM 'array'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(team) AS k(name)
                  WHERE k.name NOT IN ('name', 'captain', 'captainNick', 'players')) THEN
      RAISE EXCEPTION 'invalid team';
    END IF;
    IF jsonb_array_length(team -> 'players') > 16 THEN
      RAISE EXCEPTION 'invalid team';
    END IF;
    FOR player IN SELECT value FROM jsonb_array_elements(team -> 'players') LOOP
      IF jsonb_typeof(player) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'invalid player';
      END IF;
      IF jsonb_typeof(player -> 'name') IS DISTINCT FROM 'string'
         OR length(COALESCE(player ->> 'name', '')) NOT BETWEEN 1 AND 160
         OR (player ? 'nick' AND (jsonb_typeof(player -> 'nick') IS DISTINCT FROM 'string'
              OR length(COALESCE(player ->> 'nick', '')) > 160))
         OR (player ? 'rating' AND jsonb_typeof(player -> 'rating') IS DISTINCT FROM 'number')
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(player) AS k(name)
                    WHERE k.name NOT IN ('name', 'nick', 'rating')) THEN
        RAISE EXCEPTION 'invalid player';
      END IF;
    END LOOP;
  END LOOP;

  -- Serialize the first insert too: a missing row cannot be locked with FOR UPDATE.
  PERFORM pg_advisory_xact_lock(781234, 1);
  SELECT * INTO old_row FROM public.draft_publications WHERE id = 1 FOR UPDATE;
  IF old_row.id IS NULL THEN
    IF p_expected_version <> 0 THEN RAISE EXCEPTION 'stale version'; END IF;
    INSERT INTO public.draft_publications (id, result, updated_by)
      VALUES (1, p_result, auth.uid()) RETURNING * INTO new_row;
  ELSE
    IF old_row.version <> p_expected_version THEN RAISE EXCEPTION 'stale version'; END IF;
    UPDATE public.draft_publications
      SET result = p_result, version = old_row.version + 1,
          updated_at = now(), updated_by = auth.uid()
      WHERE id = 1 RETURNING * INTO new_row;
  END IF;
  PERFORM public.write_audit('publish_draft_result', 'draft_publications', '1', NULL, NULL,
    to_jsonb(old_row), to_jsonb(new_row));
  RETURN new_row;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_draft_result(integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_draft_result(integer, jsonb) TO authenticated;
