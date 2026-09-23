import { redirect } from 'next/navigation';

export default function AgentMappingsRedirect() {
  redirect('/admin/agents');
}
