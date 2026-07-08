"use client";

import { type OffersPreview } from "@/lib/api/fleet";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CheckIcon } from "lucide-react";

/**
 * Live Vast offers table — one row per machine, price-sorted (cheapest first).
 *
 * Two modes, switched by `onToggle`:
 *  - INTERACTIVE (onToggle provided): a checkbox column + clickable rows let the
 *    admin multi-select machines by cost (the Deploy dialog's UX).
 *  - READ-ONLY (onToggle omitted): a market view — no checkbox, rows not
 *    clickable — but still highlights the cheapest row and shows the same columns.
 *
 * Selection is per OFFER (by cost): distinct prices select independently, and ids
 * that vanish on a refetch simply drop out (no stale pinning).
 */
export function OfferTable({
  offers, selected, onToggle, maxRows = 24,
}: {
  offers: OffersPreview;
  selected?: Set<number>;
  onToggle?: (offerId: number) => void;
  maxRows?: number;
}) {
  const interactive = typeof onToggle === "function";

  const rows = offers.gpus
    .flatMap((g) => (g.offers ?? []).map((o) => ({ ...o, gpuKey: g.gpu })))
    .sort((a, b) => (a.dph ?? Infinity) - (b.dph ?? Infinity));

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
        No offers found{offers.region ? ` in ${offers.region}` : ""}{offers.maxPrice ? ` under $${offers.maxPrice}/hr` : ""}.
        Try a different region or raise the price cap.
      </p>
    );
  }

  return (
    <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
      <Table>
        <TableHeader><TableRow>
          {interactive && <TableHead className="w-8" />}
          <TableHead>GPU</TableHead><TableHead>VRAM</TableHead>
          <TableHead>$/hr</TableHead><TableHead>Rel.</TableHead><TableHead>Location</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.slice(0, maxRows).map((o, i) => {
            const on = interactive ? !!selected?.has(o.id) : false;
            return (
              <TableRow
                key={o.id}
                onClick={interactive ? () => onToggle!(o.id) : undefined}
                data-state={on ? "selected" : undefined}
                className={interactive ? "cursor-pointer" : undefined}
              >
                {interactive && (
                  <TableCell className="pr-0">
                    <span className={`flex size-4 items-center justify-center rounded border ${on ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>
                      {on && <CheckIcon className="size-3" />}
                    </span>
                  </TableCell>
                )}
                <TableCell className="text-xs">
                  {o.gpuKey}
                  {i === 0 && <Badge variant="secondary" className="ml-1.5 text-[10px]">cheapest</Badge>}
                </TableCell>
                <TableCell className="tabular text-xs">{o.vramGb}G</TableCell>
                <TableCell className="tabular text-xs">{o.dph != null ? `$${o.dph.toFixed(3)}` : "—"}</TableCell>
                <TableCell className="tabular text-xs">{o.reliability}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{o.location}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
