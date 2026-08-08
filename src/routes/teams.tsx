import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ImagePlus, Plus, Shield, Trash2 } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { useAdmin } from "@/hooks/use-admin";
import { useTournamentState } from "@/hooks/use-tournament-state";
import { fileToLogoDataUrl, validateLogoFile } from "@/lib/image";

export const Route = createFileRoute("/teams")({
  head: () => ({
    meta: [
      { title: "Команды лиги — TrueDotaLeague" },
      {
        name: "description",
        content:
          "Состав участников лиги по Dota 2: названия команд и логотипы. Администраторы могут добавлять команды и загружать логотипы.",
      },
      { property: "og:title", content: "Команды лиги TrueDotaLeague" },
      { property: "og:description", content: "Список команд лиги по Dota 2 с логотипами." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamsPage,
});

function TeamsPage() {
  const { isAdmin } = useAdmin();
  const { state, actions } = useTournamentState();
  const [name, setName] = useState("");
  const [logoError, setLogoError] = useState<string | null>(null);

  const upload = async (id: string, file: File) => {
    const vErr = validateLogoFile(file);
    if (vErr) return setLogoError(vErr);
    try {
      actions.setTeamLogo(id, await fileToLogoDataUrl(file));
      setLogoError(null);
    } catch (e) {
      setLogoError(e instanceof Error ? e.message : "Не удалось загрузить логотип");
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <h1 className="flex items-center gap-2 text-4xl text-foreground">
        <Shield className="size-7 text-primary" /> Команды ({state.teams.length})
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Официальный состав участников лиги. Сетку групп и плей-офф можно создать только после того,
        как команды добавлены здесь.
      </p>

      {isAdmin && (
        <div className="panel mt-5 p-5">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  actions.addTeams(name);
                  setName("");
                }
              }}
              placeholder="Название команды"
              className="min-w-0 flex-1 rounded-lg border border-input bg-white/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:bg-white"
            />
            <button
              onClick={() => {
                actions.addTeams(name);
                setName("");
              }}
              className="inline-flex items-center rounded-lg bg-primary px-3 text-primary-foreground shadow-sm"
              aria-label="Добавить команду"
            >
              <Plus className="size-4" />
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Можно вставить сразу несколько названий через запятую. Дубликаты не добавляются.
          </p>
          {logoError && (
            <p className="mt-2 text-xs font-semibold text-destructive">{logoError}</p>
          )}
          {state.teams.length > 0 && (
            <button
              onClick={() => {
                if (
                  confirm(
                    `Удалить все команды (${state.teams.length}) и текущие группы с сеткой? Действие необратимо.`,
                  )
                ) {
                  actions.clearTeams();
                }
              }}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-white/60 px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" /> Очистить список команд
            </button>
          )}
        </div>
      )}

      <ul className="panel mt-5 space-y-1.5 p-4">
        {state.teams.length === 0 && (
          <li className="p-2 text-sm text-muted-foreground">
            Команд пока нет. {isAdmin ? "Добавьте участников выше." : "Ожидайте регистрацию команд."}
          </li>
        )}
        {state.teams.map((t, i) => (
          <li
            key={t.id}
            className="flex items-center gap-3 rounded-lg bg-white/50 px-3 py-2 text-sm text-foreground"
          >
            <span className="w-5 text-xs font-semibold text-muted-foreground">{i + 1}</span>
            <TeamLogo name={t.name} logo={t.logo} size="md" />
            <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
            {t.registeredAt && (
              <span className="hidden shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:inline">
                заявлена {t.registeredAt}
              </span>
            )}
            {isAdmin && (
              <>
                <label
                  className="cursor-pointer text-muted-foreground transition-colors hover:text-primary"
                  title="Загрузить логотип"
                >
                  <ImagePlus className="size-4" />
                  <span className="sr-only">Логотип команды {t.name}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(t.id, f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  onClick={() => actions.removeTeam(t.id)}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                  aria-label={`Удалить ${t.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
