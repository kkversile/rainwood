'use client';

import { AgentWorkspace } from '../../../../components/AgentData';
import { AgentManageEmployees } from '../../../../components/AgentSettings';

export default function AgentEmployeesPage() { return <AgentWorkspace title="Manage Employee">{() => <AgentManageEmployees />}</AgentWorkspace>; }
