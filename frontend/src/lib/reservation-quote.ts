export type ReservationHold = {
  token: string;
  expiresAt: string;
  lines: { quotedTotal: number | string; quotedTax: number | string; quotedBreakdown?: unknown }[];
};

export function normalizeReservationHold(hold: ReservationHold) {
  if (!hold.token || !Number.isFinite(new Date(hold.expiresAt).getTime()) || !hold.lines?.length) throw new Error('The reservation quote is incomplete. Recheck availability and price.');
  const amount = (value: number | string) => {
    if (value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error('The reservation quote contains an invalid amount. Recheck availability and price.');
    return Number(value);
  };
  // Persisted line totals already include rooms, nights and tax.
  const quotedTotal = Number(hold.lines.reduce((sum, line) => sum + amount(line.quotedTotal), 0).toFixed(2));
  const quotedTax = Number(hold.lines.reduce((sum, line) => sum + amount(line.quotedTax), 0).toFixed(2));
  return { ...hold, quotedTotal, quotedTax };
}
