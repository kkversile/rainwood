/** The single pre-checkout financial calculation used by checkout preview,
 * checkout, and corporate receivables. */
export function calculateSettlementTotals(reservation: any) {
  const reservationAmount = Number(reservation.totalAmount ?? 0);
  const incidentalAmount = (reservation.folioCharges ?? []).reduce((sum: number, charge: any) => sum + Number(charge.totalAmount ?? 0), 0);
  const paidAmount = (reservation.payments ?? []).filter((payment: any) => payment.verified !== false).reduce((sum: number, payment: any) => sum + Number(payment.amount ?? 0), 0);
  const grossAmount = Number((reservationAmount + incidentalAmount).toFixed(2));
  const outstandingAmount = Math.max(Number((grossAmount - paidAmount).toFixed(2)), 0);
  return { reservationAmount, incidentalAmount, taxAmount: 0, paidAmount, grossAmount, outstandingAmount };
}

export function authoritativeReceivable(reservation: any) {
  if (reservation.settlement) {
    return {
      gross: Number(reservation.settlement.grossAmount),
      paid: Number(reservation.settlement.paidAmount),
      outstanding: Number(reservation.settlement.balanceAmount),
      settlementStatus: reservation.settlement.status,
      source: 'FINAL_SETTLEMENT',
    };
  }
  const totals = calculateSettlementTotals(reservation);
  return { gross: totals.grossAmount, paid: totals.paidAmount, outstanding: totals.outstandingAmount, settlementStatus: 'OPEN', source: 'CHECKOUT_PREVIEW' };
}
