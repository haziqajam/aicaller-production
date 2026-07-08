"use client";

import * as React from "react";
import { PlusIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { normalizePhone, looksCorrupted } from "@/lib/phone";
import { cn } from "@/lib/utils";

/** Where a CSV column gets routed when building a lead. */
export type ColumnTarget = "name" | "phone" | "custom" | "ignore";

export const TARGET_OPTIONS: { value: ColumnTarget; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "phone", label: "Phone" },
  { value: "custom", label: "Custom field — saved to lead variables" },
  { value: "ignore", label: "Ignore this column" },
];

/** A shaped lead ready to hand to `Leads.import`. */
export interface MappedLead {
  name?: string;
  phone: string;
  vars?: Record<string, string>;
}

/** Result of validating + transforming the parsed CSV against a mapping. */
export interface MappingResult {
  leads: MappedLead[];
  skipped: number;
}

/**
 * Guess an initial target for each header from its name (case-insensitive).
 * phone/mobile/cell/number -> phone; name/full name/contact -> name;
 * everything else -> custom.
 */
export function guessMapping(headers: string[]): ColumnTarget[] {
  let phoneAssigned = false;
  let nameAssigned = false;
  return headers.map((h) => {
    const k = h.trim().toLowerCase();
    if (!phoneAssigned && /(phone|mobile|cell|number)/.test(k)) {
      phoneAssigned = true;
      return "phone";
    }
    if (!nameAssigned && /(full ?name|^name$|contact)/.test(k)) {
      nameAssigned = true;
      return "name";
    }
    return "custom";
  });
}

/** Apply `mapping` to a single CSV row, producing a shaped lead (no skip logic). */
function rowToLead(
  headers: string[],
  mapping: ColumnTarget[],
  row: string[]
): MappedLead {
  let name: string | undefined;
  let phone = "";
  const vars: Record<string, string> = {};

  mapping.forEach((target, i) => {
    const value = (row[i] ?? "").trim();
    if (target === "name") {
      if (value) name = value;
    } else if (target === "phone") {
      phone = value;
    } else if (target === "custom") {
      if (value) vars[headers[i]] = value;
    }
    // "ignore" -> dropped
  });

  const lead: MappedLead = { phone };
  if (name) lead.name = name;
  if (Object.keys(vars).length > 0) lead.vars = vars;
  return lead;
}

/**
 * Transform all rows per the mapping. The phone is normalized to E.164
 * (Pakistan-first); rows whose phone is empty or invalid are skipped so only
 * dialable numbers are imported. Assumes the mapping is already valid.
 */
export function buildLeads(
  headers: string[],
  mapping: ColumnTarget[],
  rows: string[][]
): MappingResult {
  let skipped = 0;
  const leads: MappedLead[] = [];
  for (const row of rows) {
    const lead = rowToLead(headers, mapping, row);
    const norm = normalizePhone(lead.phone);
    if (!norm.ok) {
      skipped++;
      continue;
    }
    lead.phone = norm.e164!;
    leads.push(lead);
  }
  return { leads, skipped };
}

/** Count valid/invalid phones for the currently-mapped phone column. */
export function phoneStats(
  mapping: ColumnTarget[],
  rows: string[][]
): { valid: number; invalid: number } {
  const idx = mapping.indexOf("phone");
  if (idx < 0) return { valid: 0, invalid: 0 };
  let valid = 0;
  let invalid = 0;
  for (const row of rows) {
    if (normalizePhone((row[idx] ?? "").trim()).ok) valid++;
    else invalid++;
  }
  return { valid, invalid };
}

/**
 * A phone cell that's missing the leading '+' but can be turned into a valid
 * E.164 number — either it already normalizes (Pakistan heuristics, e.g.
 * "03001234567") or it just needs a '+' prepended ("4155551234"). These are
 * exactly what the auto-fix button repairs. Corrupted values (letters /
 * scientific notation) are excluded: their digits are lost, so no prefix helps.
 */
