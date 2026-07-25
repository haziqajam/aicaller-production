"use client";

import * as React from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TwilioPresetSwitcher } from "@/components/twilio/preset-switcher";
import { getRole, logout } from "@/lib/auth";

/** A raw mongo-style id (long hex) that should never appear as a tab/breadcrumb title. */
function looksLikeId(segment: string): boolean {
  return /^[0-9a-f]{8,}$/i.test(segment);
}

function humanize(segment: string): string {
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
}

/**
 * Single source of truth for the page title derived from the pathname.
 * Drives both the breadcrumb and the browser tab (`document.title`).
 *
 * Dynamic `[id]` routes (e.g. /calls/<mongoid>) must not render the raw id —
 * fall back to a friendly name based on the parent segment.
 */
function deriveTitle(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "Dashboard";

  if (looksLikeId(last)) {
    const parent = segments[segments.length - 2];
    const dynamicNames: Record<string, string> = {
      calls: "Call details",
      assistants: "Assistant",
      campaigns: "Campaign",
      leads: "Lead",
      numbers: "Number",
      inbound: "Inbound",
      users: "User",
    };
    if (parent) {
      return dynamicNames[parent] ?? `${humanize(parent)} details`;
    }
    return "Dashboard";
  }

  return humanize(last);
}

function PageTitle() {
  const pathname = usePathname();
  return <BreadcrumbPage>{deriveTitle(pathname)}</BreadcrumbPage>;
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Keep the browser tab title in sync with the current page. The pages under
  // (app)/ are client components and can't export Next `metadata`, so we set
  // `document.title` here using the same derivation that drives the breadcrumb.
  React.useEffect(() => {
    document.title = `${deriveTitle(pathname)} · AI Caller`;
  }, [pathname]);

  // `getRole()` reads localStorage, so it returns null on the server and a real
  // value on the client → hydration mismatch. Gate it behind a mounted flag so
  // the first client render matches the server (role = null), then update.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const role = mounted ? getRole() : null;

  return (
    <SidebarProvider className="bg-sidebar">
      <AppSidebar />
      {/* One seamless content surface (header + content share bg), tucked into the
          backdrop with a single rounded top-left corner. Sidebar + backdrop share a
          color so the corner notch blends. No borders anywhere. Navbar fixed; body scrolls. */}
      <SidebarInset className="h-svh overflow-hidden md:rounded-tl-[35px] border-l bg-background shadow-none">
        {/* Topbar */}
        <header className="flex h-12 shrink-0 items-center gap-2 px-4">
          {/* Left: trigger + breadcrumb */}
          <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground transition-colors duration-150" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <PageTitle />
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Controls cluster: preset switcher + theme toggle + account, grouped in one
              flat pill. No glass/glow — decoration is reserved for genuinely live state
              (DESIGN.md: --glow-primary is for active calls/connections, not chrome). */}
          <div className="flex items-center gap-0.5 rounded-full border border-border bg-card p-1">
            <TwilioPresetSwitcher />
            <span className="mx-0.5 h-5 w-px bg-border/70" aria-hidden />
            <ThemeToggle />
            <span className="mx-0.5 h-5 w-px bg-border/70" aria-hidden />

            {/* User dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-full py-0.5 pr-2 pl-0.5 text-sm text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar className="size-7 ring-1 ring-primary/30">
                  <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                    {role === "admin" ? "A" : "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:block text-xs font-medium capitalize">
                  {role ?? "user"}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem className="text-muted-foreground text-xs" disabled>
                  Signed in as {role ?? "user"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => logout()}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
