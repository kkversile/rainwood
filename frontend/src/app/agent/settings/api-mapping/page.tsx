'use client';

import { AgentWorkspace } from '../../../../components/AgentData';
import { AgentApiMappingInfo } from '../../../../components/AgentSettings';

export default function AgentApiMappingPage() { return <AgentWorkspace title="API Mapping Info">{() => <AgentApiMappingInfo />}</AgentWorkspace>; }
