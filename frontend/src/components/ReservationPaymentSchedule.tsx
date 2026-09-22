'use client';

export type PaymentScheduleItem = {
  percentage: number | string;
  dueType: string;
  daysBeforeCheckIn?: number | null;
  amount: number | string;
  dueAt: string;
  paidAmount: number | string;
  outstandingAmount: number | string;
  status: 'PAID' | 'PARTIALLY_PAID' | 'DUE' | 'UPCOMING';
};

export type PaymentSchedule = { milestones: PaymentScheduleItem[]; paidAmount: number | string; outstandingAmount: number | string };

function money(value: number | string) { return `INR ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function dueLabel(item: PaymentScheduleItem) {
  if (item.dueType === 'ON_BOOKING') return 'On Booking';
  if (Number(item.daysBeforeCheckIn ?? 0) === 0) return 'Check-in';
  return new Date(item.dueAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function statusLabel(status: PaymentScheduleItem['status']) { return ({ PAID: 'Paid', PARTIALLY_PAID: 'Partially paid', DUE: 'Due', UPCOMING: 'Upcoming' })[status]; }

export function ReservationPaymentSchedule({ schedule, onPay, busy = false }: { schedule?: PaymentSchedule | null; onPay?: () => void; busy?: boolean }) {
  if (!schedule?.milestones?.length) return null;
  return <section className="panel reservationPaymentSchedule" data-testid="payment-schedule"><div className="rangeSectionHeader"><div><span className="eyebrow">Saved reservation terms</span><h3>Payment schedule</h3></div><strong>Outstanding {money(schedule.outstandingAmount)}</strong></div><div className="paymentScheduleRows">{schedule.milestones.map((item, index) => <div className="paymentScheduleRow" key={`${item.dueAt}-${item.dueType}-${index}`}><span className={`paymentScheduleIcon ${item.status.toLowerCase()}`}>{item.status === 'PAID' ? '✓' : item.status === 'DUE' || item.status === 'PARTIALLY_PAID' ? '!' : '○'}</span><div><b>{dueLabel(item)}</b><small>{Number(item.percentage)}% of reservation total</small></div><strong>{money(item.amount)}</strong><span className={`status ${item.status === 'PAID' ? 'ok' : item.status === 'DUE' || item.status === 'PARTIALLY_PAID' ? 'warn' : 'muted'}`}>{statusLabel(item.status)}</span>{onPay && (item.status === 'DUE' || item.status === 'PARTIALLY_PAID') && <button className="smallBtn" type="button" disabled={busy} onClick={onPay}>{busy ? 'Paying...' : `Pay ${money(item.outstandingAmount)}`}</button>}</div>)}</div><div className="paymentScheduleTotals"><span>Total paid {money(schedule.paidAmount)}</span><b>Outstanding {money(schedule.outstandingAmount)}</b></div></section>;
}
