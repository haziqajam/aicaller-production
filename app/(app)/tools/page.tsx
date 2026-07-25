"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Tools } from "@/lib/api/resources";
import type { Tool } from "@/lib/api/schemas";
import { toastApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  WrenchIcon, PlusIcon, Trash2Icon, PencilIcon, TagIcon, GlobeIcon,
  KeyRoundIcon, BracesIcon, TriangleAlertIcon, type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";

/* ─────────────────────────────────────────────────────────────────────────
 * Types + helpers
 * ──────────────────────────────────────────────────────────────────────── */
type Param = {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
  location: "query" | "body" | "path";
};
type HeaderRow = { key: string; value: string };

const EMPTY: Tool = {
  name: "", description: "", method: "GET", url: "", headers: {}, parameters: [],
  timeoutSeconds: 10,
};

// Backend rule: ^[a-zA-Z_][a-zA-Z0-9_]{0,63}$ — surface it before the API rejects.
const NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;
// Backend redacts secret header values to this on read; submitting it back keeps
// the stored value (see routes_tools._REDACTED).
const REDACTED = "***";

// Short labels for the dropdown (long strings overflow the anchor-width popup);
// the full explanation is shown as a contextual hint under the select.
const LOCATION_LABEL: Record<Param["location"], string> = {
  query: "Query string",
  body: "Request body",
  path: "URL path",
};

function headersToRows(h: Record<string, string>): HeaderRow[] {
  return Object.entries(h ?? {}).map(([key, value]) => ({ key, value }));
}
function rowsToHeaders(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of rows) {
    const k = key.trim();
    if (k) out[k] = value;
  }
  return out;
}

/* Per-section accent tones (mirrors campaign page / editor-form). */
const TONE: Record<string, string> = {
  cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
};

