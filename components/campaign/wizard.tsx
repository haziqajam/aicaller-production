"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Assistants, Campaigns, LeadLists, NumberLists, CampaignRuns } from "@/lib/api/resources";
import type { LeadList, NumberList } from "@/lib/api/schemas";
import { toastApiError } from "@/lib/api/errors";
import { getRole } from "@/lib/auth";
import { pacingSummary } from "@/lib/pacing";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  BotIcon,
  UsersIcon,
  PhoneOutgoingIcon,
  GaugeIcon,
  ClipboardCheckIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  RocketIcon,
  ClockIcon,
  TimerIcon,
  RepeatIcon,
  SaveIcon,
  type LucideIcon,
} from "lucide-react";

// Step definitions — label + icon, kept in lockstep with StepIndex.
const STEPS = [
  { label: "Assistant", icon: BotIcon },
  { label: "Leads", icon: UsersIcon },
  { label: "Numbers", icon: PhoneOutgoingIcon },
  { label: "Pacing", icon: GaugeIcon },
  { label: "Review", icon: ClipboardCheckIcon },
] as const;
type StepIndex = 0 | 1 | 2 | 3 | 4;

// Per-step accent tones for the section header icon badge (mirrors editor-form).
const TONE: Record<string, string> = {
  cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-400",
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

type WizardState = {
  assistantId: string;
  listId: string;
  // The campaign now dials FROM a reusable number list (a pool of the user's
  // numbers), optionally rotating across them. The backend derives the campaign's
  // primary fromNumber from the list's first member.
  numberListId: string;
  rotateNumbers: boolean;
  concurrency: number;
  delayBetweenCalls: number;
  maxCallDuration: number;
};

function StepIndicator({ current }: { current: StepIndex }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {STEPS.map((s, i) => {
        const isDone = i < current;
        const isActive = i === current;
        const Icon = s.icon;
        return (
          <React.Fragment key={s.label}>
            <div
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-150",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : isDone
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {isDone ? (
                <CheckIcon className="size-3 shrink-0" aria-hidden />
              ) : (
                <Icon className="size-3 shrink-0" aria-hidden />
              )}
              <span>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px w-4 shrink-0 rounded transition-colors duration-150",
                  i < current ? "bg-primary/40" : "bg-border"
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Step 1: Select assistant
function StepAssistant({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { data: assistants, isLoading } = useQuery({
    queryKey: ["assistants"],
    queryFn: Assistants.list,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  const list = assistants ?? [];

  return (
    <div className="space-y-3">
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No assistants found. Create one in the Assistants section first.
        </p>
      ) : (
        <Select value={value || null} onValueChange={(v) => onChange(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select an assistant…" />
          </SelectTrigger>
          <SelectContent>
            {list.map((a) => (
              <SelectItem key={a.id ?? a.name} value={a.id ?? a.name}>
                <BotIcon className="size-3.5 text-muted-foreground" />
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {value && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <BotIcon className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span>
            Selected:{" "}
            <span className="font-medium text-foreground">
              {list.find((a) => (a.id ?? a.name) === value)?.name ?? value}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

// Step 2: Select leads
function StepLeads({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { data: lists, isLoading } = useQuery<LeadList[]>({
    queryKey: ["lead-lists"],
    queryFn: LeadLists.list,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (!lists || lists.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No lead lists yet. Create one and import contacts from the{" "}
        <Link href="/leads" className="text-primary underline underline-offset-2">
          Leads
        </Link>{" "}
        section first.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Choose the lead list this campaign should call.
      </p>
      <div className="space-y-2">
        {lists.map((l) => {
          const selected = value === l.id;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => l.id && onChange(l.id)}
              className={
                "flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors " +
                (selected ? "border-primary bg-primary/5" : "hover:bg-muted/40")
              }
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{l.name}</span>
                {l.description && (
                  <span className="block truncate text-xs text-muted-foreground">{l.description}</span>
                )}
              </span>
              <span className="tabular inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <UsersIcon className="size-3" aria-hidden />
                {l.leadCount.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Step 3: Select a number list to dial FROM + rotation toggle
function StepNumbers({
  numberListId,
  rotateNumbers,
  onListChange,
  onRotateChange,
}: {
  numberListId: string;
  rotateNumbers: boolean;
  onListChange: (id: string) => void;
  onRotateChange: (on: boolean) => void;
}) {
  const { data: lists, isLoading } = useQuery<NumberList[]>({
    queryKey: ["number-lists"],
    queryFn: NumberLists.list,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (!lists || lists.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No number lists yet. Create one and add your provisioned numbers in the{" "}
        <Link href="/numbers" className="text-primary underline underline-offset-2">
          Numbers
        </Link>{" "}
        section first.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Choose the list of numbers this campaign should dial from.
      </p>
      <div className="space-y-2">
        {lists.map((l) => {
          const selected = numberListId === l.id;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => l.id && onListChange(l.id)}
              className={
                "flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors " +
                (selected ? "border-primary bg-primary/5" : "hover:bg-muted/40")
              }
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{l.name}</span>
                {l.description && (
                  <span className="block truncate text-xs text-muted-foreground">{l.description}</span>
                )}
              </span>
              <span className="tabular inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <PhoneOutgoingIcon className="size-3" aria-hidden />
                {l.numberCount.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Rotate-numbers toggle */}
      <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
        <div className="flex items-start gap-2 min-w-0">
          <RepeatIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Rotate numbers</p>
            <p className="text-xs text-muted-foreground">
              Cycle through the list one number per call to spread outbound volume. Off uses a single number.
            </p>
          </div>
        </div>
        <Switch
          checked={rotateNumbers}
          onCheckedChange={(c) => onRotateChange(!!c)}
          aria-label="Rotate numbers"
        />
      </div>
    </div>
  );
}

// Pacing slider row
function PacingField({
  icon: Icon,
  label,
  description,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  // Local text buffer for the number input. Sync to external `value` using
  // the official "adjust state while rendering" pattern (compare against a
  // previous-value state) — no setState-in-effect, no ref access in render.
  const [inputVal, setInputVal] = React.useState(String(value));
  const [prevValue, setPrevValue] = React.useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    if (Number(inputVal) !== value) setInputVal(String(value));
  }

  function commitInput() {
    const parsed = Number(inputVal);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      onChange(clamped);
      setInputVal(String(clamped));
    } else {
      setInputVal(String(value));
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Input
            className="h-7 w-20 text-right tabular"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onBlur={commitInput}
            onKeyDown={(e) => { if (e.key === "Enter") commitInput(); }}
          />
          <span className="min-w-[3.5rem] text-right text-xs text-muted-foreground tabular">
            {format(value)}
          </span>
        </div>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(vals) => {
          const arr = Array.isArray(vals) ? vals : [vals];
          onChange(arr[0] as number);
          setInputVal(String(arr[0]));
        }}
      />
    </div>
  );
}

// Step 4: Pacing settings
function StepPacing({
  concurrency,
  delayBetweenCalls,
  maxCallDuration,
  onConcurrencyChange,
  onDelayChange,
  onDurationChange,
}: {
  concurrency: number;
  delayBetweenCalls: number;
  maxCallDuration: number;
  onConcurrencyChange: (v: number) => void;
  onDelayChange: (v: number) => void;
  onDurationChange: (v: number) => void;
}) {
  return (
    <div className="space-y-5">
      <PacingField
        icon={GaugeIcon}
        label="Concurrent calls"
        description="Maximum simultaneous active calls."
        value={concurrency}
        min={1}
        max={50}
        step={1}
        format={(v) => `${v} at once`}
        onChange={onConcurrencyChange}
      />
      <PacingField
        icon={ClockIcon}
        label="Delay between calls"
        description="Seconds to wait before placing the next call."
        value={delayBetweenCalls}
        min={0}
        max={60}
        step={1}
        format={(v) => `${v}s`}
        onChange={onDelayChange}
      />
      <PacingField
        icon={TimerIcon}
        label="Max call duration"
        description="Hard cap per call (in seconds). Calls are hung up after this."
        value={maxCallDuration}
        min={10}
        max={3600}
        step={30}
        format={(v) => `${Math.round(v / 60)} min`}
        onChange={onDurationChange}
      />
    </div>
  );
}

// Step 5: Review
function StepReview({
  state,
  assistantName,
  listLabel,
  numberListLabel,
  summary,
}: {
  state: WizardState;
  assistantName: string;
  listLabel: string;
  numberListLabel: string;
  summary: string;
}) {
  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-medium text-foreground">
        <RocketIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>{summary}</span>
      </div>
      {/* Detail rows */}
      <div className="divide-y divide-border rounded-lg border border-border text-sm overflow-hidden">
        <ReviewRow
          icon={BotIcon}
          label="Assistant"
          value={assistantName || state.assistantId}
        />
        <ReviewRow
          icon={UsersIcon}
          label="Lead list"
          value={listLabel}
        />
        <ReviewRow
          icon={PhoneOutgoingIcon}
          label="Number list"
          value={numberListLabel}
        />
        <ReviewRow
          icon={RepeatIcon}
          label="Rotate numbers"
          value={state.rotateNumbers ? "On — one number per call" : "Off — single number"}
        />
        <ReviewRow
          icon={GaugeIcon}
          label="Concurrency"
          value={<span className="tabular">{state.concurrency} simultaneous calls</span>}
        />
        <ReviewRow
          icon={ClockIcon}
          label="Delay between calls"
          value={<span className="tabular">{state.delayBetweenCalls}s</span>}
        />
        <ReviewRow
          icon={TimerIcon}
          label="Max call duration"
          value={<span className="tabular">{Math.round(state.maxCallDuration / 60)} min cap</span>}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Launching will immediately start placing calls. This action cannot be undone from this screen.
      </p>
    </div>
  );
}

function ReviewRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {label}
      </span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

// Per-step header content shown above each step's body.
const STEP_HEADERS: {
  icon: LucideIcon;
  title: string;
  description: string;
  tone: keyof typeof TONE;
}[] = [
  {
    icon: BotIcon,
    title: "Choose an assistant",
    description: "The AI agent that will conduct the calls in this campaign.",
    tone: "cyan",
  },
  {
    icon: UsersIcon,
    title: "Choose leads to call",
    description: "Select the contacts this campaign will reach.",
    tone: "violet",
  },
  {
    icon: PhoneOutgoingIcon,
    title: "Choose numbers to call from",
    description: "Pick a number list (a pool of your Twilio numbers) and choose whether to rotate across them.",
    tone: "sky",
  },
  {
    icon: GaugeIcon,
    title: "Set call pacing",
    description:
      "Control how aggressively calls are placed to avoid overwhelming your team or violating carrier rules.",
    tone: "amber",
  },
  {
    icon: ClipboardCheckIcon,
    title: "Review before launching",
    description: "Confirm everything looks right. You can go back to adjust any step.",
    tone: "emerald",
  },
];

// Main wizard
export function CampaignWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState<StepIndex>(0);
  const [launching, setLaunching] = React.useState(false);
  const [savingDraft, setSavingDraft] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  // Role is only known on the client (localStorage); reading it during SSR/first
  // render would cause a hydration mismatch, so gate it behind `mounted`.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const isAdmin = mounted ? getRole() === "admin" : false;

  const [state, setState] = React.useState<WizardState>({
    assistantId: "",
    listId: "",
    numberListId: "",
    rotateNumbers: false,
    concurrency: 1,
    delayBetweenCalls: 0,
    maxCallDuration: 900,
  });

  // Fetch assistants for review step name lookup
  const { data: assistants } = useQuery({
    queryKey: ["assistants"],
    queryFn: Assistants.list,
    enabled: step >= 4,
  });

  // Lead lists — for the chosen list's name + count on review.
  const { data: leadLists } = useQuery<LeadList[]>({
    queryKey: ["lead-lists"],
    queryFn: LeadLists.list,
  });

  // Number lists — for the chosen pool's name + count on review.
  const { data: numberLists } = useQuery<NumberList[]>({
    queryKey: ["number-lists"],
    queryFn: NumberLists.list,
  });

  const assistantName =
    assistants?.find((a) => (a.id ?? a.name) === state.assistantId)?.name ??
    state.assistantId;

  const chosenList = leadLists?.find((l) => l.id === state.listId);
  const totalLeadCount = chosenList?.leadCount ?? 0;

  const chosenNumberList = numberLists?.find((l) => l.id === state.numberListId);
  const numberListLabel = chosenNumberList
    ? `${chosenNumberList.name} (${chosenNumberList.numberCount.toLocaleString()} number${chosenNumberList.numberCount === 1 ? "" : "s"})${state.rotateNumbers ? " · rotating" : ""}`
    : "—";

  const summary =
    totalLeadCount > 0 && state.numberListId && state.assistantId
      ? pacingSummary({
          leadCount: totalLeadCount,
          fromNumber: chosenNumberList?.name ?? "your number list",
          assistantName,
          concurrency: state.concurrency,
          delayBetweenCalls: state.delayBetweenCalls,
          maxCallDuration: state.maxCallDuration,
        })
      : "Complete the wizard steps to see the summary.";

  // Step validation
  function canAdvance(): boolean {
    if (step === 0) return Boolean(state.assistantId);
    if (step === 1) return Boolean(state.listId);
    if (step === 2) return Boolean(state.numberListId);
    if (step === 3) return true; // pacing always valid within constraints
    return true;
  }

  function handleNext() {
    if (step < 4) setStep((s) => (s + 1) as StepIndex);
  }

  function handleBack() {
    if (step > 0) setStep((s) => (s - 1) as StepIndex);
  }

  // Shared campaign payload — fromNumber is derived server-side from the number
  // list's first member. A freshly created campaign has status "draft".
  function campaignPayload() {
    return {
      assistantId: state.assistantId,
      leadIds: [] as string[],
      listId: state.listId,
      numberListId: state.numberListId,
      rotateNumbers: state.rotateNumbers,
      concurrency: state.concurrency,
      delayBetweenCalls: state.delayBetweenCalls,
      maxCallDuration: state.maxCallDuration,
    };
  }

  // Save as draft: persist the campaign WITHOUT creating a run. It stays in
  // "draft" status and shows up in the admin's fleet Deploy dialog, where an
  // admin can deploy GPU capacity for it directly (no run-request queue).
  async function handleSaveDraft() {
    setSavingDraft(true);
    try {
      const created = await Campaigns.create(campaignPayload());
      toast.success("Saved as draft — an admin can deploy it from the fleet.");
      router.push(`/campaigns/${created.id}`);
    } catch (err: unknown) {
      toastApiError(err, "Couldn't save draft");
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleLaunch() {
    setLaunching(true);
    setConfirmOpen(false);
    try {
      const created = await Campaigns.create(campaignPayload());

      // The fleet gate: EVERY launch is a request. The admin reviews the campaign +
      // leads, sizes the fleet, and provisions it — there is no auto-approve path.
      // Users never pick infrastructure here; they only submit the campaign.
      const run = await CampaignRuns.create(created.id);
      if (run.status === "started") {
        // DEBUG / no-RunPod mode: the backend has the fleet disabled
        // (FLEET_ENABLED=false), so the launch skipped the fleet and is dialing
        // directly from the backend (Twilio + ngrok). Calls are going out now.
        toast.success("Campaign launched — placing calls now (direct dial, fleet disabled).");
      } else {
        // The normal path: the run is queued for an admin to review and deploy.
        toast.success("Campaign submitted — waiting for an admin to review and deploy the fleet.");
      }
      router.push(`/campaigns/${created.id}`);
    } catch (err: unknown) {
      toastApiError(err, "Couldn't launch campaign");
    } finally {
      setLaunching(false);
    }
  }

  const header = STEP_HEADERS[step];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <StepIndicator current={step} />

      <Card>
        <CardHeader className="pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <SectionHeader
              icon={header.icon}
              title={header.title}
              description={header.description}
              tone={header.tone}
            />
            <span className="tabular shrink-0 text-[11px] font-medium text-muted-foreground">
              Step {step + 1} of {STEPS.length}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <StepAssistant
              value={state.assistantId}
              onChange={(id) => setState((s) => ({ ...s, assistantId: id }))}
            />
          )}
          {step === 1 && (
            <StepLeads
              value={state.listId}
              onChange={(id) => setState((s) => ({ ...s, listId: id }))}
            />
          )}
          {step === 2 && (
            <StepNumbers
              numberListId={state.numberListId}
              rotateNumbers={state.rotateNumbers}
              onListChange={(id) => setState((s) => ({ ...s, numberListId: id }))}
              onRotateChange={(on) => setState((s) => ({ ...s, rotateNumbers: on }))}
            />
          )}
          {step === 3 && (
            <StepPacing
              concurrency={state.concurrency}
              delayBetweenCalls={state.delayBetweenCalls}
              maxCallDuration={state.maxCallDuration}
              onConcurrencyChange={(v) =>
                setState((s) => ({ ...s, concurrency: v }))
              }
              onDelayChange={(v) =>
                setState((s) => ({ ...s, delayBetweenCalls: v }))
              }
              onDurationChange={(v) =>
                setState((s) => ({ ...s, maxCallDuration: v }))
              }
            />
          )}
          {step === 4 && (
            <StepReview
              state={state}
              assistantName={assistantName}
              listLabel={chosenList ? `${chosenList.name} (${chosenList.leadCount.toLocaleString()})` : "—"}
              numberListLabel={numberListLabel}
              summary={summary}
            />
          )}
        </CardContent>
      </Card>

      {/* Navigation footer */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={handleBack} disabled={step === 0}>
          <ArrowLeftIcon className="size-4" aria-hidden />
          Back
        </Button>
        <div className="flex items-center gap-2">
          {step < 4 ? (
            <Button onClick={handleNext} disabled={!canAdvance()}>
              Continue
              <ArrowRightIcon className="size-4" aria-hidden />
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={!canAdvance() || launching || savingDraft}
              >
                <SaveIcon className="size-4" aria-hidden />
                {savingDraft ? "Saving…" : "Save as draft"}
              </Button>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={!canAdvance() || launching || savingDraft}
              >
                <RocketIcon className="size-4" aria-hidden />
                {launching ? "Launching…" : "Launch campaign"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Launch confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Launch this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              {summary}
              <br />
              <br />
              {isAdmin
                ? "This submits the campaign to the fleet and provisions GPU capacity right away. Track status on the campaign page."
                : "This submits the campaign to the fleet. An admin deploys the GPU capacity before calls begin (unless they've pre-authorized you). Track status on the campaign page."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={handleLaunch} disabled={launching}>
              {launching ? "Launching…" : "Yes, launch"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
