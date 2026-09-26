'use client';

import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';

type Money = number | string;
type Person = { id: string; name: string } | null;
type Night = { date: string; rooms: number; amount: Money; taxAmount: Money; totalAmount: Money };
type DetailLine = {
  roomType: { id: string; name: string };
  ratePlan: { id: string; name: string };
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children: number;
  nightlyRate: Money;
  taxAmount: Money;
  lineTotal: Money;
  nights: Night[];
};
type Payment = { id: string; amount: Money; mode: string; verified: boolean; paidAt: string | null; createdAt: string };
type PaymentSchedule = { milestones: { percentage: number | string; dueType: string; daysBeforeCheckIn?: number | null; amount: Money; dueAt: string; paidAmount: Money; outstandingAmount: Money; dueNow: boolean; status: 'PAID' | 'PARTIALLY_PAID' | 'DUE' | 'UPCOMING' }[]; paidAmount: Money; outstandingAmount: Money } | null;
type ArrivalDetail = {
  reference: string;
  hotel: { name: string; city: string };
  status: string;
  paymentStatus: string;
  guestName: string;
  mobile: string;
  email: string;
  address?: string | null;
  gstin?: string | null;
  source: string;
  sourceName?: string | null;
  businessType: string;
  createdAt: string;
  createdBy: Person;
  checkIn: string;
  checkOut: string;
  totalAmount: Money;
  advanceAmount: Money;
  balanceAmount: Money;
  lines: DetailLine[];
  payments: Payment[];
  paymentSchedule?: PaymentSchedule;
  specialRequest?: string | null;
  billingInstruction?: string | null;
  internalRemark?: string | null;
  reconfirmedAt: string | null;
  reconfirmedBy: Person;
};
type Reconfirmation = { reconfirmed: boolean; reconfirmedAt: string | null; reconfirmedBy: Person };

