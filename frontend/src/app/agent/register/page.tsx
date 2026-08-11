'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiRequest } from '../../../lib/api';

export default function AgentRegister() {
  const router = useRouter();
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try { await apiRequest('/auth/agent/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }); router.replace(`/agent/login?email=${encodeURIComponent(email)}`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Registration failed'); } finally { setBusy(false); }
  }
  return <main className="login"><form className="formCard" onSubmit={submit}><h1>Agent Registration</h1><p>Create an account for agent booking access.</p>{error && <p className="error" role="alert">{error}</p>}<label>Agency / agent name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label>Password<input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required /></label><label>Confirm password<input type="password" minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" required /></label><button className="btn full" disabled={busy}>{busy ? 'Creating account...' : 'Register as agent'}</button><p><Link href="/agent/login">Already registered? Sign in</Link></p></form></main>;
}
