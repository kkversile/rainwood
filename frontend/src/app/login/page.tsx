'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiRequest, setAccessToken } from '../../lib/api';
import { demoLogin } from '../../lib/demo-login';

export default function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(demoLogin.adminEmail || 'admin@rainwood.demo');
  const [password, setPassword] = useState(demoLogin.adminPassword);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { const result = await apiRequest<{ accessToken: string; user: { role: string } }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); setAccessToken(result.accessToken, result.user.role); router.replace(result.user.role === 'AGENT' ? '/agent' : (params.get('next') ?? '/admin/dashboard')); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Login failed'); } finally { setBusy(false); } }
  return <main className="login"><form className="formCard" onSubmit={submit}><h1>RainWood Operations</h1><p>Secure staff access</p>{error && <p className="error" role="alert">{error}</p>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button className="btn full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></main>;
}
