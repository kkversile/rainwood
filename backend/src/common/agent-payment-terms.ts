import { BadRequestException } from '@nestjs/common';
import { AgentPaymentPolicy, PaymentMilestoneDueType } from '@prisma/client';

export type PaymentMilestoneInput = {
  percentage: unknown;
  dueType: PaymentMilestoneDueType | string;
  daysBeforeCheckIn?: unknown;
  sortOrder?: unknown;
};

export type PaymentMilestone = {
  percentage: number;
  dueType: PaymentMilestoneDueType;
  daysBeforeCheckIn: number | null;
  sortOrder: number;
};

export type AgentTermsInput = {
  agentPaymentPolicy?: AgentPaymentPolicy | string | null;
  bookingPaymentPercent?: unknown;
  paymentMilestones?: PaymentMilestoneInput[] | PaymentMilestone[] | null;
};

export type ConcretePaymentMilestone = PaymentMilestone & {
  amount: number;
  dueAt: string;
  dueNow: boolean;
};

export type AgentBookingPaymentTerms = {
  policy: AgentPaymentPolicy | 'MILESTONES';
  percentage: number | null;
  requiredAtBooking: number;
  balanceAtBooking: number;
  milestones: ConcretePaymentMilestone[];
};

export type ReservationMilestoneStatus = 'PAID' | 'PARTIALLY_PAID' | 'DUE' | 'UPCOMING';

export type ReservationPaymentScheduleItem = ConcretePaymentMilestone & {
  paidAmount: number;
  outstandingAmount: number;
  status: ReservationMilestoneStatus;
};

export type ReservationPaymentSchedule = {
  milestones: ReservationPaymentScheduleItem[];
  paidAmount: number;
  outstandingAmount: number;
};

const CENTS_PER_PERCENT = 100;

function numberValue(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new BadRequestException(`${field} must be a number`);
  return parsed;
}

export function legacyPaymentMilestones(input: AgentTermsInput): PaymentMilestone[] {
  if (input.agentPaymentPolicy === AgentPaymentPolicy.CREDIT) return [{ percentage: 100, dueType: PaymentMilestoneDueType.DAYS_BEFORE_CHECKIN, daysBeforeCheckIn: 0, sortOrder: 0 }];
  const percentage = numberValue(input.bookingPaymentPercent, 'bookingPaymentPercent');
  if (percentage === 100) return [{ percentage: 100, dueType: PaymentMilestoneDueType.ON_BOOKING, daysBeforeCheckIn: null, sortOrder: 0 }];
  return [
    { percentage, dueType: PaymentMilestoneDueType.ON_BOOKING, daysBeforeCheckIn: null, sortOrder: 0 },
    { percentage: 100 - percentage, dueType: PaymentMilestoneDueType.DAYS_BEFORE_CHECKIN, daysBeforeCheckIn: 0, sortOrder: 1 },
  ];
}

export function validatePaymentMilestones(input: PaymentMilestoneInput[] | PaymentMilestone[] | null | undefined): PaymentMilestone[] {
  if (!Array.isArray(input) || input.length === 0) throw new BadRequestException('At least one payment milestone is required');
  const merged = new Map<string, PaymentMilestone>();
  for (const [index, item] of input.entries()) {
    const percentage = numberValue(item.percentage, `milestones[${index}].percentage`);
    if (percentage <= 0 || percentage > 100) throw new BadRequestException(`milestones[${index}].percentage must be greater than 0 and no more than 100`);
    const dueType = item.dueType as PaymentMilestoneDueType;
    if (!Object.values(PaymentMilestoneDueType).includes(dueType)) throw new BadRequestException(`milestones[${index}].dueType is invalid`);
    let daysBeforeCheckIn: number | null = null;
    if (dueType === PaymentMilestoneDueType.ON_BOOKING) {
      if (item.daysBeforeCheckIn !== undefined && item.daysBeforeCheckIn !== null && item.daysBeforeCheckIn !== '') throw new BadRequestException(`milestones[${index}].daysBeforeCheckIn must be empty for On Booking`);
    } else {
      if (item.daysBeforeCheckIn === undefined || item.daysBeforeCheckIn === null || item.daysBeforeCheckIn === '') throw new BadRequestException(`milestones[${index}].daysBeforeCheckIn is required before check-in`);
      daysBeforeCheckIn = numberValue(item.daysBeforeCheckIn, `milestones[${index}].daysBeforeCheckIn`);
      if (!Number.isInteger(daysBeforeCheckIn) || daysBeforeCheckIn < 0) throw new BadRequestException(`milestones[${index}].daysBeforeCheckIn must be a non-negative integer`);
    }
    const key = dueType === PaymentMilestoneDueType.ON_BOOKING ? dueType : `${dueType}:${daysBeforeCheckIn}`;
    const current = merged.get(key);
    if (current) current.percentage = Math.round((current.percentage + percentage) * CENTS_PER_PERCENT) / CENTS_PER_PERCENT;
    else merged.set(key, { percentage: Math.round(percentage * CENTS_PER_PERCENT) / CENTS_PER_PERCENT, dueType, daysBeforeCheckIn, sortOrder: merged.size });
  }
  const normalized = [...merged.values()];
  const total = normalized.reduce((sum, item) => sum + Math.round(item.percentage * CENTS_PER_PERCENT), 0);
  if (total !== 100 * CENTS_PER_PERCENT) throw new BadRequestException(`Payment milestones must total exactly 100%; current total is ${(total / CENTS_PER_PERCENT).toFixed(2)}%`);
  return normalized;
}

