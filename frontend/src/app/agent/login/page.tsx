'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiRequest, setAccessToken } from '../../../lib/api';

export default function AgentLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await apiRequest<{ accessToken: string; user: { role: string } }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (result.user.role !== 'AGENT') throw new Error('This login is for registered agents only.');
      setAccessToken(result.accessToken); router.replace(params.get('next') ?? '/agent');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Agent login failed'); } finally { setBusy(false); }
  }
  return <main className="login"><form className="formCard" onSubmit={submit}><h1>Agent Login</h1><p>Sign in to manage your RainWood agent bookings.</p>{error && <p className="error" role="alert">{error}</p>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button className="btn full" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button><p><a href="/agent/register">Create an agent account</a></p></form></main>;
}
