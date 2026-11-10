import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Shield, Users } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { LoadingPanel } from "@/components/league";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { rpcErrorText } from "@/lib/league";

export const Route = createFileRoute("/join/$token")({
  head: () => ({
    meta: [
      { title: "Приглашение в команду | TrueDotaLeague" },
      { name: "description", content: "Вступите в команду лиги TrueDotaLeague по ссылке-приглашению капитана." },
      { property: "og:title", content: "Приглашение в команду — TrueDotaLeague" },
      { property: "og:description", content: "Капитан приглашает вас в команду по Dota 2. Войдите через Discord и вступите." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JoinPage,
});

type Preview = { team_id: string; name: string; tag: string; logo_url: string | null; members: number };

function JoinPage() {
  const { token } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const preview = useQuery({
    queryKey: ["join-preview", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("preview_team_invite_link", { p_token: token });
      if (error) throw error;
      return (data as Preview | null) ?? null;
    },
  });

  useEffect(() => {
    if (!loading && !user) window.localStorage.setItem("tdl-pending-invite", token);
  }, [loading, user, token]);

  useEffect(() => {
    if (loading || !user || !preview.data || joining || error) return;
    setJoining(true);
    (async () => {
      const { error: err } = await supabase.rpc("join_team_by_link", { p_token: token });
      window.localStorage.removeItem("tdl-pending-invite");
      if (err) {
        setError(rpcErrorText(err));
        setJoining(false);
        return;
      }
      await qc.invalidateQueries({ queryKey: ["league"] });
      navigate({ to: "/my-team", replace: true });
    })();
  }, [loading, user, preview.data, joining, error, token, qc, navigate]);

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="flex items-center gap-2 text-3xl text-foreground">
        <Shield className="size-7 text-primary" /> Приглашение в команду
      </h1>
      {preview.isLoading || loading ? (
        <div className="mt-5"><LoadingPanel /></div>
      ) : !preview.data ? (
        <div className="panel mt-5 p-5 text-sm text-muted-foreground">
          Ссылка недействительна или капитан создал новую. Попросите актуальную ссылку.
        </div>
      ) : (
        <div className="panel mt-5 p-5">
          <div className="flex items-center gap-3">
            <TeamLogo name={preview.data.name} logo={preview.data.logo_url ?? undefined} size={56} />
            <div>
              <p className="text-lg font-semibold text-foreground">{preview.data.name} <span className="text-muted-foreground">[{preview.data.tag}]</span></p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="size-3" /> игроков: {preview.data.members}/7</p>
            </div>
          </div>
          {!user ? (
            <div className="mt-4 text-sm text-muted-foreground">
              Чтобы вступить,{" "}
              <Link to="/auth" className="font-semibold text-primary hover:underline">войдите через Discord</Link>
              {" "}— после входа вы автоматически станете участником.
            </div>
          ) : error ? (
            <div className="mt-4 text-sm text-destructive">
              {error}. <Link to="/my-team" className="font-semibold text-primary hover:underline">Моя команда</Link>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Вступаем в команду…</p>
          )}
        </div>
      )}
    </div>
  );
}
