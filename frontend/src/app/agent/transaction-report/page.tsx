'use client';

import { AgentWorkspace } from '../../../components/AgentData';
import { AgentWalletReport } from '../../../components/AgentReports';

export default function AgentTransactionReportPage() {
  return <AgentWorkspace title="Transaction Report">{() => <AgentWalletReport mode="transactions" />}</AgentWorkspace>;
}
