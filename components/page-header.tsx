import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Canonical page header — eyebrow + title + one-line description on the left, an
 * optional action cluster on the right. This is the pattern the pods/seats pages
 * set (DESIGN.md §Layout: "page header"); use it on every top-level page so headers
 * read identically across the app instead of each page reinventing the markup.
 *
 *   <PageHeader eyebrow="VICIdial" title="Bot seats"
 *     description="A seat connects your dialer to one AI bot."
 *     actions={<Button>New seat</Button>} />
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-0.5 text-base font-semibold text-foreground">{title}</h1>
        {description && (
          <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
