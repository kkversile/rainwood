'use client';

import { AgentReservations, AgentWorkspace } from '../../../components/AgentData';

export default function AgentBookingsPage() { return <AgentWorkspace title="My Bookings">{() => <AgentReservations />}</AgentWorkspace>; }
