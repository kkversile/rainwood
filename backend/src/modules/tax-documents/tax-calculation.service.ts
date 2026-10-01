import { Injectable } from '@nestjs/common';

export type TaxLineInput = { taxableAmount: number; ratePercent: number };
export type TaxLineResult = TaxLineInput & { cgstAmount: number; sgstAmount: number; igstAmount: number; lineTotal: number; cgstRate: number; sgstRate: number; igstRate: number };

const cents = (value: number) => Math.round((Number(value) || 0) * 100);
const money = (value: number) => Number((value / 100).toFixed(2));

/** All tax arithmetic is performed in integer paise to make rounding deterministic. */
@Injectable()
export class TaxCalculationService {
  calculateLine(input: TaxLineInput, hotelStateCode?: string | null, customerStateCode?: string | null): TaxLineResult {
    const taxable = cents(input.taxableAmount);
    const rate = Number(input.ratePercent) || 0;
    const tax = Math.round(taxable * rate / 100);
    const intraState = Boolean(hotelStateCode && customerStateCode && hotelStateCode.trim().toUpperCase() === customerStateCode.trim().toUpperCase());
    const cgst = intraState ? Math.floor(tax / 2) : 0;
    const sgst = intraState ? tax - cgst : 0;
    const igst = intraState ? 0 : tax;
    return {
      taxableAmount: money(taxable),
      ratePercent: rate,
      cgstAmount: money(cgst),
      sgstAmount: money(sgst),
      igstAmount: money(igst),
      lineTotal: money(taxable + tax),
      cgstRate: intraState ? rate / 2 : 0,
      sgstRate: intraState ? rate / 2 : 0,
      igstRate: intraState ? 0 : rate,
    };
  }

  calculate(lines: TaxLineInput[], hotelStateCode?: string | null, customerStateCode?: string | null) {
    const calculated = lines.map((line) => this.calculateLine(line, hotelStateCode, customerStateCode));
    return calculated.reduce((total, line) => ({
      taxableAmount: money(cents(total.taxableAmount) + cents(line.taxableAmount)),
      cgstAmount: money(cents(total.cgstAmount) + cents(line.cgstAmount)),
      sgstAmount: money(cents(total.sgstAmount) + cents(line.sgstAmount)),
      igstAmount: money(cents(total.igstAmount) + cents(line.igstAmount)),
      grandTotal: money(cents(total.grandTotal) + cents(line.lineTotal)),
    }), { taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, grandTotal: 0 });
  }
}

export function financialYearFor(date: Date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const start = month >= 4 ? year : year - 1;
  return { label: `${start}-${String((start + 1) % 100).padStart(2, '0')}`, sequenceYear: start };
}

export function dateOnly(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
