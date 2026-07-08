/**
 * Phone normalization & validation — Pakistan-first.
 *
 * Twilio needs E.164 (`+<countrycode><number>`). The most common breakage is
 * Excel turning a long number into scientific notation ("9.23104E+11"), which
 * also loses digits. We normalize common Pakistani formats to +92… and accept
 * any valid international E.164; anything ambiguous (no country code) is rejected
 * with a helpful reason so the user fixes it before import.
 */

export interface PhoneNormalizeResult {
  ok: boolean;
  /** Normalized E.164 (`+…`) when ok. */
  e164?: string;
  /** Human reason when invalid. */
  reason?: string;
}

/** E.164: '+', leading non-zero, total 8–15 digits. */
const E164_RE = /^\+[1-9]\d{7,14}$/;

/** Example shown in guidance/placeholders (Pakistan prioritized). */
export const PHONE_EXAMPLE_PK = "+923001234567";
export const PHONE_EXAMPLE_INTL = "+14155551234";

export function normalizePhone(raw: string): PhoneNormalizeResult {
  const s = (raw ?? "").trim();
  if (!s) return { ok: false, reason: "empty" };

  // Letters or a decimal point ⇒ corrupted (e.g. Excel "9.23104E+11").
  if (/[a-zA-Z]/.test(s) || s.includes(".")) {
    return {
      ok: false,
      reason:
        "looks corrupted (scientific notation) — format the phone column as Text",
    };
  }

  const hadPlus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  if (!digits) return { ok: false, reason: "no digits" };

  // Already international.
  if (hadPlus) {
    const e164 = "+" + digits;
    return E164_RE.test(e164)
      ? { ok: true, e164 }
      : { ok: false, reason: "not a valid international number" };
  }

  // Pakistan-first heuristics for numbers typed without a '+'.
  let candidate: string | null = null;
  if (digits.startsWith("0092")) {
    candidate = "+" + digits.slice(2); // 0092XXXXXXXXXX
  } else if (digits.length === 12 && digits.startsWith("92")) {
    candidate = "+" + digits; // 92 3XX XXXXXXX
  } else if (digits.length === 11 && digits.startsWith("0")) {
    candidate = "+92" + digits.slice(1); // 03XX XXXXXXX (national trunk)
  } else if (digits.length === 10 && digits.startsWith("3")) {
    candidate = "+92" + digits; // 3XX XXXXXXX (PK mobile, no trunk)
  } else if (digits.length >= 11 && digits.length <= 15) {
    candidate = "+" + digits; // assume a country code is already present
  }

  if (candidate && E164_RE.test(candidate)) return { ok: true, e164: candidate };
  return {
    ok: false,
    reason: `missing country code — use ${PHONE_EXAMPLE_PK} for Pakistan`,
  };
}

export function isValidPhone(raw: string): boolean {
  return normalizePhone(raw).ok;
}

/** A value mangled by a spreadsheet (scientific notation / stray letters) whose
 *  digits are unrecoverable — a '+' can't fix it; it must be re-entered. */
export function looksCorrupted(raw: string): boolean {
  return /[a-zA-Z.]/.test((raw ?? "").trim());
}
