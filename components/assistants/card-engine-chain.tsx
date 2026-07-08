"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  STAGE_ICON,
  PROVIDER_ICON,
  STT_ICON,
  TTS_ICON,
} from "./card-helpers";

/**
 * Compact STT → LLM → TTS pipeline for the assistant card.
 *
 * Mirrors the editor's <EngineChain> vocabulary (same stage order, glyphs and
 * connector) but laid out to sit inside a dense card: three equal-width nodes
 * joined by an arrow, with the LLM node accented as the "brain".
 */

interface CardEngineChainProps {
  sttEngine: string;
  sttLabel: string;
  llmProvider: string;
  llmLabel: string;
  ttsEngine: string;
  ttsLabel: string;
}

function Node({
  stage,
  EngineIcon,
  label,
  value,
  accent,
}: {
  stage: string;
  EngineIcon: LucideIcon;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-1 rounded-md border px-2 py-1.5",
        "transition-colors duration-150",
        accent
          ? "border-primary/30 bg-primary/8"
          : "border-border bg-muted/40 group-hover:bg-muted/60"
      )}
    >
      <span className="flex items-center gap-1 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "flex items-center gap-1 text-[11px] font-medium leading-tight",
          accent ? "text-primary" : "text-foreground/85"
        )}
      >
        <EngineIcon className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{value}</span>
      </span>
    </div>
  );
}

function Arrow() {
  return (
    <svg
      className="size-3 shrink-0 text-muted-foreground/40"
      fill="none"
      viewBox="0 0 16 16"
      aria-hidden
    >
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CardEngineChain({
  sttEngine,
  sttLabel,
  llmProvider,
  llmLabel,
  ttsEngine,
  ttsLabel,
}: CardEngineChainProps) {
  const SttIcon = STT_ICON[sttEngine] ?? STAGE_ICON.stt;
  const LlmIcon = PROVIDER_ICON[llmProvider] ?? STAGE_ICON.llm;
  const TtsIcon = TTS_ICON[ttsEngine] ?? STAGE_ICON.tts;

  return (
    <div
      className="flex items-stretch gap-1"
      role="group"
      aria-label="Voice pipeline: speech-to-text, language model, text-to-speech"
    >
      <Node stage="stt" EngineIcon={SttIcon} label="STT" value={sttLabel} />
      <div className="flex items-center">
        <Arrow />
      </div>
      <Node
        stage="llm"
        EngineIcon={LlmIcon}
        label="LLM"
        value={llmLabel}
        accent
      />
      <div className="flex items-center">
        <Arrow />
      </div>
      <Node stage="tts" EngineIcon={TtsIcon} label="TTS" value={ttsLabel} />
    </div>
  );
}
