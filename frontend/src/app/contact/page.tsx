'use client';

import { FormEvent, useState } from 'react';
import { apiRequest } from '../../lib/api';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { await apiRequest('/contact-requests', { method: 'POST', body: JSON.stringify(form) }); setForm({ name: '', email: '', message: '' }); setMessage('Thanks — your request has been sent to the RainWood team.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not send your request.'); }
    finally { setBusy(false); }
  }
  return <main className="contactDemoPage"><div className="contactDemoHeader"><div><span>Contact</span><h1>Request a walkthrough of the<br />direct booking prototype.</h1></div><p>This contact screen is static. In production it can become a RainWood enquiry or support entry point.</p></div><div className="contactDemoGrid"><section className="contactDemoCard"><h2>RainWood Booking Engine Demo</h2><p>Review website integration, booking flow, admin dashboard and AxisRooms sync behavior in one shareable SPA file.</p><div className="contactDemoTags"><span>Single HTML</span><span>No ZIP needed</span><span>Responsive</span></div></section><form className="contactDemoCard contactDemoForm" onSubmit={submit}><div className="two"><label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} minLength={2} maxLength={120} required /></label><label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} required /></label></div><label>Message<textarea rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} minLength={10} maxLength={5000} required /></label>{error && <p className="error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}<button className="btn full" disabled={busy}>{busy ? 'Sending...' : 'Submit Demo Request'}</button></form></div></main>;
}
