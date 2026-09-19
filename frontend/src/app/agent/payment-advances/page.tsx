'use client';

import { AgentWorkspace } from '../../../components/AgentData';
import { AgentWalletReport } from '../../../components/AgentReports';

export default function AgentPaymentAdvancesPage() {
  return <AgentWorkspace title="Payment Advances">{() => <AgentWalletReport mode="advances" />}</AgentWorkspace>;
}
