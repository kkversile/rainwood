import { financialYearFor, hotelLocalDate, resolvePlaceOfSupply, TaxCalculationService } from './tax-calculation.service';

describe('TaxCalculationService', () => {
  const service = new TaxCalculationService();

  it('splits intra-state GST in paise-safe amounts', () => {
    expect(service.calculate([{ taxableAmount: 999.99, ratePercent: 18 }], '32', '32')).toEqual({ taxableAmount: 999.99, cgstAmount: 90, sgstAmount: 90, igstAmount: 0, grandTotal: 1179.99 });
  });

  it('uses IGST only when a valid interstate place of supply is provided', () => {
    expect(service.calculateLine({ taxableAmount: 1000, ratePercent: 5 }, '32', '29')).toMatchObject({ cgstAmount: 0, sgstAmount: 0, igstAmount: 50, lineTotal: 1050 });
    expect(() => service.calculateLine({ taxableAmount: 1000, ratePercent: 5 }, '32', undefined)).toThrow('Customer/billing state code is required');
  });

  it('reconciles line totals to invoice totals', () => {
    const lines = service.calculate([{ taxableAmount: 100.01, ratePercent: 18 }, { taxableAmount: 200.02, ratePercent: 12 }], '32', '32');
    expect(lines.taxableAmount).toBe(300.03);
    expect(lines.grandTotal).toBe(342.03);
    expect(lines.cgstAmount + lines.sgstAmount + lines.igstAmount + lines.taxableAmount).toBe(lines.grandTotal);
  });

  it('preserves a finalized tax amount instead of recalculating payable total', () => {
    expect(service.calculateFinalizedLine({ taxableAmount: 10000, taxAmount: 1800, ratePercent: 99 }, '32', '32')).toMatchObject({ taxableAmount: 10000, cgstAmount: 900, sgstAmount: 900, lineTotal: 11800 });
  });

  it('resolves local financial year at hotel timezone boundaries', () => {
    const localDate = hotelLocalDate(new Date('2027-03-31T20:00:00.000Z'), 'Asia/Kolkata');
    expect(localDate.toISOString().slice(0, 10)).toBe('2027-04-01');
    expect(financialYearFor(localDate)).toEqual({ label: '2027-28', sequenceYear: 2027 });
    expect(() => resolvePlaceOfSupply({ supplierStateCode: '32' })).toThrow('Customer/billing state code is required');
  });
});
