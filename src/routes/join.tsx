import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { myTeamsQuery } from "@/lib/league-api";
import { inviteDismissalKey, inviteLinkPreviewQuery, inviteLinkRpc, inviteLoginHref, validInviteToken } from "@/lib/team-invite-links";
import { TeamLogo } from "@/components/TeamLogo";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/join")({
  validateSearch: (search: Record<string, unknown>) => ({ token: validInviteToken(search.token) ? search.token : "" }),
  head: () => ({ meta: [{ title: "Приглашение в команду — TrueDotaLeague" }, { name: "referrer", content: "no-referrer" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: JoinPage,
});
function JoinPage() {
  const { token } = Route.useSearch();
  return <JoinTeamInvitation key={token} token={token} />;
}
const button = "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50";
export function JoinTeamInvitation({ token }: { token: string }) {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const preview = useQuery(inviteLinkPreviewQuery(token));
  const teams = useQuery(myTeamsQuery(user?.id));
  const [dismissal, setDismissal] = useState<{ key: string; declined: boolean } | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [reopened, setReopened] = useState(false);
  useEffect(() => {
    let active = true;
    setDismissal(null);
    setReopened(false);
    setAccepted(false);
    if (user && validInviteToken(token)) void inviteDismissalKey(token, user.id).then(key => {
      let declined = false;
      try { declined = localStorage.getItem(key) === "1"; } catch { /* A disabled storage must not prevent viewing. */ }
      if (active) setDismissal({ key, declined });
    });
    return () => { active = false; };
  }, [token, user?.id]);
  const occupied = (teams.data?.length ?? 0) > 0;
  const ready = !!user && !loading && !teams.isPending && !teams.isError && !teams.isFetching && !occupied && !preview.isError && !preview.isPending && !preview.isFetching && preview.data?.status === "pending";
  const accept = useMutation({
    mutationFn: async () => {
      if (!ready) throw new Error(occupied ? "Вы уже состоите в команде или владеете ею. Принять другую команду нельзя." : "Не удалось проверить возможность вступления. Обновите страницу.");
      return inviteLinkRpc<{ team_id: string; status: string }>("accept_team_invite_link", { p_token: token });
    },
    onSuccess: () => { setAccepted(true); void qc.invalidateQueries({ queryKey: ["league"] }); },
  });
  const decline = () => {
    if (accept.isPending) return;
    setReopened(false);
    if (dismissal) {
      try { localStorage.setItem(dismissal.key, "1"); } catch { window.location.replace("/my-team"); }
      setDismissal({ ...dismissal, declined: true });
    }
  };
  const pending = !preview.isError && !preview.isPending && preview.data?.status === "pending";
  const open = !!user && !!dismissal && (!dismissal.declined || reopened) && pending && !accepted;
  const card = preview.data?.name ? <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-white/60 p-4">
    <TeamLogo name={preview.data.name} logo={preview.data.logo_url ?? undefined} size="md" />
    <div className="min-w-0"><p className="break-words text-lg font-semibold">{preview.data.name}</p><p className="break-words text-sm text-primary">[{preview.data.tag}]</p></div>
  </div> : null;
  return <main className="mx-auto max-w-xl space-y-4 px-4 py-10">
    <h1 className="text-2xl font-bold">Приглашение в команду</h1>
    {!validInviteToken(token) ? <p role="alert">Ссылка приглашения недействительна. Попросите капитана прислать новую.</p>
      : preview.isPending ? <p role="status">Загружаем приглашение…</p>
      : preview.isError ? <div role="alert"><p>{preview.error.message}</p><button className={button} onClick={() => void preview.refetch()}>Повторить</button></div>
      : <>{card}{accepted ? <p role="status">Приглашение принято. Вы в команде.</p>
        : !pending ? <p role="status">{preview.data?.status === "revoked" ? "Капитан отозвал эту ссылку." : preview.data?.status === "accepted" ? "Эта одноразовая ссылка уже использована." : "Приглашение недоступно или команда больше не существует."}</p>
        : loading ? <p role="status">Проверяем вход…</p>
        : !user ? <><p>Войдите через Discord, чтобы принять или отклонить приглашение. Вступление не произойдёт автоматически.</p><a className={`${button} inline-block`} href={inviteLoginHref(token)}>Войти через Discord</a></>
        : dismissal?.declined && !reopened ? <><p role="status">Вы отклонили приглашение. В команду вы не вступили.</p><button className={button} onClick={() => setReopened(true)}>Посмотреть приглашение снова</button></> : null}</>}
    <a href="/my-team" className="inline-block text-sm font-semibold text-primary hover:underline">Моя команда</a>
    <Dialog open={open} onOpenChange={value => { if (!value) decline(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Вступить в команду?</DialogTitle><DialogDescription>Решение за вами. Ссылка используется один раз после принятия.</DialogDescription></DialogHeader>
        {card}
        {occupied && <p role="alert" className="text-sm">Вы уже состоите в команде или владеете ею. Принять другую команду нельзя.</p>}
        {teams.isPending && <p role="status">Проверяем ваш состав…</p>}
        {teams.isError && <div role="alert"><p>Не удалось проверить вашу команду.</p><button onClick={() => void teams.refetch()} className="text-primary">Повторить</button></div>}
        {accept.isError && <p role="alert" className="text-sm text-destructive">{accept.error.message}</p>}
        <div className="flex flex-wrap gap-2"><button className={button} disabled={!ready || accept.isPending} onClick={() => accept.mutate()}>Принять</button><button className="rounded-lg border border-border px-4 py-2 text-sm font-semibold" disabled={accept.isPending} onClick={decline}>Отклонить</button></div>
      </DialogContent>
    </Dialog>
  </main>;
}
