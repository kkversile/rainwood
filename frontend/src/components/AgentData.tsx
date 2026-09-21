'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiRequest, clearAccessToken, setAccessToken } from '../lib/api';
import { canPendingAgentVisit, type AgentKycSummary, type AgentOnboardingStatus } from '../lib/agent-onboarding';
import { AgentPortalShell } from './AgentPortalShell';

export type AgentUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  onboardingStatus: AgentOnboardingStatus;
  canAccessHotels: boolean;
  canBook: boolean;
  paymentTermsAssigned: boolean;
  paymentTerms?: { mode: 'PERCENTAGE' | 'CREDIT'; advancePercent?: number | string | null } | null;
  kycSummary: AgentKycSummary;
  companyName?: string | null;
};

export type AgentReservation = { reference: string; guestName: string; checkIn: string; checkOut: string; createdAt?: string; status: string; paymentStatus: string; totalAmount: number | string; advanceAmount?: number | string; balanceAmount: number | string; hotel: { name: string; city: string }; lines: { roomType: { name: string }; ratePlan: { name: string }; rooms: number }[] };

type AgentProfileAccess = AgentUser;

export function AgentWorkspace({ title, children }: { title: string; children: (user: AgentUser) => React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AgentUser | null>(null);

  useEffect(() => {
    let mounted = true;
    setUser(null);
    apiRequest<{ accessToken: string; user: { role: string } }>('/auth/refresh', { method: 'POST' })
      .then(async (session) => {
        if (session.user.role !== 'AGENT') {
          router.replace('/agent/login');
          return;
        }
        setAccessToken(session.accessToken, session.user.role);
        const profile = await apiRequest<AgentProfileAccess>('/agents/me/profile');
        if (!mounted) return;
        if (profile.onboardingStatus === 'DEACTIVATED') {
          clearAccessToken();
          router.replace('/agent/login?deactivated=1');
          return;
        }
        if (profile.onboardingStatus !== 'ACTIVE' && pathname === '/agent') {
          router.replace('/agent/onboarding');
          return;
        }
        if (profile.onboardingStatus !== 'ACTIVE' && !canPendingAgentVisit(pathname)) {
          router.replace('/agent/onboarding');
          return;
        }
        setUser(profile);
      })
      .catch(() => {
        if (mounted) router.replace('/agent/login');
      });
    return () => { mounted = false; };
  }, [pathname, router]);

  async function logout() {
    await apiRequest('/auth/logout', { method: 'POST', body: JSON.stringify({}) }).catch(() => undefined);
    clearAccessToken();
    router.replace('/agent/login');
  }

  if (!user) return <main className="page"><p className="loading">Loading agent portal...</p></main>;
  return <AgentPortalShell title={title} user={user} onLogout={() => void logout()}>{children(user)}</AgentPortalShell>;
}

export function AgentReservations() {
  const [rows, setRows] = useState<AgentReservation[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiRequest<AgentReservation[]>('/reservations/mine').then(setRows).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load bookings')); }, []);
  if (error) return <p className="error">{error}</p>;
  if (!rows) return <p className="loading">Loading bookings...</p>;
  return <section className="panel"><h2>My bookings</h2>{!rows.length ? <p className="empty">No agent bookings yet.</p> : <div className="tableScroll"><table><thead><tr><th>Reference</th><th>Guest</th><th>Hotel / Room</th><th>Stay</th><th>Status</th><th>Balance</th></tr></thead><tbody>{rows.map((row) => <tr key={row.reference}><td><b>{row.reference}</b></td><td>{row.guestName}</td><td>{row.hotel.name} / {row.lines.map((line) => line.roomType.name).join(', ')}</td><td>{row.checkIn.slice(0, 10)} - {row.checkOut.slice(0, 10)}</td><td>{row.status} / {row.paymentStatus}</td><td>INR {Number(row.balanceAmount).toFixed(2)}</td></tr>)}</tbody></table></div>}</section>;
}
