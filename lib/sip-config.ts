import type { BotSeat } from "./api/seats";

/**
 * The exact VICIdial carrier block (chan_sip) for a seat — a `register =>` line plus
 * a `type=peer` endpoint. Single source of truth shared by the seat card and the
 * "Connect your dialer" guide so the two never drift. `allow=ulaw,alaw` is required
 * for in-band DTMF; `context=from-pstn` is VICIdial's standard inbound context.
 *
 * The password is only present in the response that just minted/rotated it, so it
 * falls back to a `<password>` placeholder — the operator pastes the real one from
 * the seat card (or rotates to see a fresh one).
 */
export function buildCarrierBlock(
  seat: Pick<BotSeat, "sipUsername" | "sipServerHost" | "sipPassword">,
): string {
  const host = seat.sipServerHost || "<server>";
  const user = seat.sipUsername || "<username>";
  const pw = seat.sipPassword || "<password>";
  return (
    `; AIDEVGEN AI bot trunk\n` +
    `register => ${user}:${pw}@${host}\n` +
    `\n` +
    `[aidevgen]\n` +
    `type=peer\n` +
    `host=${host}\n` +
    `username=${user}\n` +
    `fromuser=${user}\n` +
    `secret=${pw}\n` +
    `context=from-pstn\n` +
    `disallow=all\n` +
    `allow=ulaw,alaw\n`
  );
}

/**
 * The per-call HTTP allocate command for the "for engineers" path — the dialplan
 * calls this once per call to reserve a bot and learn which pod to bridge to.
 */
export function buildAllocateSnippet(seat: Pick<BotSeat, "id">, apiBase: string): string {
  return (
    `curl -s -X POST "${apiBase}/audiosocket/allocate" \\\n` +
    `  -H "X-API-Key: <YOUR_API_KEY>" -H "Content-Type: application/json" \\\n` +
    `  -d '{"seatId":"${seat.id}","fromNumber":"<LEAD_PHONE>","channel":"<ASTERISK_CHANNEL>"}'`
  );
}
