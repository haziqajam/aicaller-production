"use client";

import * as React from "react";
import { toast } from "sonner";
import { Leads } from "@/lib/api/resources";
import { toastApiError, parseApiError } from "@/lib/api/errors";
import { parseCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import {
  ColumnMapping,
  guessMapping,
  validateMapping,
  buildLeads,
  phoneStats,
  type ColumnTarget,
} from "@/components/leads/column-mapping";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  UploadIcon,
  DownloadIcon,
  FileSpreadsheet,
  CheckIcon,
  ArrowRight,
} from "lucide-react";

interface ImportDialogProps {
  onImported: () => void;
  // When set, imported masters are attached to this lead list in one call (R7).
  listId?: string;
}

type ImportState = "idle" | "mapping" | "uploading" | "done" | "error";

const TEMPLATE_HEADERS = "name,phone,company,city";
// Pakistan-first examples; phone MUST be E.164 (with country code).
const TEMPLATE_ROWS = [
  "Ali Khan,+923001234567,Acme Pvt Ltd,Karachi",
  "Jane Doe,+14155551234,Globex,San Francisco",
];

/** Generate and download `leads-template.csv` entirely client-side. */
function downloadTemplate() {
  const content = `${TEMPLATE_HEADERS}\n${TEMPLATE_ROWS.join("\n")}\n`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "leads-template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Standalone "Download template" button — reused in the dialog and empty state. */
export function DownloadTemplateButton({
  className,
  variant = "outline",
  size = "sm",
}: {
  className?: string;
  variant?: "outline" | "ghost" | "secondary";
  size?: "sm" | "default";
}) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={downloadTemplate}
    >
      <DownloadIcon className="size-4" aria-hidden />
      Download template
    </Button>
  );
}

