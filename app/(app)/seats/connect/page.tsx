"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Seats, type BotSeat } from "@/lib/api/seats";
import { API_BASE } from "@/lib/api/client";
import { buildCarrierBlock, buildAllocateSnippet } from "@/lib/sip-config";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeftIcon, CopyIcon, PhoneIncomingIcon, CableIcon, ServerIcon, BotIcon,
  ChevronRightIcon, TriangleAlertIcon, LightbulbIcon, PhoneCallIcon, ArrowRightLeftIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── small building blocks ─────────────────────────────────────────────── */

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); toast.success("Copied"); }
    catch { toast.error("Could not copy"); }
  };
  return (
    <div className="rounded-md border border-border bg-muted/50">
      <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label ?? "Paste this"}
        </span>
        <Button variant="ghost" size="icon" className="size-6" onClick={copy} aria-label="Copy">
          <CopyIcon className="size-3.5" />
        </Button>
      </div>
      <pre className="tabular overflow-x-auto whitespace-pre-wrap break-all p-2.5 text-[11px] text-foreground">
        {code}
      </pre>
    </div>
  );
}

function Callout({
  tone = "tip", icon: Icon = LightbulbIcon, children,
}: { tone?: "tip" | "warn"; icon?: typeof LightbulbIcon; children: React.ReactNode }) {
  return (
    <div className={cn(
      "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-xs",
      tone === "warn"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
        : "border-primary/25 bg-primary/5 text-foreground",
    )}>
      <Icon className={cn("mt-0.5 size-4 shrink-0",
        tone === "warn" ? "text-amber-400" : "text-primary")} aria-hidden />
      <div className="min-w-0 [&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline">
        {children}
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex gap-4 p-4">
        <div className="tabular flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {n}
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <div className="space-y-2.5 text-sm leading-relaxed text-muted-foreground">{children}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Plain-English version of the flow diagram from the SIP doc. */
function FlowStrip() {
  const stages = [
    { icon: PhoneIncomingIcon, label: "Your VICIdial", sub: "dials a lead" },
    { icon: CableIcon, label: "SIP trunk", sub: "carries the call to us" },
    { icon: ServerIcon, label: "Our gateway", sub: "picks a ready server" },
    { icon: BotIcon, label: "AI answers", sub: "talks to the lead" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-lg border bg-muted/30 px-3 py-2.5">
      {stages.map((s, i) => (
        <React.Fragment key={s.label}>
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
              <s.icon className="size-3.5" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-xs font-medium text-foreground">{s.label}</p>
              <p className="text-[11px] text-muted-foreground">{s.sub}</p>
            </div>
          </div>
          {i < stages.length - 1 && (
            <ChevronRightIcon className="hidden size-3.5 shrink-0 text-muted-foreground/60 sm:inline" aria-hidden />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ── your-values panel (fills the walkthrough with the operator's real seat) ─ */

function YourValues() {
  const { data: seats } = useQuery<BotSeat[]>({ queryKey: ["bot-seats"], queryFn: Seats.list });
  const sipSeats = (seats ?? []).filter((s) => s.sipEnabled);
  const [seatId, setSeatId] = React.useState<string | null>(null);
  const seat = sipSeats.find((s) => s.id === seatId) ?? null;

  const copyVal = async (v: string) => {
    try { await navigator.clipboard.writeText(v); toast.success("Copied"); }
    catch { toast.error("Could not copy"); }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Your connection details</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pick a seat to drop its real values into the steps below. Seats must have the{" "}
            <span className="font-medium text-foreground">SIP trunk</span> method turned on.
          </p>
        </div>

        {sipSeats.length === 0 ? (
          <Callout tone="warn" icon={TriangleAlertIcon}>
            No SIP-enabled seats yet. <Link href="/seats">Create a seat</Link> and choose{" "}
            <span className="font-medium">SIP trunk</span> as the connection method, then come back here.
          </Callout>
        ) : (
          <Select value={seatId} onValueChange={(v) => setSeatId(v)}>
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue placeholder="Pick a seat…" />
            </SelectTrigger>
            <SelectContent>
              {sipSeats.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {seat && (
          <div className="space-y-3 pt-1">
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ["Server", seat.sipServerHost ?? "—"],
                ["Username", seat.sipUsername ?? "—"],
                ["Password", seat.sipPassword ?? "shown once — see the seat card"],
              ] as [string, string][]).map(([k, v]) => (
                <button key={k} type="button" onClick={() => copyVal(v)}
                  className="rounded-md border border-border bg-muted/40 px-2.5 py-2 text-left transition-colors hover:bg-muted/70">
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{k}</span>
                  <span className="tabular mt-0.5 block truncate text-xs text-foreground">{v}</span>
                </button>
              ))}
            </div>
            <Callout>
              Your <span className="font-medium">password</span> is shown only once, when the seat is
              created or when you rotate it. Get it (or a fresh one) from the seat&apos;s{" "}
              <Link href="/seats">Connect your dialer card</Link>. The block below already has your
              server and username filled in.
            </Callout>
            <CodeBlock label="Your carrier block" code={buildCarrierBlock(seat)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── page ──────────────────────────────────────────────────────────────── */

export default function ConnectGuidePage() {
  const genericBlock = buildCarrierBlock({ sipUsername: null, sipServerHost: null });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="VICIdial"
        title="Connect your dialer to a bot seat"
        description="A plain-English walkthrough. In about 10 minutes your VICIdial can hand answered calls to the AI, with no scripting. Follow the steps top to bottom."
        actions={
          <Button variant="outline" render={<Link href="/seats" />}>
            <ArrowLeftIcon className="size-4" /> Back to seats
          </Button>
        }
      />

      {/* How it works */}
      <section className="space-y-2">
        <p className="text-sm text-muted-foreground">
          A <span className="font-medium text-foreground">bot seat</span> is one AI agent that can take
          one call at a time. You connect it to VICIdial as a{" "}
          <span className="font-medium text-foreground">carrier</span> (a phone line VICIdial dials
          through). When your campaign dials a lead through that carrier, our gateway answers with the
          AI. Nothing about your leads, agents, or campaigns changes.
        </p>
        <FlowStrip />
      </section>

      <YourValues />

      {/* Steps */}
      <div className="space-y-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Step by step
        </p>

        <Step n={1} title="Create a bot seat set to “SIP trunk”">
          <p>
            On the <Link href="/seats" className="font-medium text-primary underline-offset-2 hover:underline">Bot seats</Link>{" "}
            page, click <span className="font-medium text-foreground">New seat</span>. Give it a name,
            pick the assistant or flow that should answer, and under{" "}
            <span className="font-medium text-foreground">How the dialer connects</span> choose{" "}
            <span className="font-medium text-foreground">SIP trunk</span>. Save.
          </p>
        </Step>

        <Step n={2} title="Grab your three connection values">
          <p>
            Open your seat&apos;s card and find the{" "}
            <span className="font-medium text-foreground">Connect your dialer</span> box. It shows a{" "}
            <span className="font-medium text-foreground">Server</span>,{" "}
            <span className="font-medium text-foreground">Username</span>, and{" "}
            <span className="font-medium text-foreground">Password</span>. The password appears once,
            so copy it now (use <span className="font-medium text-foreground">Rotate password</span> if
            you missed it). Or just pick your seat in the panel above to see them here.
          </p>
          <Callout tone="warn" icon={TriangleAlertIcon}>
            The <span className="font-medium">Server</span> is a normal hostname like{" "}
            <span className="tabular">pbx.ringsline.online</span> — not a web address. If you copied an
            <span className="tabular"> https://…</span> link, that&apos;s the wrong value.
          </Callout>
        </Step>

        <Step n={3} title="Add us as a carrier in VICIdial">
          <p>
            In VICIdial admin, go to{" "}
            <span className="font-medium text-foreground">Admin → Carriers → Add A New Carrier</span>.
            Give it a name (e.g. <span className="tabular">AI_BOT_TRUNK</span>) and paste the block
            below into the carrier&apos;s <span className="font-medium text-foreground">Account Entry</span>{" "}
            field. Replace the three placeholders with your Server, Username, and Password from step 2
            (the panel above fills these in for you if you picked a seat).
          </p>
          <CodeBlock label="Carrier account entry" code={genericBlock} />
          <Callout tone="warn" icon={TriangleAlertIcon}>
            Keep the <span className="tabular">allow=ulaw,alaw</span> line. It lets the AI press IVR
            keys as tones. On a compressed codec (like G.729) key presses won&apos;t register.
          </Callout>
        </Step>

        <Step n={4} title="Give the trunk a number to dial (on your VICIdial)">
          <p>
            The block above is only the line&apos;s credentials — VICIdial still needs a number it can
            dial to reach it. Add this one line on{" "}
            <span className="font-medium text-foreground">your VICIdial</span>: paste it into the{" "}
            <span className="font-medium text-foreground">Dialplan Entry</span> field of the same
            carrier form from step 3, and VICIdial writes it into your Asterisk for you. It makes{" "}
            <span className="tabular">86000</span> the number your campaign dials.
          </p>
          <CodeBlock label="Dialplan entry (goes on your VICIdial box)"
            code={"exten => 86000,1,Dial(SIP/jerali/${EXTEN})"} />
          <Callout tone="warn" icon={TriangleAlertIcon}>
            This is a <span className="font-medium">dialplan routing rule</span>, not a desk-phone or
            agent extension. You&apos;re not adding a phone, an agent, or a seat — just a number that
            forwards the call to our trunk. If you manage your own dialplan, add the same line to{" "}
            <span className="tabular">extensions.conf</span> in the context your campaign uses.
          </Callout>
          <Callout>
            Pick any unused number — the exact digits don&apos;t matter. Our gateway routes by which
            SIP account signed in, not by what was dialed.{" "}
            <span className="tabular">jerali</span> here is the peer name from the block in step 3.
          </Callout>
        </Step>

        <Step n={5} title="Send calls to the trunk from a campaign">
          <p>
            Now point a campaign at that extension so answered leads reach the AI. The simplest way:
            open your campaign&apos;s <span className="font-medium text-foreground">Detail</span> screen,
            set <span className="font-medium text-foreground">Survey Method</span> to{" "}
            <span className="font-medium text-foreground">EXTENSION</span>, and enter the extension from
            step 4 (e.g. <span className="tabular">86000</span>). Every answered lead is then handed to
            the AI.
          </p>
          <Callout>
            To try it before wiring a whole campaign, use VICIdial&apos;s manual dial and dial the trunk
            extension directly — you should hear the AI greeting.
          </Callout>
        </Step>

        <Step n={6} title="(Optional) Let the AI transfer to a human">
          <p>
            If the AI should hand qualified callers to a live agent, set the{" "}
            <span className="font-medium text-foreground">Agent extension for transfers</span> on the
            seat (edit the seat → it&apos;s under the SIP option). Use your VICIdial{" "}
            <span className="font-medium text-foreground">In-Group</span> ID or an extension that rings
            agents, e.g. <span className="tabular">8600051</span>. Make sure that in-group exists and is
            staffed. When the AI transfers, our gateway sends the call back to that destination.
          </p>
        </Step>

        <Step n={7} title="Make a test call and confirm">
          <p>
            Place one call through the trunk. In the Asterisk console (<span className="tabular">asterisk -rvvv</span>)
            you should see the peer register <span className="tabular">OK</span> and hear the AI greeting.
            Watch the seat&apos;s <span className="font-medium text-foreground">in use</span> counter on
            the Bot seats page climb to 1 while the call runs.
          </p>
          <div className="flex flex-wrap gap-2 pt-0.5">
            <Button size="sm" render={<Link href="/seats" />}>
              <PhoneCallIcon className="size-3.5" /> Go to Bot seats
            </Button>
            <Button size="sm" variant="outline" render={<Link href="/calls" />}>
              View call history
            </Button>
          </div>
        </Step>
      </div>

      {/* One call at a time */}
      <Card>
        <CardContent className="flex items-start gap-3 p-4">
          <ArrowRightLeftIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">How many calls at once?</p>
            <p>
              One seat carries <span className="font-medium text-foreground">one call at a time</span> by
              default. Need more at once? Raise the seat&apos;s{" "}
              <span className="font-medium text-foreground">Concurrent calls</span> number, or add more
              seats — one seat per simultaneous call. Extra calls beyond the limit are refused cleanly so
              VICIdial recycles the lead.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <section className="space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          If something doesn&apos;t work
        </p>
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {[
              ["Nothing happens / “480 Busy”",
                "All seats are full or the seat is inactive. Check the seat is Active and that its “in use” counter has room, then try again."],
              ["“Authentication failed” in Asterisk",
                "The username or password don’t match. Re-copy them from the seat’s Connect your dialer card — rotate the password if unsure."],
              ["The AI can’t press IVR keys",
                "Your carrier is missing allow=ulaw,alaw, or the call is on a compressed codec. Add that codec line to the carrier."],
              ["Call connects then drops instantly",
                "Usually the Server value is wrong (a web link instead of the SIP hostname), or a firewall is blocking outbound SIP. Confirm the hostname and open outbound UDP 5060."],
              ["Peer shows “UNREACHABLE”",
                "Asterisk can’t reach the server. Check DNS resolves the hostname and that outbound port 5060 (UDP) is open."],
            ].map(([q, a]) => (
              <div key={q} className="px-4 py-3">
                <p className="text-sm font-medium text-foreground">{q}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{a}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Advanced: HTTP allocate */}
      <section className="space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Advanced: custom dialplan (for engineers)
        </p>
        <Card>
          <CardContent className="space-y-2.5 p-4 text-sm text-muted-foreground">
            <p>
              If you&apos;d rather wire this in your own dialplan instead of a carrier, switch the seat to{" "}
              <span className="font-medium text-foreground">HTTP allocate</span>. Your Asterisk calls our
              API once per call to reserve a bot and learn which server to bridge to, then runs{" "}
              <span className="tabular">AudioSocket()</span>. You&apos;ll need an{" "}
              <Link href="/api-settings" className="font-medium text-primary underline-offset-2 hover:underline">API key</Link>.
            </p>
            <CodeBlock label="Allocate (once per call)"
              code={buildAllocateSnippet({ id: "<SEAT_ID>" }, API_BASE)} />
            <p className="text-xs">
              The seat&apos;s own card shows this command with its real seat ID pre-filled.
            </p>
          </CardContent>
        </Card>
      </section>

      <div className="flex items-center gap-2 pb-2">
        <Badge variant="outline" className="text-[10px]">Need a hand?</Badge>
        <span className="text-xs text-muted-foreground">
          Contact support with your seat name and carrier name and we&apos;ll walk through it with you.
        </span>
      </div>
    </div>
  );
}
