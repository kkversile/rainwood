'use client';

import { AgentWorkspace } from '../../../components/AgentData';
import { AgentWalletReport } from '../../../components/AgentReports';

export default function AgentWalletPage() { return <AgentWorkspace title="Wallet">{() => <AgentWalletReport />}</AgentWorkspace>; }
