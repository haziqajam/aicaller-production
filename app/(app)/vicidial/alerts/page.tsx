"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Alerts, type FleetAlert } from "@/lib/api/alerts";
import { toastApiError, parseApiError } from "@/lib/api/errors";
import { getRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BellIcon, ShieldIcon, AlertTriangleIcon, InfoIcon } from "lucide-react";

function NotAuthorized() {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <ShieldIcon className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Not authorized</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Admin access is required to view fleet alerts.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LevelChip({ level }: { level: string }) {
  const critical = level === "critical";
  const Icon = critical ? AlertTriangleIcon : InfoIcon;
  return (
    // Icon + text so severity reads without relying on color alone (matches
    // PodStatusBadge; this is a failure-triage screen where that matters most).
    <span
      className={
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize " +
        (critical
          ? "border-destructive/30 bg-destructive/12 text-destructive"
          : "border-border bg-muted text-muted-foreground")
      }
    >
      <Icon className="size-3" aria-hidden />
      {level}
    </span>
  );
}

export default function FleetAlertsPage() {
  const role = getRole();
  if (role !== "admin") return <NotAuthorized />;
  return <AlertsContent />;
}

function AlertsContent() {
  const qc = useQueryClient();
  const [unackedOnly, setUnackedOnly] = React.useState(true);
  const [acking, setAcking] = React.useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery<FleetAlert[]>({
    queryKey: ["fleet-alerts", unackedOnly],
    queryFn: () => Alerts.list(unackedOnly),
    // Alerts arrive from a background loop — poll so the page stays fresh.
    refetchInterval: 15000,
  });

  const alerts = data ?? [];

  async function handleAck(a: FleetAlert) {
    setAcking(a.id);
    try {
      await Alerts.ack(a.id);
      await qc.invalidateQueries({ queryKey: ["fleet-alerts"] });
      toast.success("Alert acknowledged");
    } catch (err) {
      toastApiError(err, "Couldn't acknowledge alert");
    } finally {
      setAcking(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            VICIdial
          </p>
          <h1 className="mt-0.5 text-base font-semibold text-foreground">Fleet alerts</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pod deaths, re-ups, and rebinds. Calls keep flowing on the client side —
            these tell you a server churned on ours.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setUnackedOnly((v) => !v)}
        >
          {unackedOnly ? "Show all" : "Unacknowledged only"}
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {parseApiError(error, "Couldn't load alerts.")}
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && alerts.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <BellIcon className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {unackedOnly ? "No unacknowledged alerts" : "No alerts yet"}
              </p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Fleet is healthy. Pod deaths and recoveries will show up here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <LevelChip level={a.level} />
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {a.kind}
                    </span>
                    {a.acknowledged && (
                      <span className="text-[11px] text-muted-foreground">· acknowledged</span>
                    )}
                  </div>
                  <p className="text-sm text-foreground truncate">{a.message}</p>
                  {a.createdAt && (
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString()}
                    </p>
                  )}
                </div>
                {!a.acknowledged && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAck(a)}
                    disabled={acking === a.id}
                  >
                    {acking === a.id ? "…" : "Acknowledge"}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
