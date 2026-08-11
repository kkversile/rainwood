'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest, clearAccessToken, setAccessToken } from '../lib/api';
import { AgentShell } from './Shell';

export type AgentUser = { id: string; name: string; email: string; role: string };
export type AgentReservation = { reference: string; guestName: string; checkIn: string; checkOut: string; status: string; paymentStatus: string; totalAmount: number | string; balanceAmount: number | string; hotel: { name: string }; lines: { roomType: { name: string }; ratePlan: { name: string }; rooms: number }[] };

export function AgentWorkspace({ title, children }: { title: string; children: (user: AgentUser) => React.ReactNode }) {
  const router = useRouter(); const [user, setUser] = useState<AgentUser | null>(null);
  useEffect(() => { apiRequest<{ accessToken: string; user: AgentUser }>('/auth/refresh', { method: 'POST' }).then((session) => { if (session.user.role !== 'AGENT') { router.replace('/agent/login'); return; } setAccessToken(session.accessToken); setUser(session.user); }).catch(() => router.replace('/agent/login')); }, [router]);
  async function logout() { await apiRequest('/auth/logout', { method: 'POST', body: JSON.stringify({}) }).catch(() => undefined); clearAccessToken(); router.replace('/agent/login'); }
  if (!user) return <main className="page"><p className="loading">Loading agent portal...</p></main>;
  return <AgentShell title={title} user={user} onLogout={() => void logout()}>{children(user)}</AgentShell>;
}

export function AgentReservations() {
  const [rows, setRows] = useState<AgentReservation[] | null>(null); const [error, setError] = useState('');
  useEffect(() => { apiRequest<AgentReservation[]>('/reservations/mine').then(setRows).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load bookings')); }, []);
  if (error) return <p className="error">{error}</p>;
  if (!rows) return <p className="loading">Loading bookings...</p>;
  return <section className="panel"><h2>My bookings</h2>{!rows.length ? <p className="empty">No agent bookings yet.</p> : <div className="tableScroll"><table><thead><tr><th>Reference</th><th>Guest</th><th>Hotel / Room</th><th>Stay</th><th>Status</th><th>Balance</th></tr></thead><tbody>{rows.map((row) => <tr key={row.reference}><td><b>{row.reference}</b></td><td>{row.guestName}</td><td>{row.hotel.name} / {row.lines.map((line) => line.roomType.name).join(', ')}</td><td>{row.checkIn.slice(0, 10)} - {row.checkOut.slice(0, 10)}</td><td>{row.status} / {row.paymentStatus}</td><td>INR {Number(row.balanceAmount).toFixed(2)}</td></tr>)}</tbody></table></div>}</section>;
}
