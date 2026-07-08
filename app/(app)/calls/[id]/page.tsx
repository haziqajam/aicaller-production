"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Calls, Assistants } from "@/lib/api/resources";
import { CallDetail } from "@/components/calls/call-detail";
import { type CallRecord } from "@/components/calls/columns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { parseApiError } from "@/lib/api/errors";
import { ArrowLeftIcon, PhoneCallIcon } from "lucide-react";

function CallDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

export default function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const {
    data: call,
    isLoading,
    error,
  } = useQuery<CallRecord>({
    queryKey: ["calls", id],
    queryFn: () => Calls.get(id),
  });

  const { data: assistantsData } = useQuery({
    queryKey: ["assistants"],
    queryFn: Assistants.list,
  });
  const assistantName =
    call?.assistantId && assistantsData
      ? assistantsData.find((a) => a.id === call.assistantId)?.name
      : undefined;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/calls" />}
          aria-label="Back to calls"
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
          <PhoneCallIcon className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Call record
          </p>
          <h1 className="mt-0.5 text-base font-semibold text-foreground">
            {call ? `${call.from ?? "—"} → ${call.to ?? "—"}` : "Call details"}
          </h1>
        </div>
      </div>

      {isLoading && <CallDetailSkeleton />}

      {!isLoading && (error || !call) && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            {error
              ? parseApiError(error, "Couldn't load call record.")
              : "Couldn't load call record."}
          </CardContent>
        </Card>
      )}

      {!isLoading && call && (
        <CallDetail call={call} assistantName={assistantName} />
      )}
    </div>
  );
}
