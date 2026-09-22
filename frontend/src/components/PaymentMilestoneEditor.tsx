'use client';

export type DueType = 'ON_BOOKING' | 'DAYS_BEFORE_CHECKIN';
export type DueSelection = DueType;
export type MilestoneDraft = { percentage: string; dueType: DueType | null; daysBeforeCheckIn: string };
export type ApiMilestone = { percentage: number | string; dueType: DueType; daysBeforeCheckIn?: number | null; sortOrder?: number };

export const emptyMilestone = (): MilestoneDraft => ({ percentage: '', dueType: null, daysBeforeCheckIn: '' });
export const defaultMilestones = (): MilestoneDraft[] => [{ percentage: '100', dueType: 'ON_BOOKING', daysBeforeCheckIn: '' }];

export function toDraft(items?: ApiMilestone[]) {
  if (!items?.length) return defaultMilestones();
  return mergeMilestones([...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((item) => ({ percentage: String(Number(item.percentage)), dueType: item.dueType, daysBeforeCheckIn: item.daysBeforeCheckIn == null ? '' : String(item.daysBeforeCheckIn) })));
}

export function toPayload(items: MilestoneDraft[]) {
  return items.map((item) => {
    if (!item.dueType) throw new Error('Select when every payment milestone is due.');
    return { percentage: Number(item.percentage), dueType: item.dueType, ...(item.dueType === 'DAYS_BEFORE_CHECKIN' ? { daysBeforeCheckIn: Number(item.daysBeforeCheckIn) } : {}) };
  });
}

export function totalOf(items: MilestoneDraft[]) { return items.reduce((sum, item) => sum + (Number(item.percentage) || 0), 0); }
export function isCheckInMilestone(item: MilestoneDraft | ApiMilestone) {
  return item.dueType === 'DAYS_BEFORE_CHECKIN' && Number(item.daysBeforeCheckIn) === 0;
}

export function dueSelection(item: MilestoneDraft): DueSelection | '' {
  if (item.dueType === 'ON_BOOKING') return 'ON_BOOKING';
  if (item.dueType === 'DAYS_BEFORE_CHECKIN') return 'DAYS_BEFORE_CHECKIN';
  return '';
}

export function availableDueSelections(items: MilestoneDraft[], index: number): DueSelection[] {
  const current = items[index];
  const onBookingCount = items.filter((item) => item.dueType === 'ON_BOOKING').length;
  const hasOtherOnBooking = items.some((item, itemIndex) => itemIndex !== index && item.dueType === 'ON_BOOKING');
  return [
    ...(!hasOtherOnBooking || (current?.dueType === 'ON_BOOKING' && onBookingCount === 1) ? ['ON_BOOKING' as const] : []),
    'DAYS_BEFORE_CHECKIN',
  ];
}

export function shouldShowDueSelector(items: MilestoneDraft[], index: number) {
  const current = items[index];
  if (current?.dueType === 'ON_BOOKING') return true;
  if (items.some((item) => item.dueType === 'ON_BOOKING')) return false;
  return items.findIndex((item) => item.dueType !== 'ON_BOOKING') === index;
}

function formatPercentage(value: number) {
  return value.toFixed(2).replace(/\.00$/, '');
}

function hasBothFixedDuePoints(items: MilestoneDraft[]) {
  return items.some((item) => item.dueType === 'ON_BOOKING') && items.some((item) => isCheckInMilestone(item));
}

function dueKey(item: MilestoneDraft) {
  if (item.dueType === 'ON_BOOKING') return 'ON_BOOKING';
  if (item.dueType === 'DAYS_BEFORE_CHECKIN' && item.daysBeforeCheckIn.trim() !== '' && Number.isInteger(Number(item.daysBeforeCheckIn))) return `DAYS_BEFORE_CHECKIN:${Number(item.daysBeforeCheckIn)}`;
  return null;
}

export function mergeMilestones(items: MilestoneDraft[]): MilestoneDraft[] {
  const merged: MilestoneDraft[] = [];
  const indexes = new Map<string, number>();
  items.forEach((item) => {
    const key = dueKey(item);
    if (!key) {
      merged.push(item);
      return;
    }
    const existingIndex = indexes.get(key);
    if (existingIndex === undefined) {
      indexes.set(key, merged.length);
      merged.push(item);
      return;
    }
    const existing = merged[existingIndex];
    const otherTotal = totalOf(items) - (Number(existing.percentage) || 0) - (Number(item.percentage) || 0);
    const combined = Math.min((Number(existing.percentage) || 0) + (Number(item.percentage) || 0), Math.max(0, 100 - otherTotal));
    merged[existingIndex] = { ...existing, percentage: formatPercentage(combined) };
  });
  return merged;
}

function fillRemainingMilestone(items: MilestoneDraft[]) {
  const remaining = Math.max(0, 100 - totalOf(items));
  if (remaining <= 0) return items;
  const blankIndex = items.findIndex((item) => !item.percentage.trim() && (!item.dueType || item.dueType === 'DAYS_BEFORE_CHECKIN'));
  const draft = { percentage: formatPercentage(remaining), dueType: 'DAYS_BEFORE_CHECKIN' as const, daysBeforeCheckIn: '' };
  if (blankIndex >= 0) return items.map((item, index) => index === blankIndex ? draft : item);
  return [...items, draft];
}

export function addRemainingMilestone(items: MilestoneDraft[]): MilestoneDraft[] {
  return fillRemainingMilestone(items);
}

export function addMilestone(items: MilestoneDraft[]) {
  return [...items, { ...emptyMilestone(), dueType: 'DAYS_BEFORE_CHECKIN' as const }];
}

export function addAtBookingMilestone(items: MilestoneDraft[]) {
  if (items.some((item) => item.dueType === 'ON_BOOKING')) return items;
  return [...items, { percentage: '', dueType: 'ON_BOOKING' as const, daysBeforeCheckIn: '' }];
}

function appendRemainingMilestoneIfNeeded(items: MilestoneDraft[], index: number, allowBlankPercentage = false) {
  const current = items[index];
  if (index !== items.length - 1 || !current?.dueType || (!allowBlankPercentage && (!current.percentage.trim() || Number(current.percentage) <= 0)) || !hasBothFixedDuePoints(items) || totalOf(items) >= 100) return items;
  return addRemainingMilestone(items);
}

export function updateMilestonePercentage(items: MilestoneDraft[], index: number, percentage: string): MilestoneDraft[] {
  const otherTotal = totalOf(items) - (Number(items[index]?.percentage) || 0);
  const numeric = Number(percentage);
  const capped = percentage.trim() !== '' && Number.isFinite(numeric) ? formatPercentage(Math.min(numeric, Math.max(0, 100 - otherTotal))) : percentage;
  const next: MilestoneDraft[] = items.map((item, itemIndex) => itemIndex === index ? { ...item, percentage: capped } : item);
  return next;
}

export function updateMilestoneDays(items: MilestoneDraft[], index: number, days: string): MilestoneDraft[] {
  return items.map((item, itemIndex) => itemIndex === index ? { ...item, dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: days } : item);
}

export function updateMilestoneDue(items: MilestoneDraft[], index: number, selection: DueSelection | ''): MilestoneDraft[] {
  const current = items[index];
  const next: MilestoneDraft[] = items.map((item, itemIndex) => itemIndex === index ? {
    ...item,
    dueType: (selection === 'ON_BOOKING' ? 'ON_BOOKING' : selection ? 'DAYS_BEFORE_CHECKIN' : null) as DueType | null,
    daysBeforeCheckIn: selection === 'ON_BOOKING' ? '' : selection === 'DAYS_BEFORE_CHECKIN' ? current.dueType === 'ON_BOOKING' ? '' : current.daysBeforeCheckIn : '',
  } : item);
  return mergeMilestones(next);
}

export function finalizeMilestones(items: MilestoneDraft[]): MilestoneDraft[] {
  return mergeMilestones(items);
}

export function removeMilestone(items: MilestoneDraft[], index: number) {
  return finalizeMilestones(items.filter((_, itemIndex) => itemIndex !== index));
}

export function validMilestones(items: MilestoneDraft[]) {
  return items.length > 0 && items.every((item) => {
    const percentage = Number(item.percentage);
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100 || !item.dueType) return false;
    if (item.dueType === 'ON_BOOKING') return true;
    if (item.daysBeforeCheckIn.trim() === '') return false;
    const days = Number(item.daysBeforeCheckIn);
    return Number.isInteger(days) && days >= 0;
  }) && Math.abs(totalOf(items) - 100) < 0.001;
}

