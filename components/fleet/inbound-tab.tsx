"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Fleet, type InboundPrewarmConfig, type PodRecord,
  type InboundSlot, type OffersPreview,
} from "@/lib/api/fleet";
import { toastApiError } from "@/lib/api/errors";
import { relativeTime, absoluteTime } from "@/components/assistants/card-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PodStatusBadge } from "@/components/fleet/pod-status-badge";
import { OfferTable } from "@/components/fleet/offer-table";
import { PodActions } from "@/components/fleet/pod-actions";
import { AttachPodNumbersDialog } from "@/components/fleet/attach-pod-numbers-dialog";
import { Numbers } from "@/lib/api/resources";
import { cn } from "@/lib/utils";
import {
  PhoneIncomingIcon, ServerIcon, ActivityIcon, DollarSignIcon, GaugeIcon,
  Loader2Icon, RotateCcwIcon, RefreshCwIcon, ExternalLinkIcon, AlertTriangleIcon,
  PhoneIcon,
  type LucideIcon,
} from "lucide-react";

// Same catalog the Deploy dialog targets — a static MODEL list is the contract
// (Vast offer ids churn, so we pick MODELS, not machines).
const GPU_MODELS = ["RTX 5060 Ti", "RTX 5070 Ti", "RTX 5080", "RTX 5090"];
const OFFER_CATALOG = GPU_MODELS.join(",");

// Normalize a saved gpuType token to the Vast short form used by GPU_MODELS. The RunPod
// GPU picker (gpu-options.ts) persists the LONG form ("NVIDIA GeForce RTX 5090"); without
// this, a long-form saved value is dropped by the GPU_MODELS filter on seed → gpuModels
// stays empty while config.gpuType is set → the form is PERMANENTLY dirty (Apply never
// disables, ignores the prewarm toggle). Stripping the vendor prefix maps it back.
function normalizeGpuModel(s: string): string {
  return s.trim().replace(/^NVIDIA\s+GeForce\s+/i, "").trim();
}
const REGIONS = [
  { value: "any", label: "Any region" },
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "GB", label: "United Kingdom" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
];

function regionLabel(v: string) {
  return REGIONS.find((r) => r.value === v)?.label ?? v;
}

function fmtCost(n?: number) {
  return typeof n === "number" ? `$${n.toFixed(2)}` : "—";
}

/** Centered empty state (mirrors the fleet page pattern). */
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

