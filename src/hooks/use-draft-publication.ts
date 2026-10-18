import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const draftPublicationKey = ["draft-publication"] as const;

export function useDraftPublication() {
  return useQuery({
    queryKey: draftPublicationKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("draft_publications")
        .select("result, version, updated_at")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });
}
