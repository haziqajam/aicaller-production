"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Numbers, NumberLists, type AvailableNumber, type NumberFilters } from "@/lib/api/resources";
import { TwilioPresets, type TwilioPreset } from "@/lib/api/twilio-presets";
import { toastApiError, parseApiError } from "@/lib/api/errors";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  PlusIcon,
  SearchIcon,
  RotateCcwIcon,
  AlertCircleIcon,
  PhoneIcon,
  MapPinIcon,
  InfoIcon,
  Loader2Icon,
  CheckIcon,
} from "lucide-react";

/* ─── Constants ──────────────────────────────────────────────── */

/* State/region options (Twilio in_region expects 2-letter codes). */
const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
  ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"],
  ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
].map(([value, label]) => ({ value, label }));

const AU_STATES = [
  ["NSW", "New South Wales"], ["VIC", "Victoria"], ["QLD", "Queensland"],
  ["WA", "Western Australia"], ["SA", "South Australia"], ["TAS", "Tasmania"],
  ["ACT", "Australian Capital Territory"], ["NT", "Northern Territory"],
].map(([value, label]) => ({ value, label }));

const PK_PROVINCES = [
  ["PB", "Punjab"], ["SD", "Sindh"], ["KP", "Khyber Pakhtunkhwa"],
  ["BA", "Balochistan"], ["IS", "Islamabad Capital Territory"],
  ["GB", "Gilgit-Baltistan"], ["JK", "Azad Jammu & Kashmir"],
].map(([value, label]) => ({ value, label }));

const REGIONS_BY_COUNTRY: Record<string, { value: string; label: string }[]> = {
  US: US_STATES,
  AU: AU_STATES,
  PK: PK_PROVINCES,
};

/* Curated major cities per "country:region" (Twilio in_locality is a city-name
   string). Keyed by country+region so codes that overlap across countries —
   e.g. US "SD" (South Dakota) vs PK "SD" (Sindh) — never collide. */
const CITIES_BY_REGION: Record<string, string[]> = {
  "US:CA": ["Los Angeles", "San Francisco", "San Diego", "San Jose", "Sacramento", "Oakland", "Fresno"],
  "US:NY": ["New York", "Brooklyn", "Buffalo", "Rochester", "Albany", "Syracuse"],
  "US:TX": ["Houston", "Dallas", "Austin", "San Antonio", "Fort Worth", "El Paso"],
  "US:FL": ["Miami", "Orlando", "Tampa", "Jacksonville", "Fort Lauderdale", "Tallahassee"],
  "US:IL": ["Chicago", "Aurora", "Naperville", "Springfield"],
  "US:WA": ["Seattle", "Spokane", "Tacoma", "Bellevue"],
  "US:MA": ["Boston", "Worcester", "Cambridge", "Springfield"],
  "US:GA": ["Atlanta", "Savannah", "Augusta", "Columbus"],
  "US:PA": ["Philadelphia", "Pittsburgh", "Allentown", "Harrisburg"],
  "US:AZ": ["Phoenix", "Tucson", "Mesa", "Scottsdale"],
  "US:CO": ["Denver", "Colorado Springs", "Aurora", "Boulder"],
  "US:NC": ["Charlotte", "Raleigh", "Greensboro", "Durham"],
  "US:NV": ["Las Vegas", "Reno", "Henderson"],
  "US:OR": ["Portland", "Salem", "Eugene"],
  "US:NJ": ["Newark", "Jersey City", "Trenton"],
  "US:VA": ["Virginia Beach", "Richmond", "Arlington", "Norfolk"],
  "US:MI": ["Detroit", "Grand Rapids", "Ann Arbor", "Lansing"],
  "US:OH": ["Columbus", "Cleveland", "Cincinnati", "Toledo"],
  "US:TN": ["Nashville", "Memphis", "Knoxville", "Chattanooga"],
  "US:DC": ["Washington"],
  "AU:NSW": ["Sydney", "Newcastle", "Wollongong"],
  "AU:VIC": ["Melbourne", "Geelong", "Ballarat"],
  "AU:QLD": ["Brisbane", "Gold Coast", "Cairns", "Townsville"],
  "AU:WA": ["Perth", "Fremantle", "Mandurah"],
  "AU:SA": ["Adelaide"],
  "AU:TAS": ["Hobart", "Launceston"],
  "AU:ACT": ["Canberra"],
  "AU:NT": ["Darwin", "Alice Springs"],
  "PK:PB": ["Lahore", "Faisalabad", "Rawalpindi", "Multan", "Gujranwala"],
  "PK:SD": ["Karachi", "Hyderabad", "Sukkur"],
  "PK:KP": ["Peshawar", "Mardan", "Abbottabad"],
  "PK:BA": ["Quetta", "Gwadar"],
  "PK:IS": ["Islamabad"],
  "PK:GB": ["Gilgit", "Skardu"],
  "PK:JK": ["Muzaffarabad", "Mirpur"],
};

