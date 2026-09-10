import { Link, useRouterState } from "@tanstack/react-router";
import { Archive, Home, Inbox, LayoutGrid, Plus, Radio, Route as RouteIcon, Shield, ShieldPlus, Trophy, UserCog, Users } from "lucide-react";
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
  { title: "Создать турнир", url: "/create", icon: Plus },
  { title: "Турнир онлайн", url: "/live", icon: Radio },
  { title: "Моя команда", url: "/my-team", icon: ShieldPlus },
  { title: "Команды", url: "/teams", icon: Shield },
  { title: "Турниры", url: "/tournaments", icon: LayoutGrid },
  { title: "Архив турниров", url: "/archive", icon: Archive },
  { title: "Рейтинг команд", url: "/rating-teams", icon: Trophy },
  { title: "Рейтинг игроков", url: "/players", icon: Users },
  { title: "Дорога к TI", url: "/road-to-ti", icon: RouteIcon },
] as const;



export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const { isAdmin } = useAdmin();

  const visibleItems = items.filter((item) =>
    item.url !== "/create" || isAdmin,
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="bg-white/70 backdrop-blur-md">
        <div className="px-3 py-4">
          <p className="truncate text-xs font-bold uppercase tracking-[0.3em] text-primary">
            {collapsed ? "TDL" : "TrueDotaLeague"}
          </p>
        </div>
        <SidebarGroup>
          <SidebarGroupLabel>Лига</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={currentPath === item.url}>
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
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={currentPath === "/applications"}>
                    <Link to="/applications" className="flex items-center gap-2">
                      <Inbox className="size-4" />
                      {!collapsed && <span>Заявки на турнир</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={currentPath === "/admin"}>
                    <Link to="/admin" className="flex items-center gap-2">
                      <UserCog className="size-4" />
                      {!collapsed && <span>Роли и доступы</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

      </SidebarContent>
    </Sidebar>
  );
}
