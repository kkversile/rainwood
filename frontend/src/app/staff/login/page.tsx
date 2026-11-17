'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiRequest, setAccessToken } from '../../../lib/api';
import { getSafePostLoginRoute } from '../../../lib/role-landing';
import { demoLogin } from '../../../lib/demo-login';

const STAFF_DEMO_EMAIL = demoLogin.staffEmail;
const MAINTENANCE_DEMO_EMAIL = demoLogin.maintenanceEmail;
const STAFF_DEMO_PASSWORD = demoLogin.staffPassword;
const MAINTENANCE_DEMO_PASSWORD = demoLogin.maintenancePassword;
const maintenanceDemoAvailable = Boolean(MAINTENANCE_DEMO_EMAIL && MAINTENANCE_DEMO_PASSWORD);
const fnbDemoAvailable = Boolean(demoLogin.fnbEmail && demoLogin.fnbPassword);
const roomServiceDemoAvailable = Boolean(demoLogin.roomServiceEmail && demoLogin.roomServicePassword);

export default function StaffLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(STAFF_DEMO_EMAIL);
  const [password, setPassword] = useState(STAFF_DEMO_PASSWORD);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { const demo = new URLSearchParams(window.location.search).get('demo'); if (demo === 'maintenance' && !maintenanceDemoAvailable) { setError('The maintenance demo is not configured. Sign in with your assigned staff account.'); } else if (demo === 'maintenance') { setEmail(MAINTENANCE_DEMO_EMAIL); setPassword(MAINTENANCE_DEMO_PASSWORD); setError(''); } else if (demo === 'fnb') { if (fnbDemoAvailable) { setEmail(demoLogin.fnbEmail); setPassword(demoLogin.fnbPassword); setError(''); } else setError('The F&B demo is not configured.'); } else if (demo === 'roomservice') { if (roomServiceDemoAvailable) { setEmail(demoLogin.roomServiceEmail); setPassword(demoLogin.roomServicePassword); setError(''); } else setError('The Room Service demo is not configured.'); } else if (demo === 'staff') { setEmail(STAFF_DEMO_EMAIL); setPassword(STAFF_DEMO_PASSWORD); setError(''); } }, []);
  function prefillStaff() { setEmail(STAFF_DEMO_EMAIL); setPassword(STAFF_DEMO_PASSWORD); setError(''); }
  function prefillMaintenance() { setEmail(MAINTENANCE_DEMO_EMAIL); setPassword(MAINTENANCE_DEMO_PASSWORD); setError(''); }
  function prefillFnb() { setEmail(demoLogin.fnbEmail); setPassword(demoLogin.fnbPassword); setError(''); }
  function prefillRoomService() { setEmail(demoLogin.roomServiceEmail); setPassword(demoLogin.roomServicePassword); setError(''); }
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { const result = await apiRequest<{ accessToken: string; user: { role: string } }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); if (result.user.role !== 'SERVICE_STAFF') throw new Error('This login is for hotel service staff only.'); setAccessToken(result.accessToken, result.user.role); router.replace(getSafePostLoginRoute('SERVICE_STAFF', params.get('next'))); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Staff login failed.'); } finally { setBusy(false); } }
  return <main className="staffLoginPage"><form className="staffLoginCard" onSubmit={(event) => void submit(event)}><span className="staffEyebrow">RainWood Hotels</span><h1>Staff Login</h1><p>Sign in to your hotel department workspace.</p><nav className="loginRoleLinks" aria-label="Choose portal"><Link href="/login?demo=admin">Admin</Link><Link href="/agent/login?demo=agent">Agent</Link><Link className="active" href="/staff/login?demo=staff">Staff</Link></nav><div className="demoLoginTools"><span>Demo shortcut</span><button type="button" onClick={prefillStaff}>Prefill Housekeeping</button>{maintenanceDemoAvailable && <button type="button" onClick={prefillMaintenance}>Prefill Maintenance</button>}{fnbDemoAvailable && <button type="button" onClick={prefillFnb}>Prefill F&amp;B</button>}{roomServiceDemoAvailable && <button type="button" onClick={prefillRoomService}>Prefill Room Service</button>}<Link href="/login?demo=admin">Prefill Admin login</Link><Link href="/agent/login?demo=agent">Prefill Agent login</Link></div>{error && <p className="staffError" role="alert">{error}</p>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button className="staffButton full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></main>;
}
