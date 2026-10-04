'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '../lib/api';
import { todayInHotelTimezone } from '../lib/hotel-date-time';
import { CheckInDialog } from './CheckInDialog';
import { RoomChangeDialog } from './RoomChangeDialog';
import { CheckoutSettlementDialog } from './CheckoutSettlementDialog';

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
  hotel: { id: string; name: string; city: string };
  status: string;
  stayStatus: 'EXPECTED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'NO_SHOW';
  paymentStatus: string;
  guestName: string;
  mobile: string;
  email: string;
  address?: string | null;
  gstin?: string | null;
  source: string;
  sourceName?: string | null;
  businessType: string;
  groupReservation?: { id: string; groupCode: string; groupName: string; status: string } | null;
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
  checkedInAt: string | null;
  checkedInBy: Person;
  checkedOutAt: string | null;
  checkedOutBy: Person;
  roomAssignments: { id: string; room: { id: string; roomNumber: string; floor?: string | null; wing?: string | null; status: string; roomType: { id: string; name: string } }; assignedAt: string; assignedBy: Person; unassignedAt: string | null; unassignedBy: Person; reason: string | null }[];
  guestProfile?: { id: string; repeatGuest: boolean; completedStays: number; lastStay: string | null; operationalPreferences?: Record<string, unknown> } | null;
};
type Reconfirmation = { reconfirmed: boolean; reconfirmedAt: string | null; reconfirmedBy: Person };
type FolioCharge = { id: string; category: string; description: string; quantity: Money; unitAmount: Money; taxableAmount: Money; taxAmount: Money; totalAmount: Money; postingDate: string; note?: string | null; status: 'POSTED' | 'VOIDED'; postedBy: Person; voidedAt?: string | null; voidedBy: Person; voidReason?: string | null; createdAt: string };
type FolioTotals = { reservationAmount: Money; reservationPaid: Money; reservationBalance: Money; incidentalCharges: Money; incidentalPayments: Money; incidentalBalance: Money; totalOutstanding: Money };
type FolioResponse = { reference: string; currency: string; status: string; reservationAmount: Money; reservationPaid: Money; reservationBalance: Money; incidentalPayments: Money; incidentalBalance: Money; totalOutstanding: Money; charges: FolioCharge[]; totals: FolioTotals };
type ChargeForm = { category: string; description: string; quantity: string; unitAmount: string; postingDate: string; note: string };

