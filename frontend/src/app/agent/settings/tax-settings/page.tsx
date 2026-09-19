'use client';

import { AgentWorkspace } from '../../../../components/AgentData';
import { AgentTaxSettings } from '../../../../components/AgentSettings';

export default function AgentTaxSettingsPage() { return <AgentWorkspace title="Tax Settings">{() => <AgentTaxSettings />}</AgentWorkspace>; }
