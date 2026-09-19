'use client';

import { AgentWorkspace } from '../../../components/AgentData';
import { AgentSpecialOffers } from '../../../components/AgentReports';

export default function AgentSpecialOffersPage() {
  return <AgentWorkspace title="Special Offers">{() => <AgentSpecialOffers />}</AgentWorkspace>;
}
