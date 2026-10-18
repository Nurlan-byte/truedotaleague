import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, Eye, Pencil, Send } from "lucide-react";
import { LoadingPanel, SafeMarkdown } from "@/components/league";
import { btnGhost, btnPrimary, field } from "@/components/TournamentEditor";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/use-admin";
import { regulationQuery } from "@/lib/league-api";
import { formatLeagueDate, LEAGUE_TZ_LABEL, rpcErrorText } from "@/lib/league";
import { fromLeagueInput, regulationVersionsQuery, usersWithRolesQuery } from "@/lib/league-admin";

export const Route = createFileRoute("/regulations")({
  head: () => ({
    meta: [
      { title: "Регламент лиги — TrueDotaLeague" },
      {
        name: "description",
        content: "Официальный регламент турниров лиги TrueDotaLeague по Dota 2.",
      },
      { property: "og:title", content: "Регламент TrueDotaLeague" },
      { property: "og:description", content: "Правила участия команд в турнирах лиги по Dota 2." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegulationsPage,
});

function RegulationsPage() {
  const { data, isLoading, error } = useQuery(regulationQuery());
  const { isAdmin } = useAdmin();
  const [editing, setEditing] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex flex-1 items-center gap-2 text-4xl text-foreground">
          <BookOpen className="size-7 text-primary" /> Регламент
        </h1>
        {isAdmin && !editing && (
          <button className={btnGhost} onClick={() => setEditing(true)}>
            <Pencil className="size-4" /> Редактировать
          </button>
        )}
      </div>
      <div className="mt-5 space-y-5">
        {isAdmin && editing && (
          <RegulationEditor publishedBody={data?.body ?? ""} onClose={() => setEditing(false)} />
        )}
        {isLoading ? (
          <LoadingPanel />
        ) : error ? (
          <LoadingPanel text="Не удалось загрузить регламент. Обновите страницу." />
        ) : !data ? (
          <LoadingPanel text="Регламент ещё не опубликован." />
        ) : (
          <article className="panel p-5">
            <p className="mb-4 text-xs text-muted-foreground">
              Опубликован: {formatLeagueDate(data.published_at) ?? "—"}
              {data.effective_from && ` · действует с ${formatLeagueDate(data.effective_from)}`}
            </p>
            <SafeMarkdown body={data.body} />
          </article>
        )}
        {isAdmin && <VersionHistory viewId={viewId} onView={setViewId} />}
      </div>
    </div>
  );
}

function RegulationEditor({
  publishedBody,
  onClose,
}: {
  publishedBody: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const versions = useQuery(regulationVersionsQuery());
  const draft = (versions.data ?? []).find((v) => v.status === "draft");
  const [body, setBody] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [effective, setEffective] = useState("");
  const [busy, setBusy] = useState(false);
  const text = body ?? draft?.body ?? publishedBody;

  const saveDraft = async (): Promise<string | null> => {
    setBusy(true);
    try {
      if (draft) {
        const { error } = await supabase
          .from("regulation_versions")
          .update({ body: text })
          .eq("id", draft.id);
        if (error) throw error;
        return draft.id;
      }
      let { data: reg } = await supabase.from("regulations").select("id").limit(1).maybeSingle();
      if (!reg) {
        const ins = await supabase
          .from("regulations")
          .insert({ title: "Регламент лиги", singleton: true })
          .select("id")
          .single();
        if (ins.error) throw ins.error;
        reg = ins.data;
      }
      const { data: u } = await supabase.auth.getUser();
      const { data: v, error } = await supabase
        .from("regulation_versions")
        .insert({ regulation_id: reg.id, body: text, status: "draft", author_id: u.user?.id })
        .select("id")
        .single();
      if (error) throw error;
      return v.id;
    } catch (e) {
      toast.error(rpcErrorText(e as { message?: string }));
      return null;
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["league", "regulation-versions"] });
    }
  };

  const publish = async () => {
    if (!text.trim()) return toast.error("Текст регламента пуст");
    const id = await saveDraft();
    if (!id) return;
    const { error } = await supabase.rpc("publish_regulation", {
      p_version_id: id,
      p_effective_from: fromLeagueInput(effective) ?? undefined,
    });
    if (error) return toast.error(rpcErrorText(error));
    toast.success("Регламент опубликован");
    qc.invalidateQueries({ queryKey: ["league"] });
    onClose();
  };

  return (
    <div className="panel space-y-3 p-5">
      <p className="text-sm text-muted-foreground">
        Черновик не виден посетителям, пока вы его не опубликуете. Поддерживается простой markdown.
      </p>
      <div className="flex gap-2">
        <button className={preview ? btnGhost : btnPrimary} onClick={() => setPreview(false)}>
          <Pencil className="size-4" /> Текст
        </button>
        <button className={preview ? btnPrimary : btnGhost} onClick={() => setPreview(true)}>
          <Eye className="size-4" /> Предпросмотр
        </button>
      </div>
      {preview ? (
        <div className="rounded-lg border border-border bg-white/60 p-4">
          <SafeMarkdown body={text} />
        </div>
      ) : (
        <textarea
          className={field + " min-h-80 font-mono"}
          value={text}
          onChange={(e) => setBody(e.target.value)}
        />
      )}
      <label className="block space-y-1 text-sm">
        <span className="font-semibold">Действует с {LEAGUE_TZ_LABEL} (пусто — сразу)</span>
        <input
          type="datetime-local"
          className={field + " max-w-xs"}
          value={effective}
          onChange={(e) => setEffective(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          className={btnGhost}
          disabled={busy}
          onClick={async () => (await saveDraft()) && toast.success("Черновик сохранён")}
        >
          Сохранить черновик
        </button>
        <button className={btnPrimary} disabled={busy} onClick={publish}>
          <Send className="size-4" /> Опубликовать
        </button>
        <button className={btnGhost} onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

function VersionHistory({
  viewId,
  onView,
}: {
  viewId: string | null;
  onView: (id: string | null) => void;
}) {
  const { data = [] } = useQuery(regulationVersionsQuery());
  const users = useQuery(usersWithRolesQuery());
  const nick = new Map((users.data ?? []).map((u) => [u.id, u.nickname]));
  if (!data.length) return null;
  const viewing = data.find((v) => v.id === viewId);
  return (
    <section className="panel space-y-2 p-5">
      <h2 className="text-xl text-foreground">История версий</h2>
      <ul className="space-y-1.5 text-sm">
        {data.map((v) => (
          <li
            key={v.id}
            className="flex flex-wrap items-center gap-2 rounded-lg bg-white/50 px-3 py-1.5"
          >
            <span className="font-semibold">
              {v.status === "published" ? "Опубликована" : "Черновик"}
            </span>
            <span className="text-xs text-muted-foreground">
              создана {formatLeagueDate(v.created_at)}
              {v.published_at && ` · опубликована ${formatLeagueDate(v.published_at)}`}
              {v.effective_from && ` · действует с ${formatLeagueDate(v.effective_from)}`} · автор{" "}
              {nick.get(v.author_id ?? "") ?? "—"}
            </span>
            <button
              className="ml-auto text-xs font-semibold text-primary"
              onClick={() => onView(viewId === v.id ? null : v.id)}
            >
              {viewId === v.id ? "Скрыть" : "Открыть"}
            </button>
          </li>
        ))}
      </ul>
      {viewing && (
        <div className="rounded-lg border border-border bg-white/60 p-4">
          <SafeMarkdown body={viewing.body} />
        </div>
      )}
    </section>
  );
}
