"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Campaigns, Calls, Assistants } from "@/lib/api/resources";
import { parseApiError } from "@/lib/api/errors";
import { POLL } from "@/lib/query";
import { StatTile, StatTileSkeleton } from "@/components/stat-tile";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { MegaphoneIcon } from "lucide-react";

const chartConfig = {
  answered: { label: "Answered", color: "var(--chart-1)" },
  voicemail: { label: "Voicemail", color: "var(--chart-4)" },
  failed: { label: "Failed", color: "var(--chart-5)" },
  no_answer: { label: "No answer", color: "var(--chart-2)" },
} satisfies ChartConfig;

type CallRecord = {
  status?: string;
  outcome?: string;
  direction?: string;
};

type CampaignRecord = {
  id?: string;
  assistantId?: string | null;
  flowId?: string | null;
  fromNumber?: string;
  status?: string;
};

/** Derive outcome counts from a flat calls list */
function deriveOutcomes(calls: CallRecord[]) {
  const counts = { answered: 0, voicemail: 0, failed: 0, no_answer: 0 };
  for (const c of calls) {
    const key = (c.outcome ?? c.status ?? "").toLowerCase();
    if (key === "answered" || key === "completed") counts.answered++;
    else if (key === "voicemail") counts.voicemail++;
    else if (key === "failed" || key === "busy" || key === "canceled") counts.failed++;
    else counts.no_answer++;
  }
  return counts;
}

export default function DashboardPage() {
  // GET /campaigns is now server-paginated. The dashboard shows active campaigns
  // and counts from the most recent page (capped at 500) and reads the accurate
  // full count from `total`.
  const campaignsQuery = useQuery({
    queryKey: ["campaigns", "dashboard"],
    queryFn: () => Campaigns.list({ skip: 0, limit: 500 }),
    refetchInterval: POLL.live,
  });

  // GET /calls is now server-paginated. The dashboard derives the outcome chart
  // from the most recent page (capped at 500, same as before) and reads the
  // accurate full count from `total`.
  const callsQuery = useQuery({
    queryKey: ["calls", "dashboard"],
    queryFn: () => Calls.list({ skip: 0, limit: 500 }),
    refetchInterval: POLL.live,
  });

  // Resolve assistant ObjectIds → human names for active-campaign labels.
  // Shares the ["assistants"] react-query cache used by other pages, so this
  // does not add a redundant network round-trip when navigating in.
  const assistantsQuery = useQuery({
    queryKey: ["assistants"],
    queryFn: Assistants.list,
  });

  const isLoading = campaignsQuery.isLoading || callsQuery.isLoading;
  const isError = campaignsQuery.isError || callsQuery.isError;
  const errorMessage = isError
    ? parseApiError(campaignsQuery.error ?? callsQuery.error)
    : null;

  const campaigns: CampaignRecord[] = campaignsQuery.data?.items ?? [];
  const calls: CallRecord[] = callsQuery.data?.items ?? [];

  // Map assistant ObjectId → human name for campaign labels.
  const assistantNames = new Map<string, string>(
    (assistantsQuery.data ?? [])
      .filter((a) => a.id)
      .map((a) => [a.id as string, a.name])
  );

  // A campaign has no `name` field on the backend. Prefer its resolved
  // assistant name, then the originating number, then a short id.
  function campaignLabel(c: CampaignRecord): string {
    const assistant = c.assistantId ? assistantNames.get(c.assistantId) : undefined;
    if (assistant) return assistant;
    if (c.fromNumber) return c.fromNumber;
    if (c.id) return `Campaign ${c.id.slice(-6)}`;
    return "Campaign";
  }

  // Backend only emits campaign statuses: draft | running | stopped | done | completed.
  // "running" is the only genuinely-active state.
  const activeCampaigns = campaigns.filter((c) => c.status === "running");
  const activeCampaignCount = activeCampaigns.length;
  // `total` is the full server-side match count (accurate even past the 500-row
  // page we fetch for the active-campaign strip below).
  const totalCampaigns = campaignsQuery.data?.total ?? campaigns.length;
  // `total` is the full server-side match count (accurate even past the 500-row
  // page we fetch for the outcome chart below).
  const totalCalls = callsQuery.data?.total ?? calls.length;

  const outcomeCounts = deriveOutcomes(calls);

  const chartData = [
    { outcome: "Answered", count: outcomeCounts.answered, fill: "var(--chart-1)" },
    { outcome: "Voicemail", count: outcomeCounts.voicemail, fill: "var(--chart-4)" },
    { outcome: "Failed", count: outcomeCounts.failed, fill: "var(--chart-5)" },
    { outcome: "No answer", count: outcomeCounts.no_answer, fill: "var(--chart-2)" },
  ];

  const noData = !isLoading && activeCampaignCount === 0 && totalCalls === 0;

  return (
    <div className="space-y-5">
      {/* ── Error state ───────────────────────────────────────── */}
      {isError && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            {errorMessage}
          </CardContent>
        </Card>
      )}

      {/* ── Stat tiles ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {isLoading ? (
          <>
            <StatTileSkeleton />
            <StatTileSkeleton />
            <StatTileSkeleton />
            <StatTileSkeleton />
          </>
        ) : (
          <>
            <StatTile label="Active campaigns" value={activeCampaignCount} />
            <StatTile label="Total campaigns" value={totalCampaigns} />
            <StatTile label="Total calls" value={totalCalls} />
            <StatTile label="Answered" value={outcomeCounts.answered} />
          </>
        )}
      </div>

      {/* ── Active campaigns strip ────────────────────────────── */}
      {!isLoading && activeCampaignCount > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Active campaigns
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 pt-0">
            <div className="divide-y divide-border">
              {activeCampaigns.map((c) => (
                <div
                  key={c.id ?? campaignLabel(c)}
                  className="flex items-center justify-between py-2 text-sm transition-colors duration-150 hover:bg-muted/40 px-1 rounded-sm"
                >
                  <span className="font-medium text-foreground">
                    {campaignLabel(c)}
                  </span>
                  <StatusChip status={c.status ?? "running"} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Teaching empty state ──────────────────────────────── */}
      {noData && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <MegaphoneIcon className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No campaigns running</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Create a campaign to start making outbound calls and see live
                stats here.
              </p>
            </div>
            <Button render={<Link href="/campaigns/new" />}>
              Start a campaign
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Outcome bar chart ─────────────────────────────────── */}
      {!noData && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Call outcomes
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <ChartContainer config={chartConfig} className="h-48 w-full">
                <BarChart
                  data={chartData}
                  margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                >
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    className="stroke-border"
                  />
                  <XAxis
                    dataKey="outcome"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    allowDecimals={false}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent hideLabel />}
                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                  />
                  <Bar
                    dataKey="count"
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
