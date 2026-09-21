'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { AgentReservation } from './AgentData';
import { apiRequest } from '../lib/api';

declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void }; }
}

type TrackerMode = 'booking' | 'checkIn' | 'checkOut' | 'cancelled';

type Wallet = {
  currency: string;
  balance: number | string;
  transactions: WalletTransaction[];
};

type WalletTransaction = {
  id: string;
  type: string;
  amount: number | string;
  balanceAfter: number | string;
  reference?: string | null;
  description?: string | null;
  createdAt: string;
};

type AssignedPlan = {
  id: string;
  code: string;
  name: string;
  mealPlan: string;
  description?: string | null;
  hotel: { name: string; city: string };
  room: { name: string; code: string };
  rates: { date: string; amount: number | string; taxAmount: number | string }[];
};

function dateValue(value: string | undefined) {
  return value ? value.slice(0, 10) : '';
}

function money(value: number | string) {
  return `INR ${Number(value).toFixed(2)}`;
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

async function loadRazorpayCheckout() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout]');
    if (existing) { existing.addEventListener('load', () => resolve(), { once: true }); existing.addEventListener('error', () => reject(new Error('Could not load Razorpay Checkout')), { once: true }); return; }
    const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.async = true; script.dataset.razorpayCheckout = 'true'; script.onload = () => resolve(); script.onerror = () => reject(new Error('Could not load Razorpay Checkout')); document.body.appendChild(script);
  });
  if (!window.Razorpay) throw new Error('Razorpay Checkout is unavailable');
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ErrorOrLoading({ error, loading }: { error: string; loading: boolean }) {
  if (error) return <p className="error" role="alert">{error}</p>;
  if (loading) return <p className="loading">Loading report...</p>;
  return null;
}

