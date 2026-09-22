import { AgentDocumentStatus } from '@prisma/client';

export type AgentOnboardingStatus = 'KYC_PENDING' | 'UNDER_REVIEW' | 'ACTIVE' | 'DEACTIVATED';

export type AgentAccessRecord = {
  role?: string | null;
  active?: boolean | null;
  agentPaymentPolicy?: string | null;
  bookingPaymentPercent?: unknown;
  paymentMilestones?: unknown[] | null;
};

export type KycSummary = {
  uploaded: number;
  verified: number;
  rejected: number;
  pending: number;
};

export function hasAgentPaymentTerms(user?: AgentAccessRecord | null) {
  return Boolean(user?.paymentMilestones?.length) || user?.agentPaymentPolicy != null || user?.bookingPaymentPercent != null;
}

export function isAgentPendingOnboarding(user?: AgentAccessRecord | null) {
  return user?.role === 'AGENT' && user.active === false && !hasAgentPaymentTerms(user);
}

export function isAgentDeactivated(user?: AgentAccessRecord | null) {
  return user?.role === 'AGENT' && user.active === false && hasAgentPaymentTerms(user);
}

export function getAgentOnboardingStatus(user: AgentAccessRecord, kycSummary?: KycSummary): AgentOnboardingStatus {
  if (user.active) return 'ACTIVE';
  if (hasAgentPaymentTerms(user)) return 'DEACTIVATED';
  return kycSummary?.uploaded ? 'UNDER_REVIEW' : 'KYC_PENDING';
}

export function summarizeAgentDocuments(statuses: readonly AgentDocumentStatus[] | readonly string[]): KycSummary {
  return {
    uploaded: statuses.length,
    verified: statuses.filter((status) => status === AgentDocumentStatus.APPROVED).length,
    rejected: statuses.filter((status) => status === AgentDocumentStatus.REJECTED).length,
    pending: statuses.filter((status) => status === AgentDocumentStatus.PENDING).length,
  };
}

export function agentAccessMessage(user: AgentAccessRecord) {
  return isAgentDeactivated(user)
    ? 'Your agent account is deactivated. Please contact support.'
    : 'Your agent account is awaiting approval. Complete KYC and wait for Admin approval before accessing hotel services.';
}
