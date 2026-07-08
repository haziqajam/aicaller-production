"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PlayIcon, CircleIcon, PauseIcon, CheckCircle2Icon, XCircleIcon,
  PowerOffIcon, Loader2Icon, CloudOffIcon, ArchiveIcon, HelpCircleIcon,
  type LucideIcon,
} from "lucide-react";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

type StatusTone = {
  label: string;
  variant: BadgeVariant;
  icon: LucideIcon;
  /** Extra classes (e.g. amber accent for `deprecated`). */
  className?: string;
  /** Native tooltip explaining the state. */
  title?: string;
  /** Whether the icon should spin (in-progress states). */
  spin?: boolean;
};

/**
 * Single source of truth for pod-status presentation. Every state pairs an icon
 * WITH a text label (never color alone) so it stays legible for colorblind /
 * AA users. Hoisted here so the fleet list and run-detail pages share one map.
 */
export const POD_STATUS_TONES: Record<string, StatusTone> = {
  provisioning: { label: "Provisioning", variant: "secondary", icon: Loader2Icon, spin: true },
  running: { label: "Running", variant: "default", icon: PlayIcon },
  ready: { label: "Ready", variant: "outline", icon: CheckCircle2Icon },
  idle: { label: "Idle", variant: "secondary", icon: CircleIcon },
  paused: { label: "Paused", variant: "outline", icon: PauseIcon },
  failed: { label: "Failed", variant: "destructive", icon: XCircleIcon },
  terminated: { label: "Terminated", variant: "outline", icon: PowerOffIcon },
  missing: {
    label: "Missing",
    variant: "destructive",
    icon: CloudOffIcon,
    title:
      "vast.ai silently destroyed this pod after inactivity. Inbound calls to it will not connect. Re-up to redeploy an identical pod.",
  },
  deprecated: {
    label: "Deprecated",
    variant: "outline",
    icon: ArchiveIcon,
    className: "text-amber-400 border-amber-500/30",
    title: "Superseded record kept for cost audit. Safe to ignore.",
  },
};

/** Fallback for any status the backend introduces that we don't map yet. */
function fallbackTone(status: string): StatusTone {
  return { label: status || "Unknown", variant: "secondary", icon: HelpCircleIcon };
}

/** Pod status → Badge (icon + label + optional tooltip). Never color-only. */
export function PodStatusBadge({ status }: { status: string }) {
  const tone = POD_STATUS_TONES[status] ?? fallbackTone(status);
  const Icon = tone.icon;
  return (
    <Badge variant={tone.variant} className={cn("gap-1", tone.className)} title={tone.title}>
      <Icon className={cn("size-3", tone.spin && "animate-spin")} aria-hidden />
      {tone.label}
    </Badge>
  );
}
