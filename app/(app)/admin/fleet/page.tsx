"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { Fleet, type FleetRun, type FleetSummary, type PodRecord, type PodSortKey } from "@/lib/api/fleet";
import { SipTrunks, type SipTrunk, type SipPod } from "@/lib/api/sip-trunks";
import { toastApiError } from "@/lib/api/errors";
import { getRole } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ReviewRunDialog } from "@/components/fleet/review-run-dialog";
import { LaunchFleetDialog } from "@/components/fleet/launch-fleet-dialog";
import { PodStatusBadge } from "@/components/fleet/pod-status-badge";
import { RefreshButton, LastUpdatedLabel } from "@/components/fleet/refresh-button";
import { InboundTab, ReupButton } from "@/components/fleet/inbound-tab";
import { PaginationBar } from "@/components/pagination-bar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatTile, StatTileSkeleton } from "@/components/stat-tile";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ServerIcon, ShieldIcon, Trash2Icon, InboxIcon, CpuIcon,
  WalletIcon, ActivityIcon,
  RocketIcon, PlayIcon, PauseIcon, RotateCcwIcon, ExternalLinkIcon,
  ScrollTextIcon, CopyIcon, AlertTriangleIcon,
  ChevronUpIcon, ChevronDownIcon, ChevronsUpDownIcon, PhoneIcon, type LucideIcon,
} from "lucide-react";

function fmtCost(n?: number) {
  return typeof n === "number" ? `$${n.toFixed(2)}` : "—";
}

