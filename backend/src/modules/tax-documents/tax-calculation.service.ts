import { Injectable } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { getHotelOperationalDate } from '../../common/hotel-dates';

export type TaxLineInput = { taxableAmount: number; ratePercent: number };
export type TaxLineResult = TaxLineInput & { cgstAmount: number; sgstAmount: number; igstAmount: number; lineTotal: number; cgstRate: number; sgstRate: number; igstRate: number };
export type PlaceOfSupply = { supplierStateCode: string; customerStateCode: string; taxMode: 'INTRA_STATE' | 'INTER_STATE' };

const cents = (value: number) => Math.round((Number(value) || 0) * 100);
const money = (value: number) => Number((value / 100).toFixed(2));

export function normalizeGstin(value?: string | null) {
  return value?.trim().toUpperCase() || null;
}

/** Resolve GST mode once; missing place-of-supply data is never treated as IGST. */
export function resolvePlaceOfSupply(input: { supplierStateCode?: string | null; customerStateCode?: string | null; explicitBillingStateCode?: string | null }): PlaceOfSupply {
  const supplierStateCode = input.supplierStateCode?.trim().toUpperCase();
  const customerStateCode = (input.explicitBillingStateCode ?? input.customerStateCode)?.trim().toUpperCase();
  if (!supplierStateCode) throw new BadRequestException('Supplier state code is required to resolve place of supply.');
  if (!customerStateCode) throw new BadRequestException('Customer/billing state code is required to resolve place of supply.');
  return { supplierStateCode, customerStateCode, taxMode: supplierStateCode === customerStateCode ? 'INTRA_STATE' : 'INTER_STATE' };
}

/** All tax arithmetic is performed in integer paise to make rounding deterministic. */
@Injectable()
export class TaxCalculationService {
  calculateLine(input: TaxLineInput, hotelStateCode?: string | null, customerStateCode?: string | null): TaxLineResult {
    const taxable = cents(input.taxableAmount);
    const rate = Number(input.ratePercent) || 0;
    const tax = Math.round(taxable * rate / 100);
    const placeOfSupply = resolvePlaceOfSupply({ supplierStateCode: hotelStateCode, customerStateCode });
    const intraState = placeOfSupply.taxMode === 'INTRA_STATE';
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

  /** Split already-finalized tax without recalculating or changing the payable amount. */
  calculateFinalizedLine(input: TaxLineInput & { taxAmount: number }, hotelStateCode?: string | null, customerStateCode?: string | null): TaxLineResult {
    const taxable = cents(input.taxableAmount);
    const tax = cents(input.taxAmount);
    const placeOfSupply = resolvePlaceOfSupply({ supplierStateCode: hotelStateCode, customerStateCode });
    const intraState = placeOfSupply.taxMode === 'INTRA_STATE';
    const cgst = intraState ? Math.floor(tax / 2) : 0;
    const sgst = intraState ? tax - cgst : 0;
    const igst = intraState ? 0 : tax;
    const ratePercent = taxable ? Number(((tax / taxable) * 100).toFixed(2)) : 0;
    return {
      taxableAmount: money(taxable), ratePercent,
      cgstAmount: money(cgst), sgstAmount: money(sgst), igstAmount: money(igst),
      lineTotal: money(taxable + tax),
      cgstRate: intraState ? ratePercent / 2 : 0,
      sgstRate: intraState ? ratePercent / 2 : 0,
      igstRate: intraState ? 0 : ratePercent,
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

export function hotelLocalDate(value: Date | string, timezoneName: string) {
  const instant = value instanceof Date ? value : new Date(value);
  return getHotelOperationalDate(timezoneName, instant);
}

export function dateOnly(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
