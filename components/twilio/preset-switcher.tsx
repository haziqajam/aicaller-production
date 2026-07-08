"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TwilioPresets, type TwilioPreset } from "@/lib/api/twilio-presets";
import { toastApiError } from "@/lib/api/errors";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KeyRoundIcon, CheckIcon, Loader2Icon, PlusIcon, SettingsIcon } from "lucide-react";

/** Mask an account SID to a recognizable, non-sensitive tail (AC••••1234). */
function maskSid(sid?: string | null): string {
  if (!sid) return "—";
  return sid.length <= 6 ? sid : `${sid.slice(0, 2)}••••${sid.slice(-4)}`;
}

/**
 * Global Twilio "account" switcher in the navbar. Lists the user's presets, marks
 * the active one, and switches via the activate mutation — invalidating every
 * Twilio-derived query so numbers re-fetch under the new account. Server `active`
 * flag is the source of truth (react-query is the store).
 */
export function TwilioPresetSwitcher() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: presets, isLoading } = useQuery<TwilioPreset[]>({
    queryKey: ["twilio-presets"],
    queryFn: TwilioPresets.list,
  });
  const list = presets ?? [];
  const active = list.find((p) => p.active) ?? null;

  const activate = useMutation({
    mutationFn: (id: string) => TwilioPresets.activate(id),
    onSuccess: (_res, id) => {
      const p = list.find((x) => x.id === id);
      toast.success(`Switched to ${p?.name ?? "account"}`);
      qc.invalidateQueries({ queryKey: ["twilio-presets"] });
      qc.invalidateQueries({ queryKey: ["numbers"] });
      qc.invalidateQueries({ queryKey: ["number-lists"] });
    },
    onError: (err) => toastApiError(err, "Couldn't switch account"),
  });

  const dot = active ? "bg-emerald-400" : "bg-amber-400";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Twilio account"
        className="flex items-center gap-1.5 rounded-full py-0.5 pr-2 pl-2 text-sm text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={`size-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
        <KeyRoundIcon className="size-3.5 shrink-0" aria-hidden />
        <span className="hidden tabular text-xs font-medium sm:block">
          {isLoading ? "…" : active ? maskSid(active.accountSid) : "No account"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem className="text-[10px] uppercase tracking-wider text-muted-foreground" disabled>
          Twilio account
        </DropdownMenuItem>

        {list.length === 0 ? (
          <DropdownMenuItem onClick={() => router.push("/settings/twilio")} className="text-primary">
            <PlusIcon className="size-4" aria-hidden />
            Add Twilio account
          </DropdownMenuItem>
        ) : (
          list.map((p) => {
            const isActive = p.active;
            const pending = activate.isPending && activate.variables === p.id;
            return (
              <DropdownMenuItem
                key={p.id}
                onClick={() => !isActive && activate.mutate(p.id)}
                disabled={pending}
                className="flex items-center gap-2"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
                  <span className="tabular truncate text-[11px] text-muted-foreground">
                    {maskSid(p.accountSid)}
                  </span>
                </span>
                <span className="ml-auto">
                  {pending ? <Loader2Icon className="size-4 animate-spin" aria-hidden />
                    : isActive ? <CheckIcon className="size-4 text-emerald-400" aria-hidden /> : null}
                </span>
              </DropdownMenuItem>
            );
          })
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/settings/twilio")}>
          <SettingsIcon className="size-4" aria-hidden />
          Manage accounts
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