/** Section header with a tone-colored icon badge (matches the fleet page). */
function PanelHeader({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-400">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold leading-tight text-foreground">{title}</h3>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// ── Metric strip ────────────────────────────────────────────────────────────

type MetricTone = "muted" | "emerald" | "amber" | "destructive" | "cyan";

const TONE_BADGE: Record<MetricTone, string> = {
  muted: "border-border bg-muted text-muted-foreground",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
};

/** A single capacity metric — icon badge, tracked label, big tabular value, sub-line. */
function MetricCard({
  icon: Icon, tone, label, value, sub,
}: {
  icon: LucideIcon;
  tone: MetricTone;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border", TONE_BADGE[tone])}>
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="tabular text-2xl font-semibold leading-none lg:text-3xl">{value}</p>
          <p className="truncate text-xs text-muted-foreground tabular-nums">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        <Skeleton className="size-9 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Inbound tab body: a live capacity strip, the prewarm intent panel, and the
 * inbound-pod list. Queries are gated on `active` so a hidden tab doesn't fetch.
 * No polling — capacity is read once on mount and on manual refresh only.
 */
export function InboundTab({ active }: { active: boolean }) {
  const configQ = useQuery<InboundPrewarmConfig>({
    queryKey: ["fleet-inbound-config"],
    queryFn: Fleet.inboundConfig,
    enabled: active,
  });
  const podsQ = useQuery<PodRecord[]>({
    queryKey: ["fleet-inbound-pods"],
    queryFn: Fleet.inboundPods,
    enabled: active,
  });
  const registryQ = useQuery<InboundSlot[]>({
    queryKey: ["fleet-inbound-registry"],
    queryFn: Fleet.inboundRegistry,
    enabled: active,
  });
  // The caller's numbers — to show how many are routed (pinned) to each pod.
  const numbersQ = useQuery<{ id: string; pinnedPodId?: string | null }[]>({
    queryKey: ["numbers"],
    queryFn: Numbers.list,
    enabled: active,
  });

  const config = configQ.data ?? null;
  const pods = React.useMemo(() => podsQ.data ?? [], [podsQ.data]);
  const registry = React.useMemo(() => registryQ.data ?? [], [registryQ.data]);
  const metricsLoading = configQ.isLoading || podsQ.isLoading || registryQ.isLoading;

  // podId → count of numbers pinned to it (for the per-pod "N numbers routed here").
  const attachedByPod = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const n of numbersQ.data ?? []) {
      if (n.pinnedPodId) m[n.pinnedPodId] = (m[n.pinnedPodId] ?? 0) + 1;
    }
    return m;
  }, [numbersQ.data]);

  return (
    <div className="space-y-5">
      <CapacityOverview
        config={config}
        pods={pods}
        registry={registry}
        loading={metricsLoading}
      />
      <PrewarmPanel
        active={active}
        config={config}
        loading={configQ.isLoading}
        error={configQ.isError ? (configQ.error as Error) : null}
        onRetry={() => configQ.refetch()}
      />
      <InboundPodList
        pods={pods}
        registry={registry}
        attachedByPod={attachedByPod}
        loading={podsQ.isLoading}
        error={podsQ.isError ? (podsQ.error as Error) : null}
        enabled={config?.enabled ?? false}
        target={config?.warmPods ?? 0}
        onRetry={() => podsQ.refetch()}
      />
    </div>
  );
}

/** Live capacity strip — four derived metrics, all from config + pods + registry. */
function CapacityOverview({
  config, pods, registry, loading,
}: {
  config: InboundPrewarmConfig | null;
  pods: PodRecord[];
  registry: InboundSlot[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
      </div>
    );
  }

  const enabled = config?.enabled ?? false;
  const target = config?.warmPods ?? 0;
  const live = pods.filter((p) => p.status !== "terminated").length;

  // Free call slots — summed across the live routing registry.
  const total = registry.reduce((s, r) => s + r.cap, 0);
  const inUse = registry.reduce((s, r) => s + r.active, 0);
  const free = total - inUse;
  const haveRegistry = registry.length > 0;

  // Health — running/ready/idle & probe-healthy vs recovery states.
  const healthy = pods.filter(
    (p) => p.healthy && ["running", "ready", "idle"].includes(p.status),
  ).length;
  const issues = pods.filter(
    (p) => ["missing", "deprecated", "failed"].includes(p.status),
  ).length;

  // Burn — live (non-terminated) pods only; spend is cumulative.
  const burn = pods
    .filter((p) => p.status !== "terminated")
    .reduce((s, p) => s + (p.costPerHr ?? 0), 0);
  const spend = pods.reduce((s, p) => s + (p.accumulatedCost ?? 0), 0);

  const warmTone: MetricTone = !enabled
    ? "muted"
    : live < target
      ? "amber"
      : target > 0
        ? "emerald"
        : "muted";

  const slotsTone: MetricTone = total === 0
    ? "muted"
    : free > 0
      ? "emerald"
      : "amber";

  const healthTone: MetricTone = issues > 0 ? "destructive" : healthy > 0 ? "emerald" : "muted";

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        icon={ServerIcon}
        tone={warmTone}
        label="Pods up"
        value={`${live}/${target}`}
        sub="live / target"
      />
      <MetricCard
        icon={GaugeIcon}
        tone={slotsTone}
        label="Free call slots"
        value={haveRegistry ? String(free) : "—"}
        sub={!haveRegistry && live > 0 ? "registering…" : `${inUse} in use · ${total} total`}
      />
      <MetricCard
        icon={ActivityIcon}
        tone={healthTone}
        label="Healthy"
        value={String(healthy)}
        sub={`${issues} need attention`}
      />
      <MetricCard
        icon={DollarSignIcon}
        tone="cyan"
        label="Burn"
        value={`$${burn.toFixed(2)}/hr`}
        sub={`$${spend.toFixed(2)} spent`}
      />
    </div>
  );
}

/**
 * Stages inbound-prewarm intent locally; an explicit Apply commits it (never a
 * toggle-storm). Local state seeds from server config via a render-time prevConfig
 * guard — the React-recommended alternative to a setState-in-effect.
 */