export function ImportDialog({ onImported, listId }: ImportDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState<ImportState>("idle");
  const [progress, setProgress] = React.useState(0);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<string[][]>([]);
  const [mapping, setMapping] = React.useState<ColumnTarget[]>([]);
  const [insertedCount, setInsertedCount] = React.useState(0);
  const [skippedCount, setSkippedCount] = React.useState(0);
  const [errorMsg, setErrorMsg] = React.useState("");
  const [dragActive, setDragActive] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function reset() {
    setState("idle");
    setProgress(0);
    setHeaders([]);
    setRows([]);
    setMapping([]);
    setInsertedCount(0);
    setSkippedCount(0);
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  /** Shared by the file picker and drag-and-drop. */
  async function processFile(file: File) {
    // Accept by extension OR mime — browsers report CSV mimetypes inconsistently.
    const isCsv =
      /\.csv$/i.test(file.name) ||
      file.type === "text/csv" ||
      file.type === "application/vnd.ms-excel";
    if (!isCsv) {
      setErrorMsg("That doesn't look like a CSV. Please choose a .csv file.");
      setState("error");
      toast.error("Unsupported file", {
        description: "Only .csv files can be imported.",
      });
      return;
    }

    try {
      const text = await file.text();
      const { headers: h, rows: r } = parseCsv(text);

      if (h.length === 0 || r.length === 0) {
        setErrorMsg(
          "No data rows found. Make sure the file has a header row and at least one row of leads."
        );
        setState("error");
        return;
      }

      setHeaders(h);
      setRows(r);
      setMapping(guessMapping(h));
      setState("mapping");
    } catch (err) {
      setErrorMsg(parseApiError(err, "Couldn't read that file."));
      setState("error");
      toastApiError(err, "Couldn't read CSV");
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  const validation = validateMapping(mapping);
  const stats = phoneStats(mapping, rows);
  const canImport = validation.ok && stats.valid > 0;

  async function handleConfirm() {
    if (!canImport) return;

    const { leads, skipped } = buildLeads(headers, mapping, rows);

    if (leads.length === 0) {
      setErrorMsg(
        "No rows had a valid phone number, so there was nothing to import. " +
          "Numbers must include the country code (e.g. +923001234567)."
      );
      setState("error");
      return;
    }

    setSkippedCount(skipped);
    setState("uploading");
    setProgress(40);

    try {
      const result = await Leads.import(leads, listId);
      setInsertedCount(result.inserted);
      setProgress(100);
      setState("done");

      const skipNote =
        skipped > 0 ? ` (${skipped} row${skipped !== 1 ? "s" : ""} skipped)` : "";
      toast.success(
        `Imported ${result.inserted} lead${result.inserted !== 1 ? "s" : ""}${skipNote}`
      );
      onImported();
    } catch (err) {
      setErrorMsg(parseApiError(err));
      setState("error");
      toastApiError(err, "Couldn't import leads");
    }
  }

  const wide = state === "mapping";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <UploadIcon className="size-4" aria-hidden />
        Import CSV
      </DialogTrigger>
      <DialogContent className={wide ? "sm:max-w-xl" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle>Import leads from CSV</DialogTitle>
          <DialogDescription>
            {state === "mapping"
              ? "Pick which CSV column fills each lead field. Phone is required; everything else is saved as variables."
              : "Download the template, fill it in, then upload it. You'll map columns before anything is imported."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Idle / error: template + file picker ─────────────── */}
          {(state === "idle" || state === "error") && (
            <>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <FileSpreadsheet
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium leading-none">
                      Start with the template
                    </p>
                    <p className="text-xs text-muted-foreground">
                      name, phone, company, city · phone needs a country code,
                      e.g.{" "}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                        +923001234567
                      </code>
                    </p>
                  </div>
                </div>
                <DownloadTemplateButton />
              </div>

              <label
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                }}
                onDrop={handleDrop}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors duration-150",
                  dragActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                {/* pointer-events-none so dragging over children doesn't fire
                    dragleave on the label (avoids drag-state flicker). */}
                <div className="pointer-events-none flex flex-col items-center gap-2">
                  <UploadIcon
                    className={cn(
                      "size-5 transition-colors",
                      dragActive ? "text-primary" : "text-muted-foreground"
                    )}
                    aria-hidden
                  />
                  <span className="text-sm font-medium">
                    {dragActive
                      ? "Drop the CSV to upload"
                      : "Drag & drop a CSV here, or click to choose"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Any columns are fine — you&apos;ll map them next
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>

              {state === "error" && (
                <div className="rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive">
                  {errorMsg}
                </div>
              )}
            </>
          )}

          {/* ── Mapping step ─────────────────────────────────────── */}
          {state === "mapping" && (
            <>
              <ColumnMapping
                headers={headers}
                rows={rows}
                mapping={mapping}
                onChange={setMapping}
                onRowsChange={setRows}
              />
              {!validation.ok && validation.error && (
                <p className="text-xs text-destructive">{validation.error}</p>
              )}
              {validation.ok && stats.valid === 0 && (
                <p className="text-xs text-destructive">
                  No valid phone numbers found. Add the country code (e.g.
                  +923001234567 for Pakistan) and re-upload.
                </p>
              )}
            </>
          )}

          {/* ── Uploading ────────────────────────────────────────── */}
          {state === "uploading" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Importing leads…</p>
              <Progress value={progress} />
            </div>
          )}

          {/* ── Done ─────────────────────────────────────────────── */}
          {state === "done" && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-md border border-success/25 bg-success/8 px-3 py-2 text-sm text-success">
                <CheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Successfully imported{" "}
                  <span className="font-semibold tabular-nums">
                    {insertedCount}
                  </span>{" "}
                  lead{insertedCount !== 1 ? "s" : ""}.
                  {skippedCount > 0 && (
                    <>
                      {" "}
                      <span className="text-muted-foreground">
                        {skippedCount} row{skippedCount !== 1 ? "s" : ""} skipped
                        (missing or invalid phone).
                      </span>
                    </>
                  )}
                </span>
              </div>
              <Progress value={100} />
            </div>
          )}
        </div>

        <DialogFooter showCloseButton>
          {state === "mapping" && (
            <Button onClick={handleConfirm} disabled={!canImport}>
              Confirm &amp; import
              {stats.valid > 0 ? ` (${stats.valid})` : ""}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          )}
          {state === "done" && (
            <Button
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              Done
            </Button>
          )}
          {state === "error" && (
            <Button variant="outline" onClick={reset}>
              Try again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
