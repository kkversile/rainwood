'use client';

import AgentKyc from '../../../components/AgentKyc';
import { AgentWorkspace } from '../../../components/AgentData';

export default function AgentKycPage() {
  return <AgentWorkspace title="Business Documents">{() => <AgentKyc />}</AgentWorkspace>;
}
