'use client';

import { addAtBookingMilestone, addMilestone, addRemainingMilestone, finalizeMilestones, removeMilestone, totalOf, updateMilestoneDays, updateMilestonePercentage, validMilestones, type MilestoneDraft } from './PaymentMilestoneEditor';

type Props = {
  value: MilestoneDraft[];
  onChange: (value: MilestoneDraft[]) => void;
  onCancel: () => void;
  onSave: () => void;
  busy?: boolean;
};

export function CompactPaymentTermsEditor({ value, onChange, onCancel, onSave, busy = false }: Props) {
  const total = totalOf(value);
  const remaining = Math.max(0, 100 - total);
  const valid = validMilestones(value);
  const updatePercentage = (index: number, percentage: string) => onChange(updateMilestonePercentage(value, index, percentage));
  const hasAtBooking = value.some((item) => item.dueType === 'ON_BOOKING');

  return <div className="compactPaymentEditor" data-testid="compact-payment-editor">
    <div className="compactPaymentHeader"><span className="compactPaymentTitle">Breakdown<small>(Milestones)</small></span><span className={`compactPaymentBalance ${valid ? 'valid' : 'invalid'}`}>Balance: {remaining.toFixed(2)}%<br />Total: {total.toFixed(2)}%</span></div>
    <div className="compactMilestoneRows">{value.map((item, index) => {
      const daysSelected = item.dueType !== 'ON_BOOKING';
      return <div className="compactMilestoneRow" key={index}>
        <div className="compactPercentInput"><input aria-label={`Compact milestone ${index + 1} percentage`} type="number" min="5" max="100" step="5" value={item.percentage} onChange={(event) => updatePercentage(index, event.target.value)} onBlur={() => onChange(finalizeMilestones(value))} /><span>%</span></div>
        <div className="compactDueGroup">{item.dueType === 'ON_BOOKING' ? <span className="compactDueOnly">On Booking</span> : <div className="compactDaysGroup"><div className="compactDaysInput"><input aria-label={`Compact milestone ${index + 1} days to check-in`} type="number" min="0" step="1" value={item.daysBeforeCheckIn} onChange={(event) => onChange(updateMilestoneDays(value, index, event.target.value))} onBlur={(event) => onChange(finalizeMilestones(updateMilestoneDays(value, index, event.target.value)))} /></div><span className="compactDaysLabel">Days to Check-in</span></div>}</div>
        <button type="button" className="compactRemoveMilestone" aria-label={`Remove milestone ${index + 1}`} disabled={value.length === 1} onClick={() => onChange(removeMilestone(value, index))}>x</button>
      </div>;
    })}</div>
    <div className="compactPaymentStatus"><span className={valid ? 'valid' : 'invalid'}>{valid ? '100% total reached' : `Remaining ${remaining.toFixed(2)}%`}</span><span>Total: {total.toFixed(2)}%</span></div>
    <div className="compactPaymentHint">Validation and duplicate due-point handling follow the saved milestone rules.</div>
    <div className="compactPaymentAddActions">{!hasAtBooking && <button type="button" className="compactAddMilestone" onClick={() => onChange(addAtBookingMilestone(value))}>+ Add At Booking</button>}{remaining > 0 && <><button type="button" className="compactAddMilestone" onClick={() => onChange(addMilestone(value))}>+ Add Milestone</button><button type="button" className="compactAddMilestone" onClick={() => onChange(addRemainingMilestone(value))}>+ Add Remaining {remaining.toFixed(2)}%</button></>}</div>
    <div className="compactPaymentActions"><button type="button" className="compactCancel" onClick={onCancel}>Cancel</button><button type="button" className="compactSave" disabled={!valid || busy} onClick={onSave}>{busy ? 'Saving...' : 'Save'}</button></div>
  </div>;
}
