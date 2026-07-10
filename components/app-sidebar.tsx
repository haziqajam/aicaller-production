"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getRole, logout } from "@/lib/auth";
import { visibleGroups } from "@/components/nav-config";
import {
  ChevronUpIcon,
  BotIcon,
  PhoneIcon,
  PhoneIncomingIcon,
  UsersIcon,
  MegaphoneIcon,
  PhoneCallIcon,
  ShieldIcon,
  LayoutDashboardIcon,
  WorkflowIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Map each nav href to a lucide icon */
const NAV_ICONS: Record<string, React.ElementType> = {
  "/dashboard": LayoutDashboardIcon,
  "/assistants": BotIcon,
  "/flows": WorkflowIcon,
  "/numbers": PhoneIcon,
  "/inbound": PhoneIncomingIcon,
  "/leads": UsersIcon,
  "/campaigns": MegaphoneIcon,
  "/calls": PhoneCallIcon,
  "/admin/users": ShieldIcon,
  "/admin/numbers": PhoneIcon,
  "/": LayoutDashboardIcon,
};

export function AppSidebar() {
  const pathname = usePathname();
  // Gate role-dependent rendering behind a mounted flag so the first client
  // render matches the server render (both with role = null). getRole() returns
  // null on the server (no window) and the real role on the client; reading it
  // during the initial render would change the number of <SidebarGroup>
  // elements vs. the server HTML and cause a hydration mismatch.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const role = mounted ? getRole() : null;
  const groups = visibleGroups(role);

  return (
    <Sidebar collapsible="icon" className="border-0 bg-sidebar">
      {/* Brand header */}
      <SidebarHeader className="px-4 py-3">
        <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
          {/* Mark: a simple phone-in-circle */}
          <div className="relative flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/25">
            <PhoneCallIcon className="size-3.5 text-primary" aria-hidden />
            {/* Live status dot */}
            <span
              className={cn(
                "absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary",
                "ring-2 ring-sidebar",
                /* subtle pulse — respects reduced-motion via globals.css */
                "animate-pulse"
              )}
              aria-hidden
            />
          </div>
          {/* Wordmark */}
          <span className="text-sm font-semibold tracking-tight text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            AI Caller
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="px-2">
            <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 group-data-[collapsible=icon]:hidden">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(item.href));
                  const Icon = NAV_ICONS[item.href] ?? PhoneCallIcon;
                  return (
                    <SidebarMenuItem key={item.href} className="relative">
                      {/* Active left-edge indicator */}
                      {isActive && (
                        <span
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-primary"
                          aria-hidden
                        />
                      )}
                      <SidebarMenuButton
                        isActive={isActive}
                        render={<Link href={item.href} />}
                        tooltip={item.label}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
                          "transition-colors duration-150",
                          "text-sidebar-foreground/80",
                          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                          isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        )}
                      >
                        <Icon className="size-4 shrink-0" aria-hidden />
                        <span className="group-data-[collapsible=icon]:hidden">
                          {item.label}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="px-2 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground ring-sidebar-ring outline-none transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2">
            <Avatar className="size-7 shrink-0">
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                {role === "admin" ? "A" : "U"}
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 truncate text-left text-sm font-medium capitalize group-data-[collapsible=icon]:hidden">
              {role ?? "user"}
            </span>
            <ChevronUpIcon className="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-48">
            <DropdownMenuItem className="text-muted-foreground text-xs" disabled>
              Signed in as {role ?? "user"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/api-settings" />}>
              API settings
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => logout()}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