export function AgentBookingTracker() {
  const [rows, setRows] = useState<AgentReservation[] | null>(null);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [hotel, setHotel] = useState('');
  const [mode, setMode] = useState<TrackerMode>('booking');

  useEffect(() => {
    apiRequest<AgentReservation[]>('/reservations/mine')
      .then(setRows)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load bookings'));
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const normalizedSearch = search.trim().toLowerCase();
    return rows.filter((row) => {
      const roomText = row.lines.map((line) => `${line.roomType.name} ${line.ratePlan.name}`).join(' ');
      const haystack = `${row.reference} ${row.guestName} ${row.hotel.name} ${row.hotel.city} ${roomText}`.toLowerCase();
      const date = mode === 'booking' ? dateValue(row.createdAt) : mode === 'checkIn' ? dateValue(row.checkIn) : dateValue(row.checkOut);
      const dateMatches = mode === 'cancelled' || ((!from || date >= from) && (!to || date <= to));
      return (!normalizedSearch || haystack.includes(normalizedSearch))
        && (!city || row.hotel.city.toLowerCase().includes(city.toLowerCase()))
        && (!hotel || row.hotel.name.toLowerCase().includes(hotel.toLowerCase()))
        && dateMatches
        && (mode !== 'cancelled' || row.status === 'CANCELLED');
    });
  }, [city, from, hotel, mode, rows, search, to]);

  function reset() {
    setFrom(''); setTo(''); setSearch(''); setCity(''); setHotel(''); setMode('booking');
  }

  function exportRows() {
    downloadCsv('rainwood-booking-tracker.csv', ['Voucher No', 'Traveller Name', 'Hotel / Package Name', 'Check In', 'Check Out', 'Booking Status', 'Total', 'Balance'], filtered.map((row) => [row.reference, row.guestName, `${row.hotel.name} / ${row.lines.map((line) => line.roomType.name).join(', ')}`, dateValue(row.checkIn), dateValue(row.checkOut), `${row.status} / ${row.paymentStatus}`, money(row.totalAmount), money(row.balanceAmount)]));
  }

  return <div className="agentBookingTrackerLayout">
    <aside className="agentBookingTrackerRail">
      <div className="agentRadioGroup">
        <label><input type="radio" checked={mode !== 'cancelled'} onChange={() => setMode('booking')} /> Where did we travel?</label>
        <label><input type="radio" checked={mode === 'cancelled'} onChange={() => setMode('cancelled')} /> Who&apos;s where today?</label>
      </div>
      <div className="agentFilterBlock"><div className="agentFilterBlockTitle"><span>Search</span><button type="button" onClick={reset}>Reset</button></div>
        <label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </div>
      <div className="agentFilterBlock"><div className="agentFilterBlockTitle"><span>Advanced Filters</span></div>
        <label><input type="radio" name="agent-filter" checked={!search && !city && !hotel} onChange={() => { setSearch(''); setCity(''); setHotel(''); }} /> No Filters</label>
        <label><input type="radio" name="agent-filter" checked={Boolean(search)} onChange={() => undefined} /> BookingId/Custom Search<input placeholder="Name, E-Mail, Voucher No. etc." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label><input type="radio" name="agent-filter" checked={Boolean(city)} onChange={() => undefined} /> City<input placeholder="Search city" value={city} onChange={(event) => setCity(event.target.value)} /></label>
        <label><input type="radio" name="agent-filter" checked={Boolean(hotel)} onChange={() => undefined} /> Hotel<input placeholder="Search hotel" value={hotel} onChange={(event) => setHotel(event.target.value)} /></label>
      </div>
      <div className="agentFilterBlock"><div className="agentFilterBlockTitle"><span>Search based on</span></div>
        <label className={mode === 'booking' ? 'selected' : ''}><input type="radio" checked={mode === 'booking'} onChange={() => setMode('booking')} /> Booking Date</label>
        <label className={mode === 'checkIn' ? 'selected' : ''}><input type="radio" checked={mode === 'checkIn'} onChange={() => setMode('checkIn')} /> Check-In Date</label>
        <label className={mode === 'checkOut' ? 'selected' : ''}><input type="radio" checked={mode === 'checkOut'} onChange={() => setMode('checkOut')} /> Check-Out Date</label>
        <label className={mode === 'cancelled' ? 'selected' : ''}><input type="radio" checked={mode === 'cancelled'} onChange={() => setMode('cancelled')} /> Cancelled Bookings</label>
      </div>
    </aside>
    <section className="agentBookingTrackerMain">
      <div className="agentReportToolbar"><div><span className="agentReportKicker">Booking Date</span><h2>Booking tracker</h2></div><div className="agentReportActions"><span>{filtered.length} Record(s) found</span><button className="smallBtn" type="button" onClick={exportRows}>Download as Excel</button></div></div>
      <ErrorOrLoading error={error} loading={!rows} />
      {rows && <div className="tableScroll agentReportTableScroll"><table className="agentReportTable"><thead><tr><th>Voucher No / Traveller Name</th><th>Booking Title / Reference No.</th><th>Hotel / Package Name</th><th>Check In / Check Out</th><th>Booking Status</th><th>Action</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.reference}><td><b>{row.reference}</b><span>{row.guestName}</span></td><td>Direct agent booking<span>{row.reference}</span></td><td>{row.hotel.name}<span>{row.hotel.city}</span></td><td>{dateValue(row.checkIn)}<span>{dateValue(row.checkOut)}</span></td><td><span className={`status ${row.status === 'CANCELLED' ? 'warn' : 'ok'}`}>{row.status}</span><small>{row.paymentStatus}</small></td><td><Link className="smallBtn" href={`/agent/bookings/${encodeURIComponent(row.reference)}`}>View</Link></td></tr>)}</tbody></table>{!filtered.length && <p className="empty">No bookings found for the selected search criteria.</p>}</div>}
    </section>
  </div>;
}

