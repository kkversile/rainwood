'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AdminLayout } from '../../../../../components/Shell';
import { apiRequest } from '../../../../../lib/api';

type BankAccount = {
  id: string;
  accountName: string;
  bankName: string;
  branch?: string | null;
  accountNumber: string;
  ifsc?: string | null;
  accountType?: string | null;
  active: boolean;
  displayOnAgentRateSheet: boolean;
};

const empty = { accountName: '', bankName: '', branch: '', accountNumber: '', ifsc: '', accountType: 'CURRENT', active: true, displayOnAgentRateSheet: false };

export default function HotelBankAccountsPage() {
  const params = useParams<{ id: string }>();
  const hotelId = params.id;
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState('');
  const [hotelName, setHotelName] = useState('Hotel');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const [hotel, rows] = await Promise.all([
        apiRequest<{ name: string }>(`/hotels/${hotelId}`),
        apiRequest<BankAccount[]>(`/hotels/${hotelId}/bank-accounts`),
      ]);
      setHotelName(hotel.name);
      setAccounts(rows);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load bank details'); }
  }
  useEffect(() => { if (hotelId) void load(); }, [hotelId]);

  function edit(account: BankAccount) {
    setEditingId(account.id);
    setForm({ accountName: account.accountName, bankName: account.bankName, branch: account.branch ?? '', accountNumber: account.accountNumber, ifsc: account.ifsc ?? '', accountType: account.accountType ?? 'CURRENT', active: account.active, displayOnAgentRateSheet: account.displayOnAgentRateSheet });
    setMessage(''); setError('');
  }
  function reset() { setEditingId(''); setForm(empty); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    try {
      const path = editingId ? `/hotels/bank-accounts/${editingId}` : `/hotels/${hotelId}/bank-accounts`;
      await apiRequest(path, { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(form) });
      await load(); reset(); setMessage(editingId ? 'Bank account updated.' : 'Bank account added.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save bank details'); }
    finally { setBusy(false); }
  }

  return <AdminLayout title="Bank Details"><section className="masterPanel"><div className="listToolbar"><div><span>Property configuration</span><h2>Finance / Bank Details</h2><p>{hotelName} · structured details used in optional agent rate-sheet snapshots.</p></div><Link className="smallBtn" href={`/admin/hotels/${hotelId}/catalog`}>Back to hotel</Link></div>{message && <p className="success" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}<form className="panel masterForm" onSubmit={(event) => void submit(event)}><h3>{editingId ? 'Edit bank account' : 'Add bank account'}</h3><div className="formGrid"><label>Account name<input required value={form.accountName} onChange={(event) => setForm({ ...form, accountName: event.target.value })} /></label><label>Bank name<input required value={form.bankName} onChange={(event) => setForm({ ...form, bankName: event.target.value })} /></label><label>Branch<input value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })} /></label><label>Account number<input required value={form.accountNumber} onChange={(event) => setForm({ ...form, accountNumber: event.target.value })} /></label><label>IFSC<input value={form.ifsc} onChange={(event) => setForm({ ...form, ifsc: event.target.value })} /></label><label>Account type<select value={form.accountType} onChange={(event) => setForm({ ...form, accountType: event.target.value })}><option>SAVINGS</option><option>CURRENT</option><option>OD</option></select></label><label className="checkLabel"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active</label><label className="checkLabel"><input type="checkbox" checked={form.displayOnAgentRateSheet} onChange={(event) => setForm({ ...form, displayOnAgentRateSheet: event.target.checked })} /> Show on Agent Rate Sheet</label></div><div className="rowActions"><button className="btn" disabled={busy}>{busy ? 'Saving...' : editingId ? 'Save changes' : 'Add account'}</button>{editingId && <button className="smallBtn" type="button" onClick={reset}>Cancel</button>}</div></form><section className="panel"><h3>Configured bank accounts</h3><div className="tableScroll"><table><thead><tr><th>Account</th><th>Bank / branch</th><th>Account number</th><th>Status</th><th>Rate sheet</th><th>Actions</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id}><td>{account.accountName}<small>{account.accountType ?? ''}</small></td><td>{account.bankName}<small>{account.branch ?? ''}</small></td><td>{account.accountNumber}<small>{account.ifsc ?? ''}</small></td><td>{account.active ? 'Active' : 'Inactive'}</td><td>{account.displayOnAgentRateSheet ? 'Shown' : 'Hidden'}</td><td><button className="smallBtn" type="button" onClick={() => edit(account)}>Edit</button></td></tr>)}{!accounts.length && <tr><td colSpan={6}>No bank accounts configured.</td></tr>}</tbody></table></div></section></section></AdminLayout>;
}
