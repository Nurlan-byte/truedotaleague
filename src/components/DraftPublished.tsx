import { RotateCcw, Shield, Users } from "lucide-react";
import { useDraftPublication } from "@/hooks/use-draft-publication";
import { isPublishedDraft } from "@/lib/draft-publication";
import { LeaguePageIntro } from "@/components/LeaguePageIntro";

export function DraftPublished() {
  const publication = useDraftPublication();
  const result = publication.data?.result;

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6">
      <LeaguePageIntro
        eyebrow="Результат драфта"
        title="Драфт"
        description="Ведущий формирует составы. Здесь появляется опубликованный им результат."
      />
      {publication.isPending ? (
        <section className="panel p-6 text-muted-foreground" role="status">
          Загружаем результат драфта…
        </section>
      ) : publication.isError ? (
        <section className="panel space-y-3 p-6" role="alert">
          <p>Не удалось загрузить результат драфта.</p>
          <button
            className="btn inline-flex items-center gap-2"
            onClick={() => publication.refetch()}
          >
            <RotateCcw className="h-4 w-4" /> Повторить
          </button>
        </section>
      ) : !isPublishedDraft(result) ? (
        <section className="panel flex items-center gap-3 p-6 text-muted-foreground">
          <Shield className="h-5 w-5 shrink-0" aria-hidden="true" />
          Ведущий пока не опубликовал результат.
        </section>
      ) : (
        <>
          <div className="panel flex flex-wrap items-center justify-between gap-2 p-5">
            <div>
              <p className="label-xs">Опубликованный результат</p>
              <h2 className="text-2xl font-bold">{result.title}</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Обновлено {new Date(publication.data!.updated_at).toLocaleString("ru-RU")}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {result.teams.map((team, index) => (
              <section className="panel p-5" key={`${team.name}-${index}`}>
                <p className="label-xs">Команда {index + 1}</p>
                <h3 className="mb-3 text-xl font-bold">{team.name}</h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  Капитан: {team.captain}
                  {team.captainNick ? ` (${team.captainNick})` : ""} ·{" "}
                  {result.captainPlays ? "играет в составе" : "не входит в игровой состав"}
                </p>
                {team.players.length ? (
                  <ol className="space-y-2">
                    {team.players.map((player, playerIndex) => (
                      <li
                        className="flex justify-between gap-3 border-t border-border pt-2"
                        key={`${player.name}-${playerIndex}`}
                      >
                        <span>
                          {player.name}
                          {player.nick ? ` (${player.nick})` : ""}
                        </span>
                        {player.rating != null && (
                          <span className="text-muted-foreground">{player.rating}</span>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" aria-hidden="true" /> Игроков пока нет
                  </p>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
