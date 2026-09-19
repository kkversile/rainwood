'use client';

import { AgentWorkspace } from '../../../components/AgentData';
import { AgentBookingTracker } from '../../../components/AgentReports';

export default function AgentBookingsPage() { return <AgentWorkspace title="Booking Tracker">{() => <AgentBookingTracker />}</AgentWorkspace>; }
