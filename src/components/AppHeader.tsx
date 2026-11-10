import { Link } from "@tanstack/react-router";
import { LogIn, LogOut } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { TeamLogo } from "@/components/TeamLogo";
import { useAuth } from "@/hooks/use-auth";

export function AppHeader() {
  const { user, profile, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/70 px-3 backdrop-blur-xl backdrop-saturate-150">
      <SidebarTrigger />
      <img
        src={tdlLogo}
        alt="TrueDotaLeague"
        width={26}
        height={26}
        loading="lazy"
        className="size-[26px] shrink-0 rounded-[8px] shadow-sm"
      />
      <p className="min-w-0 truncate text-sm font-extrabold tracking-tight text-foreground">Лига по Дота 2</p>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {user ? (
          <>
            <Link
              to="/profile"
              className="flex items-center gap-2 rounded-full bg-white/70 px-2 py-1.5 text-sm font-semibold text-foreground transition-colors hover:text-primary"
            >
              <TeamLogo
                name={profile?.nickname || user.email || "?"}
                logo={profile?.avatar_url ?? undefined}
                size="sm"
              />
              <span className="hidden max-w-[140px] truncate sm:inline">{profile?.nickname || user.email}</span>
            </Link>
            <button
              onClick={signOut}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-white/60 px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <LogOut className="size-4" />
              <span className="sr-only sm:not-sr-only">Выйти</span>
            </button>
          </>
        ) : (
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:scale-105 active:scale-95"
          >
            <LogIn className="size-4" /> Вход
          </Link>
        )}
      </div>
    </header>
  );
}
