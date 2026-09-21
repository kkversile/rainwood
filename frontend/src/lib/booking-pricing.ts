import type { AvailabilityOption, ReservationSummary } from './types';

export type PriceSummary = {
  roomCharges: number;
  extraGuestCharges: number;
  tax: number;
  total: number;
  supplementaryCharges: { id: string; name: string; amount: number }[];
};

export function aggregatePriceBreakdown(option: Pick<AvailabilityOption, 'priceBreakdown' | 'total' | 'taxTotal'>): PriceSummary {
  const charges = new Map<string, { id: string; name: string; amount: number }>();
  let roomCharges = 0;
  let extraGuestCharges = 0;
  let tax = 0;
  for (const night of option.priceBreakdown ?? []) {
    roomCharges += Number(night.baseAmount ?? 0);
    extraGuestCharges += Number(night.extrasAmount ?? 0);
    tax += Number(night.taxAmount ?? 0);
    for (const charge of night.supplementaryCharges ?? []) {
      const key = charge.id || charge.name;
      const current = charges.get(key) ?? { id: key, name: charge.name, amount: 0 };
      current.amount += Number(charge.amount ?? 0);
      charges.set(key, current);
    }
  }
  return { roomCharges, extraGuestCharges, tax: tax || Number(option.taxTotal ?? 0), total: Number(option.total), supplementaryCharges: [...charges.values()].map((charge) => ({ ...charge, amount: Math.round(charge.amount * 100) / 100 })) };
}

export function agentPaymentConfirmation(reservation: Pick<ReservationSummary, 'advanceAmount' | 'balanceAmount' | 'totalAmount' | 'paymentStatus' | 'paymentTermsSnapshot'>): string {
  const advance = Number(reservation.advanceAmount);
  const balance = Number(reservation.balanceAmount);
  if (reservation.paymentTermsSnapshot?.policy === 'CREDIT' || (advance === 0 && balance > 0 && reservation.paymentStatus === 'UNPAID')) return `Booking confirmed on credit. INR ${balance.toFixed(2)} remains outstanding and is due at check-in.`;
  if (balance <= 0) return `INR ${advance.toFixed(2)} was deducted from your agent wallet. The booking is fully paid.`;
  return `INR ${advance.toFixed(2)} was deducted from your agent wallet. INR ${balance.toFixed(2)} remains due at check-in.`;
}

export function agentStatusLabel(active: boolean, policy: string | null | undefined) {
  if (active) return 'Active';
  return policy ? 'Deactivated' : 'Pending Approval';
}

export function isLegacyFullPaymentAgent(policy: string | null | undefined, percent: number | string | null | undefined) {
  return policy === 'PERCENTAGE' && Number(percent) === 100;
}

export function showLegacyFullPaymentOption(policy: string | null | undefined, percent: number | string | null | undefined, selected: string) {
  return isLegacyFullPaymentAgent(policy, percent) && selected === '100';
}

export function hasUsableDocumentFile(fileId?: string | null) {
  return Boolean(fileId?.trim());
}
