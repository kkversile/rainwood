'use client';

import Link from 'next/link';
import { AgentReservations, AgentWorkspace } from '../../components/AgentData';

export default function AgentPortal() {
  return <AgentWorkspace title="Dashboard">{(user) => <><div className="metrics"><div><b>Agent access</b><span>Read-only rate-plan assignment</span></div><div><b>Bookings</b><span>Created by {user.name}</span></div><div><b>Permissions</b><span>Booking and reservation access</span></div></div><div className="toolbar"><Link className="btn" href="/agent/book">Create booking</Link><Link className="btn secondary" href="/agent/rate-plans">View my rate plans</Link></div><AgentReservations /></>}</AgentWorkspace>;
}
