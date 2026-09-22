'use client';

export type DueType = 'ON_BOOKING' | 'DAYS_BEFORE_CHECKIN';
export type MilestoneDraft = { percentage: string; dueType: DueType; daysBeforeCheckIn: string };
export type ApiMilestone = { percentage: number | string; dueType: DueType; daysBeforeCheckIn?: number | null; sortOrder?: number };

export const emptyMilestone = (): MilestoneDraft => ({ percentage: '', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '0' });
export const defaultMilestones = (): MilestoneDraft[] => [{ percentage: '100', dueType: 'ON_BOOKING', daysBeforeCheckIn: '' }];

export function toDraft(items?: ApiMilestone[]) {
  if (!items?.length) return defaultMilestones();
  return [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((item) => ({ percentage: String(Number(item.percentage)), dueType: item.dueType, daysBeforeCheckIn: item.daysBeforeCheckIn == null ? '' : String(item.daysBeforeCheckIn) }));
}

export function toPayload(items: MilestoneDraft[]) {
  return items.map((item) => ({ percentage: Number(item.percentage), dueType: item.dueType, ...(item.dueType === 'DAYS_BEFORE_CHECKIN' ? { daysBeforeCheckIn: Number(item.daysBeforeCheckIn) } : {}) }));
}

export function totalOf(items: MilestoneDraft[]) { return items.reduce((sum, item) => sum + (Number(item.percentage) || 0), 0); }

export function validMilestones(items: MilestoneDraft[]) {
  return items.length > 0 && items.every((item) => Number(item.percentage) > 0 && (item.dueType === 'ON_BOOKING' || Number.isInteger(Number(item.daysBeforeCheckIn)) && Number(item.daysBeforeCheckIn) >= 0)) && Math.abs(totalOf(items) - 100) < 0.001;
}

export function milestoneLabel(item: ApiMilestone | MilestoneDraft) {
  const percentage = Number(item.percentage);
  if (item.dueType === 'ON_BOOKING') return `${percentage}% · On Booking`;
  const days = Number(item.daysBeforeCheckIn ?? 0);
  return `${percentage}% · ${days === 0 ? 'Check-in' : `${days} days`}`;
}

export function PaymentMilestoneEditor({ value, onChange, readOnly = false }: { value: MilestoneDraft[]; onChange: (value: MilestoneDraft[]) => void; readOnly?: boolean }) {
  const total = totalOf(value);
  const update = (index: number, patch: Partial<MilestoneDraft>) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const remaining = Math.max(0, 100 - total);
  return <div className="formCard paymentMilestoneEditor" data-testid="payment-milestone-editor">
    <div className="rangeSectionHeader"><div><span className="eyebrow">Payment terms</span><h3>Payment milestones</h3><p className="mutedText">Choose exactly when each percentage is due. On Booking is separate from check-in.</p></div><span className={`status ${Math.abs(total - 100) < 0.001 ? 'ok' : 'warn'}`}>Total {total.toFixed(2)}%</span></div>
    <div className="tableScroll"><table><thead><tr><th>#</th><th>Percentage</th><th>Due</th><th>Days before check-in</th><th>Action</th></tr></thead><tbody>{value.map((item, index) => <tr key={index}><td>{index + 1}</td><td><input aria-label={`Milestone ${index + 1} percentage`} type="number" min="0.01" max="100" step="0.01" value={item.percentage} disabled={readOnly} onChange={(event) => update(index, { percentage: event.target.value })} /> %</td><td><select aria-label={`Milestone ${index + 1} due type`} value={item.dueType} disabled={readOnly} onChange={(event) => update(index, { dueType: event.target.value as DueType, daysBeforeCheckIn: event.target.value === 'ON_BOOKING' ? '' : item.daysBeforeCheckIn || '0' })}><option value="ON_BOOKING">On Booking</option><option value="DAYS_BEFORE_CHECKIN">Before Check-in</option></select></td><td>{item.dueType === 'DAYS_BEFORE_CHECKIN' ? <><input aria-label={`Milestone ${index + 1} days`} type="number" min="0" step="1" value={item.daysBeforeCheckIn} disabled={readOnly} onChange={(event) => update(index, { daysBeforeCheckIn: event.target.value })} />{Number(item.daysBeforeCheckIn || 0) === 0 && <small>At check-in</small>}</> : <span className="mutedText">Not applicable</span>}</td><td>{!readOnly && <button className="smallBtn secondary" type="button" disabled={value.length === 1} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>}</td></tr>)}</tbody></table></div>
    {!readOnly && <div className="rowActions"><button className="smallBtn" type="button" onClick={() => onChange([...value, emptyMilestone()])}>+ Add Milestone</button>{remaining > 0 && <button className="smallBtn secondary" type="button" onClick={() => onChange([...value, { percentage: remaining.toFixed(2).replace(/\.00$/, ''), dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '' }])}>+ Add Remaining {remaining.toFixed(2)}%</button>}<span className="mutedText">{total < 100 ? `Remaining ${remaining.toFixed(2)}%` : total > 100 ? 'Reduce the total to 100%' : 'Ready to save'}</span></div>}
  </div>;
}
