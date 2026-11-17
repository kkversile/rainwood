'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import { createRetryableSubmission } from '../lib/retryable-submission';
import { useNavigationDialog } from '../lib/use-navigation-dialog';

type Payment = { amount: number; mode: string; reference?: string };

export function BookingPaymentDialog({ reference, balance, onClose, onRecorded }: { reference: string; balance: number; onClose: () => void; onRecorded: () => void }) {
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [mode, setMode] = useState('BANK_TRANSFER');
  const [receipt, setReceipt] = useState('');
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const submission = useRef(createRetryableSubmission<Payment, { id: string }>());
  const valid = Number.isFinite(Number(amount)) && Number(amount) > 0 && Number(amount) <= balance;
  const close = () => { if (!busy) onClose(); };
  useEffect(() => { triggerRef.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null; }, []);
  useNavigationDialog(true, dialogRef, triggerRef, close, true);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || busy || recorded) return;
    setBusy(true); setError('');
    try {
      await submission.current.submit({ amount: Number(amount), mode, reference: receipt.trim() || undefined }, (body) => apiRequest(`/payments/${encodeURIComponent(reference)}/manual`, { method: 'POST', body: JSON.stringify(body) }));
      setRecorded(true); onRecorded();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not record the payment. Retry without changing the details.'); }
    finally { setBusy(false); }
  }

  return <div className="arrivalFolioDialogBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section ref={dialogRef} className="arrivalFolioDialog" role="dialog" aria-modal="true" aria-labelledby="booking-payment-title"><header><div><span className="eyebrow">Front Desk Payments</span><h3 id="booking-payment-title">Record booking payment</h3><p>{reference}</p></div><button className="uiModalClose" type="button" aria-label="Close booking payment" disabled={busy} onClick={close}>×</button></header>{recorded ? <div className="checkoutDialogBody"><p className="checkoutPaidMessage" role="status">Payment recorded and awaiting approval. An authorized payment reviewer must approve it before it counts toward the booking balance.</p><Link className="smallBtn" href="/admin/payments">Review payment in Payments</Link><footer><button className="smallBtn secondary" type="button" onClick={close}>Close</button></footer></div> : <form onSubmit={(event) => void submit(event)}><p>Record a payment already received. Outstanding booking balance: INR {balance.toFixed(2)}. This records a receipt; it does not initiate a transfer.</p><div className="arrivalFolioFormGrid"><label>Amount<input aria-label="Booking payment amount" type="number" min="0.01" max={balance} step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label>Mode<select aria-label="Booking payment mode" value={mode} onChange={(event) => setMode(event.target.value)}><option value="BANK_TRANSFER">Bank transfer</option><option value="UPI">UPI</option><option value="CASH">Cash</option><option value="CHEQUE">Cheque</option><option value="CARD">Card</option></select></label><label>Reference<input aria-label="Booking payment reference" value={receipt} onChange={(event) => setReceipt(event.target.value)} placeholder="Receipt or transaction reference" /></label></div>{error && <p className="error" role="alert">{error}</p>}<footer><button className="smallBtn secondary" type="button" disabled={busy} onClick={close}>Cancel</button><button className="smallBtn" type="submit" disabled={busy || !valid}>{busy ? 'Recording…' : 'Record payment'}</button></footer></form>}</section></div>;
}