export function milestoneLabel(item: ApiMilestone | MilestoneDraft) {
  const percentage = Number(item.percentage);
  if (!item.dueType) return `${percentage}% · Due not selected`;
  if (item.dueType === 'ON_BOOKING') return `${percentage}% · On Booking`;
  const days = Number(item.daysBeforeCheckIn ?? 0);
  return `${percentage}% · ${days === 0 ? 'Check-in' : `${days} days`}`;
}

export function PaymentMilestoneEditor({ value, onChange, readOnly = false }: { value: MilestoneDraft[]; onChange: (value: MilestoneDraft[]) => void; readOnly?: boolean }) {
  const total = totalOf(value);
  const update = (index: number, patch: Partial<MilestoneDraft>) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const updatePercentage = (index: number, percentage: string) => onChange(updateMilestonePercentage(value, index, percentage));
  const hasAtBooking = value.some((item) => item.dueType === 'ON_BOOKING');
  const remaining = Math.max(0, 100 - total);
  return <div className="formCard paymentMilestoneEditor" data-testid="payment-milestone-editor">
    <div className="rangeSectionHeader"><div><span className="eyebrow">Payment terms</span><h3>Payment milestones</h3><p className="mutedText">Choose exactly when each percentage is due. On Booking is separate from check-in.</p></div><span className={`status ${Math.abs(total - 100) < 0.001 && validMilestones(value) ? 'ok' : 'warn'}`}>Total {total.toFixed(2)}%</span></div>
    <div className="tableScroll"><table><thead><tr><th>#</th><th>Percentage</th><th>Days to Check-in</th><th>Action</th></tr></thead><tbody>{value.map((item, index) => { const daysSelected = item.dueType !== 'ON_BOOKING'; return <tr key={index}><td>{index + 1}</td><td><input aria-label={`Milestone ${index + 1} percentage`} type="number" min="5" max="100" step="5" value={item.percentage} disabled={readOnly} onChange={(event) => updatePercentage(index, event.target.value)} onBlur={() => onChange(finalizeMilestones(value))} /> %</td><td>{item.dueType === 'ON_BOOKING' ? <span className="paymentDueOnly">On Booking</span> : daysSelected ? <div className="paymentDaysField"><input id={`milestone-days-${index}`} aria-label={`Milestone ${index + 1} days to check-in`} type="number" min="0" step="1" value={item.daysBeforeCheckIn} disabled={readOnly} onChange={(event) => onChange(updateMilestoneDays(value, index, event.target.value))} onBlur={(event) => onChange(finalizeMilestones(updateMilestoneDays(value, index, event.target.value)))} /><span>Days to Check-in</span></div> : null}</td><td>{!readOnly && <button className="smallBtn secondary" type="button" disabled={value.length === 1} onClick={() => onChange(removeMilestone(value, index))}>Remove</button>}</td></tr>; })}</tbody></table></div>
    {!readOnly && <div className="rowActions">{!hasAtBooking && <button className="smallBtn" type="button" onClick={() => onChange(addAtBookingMilestone(value))}>+ Add At Booking</button>}{remaining > 0 && <><button className="smallBtn" type="button" onClick={() => onChange(addMilestone(value))}>+ Add Milestone</button><button className="smallBtn secondary" type="button" onClick={() => onChange(addRemainingMilestone(value))}>+ Add Remaining {remaining.toFixed(2)}%</button></>}<span className="mutedText">{!value.every((item) => item.dueType) ? 'Select a due point for every milestone' : total < 100 ? `Remaining ${remaining.toFixed(2)}%` : total > 100 ? 'Reduce the total to 100%' : 'Ready to save'}</span></div>}
  </div>;
}
