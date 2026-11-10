CREATE OR REPLACE FUNCTION public.guard_competitive_rating()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND current_user <> 'service_role' THEN
    IF TG_OP = 'INSERT' THEN NEW.competitive_rating := NULL;
    ELSIF NEW.competitive_rating IS DISTINCT FROM OLD.competitive_rating THEN NEW.competitive_rating := OLD.competitive_rating;
    END IF;
  END IF;
  IF NEW.competitive_rating IS NOT NULL THEN NEW.mmr := NEW.competitive_rating; END IF;
  RETURN NEW;
END $$;