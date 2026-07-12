"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Fleet,
  type FleetCampaign,
  type LaunchDryRun,
  type LaunchResult,
} from "@/lib/api/fleet";
import { toastApiError } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { OfferTable } from "@/components/fleet/offer-table";
import {
  RocketIcon, RefreshCwIcon, Loader2Icon, UsersIcon, BotIcon,
  TriangleAlertIcon, ChevronDownIcon, SlidersHorizontalIcon,
} from "lucide-react";

// The preview always searches this full catalog so every candidate machine shows
// in the offers table; the admin then multi-selects specific offers by cost.
const OFFER_CATALOG = "RTX 5060 Ti,RTX 5070 Ti,RTX 5080,RTX 5090";

// Same image, two registries. GHCR has no anonymous pull quota (Docker Hub:
// 10 pulls/hr per shared datacenter IP — large pulls stall in retry loops).
const REGISTRY_IMAGES = {
  ghcr: "ghcr.io/haziqajam/aicaller-backend-5090:latest",
  dockerhub: "absar12/aicaller-backend-5090:latest",
} as const;
const REGISTRY_LABELS: Record<keyof typeof REGISTRY_IMAGES, string> = {
  ghcr: "GHCR (GitHub) — no pull throttling",
  dockerhub: "Docker Hub — anonymous pulls throttled",
};
const REGIONS = [
  { value: "any", label: "Any region" },
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "GB", label: "United Kingdom" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
];

function fmtCampaign(c: FleetCampaign): string {
  const who = c.ownerEmail ?? c.ownerId ?? "unknown";
  const bot = c.assistantName ? ` · ${c.assistantName}` : "";
  const st = c.status ? ` · ${c.status}` : "";
  return `${who}${bot} (${c.leadCount.toLocaleString()} leads)${st}`;
}

/**
 * Admin Deploy dialog. Admins are the only role that provisions GPU capacity:
 * pick a campaign (cross-user), the dialog auto-sizes the run + pulls live Vast
 * offers, then Deploy provisions real pods (spends money + places calls).
 * Users never see this — they only launch a campaign, which queues a run request.
 */
