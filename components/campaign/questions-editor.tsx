"use client";

import * as React from "react";
import type { QuestionType } from "@/lib/api/resources";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PlusIcon, Trash2Icon } from "lucide-react";

export type QuestionRow = { id?: string; text: string; type: QuestionType };

export const QUESTION_TYPES: { value: QuestionType; label: string; hint: string }[] = [
  { value: "boolean", label: "Yes / No", hint: "Answered yes, no, or unknown." },
  { value: "descriptive", label: "Descriptive", hint: "A short free-text answer." },
  { value: "json", label: "Structured JSON", hint: "A structured object (e.g. extracted fields)." },
];

/**
 * Reusable editor for end-of-call analysis questions. Each row is a question
 * (descriptive text) + an output type. Shared by the campaign wizard step and the
 * campaign-page editor dialog so both author questions the same way.
 */
export function QuestionsEditor({
  rows,
  onChange,
  placeholder = "Did the person mention Stripe?",
}: {
  rows: QuestionRow[];
  onChange: (rows: QuestionRow[]) => void;
  placeholder?: string;
}) {
  const update = (i: number, patch: Partial<QuestionRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i));
  const add = () => onChange([...rows, { text: "", type: "boolean" }]);

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Input
              value={row.text}
              placeholder={placeholder}
              onChange={(e) => update(i, { text: e.target.value })}
            />
          </div>
          <Select value={row.type} onValueChange={(v) => update(i, { type: (v ?? "boolean") as QuestionType })}>
            <SelectTrigger className="w-36 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUESTION_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove question"
            className="mt-0.5 shrink-0 text-muted-foreground"
            onClick={() => remove(i)}
          >
            <Trash2Icon className="size-4" aria-hidden />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add}>
        <PlusIcon aria-hidden /> Add question
      </Button>
    </div>
  );
}
