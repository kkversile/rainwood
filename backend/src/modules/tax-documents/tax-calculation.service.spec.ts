import { TaxCalculationService } from './tax-calculation.service';

describe('TaxCalculationService', () => {
  const service = new TaxCalculationService();

  it('splits intra-state GST in paise-safe amounts', () => {
    expect(service.calculate([{ taxableAmount: 999.99, ratePercent: 18 }], '32', '32')).toEqual({ taxableAmount: 999.99, cgstAmount: 90, sgstAmount: 90, igstAmount: 0, grandTotal: 1179.99 });
  });

  it('uses IGST when place of supply is interstate or unavailable', () => {
    expect(service.calculateLine({ taxableAmount: 1000, ratePercent: 5 }, '32', '29')).toMatchObject({ cgstAmount: 0, sgstAmount: 0, igstAmount: 50, lineTotal: 1050 });
    expect(service.calculateLine({ taxableAmount: 1000, ratePercent: 5 }, '32', undefined)).toMatchObject({ cgstAmount: 0, sgstAmount: 0, igstAmount: 50 });
  });

  it('reconciles line totals to invoice totals', () => {
    const lines = service.calculate([{ taxableAmount: 100.01, ratePercent: 18 }, { taxableAmount: 200.02, ratePercent: 12 }], '32', '32');
    expect(lines.taxableAmount).toBe(300.03);
    expect(lines.grandTotal).toBe(342.03);
    expect(lines.cgstAmount + lines.sgstAmount + lines.igstAmount + lines.taxableAmount).toBe(lines.grandTotal);
  });
});
