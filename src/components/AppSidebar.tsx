import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, Plus, Radio, Route as RouteIcon, Shield, Trophy, Users } from "lucide-react";
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

const items = [
  { title: "Создать турнир", url: "/", icon: Plus },
  { title: "Турнир онлайн", url: "/live", icon: Radio },
  { title: "Команды", url: "/teams", icon: Shield },
  { title: "Турниры", url: "/tournaments", icon: LayoutGrid },
  { title: "Рейтинг команд", url: "/rating-teams", icon: Trophy },
  { title: "Рейтинг игроков", url: "/players", icon: Users },
  { title: "Дорога к TI", url: "/road-to-ti", icon: RouteIcon },
] as const;

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({ select: (r) => r.location.pathname });

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
              {items.map((item) => (
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
      </SidebarContent>
    </Sidebar>
  );
}