function SectionHeader({
  icon: Icon, title, hint, tone = "cyan",
}: { icon: LucideIcon; title: string; hint?: string; tone?: keyof typeof TONE }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border", TONE[tone])}>
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold leading-tight text-foreground">{title}</h3>
        {hint && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

/** Label + control + helper/error, consistent spacing. */
function Field({
  label, hint, error, required, children, className,
}: {
  label: string; hint?: React.ReactNode; error?: string; required?: boolean;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-sm font-medium leading-none text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-xs font-medium text-destructive">
          <TriangleAlertIcon className="size-3" aria-hidden />{error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Tool create/edit dialog
 * ──────────────────────────────────────────────────────────────────────── */
function ToolDialog({ tool, onSaved, trigger }: { tool?: Tool; onSaved: () => void; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Tool>(tool ?? EMPTY);
  const [headerRows, setHeaderRows] = React.useState<HeaderRow[]>([]);

  const openDialog = () => {
    setDraft(tool ? { ...tool } : { ...EMPTY });
    setHeaderRows(headersToRows(tool?.headers ?? {}));
    setOpen(true);
  };
  const set = (patch: Partial<Tool>) => setDraft((d) => ({ ...d, ...patch }));

  const params: Param[] = (draft.parameters as Param[]) ?? [];
  const setParam = (i: number, patch: Partial<Param>) =>
    set({ parameters: params.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) });
  const addParam = () =>
    set({ parameters: [...params, { name: "", type: "string", description: "", required: false, location: "query" }] });
  const removeParam = (i: number) => set({ parameters: params.filter((_, idx) => idx !== i) });

  const addHeader = () => setHeaderRows((r) => [...r, { key: "", value: "" }]);
  const setHeader = (i: number, patch: Partial<HeaderRow>) =>
    setHeaderRows((r) => r.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));
  const removeHeader = (i: number) => setHeaderRows((r) => r.filter((_, idx) => idx !== i));

  // Validation
  const nameTrimmed = draft.name.trim();
  const nameError =
    nameTrimmed && !NAME_RE.test(nameTrimmed)
      ? "Use letters, numbers and underscores only; start with a letter or _."
      : undefined;
  const urlTrimmed = draft.url.trim();
  const urlError =
    urlTrimmed && !/^https?:\/\//i.test(urlTrimmed) ? "Must start with http:// or https://" : undefined;
  // Path params must appear as {{name}} in the URL, else they're silently dropped.
  const danglingPathParams = params
    .filter((p) => p.location === "path" && p.name.trim() && !draft.url.includes(`{{${p.name.trim()}}}`))
    .map((p) => p.name.trim());
  const canSave = !!nameTrimmed && !!urlTrimmed && !nameError && !urlError;

  const save = useMutation({
    mutationFn: () => {
      const body: Tool = { ...draft, name: nameTrimmed, url: urlTrimmed, headers: rowsToHeaders(headerRows) };
      return tool?.id ? Tools.update(tool.id, body) : Tools.create(body);
    },
    onSuccess: () => { setOpen(false); toast.success(tool ? "Tool updated" : "Tool created"); onSaved(); },
    onError: (e) => toastApiError(e),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={openDialog}>{trigger}</span>
      <DialogContent className="gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <WrenchIcon className="size-4 text-primary" aria-hidden />
            {tool ? "Edit tool" : "New tool"}
          </DialogTitle>
          <DialogDescription>
            An HTTP endpoint your assistant can call mid-conversation. Describe it clearly
            so the model knows when and how to use it.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[64vh] space-y-7 overflow-y-auto px-5 py-5">
          {/* ── Identity ─────────────────────────────────────────────── */}
          <section className="space-y-4">
            <SectionHeader
              icon={TagIcon} tone="cyan" title="Identity"
              hint="How the model recognises and reasons about this tool."
            />
            <Field
              label="Function name" required error={nameError}
              hint={<>The identifier the model calls. e.g. <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">get_order_status</code></>}
            >
              <Input
                className="font-mono" value={draft.name}
                aria-invalid={!!nameError}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="get_order_status"
              />
            </Field>
            <Field
              label="Description" required
              hint="Tell the model WHEN to use this tool — e.g. “Look up a customer's order status when they ask about delivery.”"
            >
              <Textarea
                rows={2} value={draft.description}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="Look up the delivery status of a customer's order by order ID."
              />
            </Field>
          </section>

          {/* ── Request ──────────────────────────────────────────────── */}
          <section className="space-y-4">
            <SectionHeader
              icon={GlobeIcon} tone="violet" title="Request"
              hint="The HTTP call made when the model invokes the tool."
            />
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <Field label="Method">
                <Select value={draft.method} onValueChange={(v) => set({ method: v as Tool["method"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="URL" required error={urlError}
                hint={<>Public http(s) endpoint. Use <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{"{{paramName}}"}</code> for path values. Internal / localhost addresses are blocked.</>}
              >
                <Input
                  className="font-mono text-xs" value={draft.url}
                  aria-invalid={!!urlError}
                  onChange={(e) => set({ url: e.target.value })}
                  placeholder="https://api.example.com/orders/{{orderId}}"
                />
              </Field>
            </div>
            <Field
              label="Timeout"
              hint="Seconds to wait for a response before giving up (1–60)."
            >
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={1} max={60} className="w-24 tabular"
                  value={draft.timeoutSeconds ?? 10}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    set({ timeoutSeconds: Number.isFinite(n) ? Math.min(60, Math.max(1, n)) : 10 });
                  }}
                />
                <span className="text-xs text-muted-foreground">seconds</span>
              </div>
            </Field>
          </section>

          {/* ── Headers ──────────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <SectionHeader
                icon={KeyRoundIcon} tone="amber" title="Headers"
                hint="Sent on every request (e.g. an API key). Optional."
              />
              <Button type="button" size="sm" variant="outline" onClick={addHeader}>
                <PlusIcon aria-hidden /> Add header
              </Button>
            </div>
            {headerRows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
                No headers. Add one for authentication or content negotiation.
              </p>
            ) : (
              <div className="space-y-2">
                {headerRows.map((h, i) => {
                  const redacted = h.value === REDACTED;
                  return (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                      <Input
                        className="h-8 font-mono text-xs" placeholder="Authorization"
                        value={h.key} onChange={(e) => setHeader(i, { key: e.target.value })}
                      />
                      <Input
                        className={cn("h-8 font-mono text-xs", redacted && "text-muted-foreground")}
                        placeholder="Bearer …"
                        value={h.value} onChange={(e) => setHeader(i, { value: e.target.value })}
                        title={redacted ? "Hidden — leave as is to keep the saved value" : undefined}
                      />
                      <Button
                        type="button" variant="ghost" size="icon-sm"
                        className="text-muted-foreground" aria-label="Remove header"
                        onClick={() => removeHeader(i)}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  );
                })}
                {headerRows.some((h) => h.value === REDACTED) && (
                  <p className="text-xs text-muted-foreground">
                    <code className="font-mono">{REDACTED}</code> means a saved secret is hidden — leave it to keep the value, or type a new one to replace it.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* ── Parameters ───────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <SectionHeader
                icon={BracesIcon} tone="emerald" title="Parameters"
                hint="Values the model fills in when calling the tool."
              />
              <Button type="button" size="sm" variant="outline" onClick={addParam}>
                <PlusIcon aria-hidden /> Add parameter
              </Button>
            </div>

            {params.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
                No parameters. Add one for each value the assistant should supply (e.g. an order ID).
              </p>
            ) : (
              <div className="space-y-2.5">
                {params.map((p, i) => (
                  <div key={i} className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                    <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2.5">
                      <Field label="Name" className="space-y-1">
                        <Input
                          className="h-8 font-mono text-xs" placeholder="orderId"
                          value={p.name} onChange={(e) => setParam(i, { name: e.target.value })}
                        />
                      </Field>
                      <Field label="Type" className="space-y-1">
                        <Select value={p.type} onValueChange={(v) => setParam(i, { type: v as Param["type"] })}>
                          <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="string">string</SelectItem>
                            <SelectItem value="number">number</SelectItem>
                            <SelectItem value="boolean">boolean</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <label className="flex h-8 items-center gap-2 rounded-lg border border-border px-2.5 text-xs text-muted-foreground">
                        <Switch size="sm" checked={p.required} onCheckedChange={(c) => setParam(i, { required: c })} />
                        Required
                      </label>
                    </div>

                    <Field
                      label="Where it goes" className="space-y-1"
                      hint={p.location === "path"
                        ? <>Inserted into the URL — add <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{`{{${p.name.trim() || "name"}}}`}</code> to the URL above.</>
                        : p.location === "body"
                        ? "Sent as a JSON field in the request body (POST)."
                        : "Appended to the URL as ?name=value."}
                    >
                      <Select value={p.location} onValueChange={(v) => setParam(i, { location: v as Param["location"] })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent className="min-w-40">
                          <SelectItem value="query">{LOCATION_LABEL.query}</SelectItem>
                          <SelectItem value="body">{LOCATION_LABEL.body}</SelectItem>
                          <SelectItem value="path">{LOCATION_LABEL.path}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field
                      label="Description" className="space-y-1"
                      hint="What the model should put here — it reads this to fill the value."
                    >
                      <Input
                        className="h-8" placeholder="The customer's order ID, e.g. ORD-1234"
                        value={p.description} onChange={(e) => setParam(i, { description: e.target.value })}
                      />
                    </Field>

                    <div className="flex justify-end">
                      <Button
                        type="button" variant="ghost" size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => removeParam(i)}
                      >
                        <Trash2Icon className="size-3.5" /> Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {danglingPathParams.length > 0 && (
              <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
                <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  Path parameter{danglingPathParams.length > 1 ? "s" : ""}{" "}
                  <code className="font-mono">
                    {danglingPathParams.map((n) => `{{${n}}}`).join(", ")}
                  </code>{" "}
                  not found in the URL — add {danglingPathParams.length > 1 ? "them" : "it"} or the value will be dropped.
                </span>
              </p>
            )}
          </section>
        </div>

        <DialogFooter className="border-t border-border px-5 py-3.5">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !canSave}>
            {save.isPending ? "Saving…" : tool ? "Save tool" : "Create tool"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Tools list page
 * ──────────────────────────────────────────────────────────────────────── */
export default function ToolsPage() {
  const qc = useQueryClient();
  const onSaved = () => qc.invalidateQueries({ queryKey: ["tools"] });
  const { data: tools, isLoading } = useQuery<Tool[]>({ queryKey: ["tools"], queryFn: Tools.list });
  const del = useMutation({
    mutationFn: (id: string) => Tools.remove(id),
    onSuccess: () => { toast.success("Tool deleted"); onSaved(); },
    onError: (e) => toastApiError(e),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Build"
        title="Tools"
        description="Custom HTTP tools your assistants can call during a conversation. Attach them to an assistant from the assistant editor's Tools tab."
        actions={<ToolDialog onSaved={onSaved} trigger={<Button><PlusIcon className="size-4" />New tool</Button>} />}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
          ) : !tools || tools.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
              <WrenchIcon className="size-5 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">No tools yet. Create one to let assistants call an external API.</p>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Method</TableHead><TableHead>URL</TableHead>
                <TableHead>Params</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {tools.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell><Badge variant="secondary">{t.method}</Badge></TableCell>
                    <TableCell className="max-w-[22rem] truncate font-mono text-xs text-muted-foreground">{t.url}</TableCell>
                    <TableCell className="tabular text-muted-foreground">{t.parameters?.length ?? 0}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <ToolDialog tool={t} onSaved={onSaved} trigger={
                        <Button variant="ghost" size="icon"><PencilIcon className="size-4" /></Button>} />
                      <AlertDialog>
                        <AlertDialogTrigger render={
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                            <Trash2Icon className="size-4" />
                          </Button>} />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete &ldquo;{t.name}&rdquo;?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes the tool and detaches it from any assistants using it.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => t.id && del.mutate(t.id)}
                              className="bg-destructive text-white hover:bg-destructive/90">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