function money(value: Money) { return `INR ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function dateLabel(value?: string | null) { return value ? new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'; }
function dateTimeLabel(value?: string | null) { return value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
function nightsBetween(from: string, to: string) { return Math.max(0, Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86400000)); }
function label(value: string) { return value.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()); }
function milestoneLabel(item: { dueType: string; daysBeforeCheckIn?: number | null }) { return item.dueType === 'DAYS_BEFORE_CHECKIN' && item.daysBeforeCheckIn ? `${item.daysBeforeCheckIn} days before arrival` : label(item.dueType); }

function DataItem({ name, value }: { name: string; value: React.ReactNode }) {
  return <div className="arrivalDetailItem"><span>{name}</span><strong>{value}</strong></div>;
}

export function ArrivalDetailsModal({ reference, onClose, onReconfirmed }: { reference: string; onClose: () => void; onReconfirmed: (reference: string, result: Reconfirmation) => void }) {
  const [detail, setDetail] = useState<ArrivalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setDetail(null); setSuccess(''); setActionError('');
    apiRequest<ArrivalDetail>(`/reservations/${encodeURIComponent(reference)}/detail`)
      .then((body) => { if (!cancelled) setDetail(body); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load reservation details.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reference, reloadKey]);

  useEffect(() => {
    closeButtonRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function reconfirm() {
    if (!detail) return;
    setBusy(true); setActionError(''); setSuccess('');
    try {
      const result = await apiRequest<Reconfirmation>(`/reservations/${encodeURIComponent(detail.reference)}/reconfirmation`, { method: 'PATCH', body: JSON.stringify({ reconfirmed: true }) });
      setDetail((current) => current ? { ...current, reconfirmedAt: result.reconfirmedAt, reconfirmedBy: result.reconfirmedBy } : current);
      onReconfirmed(detail.reference, result);
      setSuccess('Arrival reconfirmed successfully.');
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Could not reconfirm arrival.');
    } finally { setBusy(false); }
  }

  return <div className="arrivalDetailsBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="arrivalDetailsModal" role="dialog" aria-modal="true" aria-labelledby="arrival-details-title">
      <header className="arrivalDetailsHeader">
        <div><span className="eyebrow">Front Desk Operations</span><h2 id="arrival-details-title">Arrival Details</h2><p>{reference}</p></div>
        <button ref={closeButtonRef} className="uiModalClose" type="button" aria-label="Close arrival details" onClick={onClose}>×</button>
      </header>
      <div className="arrivalDetailsBody">
        {loading && <div className="arrivalDetailsLoading" role="status"><span className="arrivalDetailsSpinner" /> Loading reservation details…</div>}
        {!loading && error && <div className="arrivalDetailsError" role="alert"><p>Unable to load reservation details.</p><small>{error}</small><div><button className="smallBtn" type="button" onClick={() => setReloadKey((value) => value + 1)}>Retry</button><button className="smallBtn secondary" type="button" onClick={onClose}>Close</button></div></div>}
        {!loading && !error && detail && <>
          <div className="arrivalDetailIdentity"><div><span>Reservation #</span><strong>{detail.reference}</strong><small>{detail.hotel.name}</small></div><div className="arrivalDetailBadges"><span className="status ok">{label(detail.status)}</span><span className="status">{label(detail.paymentStatus)}</span><span className={`status ${detail.reconfirmedAt ? 'ok' : 'warn'}`}>{detail.reconfirmedAt ? 'Reconfirmed' : 'Not Reconfirmed'}</span></div></div>
          <div className="arrivalDetailSummary"><DataItem name="Arrival" value={dateLabel(detail.checkIn)} /><DataItem name="Departure" value={dateLabel(detail.checkOut)} /><DataItem name="Nights" value={nightsBetween(detail.checkIn, detail.checkOut)} /><DataItem name="Rooms" value={detail.lines.reduce((sum, line) => sum + line.rooms, 0)} /><DataItem name="Pax" value={detail.lines.reduce((sum, line) => sum + line.rooms * (line.adults + line.children), 0)} />{Number(detail.balanceAmount) > 0 && <DataItem name="Balance Due" value={<b className="arrivalDetailBalance">{money(detail.balanceAmount)}</b>} />}</div>
          {success && <p className="arrivalDetailsSuccess" role="status">{success}</p>}
          {actionError && <p className="arrivalDetailsActionError" role="alert">{actionError}</p>}

          <section className="arrivalDetailSection"><h3>Guest Details</h3><div className="arrivalDetailGrid"><DataItem name="Guest Name" value={detail.guestName} /><DataItem name="Mobile" value={detail.mobile ? <a href={`tel:${detail.mobile}`}>{detail.mobile}</a> : '—'} /><DataItem name="Email" value={detail.email ? <a href={`mailto:${detail.email}`}>{detail.email}</a> : '—'} /><DataItem name="Address" value={detail.address || '—'} /><DataItem name="GSTIN" value={detail.gstin || '—'} /></div></section>

          <section className="arrivalDetailSection"><h3>Stay / Room Details</h3><div className="arrivalRoomLines">{detail.lines.map((line, index) => <article className="arrivalRoomLine" key={`${line.roomType.id}-${line.ratePlan.id}-${index}`}><div className="arrivalRoomLineHeading"><strong>{line.roomType.name}</strong><span>{line.rooms} room{line.rooms === 1 ? '' : 's'}</span></div><div className="arrivalDetailGrid"><DataItem name="Rooms" value={line.rooms} /><DataItem name="Adults" value={line.adults} /><DataItem name="Children" value={line.children} /><DataItem name="Rate Plan" value={line.ratePlan.name} /><DataItem name="Check-in" value={dateLabel(line.checkIn)} /><DataItem name="Check-out" value={dateLabel(line.checkOut)} /></div>{line.nights.length > 0 && <details className="arrivalNightlyDetails"><summary>Nightly rate breakdown</summary><div>{line.nights.map((night) => <div key={night.date}><span>{dateLabel(night.date)}</span><strong>{money(night.totalAmount)}</strong></div>)}</div></details>}</article>)}</div></section>

          <section className="arrivalDetailSection"><h3>Booking Details</h3><div className="arrivalDetailGrid"><DataItem name="Booking Source" value={label(detail.source)} /><DataItem name="Source Name / Agent" value={detail.sourceName || '—'} /><DataItem name="Booked By" value={detail.createdBy?.name || '—'} /><DataItem name="Business Type" value={detail.businessType} /><DataItem name="Created Date" value={dateTimeLabel(detail.createdAt)} /></div></section>

          <section className="arrivalDetailSection"><h3>Financial Details</h3><div className="arrivalDetailGrid arrivalFinancialGrid"><DataItem name="Total Amount" value={money(detail.totalAmount)} /><DataItem name="Advance Paid" value={money(detail.advanceAmount)} /><DataItem name="Balance Due" value={money(detail.balanceAmount)} /><DataItem name="Payment Status" value={label(detail.paymentStatus)} /></div>{detail.payments.length > 0 && <div className="arrivalDetailTableWrap"><h4>Payment History</h4><table className="arrivalDetailTable"><thead><tr><th>Date</th><th>Mode</th><th>Amount</th><th>Status</th></tr></thead><tbody>{detail.payments.map((payment) => <tr key={payment.id}><td>{dateTimeLabel(payment.paidAt || payment.createdAt)}</td><td>{label(payment.mode)}</td><td>{money(payment.amount)}</td><td><span className={`status ${payment.verified ? 'ok' : 'warn'}`}>{payment.verified ? 'Verified' : 'Pending verification'}</span></td></tr>)}</tbody></table></div>}{detail.paymentSchedule?.milestones?.length ? <div className="arrivalDetailTableWrap"><h4>Payment Schedule</h4><table className="arrivalDetailTable"><thead><tr><th>Milestone</th><th>Amount</th><th>Due Date</th><th>Status</th></tr></thead><tbody>{detail.paymentSchedule.milestones.map((item, index) => <tr key={`${item.dueAt}-${index}`}><td>{milestoneLabel(item)}</td><td>{money(item.amount)}</td><td>{dateLabel(item.dueAt)}</td><td><span className={`status ${item.status === 'PAID' ? 'ok' : item.status === 'DUE' || item.status === 'PARTIALLY_PAID' ? 'warn' : ''}`}>{label(item.status)}</span></td></tr>)}</tbody></table></div> : null}</section>

          {(detail.specialRequest || detail.billingInstruction || detail.internalRemark) && <section className="arrivalDetailSection"><h3>Remarks / Arrival Instructions</h3><div className="arrivalRemarksGrid">{detail.specialRequest && <div><span>Special Request</span><p>{detail.specialRequest}</p></div>}{detail.billingInstruction && <div><span>Billing Instruction</span><p>{detail.billingInstruction}</p></div>}{detail.internalRemark && <div><span>Internal Remark</span><p>{detail.internalRemark}</p></div>}</div></section>}

          <section className="arrivalDetailSection"><h3>Reconfirmation</h3><div className="arrivalReconfirmation"><div><span>Status</span><strong>{detail.reconfirmedAt ? 'Reconfirmed' : 'Not Reconfirmed'}</strong>{detail.reconfirmedAt && <small>{dateTimeLabel(detail.reconfirmedAt)}{detail.reconfirmedBy ? ` · ${detail.reconfirmedBy.name}` : ''}</small>}</div>{!detail.reconfirmedAt && <button className="smallBtn" type="button" disabled={busy} onClick={() => void reconfirm()}>{busy ? 'Saving…' : 'Reconfirm Arrival'}</button>}</div></section>
        </>}
      </div>
      <footer className="arrivalDetailsFooter"><button className="smallBtn secondary" type="button" onClick={onClose}>Close</button></footer>
    </section>
  </div>;
}
