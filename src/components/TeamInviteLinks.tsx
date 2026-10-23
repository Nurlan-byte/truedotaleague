import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inviteLinkRpc, inviteReturnPath, teamInviteLinksQuery } from "@/lib/team-invite-links";

const button = "rounded-lg border border-border bg-white/70 px-3 py-2 text-sm font-semibold hover:border-primary disabled:opacity-50";
export function TeamInviteLinks({ teamId }: { teamId: string }) {
  const qc = useQueryClient();
  const links = useQuery(teamInviteLinksQuery(teamId));
  const [created, setCreated] = useState<{ id: string; url: string } | null>(null);
  const create = useMutation({
    mutationFn: () => inviteLinkRpc<{ id: string; token: string }>("create_team_invite_link", { p_team_id: teamId }),
    onSuccess: (link) => {
      setCreated({ id: link.id, url: `${window.location.origin}${inviteReturnPath(link.token)}` });
      void qc.invalidateQueries({ queryKey: ["league", "team-invite-links", teamId] });
    },
    onError: (error) => toast.error(error.message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => inviteLinkRpc("revoke_team_invite_link", { p_link_id: id }),
    onSuccess: (_, id) => {
      if (created?.id === id) setCreated(null);
      void qc.invalidateQueries({ queryKey: ["league", "team-invite-links", teamId] });
    },
    onError: (error) => toast.error(error.message),
  });
  return <section className="space-y-3 rounded-xl border border-border bg-white/40 p-4" aria-label="Приглашение по ссылке">
    <h3 className="font-semibold">Пригласить друга по ссылке</h3>
    <p className="text-sm text-muted-foreground">Одноразовая ссылка для одного друга. После входа через Discord он сам решит, вступать ли в команду. Отправляйте ссылку лично: принять её может первый свободный игрок.</p>
    {links.isError ? <div role="alert" className="text-sm"><p>{links.error.message}</p><button type="button" className={button} onClick={() => void links.refetch()}>Повторить</button></div> : <button type="button" className={button} disabled={links.isPending || create.isPending || revoke.isPending} onClick={() => create.mutate()}>Создать ссылку</button>}
    {created && <div className="space-y-2">
      <label className="grid gap-1 text-sm">Ссылка для друга<input readOnly value={created.url} className="min-w-0 w-full rounded-lg border border-input bg-white px-3 py-2" onFocus={event => event.currentTarget.select()} /></label>
      <p className="text-xs text-muted-foreground">Скопируйте сейчас: после закрытия страницы ссылка повторно не показывается. Можно отозвать её и создать новую.</p>
      <button type="button" className={button} onClick={async () => {
        try { await navigator.clipboard.writeText(created.url); toast.success("Ссылка скопирована"); }
        catch { toast.error("Выделите и скопируйте ссылку из поля."); }
      }}>Скопировать</button>
    </div>}
    {!!links.data?.length && <ul className="space-y-2 text-sm">{links.data.map((link, index) => <li key={link.id} className="flex flex-wrap items-center justify-between gap-2">
      <span>Приглашение {index + 1} · {({ pending: "Ожидает принятия", accepted: "Использовано", revoked: "Отозвано" } as Record<string, string>)[link.status] ?? "Недоступно"}</span>
      {link.status === "pending" && <button type="button" className={button} disabled={revoke.isPending} onClick={() => revoke.mutate(link.id)}>Отозвать ссылку</button>}
    </li>)}</ul>}
  </section>;
}
