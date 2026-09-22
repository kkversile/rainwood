import type { AvailabilityOption, ReservationSummary } from './types';

export type PaymentMilestoneView = { percentage: number | string; dueType: 'ON_BOOKING' | 'DAYS_BEFORE_CHECKIN'; daysBeforeCheckIn?: number | null };

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
  if (!reservation.paymentTermsSnapshot) return balance <= 0 ? `Payment of INR ${advance.toFixed(2)} was received. The booking is fully paid.` : `INR ${advance.toFixed(2)} was received. INR ${balance.toFixed(2)} remains payable.`;
  if (reservation.paymentTermsSnapshot.policy === 'CREDIT') return `Booking confirmed on credit. INR ${balance.toFixed(2)} remains outstanding according to the saved payment schedule.`;
  if (advance === 0 && balance > 0 && reservation.paymentStatus === 'UNPAID') return `Booking confirmed with no wallet debit today. INR ${balance.toFixed(2)} remains payable according to the saved payment schedule.`;
  if (balance <= 0) return `INR ${advance.toFixed(2)} was deducted from your agent wallet. The booking is fully paid.`;
  return `INR ${advance.toFixed(2)} was deducted from your agent wallet. INR ${balance.toFixed(2)} remains payable according to the saved payment schedule.`;
}

export function dueNowForAgentBooking(total: number, checkIn: string, milestones: PaymentMilestoneView[] | undefined, createdAt = new Date()) {
  if (!milestones?.length) return Math.round(Number(total) * 100) / 100;
  const totalCents = Math.max(0, Math.round(Number(total) * 100));
  const amounts = milestones.map((item) => Math.floor(totalCents * Math.round(Number(item.percentage) * 100) / 10000));
  if (amounts.length) amounts[amounts.length - 1] += totalCents - amounts.reduce((sum, amount) => sum + amount, 0);
  const checkInStart = new Date(`${checkIn.slice(0, 10)}T00:00:00.000Z`).getTime();
  const due = milestones.reduce((sum, item, index) => {
    const dueAt = item.dueType === 'ON_BOOKING' ? createdAt.getTime() : checkInStart - Number(item.daysBeforeCheckIn ?? 0) * 86_400_000;
    return sum + (dueAt <= createdAt.getTime() ? amounts[index] : 0);
  }, 0);
  return due / 100;
}

export function paymentMilestoneLabel(item: PaymentMilestoneView) {
  if (item.dueType === 'ON_BOOKING') return `${Number(item.percentage)}% · On Booking`;
  return `${Number(item.percentage)}% · ${Number(item.daysBeforeCheckIn) === 0 ? 'Check-in' : `${Number(item.daysBeforeCheckIn)} days`}`;
}

export function agentStatusLabel(active: boolean, policy: string | null | undefined, kycSubmitted = false) {
  if (active) return 'Active';
  return policy ? 'Deactivated' : kycSubmitted ? 'Under Review' : 'KYC Pending';
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
