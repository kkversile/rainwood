import { calculateStatutoryReceivable } from './statutory-receivables';

describe('calculateStatutoryReceivable', () => {
  it('subtracts verified payments, issued credits and non-reversed TDS once', () => {
    expect(calculateStatutoryReceivable({ grandTotal: 100000, creditNotes: [], tdsDeductions: [], reservation: { payments: [{ amount: 98000, verified: true }, { amount: 1000, verified: false }] } })).toMatchObject({ invoiceAmount: 100000, verifiedPayments: 98000, outstanding: 2000, overApplied: false });
  });

  it('diagnoses an over-applied receivable instead of clamping to zero', () => {
    expect(calculateStatutoryReceivable({ grandTotal: 100000, creditNotes: [{ grandTotal: 1000, status: 'ISSUED' }], tdsDeductions: [{ tdsAmount: 500, status: 'CERTIFICATE_PENDING' }], reservation: { payments: [{ amount: 99000, verified: true }] } })).toMatchObject({ outstanding: -500, overApplied: true, diagnostic: 'OVER_APPLIED_RECEIVABLE' });
  });
});
