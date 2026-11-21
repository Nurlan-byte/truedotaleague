import { queryOptions } from "@tanstack/react-query";
import { readFreedomSeason } from "@/lib/freedom.functions";
export const freedomQuery = () =>
  queryOptions({
    queryKey: ["league", "freedom"],
    queryFn: () => readFreedomSeason(),
    staleTime: 10000,
    refetchInterval: 10000,
  });
