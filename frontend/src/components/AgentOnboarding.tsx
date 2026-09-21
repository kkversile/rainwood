'use client';

import Link from 'next/link';
import type { AgentUser } from './AgentData';
import { onboardingStatusLabel } from '../lib/agent-onboarding';

export default function AgentOnboarding({ user }: { user: AgentUser }) {
  const submitted = user.kycSummary.uploaded > 0;
  const verified = submitted && user.kycSummary.rejected === 0 && user.kycSummary.pending === 0;
  const statusClass = user.onboardingStatus === 'ACTIVE' ? 'ok' : 'warn';
  return <section className="agentOnboardingPanel">
    <div className="agentOnboardingHero">
      <span className={`status ${statusClass}`}>{onboardingStatusLabel(user.onboardingStatus)}</span>
      <h2>Welcome{user.companyName ? `, ${user.companyName}` : ''}</h2>
      <p>{user.onboardingStatus === 'KYC_PENDING' ? 'Complete your onboarding so our team can review and enable hotel and booking access.' : 'Your onboarding documents are with our team. You can update your profile while your application is being reviewed.'}</p>
    </div>
    <div className="agentOnboardingSteps">
      <div className="agentOnboardingStep done"><b>✓</b><span>Registration details</span></div>
      <div className={`agentOnboardingStep${submitted ? ' done' : ''}`}><b>{submitted ? '✓' : '○'}</b><span>Upload KYC documents</span></div>
      <div className={`agentOnboardingStep${verified ? ' done' : ''}`}><b>{verified ? '✓' : '○'}</b><span>Admin verification</span></div>
      <div className={`agentOnboardingStep${user.onboardingStatus === 'ACTIVE' ? ' done' : ''}`}><b>{user.onboardingStatus === 'ACTIVE' ? '✓' : '○'}</b><span>Commercial approval</span></div>
    </div>
    {user.onboardingStatus === 'ACTIVE' ? <div className="agentOnboardingActions"><p>Your account is active. Hotel, availability, booking, and wallet access are enabled.</p><Link className="btn" href="/agent/book">Create booking</Link></div> : <div className="agentOnboardingActions"><p>Hotel and booking access will be enabled after Admin approval.</p><div className="rowActions"><Link className="btn" href="/agent/kyc">{submitted ? 'Review KYC' : 'Complete KYC'}</Link><Link className="btn secondary" href="/agent/profile">Update profile</Link></div></div>}
  </section>;
}
