"use client";

import { cn } from "@/lib/utils";
import {
  BrainCircuit,
  Ear,
  AudioLines,
  Mic,
  type LucideIcon,
} from "lucide-react";

interface EngineChainProps {
  llmProvider: string;
  llmModel: string;
  sttEngine: string;
  ttsEngine: string;
  voice: string;
}

function ChainNode({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0">
      <span className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </span>
      <span
        className={cn(
          "tabular flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium",
          "transition-colors duration-150",
          accent
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-muted/60 text-foreground/80"
        )}
      >
        <span className="truncate max-w-[120px]">{value}</span>
      </span>
    </div>
  );
}

function Connector() {
  return (
    <div className="flex items-end pb-1 text-muted-foreground/40" aria-hidden>
      <svg
        className="size-3.5"
        fill="none"
        viewBox="0 0 16 16"
      >
        <path
          d="M3 8h10M9 4l4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/**
 * Live engine-pipeline visual — updates as the user edits the form.
 * LLM → STT → TTS → Voice
 */
export function EngineChain({
  llmProvider,
  llmModel,
  sttEngine,
  ttsEngine,
  voice,
}: EngineChainProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-x-2 gap-y-3 rounded-lg border border-border bg-muted/20 px-4 py-3",
        "overflow-x-auto"
      )}
      role="region"
      aria-label="Engine pipeline"
    >
      <ChainNode
        label="LLM"
        value={`${llmProvider} / ${llmModel}`}
        icon={BrainCircuit}
        accent
      />
      <Connector />
      <ChainNode label="STT" value={sttEngine} icon={Ear} />
      <Connector />
      <ChainNode label="TTS" value={ttsEngine} icon={AudioLines} />
      <Connector />
      <ChainNode label="Voice" value={voice || "—"} icon={Mic} />
    </div>
  );
}
