'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

type PaymentMode = 'GATEWAY' | 'WALLET' | 'UPI' | 'BANK_TRANSFER' | 'CASH' | 'COMPANY_CREDIT';
type CheckoutPreview = {
  reservation: { reference: string; amount: number | string; advance: number | string; paid: number | string; balance: number | string };
  folio: { postedCharges: number | string; incidentals: { id: string; description: string; category: string; quantity: number; totalAmount: number; postingDate: string }[] };
  payments: { totalPaid: number | string; items: { id: string; amount: number | string; mode: string; reference?: string | null; paidAt: string | null }[] };
  settlement: { grossAmount: number | string; paidAmount: number | string; outstandingAmount: number | string; status: string; finalFolioNumber: string | null };
  stay: { stayStatus: string; checkIn: string; checkOut: string; assignedRooms: { id: string; roomNumber: string; roomType: string | null; status: string }[] };
};
type CheckoutResult = { reference: string; stayStatus: string; status: string; finalFolioNumber: string; settlement: { grossAmount: number; incidentalAmount: number; paidAmount: number; balanceAmount: number; settledAt: string }; snapshot: any };

function money(value: number | string) { return `INR ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function dateLabel(value?: string | null) { return value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'; }
function label(value: string) { return value.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()); }
export function escapeHtml(value: unknown) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character)); }

export function buildFinalFolioPrintHtml(folio: CheckoutResult) {
  const snapshot = folio.snapshot ?? {};
  const hotelName = snapshot.hotel?.name ?? 'RainWood Hotels';
  const guest = snapshot.guest ?? {};
  const rooms = (snapshot.stay?.rooms ?? []).map((room: any) => `<li>Room ${escapeHtml(room.roomNumber)}${room.roomType ? ` · ${escapeHtml(room.roomType)}` : ''}</li>`).join('');
  const charges = (snapshot.charges?.incidentals ?? []).map((charge: any) => `<tr><td>${escapeHtml(charge.description)}</td><td>${escapeHtml(label(charge.category))}</td><td>${money(charge.totalAmount)}</td></tr>`).join('');
  const payments = (snapshot.payments ?? []).map((payment: any) => `<tr><td>${escapeHtml(label(payment.mode))}</td><td>${escapeHtml(payment.reference)}</td><td>${money(payment.amount)}</td></tr>`).join('');
  const override = snapshot.override?.authorizedBy?.name ?? snapshot.authorizedBy;
  return `<html><head><title>${escapeHtml(folio.finalFolioNumber)}</title><style>body{font:14px Arial;color:#12344d;padding:32px}h1{margin:0 0 6px}h2{border-bottom:1px solid #d6e3e8;padding-bottom:6px}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{padding:9px;border-bottom:1px solid #d6e3e8;text-align:left}.total{font-size:18px;font-weight:700}</style></head><body><h1>${escapeHtml(hotelName)}</h1><p>Final Folio: <strong>${escapeHtml(folio.finalFolioNumber)}</strong></p><p>Reservation: ${escapeHtml(folio.reference)} · Guest: ${escapeHtml(guest.name)} · Email: ${escapeHtml(guest.email)} · Mobile: ${escapeHtml(guest.mobile)} · GSTIN: ${escapeHtml(guest.gstin)}</p><h2>Stay</h2><ul>${rooms}</ul><h2>Charges</h2><table><thead><tr><th>Description</th><th>Category</th><th>Total</th></tr></thead><tbody><tr><td>Reservation stay</td><td>Room</td><td>${money(folio.settlement.grossAmount - folio.settlement.incidentalAmount)}</td></tr>${charges}</tbody></table><h2>Payments</h2><table><thead><tr><th>Mode</th><th>Reference</th><th>Amount</th></tr></thead><tbody>${payments}</tbody></table><p class="total">Gross: ${money(folio.settlement.grossAmount)} · Paid: ${money(folio.settlement.paidAmount)} · Balance: ${money(folio.settlement.balanceAmount)}</p>${snapshot.overrideReason ? `<p>Override reason: ${escapeHtml(snapshot.overrideReason)}</p>` : ''}${override ? `<p>Authorized by: ${escapeHtml(override)}</p>` : ''}${snapshot.notes ? `<p>Note: ${escapeHtml(snapshot.notes)}</p>` : ''}<p>Settled at: ${escapeHtml(new Date(folio.settlement.settledAt).toLocaleString('en-IN'))}</p></body></html>`;
}

export function CheckoutSettlementDialog({ reference, onClose }: { reference: string; onClose: () => void }) {
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [currentRole, setCurrentRole] = useState('');
  const [note, setNote] = useState('');

  async function loadPreview() {
    setLoading(true); setError('');
    try {
      const body = await apiRequest<CheckoutPreview>(`/reservations/${encodeURIComponent(reference)}/checkout-preview`);
      setPreview(body);
      const outstanding = Number(body.settlement.outstandingAmount);
      setPaymentAmount(outstanding > 0 ? outstanding.toFixed(2) : '');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load checkout preview.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadPreview(); void apiRequest<{ user: { role: string } }>('/auth/me').then((body) => setCurrentRole(body.user.role)).catch(() => setCurrentRole('')); }, [reference]);

  const outstanding = Number(preview?.settlement.outstandingAmount ?? 0);
  const amount = Number(paymentAmount);
  const canPay = Number.isFinite(amount) && amount > 0 && amount <= outstanding + 0.005;
  const canAuthorizeOverride = ['ADMIN', 'SUPER_ADMIN'].includes(currentRole);
  const overrideReady = Boolean(canAuthorizeOverride && overrideReason);
  const canCheckout = outstanding <= 0.005 || overrideReady;
  const totalLabel = useMemo(() => preview ? `${money(preview.settlement.grossAmount)} gross · ${money(preview.settlement.paidAmount)} paid` : '', [preview]);

  async function recordPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canPay) { setError('Enter a payment amount within the outstanding balance.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      await apiRequest(`/reservations/${encodeURIComponent(reference)}/checkout-payment`, { method: 'POST', body: JSON.stringify({ amount, mode: paymentMode, reference: paymentReference.trim() || undefined, idempotencyKey: `checkout-${reference}-${Date.now()}` }) });
      setSuccess('Payment recorded and verified.'); setPaymentReference(''); await loadPreview();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not record payment.'); }
    finally { setBusy(false); }
  }

  async function completeCheckout() {
    if (!canCheckout) { setError('Record the outstanding balance or select an authorized override reason.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      const body = await apiRequest<CheckoutResult>(`/reservations/${encodeURIComponent(reference)}/check-out`, { method: 'POST', body: JSON.stringify({ allowOutstanding: outstanding > 0.005, overrideReason: outstanding > 0.005 ? overrideReason : undefined, note: note.trim() || undefined }) });
      setResult(body); setSuccess('Checkout finalized. The final folio is now immutable.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not finalize checkout.'); }
    finally { setBusy(false); }
  }

  async function printFolio() {
    if (!result) return;
    const folio = await apiRequest<CheckoutResult>(`/reservations/${encodeURIComponent(reference)}/final-folio`);
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=900,height=720');
    if (!popup) { setError('Allow pop-ups to print the final folio.'); return; }
    popup.document.open();
    popup.document.write(buildFinalFolioPrintHtml(folio));
    popup.document.close(); popup.focus(); popup.print();
  }

  return <div className="arrivalFolioDialogBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="arrivalFolioDialog checkoutDialog" role="dialog" aria-modal="true" aria-labelledby="checkout-settlement-title">
      <header><div><span className="eyebrow">Front Desk Settlement</span><h3 id="checkout-settlement-title">Checkout settlement</h3><p>{reference}</p></div><button className="uiModalClose" type="button" aria-label="Close checkout settlement" onClick={onClose}>×</button></header>
      <div className="checkoutDialogBody">
        {loading && <div className="arrivalFolioEmpty" role="status">Loading checkout preview…</div>}
        {!loading && error && <p className="arrivalFolioError" role="alert">{error}</p>}
        {!loading && preview && !result && <>
          <div className="checkoutTotals"><div><span>Reservation</span><strong>{money(preview.reservation.amount)}</strong></div><div><span>Incidentals</span><strong>{money(preview.folio.postedCharges)}</strong></div><div><span>Gross total</span><strong>{money(preview.settlement.grossAmount)}</strong></div><div><span>Outstanding</span><strong className={outstanding > 0.005 ? 'checkoutOutstanding' : 'checkoutPaid'}>{money(outstanding)}</strong></div></div>
          <p className="checkoutHint">{totalLabel}. Incidentals remain separate from the original reservation amount and are included only in the final folio.</p>
          {preview.folio.incidentals.length > 0 && <div className="arrivalFolioTableWrap"><table className="arrivalDetailTable arrivalFolioTable"><thead><tr><th>Charge</th><th>Category</th><th>Total</th><th>Date</th></tr></thead><tbody>{preview.folio.incidentals.map((charge) => <tr key={charge.id}><td>{charge.description}</td><td>{label(charge.category)}</td><td>{money(charge.totalAmount)}</td><td>{dateLabel(charge.postingDate)}</td></tr>)}</tbody></table></div>}
          {outstanding > 0.005 && <form className="checkoutPaymentForm" onSubmit={(event) => void recordPayment(event)}><h4>Record checkout payment</h4><div className="arrivalFolioFormGrid"><label>Amount<input type="number" min="0.01" max={outstanding.toFixed(2)} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label><label>Mode<select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as PaymentMode)}><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="UPI">UPI</option><option value="WALLET">Wallet</option><option value="GATEWAY">Gateway</option><option value="COMPANY_CREDIT">Company credit</option></select></label><label>Reference<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Optional receipt/reference" /></label></div><button className="smallBtn" type="submit" disabled={busy || !canPay}>{busy ? 'Recording…' : 'Record payment'}</button></form>}
          {outstanding > 0.005 && <div className="checkoutOverride"><h4>Authorized outstanding override</h4><p>Use only when the balance is approved as credit or written off. The signed-in Admin or Super Admin is recorded as the approver in the immutable settlement snapshot and audit log.</p>{canAuthorizeOverride ? <div className="arrivalFolioFormGrid"><label>Reason<select value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)}><option value="">Select reason</option><option value="COMPANY_CREDIT">Company credit</option><option value="AGENT_CREDIT">Agent credit</option><option value="MANAGEMENT_APPROVAL">Management approval</option><option value="WRITE_OFF">Write-off</option><option value="OTHER">Other</option></select></label><label>Checkout note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional operational note" /></label></div> : <p className="checkoutPaidMessage">Only Admin or Super Admin users can authorize an outstanding-balance checkout.</p>}</div>}
          {outstanding <= 0.005 && <p className="checkoutPaidMessage">The folio is fully settled. Checkout can be finalized.</p>}
          {success && <p className="arrivalDetailsSuccess" role="status">{success}</p>}
        </>}
        {result && <div className="checkoutComplete"><p className="checkoutPaidMessage">{success}</p><h4>Final folio created</h4><p><strong>{result.finalFolioNumber}</strong></p><div className="checkoutTotals"><div><span>Status</span><strong>{label(result.status)}</strong></div><div><span>Gross total</span><strong>{money(result.settlement.grossAmount)}</strong></div><div><span>Paid</span><strong>{money(result.settlement.paidAmount)}</strong></div><div><span>Balance</span><strong>{money(result.settlement.balanceAmount)}</strong></div></div><p>Assigned rooms are now DIRTY and housekeeping tasks have been created. Further folio postings are blocked.</p></div>}
      </div>
      <footer className="checkoutDialogFooter"><button className="smallBtn secondary" type="button" onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>{result ? <button className="smallBtn" type="button" onClick={() => void printFolio()}>Print Final Folio</button> : <button className="smallBtn" type="button" disabled={busy || loading || !preview || !canCheckout} onClick={() => void completeCheckout()}>{busy ? 'Finalizing…' : 'Complete checkout'}</button>}</footer>
    </section>
  </div>;
}
