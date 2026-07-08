import Link from "next/link";
import { ArrowLeftIcon, RocketIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampaignWizard } from "@/components/campaign/wizard";

export default function NewCampaignPage() {
  return (
    <div className="space-y-4">
      {/* ── Page header ──────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/campaigns" />}
          aria-label="Back to campaigns"
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
          <RocketIcon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Outbound
          </p>
          <h1 className="mt-0.5 text-base font-semibold text-foreground">
            Launch campaign
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Walk through the steps to set up and launch an outbound call
            campaign.
          </p>
        </div>
      </div>
      <CampaignWizard />
    </div>
  );
}