function PrewarmPanel({
  active, config, loading, error, onRetry,
}: {
  active: boolean;
  config: InboundPrewarmConfig | null;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const qc = useQueryClient();

  const [enabled, setEnabled] = React.useState(false);
  const [gpuModels, setGpuModels] = React.useState<string[]>([]);
  const [region, setRegion] = React.useState("any");
  const [warmPods, setWarmPods] = React.useState(1);
  const [maxPrice, setMaxPrice] = React.useState("");
  const [busyMessage, setBusyMessage] = React.useState("");

  // Seed local staging from server config once per config identity (render-time
  // sync, not useEffect). Re-seeds after a successful Apply refetch too.
  const [prevConfig, setPrevConfig] = React.useState<InboundPrewarmConfig | null>(null);
  if (config && config !== prevConfig) {
    setPrevConfig(config);
    setEnabled(config.enabled);
    setGpuModels(
      (config.gpuType ?? "")
        .split(",")
        .map(normalizeGpuModel)
        .filter((s) => GPU_MODELS.includes(s)),
    );
    setRegion(config.region ?? "any");
    setWarmPods(config.warmPods);
    setMaxPrice(config.maxPrice != null ? String(config.maxPrice) : "");
    setBusyMessage(config.busyMessage ?? "");
  }

  const save = useMutation({
    mutationFn: (body: Partial<InboundPrewarmConfig>) => Fleet.setInboundConfig(body),
    // `data` is the saved config — message reflects what Apply actually DID (provision /
    // tear down / no-op) so it never reads as a silent "settings saved".
    onSuccess: (data) => {
      const n = data.warmPods ?? 0;
      toast.success(
        !data.enabled
          ? "Prewarm off — tearing down all warm pods"
          : n > 0
            ? `Prewarm applied — provisioning ${n} pod${n === 1 ? "" : "s"} (takes ~1–2 min)`
            : "Prewarm on, but Warm pods is 0 — no capacity will come up",
      );
      qc.invalidateQueries({ queryKey: ["fleet-inbound-config"] });
      qc.invalidateQueries({ queryKey: ["fleet-inbound-pods"] });
      qc.invalidateQueries({ queryKey: ["fleet-inbound-registry"] });
    },
    onError: (e) => toastApiError(e, "Couldn't update inbound prewarm"),
  });

  const regionValue = region === "any" ? null : region;
  const maxPriceNum = maxPrice ? Number(maxPrice) : undefined;
  const region_ = region === "any" ? undefined : region;

  // Live offers — ALWAYS searched across the full model catalog (like the Deploy
  // dialog) so every candidate machine shows and is selectable. Manual refresh only.
  const offersQ = useQuery<OffersPreview>({
    queryKey: ["fleet-inbound-offers", region_, maxPriceNum],
    queryFn: () => Fleet.offers({ gpus: OFFER_CATALOG, region: region_, maxPrice: maxPriceNum }),
    enabled: active,
  });

  // All offers flattened + price-sorted (cheapest first). Selection is MODEL-level: the
  // inbound pool provisions by GPU model — the cheapest machine of each chosen model —
  // because vast offer ids churn, so a persistent warm pool can't pin one machine.
  // Clicking a chip OR any row of a model selects that whole model, so the chips and the
  // table are ONE linked state. `gpuModels` is the single source of truth (seeded from
  // the saved config).
  const allOffers = React.useMemo(
    () => (offersQ.data?.gpus ?? [])
      .flatMap((g) => (g.offers ?? []).map((o) => ({ ...o, gpuKey: g.gpu })))
      .sort((a, b) => (a.dph ?? Infinity) - (b.dph ?? Infinity)),
    [offersQ.data],
  );
  const gpuTypeValue = gpuModels.join(",") || null;
  // Offers belonging to a selected model — used to light their table rows + price them.
  const selectedOffers = allOffers.filter((o) => gpuModels.includes(o.gpuKey));
  const selectedTableIds = React.useMemo(
    () => new Set(selectedOffers.map((o) => o.id)),
    [selectedOffers],
  );
  // Cheapest $/hr among the SELECTED models — i.e. what actually gets provisioned.
  const selectedCheapest = selectedOffers.reduce<number | null>(
    (min, o) => (typeof o.dph === "number" && (min == null || o.dph < min) ? o.dph : min),
    null,
  );

  const dirty = config != null && (
    enabled !== config.enabled ||
    (gpuTypeValue ?? null) !== (config.gpuType ?? null) ||
    regionValue !== (config.region ?? null) ||
    warmPods !== config.warmPods ||
    busyMessage !== (config.busyMessage ?? "") ||
    (maxPriceNum ?? null) !== (config.maxPrice ?? null)
  );

  // Apply is a PROVISION action, not a settings save — gate it on whether the staged
  // config can actually DO something, not on whether it changed (change-detection made
  // a selected GPU disable the button and an empty selection enable it — backwards):
  //   • prewarm ON  → need a GPU model AND warmPods > 0, else there's nothing to provision.
  //   • prewarm OFF → only when it's a real change (turning the pool off / clearing it).
  // Stopping a running pool is done with the prewarm toggle, not by deselecting GPUs.
  const provisionable = gpuModels.length > 0 && warmPods > 0;
  const canApply = enabled ? provisionable : dirty;

  // Selecting a model (chip) ⇔ selecting all its machine rows: one toggle, one state.
  function toggleModel(m: string) {
    setGpuModels((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  }
  // Clicking any machine row toggles its whole MODEL (rows + chip stay in lock-step).
  function toggleOffer(id: number) {
    const off = allOffers.find((o) => o.id === id);
    if (off) toggleModel(off.gpuKey);
  }

  // One-line live summary derived from the offers (cheapest $/hr + machine count).
  const offerStats = React.useMemo(() => {
    const offers = offersQ.data;
    if (!offers) return null;
    const dphs = offers.gpus
      .flatMap((g) => g.offers ?? [])
      .map((o) => o.dph)
      .filter((d): d is number => typeof d === "number");
    return { count: dphs.length, cheapest: dphs.length ? Math.min(...dphs) : null };
  }, [offersQ.data]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <PanelHeader
            icon={PhoneIncomingIcon}
            title="Inbound prewarm"
            description="Hold a pool of warm GPU pods so inbound calls connect instantly. Capacity is provisioned ahead of time — calls select from it."
          />
          <label className="flex shrink-0 items-center gap-2">
            <Badge variant={enabled ? "default" : "outline"}>{enabled ? "On" : "Off"}</Badge>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={loading || !!error}
            />
          </label>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-4 px-4 pb-4">
            <Skeleton className="h-8 w-full" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertTriangleIcon className="size-5 text-destructive" aria-hidden />
            <p className="text-sm text-muted-foreground">Couldn&apos;t load the inbound config.</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCcwIcon className="size-3.5" /> Retry
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* ── Capacity ── */}
            <div className="space-y-1.5 px-4 py-4">
              <label className="text-sm font-medium">Warm pods</label>
              <Input
                type="number"
                min={0}
                className="tabular w-28"
                value={warmPods}
                onChange={(e) => setWarmPods(Math.max(0, Number(e.target.value)))}
              />
              <p className="text-xs text-muted-foreground tabular-nums">
                ≈ {warmPods * 3} concurrent calls (estimate, ~3 per pod). This number is
                what gets provisioned on Apply — set it to 0 (or turn prewarm off) to stop.
              </p>
              {!enabled && (
                <p className="text-xs text-amber-400">
                  Prewarm is off — the settings below are staged and take effect when you
                  turn it on and Apply.
                </p>
              )}
            </div>

            {/* ── GPU & region ── */}
            <div className="space-y-3 px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Region</label>
                  <Select value={region}
                    onValueChange={(v) => setRegion((v as string) ?? "any")}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Max $/hr (optional)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    className="tabular"
                    placeholder="no cap"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                  />
                </div>
              </div>

              {/* GPU model chips (multi-select) */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">GPU models</label>
                <div className="flex flex-wrap gap-2">
                  {GPU_MODELS.map((m) => {
                    const on = gpuModels.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleModel(m)}
                        aria-pressed={on}
                        className={cn(
                          "inline-flex h-7 items-center rounded-lg border px-2.5 text-xs font-medium transition-colors",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-foreground hover:bg-muted",
                        )}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  The orchestrator provisions warm pods from these models, cheapest-first
                  {maxPriceNum != null ? <> under ${maxPriceNum}/hr</> : ""}. Pick models
                  here, or click machines in the live offers below to target their GPU.
                </p>
              </div>

              {/* Live offers — selectable (per-cost) OfferTable, manual refresh only */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Live Vast offers · {regionLabel(region)} · cheapest first
                  </p>
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5"
                    onClick={() => offersQ.refetch()} disabled={offersQ.isFetching}>
                    <RefreshCwIcon className={cn("size-3.5", offersQ.isFetching && "animate-spin")} />
                    Refresh
                  </Button>
                </div>
                {offersQ.isLoading || !offersQ.data ? (
                  <Skeleton className="h-24 w-full" />
                ) : (
                  <OfferTable
                    offers={offersQ.data}
                    selected={selectedTableIds}
                    onToggle={toggleOffer}
                  />
                )}
                {gpuModels.length > 0 ? (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Provisioning the cheapest of <span className="font-medium text-foreground">{gpuModels.join(", ")}</span>
                    {selectedCheapest != null && <> · from <span className="font-medium text-foreground">${selectedCheapest.toFixed(3)}</span>/hr</>}
                    {" "}· {selectedOffers.length} machine{selectedOffers.length === 1 ? "" : "s"} match
                  </p>
                ) : offerStats && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {offerStats.cheapest != null
                      ? <>Cheapest available: <span className="font-medium text-foreground">${offerStats.cheapest.toFixed(3)}</span>/hr · {offerStats.count} machines</>
                      : <>No machines available — try a different region or raise the cap.</>}
                  </p>
                )}
              </div>
            </div>

            {/* ── Fallback ── */}
            <div className="space-y-1.5 px-4 py-4">
              <label className="text-sm font-medium">Busy message</label>
              <Input value={busyMessage}
                placeholder="Sorry, all of our agents are busy right now…"
                onChange={(e) => setBusyMessage(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Spoken to callers when no warm pod has a free slot, then the call hangs up.
              </p>
            </div>

            {/* ── Footer ── Apply is the ONLY lever that provisions real (billed) GPU
                pods, so spell out exactly what it will do before the click. */}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {!enabled ? (
                  <>Applying tears down <span className="font-medium text-foreground">all</span> warm inbound pods.</>
                ) : warmPods <= 0 ? (
                  <span className="text-amber-400">Prewarm is on but Warm pods is 0 — raise it to provision.</span>
                ) : gpuModels.length === 0 ? (
                  <span className="text-amber-400">Select a GPU model (chip or a machine row) to provision.</span>
                ) : (
                  <>
                    Applying provisions <span className="font-medium text-foreground">{warmPods}</span> billed GPU pod{warmPods === 1 ? "" : "s"}
                    {(selectedCheapest ?? offerStats?.cheapest) != null && (
                      <> ≈ <span className="font-medium text-foreground">${((selectedCheapest ?? offerStats!.cheapest!) * warmPods).toFixed(2)}</span>/hr</>
                    )}.
                  </>
                )}
              </p>
              <Button
                onClick={() => save.mutate({
                  enabled,
                  gpuType: gpuTypeValue,
                  region: regionValue,
                  warmPods,
                  busyMessage,
                  maxPrice: maxPriceNum ?? null,
                })}
                disabled={!canApply || save.isPending}
                className="shrink-0"
              >
                {save.isPending && <Loader2Icon className="size-4 animate-spin" />}
                {save.isPending
                  ? "Applying…"
                  : !enabled
                    ? "Apply — stop pool"
                    : warmPods > 0
                      ? "Apply & provision"
                      : "Apply"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Live list of inbound pods, each with a slot-usage bar + recovery affordance. */
function InboundPodList({
  pods, registry, attachedByPod, loading, error, enabled, target, onRetry,
}: {
  pods: PodRecord[];
  registry: InboundSlot[];
  attachedByPod: Record<string, number>;
  loading: boolean;
  error: Error | null;
  enabled: boolean;
  target: number;
  onRetry: () => void;
}) {
  // Index the registry by join key (slot.podId === pod.inboundToken).
  const slotByToken = React.useMemo(() => {
    const m = new Map<string, InboundSlot>();
    for (const s of registry) m.set(s.podId, s);
    return m;
  }, [registry]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <PanelHeader
          icon={ServerIcon}
          title="Inbound pods"
          description="Warm pods reserved for inbound calls. They also appear in the Infrastructure table."
        />
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertTriangleIcon className="size-5 text-destructive" aria-hidden />
            <p className="text-sm text-muted-foreground">Couldn&apos;t load inbound pods.</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCcwIcon className="size-3.5" /> Retry
            </Button>
          </div>
        ) : pods.length === 0 ? (
          <EmptyState
            icon={ServerIcon}
            title="No inbound pods"
            hint={!enabled
              ? "Prewarm is off — turn it on above and Apply to hold warm capacity for inbound calls."
              : target > 0
                ? "Prewarm is on — pods are provisioning (takes ~1–2 min). Hit Refresh to update."
                : "Prewarm is on but Warm pods is 0 — raise it above and Apply to bring pods up."}
          />
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {pods.map((p) => (
              <InboundPodCard
                key={p.id}
                pod={p}
                slot={p.inboundToken ? slotByToken.get(p.inboundToken) ?? null : null}
                attachedCount={attachedByPod[p.id] ?? 0}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Thin slot-usage bar — text always pairs with the bar (never color-only). */
function SlotUsage({ slot }: { slot: InboundSlot | null }) {
  if (!slot || slot.cap <= 0) {
    return (
      <div className="space-y-1">
        <div className="h-1.5 w-full rounded-full bg-muted" />
        <p className="text-xs text-muted-foreground tabular-nums">
          {slot ? "— calls" : "registering…"}
        </p>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((slot.active / slot.cap) * 100));
  const ratio = slot.active / slot.cap;
  const fill = ratio >= 1 ? "bg-amber-500" : ratio >= 0.7 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="space-y-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", fill)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {slot.active}/{slot.cap} calls
      </p>
    </div>
  );
}

function InboundPodCard({
  pod, slot, attachedCount,
}: { pod: PodRecord; slot: InboundSlot | null; attachedCount: number }) {
  const recoverable = pod.status === "missing" || pod.status === "deprecated";
  const instance = pod.providerId ?? pod.runpodId;
  const seen = relativeTime(pod.lastSeenAt ?? undefined);
  return (
    <div className="space-y-2.5 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <PodStatusBadge status={pod.status} />
        <span className="min-w-0 max-w-[160px] truncate text-right text-xs text-muted-foreground" title={pod.gpuType}>
          {pod.gpuType}
        </span>
      </div>

      <SlotUsage slot={slot} />

      <div className="space-y-1">
        <span className="block max-w-full truncate font-mono text-xs" title={instance}>
          {instance}
        </span>
        {pod.publicUrl && (
          <a href={pod.publicUrl} target="_blank" rel="noopener" title={pod.publicUrl}
            className="inline-flex max-w-full items-center gap-1 font-mono text-xs text-primary underline underline-offset-2">
            <span className="truncate">{pod.publicUrl.replace(/^https?:\/\//, "")}</span>
            <ExternalLinkIcon className="size-3 shrink-0" />
          </a>
        )}
        {seen && (
          <span className="block text-xs text-muted-foreground" title={absoluteTime(pod.lastSeenAt ?? undefined)}>
            seen {seen}
          </span>
        )}
      </div>

      {/* Numbers routed to THIS pod (pinned) — inbound calls to them run on this GPU. */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <PhoneIcon className="size-3.5 shrink-0" />
        {attachedCount > 0
          ? <span><span className="font-medium text-foreground">{attachedCount}</span> number{attachedCount === 1 ? "" : "s"} routed here</span>
          : <span>No numbers routed here yet</span>}
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
        <span>{fmtCost(pod.costPerHr)}/hr · {fmtCost(pod.accumulatedCost)} spent</span>
        <span className="flex items-center gap-1">
          <AttachPodNumbersDialog pod={pod} />
          {recoverable && <ReupButton pod={pod} />}
          {/* Logs · Pause/Resume · Destroy — destroy is always available (even while
              provisioning) so the admin can kill any inbound instance at any time. */}
          <PodActions
            pod={pod}
            invalidateKeys={[["fleet-inbound-pods"], ["fleet-inbound-registry"], ["fleet-inbound-config"]]}
          />
        </span>
      </div>
    </div>
  );
}

/**
 * Re-up confirmation. The AlertDialog is mounted inline and self-controlled by
 * Base UI (always-mounted while the trigger is rendered — conditionally
 * unmounting a Base UI dialog makes the page inert).
 */
export function ReupButton({ pod }: { pod: PodRecord }) {
  const qc = useQueryClient();
  const reup = useMutation({
    mutationFn: () => Fleet.reup(pod.id),
    onSuccess: () => {
      toast.success("Re-upping — provisioning a fresh pod");
      qc.invalidateQueries({ queryKey: ["fleet-pods"] });
      qc.invalidateQueries({ queryKey: ["fleet-inbound-pods"] });
    },
    onError: (e) => toastApiError(e, "Couldn't re-up pod"),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={
        <Button variant="outline" size="sm" disabled={reup.isPending}>
          {reup.isPending
            ? <Loader2Icon className="size-3.5 animate-spin" />
            : <RotateCcwIcon className="size-3.5" />}
          {reup.isPending ? "Re-upping…" : "Re-up"}
        </Button>} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Re-up this pod?</AlertDialogTitle>
          <AlertDialogDescription>
            vast.ai removed this pod. Re-up deletes the dead record and redeploys an
            identical pod with the same inbound config. This provisions a new instance
            and resumes billing.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => reup.mutate()} disabled={reup.isPending}>
            {reup.isPending && <Loader2Icon className="size-3.5 animate-spin" />}
            {reup.isPending ? "Re-upping…" : "Re-up"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
