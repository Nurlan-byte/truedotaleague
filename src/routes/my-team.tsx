import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ImagePlus, Plus, Send, Shield, Trash2, Users, X } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { useAuth } from "@/hooks/use-auth";
import { useTournamentState } from "@/hooks/use-tournament-state";
import { fileToLogoDataUrl, validateLogoFile } from "@/lib/image";

export const Route = createFileRoute("/my-team")({
  head: () => ({
    meta: [
      { title: "Моя команда — создание состава | TrueDotaLeague" },
      {
        name: "description",
        content:
          "Создайте свою команду по Dota 2: название, тег, логотип и состав игроков, затем подайте заявку на участие в турнире лиги.",
      },
      { property: "og:title", content: "Моя команда — TrueDotaLeague" },
      {
        property: "og:description",
        content: "Создание команды и заявка на участие в турнире лиги по Dota 2.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyTeamPage,
});

function MyTeamPage() {
  const { user, profile } = useAuth();
  const { state, actions } = useTournamentState();

  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [player, setPlayer] = useState({ nickname: "", role: "", mmr: "" });

  const myTeams = user ? state.roster.filter((t) => t.ownerId === user.id) : [];
  const registrationOpen = state.bracket.length === 0 && state.groups.length === 0;

  const create = () => {
    if (!name.trim()) return toast.error("Введите название команды");
    if (state.roster.some((t) => t.name.toLowerCase() === name.trim().toLowerCase()))
      return toast.error("Команда с таким названием уже существует");
    actions.createRosterTeam(
      { name, tag },
      { id: user!.id, name: profile?.nickname || undefined },
    );
    toast.success("Команда создана");
    setName("");
    setTag("");
  };

  const upload = async (teamId: string, file: File) => {
    const err = validateLogoFile(file);
    if (err) return toast.error(err);
    try {
      actions.updateRosterTeam(teamId, { logo: await fileToLogoDataUrl(file) });
      toast.success("Логотип обновлён");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось загрузить логотип");
    }
  };

  const addPlayer = (teamId: string) => {
    if (!player.nickname.trim()) return toast.error("Введите ник игрока");
    const mmr = player.mmr.trim() ? Number(player.mmr.replace(/\D/g, "")) : null;
    actions.addRosterPlayer(teamId, player.nickname, player.role, mmr);
    setPlayer({ nickname: "", role: "", mmr: "" });
  };

  const apply = (teamId: string) => {
    if (!registrationOpen)
      return toast.error("Приём заявок закрыт: турнир уже начался. Дождитесь следующего.");
    actions.applyToTournament(teamId);
    toast.success("Заявка отправлена админам лиги — ожидайте подтверждения");
  };


  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
        <h1 className="flex items-center gap-2 text-4xl text-foreground">
          <Shield className="size-7 text-primary" /> Моя команда
        </h1>
        <div className="panel mt-5 p-5 text-sm text-muted-foreground">
          Чтобы создать команду и подать заявку на турнир,{" "}
          <Link to="/auth" className="font-semibold text-primary hover:underline">
            войдите в аккаунт
          </Link>
          .
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <h1 className="flex items-center gap-2 text-4xl text-foreground">
        <Shield className="size-7 text-primary" /> Моя команда
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Создайте команду, соберите состав, а затем подайте заявку на участие в турнире{" "}
        <span className="font-semibold text-foreground">«{state.title}»</span>.{" "}
        {registrationOpen ? "Приём заявок открыт." : "Приём заявок закрыт — турнир уже начался."}
      </p>

      <div className="panel mt-5 p-5">
        <h2 className="text-lg font-semibold text-foreground">Создать команду</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название команды"
            className="min-w-0 flex-1 rounded-lg border border-input bg-white/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:bg-white"
          />
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Тег (напр. TDL)"
            maxLength={8}
            className="w-full rounded-lg border border-input bg-white/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:bg-white sm:w-40"
          />
          <button
            onClick={create}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm"
          >
            <Plus className="size-4" /> Создать
          </button>
        </div>
      </div>

      {myTeams.length === 0 && (
        <div className="panel mt-5 p-5 text-sm text-muted-foreground">
          У вас пока нет команды. Создайте её выше — после этого появится кнопка подачи заявки на
          турнир.
        </div>
      )}

      <div className="mt-5 space-y-5">
        {myTeams.map((team) => {
          const applied = state.teams.find((t) => t.rosterId === team.id);
          const application = state.applications.find((a) => a.rosterId === team.id);
          return (

            <div key={team.id} className="panel p-5">
              <div className="flex items-center gap-3">
                <TeamLogo name={team.name} logo={team.logo} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold text-foreground">
                    {team.name}
                    {team.tag && (
                      <span className="ml-2 text-xs font-semibold uppercase tracking-wider text-primary">
                        [{team.tag}]
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Создана {team.createdAt} · игроков: {team.players.length}
                  </p>
                </div>
                <label
                  className="cursor-pointer text-muted-foreground transition-colors hover:text-primary"
                  title="Загрузить логотип"
                >
                  <ImagePlus className="size-5" />
                  <span className="sr-only">Логотип команды {team.name}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(team.id, f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  onClick={() => {
                    if (confirm(`Удалить команду «${team.name}»? Заявка тоже будет снята.`)) {
                      actions.removeRosterTeam(team.id);
                      toast.success("Команда удалена");
                    }
                  }}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                  aria-label={`Удалить команду ${team.name}`}
                >
                  <Trash2 className="size-5" />
                </button>
              </div>

              <div className="mt-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Users className="size-4 text-primary" /> Состав
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {team.players.length === 0 && (
                    <li className="text-xs text-muted-foreground">
                      Игроков нет — добавьте до 7 участников (5 основных и запасные).
                    </li>
                  )}
                  {team.players.map((p, i) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 rounded-lg bg-white/50 px-3 py-2 text-sm text-foreground"
                    >
                      <span className="w-4 text-xs font-semibold text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{p.nickname}</span>
                      {p.role && (
                        <span className="shrink-0 text-xs text-muted-foreground">{p.role}</span>
                      )}
                      {p.mmr ? (
                        <span className="shrink-0 text-xs font-semibold text-primary">
                          {p.mmr} MMR
                        </span>
                      ) : null}
                      <button
                        onClick={() => actions.removeRosterPlayer(team.id, p.id)}
                        className="text-muted-foreground transition-colors hover:text-destructive"
                        aria-label={`Убрать ${p.nickname}`}
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>

                {team.players.length < 7 && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={player.nickname}
                      onChange={(e) => setPlayer({ ...player, nickname: e.target.value })}
                      placeholder="Ник игрока"
                      className="min-w-0 flex-1 rounded-lg border border-input bg-white/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:bg-white"
                    />
                    <input
                      value={player.role}
                      onChange={(e) => setPlayer({ ...player, role: e.target.value })}
                      placeholder="Позиция (1-5)"
                      className="w-full rounded-lg border border-input bg-white/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:bg-white sm:w-36"
                    />
                    <input
                      value={player.mmr}
                      onChange={(e) => setPlayer({ ...player, mmr: e.target.value })}
                      placeholder="MMR"
                      inputMode="numeric"
                      className="w-full rounded-lg border border-input bg-white/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:bg-white sm:w-24"
                    />
                    <button
                      onClick={() => addPlayer(team.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-white/60 px-3 py-2 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
                    >
                      <Plus className="size-4" /> Добавить
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4 border-t border-border pt-4">
                {applied ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <CheckCircle2 className="size-4 text-primary" /> Заявка на «{state.title}»
                      подана {applied.registeredAt}
                    </p>
                    <button
                      onClick={() => {
                        actions.withdrawApplication(team.id);
                        toast.success("Заявка снята");
                      }}
                      className="rounded-lg border border-border bg-white/60 px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-destructive hover:text-destructive"
                    >
                      Снять заявку
                    </button>
                    <Link
                      to="/teams"
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Список участников турнира
                    </Link>
                  </div>
                ) : (
                  <button
                    onClick={() => apply(team.id)}
                    disabled={!registrationOpen}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Send className="size-4" /> Подать заявку на «{state.title}»
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
