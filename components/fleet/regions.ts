// Vast.ai region choices, shared by the Deploy dialog and the Inbound tab.
// Values flow to the backend's offer search: a 2-letter country code, or an
// alias the backend expands ("EU" -> every European country; see
// caller/fleet/vast_client.py REGION_ALIASES). "Europe (any)" exists because US
// hosts' transit to the image registries has proven flaky for large pulls,
// while EU hosts pull at full speed (2026-07-12 incident).
export const REGIONS = [
  { value: "any", label: "Any region" },
  { value: "EU", label: "Europe (any)" },
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "GB", label: "United Kingdom" },
  { value: "DE", label: "Germany" },
  { value: "DK", label: "Denmark" },
  { value: "SE", label: "Sweden" },
  { value: "FI", label: "Finland" },
  { value: "NL", label: "Netherlands" },
  { value: "PL", label: "Poland" },
  { value: "FR", label: "France" },
  { value: "ES", label: "Spain" },
  { value: "CZ", label: "Czechia" },
  { value: "AT", label: "Austria" },
] as const;

export function regionLabel(v: string): string {
  return REGIONS.find((r) => r.value === v)?.label ?? v;
}
