'use client';

import { AgentWorkspace } from '../../../components/AgentData';
import AgentAnnouncements from '../../../components/AgentAnnouncements';

export default function AgentAnnouncementsPage() { return <AgentWorkspace title="Announcements">{() => <AgentAnnouncements />}</AgentWorkspace>; }