/** Compact deployment timestamp: "Mar 1, 14:32" with the full ISO on hover. */
function fmtWhen(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// Per-section accent tones for header icon badges (mirrors campaign detail page).
const TONE: Record<string, string> = {
  cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
};

/** Section header with a tone-colored icon badge — matches the campaign detail page. */
function SectionHeader({
  icon: Icon,
  title,
  description,
  tone = "cyan",
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  tone?: keyof typeof TONE;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg border",
            TONE[tone]
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-tight text-foreground">{title}</h3>
          {description && (
            <p className="mt-1 text-xs leading-snug text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Centered empty-state that teaches what the table will show. */
function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/* ── run-request approval row ─────────────────────────────────── */
// The row opens the richer Review & Deploy dialog (via onReview). A quick
// Approve (recommended pods, no tweaks) stays reachable inline.
function RunRow({
  run, onReview, onChanged,
}: {
  run: FleetRun;
  onReview: (run: FleetRun) => void;
  onChanged: () => void;
}) {
  const approve = useMutation({
    mutationFn: () => Fleet.approveRun(run.id, { chosenPods: run.recommendedPods ?? 1 }),
    onSuccess: () => { toast.success("Run approved — provisioning"); onChanged(); },
    onError: (e) => toastApiError(e),
  });
  return (
    <TableRow className="cursor-pointer" onClick={() => onReview(run)}>
      <TableCell className="font-mono text-xs">{run.campaignId}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{run.ownerId ?? "—"}</TableCell>
      <TableCell className="tabular">{run.leadCount}</TableCell>
      <TableCell className="tabular">{run.recommendedPods ?? "—"}</TableCell>
      <TableCell className="tabular">{fmtCost(run.estCost)}</TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => onReview(run)}>Review</Button>
          <Button size="sm" onClick={() => approve.mutate()} disabled={approve.isPending}>
            {approve.isPending ? "Approving…" : "Approve"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Provider chip (Vast vs RunPod). Legacy pods with no provider read as RunPod. */
function ProviderBadge({ provider }: { provider?: string }) {
  const p = (provider || "runpod").toLowerCase();
  return <Badge variant="outline" className="capitalize">{p === "vastai" ? "Vast.ai" : "RunPod"}</Badge>;
}


/* ── page (hydration-safe role gate) ──────────────────────────── */
export default function AdminFleetPage() {
  // getRole() returns null on the server and the real role on the client.
  // Reading it during the first client render would diverge from the server
  // HTML and cause a hydration mismatch (this exact bug breaks interactivity
  // elsewhere in the app), so gate it behind a mounted flag. While unmounted
  // we render a neutral skeleton — never flash "Not authorized".
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const role = mounted ? getRole() : null;

  if (!mounted) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-48" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTileSkeleton /><StatTileSkeleton /><StatTileSkeleton /><StatTileSkeleton />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (role !== "admin") {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <ShieldIcon className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">Not authorized</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Admin access is required to manage the GPU fleet.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  return <FleetContent />;
}

function FleetContent() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["fleet-runs"] });
    qc.invalidateQueries({ queryKey: ["fleet-fleets"] });
    qc.invalidateQueries({ queryKey: ["fleet-pods"] });
  };
  const [tab, setTab] = React.useState("fleets");
  const [lastUpdated, setLastUpdated] = React.useState<number | null>(null);

  // ── pods table: server-side pagination + sorting ──
  const [podPage, setPodPage] = React.useState(1);
  const [podSize, setPodSize] = React.useState(20);
  const [podSort, setPodSort] = React.useState<{ key: PodSortKey; dir: "asc" | "desc" }>(
    { key: "deployed", dir: "desc" });  // newest deployment first by default
  const onPodSort = (key: PodSortKey) => {
    setPodSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
    setPodPage(1);
  };

  const runs = useQuery<FleetRun[]>({ queryKey: ["fleet-runs"], queryFn: Fleet.runs });
  const fleets = useQuery<FleetSummary[]>({ queryKey: ["fleet-fleets"], queryFn: Fleet.fleets });
  const pods = useQuery({
    queryKey: ["fleet-pods", podPage, podSize, podSort.key, podSort.dir],
    queryFn: () => Fleet.pods({
      skip: (podPage - 1) * podSize, limit: podSize, sort: podSort.key, dir: podSort.dir }),
    placeholderData: (prev) => prev,  // keep the current page visible while refetching
  });
  const allocations = useQuery<any[]>({ queryKey: ["fleet-allocations"], queryFn: Fleet.allocations });
  const sip = useQuery({
    queryKey: ["sip-trunks"],
    queryFn: SipTrunks.list,
    refetchInterval: 5000,
  });

  // Manual refresh: reconcile silent-pod removal on the backend, then invalidate
  // every fleet query so the snapshot is current. Replaces the old polling.
  const reconcileMut = useMutation({ mutationFn: Fleet.reconcile });
  const refreshAll = async () => {
    await reconcileMut.mutateAsync().catch(() => {});
    qc.invalidateQueries({ queryKey: ["fleet-runs"] });
    qc.invalidateQueries({ queryKey: ["fleet-fleets"] });
    qc.invalidateQueries({ queryKey: ["fleet-pods"] });
    qc.invalidateQueries({ queryKey: ["fleet-allocations"] });
    qc.invalidateQueries({ queryKey: ["fleet-inbound-config"] });
    qc.invalidateQueries({ queryKey: ["fleet-inbound-pods"] });
    setLastUpdated(Date.now());
  };
  const anyFetching = runs.isFetching || fleets.isFetching || pods.isFetching
    || allocations.isFetching || reconcileMut.isPending;

  // ── dialog state (controlled + always-mounted) ──
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [reviewRun, setReviewRun] = React.useState<FleetRun | null>(null);
  const [launchOpen, setLaunchOpen] = React.useState(false);
  const [logsPod, setLogsPod] = React.useState<PodRecord | null>(null);

  const openReview = (run: FleetRun) => { setReviewRun(run); setReviewOpen(true); };

  const terminate = useMutation({
    mutationFn: (id: string) => Fleet.terminatePod(id),
    onSuccess: () => { toast.success("Pod terminated"); qc.invalidateQueries({ queryKey: ["fleet-pods"] }); },
    onError: (e) => toastApiError(e),
  });
  const pausePod = useMutation({
    mutationFn: (id: string) => Fleet.pausePod(id),
    onSuccess: () => { toast.success("Pod paused"); qc.invalidateQueries({ queryKey: ["fleet-pods"] }); },
    onError: (e) => toastApiError(e),
  });
  const resumePod = useMutation({
    mutationFn: (id: string) => Fleet.resumePod(id),
    onSuccess: () => { toast.success("Pod resumed"); qc.invalidateQueries({ queryKey: ["fleet-pods"] }); },
    onError: (e) => toastApiError(e),
  });

  const pendingRuns = (runs.data ?? []).filter((r) => r.status === "requested");
  // Live fleets (one card per active run) come from the grouped /fleets endpoint.
  const fleetList = fleets.data ?? [];
  const activeFleetCount = fleetList.length;

  // ── summary metrics ──
  // Pod-derived stats come from the server aggregate (whole collection), NOT the
  // current page — so paging the table never skews the tiles.
  const podList = pods.data?.items ?? [];
  const podTotal = pods.data?.total ?? 0;
  const podStats = pods.data?.stats;
  const activePodCount = podStats?.activePods ?? 0;
  const burnPerHr = podStats?.burnPerHr ?? 0;
  const totalSpend =
    (podStats?.podSpend ?? 0) +
    (allocations.data ?? []).reduce((s, a) => s + (a.costAttributed ?? 0), 0);
  const statsLoading = pods.isLoading || runs.isLoading || allocations.isLoading;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <ServerIcon className="size-4 text-primary" aria-hidden />
            Fleet
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            GPU pods, run approvals, and the resource ledger.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LastUpdatedLabel at={lastUpdated} />
          <RefreshButton onRefresh={refreshAll} isFetching={anyFetching} />
          <Button onClick={() => setLaunchOpen(true)}><RocketIcon className="size-4" />Deploy fleet</Button>
        </div>
      </div>

      {/* Summary stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statsLoading ? (
          <>
            <StatTileSkeleton /><StatTileSkeleton />
            <StatTileSkeleton /><StatTileSkeleton />
          </>
        ) : (
          <>
            <StatTile label="Pending runs" value={pendingRuns.length} />
            <StatTile label="Active pods" value={activePodCount} />
            <StatTile label="$/hr burn" value={fmtCost(burnPerHr)} />
            <StatTile label="Total spend" value={fmtCost(totalSpend)} />
          </>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as string)} className="gap-4">
        <TabsList variant="line">
          <TabsTrigger value="fleets">Fleets{activeFleetCount ? ` (${activeFleetCount})` : ""}</TabsTrigger>
          <TabsTrigger value="requests">Requests{pendingRuns.length ? ` (${pendingRuns.length})` : ""}</TabsTrigger>
          <TabsTrigger value="inbound">Inbound</TabsTrigger>
          <TabsTrigger value="sip">SIP trunks</TabsTrigger>
          <TabsTrigger value="infra">Infrastructure</TabsTrigger>
        </TabsList>

        {/* Fleets — one card per live fleet, grouped by campaign */}
        <TabsContent value="fleets" className="space-y-3">
          <FleetsTab fleets={fleetList} loading={fleets.isLoading}
            onChanged={invalidate} onDeploy={() => setLaunchOpen(true)} />
        </TabsContent>

        <TabsContent value="requests" className="space-y-5">
      {/* Run requests */}
      <Card>
        <CardHeader className="pb-3">
          <SectionHeader
            icon={InboxIcon}
            tone="amber"
            title="Run requests"
            description="Pending campaign runs awaiting approval. Click a row to review the campaign and deploy."
          />
        </CardHeader>
        <CardContent className="p-0">
          {pendingRuns.length === 0 ? (
            <EmptyState icon={InboxIcon} title="No pending run requests"
              hint="When a user launches a campaign that needs approval, it appears here." />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Campaign</TableHead><TableHead>Owner</TableHead><TableHead>Leads</TableHead>
                <TableHead>Rec. pods</TableHead><TableHead>Est. cost</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {pendingRuns.map((r) => (
                  <RunRow key={r.id} run={r} onReview={openReview} onChanged={invalidate} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="inbound" className="space-y-5">
          <InboundTab active={tab === "inbound"} />
        </TabsContent>

        <TabsContent value="sip" className="space-y-5">
          <SipTab data={sip.data} loading={sip.isLoading} />
        </TabsContent>

        <TabsContent value="infra" className="space-y-5">
      {/* Pods */}
      <Card>
        <CardHeader className="pb-3">
          <SectionHeader
            icon={CpuIcon}
            tone="cyan"
            title="Pods"
            description="Provisioned GPU pods (Vast.ai / RunPod) and their accrued cost."
          />
        </CardHeader>
        <CardContent className="p-0">
          {pods.isLoading && podList.length === 0 ? <Skeleton className="m-4 h-9" /> : podTotal === 0 ? (
            <EmptyState icon={CpuIcon} title="No pods provisioned"
              hint="Launch a fleet or approve a run request to spin up GPU pods." />
          ) : (
            <>
              <Table>
                <TableHeader><TableRow>
                  <PodSortHead label="Instance id" sortKey="instance" sort={podSort} onSort={onPodSort} />
                  <TableHead>Public URL</TableHead>
                  <PodSortHead label="Provider" sortKey="provider" sort={podSort} onSort={onPodSort} />
                  <PodSortHead label="GPU" sortKey="gpu" sort={podSort} onSort={onPodSort} />
                  <PodSortHead label="Status" sortKey="status" sort={podSort} onSort={onPodSort} />
                  <PodSortHead label="Deployed" sortKey="deployed" sort={podSort} onSort={onPodSort} />
                  <PodSortHead label="Cost/hr" sortKey="costPerHr" sort={podSort} onSort={onPodSort} />
                  <PodSortHead label="Spent" sortKey="spent" sort={podSort} onSort={onPodSort} />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {podList.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">
                        <span className="block max-w-[150px] truncate"
                          title={p.providerId ?? p.runpodId}>
                          {p.providerId ?? p.runpodId}
                        </span>
                      </TableCell>
                      <TableCell><PodUrlCell pod={p} /></TableCell>
                      <TableCell><ProviderBadge provider={p.provider} /></TableCell>
                      <TableCell className="text-xs">
                        <span className="block max-w-[140px] truncate" title={p.gpuType}>
                          {p.gpuType}
                        </span>
                      </TableCell>
                      <TableCell><PodStatusBadge status={p.status} /></TableCell>
                      {/* Show the SAME field the table sorts on (created_at) so the
                          column reads monotonically; tooltip surfaces both timestamps. */}
                      <TableCell className="text-xs text-muted-foreground tabular-nums"
                        title={`Deployed: ${p.created_at ?? "—"}${p.startedAt ? `\nStarted: ${p.startedAt}` : ""}`}>
                        {fmtWhen(p.created_at ?? p.startedAt)}
                      </TableCell>
                      <TableCell className="tabular">{fmtCost(p.costPerHr)}</TableCell>
                      <TableCell className="tabular">{fmtCost(p.accumulatedCost)}</TableCell>
                      <TableCell className="text-right">
                        <PodControls
                          pod={p}
                          onLogs={() => setLogsPod(p)}
                          onPause={() => pausePod.mutate(p.id)}
                          onResume={() => resumePod.mutate(p.id)}
                          onTerminate={() => terminate.mutate(p.id)}
                          busy={pausePod.isPending || resumePod.isPending || terminate.isPending}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t p-2">
                <PaginationBar
                  page={podPage}
                  pageCount={Math.max(1, Math.ceil(podTotal / podSize))}
                  total={podTotal}
                  pageSize={podSize}
                  onPageChange={setPodPage}
                  onPageSizeChange={(s) => { setPodSize(s); setPodPage(1); }}
                  itemLabel="pods"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Allocations ledger */}
      <Card>
        <CardHeader className="pb-3">
          <SectionHeader
            icon={WalletIcon}
            tone="emerald"
            title="Allocation ledger"
            description="Per-shard cost attribution across campaigns and owners."
          />
        </CardHeader>
        <CardContent className="p-0">
          {(allocations.data ?? []).length === 0 ? (
            <EmptyState icon={ActivityIcon} title="No allocations recorded"
              hint="Once pods run campaigns, per-shard cost attribution lands here." />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Campaign</TableHead><TableHead>Owner</TableHead><TableHead>Shard</TableHead>
                <TableHead>Allocated</TableHead><TableHead>Released</TableHead><TableHead>Cost</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(allocations.data ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.campaignId}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.ownerId}</TableCell>
                    <TableCell className="tabular">{a.shardIndex}</TableCell>
                    <TableCell className="text-xs">{a.allocatedAt ?? "—"}</TableCell>
                    <TableCell className="text-xs">{a.releasedAt ?? "—"}</TableCell>
                    <TableCell className="tabular">{fmtCost(a.costAttributed)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>

      {/* Always-mounted controlled dialogs (Base UI dialogs left conditionally
          unmounted make the page inert — a real bug in this app). */}
      <ReviewRunDialog
        run={reviewRun}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onChanged={invalidate}
      />
      <LaunchFleetDialog
        open={launchOpen}
        onOpenChange={setLaunchOpen}
        onLaunched={invalidate}
      />
      <PodLogsDialog
        pod={logsPod}
        open={logsPod !== null}
        onOpenChange={(o) => { if (!o) setLogsPod(null); }}
      />
    </div>
  );
}

/** Per-pod-status accent used in the fleet card's pod breakdown row. */
const POD_STATUS_TONE: Record<string, string> = {
  running: "text-emerald-400", ready: "text-cyan-400", idle: "text-muted-foreground",
  provisioning: "text-amber-400", failed: "text-destructive",
  terminated: "text-muted-foreground/50",
};
const POD_STATUS_ORDER = ["running", "ready", "idle", "provisioning", "failed", "terminated"];

/** Run-status badge (distinct from pod status — runs add ready/completed). */
function RunStatusBadge({ status }: { status: string }) {
  const variant: "default" | "secondary" | "destructive" | "outline" =
    status === "running" ? "default"
      : status === "failed" || status === "rejected" ? "destructive"
        : status === "ready" || status === "paused" ? "outline"
          : "secondary";
  return <Badge variant={variant} className="capitalize">{status}</Badge>;
}

/** Fleets tab body: one card per live fleet (campaign run + its pods), or an empty state. */
function FleetsTab({
  fleets, loading, onChanged, onDeploy,
}: { fleets: FleetSummary[]; loading: boolean; onChanged: () => void; onDeploy: () => void }) {
  if (loading && fleets.length === 0) return <Skeleton className="h-40" />;
  if (fleets.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState icon={RocketIcon} title="No active fleets"
            hint="Deploy a fleet, or approve a run request, to spin up pods for a campaign." />
          <div className="flex justify-center pb-5">
            <Button onClick={onDeploy}><RocketIcon className="size-4" />Deploy fleet</Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {fleets.map((f) => <FleetCard key={f.id} f={f} onChanged={onChanged} />)}
    </div>
  );
}

/** A single live fleet: campaign label, pod breakdown, lead funnel, cost, and the
 *  fleet-level controls (Start when deferred, Pause/Resume, Destroy) + Manage link. */
function FleetCard({ f, onChanged }: { f: FleetSummary; onChanged: () => void }) {
  const start = useMutation({
    mutationFn: () => Fleet.startRun(f.id),
    onSuccess: () => { toast.success("Dialing started"); onChanged(); },
    onError: (e) => toastApiError(e),
  });
  const pause = useMutation({
    mutationFn: () => Fleet.pauseRun(f.id),
    onSuccess: (r) => { toast.success(`Paused ${r.paused} pod(s)`); onChanged(); },
    onError: (e) => toastApiError(e),
  });
  const resume = useMutation({
    mutationFn: () => Fleet.resumeRun(f.id),
    onSuccess: (r) => { toast.success(`Resumed ${r.resumed} pod(s)`); onChanged(); },
    onError: (e) => toastApiError(e),
  });
  const destroy = useMutation({
    mutationFn: () => Fleet.destroyRun(f.id),
    onSuccess: (r) => { toast.success(`Destroyed ${r.destroyed} pod(s)`); onChanged(); },
    onError: (e) => toastApiError(e),
  });
  const busy = start.isPending || pause.isPending || resume.isPending || destroy.isPending;
  const waiting = !f.dialingEnabled && !["completed", "terminated"].includes(f.status);
  const isPaused = f.status === "paused";
  const funnelPct = f.funnel.total ? Math.round((f.funnel.done / f.funnel.total) * 100) : 0;
  const counts = f.podCounts || {};

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/admin/fleet/runs/${f.id}`}
              className="font-medium text-foreground hover:underline">
              {f.assistantName || "Campaign fleet"}
            </Link>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{f.campaignId}</p>
            <p className="truncate text-xs text-muted-foreground">{f.ownerEmail ?? "—"}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <RunStatusBadge status={f.status} />
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {fmtCost(f.cost.spend)} · {fmtCost(f.cost.burnPerHr)}/hr
            </span>
          </div>
        </div>

        {/* Behavior flags */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={f.autoStart ? "secondary" : "outline"} className="text-[10px]">
            {f.autoStart ? "auto-start" : "manual start"}
          </Badge>
          <Badge variant={f.autoDestroy ? "secondary" : "outline"} className="text-[10px]">
            {f.autoDestroy ? "auto-destroy" : "keep alive"}
          </Badge>
        </div>

        {/* Pod breakdown */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-muted-foreground">{f.podTotal} pod{f.podTotal !== 1 ? "s" : ""}:</span>
          {POD_STATUS_ORDER.filter((s) => counts[s]).map((s) => (
            <span key={s} className={cn("inline-flex items-center gap-1", POD_STATUS_TONE[s] ?? "")}>
              <span className="size-1.5 rounded-full bg-current" />{counts[s]} {s}
            </span>
          ))}
          {typeof f.podsLaunched === "number" && typeof f.podsRequested === "number"
            && f.podsLaunched < f.podsRequested && (
            <span className="inline-flex items-center gap-1 text-amber-400">
              <AlertTriangleIcon className="size-3" />{f.podsLaunched}/{f.podsRequested}
            </span>
          )}
        </div>

        {/* Lead funnel */}
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${funnelPct}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {f.funnel.done.toLocaleString()}/{f.funnel.total.toLocaleString()} done ·
            {" "}{f.funnel.pending} pending · {f.funnel.failed} failed
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {waiting && (
            <Button size="sm" onClick={() => start.mutate()} disabled={busy}>
              <PlayIcon className="size-3.5" />Start calling
            </Button>
          )}
          {isPaused ? (
            <Button size="sm" variant="outline" onClick={() => resume.mutate()} disabled={busy}>
              <PlayIcon className="size-3.5" />Resume
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => pause.mutate()} disabled={busy}>
              <PauseIcon className="size-3.5" />Pause
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger render={
              <Button size="sm" variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                <Trash2Icon className="size-3.5" />Destroy
              </Button>} />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Destroy this fleet?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tears down all {f.podTotal} pod(s) and their Cloudflare tunnels immediately.
                  In-flight calls drop. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => destroy.mutate()}
                  disabled={destroy.isPending}
                  className="bg-destructive text-white hover:bg-destructive/90">
                  {destroy.isPending ? "Destroying…" : "Destroy"}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Link href={`/admin/fleet/runs/${f.id}`}
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Manage →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/** Pod public URL cell: clickable URL text + copy button, or a "provisioning" hint
 *  when the pod has no URL yet (so a blank cell isn't mistaken for a bug). */
function PodUrlCell({ pod }: { pod: PodRecord }) {
  if (!pod.publicUrl) {
    const pending = !["terminated", "failed"].includes(pod.status);
    return (
      <span className="text-xs text-muted-foreground">
        {pending ? "provisioning…" : "—"}
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-[240px] items-center gap-1.5 font-mono text-xs">
      <a href={pod.publicUrl} target="_blank" rel="noopener" title={pod.publicUrl}
        className="inline-flex min-w-0 items-center gap-1 text-primary underline underline-offset-2">
        <span className="truncate">{pod.publicUrl.replace(/^https?:\/\//, "")}</span>
        <ExternalLinkIcon className="size-3 shrink-0" />
      </a>
      <button type="button" aria-label="Copy pod URL"
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => {
          navigator.clipboard?.writeText(pod.publicUrl!);
          toast.success("Pod URL copied");
        }}>
        <CopyIcon className="size-3" />
      </button>
    </span>
  );
}

/** Clickable, server-driven sortable column header for the pods table. */
function PodSortHead({
  label, sortKey, sort, onSort, className,
}: {
  label: string;
  sortKey: PodSortKey;
  sort: { key: PodSortKey; dir: "asc" | "desc" };
  onSort: (k: PodSortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDownIcon : sort.dir === "asc" ? ChevronUpIcon : ChevronDownIcon;
  return (
    <TableHead className={className}>
      <button type="button"
        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
        onClick={() => onSort(sortKey)}>
        {label}
        <Icon className={cn("size-3", active ? "text-foreground" : "opacity-40")} />
      </button>
    </TableHead>
  );
}

/** Per-pod action cluster: Logs + Pause/Resume (by status) + Terminate (confirmed). */
function PodControls({
  pod, onLogs, onPause, onResume, onTerminate, busy,
}: {
  pod: PodRecord;
  onLogs: () => void;
  onPause: () => void;
  onResume: () => void;
  onTerminate: () => void;
  busy: boolean;
}) {
  const canPause = ["running", "idle"].includes(pod.status);
  const canResume = pod.status === "paused";
  // Admin can destroy ANY instance at any time — including one still `provisioning`,
  // `failed`, or `missing` (cleans up the row + any lingering provider instance). Only an
  // already-`terminated` pod has nothing left to destroy.
  const canTerminate = pod.status !== "terminated";
  const canReup = pod.status === "missing" || pod.status === "deprecated";
  return (
    <div className="flex items-center justify-end gap-0.5">
      <Button variant="ghost" size="icon" aria-label="View pod logs"
        className="text-muted-foreground hover:text-foreground" onClick={onLogs}>
        <ScrollTextIcon className="size-4" />
      </Button>
      {canReup && <ReupButton pod={pod} />}
      {canPause && (
        <Button variant="ghost" size="icon" aria-label="Pause pod" disabled={busy}
          className="text-muted-foreground hover:text-foreground" onClick={onPause}>
          <PauseIcon className="size-4" />
        </Button>
      )}
      {canResume && (
        <Button variant="ghost" size="icon" aria-label="Resume pod" disabled={busy}
          className="text-emerald-400 hover:text-emerald-300" onClick={onResume}>
          <PlayIcon className="size-4" />
        </Button>
      )}
      {canTerminate && (
        <AlertDialog>
          <AlertDialogTrigger render={
            <Button variant="ghost" size="icon" aria-label="Terminate pod"
              className="text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive">
              <Trash2Icon className="size-4" />
            </Button>} />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Terminate this pod?</AlertDialogTitle>
              <AlertDialogDescription>
                This destroys the pod&apos;s instance immediately (Vast.ai or RunPod) and
                tears down its Cloudflare tunnel. In-flight calls on it will drop.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onTerminate} disabled={busy}
                className="bg-destructive text-white hover:bg-destructive/90">
                {busy ? "Terminating…" : "Terminate"}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

/** SIP trunks tab: two tables — warm SIP pods and SIP trunks. Polls every 5s via
 *  the parent query. Renders an empty state when no trunks are provisioned yet. */
function SipTab({
  data, loading,
}: { data: { trunks: SipTrunk[]; pods: SipPod[] } | undefined; loading: boolean }) {
  const pods = data?.pods ?? [];
  const trunks = data?.trunks ?? [];

  return (
    <div className="space-y-5">
      {/* SIP pods */}
      <Card>
        <CardHeader className="pb-3">
          <SectionHeader
            icon={ServerIcon}
            tone="violet"
            title="SIP pods"
            description="Warm GPU pods registered as SIP endpoints, ready to answer inbound SIP calls."
          />
        </CardHeader>
        <CardContent className="p-0">
          {loading && pods.length === 0 ? (
            <Skeleton className="m-4 h-9" />
          ) : pods.length === 0 ? (
            <EmptyState
              icon={ServerIcon}
              title="No SIP pods online"
              hint="SIP pods appear here once the inbound fleet warms them up."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pod ID</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Asterisk addr</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pods.map((p) => (
                  <TableRow key={p.pod_id}>
                    <TableCell className="font-mono text-xs">
                      <span className="block max-w-[160px] truncate" title={p.pod_id}>
                        {p.pod_id}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <span className="block max-w-[200px] truncate" title={p.host}>
                        {p.host}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.as_host && p.as_port != null
                        ? `${p.as_host}:${p.as_port}`
                        : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums text-xs">
                      {p.active}/{p.cap}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                          p.status === "ready"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : p.status === "provisioning"
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-muted text-muted-foreground"
                        )}
                      >
                        <span className="size-1.5 rounded-full bg-current" />
                        {p.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* SIP trunks */}
      <Card>
        <CardHeader className="pb-3">
          <SectionHeader
            icon={PhoneIcon}
            tone="emerald"
            title="SIP trunks"
            description="Per-seat SIP credentials, registration status, and active-call load."
          />
        </CardHeader>
        <CardContent className="p-0">
          {loading && trunks.length === 0 ? (
            <Skeleton className="m-4 h-9" />
          ) : trunks.length === 0 ? (
            <EmptyState
              icon={PhoneIcon}
              title="No SIP trunks yet"
              hint="No SIP trunks yet — enable SIP access on a seat."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>SIP username</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Pod</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trunks.map((t) => (
                  <TableRow key={t.seatId}>
                    <TableCell className="text-xs font-medium">
                      {t.name ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {t.sipUsername ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs",
                          t.registered ? "text-emerald-400" : "text-muted-foreground"
                        )}
                        title={t.registered ? "Registered" : "Not registered"}
                      >
                        <span
                          className={cn(
                            "size-2 rounded-full",
                            t.registered ? "bg-emerald-400" : "bg-muted-foreground/40"
                          )}
                        />
                        {t.registered ? "Yes" : "No"}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums text-xs">
                      {t.activeCalls}/{t.maxConcurrent}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <span className="block max-w-[140px] truncate" title={t.podId ?? undefined}>
                        {t.podId ?? "—"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Live pod-logs viewer. Fetches the provider's container logs on open; the Vast
 *  log API is async (request → poll S3), so the first load can take a few seconds. */
function PodLogsDialog({
  pod, open, onOpenChange,
}: { pod: PodRecord | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [daemon, setDaemon] = React.useState(false);
  const podId = pod?.id ?? null;
  const logsQ = useQuery({
    queryKey: ["pod-logs", podId, daemon],
    queryFn: () => Fleet.podLogs(podId!, { tail: 2000, daemon }),
    enabled: open && podId !== null,
    refetchOnWindowFocus: false,
    retry: false,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollTextIcon className="size-4 text-primary" />
            Pod logs
            {pod && <span className="font-mono text-xs text-muted-foreground">
              {pod.providerId ?? pod.runpodId}
            </span>}
          </DialogTitle>
          <DialogDescription>
            Container logs pulled from the provider (Vast.ai). Useful when a pod has no
            URL or its calls are failing.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            <Switch checked={daemon} onCheckedChange={setDaemon} />
            Daemon / system logs
          </label>
          <Button variant="outline" size="sm" className="ml-auto"
            disabled={logsQ.isFetching}
            onClick={() => logsQ.refetch()}>
            <RotateCcwIcon className="size-3.5" />
            {logsQ.isFetching ? "Loading…" : "Refresh"}
          </Button>
        </div>
        <pre className="max-h-[55vh] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap break-words">
          {logsQ.isFetching && !logsQ.data
            ? "Fetching logs… (Vast uploads them on request, this can take a few seconds)"
            : logsQ.isError
              ? `Failed to load logs: ${(logsQ.error as Error)?.message ?? "unknown error"}`
              : (logsQ.data?.logs?.trim() || "No logs returned.")}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
