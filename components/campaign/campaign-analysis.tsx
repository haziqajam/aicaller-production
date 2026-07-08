"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Campaigns } from "@/lib/api/resources";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardListIcon, Loader2Icon, PencilIcon } from "lucide-react";

/**
 * Per-campaign end-call analysis RESULTS. Questions live on the campaign's
 * ASSISTANT (edited in the assistant editor), so this card only displays how the
 * campaign's calls scored. Scoring runs lazily when this mounts and is cached
 * server-side, so it never re-spends tokens for an unchanged question set.
 */
export function CampaignAnalysisCard({
  campaignId,
  assistantId,
}: {
  campaignId: string;
  assistantId?: string;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["campaigns", campaignId, "analysis"],
    queryFn: () => Campaigns.analyze(campaignId),
  });

  const hasQuestions = data?.status === "ok";

  return (
    <Card className=" overflow-y-auto">
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2 pt-3">
        <CardTitle className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <ClipboardListIcon className="size-3.5" aria-hidden />
          Call analysis
        </CardTitle>
        {assistantId && (
          <Button variant="ghost" size="xs" className="text-muted-foreground"
            render={<Link href={`/assistants/${assistantId}`} />}>
            <PencilIcon aria-hidden /> Edit questions
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-2.5">
        {isLoading && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
            Scoring calls…
          </p>
        )}

        {isError && <p className="text-xs text-destructive">Couldn&apos;t score calls.</p>}

        {!isLoading && !isError && data && data.status === "no_questions" && (
          <p className="text-xs leading-snug text-muted-foreground">
            No analysis questions on this assistant.{" "}
            {assistantId ? (
              <Link href={`/assistants/${assistantId}`} className="text-primary underline underline-offset-2">
                Add them on the assistant
              </Link>
            ) : "Add them on the assistant"}{" "}
            to score every call automatically.
          </p>
        )}

        {hasQuestions && data && (
          <ul className="space-y-2.5">
            {data.aggregate.map((q) => {
              const isBoolean = (q.type ?? "boolean") === "boolean";
              const total = (q.yes ?? 0) + (q.no ?? 0) + (q.unknown ?? 0);
              return (
                <li key={q.id} className="space-y-1">
                  <p className="text-xs leading-snug text-foreground">{q.text}</p>
                  {isBoolean ? (
                    <div className="flex items-center gap-2 text-[11px] tabular">
                      <span className="text-emerald-400">✓ {q.yes ?? 0}</span>
                      <span className="text-muted-foreground">✗ {q.no ?? 0}</span>
                      <span className="text-muted-foreground/70">? {q.unknown ?? 0}</span>
                      {total > 0 && (
                        <span className="ml-auto text-muted-foreground/70">
                          {Math.round(((q.yes ?? 0) / total) * 100)}% yes
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[11px] tabular text-muted-foreground/70">
                      <span className="rounded border border-border px-1 py-0.5 text-[10px] uppercase">
                        {q.type}
                      </span>
                      <span>answered {q.answered ?? 0} of {q.total ?? 0} · open a call to read</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
