import { AgentDocumentStatus } from '@prisma/client';
import { getAgentOnboardingStatus, isAgentDeactivated, isAgentPendingOnboarding, summarizeAgentDocuments } from './agent-access';

describe('agent onboarding access states', () => {
  it('distinguishes pending onboarding, active, and deactivated agents', () => {
    const pending = { role: 'AGENT', active: false, agentPaymentPolicy: null, bookingPaymentPercent: null };
    expect(isAgentPendingOnboarding(pending)).toBe(true);
    expect(getAgentOnboardingStatus(pending, summarizeAgentDocuments([]))).toBe('KYC_PENDING');
    expect(getAgentOnboardingStatus(pending, summarizeAgentDocuments([AgentDocumentStatus.PENDING]))).toBe('UNDER_REVIEW');
    expect(getAgentOnboardingStatus({ ...pending, active: true, agentPaymentPolicy: 'PERCENTAGE', bookingPaymentPercent: 25 })).toBe('ACTIVE');
    const deactivated = { ...pending, agentPaymentPolicy: 'CREDIT' };
    expect(isAgentDeactivated(deactivated)).toBe(true);
    expect(getAgentOnboardingStatus(deactivated)).toBe('DEACTIVATED');
  });

  it('summarizes submitted document statuses', () => {
    expect(summarizeAgentDocuments([AgentDocumentStatus.PENDING, AgentDocumentStatus.APPROVED, AgentDocumentStatus.REJECTED])).toEqual({ uploaded: 3, verified: 1, rejected: 1, pending: 1 });
  });
});
