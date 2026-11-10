import { Link, useRouterState } from "@tanstack/react-router";
import tdlLogo from "@/assets/tdl-logo.png.asset.json";
import { Archive, Home, Inbox, ListChecks, Plus, Radio, Route as RouteIcon, Shield, ShieldPlus, UserCog } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAdmin } from "@/hooks/use-admin";

const items = [
  { title: "Главная", url: "/", icon: Home },
  { title: "Создать турнир", url: "/tournaments/new", icon: Plus },
  { title: "Турниры", url: "/tournaments", icon: Radio },
  { title: "Моя команда", url: "/my-team", icon: ShieldPlus },
  { title: "Команды", url: "/teams", icon: Shield },
  { title: "Архив турниров", url: "/archive", icon: Archive },
] as const;

const adminItems = [
  { title: "Заявки на турнир", url: "/applications", icon: Inbox },
  { title: "Роли и доступы", url: "/admin", icon: UserCog },
  { title: "Драфт", url: "/draft", icon: ListChecks },
  { title: "Дорога к TI", url: "/road-to-ti", icon: RouteIcon },
] as const;



export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const { isAdmin } = useAdmin();

  const visibleItems = items.filter((item) => item.url !== "/tournaments/new" || isAdmin);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="bg-white/70 backdrop-blur-md">
        <div className="flex items-center gap-2 px-3 py-4">
          <img
            src={tdlLogo.url}
            alt="TrueDotaLeague"
            width={30}
            height={30}
            loading="lazy"
            className="size-[30px] shrink-0 rounded-[9px] shadow-sm"
          />
          {!collapsed && (
            <p className="truncate text-sm font-extrabold tracking-tight text-foreground">
              TrueDota<span className="text-primary">League</span>
            </p>
          )}
        </div>
        <SidebarGroup>
          <SidebarGroupLabel>Лига</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={item.url === "/" ? currentPath === "/" : currentPath === item.url || currentPath.startsWith(item.url + "/")}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="size-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Админка</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={currentPath === item.url || currentPath.startsWith(item.url + "/")}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="size-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

      </SidebarContent>
    </Sidebar>
  );
}
