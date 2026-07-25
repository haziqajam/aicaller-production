import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Canonical empty state — a muted icon chip, a title, a one-line hint, and an
 * optional next-action button. The muted treatment (not a primary-tinted chip) is
 * deliberate: the brand is "calm mission control, nothing decorative" (PRODUCT.md),
 * and this matches the pods/seats pages. Use it wherever a list can be empty so the
 * zero state names its single next step (PRODUCT.md Design Principle 2).
 *
 *   <EmptyState icon={ServerIcon} title="No bot seats yet"
 *     hint="Create a seat, pick the bot, then connect your dialer."
 *     action={<Button onClick={openCreate}>New seat</Button>} />
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-5 text-muted-foreground" aria-hidden />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">{title}</p>
          {hint && <p className="mx-auto max-w-xs text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
