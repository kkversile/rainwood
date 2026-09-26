'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest, setAccessToken } from '../../../lib/api';

export default function StaffLogin() {
  const router = useRouter(); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { const result = await apiRequest<{ accessToken: string; user: { role: string } }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); if (result.user.role !== 'SERVICE_STAFF') throw new Error('This login is for hotel service staff only.'); setAccessToken(result.accessToken, result.user.role); router.replace('/staff'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Staff login failed.'); } finally { setBusy(false); } }
  return <main className="staffLoginPage"><form className="staffLoginCard" onSubmit={(event) => void submit(event)}><span className="staffEyebrow">RainWood Hotels</span><h1>Staff Login</h1><p>Use your hotel operations account to view today’s guests and post service charges.</p>{error && <p className="staffError" role="alert">{error}</p>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button className="staffButton full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></main>;
}
