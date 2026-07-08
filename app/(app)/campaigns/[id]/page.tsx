"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Campaigns, CampaignRuns, Assistants, LeadLists } from "@/lib/api/resources";
import { toastApiError, parseApiError } from "@/lib/api/errors";
import { POLL } from "@/lib/query";
import { StatusChip } from "@/components/status-chip";
import { CampaignResults } from "@/components/campaign/campaign-results";
import { CampaignAnalysisCard } from "@/components/campaign/campaign-analysis";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PieChart, Pie, Cell } from "recharts";
import {
  ArrowLeftIcon,
  MegaphoneIcon,
  BotIcon,
  PhoneOutgoingIcon,
  UsersIcon,
  GaugeIcon,
  ClockIcon,
  CalendarIcon,
  TimerIcon,
  PlayIcon,
  StopCircleIcon,
  MessagesSquareIcon,
  RepeatIcon,
  type LucideIcon,
} from "lucide-react";

// ─── chart config using semantic chart vars ───────────────────────────────────
const chartConfig = {
  called: { label: "Called", color: "var(--chart-1)" },
  failed: { label: "Failed", color: "var(--chart-5)" },
  remaining: { label: "Remaining", color: "var(--chart-2)" },
} satisfies ChartConfig;

// Per-section accent tones for header icon badges (mirrors editor-form).
const TONE: Record<string, string> = {
  cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
};

