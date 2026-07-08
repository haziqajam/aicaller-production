export function buildCallQuery(f: { direction: "all" | "inbound" | "outbound" }): string {
  if (f.direction === "all") return "";
  return `?direction=${f.direction}`;
}
