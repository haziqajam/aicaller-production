export function pacingSummary(p: {
  leadCount: number;
  fromNumber: string;
  assistantName: string;
  concurrency: number;
  delayBetweenCalls: number;
  maxCallDuration: number;
}): string {
  const leads = p.leadCount.toLocaleString("en-US");
  const cap = Math.round(p.maxCallDuration / 60);
  return (
    `Will call ${leads} leads from ${p.fromNumber} using ${p.assistantName}, ` +
    `${p.concurrency} concurrent, ${p.delayBetweenCalls}s apart, ${cap}-min cap.`
  );
}
