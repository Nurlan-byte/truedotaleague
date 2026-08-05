import { Link } from "@tanstack/react-router";
import { LogIn, LogOut } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { TeamLogo } from "@/components/TeamLogo";
import { useAuth } from "@/hooks/use-auth";

export function AppHeader() {
  const { user, profile, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-white/60 px-3 backdrop-blur-md">
      <SidebarTrigger />
      <p className="text-sm font-bold uppercase tracking-widest text-primary">Лига по Дота 2</p>
      <div className="ml-auto flex items-center gap-2">
        {user ? (
          <>
            <Link
              to="/profile"
              className="flex items-center gap-2 rounded-lg bg-white/70 px-2 py-1.5 text-sm font-semibold text-foreground transition-colors hover:text-primary"
            >
              <TeamLogo
                name={profile?.nickname || user.email || "?"}
                logo={profile?.avatar_url ?? undefined}
                size="sm"
              />
              <span className="max-w-[140px] truncate">{profile?.nickname || user.email}</span>
            </Link>
            <button
              onClick={signOut}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-white/60 px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <LogOut className="size-4" />
              <span className="sr-only sm:not-sr-only">Выйти</span>
            </button>
          </>
        ) : (
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:scale-105 active:scale-95"
          >
            <LogIn className="size-4" /> Вход
          </Link>
        )}
      </div>
    </header>
  );
}
