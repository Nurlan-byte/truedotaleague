import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Shield, Users } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { LeaguePageIntro, QueryFeedback } from "@/components/LeaguePageIntro";
import { allTeamsQuery } from "@/lib/league-api";

export const Route = createFileRoute("/teams")({
  head: () => ({ meta: [{ title: "Команды — TrueDotaLeague" }, { name: "description", content: "Команды лиги TrueDotaLeague, составы и участники." }] }),
  component: TeamsPage,
});

function TeamsPage() {
  const teams = useQuery(allTeamsQuery());
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"name" | "members">("name");
  const list = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ru");
    const filtered = (teams.data ?? []).filter((team) =>
      !needle || [team.name, team.tag, ...team.team_members.map((member) => member.nickname)]
        .some((value) => value?.toLocaleLowerCase("ru").includes(needle)),
    );
    return [...filtered].sort((a, b) => sort === "members"
      ? b.team_members.length - a.team_members.length || a.name.localeCompare(b.name, "ru")
      : a.name.localeCompare(b.name, "ru"));
  }, [teams.data, search, sort]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8 lg:px-8">
      <LeaguePageIntro eyebrow="Составы лиги" title="Команды" description="Найдите команду по названию, тегу или игроку и посмотрите её состав. Данные обновляются из лиги."
        actions={<Link to="/my-team" className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Моя команда</Link>}>
        {teams.data && <p className="mt-5 border-t border-border pt-4 text-sm font-semibold text-foreground">В лиге: {teams.data.length} команд</p>}
      </LeaguePageIntro>
      <div className="panel grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="relative min-w-0">
          <span className="sr-only">Поиск команды</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Название, тег или игрок" className="w-full rounded-lg border border-input bg-white/80 py-2 pl-9 pr-3 text-sm" />
        </label>
        <select aria-label="Сортировка команд" value={sort} onChange={(event) => setSort(event.target.value as "name" | "members")} className="rounded-lg border border-input bg-white/80 px-3 py-2 text-sm">
          <option value="name">По названию</option>
          <option value="members">По числу игроков</option>
        </select>
      </div>
      {teams.isPending ? <QueryFeedback text="Загружаем команды…" /> : teams.isError ? <QueryFeedback text="Не удалось загрузить команды." retry={() => void teams.refetch()} /> : list.length === 0 ? (
        <QueryFeedback text={search ? "По этому запросу команд не найдено." : "Команд пока нет. Вы можете создать первую в разделе «Моя команда»."} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map((team) => {
            const members = [...team.team_members].sort((a, b) => a.position - b.position);
            return (
              <li key={team.id} className="panel min-w-0 p-5">
                <div className="flex min-w-0 items-center gap-3">
                  <TeamLogo name={team.name} logo={team.logo_url ?? undefined} size="lg" />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-xl text-foreground">{team.name}</h2>
                    {team.tag && <p className="text-xs font-bold uppercase tracking-widest text-primary">[{team.tag}]</p>}
                  </div>
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary"><Users className="size-3.5" />{members.length}</span>
                </div>
                <div className="mt-4 border-t border-border pt-3">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><Shield className="size-4" />Состав</p>
                  {members.length ? (
                    <ol className="mt-2 grid gap-1 text-sm text-foreground sm:grid-cols-2">
                      {members.map((member) => <li key={member.id} className="min-w-0 truncate rounded-md bg-white/50 px-2 py-1.5"><span className="mr-2 text-xs text-muted-foreground">{member.position}.</span>{member.nickname}</li>)}
                    </ol>
                  ) : <p className="mt-2 text-sm text-muted-foreground">Состав ещё не указан.</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
