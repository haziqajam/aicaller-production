"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: number | string;
  /** Optional signed number shown below the value, e.g. +12 or -3 */
  delta?: number;
  /** Additional className for the card */
  className?: string;
}

export function StatTile({ label, value, delta, className }: StatTileProps) {
  const deltaPositive = delta !== undefined && delta > 0;
  const deltaNegative = delta !== undefined && delta < 0;

  return (
    <Card
      className={cn(
        "min-w-[140px] relative overflow-hidden",
        /* Faint top accent hairline */
        "before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:rounded-t-[inherit] before:bg-primary/40",
        className
      )}
    >
      <CardHeader className="pb-1 pt-4">
        <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        <p className="tabular text-3xl font-semibold leading-none">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        {delta !== undefined && (
          <p
            className={cn(
              "mt-1.5 text-xs tabular font-medium",
              deltaPositive && "text-success",
              deltaNegative && "text-destructive",
              !deltaPositive && !deltaNegative && "text-muted-foreground"
            )}
          >
            {deltaPositive ? "+" : ""}
            {delta.toLocaleString()} since last hour
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Layout-matched skeleton — same dimensions as a loaded StatTile */
export function StatTileSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("min-w-[140px] relative overflow-hidden", className)}>
      <CardHeader className="pb-1 pt-4">
        {/* matches the label line */}
        <Skeleton className="h-2.5 w-20" />
      </CardHeader>
      <CardContent className="pt-0 pb-4 space-y-2">
        {/* matches the big value */}
        <Skeleton className="h-8 w-16" />
        {/* matches the delta line */}
        <Skeleton className="h-2.5 w-28" />
      </CardContent>
    </Card>
  );
}
