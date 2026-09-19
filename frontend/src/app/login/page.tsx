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
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<{ accessToken: string; user: { role: string } }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setAccessToken(result.accessToken, result.user.role);
      const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
      const requestedPath = params.get('next') ?? '/admin/dashboard';
      const pathWithoutBase = configuredBasePath && requestedPath.startsWith(`${configuredBasePath}/`)
        ? requestedPath.slice(configuredBasePath.length)
        : requestedPath;
      const safeStaffPath = pathWithoutBase.startsWith('/') && !pathWithoutBase.startsWith('//')
        ? pathWithoutBase
        : '/admin/dashboard';
      router.replace(result.user.role === 'AGENT' ? '/agent' : safeStaffPath);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }
  return <main className="adminLoginPage"><header className="adminLoginHeader"><img src="https://rainwoodhotels.com/wp-content/webp-express/webp-images/uploads/2023/09/rwh-logo.png.webp" alt="RainWood Hotels" /></header><section className="adminLoginBody"><form className="adminLoginCard" onSubmit={submit}><span className="adminLoginEyebrow">Operations access</span><h1>RainWood Operations</h1><p className="adminLoginSubtitle">Sign in to manage hotels, agents, inventory, and reservations.</p>{error && <p className="error" role="alert">{error}</p>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button className="btn full adminLoginButton" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></section></main>;
}
