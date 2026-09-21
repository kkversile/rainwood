import { BadRequestException } from '@nestjs/common';
import { AgentPaymentPolicy } from '@prisma/client';

export type AgentTermsInput = {
  agentPaymentPolicy?: AgentPaymentPolicy | null;
  bookingPaymentPercent?: unknown;
};

export type AgentBookingPaymentTerms = {
  policy: AgentPaymentPolicy;
  percentage: number | null;
  requiredAtBooking: number;
  balanceAtBooking: number;
};

export function validateAgentPaymentTerms(input: AgentTermsInput, allowUiOnly = false) {
  const policy = input.agentPaymentPolicy;
  const percentage = input.bookingPaymentPercent == null ? null : Number(input.bookingPaymentPercent);
  if (!policy) throw new BadRequestException('Payment terms are required for an active agent');
  if (policy === AgentPaymentPolicy.CREDIT) return { policy, percentage: null };
  if (percentage == null || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) throw new BadRequestException('Percentage payment terms must be greater than 0 and no more than 100');
  if (allowUiOnly && ![25, 50].includes(percentage)) throw new BadRequestException('Choose 25%, 50%, or Credit');
  return { policy, percentage };
}

export function calculateAgentBookingPaymentTerms(total: number, input: AgentTermsInput): AgentBookingPaymentTerms {
  const normalizedTotal = Math.max(0, Math.round(Number(total) * 100) / 100);
  const validated = validateAgentPaymentTerms(input);
  const requiredAtBooking = validated.policy === AgentPaymentPolicy.CREDIT
    ? 0
    : Math.round(normalizedTotal * Number(validated.percentage) / 100 * 100) / 100;
  return {
    policy: validated.policy,
    percentage: validated.percentage,
    requiredAtBooking,
    balanceAtBooking: Math.round((normalizedTotal - requiredAtBooking) * 100) / 100,
  };
}
