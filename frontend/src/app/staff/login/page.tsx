'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiRequest, setAccessToken } from '../../../lib/api';

const STAFF_DEMO_EMAIL = 'service.staff.test@rainwood.demo';
const MAINTENANCE_DEMO_EMAIL = 'maintenance.staff.test@rainwood.demo';
const STAFF_DEMO_PASSWORD = 'StaffDemo@2026!';

export default function StaffLogin() {
  const router = useRouter();
  const [email, setEmail] = useState(STAFF_DEMO_EMAIL);
  const [password, setPassword] = useState(STAFF_DEMO_PASSWORD);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { const demo = new URLSearchParams(window.location.search).get('demo'); if (demo === 'maintenance') { setEmail(MAINTENANCE_DEMO_EMAIL); setPassword(STAFF_DEMO_PASSWORD); setError(''); } else if (demo === 'staff') { setEmail(STAFF_DEMO_EMAIL); setPassword(STAFF_DEMO_PASSWORD); setError(''); } }, []);
  function prefillStaff() { setEmail(STAFF_DEMO_EMAIL); setPassword(STAFF_DEMO_PASSWORD); setError(''); }
  function prefillMaintenance() { setEmail(MAINTENANCE_DEMO_EMAIL); setPassword(STAFF_DEMO_PASSWORD); setError(''); }
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { const result = await apiRequest<{ accessToken: string; user: { role: string } }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); if (result.user.role !== 'SERVICE_STAFF') throw new Error('This login is for hotel service staff only.'); setAccessToken(result.accessToken, result.user.role); router.replace('/staff'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Staff login failed.'); } finally { setBusy(false); } }
  return <main className="staffLoginPage"><form className="staffLoginCard" onSubmit={(event) => void submit(event)}><span className="staffEyebrow">RainWood Hotels</span><h1>Staff Login</h1><p>Use your hotel operations account to view today&apos;s guests and post service charges.</p><nav className="loginRoleLinks" aria-label="Choose portal"><Link href="/login?demo=admin">Admin</Link><Link className="active" href="/staff/login?demo=staff">Staff</Link></nav><div className="demoLoginTools"><span>Demo shortcut</span><button type="button" onClick={prefillStaff}>Prefill Housekeeping</button><button type="button" onClick={prefillMaintenance}>Prefill Maintenance</button><Link href="/login?demo=admin">Prefill Admin login</Link></div>{error && <p className="staffError" role="alert">{error}</p>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button className="staffButton full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></main>;
}
