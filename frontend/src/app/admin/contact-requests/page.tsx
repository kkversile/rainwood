'use client';

import { useEffect, useState } from 'react';
import { AdminLayout } from '../../../components/Shell';
import { apiRequest } from '../../../lib/api';

type ContactRequest = { id: string; name: string; email: string; message: string; status: string; createdAt: string };

export default function ContactRequestsPage() {
  const [items, setItems] = useState<ContactRequest[]>([]); const [error, setError] = useState('');
  useEffect(() => { apiRequest<ContactRequest[]>('/contact-requests').then(setItems).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load contact requests')); }, []);
  return <AdminLayout title="Contact Requests"><section className="masterPanel"><div className="listToolbar"><div><span>Guest enquiries</span><h2>Contact Requests</h2><p>Requests submitted through the public contact form.</p></div></div>{error && <p className="error" role="alert">{error}</p>}<section className="panel"><div className="tableScroll"><table><thead><tr><th>Received</th><th>Name</th><th>Email</th><th>Message</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString()}</td><td><b>{item.name}</b></td><td>{item.email}</td><td className="contactMessageCell">{item.message}</td><td><span className="status ok">{item.status}</span></td></tr>)}{!items.length && !error && <tr><td colSpan={5}>No contact requests yet.</td></tr>}</tbody></table></div></section></section></AdminLayout>;
}
