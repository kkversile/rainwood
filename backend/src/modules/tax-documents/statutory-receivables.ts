const amount = (value: unknown) => Number(Number(value ?? 0).toFixed(2));

export type StatutoryReceivable = {
  invoiceAmount: number;
  creditNotes: number;
  verifiedPayments: number;
  existingTds: number;
  appliedAmount: number;
  outstanding: number;
  overApplied: boolean;
  diagnostic: 'OVER_APPLIED_RECEIVABLE' | null;
};

/** One formula shared by TDS validation, receivables, aging and the UI. */
export function calculateStatutoryReceivable(invoice: any): StatutoryReceivable {
  const invoiceAmount = amount(invoice.grandTotal);
  const creditNotes = (invoice.creditNotes ?? []).filter((row: any) => row.status === undefined || row.status === 'ISSUED').reduce((sum: number, row: any) => sum + amount(row.grandTotal), 0);
  const payments = invoice.reservation?.payments ?? invoice.payments ?? [];
  const verifiedPayments = payments.filter((row: any) => row.verified === true).reduce((sum: number, row: any) => sum + amount(row.amount), 0);
  const existingTds = (invoice.tdsDeductions ?? []).filter((row: any) => row.status !== 'REVERSED').reduce((sum: number, row: any) => sum + amount(row.tdsAmount), 0);
  const appliedAmount = amount(creditNotes + verifiedPayments + existingTds);
  const outstanding = amount(invoiceAmount - appliedAmount);
  const overApplied = outstanding < -0.005;
  return { invoiceAmount, creditNotes: amount(creditNotes), verifiedPayments: amount(verifiedPayments), existingTds: amount(existingTds), appliedAmount, outstanding, overApplied, diagnostic: overApplied ? 'OVER_APPLIED_RECEIVABLE' : null };
}

export function assertReceivableIntegrity(value: StatutoryReceivable) {
  if (value.overApplied) throw new Error(`${value.diagnostic}: statutory adjustments exceed invoice amount by ${Math.abs(value.outstanding).toFixed(2)}.`);
  return value;
}
