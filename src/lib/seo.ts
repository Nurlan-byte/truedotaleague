import { supabase } from "@/integrations/supabase/client";

export const SITE_URL = "https://truedotaleague.kz";

/** Self-referencing canonical + og:url for a public page. */
export function seoUrl(path: string) {
  const url = `${SITE_URL}${path}`;
  return {
    meta: [{ property: "og:url", content: url }],
    links: [{ rel: "canonical", href: url }],
  };
}

export const NOINDEX = { name: "robots", content: "noindex, follow" };

/** Lightweight public lookups for page titles; never throw (SEO must not break pages). */
export async function seoTournament(id: string) {
  try {
    const { data } = await supabase.from("tournaments").select("title, description").eq("id", id).maybeSingle();
    return data ? { title: data.title, description: (data.description ?? "").replace(/\s+/g, " ").trim().slice(0, 150) } : null;
  } catch {
    return null;
  }
}

export async function seoTeam(id: string) {
  try {
    const { data } = await supabase.from("teams").select("name, tag").eq("id", id).maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

export async function seoPlayer(id: string) {
  try {
    const { data } = await supabase.from("profiles").select("nickname").eq("id", id).maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}
