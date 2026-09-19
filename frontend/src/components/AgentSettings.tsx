'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

type Profile = { id: string; email: string; name: string; companyName?: string | null; contactPerson?: string | null; mobile?: string | null; gstin?: string | null; place?: string | null; state?: string | null };

function SettingsPanel({ children }: { children: React.ReactNode }) {
  return <section className="panel agentSettingsPanel">{children}</section>;
}

export function AgentApiMappingInfo() {
  const [status, setStatus] = useState('Checking connection...');
  useEffect(() => { apiRequest<unknown[]>('/hotels').then(() => setStatus('Connected')).catch(() => setStatus('Unavailable')); }, []);
  return <SettingsPanel><div className="agentSettingsHeading"><div><span className="agentReportKicker">Settings</span><h2>API Mapping Info</h2><p>RainWood integration status and the booking data mapped to your agent account.</p></div><span className={`status ${status === 'Connected' ? 'ok' : status === 'Unavailable' ? 'warn' : ''}`}>{status}</span></div><div className="agentSettingsGrid"><article><span>Property catalogue</span><strong>Hotels, rooms and images</strong><small>Published RainWood properties are available through the hotel catalogue.</small></article><article><span>Availability and rates</span><strong>Live booking search</strong><small>Availability is checked against inventory and assigned agent rate plans.</small></article><article><span>Reservation mapping</span><strong>Booking, payment and voucher</strong><small>Agent bookings map guest, stay, rate, tax, wallet and confirmation details.</small></article><article><span>Authentication</span><strong>Bearer token + refresh session</strong><small>Your agent session is used for protected booking and account requests.</small></article></div><div className="agentSettingsCode"><b>RainWood API resources</b><code>/api/v1/hotels</code><code>/api/v1/availability/search</code><code>/api/v1/reservations/mine</code><code>/api/v1/wallet</code></div></SettingsPanel>;
}

export function AgentManageEmployees() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiRequest<Profile>('/agents/me/profile').then(setProfile).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load company access')); }, []);
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!profile) return <p className="loading">Loading employee access...</p>;
  return <SettingsPanel><div className="agentSettingsHeading"><div><span className="agentReportKicker">Settings</span><h2>Manage Employee</h2><p>Review the primary booking user connected to this agency account.</p></div><span className="status ok">Active account</span></div><div className="agentEmployeeCard"><div className="agentEmployeeAvatar">{profile.name.slice(0, 1).toUpperCase()}</div><div><h3>{profile.name}</h3><p>{profile.email}</p><p>{profile.companyName || 'RainWood agent company'} · {profile.contactPerson || 'Primary contact'}</p></div><span className="status ok">Primary</span></div><div className="agentSettingsNotice"><b>Additional employee access</b><p>Employee records are not enabled for this RainWood agent account yet. Contact RainWood support to add staff users and define their booking permissions.</p><a className="btn" href="/rainwood/contact">Contact support</a></div></SettingsPanel>;
}

export function AgentTaxSettings() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [gstin, setGstin] = useState('');
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { apiRequest<Profile>('/agents/me/profile').then((value) => { setProfile(value); setGstin(value.gstin ?? ''); setRegistered(Boolean(value.gstin)); }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load tax settings')); }, []);
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage(''); setError(''); try { const updated = await apiRequest<Profile>('/agents/me/profile', { method: 'PATCH', body: JSON.stringify({ gstin: registered ? gstin : '' }) }); setProfile(updated); setGstin(updated.gstin ?? ''); setMessage('Tax settings updated successfully.'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update tax settings'); } finally { setBusy(false); } }
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!profile) return <p className="loading">Loading tax settings...</p>;
  return <SettingsPanel><div className="agentSettingsHeading"><div><span className="agentReportKicker">Settings</span><h2>Tax Settings</h2><p>Keep your agency GST information ready for billing and booking invoices.</p></div></div>{message && <p className="notice" role="status">{message}</p>}<form className="agentTaxForm" onSubmit={(event) => void save(event)}><label className="checkLabel"><input type="checkbox" checked={registered} onChange={(event) => setRegistered(event.target.checked)} /> GST registered agency</label><label>GST / Tax number<input value={gstin} onChange={(event) => setGstin(event.target.value.toUpperCase())} disabled={!registered} placeholder="Enter GSTIN" /></label><div className="agentTaxPolicy"><b>Hotel tax display</b><p>Taxes are calculated from the selected hotel rate plan and displayed before booking confirmation. The hotel policy remains the source of truth for each reservation.</p></div>{error && <p className="error">{error}</p>}<button className="btn" disabled={busy}>{busy ? 'Saving...' : 'Save tax settings'}</button></form></SettingsPanel>;
}