const folioCategories = ['FOOD_AND_BEVERAGE', 'MINIBAR', 'LAUNDRY', 'EXTRA_BED', 'TRANSPORT', 'ACTIVITY', 'SPA', 'ROOM_SERVICE', 'EARLY_CHECKIN', 'LATE_CHECKOUT', 'ROOM_UPGRADE', 'DAMAGE', 'OTHER'];

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
  const [folio, setFolio] = useState<FolioResponse | null>(null);
  const [folioLoading, setFolioLoading] = useState(true);
  const [folioError, setFolioError] = useState('');
  const [folioActionError, setFolioActionError] = useState('');
  const [chargeDialogOpen, setChargeDialogOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<FolioCharge | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [folioBusy, setFolioBusy] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [chargeForm, setChargeForm] = useState<ChargeForm>({ category: 'FOOD_AND_BEVERAGE', description: '', quantity: '1', unitAmount: '', postingDate: todayInHotelTimezone(), note: '' });
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [roomChangeOpen, setRoomChangeOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setDetail(null); setSuccess(''); setActionError(''); setFolio(null); setFolioError(''); setFolioActionError(''); setFolioLoading(true);
    apiRequest<ArrivalDetail>(`/reservations/${encodeURIComponent(reference)}/detail`)
      .then((body) => { if (!cancelled) setDetail(body); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load reservation details.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    apiRequest<FolioResponse>(`/reservations/${encodeURIComponent(reference)}/folio`)
      .then((body) => { if (!cancelled) setFolio(body); })
      .catch((reason) => { if (!cancelled) setFolioError(reason instanceof Error ? reason.message : 'Unable to load the guest folio.'); })
      .finally(() => { if (!cancelled) setFolioLoading(false); });
    return () => { cancelled = true; };
  }, [reference, reloadKey]);

  useEffect(() => { apiRequest<{ user: { role: string } }>('/auth/me').then((body) => setUserRole(body.user.role)).catch(() => setUserRole('')); }, []);

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

  const canManageFolio = ['SUPER_ADMIN', 'ADMIN', 'RESERVATION'].includes(userRole);
  const folioEligible = Boolean(detail && !['CANCELLED', 'EXPIRED', 'NO_SHOW'].includes(detail.status));
  const chargePreview = Math.max(0, Number(chargeForm.quantity || 0) * Number(chargeForm.unitAmount || 0));

  function openChargeDialog() {
    setFolioActionError(''); setChargeForm({ category: 'FOOD_AND_BEVERAGE', description: '', quantity: '1', unitAmount: '', postingDate: todayInHotelTimezone(), note: '' }); setChargeDialogOpen(true);
  }

  async function submitCharge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !chargeForm.description.trim() || Number(chargeForm.quantity) <= 0 || Number(chargeForm.unitAmount) < 0 || !chargeForm.postingDate) { setFolioActionError('Enter a description, positive quantity, valid unit price, and posting date.'); return; }
    setFolioBusy(true); setFolioActionError('');
    try {
      const result = await apiRequest<FolioResponse>(`/reservations/${encodeURIComponent(detail.reference)}/folio/charges`, { method: 'POST', body: JSON.stringify({ category: chargeForm.category, description: chargeForm.description.trim(), quantity: Number(chargeForm.quantity), unitAmount: Number(chargeForm.unitAmount), postingDate: chargeForm.postingDate, note: chargeForm.note.trim() || undefined }) });
      setFolio(result); setChargeDialogOpen(false); setSuccess('Guest folio charge posted successfully.');
    } catch (reason) { setFolioActionError(reason instanceof Error ? reason.message : 'Could not post the guest folio charge.'); }
    finally { setFolioBusy(false); }
  }

  async function voidCharge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !voidTarget || voidReason.trim().length < 2) { setFolioActionError('A void reason is required.'); return; }
    setFolioBusy(true); setFolioActionError('');
    try {
      const result = await apiRequest<FolioResponse>(`/reservations/${encodeURIComponent(detail.reference)}/folio/charges/${encodeURIComponent(voidTarget.id)}/void`, { method: 'POST', body: JSON.stringify({ reason: voidReason.trim() }) });
      setFolio(result); setVoidTarget(null); setVoidReason(''); setSuccess('Guest folio charge voided. The row remains in the audit history.');
    } catch (reason) { setFolioActionError(reason instanceof Error ? reason.message : 'Could not void the guest folio charge.'); }
    finally { setFolioBusy(false); }
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
          <div className="arrivalDetailIdentity"><div><span>Reservation #</span><strong>{detail.reference}</strong><small>{detail.hotel.name}</small>{detail.groupReservation && <small className="arrivalGroupContext">Group <Link href={`/rainwood/admin/groups?open=${encodeURIComponent(detail.groupReservation.id)}`}>{detail.groupReservation.groupCode} · {detail.groupReservation.groupName}</Link></small>}</div><div className="arrivalDetailBadges"><span className="status ok">{label(detail.status)}</span><span className="status">{label(detail.paymentStatus)}</span><span className={`status ${detail.reconfirmedAt ? 'ok' : 'warn'}`}>{detail.reconfirmedAt ? 'Reconfirmed' : 'Not Reconfirmed'}</span></div></div>
          <div className="arrivalDetailSummary"><DataItem name="Arrival" value={dateLabel(detail.checkIn)} /><DataItem name="Departure" value={dateLabel(detail.checkOut)} /><DataItem name="Nights" value={nightsBetween(detail.checkIn, detail.checkOut)} /><DataItem name="Rooms" value={detail.lines.reduce((sum, line) => sum + line.rooms, 0)} /><DataItem name="Pax" value={detail.lines.reduce((sum, line) => sum + line.adults + line.children, 0)} />{Number(detail.balanceAmount) > 0 && <DataItem name="Balance Due" value={<b className="arrivalDetailBalance">{money(detail.balanceAmount)}</b>} />}</div>
          {success && <p className="arrivalDetailsSuccess" role="status">{success}</p>}
          {actionError && <p className="arrivalDetailsActionError" role="alert">{actionError}</p>}
          <section className="arrivalDetailSection"><div className="arrivalFolioHeader"><div><h3>Stay Status</h3><p>{detail.stayStatus === 'CHECKED_IN' ? `Checked in ${dateTimeLabel(detail.checkedInAt)}${detail.checkedInBy ? ` · ${detail.checkedInBy.name}` : ''}` : detail.stayStatus === 'CHECKED_OUT' ? `Checked out ${dateTimeLabel(detail.checkedOutAt)}${detail.checkedOutBy ? ` · ${detail.checkedOutBy.name}` : ''}` : 'No physical room assignment yet.'}</p></div><div>{detail.stayStatus === 'EXPECTED' && <button className="smallBtn" type="button" onClick={() => setCheckInOpen(true)}>Check In Guest</button>}{detail.stayStatus === 'CHECKED_IN' && <><button className="smallBtn secondary" type="button" onClick={() => setRoomChangeOpen(true)}>Change Room</button><button className="smallBtn secondary" type="button" disabled={busy} onClick={() => setCheckoutOpen(true)}>Check Out</button></>}</div></div><div className="arrivalDetailGrid"><DataItem name="Status" value={label(detail.stayStatus)} /><DataItem name="Assigned Rooms" value={detail.roomAssignments.filter((item) => !item.unassignedAt).map((item) => `${item.room.roomNumber} — ${item.room.roomType.name}`).join(', ') || 'None'} /></div></section>

          <section className="arrivalDetailSection"><h3>Guest Details</h3><div className="arrivalDetailGrid"><DataItem name="Guest Name" value={detail.guestName} /><DataItem name="Mobile" value={detail.mobile ? <a href={`tel:${detail.mobile}`}>{detail.mobile}</a> : '—'} /><DataItem name="Email" value={detail.email ? <a href={`mailto:${detail.email}`}>{detail.email}</a> : '—'} /><DataItem name="Address" value={detail.address || '—'} /><DataItem name="GSTIN" value={detail.gstin || '—'} /></div></section>

          {detail.guestProfile && <section className="arrivalDetailSection"><div className="arrivalFolioHeader"><div><h3>Guest History</h3><p>{detail.guestProfile.repeatGuest ? 'Returning Guest' : 'First-time guest'} · Previous completed stays: {detail.guestProfile.completedStays}{detail.guestProfile.lastStay ? ` · Last stay: ${dateLabel(detail.guestProfile.lastStay)}` : ''}</p></div><Link className="smallBtn secondary" href={`/admin/guests/${encodeURIComponent(detail.guestProfile.id)}`}>View Guest Profile</Link></div>{Object.keys(detail.guestProfile.operationalPreferences ?? {}).length > 0 && <div className="arrivalDetailGrid">{Object.entries(detail.guestProfile.operationalPreferences ?? {}).map(([key, value]) => <DataItem key={key} name={label(key)} value={Array.isArray(value) ? value.join(', ') : String(value)} />)}</div>}</section>}
          <section className="arrivalDetailSection"><h3>Stay / Room Details</h3><div className="arrivalRoomLines">{detail.lines.map((line, index) => <article className="arrivalRoomLine" key={`${line.roomType.id}-${line.ratePlan.id}-${index}`}><div className="arrivalRoomLineHeading"><strong>{line.roomType.name}</strong><span>{line.rooms} room{line.rooms === 1 ? '' : 's'}</span></div><div className="arrivalDetailGrid"><DataItem name="Rooms" value={line.rooms} /><DataItem name="Adults" value={line.adults} /><DataItem name="Children" value={line.children} /><DataItem name="Rate Plan" value={line.ratePlan.name} /><DataItem name="Check-in" value={dateLabel(line.checkIn)} /><DataItem name="Check-out" value={dateLabel(line.checkOut)} /></div>{line.nights.length > 0 && <details className="arrivalNightlyDetails"><summary>Nightly rate breakdown</summary><div>{line.nights.map((night) => <div key={night.date}><span>{dateLabel(night.date)}</span><strong>{money(night.totalAmount)}</strong></div>)}</div></details>}</article>)}</div></section>

          <section className="arrivalDetailSection"><h3>Booking Details</h3><div className="arrivalDetailGrid"><DataItem name="Booking Source" value={label(detail.source)} /><DataItem name="Source Name / Agent" value={detail.sourceName || '—'} /><DataItem name="Booked By" value={detail.createdBy?.name || '—'} /><DataItem name="Business Type" value={detail.businessType} /><DataItem name="Created Date" value={dateTimeLabel(detail.createdAt)} /></div></section>

          <section className="arrivalDetailSection"><h3>Financial Details</h3><div className="arrivalDetailGrid arrivalFinancialGrid"><DataItem name="Total Amount" value={money(detail.totalAmount)} /><DataItem name="Advance Paid" value={money(detail.advanceAmount)} /><DataItem name="Balance Due" value={money(detail.balanceAmount)} /><DataItem name="Payment Status" value={label(detail.paymentStatus)} /></div></section>

          <section className="arrivalDetailSection arrivalFolioSection"><div className="arrivalFolioHeader"><div><h3>Guest Folio</h3><p>Incidental charges are tracked separately from the original reservation balance.</p></div>{canManageFolio && folioEligible && <button className="smallBtn" type="button" onClick={openChargeDialog}>Add Charge</button>}</div>
            {folioLoading && <div className="arrivalFolioEmpty" role="status">Loading guest folio…</div>}
            {!folioLoading && folioError && <div className="arrivalFolioError" role="alert">Unable to load guest folio. <small>{folioError}</small></div>}
            {!folioLoading && !folioError && folio && <>
              <div className="arrivalDetailGrid arrivalFinancialGrid"><DataItem name="Original Reservation Balance" value={money(folio.totals.reservationBalance)} /><DataItem name="Incidental Charges" value={money(folio.totals.incidentalCharges)} /><DataItem name="Incidental Payments" value={money(folio.totals.incidentalPayments)} /><DataItem name="Total Outstanding" value={money(folio.totals.totalOutstanding)} /></div>
              {folio.charges.length === 0 ? <div className="arrivalFolioEmpty">No incidental charges have been posted.</div> : <div className="arrivalFolioTableWrap"><table className="arrivalDetailTable arrivalFolioTable"><thead><tr><th>Description</th><th>Category</th><th>Qty</th><th>Unit Price</th><th>Tax</th><th>Total</th><th>Posted</th><th>Posted By</th><th>Status</th><th>Actions</th></tr></thead><tbody>{folio.charges.map((charge) => <tr className={charge.status === 'VOIDED' ? 'arrivalFolioRowVoided' : ''} key={charge.id}><td><strong>{charge.description}</strong>{charge.note && <small>{charge.note}</small>}{charge.voidReason && <small>Void reason: {charge.voidReason}</small>}</td><td>{label(charge.category)}</td><td>{charge.quantity}</td><td>{money(charge.unitAmount)}</td><td>{money(charge.taxAmount)}</td><td>{money(charge.totalAmount)}</td><td>{dateLabel(charge.postingDate)}</td><td>{charge.postedBy?.name || '—'}</td><td><span className={`status ${charge.status === 'POSTED' ? 'ok' : 'warn'}`}>{label(charge.status)}</span></td><td>{charge.status === 'POSTED' && canManageFolio && folioEligible && <button className="smallBtn secondary" type="button" onClick={() => { setFolioActionError(''); setVoidTarget(charge); }}>Void</button>}</td></tr>)}</tbody></table></div>}
            </>}
          </section>

          <section className="arrivalDetailSection"><h3>Payment History</h3>{detail.payments.length > 0 ? <div className="arrivalDetailTableWrap"><table className="arrivalDetailTable"><thead><tr><th>Date</th><th>Mode</th><th>Amount</th><th>Status</th></tr></thead><tbody>{detail.payments.map((payment) => <tr key={payment.id}><td>{dateTimeLabel(payment.paidAt || payment.createdAt)}</td><td>{label(payment.mode)}</td><td>{money(payment.amount)}</td><td><span className={`status ${payment.verified ? 'ok' : 'warn'}`}>{payment.verified ? 'Verified' : 'Pending verification'}</span></td></tr>)}</tbody></table></div> : <div className="arrivalFolioEmpty">No payments recorded.</div>}{detail.paymentSchedule?.milestones?.length ? <div className="arrivalDetailTableWrap"><h4>Payment Schedule</h4><table className="arrivalDetailTable"><thead><tr><th>Milestone</th><th>Amount</th><th>Due Date</th><th>Status</th></tr></thead><tbody>{detail.paymentSchedule.milestones.map((item, index) => <tr key={`${item.dueAt}-${index}`}><td>{milestoneLabel(item)}</td><td>{money(item.amount)}</td><td>{dateLabel(item.dueAt)}</td><td><span className={`status ${item.status === 'PAID' ? 'ok' : item.status === 'DUE' || item.status === 'PARTIALLY_PAID' ? 'warn' : ''}`}>{label(item.status)}</span></td></tr>)}</tbody></table></div> : null}</section>

          {(detail.specialRequest || detail.billingInstruction || detail.internalRemark) && <section className="arrivalDetailSection"><h3>Remarks / Arrival Instructions</h3><div className="arrivalRemarksGrid">{detail.specialRequest && <div><span>Special Request</span><p>{detail.specialRequest}</p></div>}{detail.billingInstruction && <div><span>Billing Instruction</span><p>{detail.billingInstruction}</p></div>}{detail.internalRemark && <div><span>Internal Remark</span><p>{detail.internalRemark}</p></div>}</div></section>}

          <section className="arrivalDetailSection"><h3>Reconfirmation</h3><div className="arrivalReconfirmation"><div><span>Status</span><strong>{detail.reconfirmedAt ? 'Reconfirmed' : 'Not Reconfirmed'}</strong>{detail.reconfirmedAt && <small>{dateTimeLabel(detail.reconfirmedAt)}{detail.reconfirmedBy ? ` · ${detail.reconfirmedBy.name}` : ''}</small>}</div>{!detail.reconfirmedAt && <button className="smallBtn" type="button" disabled={busy} onClick={() => void reconfirm()}>{busy ? 'Saving…' : 'Reconfirm Arrival'}</button>}</div></section>
        </>}
      </div>
      <footer className="arrivalDetailsFooter"><button className="smallBtn secondary" type="button" onClick={onClose}>Close</button></footer>
      {chargeDialogOpen && <div className="arrivalFolioDialogBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setChargeDialogOpen(false); }}><section className="arrivalFolioDialog" role="dialog" aria-modal="true" aria-labelledby="arrival-folio-add-title"><header><div><span className="eyebrow">Guest Folio</span><h3 id="arrival-folio-add-title">Add Charge</h3></div><button className="uiModalClose" type="button" aria-label="Close add charge dialog" onClick={() => setChargeDialogOpen(false)}>Ã—</button></header><form onSubmit={(event) => void submitCharge(event)}><div className="arrivalFolioFormGrid"><label>Category<select value={chargeForm.category} onChange={(event) => setChargeForm((current) => ({ ...current, category: event.target.value }))}>{folioCategories.map((category) => <option key={category} value={category}>{label(category)}</option>)}</select></label><label>Description<input required minLength={2} maxLength={160} value={chargeForm.description} onChange={(event) => setChargeForm((current) => ({ ...current, description: event.target.value }))} placeholder="e.g. Airport transfer" /></label><label>Quantity<input required min="0.01" step="0.01" type="number" value={chargeForm.quantity} onChange={(event) => setChargeForm((current) => ({ ...current, quantity: event.target.value }))} /></label><label>Unit price<input required min="0" step="0.01" type="number" value={chargeForm.unitAmount} onChange={(event) => setChargeForm((current) => ({ ...current, unitAmount: event.target.value }))} placeholder="0.00" /></label><label>Posting date<input required type="date" value={chargeForm.postingDate} onChange={(event) => setChargeForm((current) => ({ ...current, postingDate: event.target.value }))} /></label><label>Notes<input maxLength={500} value={chargeForm.note} onChange={(event) => setChargeForm((current) => ({ ...current, note: event.target.value }))} placeholder="Optional operational note" /></label></div><div className="arrivalFolioPreview"><span>Backend-calculated preview</span><strong>{money(chargePreview)}</strong><small>Tax is currently 0.00; the server remains authoritative for the final total.</small></div>{folioActionError && <p className="arrivalDetailsActionError" role="alert">{folioActionError}</p>}<footer><button className="smallBtn secondary" type="button" onClick={() => setChargeDialogOpen(false)}>Cancel</button><button className="smallBtn" type="submit" disabled={folioBusy}>{folioBusy ? 'Posting…' : 'Post Charge'}</button></footer></form></section></div>}
      {voidTarget && <div className="arrivalFolioDialogBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setVoidTarget(null); }}><section className="arrivalFolioDialog arrivalFolioVoidDialog" role="dialog" aria-modal="true" aria-labelledby="arrival-folio-void-title"><header><div><span className="eyebrow">Guest Folio</span><h3 id="arrival-folio-void-title">Void Guest Charge</h3></div><button className="uiModalClose" type="button" aria-label="Close void dialog" onClick={() => setVoidTarget(null)}>Ã—</button></header><form onSubmit={(event) => void voidCharge(event)}><p>Voiding keeps <strong>{voidTarget.description}</strong> in the folio history and removes it from active totals.</p><label>Reason<textarea required minLength={2} maxLength={500} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Explain why this charge is being voided" /></label>{folioActionError && <p className="arrivalDetailsActionError" role="alert">{folioActionError}</p>}<footer><button className="smallBtn secondary" type="button" onClick={() => setVoidTarget(null)}>Cancel</button><button className="smallBtn" type="submit" disabled={folioBusy}>{folioBusy ? 'Voiding…' : 'Void Charge'}</button></footer></form></section></div>}
      {checkInOpen && <CheckInDialog reference={reference} onClose={() => setCheckInOpen(false)} onSuccess={() => { setCheckInOpen(false); setSuccess('Guest checked in successfully.'); setReloadKey((value) => value + 1); }} />}
      {roomChangeOpen && <RoomChangeDialog reference={reference} hotelId={detail?.hotel.id ?? ''} assignments={(detail?.roomAssignments ?? []).filter((item) => !item.unassignedAt)} onClose={() => setRoomChangeOpen(false)} onSuccess={() => { setRoomChangeOpen(false); setSuccess('Room changed successfully. The previous room is DIRTY for housekeeping.'); setReloadKey((value) => value + 1); }} />}
      {checkoutOpen && <CheckoutSettlementDialog reference={reference} onClose={() => { setCheckoutOpen(false); setSuccess('Guest checkout finalized. Assigned rooms are now DIRTY for housekeeping.'); setReloadKey((value) => value + 1); }} />}
    </section>
  </div>;
}
