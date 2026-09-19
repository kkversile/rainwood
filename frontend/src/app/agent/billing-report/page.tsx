'use client';

import { AgentWorkspace } from '../../../components/AgentData';
import { AgentBillingReport } from '../../../components/AgentReports';

export default function AgentBillingReportPage() {
  return <AgentWorkspace title="Billing Report">{() => <AgentBillingReport />}</AgentWorkspace>;
}