const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "AU", label: "Australia" },
  { value: "PK", label: "Pakistan" },
];

/* Number types Twilio actually offers per country (verified against the API —
   requesting an unsupported type, e.g. Mobile in the US, returns a 404). */
const TYPE_LOCAL = { value: "local", label: "Local" };
const TYPE_TOLLFREE = { value: "tollfree", label: "Toll-free" };
const TYPE_MOBILE = { value: "mobile", label: "Mobile" };

const TYPES_BY_COUNTRY: Record<string, { value: string; label: string }[]> = {
  US: [TYPE_LOCAL, TYPE_TOLLFREE],
  AU: [TYPE_LOCAL, TYPE_MOBILE, TYPE_TOLLFREE],
  PK: [TYPE_MOBILE], // Pakistan offers mobile numbers (when enabled on the account)
};

const DEFAULT_TYPE_OPTIONS = [TYPE_LOCAL, TYPE_TOLLFREE];

const DEFAULT_FILTERS: NumberFilters = {
  country: "US",
  type: "local",
  areaCode: "",
  contains: "",
  inLocality: "",
  inRegion: "",
  voiceEnabled: undefined,
  smsEnabled: undefined,
  mmsEnabled: undefined,
  limit: 20,
};

/* ─── Capability badge ───────────────────────────────────────── */

function CapBadge({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean;
}) {
  if (!enabled) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular",
        "bg-success/12 text-success border-success/25"
      )}
    >
      {label}
    </span>
  );
}

/* ─── Skeleton rows ──────────────────────────────────────────── */

function ResultRowSkeleton() {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2.5">
        <Skeleton className="h-4 w-32" />
      </td>
      <td className="px-3 py-2.5">
        <Skeleton className="h-4 w-24" />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex gap-1">
          <Skeleton className="h-4 w-10 rounded-full" />
          <Skeleton className="h-4 w-8 rounded-full" />
        </div>
      </td>
      <td className="px-3 py-2.5">
        <Skeleton className="h-7 w-12 rounded-md ml-auto" />
      </td>
    </tr>
  );
}

/* ─── Result row ─────────────────────────────────────────────── */

