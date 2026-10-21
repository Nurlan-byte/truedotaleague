import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { TeamList } from "@/components/TeamList";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LeaguePageIntro, QueryFeedback } from "@/components/LeaguePageIntro";
import { allTeamsQuery } from "@/lib/league-api";

export const Route = createFileRoute("/teams")({
  head: () => ({
    meta: [
      { title: "Команды — TrueDotaLeague" },
      { name: "description", content: "Команды лиги TrueDotaLeague, составы и участники." },
    ],
  }),
  component: TeamsPage,
});

function TeamsPage() {
  const teams = useQuery(allTeamsQuery());
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"name" | "members">("name");
  const list = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ru");
    const filtered = (teams.data ?? []).filter(
      (team) =>
        !needle ||
        [team.name, team.tag, ...team.team_members.map((member) => member.nickname)].some((value) =>
          value?.toLocaleLowerCase("ru").includes(needle),
        ),
    );
    return [...filtered].sort((a, b) =>
      sort === "members"
        ? b.team_members.length - a.team_members.length || a.name.localeCompare(b.name, "ru")
        : a.name.localeCompare(b.name, "ru"),
    );
  }, [teams.data, search, sort]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8 lg:px-8">
      <LeaguePageIntro
        eyebrow="Составы лиги"
        title="Команды"
        description="Найдите команду по названию, тегу или игроку и посмотрите её состав. Данные обновляются из лиги."
        actions={
          <Link
            to="/my-team"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            Моя команда
          </Link>
        }
      >
        {teams.data && (
          <p className="mt-5 border-t border-border pt-4 text-sm font-semibold text-foreground">
            В лиге: {teams.data.length} команд
          </p>
        )}
      </LeaguePageIntro>
      <div className="panel grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="relative min-w-0">
          <span className="sr-only">Поиск команды</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Название, тег или игрок"
            className="w-full rounded-lg border border-input bg-white/80 py-2 pl-9 pr-3 text-sm"
          />
        </label>
        <Select value={sort} onValueChange={(value) => setSort(value as "name" | "members")}>
          <SelectTrigger aria-label="Сортировка команд" className="sort-trigger sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="sort-menu">
            <SelectItem value="name">По названию</SelectItem>
            <SelectItem value="members">По числу игроков</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {teams.isPending ? (
        <QueryFeedback text="Загружаем команды…" />
      ) : teams.isError ? (
        <QueryFeedback text="Не удалось загрузить команды." retry={() => void teams.refetch()} />
      ) : list.length === 0 ? (
        <QueryFeedback
          text={
            search
              ? "По этому запросу команд не найдено."
              : "Команд пока нет. Вы можете создать первую в разделе «Моя команда»."
          }
        />
      ) : (
        <TeamList teams={list} />
      )}
    </div>
  );
}
