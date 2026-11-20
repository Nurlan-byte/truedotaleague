import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TeamLogo } from "@/components/TeamLogo";

type Part = { id: string; team_id: string; team_name: string; team_tag: string | null; logo_url: string | null };
type Player = { id: string; profile_id: string | null; nickname: string; position: number; rating: number | null; avatar: string | null };

async function loadRosters(teamIds: string[]) {
  const { data: mem } = await supabase
    .from("team_members")
    .select("id, team_id, nickname, mmr, position, profile_id")
    .in("team_id", teamIds);
  const ids = (mem ?? []).map((m) => m.profile_id).filter((x): x is string => !!x);
  const { data: profs } = ids.length
    ? await supabase.from("profiles").select("id, nickname, avatar_url, mmr, competitive_rating").in("id", ids)
    : { data: [] };
  const pm = new Map((profs ?? []).map((p) => [p.id, p]));
  const out: Record<string, Player[]> = {};
  for (const m of mem ?? []) {
    const p = m.profile_id ? pm.get(m.profile_id) : undefined;
    (out[m.team_id] ??= []).push({
      id: m.id,
      profile_id: m.profile_id,
      nickname: p?.nickname || m.nickname || "Игрок",
      position: m.position,
      rating: p?.competitive_rating ?? p?.mmr ?? m.mmr ?? null,
      avatar: p?.avatar_url ?? null,
    });
  }
  for (const k in out) out[k]!.sort((a, b) => a.position - b.position);
  return out;
}

export function ConfirmedTeams({ participants }: { participants: Part[] }) {
  const teamIds = participants.map((p) => p.team_id);
  const { data: rosters } = useQuery({
    queryKey: ["tournament-rosters", teamIds],
    queryFn: () => loadRosters(teamIds),
    enabled: teamIds.length > 0,
  });
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {participants.map((p) => {
        const players = rosters?.[p.team_id] ?? [];
        return (
          <li key={p.id}>
            <details className="group rounded-lg border border-border bg-card/50">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm">
                <TeamLogo name={p.team_name} logo={p.logo_url ?? undefined} size="md" />
                <span className="truncate font-medium text-foreground">{p.team_name}</span>
                {p.team_tag && <span className="text-xs font-semibold text-primary">[{p.team_tag}]</span>}
                <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-1 border-t border-border px-3 py-2">
                {players.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{rosters ? "Состав не указан" : "Загрузка…"}</p>
                ) : (
                  players.map((pl) => {
                    const row = (
                      <>
                        <TeamLogo name={pl.nickname} logo={pl.avatar ?? undefined} size="sm" />
                        <span className="truncate">{pl.nickname}</span>
                        {pl.position > 4 && <span className="text-[10px] text-muted-foreground">запас</span>}
                        <span className="ml-auto text-xs text-muted-foreground">{pl.rating ?? "—"}</span>
                      </>
                    );
                    return pl.profile_id ? (
                      <Link key={pl.id} to="/players/$playerId" params={{ playerId: pl.profile_id }}
                        className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-primary/5 hover:text-primary">
                        {row}
                      </Link>
                    ) : (
                      <div key={pl.id} className="flex items-center gap-2 px-1 py-1 text-sm">{row}</div>
                    );
                  })
                )}
                <Link to="/teams/$teamId" params={{ teamId: p.team_id }} className="block pt-1 text-xs font-semibold text-primary hover:underline">
                  Открыть карточку команды →
                </Link>
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
