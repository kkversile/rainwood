'use client';

import AgentProfile from '../../../components/AgentProfile';
import { AgentWorkspace } from '../../../components/AgentData';

export default function AgentProfilePage() {
  return <AgentWorkspace title="My Profile">{() => <AgentProfile />}</AgentWorkspace>;
}
