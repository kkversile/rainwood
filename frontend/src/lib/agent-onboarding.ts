export type AgentOnboardingStatus = 'KYC_PENDING' | 'UNDER_REVIEW' | 'ACTIVE' | 'DEACTIVATED';

export type AgentKycSummary = {
  uploaded: number;
  verified: number;
  rejected: number;
  pending: number;
};

export const onboardingStatusLabels: Record<AgentOnboardingStatus, string> = {
  KYC_PENDING: 'KYC Pending',
  UNDER_REVIEW: 'Under Review',
  ACTIVE: 'Active',
  DEACTIVATED: 'Deactivated',
};

export function onboardingStatusLabel(status: AgentOnboardingStatus) {
  return onboardingStatusLabels[status];
}

export function canPendingAgentVisit(pathname: string) {
  return pathname === '/agent/profile' || pathname === '/agent/kyc' || pathname === '/agent/onboarding';
}