export function paymentMilestonesForAgent(input: AgentTermsInput): PaymentMilestone[] {
  if (input.paymentMilestones?.length) return validatePaymentMilestones(input.paymentMilestones);
  if (input.agentPaymentPolicy) return validatePaymentMilestones(legacyPaymentMilestones(input));
  throw new BadRequestException('Payment terms are required for an active agent');
}

export function hasPaymentMilestones(input: AgentTermsInput) {
  return Array.isArray(input.paymentMilestones) && input.paymentMilestones.length > 0;
}

function dateAtUtcStart(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function cents(value: number) { return Math.round(value * 100); }

export function calculateAgentPaymentSchedule(total: number, checkIn: Date | string, createdAt: Date = new Date(), milestones: PaymentMilestoneInput[] | PaymentMilestone[] = []) {
  const normalized = validatePaymentMilestones(milestones);
  const totalCents = cents(Math.max(0, Number(total)));
  const amounts = normalized.map((item) => Math.floor(totalCents * Math.round(item.percentage * CENTS_PER_PERCENT) / (100 * CENTS_PER_PERCENT)));
  const allocated = amounts.reduce((sum, amount) => sum + amount, 0);
  if (amounts.length) amounts[amounts.length - 1] += totalCents - allocated;
  const checkInStart = dateAtUtcStart(checkIn);
  const bookingTime = createdAt.getTime();
  const schedule = normalized.map((item, index) => {
    const dueAt = item.dueType === PaymentMilestoneDueType.ON_BOOKING ? createdAt : new Date(checkInStart.getTime() - Number(item.daysBeforeCheckIn) * 86_400_000);
    return { ...item, amount: amounts[index] / 100, dueAt: dueAt.toISOString(), dueNow: dueAt.getTime() <= bookingTime };
  });
  const requiredAtBooking = schedule.filter((item) => item.dueNow).reduce((sum, item) => sum + item.amount, 0);
  return { schedule, requiredAtBooking: Math.round(requiredAtBooking * 100) / 100, balanceAtBooking: Math.round((totalCents / 100 - requiredAtBooking) * 100) / 100 };
}

export function validateAgentPaymentTerms(input: AgentTermsInput, _allowUiOnly = false) {
  const policy = input.agentPaymentPolicy;
  const percentage = input.bookingPaymentPercent == null ? null : Number(input.bookingPaymentPercent);
  if (!policy) throw new BadRequestException('Payment terms are required for an active agent');
  if (policy === AgentPaymentPolicy.CREDIT) return { policy, percentage: null };
  if (percentage == null || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) throw new BadRequestException('Percentage payment terms must be greater than 0 and no more than 100');
  return { policy, percentage };
}

export function calculateAgentBookingPaymentTerms(total: number, input: AgentTermsInput, checkIn?: Date | string, createdAt = new Date()): AgentBookingPaymentTerms {
  const milestones = paymentMilestonesForAgent(input);
  const referenceCheckIn = checkIn ?? new Date(createdAt.getTime() + 86_400_000);
  const result = calculateAgentPaymentSchedule(total, referenceCheckIn, createdAt, milestones);
  const policy = input.agentPaymentPolicy ? input.agentPaymentPolicy as AgentPaymentPolicy : 'MILESTONES';
  const legacyPercentage = input.bookingPaymentPercent == null ? null : Number(input.bookingPaymentPercent);
  return { policy, percentage: legacyPercentage, requiredAtBooking: result.requiredAtBooking, balanceAtBooking: result.balanceAtBooking, milestones: result.schedule };
}

/**
 * Allocate the reservation's verified payments against its immutable snapshot.
 * The oldest due point is always filled first; no future point is auto-paid.
 */
export function calculateReservationPaymentSchedule(snapshot: unknown, verifiedPaid: number, now = new Date()): ReservationPaymentSchedule {
  const raw = snapshot && typeof snapshot === 'object' ? (snapshot as { milestones?: unknown }).milestones : undefined;
  const source = Array.isArray(raw) ? raw : [];
  const ordered = source.map((item, index) => {
    const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const dueAt = String(value.dueAt ?? '');
    const dueDate = new Date(dueAt);
    return {
      percentage: Number(value.percentage ?? 0),
      dueType: value.dueType as PaymentMilestoneDueType,
      daysBeforeCheckIn: value.daysBeforeCheckIn == null ? null : Number(value.daysBeforeCheckIn),
      sortOrder: Number(value.sortOrder ?? index),
      amount: Math.max(0, Number(value.amount ?? 0)),
      dueAt,
      dueNow: dueDate.getTime() <= now.getTime(),
      index,
      dueTime: Number.isNaN(dueDate.getTime()) ? Number.MAX_SAFE_INTEGER : dueDate.getTime(),
    };
  }).sort((a, b) => a.dueTime - b.dueTime || a.sortOrder - b.sortOrder || a.index - b.index);

  let remainingPaid = Math.max(0, Number(verifiedPaid) || 0);
  const milestones = ordered.map((item) => {
    const paidAmount = Math.min(item.amount, remainingPaid);
    remainingPaid = Math.max(0, remainingPaid - paidAmount);
    const outstandingAmount = Math.max(0, item.amount - paidAmount);
    const status: ReservationMilestoneStatus = paidAmount >= item.amount - 0.005
      ? 'PAID'
      : paidAmount > 0
        ? 'PARTIALLY_PAID'
        : item.dueNow
          ? 'DUE'
          : 'UPCOMING';
    const { index: _index, dueTime: _dueTime, ...result } = item;
    return { ...result, paidAmount, outstandingAmount, status };
  });
  const paidAmount = milestones.reduce((sum, item) => sum + item.paidAmount, 0);
  const outstandingAmount = milestones.reduce((sum, item) => sum + item.outstandingAmount, 0);
  return { milestones, paidAmount, outstandingAmount };
}