function needsPlusFix(raw: string): boolean {
  const s = (raw ?? "").trim();
  if (!s || s.startsWith("+")) return false; // empty or already prefixed
  if (looksCorrupted(s)) return false; // digits unrecoverable
  if (normalizePhone(s).ok) return true; // valid but missing the '+'
  return normalizePhone("+" + s.replace(/\D/g, "")).ok; // valid once '+' added
}

/** The clean E.164 a fixable cell should become (prefers heuristic normalize). */
function plusFixed(raw: string): string {
  const direct = normalizePhone(raw);
  if (direct.ok) return direct.e164!;
  const prefixed = normalizePhone("+" + (raw ?? "").replace(/\D/g, ""));
  return prefixed.ok ? prefixed.e164! : raw;
}

/** How many phone cells are missing the '+' but are fixable by the button. */
export function fixablePhoneCount(
  mapping: ColumnTarget[],
  rows: string[][]
): number {
  const idx = mapping.indexOf("phone");
  if (idx < 0) return 0;
  return rows.reduce((n, row) => n + (needsPlusFix(row[idx] ?? "") ? 1 : 0), 0);
}

/** Return a new rows array with every fixable phone cell rewritten to E.164. */
export function autoFixPhonePlus(
  mapping: ColumnTarget[],
  rows: string[][]
): string[][] {
  const idx = mapping.indexOf("phone");
  if (idx < 0) return rows;
  return rows.map((row) => {
    if (!needsPlusFix(row[idx] ?? "")) return row;
    const next = row.slice();
    next[idx] = plusFixed(next[idx] ?? "");
    return next;
  });
}

/** Validation outcome for the current mapping. `error` is null when valid. */
export function validateMapping(mapping: ColumnTarget[]): {
  ok: boolean;
  error: string | null;
} {
  const phoneCount = mapping.filter((m) => m === "phone").length;
  const nameCount = mapping.filter((m) => m === "name").length;

  if (nameCount > 1) {
    return { ok: false, error: "Only one column can map to Name." };
  }
  if (phoneCount === 0) {
    return { ok: false, error: "Choose exactly one column to map to Phone." };
  }
  if (phoneCount > 1) {
    return { ok: false, error: "Only one column can map to Phone." };
  }
  return { ok: true, error: null };
}

interface ColumnMappingProps {
  headers: string[];
  rows: string[][];
  mapping: ColumnTarget[];
  onChange: (next: ColumnTarget[]) => void;
  /** Apply the auto-fix ('+') to the parsed rows. */
  onRowsChange?: (next: string[][]) => void;
}

/** The lead-model fields the user maps TO (left column of the inverted UI). */
const LEAD_FIELDS: { target: "phone" | "name"; label: string; required: boolean }[] =
  [
    { target: "phone", label: "Phone", required: true },
    { target: "name", label: "Name", required: false },
  ];

/** Sentinel Select value meaning "no CSV column feeds this field". */
const NONE = "__none__";

/**
 * The mapping step UI (inverted orientation): the LEFT side lists the lead
 * model fields (Phone, Name) and each gets a Select whose options are the CSV
 * headers — the user picks which uploaded column fills that field. All columns
 * not claimed by a field default to lead variables, listed below with the
 * ability to exclude (ignore) specific ones. A small preview reflects the
 * current mapping.
 *
 * The internal representation stays the per-column `ColumnTarget[]` (indexed by
 * column position) so the exported helpers and the import flow are unchanged.
 */
