'use client';

import { AgentWorkspace } from '../../../../components/AgentData';
import AgentProfile from '../../../../components/AgentProfile';

export default function AgentCompanyProfilePage() { return <AgentWorkspace title="Company Profile">{() => <AgentProfile />}</AgentWorkspace>; }
