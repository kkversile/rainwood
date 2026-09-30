import { authoritativeReceivable, calculateSettlementTotals } from './settlement-totals';

describe('settlement totals used by checkout and corporate receivables', () => {
  it('includes posted incidentals and verified payments before checkout', () => {
    expect(calculateSettlementTotals({ totalAmount: 1000, folioCharges: [{ totalAmount: 250 }], payments: [{ amount: 400, verified: true }, { amount: 50, verified: false }] })).toEqual(expect.objectContaining({ grossAmount: 1250, paidAmount: 400, outstandingAmount: 850 }));
  });

  it('uses finalized settlement values including retained company credit', () => {
    expect(authoritativeReceivable({ totalAmount: 1000, settlement: { status: 'PARTIAL', grossAmount: 1250, paidAmount: 400, balanceAmount: 850 } })).toEqual({ gross: 1250, paid: 400, outstanding: 850, settlementStatus: 'PARTIAL', source: 'FINAL_SETTLEMENT' });
  });

  it('reports fully settled reservations at zero outstanding', () => {
    expect(authoritativeReceivable({ settlement: { status: 'SETTLED', grossAmount: 1250, paidAmount: 1250, balanceAmount: 0 } })).toEqual({ gross: 1250, paid: 1250, outstanding: 0, settlementStatus: 'SETTLED', source: 'FINAL_SETTLEMENT' });
  });
});
