'use client';

import Link from 'next/link';
import { AgentReservations, AgentWorkspace } from '../../components/AgentData';

export default function AgentPortal() {
  return <AgentWorkspace title="Dashboard">{(user) => <><section className="rwAgentContext" aria-label="Agent account access"><div><span>Account</span><strong>{user.companyName || user.name}</strong></div><div><span>Booking access</span><strong>{user.canBook ? 'Ready to book' : 'Awaiting approval'}</strong></div><div><span>Rate plans</span><strong>{user.canAccessHotels ? 'Assigned by RainWood' : 'Awaiting assignment'}</strong></div></section><div className="toolbar"><Link className="btn" href="/agent/book">Create booking</Link><Link className="btn secondary" href="/agent/rate-plans">View my rate plans</Link></div><AgentReservations /></>}</AgentWorkspace>;
}