export function AgentWalletReport({ mode = 'wallet' }: { mode?: 'wallet' | 'advances' | 'transactions' }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState('25000');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    try { setWallet(await apiRequest<Wallet>('/wallet')); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load wallet'); }
  }
  useEffect(() => { void load(); }, []);

  async function recharge(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const attempt = await apiRequest<{ id: string; provider: string; providerOrderId: string; amount: number | string; currency: string }>('/wallet/recharge/order', { method: 'POST', headers: { 'idempotency-key': `agent-wallet:${Date.now()}:${Math.random().toString(36).slice(2)}` }, body: JSON.stringify({ amount: Number(amount) }) });
      if (attempt.provider === 'MOCK') {
        await apiRequest('/wallet/recharge/mock-complete', { method: 'POST', body: JSON.stringify({ attemptId: attempt.id, status: 'SUCCESS' }) });
        await load(); setMessage(`Wallet recharge of INR ${Number(amount).toFixed(2)} was verified.`);
      } else if (attempt.provider === 'RAZORPAY') {
        const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
        if (!key) throw new Error('Razorpay public key is not configured');
        await loadRazorpayCheckout();
        const waitForWebhook = async () => {
          for (let index = 0; index < 15; index += 1) {
            const status = await apiRequest<{ status: string }>(`/wallet/recharge/attempts/${encodeURIComponent(attempt.id)}`);
            if (status.status === 'SUCCESS') { await load(); setMessage(`Wallet recharge of INR ${Number(amount).toFixed(2)} was verified.`); return; }
            if (status.status === 'FAILED') throw new Error('Razorpay payment failed or was rejected');
            await new Promise((resolve) => window.setTimeout(resolve, 2000));
          }
          setMessage('Razorpay payment completed. Wallet credit is pending webhook verification.');
        };
        const Razorpay = window.Razorpay;
        if (!Razorpay) throw new Error('Razorpay Checkout is unavailable');
        const checkout = new Razorpay({ key, amount: Math.round(Number(attempt.amount) * 100), currency: attempt.currency, name: 'RainWood Hotels', description: 'Agent wallet recharge', order_id: attempt.providerOrderId, handler: () => { void waitForWebhook().catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not verify recharge')); }, modal: { ondismiss: () => setMessage('Razorpay checkout closed. No wallet credit was made.') } });
        checkout.open();
      } else throw new Error('This payment provider does not have a checkout flow configured');
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not recharge wallet'); }
    finally { setBusy(false); }
  }

  const transactions = useMemo(() => (wallet?.transactions ?? []).filter((transaction) => {
    const date = dateValue(transaction.createdAt);
    return (!from || date >= from) && (!to || date <= to) && (!type || transaction.type === type);
  }), [from, to, type, wallet]);
  const credits = transactions.filter((transaction) => Number(transaction.amount) >= 0).reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const debits = transactions.filter((transaction) => Number(transaction.amount) < 0).reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0);
  const heading = mode === 'advances' ? 'Payment advances' : mode === 'transactions' ? 'Transaction report' : 'Wallet';

  if (!wallet) return <><ErrorOrLoading error={error} loading /><p className="loading">{error ? '' : 'Loading wallet...'}</p></>;
  return <>
    <div className="metrics agentReportMetrics"><article><span>Available balance</span><strong>{money(wallet.balance)}</strong></article><article><span>Credits in view</span><strong>{money(credits)}</strong></article><article><span>Debits in view</span><strong>{money(debits)}</strong></article></div>
    {mode !== 'transactions' && <section className="formCard walletRecharge agentReportCard"><h2>{heading === 'Payment advances' ? 'Add payment advance' : 'Recharge wallet'}</h2><p className="mutedText">Record an advance for future agent bookings. The balance is used when a wallet booking is confirmed.</p>{error && <p className="error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}<form onSubmit={recharge}><div className="two"><label>Amount (INR)<input type="number" min="1" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><div className="walletFormAction"><button className="btn" disabled={busy}>{busy ? 'Adding...' : 'Add money'}</button></div></div></form></section>}
    <section className="panel agentReportCard"><div className="agentReportToolbar"><div><span className="agentReportKicker">{heading}</span><h2>{mode === 'transactions' ? 'Wallet transaction history' : 'Advance ledger'}</h2></div><div className="agentReportActions"><button className="smallBtn" type="button" onClick={() => downloadCsv('rainwood-wallet-transactions.csv', ['Date', 'Type', 'Reference', 'Amount', 'Balance After'], transactions.map((transaction) => [transaction.createdAt, transaction.type, transaction.reference || '', transaction.amount, transaction.balanceAfter]))}>Download as Excel</button></div></div><div className="agentReportFilters"><label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><label>Type<select value={type} onChange={(event) => setType(event.target.value)}><option value="">All transactions</option><option value="RECHARGE">Recharge</option><option value="BOOKING_DEBIT">Booking debit</option><option value="BOOKING_REFUND">Booking refund</option></select></label></div>{!transactions.length ? <p className="empty">No wallet transactions found for the selected criteria.</p> : <div className="tableScroll"><table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Amount</th><th>Balance after</th></tr></thead><tbody>{transactions.map((transaction) => <tr key={transaction.id}><td>{new Date(transaction.createdAt).toLocaleString()}</td><td><span className={`status ${Number(transaction.amount) >= 0 ? 'ok' : 'warn'}`}>{transaction.type.replaceAll('_', ' ')}</span></td><td>{transaction.reference || ' - '}</td><td className={Number(transaction.amount) >= 0 ? 'walletCredit' : 'walletDebit'}>{Number(transaction.amount) >= 0 ? '+' : ''} {money(transaction.amount)}</td><td>{money(transaction.balanceAfter)}</td></tr>)}</tbody></table></div>}</section>
  </>;
}

export function AgentBillingReport() {
  const [rows, setRows] = useState<AgentReservation[] | null>(null);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => { apiRequest<AgentReservation[]>('/reservations/mine').then(setRows).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load billing report')); }, []);
  const filtered = useMemo(() => (rows ?? []).filter((row) => { const date = dateValue(row.createdAt); return (!from || date >= from) && (!to || date <= to); }), [from, rows, to]);
  const total = filtered.reduce((sum, row) => sum + Number(row.totalAmount), 0);
  const paid = filtered.reduce((sum, row) => sum + Number(row.totalAmount) - Number(row.balanceAmount), 0);
  const balance = filtered.reduce((sum, row) => sum + Number(row.balanceAmount), 0);
  return <><div className="metrics agentReportMetrics"><article><span>Bookings</span><strong>{filtered.length}</strong></article><article><span>Total billing</span><strong>{money(total)}</strong></article><article><span>Paid / advanced</span><strong>{money(paid)}</strong></article><article><span>Balance pending</span><strong>{money(balance)}</strong></article></div><section className="panel agentReportCard"><div className="agentReportToolbar"><div><span className="agentReportKicker">Billing report</span><h2>Booking billing</h2></div><div className="agentReportActions"><button className="smallBtn" type="button" onClick={() => downloadCsv('rainwood-billing-report.csv', ['Booking Date', 'Reference', 'Guest', 'Hotel', 'Total', 'Paid / Advance', 'Balance', 'Payment Status'], filtered.map((row) => [dateValue(row.createdAt), row.reference, row.guestName, row.hotel.name, row.totalAmount, Number(row.totalAmount) - Number(row.balanceAmount), row.balanceAmount, row.paymentStatus]))}>Download as Excel</button></div></div><div className="agentReportFilters"><label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div><ErrorOrLoading error={error} loading={!rows} />{rows && (!filtered.length ? <p className="empty">No bookings found for the selected search criteria.</p> : <div className="tableScroll"><table><thead><tr><th>Booking date</th><th>Reference / Guest</th><th>Hotel</th><th>Total</th><th>Paid / advance</th><th>Balance</th><th>Status</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.reference}><td>{dateValue(row.createdAt)}</td><td><b>{row.reference}</b><span>{row.guestName}</span></td><td>{row.hotel.name}<span>{row.hotel.city}</span></td><td>{money(row.totalAmount)}</td><td>{money(Number(row.totalAmount) - Number(row.balanceAmount))}</td><td>{money(row.balanceAmount)}</td><td><span className={`status ${row.paymentStatus === 'PAID' ? 'ok' : 'warn'}`}>{row.paymentStatus}</span></td></tr>)}</tbody></table></div>)}</section></>;
}

export function AgentSpecialOffers() {
  const [plans, setPlans] = useState<AssignedPlan[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiRequest<AssignedPlan[]>('/reservations/mine/rate-plans').then(setPlans).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load partner offers')); }, []);
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!plans) return <p className="loading">Loading partner offers...</p>;
  return <section className="agentOfferGrid">{!plans.length ? <div className="panel"><p className="empty">No partner offers are assigned to your account yet.</p></div> : plans.map((plan) => { const nextRate = plan.rates[0]; return <article className="panel agentOfferCard" key={plan.id}><div className="agentOfferCardTop"><span className="status ok">Partner rate</span><b>{plan.code}</b></div><h2>{plan.hotel.name}</h2><p className="agentOfferCity">{plan.hotel.city}</p><h3>{plan.room.name}</h3><p>{plan.description || `${plan.mealPlan} meal plan`}</p><div className="agentOfferRate"><span>{nextRate ? `From ${money(nextRate.amount)}` : 'Rate on availability search'}</span><Link className="btn" href="/agent/book">Book this offer</Link></div></article>; })}</section>;
}
