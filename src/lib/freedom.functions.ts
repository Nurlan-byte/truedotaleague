import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { FREEDOM_KEY, FREEDOM_TITLE } from "@/lib/freedom";

export const readFreedomSeason = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const url = process.env["SUPABASE_URL"];
  if (!key || !url) throw new Error("Не удалось загрузить лигу");
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`)
          headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
  const { data, error } = await client
    .from("tournaments")
    .select("*, tournament_participants(*), matches(*), groups(*), placements(*)")
    .or(`legacy_id.eq.${FREEDOM_KEY},title.eq.${FREEDOM_TITLE}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Не удалось загрузить лигу. Попробуйте ещё раз.");
  return data;
});