function SectionHeader({
  icon: Icon,
  title,
  description,
  tone = "cyan",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  tone?: keyof typeof TONE;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg border",
          TONE[tone]
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold leading-tight text-foreground">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

/** A labelled config cell with an icon for the campaign-setup card. */
function ConfigItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 truncate text-sm font-medium text-foreground">
          {value}
        </p>
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function safePercent(part: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.round((part / total) * 100));
}

// ─── page ─────────────────────────────────────────────────────────────────────
export default function CampaignProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [stopOpen, setStopOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["campaigns", id, "progress"],
    queryFn: () => Campaigns.progress(id),
    // Calm live updates — refetch silently in background, no flashing. Stop
    // polling once the run is finished (nothing left to dial): every lead has
    // a terminal outcome, so further requests would just spin forever.
    refetchInterval: (query) => {
      const d = query.state.data;
      if (d && d.total > 0 && d.remaining <= 0) return POLL.off;
      return POLL.live;
    },
    // Keep previous data visible during refetch to avoid layout jumps
    placeholderData: (prev) => prev,
  });

  // Campaign metadata (config) comes from the single-doc endpoint (cleaner than
  // scanning the now-paginated list, and works regardless of which page it's on).
  const { data: campaign } = useQuery({
    queryKey: ["campaigns", id],
    queryFn: () => Campaigns.get(id),
  });
  const { data: assistants } = useQuery({
    queryKey: ["assistants"],
    queryFn: Assistants.list,
  });

  // Lead lists are only needed to resolve the count for list-backed campaigns
  // (the wizard now creates campaigns with leadIds:[] + a listId). Skip the
  // request entirely for legacy campaigns that carry explicit leadIds.
  const { data: leadLists } = useQuery({
    queryKey: ["lead-lists"],
    queryFn: LeadLists.list,
    enabled: Boolean(campaign?.listId),
  });

  const assistantName = campaign?.assistantId
    ? assistants?.find((a) => a.id === campaign.assistantId)?.name ??
      `${campaign.assistantId.slice(0, 8)}…`
    : "—";

  const stopMutation = useMutation({
    mutationFn: () => Campaigns.stop(id),
    onSuccess: () => {
      toast.success("Campaign stopped.");
      setStopOpen(false);
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (err) => {
      toastApiError(err, "Couldn't stop campaign");
    },
  });

  // Launching goes through the SAME fleet gate as the wizard: it submits a run
  // request for an admin to review + provision (status "requested"). It only dials
  // directly when the fleet is disabled (debug mode → status "started"). This is why
  // we call CampaignRuns.create, NOT Campaigns.start (the low-level direct-dial
  // primitive used by pods/redial) — otherwise a user would bypass the approval gate.
  const startMutation = useMutation({
    mutationFn: () => CampaignRuns.create(id),
    onSuccess: (run) => {
      if (run.status === "started") {
        toast.success("Campaign started — calls are placing now (direct dial, fleet disabled).");
      } else {
        toast.success("Campaign submitted — waiting for an admin to review and deploy the fleet.");
      }
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaigns", id, "progress"] });
    },
    onError: (err) => {
      toastApiError(err, "Couldn't launch campaign");
    },
  });

  const total = data?.total ?? 0;
  const called = data?.called ?? 0;
  const failed = data?.failed ?? 0;
  const remaining = data?.remaining ?? 0;
  const pct = safePercent(called, total);

  // Lead count for the "Campaign setup" card. Sources, in order of reliability:
  //   1. progress.total — the actual dialable rows, but only populated AFTER the
  //      campaign starts (leads get a campaignId stamped at start).
  //   2. the referenced lead list's leadCount — correct before the run starts.
  //   3. legacy explicit leadIds (older campaigns that didn't use a list).
  // Returns null while the source is still loading so we render "—" instead of
  // flashing a wrong 0.
  const referencedList = campaign?.listId
    ? leadLists?.find((l) => l.id === campaign.listId)
    : undefined;
  let leadCount: number | null = null;
  if (total > 0) {
    leadCount = total;
  } else if (campaign?.listId) {
    // Wait for the list to load before committing to a number.
    leadCount = referencedList ? referencedList.leadCount : null;
  } else if (campaign) {
    leadCount = campaign.leadIds?.length ?? 0;
  }

  // Derive a live status: completed when nothing remains and work was done,
  // running while leads remain, otherwise idle.
  const isCompleted = total > 0 && remaining === 0 && called > 0;
  const isRunning = total > 0 && remaining > 0;
  const liveStatus = isCompleted ? "completed" : isRunning ? "running" : "idle";

  const chartData = [
    { name: "called", value: called, fill: "var(--chart-1)" },
    { name: "failed", value: failed, fill: "var(--chart-5)" },
    { name: "remaining", value: remaining > 0 ? remaining : 0, fill: "var(--chart-2)" },
  ].filter((d) => d.value > 0);

  // Ensure at least a placeholder slice when everything is zero
  const safeChartData =
    chartData.length > 0
      ? chartData
      : [{ name: "remaining", value: 1, fill: "var(--chart-2)" }];

  return (
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0 lg:overflow-hidden">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex shrink-0 items-start gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/campaigns" />}
          aria-label="Back to campaigns"
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
          <MegaphoneIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Outbound
          </p>
          <h1 className="mt-0.5 text-base font-semibold text-foreground">
            {assistantName !== "—" ? `${assistantName} campaign` : "Campaign progress"}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <span className="tabular text-xs text-muted-foreground font-mono">
              {id.slice(0, 12)}
            </span>
            <StatusChip status={liveStatus} />
          </div>
        </div>

        {/* Start / Stop controls with obvious states */}
        {isRunning || (total === 0 && !isCompleted) ? (
          <AlertDialog open={stopOpen} onOpenChange={setStopOpen}>
            <AlertDialogTrigger
              render={<Button variant="destructive" size="sm" className="shrink-0" />}
            >
              <StopCircleIcon className="size-4" aria-hidden />
              Stop campaign
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Stop this campaign?</AlertDialogTitle>
                <AlertDialogDescription>
                  Active calls will finish, but no new calls will be placed. This
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep running</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => stopMutation.mutate()}
                  disabled={stopMutation.isPending}
                >
                  {stopMutation.isPending ? "Stopping…" : "Stop campaign"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending || isCompleted}
          >
            <PlayIcon className="size-4" aria-hidden />
            {startMutation.isPending
              ? "Launching…"
              : isCompleted
              ? "Completed"
              : "Launch campaign"}
          </Button>
        )}
      </div>

      {/* ── Error state ───────────────────────────────────────── */}
      {error && !data && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            {parseApiError(error, "Failed to load campaign progress.")}
          </CardContent>
        </Card>
      )}

      {/* ── Progress strip (compact, full width) ─────────────── */}
      <div className="shrink-0 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">Calls placed</span>
          <span className="tabular text-muted-foreground">
            {called.toLocaleString()} / {total.toLocaleString()} ({pct}%)
            {failed > 0 && (
              <span className="text-destructive"> · {failed} failed</span>
            )}
          </span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>

      {/* ── Main bento: compact info rail + conversations ────── */}
      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[18rem_1fr]">
        {/* Left rail — secondary info, scrolls internally if tall */}
        <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
          {/* Outcome donut (compact) */}
          <Card>
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Outcome breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center pb-3">
              {isLoading && !data ? (
                <Skeleton className="h-28 w-28 rounded-full" />
              ) : (
                <ChartContainer config={chartConfig} className="h-28 w-28">
                  <PieChart>
                    <Pie
                      data={safeChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="55%"
                      outerRadius="80%"
                      isAnimationActive={false}
                      strokeWidth={0}
                    >
                      {safeChartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} stroke="transparent" />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  </PieChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* End-call analysis results. Questions are defined on the assistant. */}
          {campaign && (
            <CampaignAnalysisCard
              campaignId={id}
              assistantId={campaign.assistantId}
            />
          )}

          {/* Campaign setup (compact) */}
          {campaign && (
            <Card>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Campaign setup
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1 overflow-y-auto">
                <ConfigItem icon={BotIcon} label="Assistant" value={assistantName} />
                <ConfigItem
                  icon={PhoneOutgoingIcon}
                  label={campaign.numberListId ? "From number (primary)" : "From number"}
                  value={<span className="tabular">{campaign.fromNumber ?? "—"}</span>}
                />
                {campaign.numberListId && (
                  <ConfigItem
                    icon={RepeatIcon}
                    label="Rotate numbers"
                    value={campaign.rotateNumbers ? "On — one number per call" : "Off — single number"}
                  />
                )}
                <ConfigItem
                  icon={UsersIcon}
                  label="Leads"
                  value={leadCount === null ? "—" : leadCount.toLocaleString()}
                />
                <ConfigItem
                  icon={GaugeIcon}
                  label="Concurrency"
                  value={`${campaign.concurrency ?? 1} at once`}
                />
                <ConfigItem
                  icon={ClockIcon}
                  label="Delay between calls"
                  value={`${campaign.delayBetweenCalls ?? 0}s`}
                />
                <ConfigItem
                  icon={TimerIcon}
                  label="Max call duration"
                  value={`${Math.round((campaign.maxCallDuration ?? 900) / 60)} min cap`}
                />
                {campaign.created_at && (
                  <ConfigItem
                    icon={CalendarIcon}
                    label="Created"
                    value={new Date(campaign.created_at).toLocaleDateString()}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Conversations — primary content, fills the viewport */}
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="shrink-0 pb-2 pt-3">
            <SectionHeader
              icon={MessagesSquareIcon}
              title="Conversations"
              description="Live transcripts and recordings per lead."
              tone="violet"
            />
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col pt-0">
            <CampaignResults campaignId={id} isRunning={isRunning} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
