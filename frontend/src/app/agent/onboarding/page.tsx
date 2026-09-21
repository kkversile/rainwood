'use client';

import AgentOnboarding from '../../../components/AgentOnboarding';
import { AgentWorkspace } from '../../../components/AgentData';

export default function AgentOnboardingPage() {
  return <AgentWorkspace title="Onboarding Status">{(user) => <AgentOnboarding user={user} />}</AgentWorkspace>;
}
