'use client';

import { AgentWorkspace } from '../../../components/AgentData';
import { BookingFlow } from '../../../components/BookingFlow';

export default function AgentBookingPage() { return <AgentWorkspace title="Create Booking">{() => <BookingFlow agentMode />}</AgentWorkspace>; }