function ResultRow({
  number,
  onBuy,
  buying,
  purchased,
}: {
  number: AvailableNumber;
  onBuy: (number: AvailableNumber) => void;
  buying: boolean;
  purchased: boolean;
}) {
  const location = [number.locality, number.region]
    .filter(Boolean)
    .join(", ") || "—";

  const hasAddressReq = number.addressRequirements !== "none";

  return (
    <tr className="border-b border-border last:border-0 transition-colors duration-150 hover:bg-muted/30">
      {/* Number */}
      <td className="px-3 py-2.5">
        <span className="tabular text-sm font-medium text-foreground">
          {number.friendlyName || number.phoneNumber}
        </span>
        {number.beta && (
          <span className="ml-1.5 inline-flex items-center rounded-full border border-warning/25 bg-warning/12 px-1.5 py-0.5 text-[10px] font-medium text-warning">
            Beta
          </span>
        )}
      </td>

      {/* Location */}
      <td className="px-3 py-2.5">
        <span className="text-xs text-muted-foreground">{location}</span>
      </td>

      {/* Capabilities */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <CapBadge label="Voice" enabled={number.capabilities.voice} />
          <CapBadge label="SMS" enabled={number.capabilities.sms} />
          <CapBadge label="MMS" enabled={number.capabilities.mms} />
          {hasAddressReq && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="inline-flex cursor-default items-center" />
                  }
                >
                  <InfoIcon className="size-3 text-warning" aria-hidden />
                  <span className="sr-only">Address registration required</span>
                </TooltipTrigger>
                <TooltipContent>
                  Address registration required
                  {number.addressRequirements !== "any" && (
                    <> ({number.addressRequirements})</>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </td>

      {/* Buy button */}
      <td className="px-3 py-2.5 text-right">
        {purchased ? (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <CheckIcon className="size-3" aria-hidden />
            Bought
          </span>
        ) : (
          <Button
            size="sm"
            onClick={() => onBuy(number)}
            disabled={buying}
          >
            {buying ? (
              <>
                <Loader2Icon className="size-3 animate-spin" aria-hidden />
                Buying…
              </>
            ) : (
              "Buy"
            )}
          </Button>
        )}
      </td>
    </tr>
  );
}

/* ─── Main dialog ────────────────────────────────────────────── */

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "results"; data: AvailableNumber[] }
  | { status: "empty" }
  | { status: "error"; message: string };

export function BuyNumberDialog({ onBought, listId }: { onBought?: () => void; listId?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  // Twilio number ops require an active account preset (backend 409s otherwise).
  const { data: presets } = useQuery<TwilioPreset[]>({
    queryKey: ["twilio-presets"], queryFn: TwilioPresets.list, enabled: open,
  });
  const hasActivePreset = (presets ?? []).some((p) => p.active);
  const [filters, setFilters] = React.useState<NumberFilters>(DEFAULT_FILTERS);
  const [search, setSearch] = React.useState<SearchState>({ status: "idle" });
  const [buyingNumber, setBuyingNumber] = React.useState<string | null>(null);
  const [purchasedNumbers, setPurchasedNumbers] = React.useState<Set<string>>(new Set());

  /* Derived flags */
  const isLocal = filters.type === "local";
  const isLocalOrTollfree = filters.type === "local" || filters.type === "tollfree";
  const regionOptions = REGIONS_BY_COUNTRY[filters.country ?? "US"] ?? [];
  const typeOptions = TYPES_BY_COUNTRY[filters.country ?? "US"] ?? DEFAULT_TYPE_OPTIONS;
  const cityOptions = filters.inRegion
    ? CITIES_BY_REGION[`${filters.country ?? "US"}:${filters.inRegion}`] ?? []
    : [];

  function update(patch: Partial<NumberFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function handleReset() {
    setFilters(DEFAULT_FILTERS);
    setSearch({ status: "idle" });
    setPurchasedNumbers(new Set());
  }

  /* Search */
  async function handleSearch() {
    setSearch({ status: "loading" });
    try {
      const results = await Numbers.available(filters);
      if (!results || results.length === 0) {
        setSearch({ status: "empty" });
      } else {
        setSearch({ status: "results", data: results });
      }
    } catch (err) {
      setSearch({ status: "error", message: parseApiError(err, "Couldn't search numbers") });
    }
  }

  /* Buy — send the full geo metadata so the backend can persist it */
  const buyMutation = useMutation({
    mutationFn: async (number: AvailableNumber) => {
      const res = await Numbers.buy({
        phoneNumber: number.phoneNumber,
        isoCountry: number.isoCountry,
        region: number.region,
        locality: number.locality,
        postalCode: number.postalCode,
        friendlyName: number.friendlyName,
        capabilities: number.capabilities,
      });
      // When buying from inside a number list, provision AND add it to the list
      // in one step (mirrors importing leads directly into a lead list).
      if (listId && res?.id) await NumberLists.addNumbers(listId, [res.id]);
      return res;
    },
    onMutate: (number) => {
      setBuyingNumber(number.phoneNumber);
    },
    onSuccess: (_, number) => {
      toast.success(`Purchased ${number.phoneNumber}`);
      setPurchasedNumbers((prev) => new Set([...prev, number.phoneNumber]));
      qc.invalidateQueries({ queryKey: ["numbers"] });
      if (listId) qc.invalidateQueries({ queryKey: ["number-list", listId] });
      onBought?.();
      // Keep dialog open but mark row purchased
    },
    onError: (err) => {
      toastApiError(err, "Couldn't buy number");
    },
    onSettled: () => {
      setBuyingNumber(null);
    },
  });

  function handleBuy(number: AvailableNumber) {
    buyMutation.mutate(number);
  }

  /* Close & reset when dialog closes */
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setSearch({ status: "idle" });
      setFilters(DEFAULT_FILTERS);
      setPurchasedNumbers(new Set());
      setBuyingNumber(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button>
            <PlusIcon className="size-4" aria-hidden />
            Buy number
          </Button>
        }
      />
      <DialogContent
        className="sm:max-w-2xl lg:max-w-3xl"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>Search &amp; buy a number</DialogTitle>
          <DialogDescription>
            Search Twilio&apos;s inventory with filters and purchase a number for inbound calls.
          </DialogDescription>
        </DialogHeader>

        {presets !== undefined && !hasActivePreset && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
            <span>No active Twilio account — add one to search and buy numbers.</span>
            <Link href="/settings/twilio" className="ml-auto font-medium underline underline-offset-2">
              Add account
            </Link>
          </div>
        )}

        {/* ── Filter section ──────────────────────────────────────── */}
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          {/* Row 1: Country + Type */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Country
              </label>
              <Select
                value={filters.country ?? "US"}
                onValueChange={(v: string | null) => {
                  const country = v ?? "US";
                  const firstType =
                    (TYPES_BY_COUNTRY[country] ?? DEFAULT_TYPE_OPTIONS)[0]?.value ??
                    "local";
                  update({
                    country,
                    type: firstType,
                    inRegion: "",
                    inLocality: "",
                    areaCode: "",
                  });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Type
              </label>
              <Select
                value={filters.type ?? "local"}
                onValueChange={(v: string | null) => {
                  update({ type: v ?? "local", areaCode: "", inLocality: "", inRegion: "" });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Area code — shown for local and tollfree */}
            {isLocalOrTollfree && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Area code
                </label>
                <Input
                  placeholder="e.g. 415"
                  value={filters.areaCode ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    update({ areaCode: v });
                  }}
                  maxLength={6}
                  inputMode="numeric"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Contains
              </label>
              <Input
                placeholder="e.g. 415*** or **HELP"
                value={filters.contains ?? ""}
                onChange={(e) => update({ contains: e.target.value })}
              />
            </div>
          </div>

          {/* Row 2: State/Region + City — local only.
              City now sits in the former State slot (right); State is on the left. */}
          {isLocal && (
            <div className="grid grid-cols-2 gap-2">
              {/* State / Region (dropdown) */}
              <div className="space-y-1">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  State / Region
                </label>
                <Select
                  value={filters.inRegion || "__any"}
                  onValueChange={(v: string | null) =>
                    update({ inRegion: v && v !== "__any" ? v : "", inLocality: "" })
                  }
                  disabled={regionOptions.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={regionOptions.length ? "Any state" : "No regions"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any">Any state</SelectItem>
                    {regionOptions.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* City (dropdown) — cascades from the selected state */}
              <div className="space-y-1">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  City
                </label>
                <Select
                  value={filters.inLocality || "__any"}
                  onValueChange={(v: string | null) =>
                    update({ inLocality: v && v !== "__any" ? v : "" })
                  }
                  disabled={!filters.inRegion || cityOptions.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <span className="flex min-w-0 items-center gap-2">
                      <MapPinIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <SelectValue
                        placeholder={
                          !filters.inRegion
                            ? "Select a state first"
                            : cityOptions.length
                              ? "Any city"
                              : "No preset cities"
                        }
                      />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any">Any city</SelectItem>
                    {cityOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Row 3: Capabilities + Limit + Actions */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            {/* Capability checkboxes */}
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Capabilities
              </p>
              <div className="flex items-center gap-4">
                {(
                  [
                    { key: "voiceEnabled" as const, label: "Voice" },
                    { key: "smsEnabled" as const, label: "SMS" },
                    { key: "mmsEnabled" as const, label: "MMS" },
                  ] as const
                ).map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-1.5 text-sm text-foreground select-none"
                  >
                    <Checkbox
                      checked={filters[key] === true}
                      onCheckedChange={(checked) =>
                        update({ [key]: checked === true ? true : undefined })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Limit + action buttons */}
            <div className="flex items-center gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Limit
                </label>
                <Select
                  value={String(filters.limit ?? 20)}
                  onValueChange={(v: string | null) =>
                    update({ limit: v ? Number(v) : 20 })
                  }
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 30, 50].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end gap-2">
                <Button
                  variant="ghost"
                  onClick={handleReset}
                  className="self-end"
                  title="Reset all filters"
                >
                  <RotateCcwIcon className="size-4" aria-hidden />
                  Reset
                </Button>
                <Button
                  onClick={handleSearch}
                  disabled={search.status === "loading" || !hasActivePreset}
                  className="self-end"
                >
                  {search.status === "loading" ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" aria-hidden />
                      Searching…
                    </>
                  ) : (
                    <>
                      <SearchIcon className="size-4" aria-hidden />
                      Search
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Contains helper text */}
          <p className="text-[11px] text-muted-foreground">
            Tip: use <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">*</code> as a wildcard in &quot;Contains&quot;, e.g. <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">415***</code> or <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">**HELP</code>.
          </p>
        </div>

        {/* ── Results section ────────────────────────────────────────── */}
        <div className="min-h-[120px] overflow-hidden rounded-lg border border-border">
          {/* Initial state */}
          {search.status === "idle" && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                <PhoneIcon className="size-5 text-muted-foreground" aria-hidden />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">Ready to search</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Set filters above and click Search to browse Twilio&apos;s number inventory.
                </p>
              </div>
            </div>
          )}

          {/* Loading */}
          {search.status === "loading" && (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Number
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Location
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Capabilities
                    </th>
                    <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <ResultRowSkeleton key={i} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty */}
          {search.status === "empty" && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                <SearchIcon className="size-5 text-muted-foreground" aria-hidden />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">No numbers found</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  No numbers match these filters. Try relaxing your criteria or changing the area code.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {search.status === "error" && (
            <div className="flex items-start gap-3 p-4">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-destructive">Search failed</p>
                <p className="text-xs text-muted-foreground">{search.message}</p>
              </div>
            </div>
          )}

          {/* Results */}
          {search.status === "results" && (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-card">
                    <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Number
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Location
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Capabilities
                    </th>
                    <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {search.data.map((n) => (
                    <ResultRow
                      key={n.phoneNumber}
                      number={n}
                      onBuy={handleBuy}
                      buying={buyingNumber === n.phoneNumber}
                      purchased={purchasedNumbers.has(n.phoneNumber)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter showCloseButton>
          <></>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
