'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiRequest, setAccessToken } from '../../../lib/api';
import { getSafePostLoginRoute } from '../../../lib/role-landing';
import { demoLogin } from '../../../lib/demo-login';

export default function AgentLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? demoLogin.agentEmail);
  const [password, setPassword] = useState(demoLogin.agentPassword);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function prefillAgent() { setEmail(demoLogin.agentEmail); setPassword(demoLogin.agentPassword); setError(demoLogin.agentPassword ? '' : 'The agent demo password is not configured. Sign in with your registered agent account.'); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await apiRequest<{ accessToken: string; user: { role: string } }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (result.user.role !== 'AGENT') throw new Error('This login is for registered agents only.');
      setAccessToken(result.accessToken, result.user.role); router.replace(getSafePostLoginRoute('AGENT', params.get('next')));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Agent login failed'); } finally { setBusy(false); }
  }
  return <main className="login rainwoodPortalLogin"><form className="formCard" onSubmit={(event) => void submit(event)}><h1>Agent Login</h1><p>Sign in to complete onboarding or manage your approved RainWood agent account.</p><nav className="loginRoleLinks" aria-label="Choose portal"><Link href="/login?demo=admin">Admin</Link><Link className="active" aria-current="page" href="/agent/login?demo=agent">Agent</Link><Link href="/staff/login?demo=staff">Staff</Link></nav><div className="demoLoginTools"><span>Demo shortcut</span><button type="button" onClick={prefillAgent} disabled={busy}>Prefill Agent login</button></div>{params.get('registered') === '1' && <p className="notice" role="status">Registration successful. Sign in to upload KYC documents and track Admin review.</p>}{params.get('deactivated') === '1' && <p className="error" role="alert">Your agent account is deactivated. Please contact support.</p>}{params.get('pending') === '1' && <p className="notice" role="status">Registration successful. You can now sign in to complete your KYC and onboarding.</p>}{error && <p className="error" role="alert">{error}</p>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button className="btn full" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button><p><Link href="/agent/register">Create an agent account</Link></p></form></main>;
}
