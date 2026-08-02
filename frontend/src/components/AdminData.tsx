'use client';

import { useEffect, useState } from 'react';
import { apiRequest, clearAccessToken, setAccessToken } from '../lib/api';

export function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    apiRequest<{ accessToken: string }>('/auth/refresh', { method: 'POST' }).then((body) => { setAccessToken(body.accessToken); setReady(true); }).catch(() => { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`; });
    return () => clearAccessToken();
  }, []);
  if (!ready) return <main className="page"><p className="loading">Checking staff session…</p></main>;
  return <>{children}</>;
}

function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiRequest<T>(path).then(setData).catch((reason: Error) => setError(reason.message)); }, [path]);
  return { data, error };
}

export function DashboardData() {
  const { data, error } = useData<{ bookings: number; balancePending: number; pendingSync: number; failedJobs: number; revenue: number }>('/reports/dashboard');
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="loading">Loading dashboard…</p>;
  return <><div className="metrics"><div><b>{data.bookings}</b><span>Bookings</span></div><div><b>INR {data.balancePending.toFixed(2)}</b><span>Balance pending</span></div><div><b>{data.pendingSync}</b><span>Sync attention</span></div><div><b>{data.failedJobs}</b><span>Failed jobs</span></div></div><section className="panel"><h2>Revenue</h2><p className="metric">INR {data.revenue.toFixed(2)}</p></section></>;
}

type ReservationList = { items: { reference: string; guestName: string; checkIn: string; checkOut: string; source: string; status: string; balanceAmount: number | string }[]; pagination: { total: number } };
export function ReservationData() {
  const { data, error } = useData<ReservationList>('/reservations?limit=100');
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="loading">Loading reservations…</p>;
  return <section className="panel"><p>{data.pagination.total} reservation(s)</p><table><thead><tr><th>Reference</th><th>Guest</th><th>Stay</th><th>Source</th><th>Status</th><th>Balance</th></tr></thead><tbody>{data.items.map((row) => <tr key={row.reference}><td><b>{row.reference}</b></td><td>{row.guestName}</td><td>{row.checkIn.slice(0, 10)} – {row.checkOut.slice(0, 10)}</td><td>{row.source}</td><td><span className={`status ${row.status === 'CONFIRMED' ? 'ok' : 'warn'}`}>{row.status}</span></td><td>INR {Number(row.balanceAmount).toFixed(2)}</td></tr>)}</tbody></table></section>;
}

export function PaymentsData() {
  const { data, error } = useData<{ items: { id: string; amount: number | string; mode: string; verified: boolean; reservation: { reference: string } }[]; totals: { verified: number; pending: number } }>('/reports/payments');
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="loading">Loading payments…</p>;
  return <><div className="metrics"><div><b>INR {data.totals.verified.toFixed(2)}</b><span>Verified</span></div><div><b>INR {data.totals.pending.toFixed(2)}</b><span>Pending verification</span></div></div><section className="panel"><table><thead><tr><th>Booking</th><th>Mode</th><th>Amount</th><th>Status</th></tr></thead><tbody>{data.items.map((row) => <tr key={row.id}><td>{row.reservation.reference}</td><td>{row.mode}</td><td>INR {Number(row.amount).toFixed(2)}</td><td><span className={`status ${row.verified ? 'ok' : 'warn'}`}>{row.verified ? 'Verified' : 'Pending'}</span></td></tr>)}</tbody></table></section></>;
}

export function JobsData() {
  const { data, error } = useData<{ id: string; type: string; aggregateId: string; attempts: number; status: string; availableAt: string }[]>('/jobs');
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="loading">Loading jobs…</p>;
  return <section className="panel"><table><thead><tr><th>Job</th><th>Aggregate</th><th>Attempts</th><th>Status</th><th>Next run</th></tr></thead><tbody>{data.map((row) => <tr key={row.id}><td>{row.type}</td><td>{row.aggregateId}</td><td>{row.attempts}</td><td>{row.status}</td><td>{new Date(row.availableAt).toLocaleString()}</td></tr>)}</tbody></table></section>;
}

export function UsersData() {
  const { data, error } = useData<{ id: string; name: string; email: string; role: string; active: boolean }[]>('/users');
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="loading">Loading users…</p>;
  return <section className="panel"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>{data.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.email}</td><td>{row.role}</td><td><span className={`status ${row.active ? 'ok' : 'err'}`}>{row.active ? 'Active' : 'Inactive'}</span></td></tr>)}</tbody></table></section>;
}

export function AuditData() {
  const { data, error } = useData<{ id: string; action: string; entityType: string; createdAt: string; correlationId?: string; actor?: { name: string } }[]>('/audit-logs');
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="loading">Loading audit events…</p>;
  return <section className="panel"><table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Correlation ID</th></tr></thead><tbody>{data.map((row) => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleString()}</td><td>{row.actor?.name ?? 'System'}</td><td>{row.action}</td><td>{row.entityType}</td><td>{row.correlationId ?? '—'}</td></tr>)}</tbody></table></section>;
}

export function ReportsData() {
  const { data, error } = useData<{ items: { reference: string; totalAmount: number | string; paymentStatus: string }[]; totals: { totalAmount: number; advanceAmount: number; balanceAmount: number } }>('/reports/reservations?limit=100');
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="loading">Loading reports…</p>;
  return <section className="panel"><h2>Reservation revenue</h2><p>Total INR {data.totals.totalAmount.toFixed(2)} · Advance INR {data.totals.advanceAmount.toFixed(2)} · Balance INR {data.totals.balanceAmount.toFixed(2)}</p><table><thead><tr><th>Reference</th><th>Total</th><th>Payment</th></tr></thead><tbody>{data.items.map((row) => <tr key={row.reference}><td>{row.reference}</td><td>INR {Number(row.totalAmount).toFixed(2)}</td><td>{row.paymentStatus}</td></tr>)}</tbody></table></section>;
}