export function ColumnMapping({
  headers,
  rows,
  mapping,
  onChange,
  onRowsChange,
}: ColumnMappingProps) {
  /**
   * Assign CSV column `index` as the source for a lead field (or clear the
   * field when `index` is null). A field has at most one source column, and a
   * column claimed by a field can't also be a variable, so any column
   * previously holding `target` is released back to "custom" (a variable).
   */
  function assignField(target: "phone" | "name", index: number | null) {
    const next = mapping.slice();
    // Release whatever column currently feeds this field.
    for (let i = 0; i < next.length; i++) {
      if (next[i] === target) next[i] = "custom";
    }
    // Claim the newly chosen column (if any).
    if (index !== null && index >= 0 && index < next.length) {
      next[index] = target;
    }
    onChange(next);
  }

  /** Toggle a variable column between "saved" (custom) and "ignored". */
  function setColumnIgnored(index: number, ignored: boolean) {
    const next = mapping.slice();
    next[index] = ignored ? "ignore" : "custom";
    onChange(next);
  }

  // Columns not claimed by Name/Phone are variables (custom) or excluded (ignore).
  const variableIdx = headers
    .map((_, i) => i)
    .filter((i) => mapping[i] !== "phone" && mapping[i] !== "name");
  const savedVarIdx = variableIdx.filter((i) => mapping[i] !== "ignore");
  const ignoredVarIdx = variableIdx.filter((i) => mapping[i] === "ignore");
  const headerLabel = (i: number) => headers[i] || "(unnamed)";

  const previewRows = rows.slice(0, 3);
  const hasPhone = mapping.includes("phone");
  const stats = React.useMemo(() => phoneStats(mapping, rows), [mapping, rows]);
  const fixable = React.useMemo(
    () => fixablePhoneCount(mapping, rows),
    [mapping, rows]
  );
  const corrupted = React.useMemo(() => {
    const idx = mapping.indexOf("phone");
    if (idx < 0) return 0;
    return rows.reduce(
      (n, row) => n + (looksCorrupted(row[idx] ?? "") ? 1 : 0),
      0
    );
  }, [mapping, rows]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        <span className="tabular-nums font-medium text-foreground">
          {headers.length}
        </span>{" "}
        column{headers.length !== 1 ? "s" : ""} detected ·{" "}
        <span className="tabular-nums font-medium text-foreground">
          {rows.length}
        </span>{" "}
        row{rows.length !== 1 ? "s" : ""}
      </p>

      {/* Phone validity — one concise line + optional one-click fix. */}
      {hasPhone && (
        <div
          className={cn(
            "space-y-1.5 rounded-lg border px-3 py-2 text-xs",
            stats.invalid > 0 || fixable > 0
              ? "border-warning/30 bg-warning/8 text-warning"
              : "border-success/25 bg-success/8 text-success"
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="tabular-nums font-semibold">{stats.valid}</span>{" "}
              of{" "}
              <span className="tabular-nums font-semibold">
                {stats.valid + stats.invalid}
              </span>{" "}
              numbers are valid
              {stats.invalid > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {stats.invalid} will be skipped
                </span>
              )}
            </span>
            {fixable > 0 && onRowsChange && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 shrink-0 px-2 text-xs"
                onClick={() => onRowsChange(autoFixPhonePlus(mapping, rows))}
              >
                <PlusIcon className="size-3.5" aria-hidden />
                Add “+” to {fixable} number{fixable !== 1 ? "s" : ""}
              </Button>
            )}
          </div>

          {/* Missing the '+' → one click fixes it (never a blocker). */}
          {fixable > 0 && (
            <p className="text-muted-foreground">
              {fixable} number{fixable !== 1 ? "s are" : " is"} missing the “+”
              prefix — click to add it. They’ll be imported either way.
            </p>
          )}

          {/* Nothing auto-fixable but still invalid → explain why (concisely). */}
          {stats.invalid > 0 && fixable === 0 && (
            <p className="text-muted-foreground">
              {corrupted > 0
                ? "Some numbers were mangled by Excel (scientific notation) — the digits are lost. Re-enter them with a country code, formatting the column as Text, e.g. +923001234567."
                : "Add a country code, e.g. +923001234567 (Pakistan)."}
            </p>
          )}
        </div>
      )}

      {/* Lead fields ← CSV columns. Each field picks one source header. */}
      <div className="space-y-2">
        {LEAD_FIELDS.map(({ target, label, required }) => {
          const sourceIdx = mapping.indexOf(target);
          const value = sourceIdx >= 0 ? String(sourceIdx) : NONE;
          return (
            <div
              key={target}
              className="grid grid-cols-[7rem_1fr] items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
            >
              <span className="text-sm font-medium text-foreground">
                {label}
                {required && (
                  <span className="text-destructive" aria-hidden>
                    {" "}
                    *
                  </span>
                )}
              </span>
              <Select
                value={value}
                onValueChange={(v: string | null) =>
                  assignField(target, v && v !== NONE ? Number(v) : null)
                }
              >
                <SelectTrigger size="sm" className="w-full min-w-0">
                  <SelectValue>
                    {sourceIdx >= 0 ? (
                      <span className="truncate font-mono text-xs">
                        {headerLabel(sourceIdx)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">— None —</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>
                    <span className="text-muted-foreground">— None —</span>
                  </SelectItem>
                  {headers.map((header, i) => (
                    <SelectItem key={`${target}-${i}`} value={String(i)}>
                      <span className="truncate font-mono text-xs">
                        {header || "(unnamed)"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      {/* Everything else → lead variables. Each can be excluded (ignored). */}
      {variableIdx.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Saved as variables{" "}
            <span className="tabular-nums normal-case">
              ({savedVarIdx.length})
            </span>
          </p>
          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
            {variableIdx.map((i) => {
              const ignored = mapping[i] === "ignore";
              return (
                <button
                  key={`var-${i}`}
                  type="button"
                  onClick={() => setColumnIgnored(i, !ignored)}
                  title={
                    ignored
                      ? `Excluded — click to save “${headerLabel(i)}” as a variable`
                      : `Saved — click to exclude “${headerLabel(i)}”`
                  }
                  className={cn(
                    "inline-flex max-w-[12rem] items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors",
                    ignored
                      ? "border-border bg-transparent text-muted-foreground line-through"
                      : "border-primary/30 bg-primary/8 text-foreground hover:bg-primary/12"
                  )}
                >
                  <span className="truncate">{headerLabel(i)}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {ignoredVarIdx.length > 0
              ? `Click a column to include/exclude it · ${ignoredVarIdx.length} excluded`
              : "Click a column to exclude it from import"}
          </p>
        </div>
      )}

      {/* Preview */}
      {previewRows.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Preview · first {previewRows.length} row
            {previewRows.length !== 1 ? "s" : ""}
          </p>
          {/* Scroll wide content WITHIN the dialog rather than letting the
              table's intrinsic width stretch the modal off-screen. */}
          <div className="max-w-full overflow-x-auto rounded-lg border border-border">
            <table className="w-full table-fixed text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="w-[10rem] px-2 py-1.5 text-left font-medium">
                    Name
                  </th>
                  <th className="w-[9rem] px-2 py-1.5 text-left font-medium">
                    Phone
                  </th>
                  <th className="px-2 py-1.5 text-left font-medium">
                    Variables
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {previewRows.map((row, ri) => {
                  const lead = rowToLead(headers, mapping, row);
                  const varEntries = Object.entries(lead.vars ?? {});
                  const norm = normalizePhone(lead.phone);
                  return (
                    <tr key={ri}>
                      <td className="px-2 py-1.5 text-foreground">
                        {lead.name ? (
                          <span className="block truncate" title={lead.name}>
                            {lead.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 font-mono tabular-nums text-foreground">
                        {norm.ok ? (
                          <span className="block truncate" title={norm.e164}>
                            {norm.e164}
                          </span>
                        ) : (
                          <span className="font-sans text-muted-foreground">
                            {lead.phone ? "skipped" : "empty"}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {varEntries.length === 0 ? (
                          <span>—</span>
                        ) : (
                          (() => {
                            const summary = varEntries
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(" · ");
                            return (
                              <span
                                className="block truncate font-mono text-[10px]"
                                title={summary}
                              >
                                {summary}
                              </span>
                            );
                          })()
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