export function LaunchFleetDialog({
  open, onOpenChange, defaultCampaignId, onLaunched,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultCampaignId?: string;
  onLaunched: () => void;
}) {
  const [campaignId, setCampaignId] = React.useState<string>("");
  const [pods, setPods] = React.useState(1);
  const [podsTouched, setPodsTouched] = React.useState(false);
  const [region, setRegion] = React.useState("US");
  const [advanced, setAdvanced] = React.useState(false);
  const [concurrency, setConcurrency] = React.useState(4);
  const [maxPrice, setMaxPrice] = React.useState("");
  const [selectedOfferIds, setSelectedOfferIds] = React.useState<Set<number>>(new Set());
  // Launch behavior (default on = today's behavior: dial on boot, reap on drain).
  const [autoStart, setAutoStart] = React.useState(true);
  const [autoDestroy, setAutoDestroy] = React.useState(true);
  // Registry the pods pull the backend image from. GHCR mirrors the same image
  // but has no anonymous pull throttling (Docker Hub allows only 10 anonymous
  // pulls/hour per shared datacenter IP, which stalls/kills large pulls).
  const [registry, setRegistry] = React.useState<"ghcr" | "dockerhub">("ghcr");

  // Reset to a clean slate on each open transition (render-time state sync — the
  // React-recommended alternative to a setState-in-effect, guarded so it runs once).
  const [prevOpen, setPrevOpen] = React.useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCampaignId(defaultCampaignId ?? "");
      setPodsTouched(false);
      setPods(1);
      setSelectedOfferIds(new Set());
      setAutoStart(true);
      setAutoDestroy(true);
    }
  }

  const campaignsQ = useQuery<FleetCampaign[]>({
    queryKey: ["fleet-campaigns"],
    queryFn: Fleet.campaigns,
    enabled: open,
  });
  const campaigns = React.useMemo(() => campaignsQ.data ?? [], [campaignsQ.data]);
  const selected = campaigns.find((c) => c.id === campaignId) ?? null;

  // Friendly value→label map so the closed trigger shows a name, not an id.
  const campaignItems = React.useMemo(
    () => Object.fromEntries(campaigns.map((c) => [c.id, fmtCampaign(c)])),
    [campaigns],
  );

  // Per-offer (per-cost) multi-select. Vast offer ids are single-use and churn on
  // every refetch, so we DON'T pin a machine id at deploy. Instead the selection
  // compiles to a reliable contract: the distinct GPU models the admin picked +
  // a $/hr cap derived from the costs they picked. The backend then provisions
  // those models cheapest-first, never above the price the admin chose.
  function toggleOffer(id: number) {
    setSelectedOfferIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Auto dry-run: sizes the run + pulls live offers across the full catalog (so
  // every candidate machine shows). An explicit Advanced cap filters the search;
  // keyed by what changes the search. Refresh re-runs it on demand.
  const region_ = region === "any" ? undefined : region;
  const explicitCap = maxPrice ? Number(maxPrice) : undefined;
  const previewQ = useQuery<LaunchDryRun>({
    queryKey: ["fleet-deploy-preview", campaignId, region_, explicitCap, concurrency],
    queryFn: () => Fleet.launch({
      campaignId, pods: 1, concurrency,
      gpus: OFFER_CATALOG, region: region_, maxPrice: explicitCap,
      dryRun: true,
    }) as Promise<LaunchDryRun>,
    enabled: open && !!campaignId,
  });
  const preview = previewQ.data ?? null;
  const rec = preview?.recommendation;

  // Adopt the recommended pod count until the admin overrides it (render-time
  // sync against the previous recommendation — no setState-in-effect).
  const recPods = rec?.recommendedPods;
  const [prevRecPods, setPrevRecPods] = React.useState<number | undefined>(undefined);
  if (recPods !== prevRecPods) {
    setPrevRecPods(recPods);
    if (recPods && !podsTouched) setPods(recPods);
  }

  // All offers flattened + price-sorted (one row per machine); the selection is
  // the intersection with the CURRENT offers, so ids that vanished on a refetch
  // simply drop out (no stale pinning).
  const allOffers = React.useMemo(
    () => (preview?.offers.gpus ?? [])
      .flatMap((g) => (g.offers ?? []).map((o) => ({ ...o, gpuKey: g.gpu })))
      .sort((a, b) => (a.dph ?? Infinity) - (b.dph ?? Infinity)),
    [preview],
  );
  const selectedOffers = allOffers.filter((o) => selectedOfferIds.has(o.id));
  const targetModels = [...new Set(selectedOffers.map((o) => o.gpuKey))]; // cheapest model first
  const selDphs = selectedOffers.map((o) => o.dph)
    .filter((d): d is number => typeof d === "number");
  // The selection picks which GPU MODELS to target (cheapest-first within them); the
  // $/hr cap stays OPTIONAL (Advanced only). Deriving a hard cap from the picked
  // prices starved multi-pod deploys — a tight cap left too few distinct machines
  // for N pods. So only an explicit cap is sent.
  const effectiveCap = explicitCap;

  // Total GPU-hours are ~constant in pod count (more pods → proportionally less
  // wall-clock), so est spend ≈ cheapest selected $/hr × recommended pods × est hours.
  const cheapest = selDphs.length ? Math.min(...selDphs) : null;
  const gpuHours = rec ? rec.estHours * rec.recommendedPods : null;
  const estHoursForPods = rec && pods > 0 ? (rec.estHours * rec.recommendedPods) / pods : null;
  const estSpend = cheapest != null && gpuHours != null ? cheapest * gpuHours : null;

  const deploy = useMutation({
    mutationFn: () => Fleet.launch({
      campaignId, pods, concurrency,
      gpus: targetModels.join(",") || undefined, region: region_, maxPrice: effectiveCap,
      autoStart, autoDestroy,
      podImage: REGISTRY_IMAGES[registry],
    }) as Promise<LaunchResult>,
    onSuccess: (r) => {
      toast.success(`Deploying — provisioning ${r.chosenPods ?? pods} pod(s)`);
      onOpenChange(false);
      onLaunched();
    },
    onError: (e) => toastApiError(e, "Deploy failed"),
  });

  const noNumbers = Boolean(selected && !selected.hasNumberList);
  const noGpu = selectedOffers.length === 0;
  const canDeploy = Boolean(campaignId) && pods >= 1 && concurrency >= 1
    && !noNumbers && !noGpu && !deploy.isPending;

  function onSelectCampaign(v: string) {
    setCampaignId(v);
    setPodsTouched(false); // re-adopt the recommendation for the new campaign
    setSelectedOfferIds(new Set());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Deploy a fleet</DialogTitle>
          <DialogDescription>
            Provisions GPU pods on Vast.ai to dial a campaign&apos;s leads. The run is
            sized automatically — review and deploy. This spends money and places real calls.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Campaign picker */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Campaign</label>
            {campaignsQ.isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No draft campaigns to deploy. Create one (or save a campaign as a draft) first.
              </p>
            ) : (
              <Select items={campaignItems} value={campaignId || null}
                onValueChange={(v) => onSelectCampaign((v as string) ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a campaign to deploy…" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="font-medium">{c.ownerEmail ?? c.ownerId ?? "unknown"}</span>
                      {c.assistantName && (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <BotIcon className="size-3" />{c.assistantName}
                        </span>
                      )}
                      <span className="tabular text-[11px] text-muted-foreground">
                        {c.leadCount.toLocaleString()} leads
                      </span>
                      {c.status && (
                        <Badge variant={c.status === "draft" ? "secondary" : "outline"}
                          className="text-[10px] capitalize">{c.status}</Badge>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {noNumbers && (
              <p className="flex items-center gap-1.5 text-xs text-amber-500">
                <TriangleAlertIcon className="size-3.5" />
                This campaign has no number list — it can&apos;t place calls. Attach one first.
              </p>
            )}
          </div>

          {/* Sizing + summary — only once a campaign is chosen */}
          {campaignId && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              {previewQ.isLoading || !preview ? (
                <Skeleton className="h-5 w-72" />
              ) : (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <UsersIcon className="size-3.5" />
                  {preview.leadCount.toLocaleString()} leads · recommended{" "}
                  <span className="font-medium text-foreground">{rec?.recommendedPods} pod(s)</span>
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Pods</label>
                  <Input type="number" min={1} className="tabular" value={pods}
                    onChange={(e) => { setPodsTouched(true); setPods(Math.max(1, Number(e.target.value))); }} />
                </div>
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
              </div>

              <p className="text-xs text-muted-foreground">
                {pods} × {concurrency} = <span className="font-medium text-foreground">{pods * concurrency}</span> simultaneous calls
                {estHoursForPods != null && <> · ~{estHoursForPods.toFixed(1)}h to finish</>}
                {estSpend != null && <> · est <span className="font-medium text-foreground">${estSpend.toFixed(2)}</span></>}
              </p>
            </div>
          )}

          {/* Live offers — click individual machines to select them by cost (multi-select) */}
          {campaignId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Live Vast offers · click machines to select {region_ ? `· ${region_}` : "· any region"}
                </p>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5"
                  onClick={() => previewQ.refetch()} disabled={previewQ.isFetching}>
                  {previewQ.isFetching
                    ? <Loader2Icon className="size-3.5 animate-spin" />
                    : <RefreshCwIcon className="size-3.5" />}
                  Refresh
                </Button>
              </div>
              {previewQ.isLoading || !preview ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <OfferTable offers={preview.offers} selected={selectedOfferIds} onToggle={toggleOffer} />
              )}
              <p className="text-xs text-muted-foreground">
                {noGpu ? (
                  <span className="text-amber-500">Select at least one machine to deploy.</span>
                ) : (
                  <>
                    Selected <span className="font-medium text-foreground">{selectedOffers.length}</span> machine(s) ·
                    targeting <span className="font-medium text-foreground">{targetModels.join(", ")}</span>
                    {effectiveCap != null && <> · ≤ <span className="font-medium text-foreground">${effectiveCap.toFixed(3)}</span>/hr</>}.
                    The fleet provisions {pods} pod(s) of these models cheapest-first
                    {effectiveCap != null ? " under your cap" : ""}. Set a Max $/hr cap in Advanced to bound spend.
                  </>
                )}
              </p>
            </div>
          )}

          {/* Advanced */}
          {campaignId && (
            <div className="rounded-lg border border-border">
              <button type="button" onClick={() => setAdvanced((a) => !a)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium">
                <SlidersHorizontalIcon className="size-4 text-muted-foreground" />
                Advanced
                <ChevronDownIcon className={`ml-auto size-4 text-muted-foreground transition-transform ${advanced ? "rotate-180" : ""}`} />
              </button>
              {advanced && (
                <div className="space-y-3 border-t border-border p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Concurrency / pod</label>
                      <Input type="number" min={1} className="tabular" value={concurrency}
                        onChange={(e) => setConcurrency(Math.max(1, Number(e.target.value)))} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Max $/hr cap</label>
                      <Input type="number" step="0.01" min={0} className="tabular" value={maxPrice}
                        placeholder="from selection" onChange={(e) => setMaxPrice(e.target.value)} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Leave the cap blank to derive it from the machines you select above. Set it to
                    filter the offer list and hard-cap spend regardless of selection.
                  </p>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Image registry</label>
                    <Select
                      items={REGISTRY_LABELS}
                      value={registry}
                      onValueChange={(v) => setRegistry((v ?? "ghcr") as "ghcr" | "dockerhub")}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ghcr">{REGISTRY_LABELS.ghcr}</SelectItem>
                        <SelectItem value="dockerhub">{REGISTRY_LABELS.dockerhub}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Where pods pull the backend image from. Same image either way —{" "}
                      <span className="font-mono text-[10px]">{REGISTRY_IMAGES[registry]}</span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Launch behavior */}
          {campaignId && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Launch behavior
              </p>
              <label className="flex items-start justify-between gap-3">
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Start calling automatically</span>
                  <span className="block text-xs text-muted-foreground">
                    {autoStart
                      ? "Pods begin dialing as soon as they're up."
                      : "Pods come up ready and wait — you press Start when you want calls to begin."}
                  </span>
                </span>
                <Switch checked={autoStart} onCheckedChange={setAutoStart} />
              </label>
              <label className="flex items-start justify-between gap-3">
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Auto-destroy when finished</span>
                  <span className="block text-xs text-muted-foreground">
                    {autoDestroy
                      ? "Pods tear down once all leads are dialed (stops GPU billing)."
                      : "Pods stay up after finishing so you can re-dial or inspect — destroy them manually."}
                  </span>
                </span>
                <Switch checked={autoDestroy} onCheckedChange={setAutoDestroy} />
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => deploy.mutate()} disabled={!canDeploy}>
            {deploy.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <RocketIcon className="size-4" />}
            {deploy.isPending ? "Deploying…" : `Deploy ${pods} pod(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
