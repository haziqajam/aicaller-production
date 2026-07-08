"use client";

import * as React from "react";
import { EyeIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Lead } from "@/components/leads/columns";

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length > 0 ? value : "—";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function LeadVarsButton({ lead }: { lead: Lead }) {
  const [open, setOpen] = React.useState(false);

  const vars = lead.vars ?? {};
  const entries = Object.entries(vars);
  const title = lead.name || lead.phone || "Lead";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="View variables" />
        }
      >
        <EyeIcon />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {lead.name ? `${lead.name} · ` : ""}
            {lead.phone || "No phone number"}
          </DialogDescription>
        </DialogHeader>

        {entries.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
            No custom variables for this lead.
          </div>
        ) : (
          <div className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-lg border border-border bg-muted/30">
            {entries.map(([key, value]) => (
              <div
                key={key}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-3 px-3 py-2"
              >
                <span className="truncate text-xs font-medium text-muted-foreground">
                  {key}
                </span>
                <span className="break-words text-sm text-foreground">
                  {stringifyValue(value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
