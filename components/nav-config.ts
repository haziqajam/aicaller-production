export type NavItem = { label: string; href: string };
export type NavGroup = { label: string; adminOnly?: boolean; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  // Dashboard is for everyone (it was previously inside the admin-only group,
  // so regular users never saw it).
  { label: "Overview", items: [
    { label: "Dashboard", href: "/" },
  ]},
  { label: "Build", items: [
    { label: "Assistants", href: "/assistants" },
    { label: "Flows", href: "/flows" },
    { label: "Voices", href: "/voices" },
    { label: "Tools", href: "/tools" },
    { label: "Numbers", href: "/numbers" },
    { label: "Inbound", href: "/inbound" },
    { label: "Leads", href: "/leads" },
  ]},
  { label: "Run", items: [
    { label: "Campaigns", href: "/campaigns" },
    { label: "Calls", href: "/calls" },
  ]},
  // VICIdial lives in its own section, separate from the Twilio/browser calling
  // paths above. Seats are per-user; pools + alerts are admin-only (gated below).
  { label: "VICIdial", items: [
    { label: "Bot seats", href: "/seats" },
  ]},
  { label: "VICIdial admin", adminOnly: true, items: [
    { label: "Pods", href: "/vicidial/pods" },
    { label: "Pod pools", href: "/vicidial/pools" },
    { label: "Alerts", href: "/vicidial/alerts" },
  ]},
  { label: "Settings", items: [
    { label: "Twilio accounts", href: "/settings/twilio" },
  ]},
  { label: "Admin", adminOnly: true, items: [
    { label: "Users", href: "/admin/users" },
    { label: "Tiers", href: "/admin/tiers" },
    { label: "Phone Numbers", href: "/admin/numbers" },
    { label: "Fleet", href: "/admin/fleet" }
  ]},
];

export function visibleGroups(role: "user" | "admin" | null): NavGroup[] {
  return NAV_GROUPS.filter((g) => !g.adminOnly || role === "admin");
}
