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
  return <main className="contactDemoPage"><div className="contactDemoHeader"><div><span>Contact RainWood</span><h1>We’re here to help with<br />your stay and booking.</h1></div><p>Send an enquiry to the RainWood team about a reservation, hotel stay, or direct booking question.</p></div><div className="contactDemoGrid"><section className="contactDemoCard"><h2>Reservation support</h2><p>Tell us how we can help and our team will follow up with the details needed to assist you.</p><div className="contactDemoTags"><span>Booking support</span><span>Hotel information</span><span>Guest care</span></div></section><form className="contactDemoCard contactDemoForm" onSubmit={submit}><div className="two"><label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} minLength={2} maxLength={120} required /></label><label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} required /></label></div><label>Message<textarea rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} minLength={10} maxLength={5000} required /></label>{error && <p className="error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}<button className="btn full" disabled={busy}>{busy ? 'Sending...' : 'Send enquiry'}</button></form></div></main>;
}
