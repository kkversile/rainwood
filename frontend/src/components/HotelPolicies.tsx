'use client';

import { useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pencil,
  Plus,
  Trash2,
  Underline,
} from 'lucide-react';

export type CancellationRule = {
  fromDays: number;
  toDays: number;
  charge: number;
  chargeType: 'PERCENT' | 'FIXED';
};

export type HotelPolicyValue = {
  checkInTime: string;
  checkOutTime: string;
  childMinAge: number;
  childMaxAge: number;
  childPolicyType: 'FREE' | 'CHARGEABLE' | 'CUSTOM';
  houseRules: string;
  cancellationRules: CancellationRule[];
  noShowPolicy: 'TOTAL' | 'SPECIFIC' | 'CUSTOM';
  noShowAmount: number | string | null;
  noShowCustomText: string;
  amendmentPolicy: 'CHARGES_APPLY' | 'WITHOUT_CHARGES' | 'NOT_ALLOWED';
  termsAndConditions: string;
  allowEarlyCheckIn: boolean;
  allowLateCheckOut: boolean;
  allowExtraBed: boolean;
  allowPets: boolean;
  allowOutsideFood: boolean;
  smokingAllowed: boolean;
  alcoholAllowed: boolean;
};

const defaultHouseRules = [
  'Valid ID proof is mandatory for all guests at check-in.',
  'Outside food and beverages are not allowed.',
  'Smoking is permitted only in designated areas.',
  'Pets are not allowed.',
  'Guests are responsible for the safety of their belongings.',
  'Please maintain quiet hours between 10:00 PM and 7:00 AM.',
  'Any damage to hotel property will be charged to the guest.',
  'Use of recreational facilities is subject to availability and hotel rules.',
].join('\n');

const defaultTerms = [
  '1. Rates are subject to change without prior notice.',
  '2. Booking is confirmed only upon receipt of confirmation voucher.',
  '3. The hotel reserves the right to deny accommodation in case of invalid ID proof or any violation of hotel policies.',
  '4. For group bookings, separate terms and conditions may apply.',
].join('\n');

export function createDefaultPolicy(): HotelPolicyValue {
  return {
    checkInTime: '02:00 PM',
    checkOutTime: '11:00 AM',
    childMinAge: 0,
    childMaxAge: 12,
    childPolicyType: 'FREE',
    houseRules: defaultHouseRules,
    cancellationRules: [
      { fromDays: 30, toDays: 999, charge: 0, chargeType: 'PERCENT' },
      { fromDays: 15, toDays: 29, charge: 50, chargeType: 'PERCENT' },
      { fromDays: 0, toDays: 14, charge: 100, chargeType: 'PERCENT' },
    ],
    noShowPolicy: 'TOTAL',
    noShowAmount: null,
    noShowCustomText: '',
    amendmentPolicy: 'CHARGES_APPLY',
    termsAndConditions: defaultTerms,
    allowEarlyCheckIn: true,
    allowLateCheckOut: true,
    allowExtraBed: true,
    allowPets: false,
    allowOutsideFood: false,
    smokingAllowed: false,
    alcoholAllowed: true,
  };
}

function displayTime(value: unknown, fallback: string) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const trimmed = value.trim().toUpperCase();
  if (/^(0[1-9]|1[0-2]):[0-5]\d (AM|PM)$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function normalizePolicy(value: Partial<HotelPolicyValue> | null | undefined): HotelPolicyValue {
  const defaults = createDefaultPolicy();
  if (!value) return defaults;
  const sourceRules = Array.isArray(value.cancellationRules) ? value.cancellationRules : null;
  const rules = sourceRules
    ? sourceRules.filter((rule) => rule && Number.isFinite(Number(rule.fromDays)) && Number.isFinite(Number(rule.toDays))).map((rule) => ({
        fromDays: Number(rule.fromDays),
        toDays: Number(rule.toDays),
        charge: Number(rule.charge),
        chargeType: rule.chargeType === 'FIXED' ? 'FIXED' as const : 'PERCENT' as const,
      }))
    : defaults.cancellationRules;
  const rawNoShow = String(value.noShowPolicy ?? '');
  const noShowPolicy = ['TOTAL', 'SPECIFIC', 'CUSTOM'].includes(rawNoShow)
    ? rawNoShow as HotelPolicyValue['noShowPolicy']
    : rawNoShow.toLowerCase().includes('specific') ? 'SPECIFIC' : rawNoShow.toLowerCase().includes('custom') ? 'CUSTOM' : 'TOTAL';
  const rawAmendment = String(value.amendmentPolicy ?? '');
  const amendmentPolicy = ['CHARGES_APPLY', 'WITHOUT_CHARGES', 'NOT_ALLOWED'].includes(rawAmendment)
    ? rawAmendment as HotelPolicyValue['amendmentPolicy']
    : rawAmendment.toLowerCase().includes('without') ? 'WITHOUT_CHARGES' : rawAmendment.toLowerCase().includes('not allowed') ? 'NOT_ALLOWED' : 'CHARGES_APPLY';
  return {
    ...defaults,
    checkInTime: displayTime(value.checkInTime, defaults.checkInTime),
    checkOutTime: displayTime(value.checkOutTime, defaults.checkOutTime),
    childMinAge: Number(value.childMinAge ?? defaults.childMinAge),
    childMaxAge: Number(value.childMaxAge ?? defaults.childMaxAge),
    childPolicyType: ['FREE', 'CHARGEABLE', 'CUSTOM'].includes(String(value.childPolicyType)) ? value.childPolicyType as HotelPolicyValue['childPolicyType'] : defaults.childPolicyType,
    houseRules: typeof value.houseRules === 'string' ? value.houseRules : defaults.houseRules,
    termsAndConditions: typeof value.termsAndConditions === 'string' ? value.termsAndConditions : defaults.termsAndConditions,
    cancellationRules: sourceRules ? rules : defaults.cancellationRules,
    noShowPolicy,
    noShowAmount: value.noShowAmount ?? null,
    noShowCustomText: value.noShowCustomText ?? '',
    amendmentPolicy,
    allowEarlyCheckIn: value.allowEarlyCheckIn ?? defaults.allowEarlyCheckIn,
    allowLateCheckOut: value.allowLateCheckOut ?? defaults.allowLateCheckOut,
    allowExtraBed: value.allowExtraBed ?? defaults.allowExtraBed,
    allowPets: value.allowPets ?? defaults.allowPets,
    allowOutsideFood: value.allowOutsideFood ?? defaults.allowOutsideFood,
    smokingAllowed: value.smokingAllowed ?? defaults.smokingAllowed,
    alcoholAllowed: value.alcoholAllowed ?? defaults.alcoholAllowed,
  };
}

function CardHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return <div className="policyCardHeading"><span className="policyCardIcon">{icon}</span><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>;
}

function ReferenceIcon({ kind, className, filled = false }: { kind: 'bed' | 'users' | 'file' | 'calendar-x' | 'ban' | 'amendment' | 'clock' | 'info'; className?: string; filled?: boolean }) {
  const paths = {
    bed: <path d="M3 12h18M3 16h18M5 12V7a2 2 0 012-2h10a2 2 0 012 2v5m-14 4v3m14-3v3" />,
    users: <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
    file: <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
    'calendar-x': <><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /><path d="M10 14l4 4m0-4l-4 4" /></>,
    ban: <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />,
    amendment: <path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />,
    clock: <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />,
    info: <path clipRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" fillRule="evenodd" />,
  };
  return <svg className={className} fill={filled ? 'currentColor' : 'none'} height="24" viewBox="0 0 24 24" width="24" aria-hidden="true" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">{paths[kind]}</svg>;
}

function RadioRow({ checked, name, label, onChange }: { checked: boolean; name: string; label: string; onChange: () => void }) {
  return <label className="policyRadio"><input type="radio" name={name} checked={checked} onChange={onChange} /><span>{label}</span></label>;
}

function PolicySwitch({ checked, label, note, onChange }: { checked: boolean; label: string; note?: string; onChange: (checked: boolean) => void }) {
  return <div className="additionalPolicyRow"><div><button type="button" className={`policySwitch ${checked ? 'on' : ''}`} aria-label={`${checked ? 'Disable' : 'Enable'} ${label}`} aria-pressed={checked} onClick={() => onChange(!checked)}><i /></button><span>{label} {note && <small>{note}</small>}</span></div><ReferenceIcon kind="info" /></div>;
}

export function HotelPolicies({ value, busy, onChange, onSave, onBack }: {
  value: HotelPolicyValue;
  busy: boolean;
  onChange: (next: HotelPolicyValue) => void;
  onSave: (continueToNext: boolean) => void;
  onBack: () => void;
}) {
  const [editingHouseRules, setEditingHouseRules] = useState(false);
  const [editingRule, setEditingRule] = useState<number | 'new' | null>(null);
  const [ruleDraft, setRuleDraft] = useState<CancellationRule>({ fromDays: 0, toDays: 14, charge: 100, chargeType: 'PERCENT' });
  const [ruleError, setRuleError] = useState('');
  const termsRef = useRef<HTMLTextAreaElement>(null);
  const update = <K extends keyof HotelPolicyValue>(key: K, next: HotelPolicyValue[K]) => onChange({ ...value, [key]: next });
  const houseRules = value.houseRules.split(/\r?\n/).map((rule) => rule.replace(/^\s*[-\u2022\d.)]+\s*/, '').trim()).filter(Boolean);

  const openRule = (index: number | 'new') => {
    setRuleError('');
    setEditingRule(index);
    setRuleDraft(index === 'new' ? { fromDays: 0, toDays: 14, charge: 100, chargeType: 'PERCENT' } : { ...value.cancellationRules[index] });
  };
  const saveRule = () => {
    const draft = { ...ruleDraft, fromDays: Number(ruleDraft.fromDays), toDays: Number(ruleDraft.toDays), charge: Number(ruleDraft.charge) };
    if ([draft.fromDays, draft.toDays, draft.charge].some((number) => !Number.isFinite(number) || number < 0)) return setRuleError('Enter valid non-negative values.');
    if (draft.fromDays > draft.toDays) return setRuleError('From days cannot be greater than to days.');
    if (draft.chargeType === 'PERCENT' && draft.charge > 100) return setRuleError('Percentage cannot exceed 100.');
    const next = [...value.cancellationRules];
    if (editingRule === 'new') next.push(draft); else if (typeof editingRule === 'number') next[editingRule] = draft;
    next.sort((a, b) => b.fromDays - a.fromDays);
    update('cancellationRules', next);
    setEditingRule(null);
  };
  const formatTerms = (kind: 'bold' | 'italic' | 'underline' | 'bullet' | 'numbered' | 'link') => {
    const input = termsRef.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = value.termsAndConditions.slice(start, end) || 'text';
    let replacement = selected;
    if (kind === 'bold') replacement = `**${selected}**`;
    if (kind === 'italic') replacement = `_${selected}_`;
    if (kind === 'underline') replacement = `__${selected}__`;
    if (kind === 'link') replacement = `[${selected}](https://)`;
    if (kind === 'bullet') replacement = selected.split('\n').map((line) => `• ${line.replace(/^\s*[•-]\s*/, '')}`).join('\n');
    if (kind === 'numbered') replacement = selected.split('\n').map((line, index) => `${index + 1}. ${line.replace(/^\s*\d+[.)]\s*/, '')}`).join('\n');
    const next = value.termsAndConditions.slice(0, start) + replacement + value.termsAndConditions.slice(end);
    update('termsAndConditions', next.slice(0, 2000));
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start, start + replacement.length); });
  };

  return <form id="hotel-policy-form" className="policiesWorkspace" onSubmit={(event) => { event.preventDefault(); onSave(false); }}>
    <div className="policiesTopGrid">
      <section className="policyCard checkTimesCard">
        <CardHeading icon={<ReferenceIcon kind="bed" />} title="Check-in / Check-out Policy" subtitle="Define standard check-in and check-out timings" />
        <div className="policyTimeGrid">
          <label><span>Check-in Time <em>*</em></span><span className="policyInputWithIcon"><ReferenceIcon kind="clock" /><input aria-label="Check-in Time" value={value.checkInTime} maxLength={8} pattern="(0[1-9]|1[0-2]):[0-5][0-9] (AM|PM)" onChange={(event) => update('checkInTime', event.target.value.toUpperCase())} required /></span></label>
          <label><span>Check-out Time <em>*</em></span><span className="policyInputWithIcon"><ReferenceIcon kind="clock" /><input aria-label="Check-out Time" value={value.checkOutTime} maxLength={8} pattern="(0[1-9]|1[0-2]):[0-5][0-9] (AM|PM)" onChange={(event) => update('checkOutTime', event.target.value.toUpperCase())} required /></span></label>
        </div>
        <div className="policyInfoBanner"><ReferenceIcon kind="info" filled /><span>Early check-in and late check-out are subject to availability and may attract additional charges.</span></div>
      </section>

      <section className="policyCard childPolicyCard">
        <CardHeading icon={<ReferenceIcon kind="users" />} title="Child Policy" subtitle="Define age limits and charges for children" />
        <label className="policyFieldLabel">Child Age Range (Years) <em>*</em></label>
        <div className="childAgeRange"><input aria-label="Child minimum age" type="number" min={0} max={value.childMaxAge} value={value.childMinAge} onChange={(event) => update('childMinAge', Number(event.target.value))} /><span>to</span><input aria-label="Child maximum age" type="number" min={value.childMinAge} max={21} value={value.childMaxAge} onChange={(event) => update('childMaxAge', Number(event.target.value))} /></div>
        <label className="policyFieldLabel childPolicyTypeLabel">Child Policy Type</label>
        <div className="policyRadioGroup">
          <RadioRow checked={value.childPolicyType === 'FREE'} name="child-policy" label="Free stay for children (with or without bed)" onChange={() => update('childPolicyType', 'FREE')} />
          <RadioRow checked={value.childPolicyType === 'CHARGEABLE'} name="child-policy" label="Chargeable" onChange={() => update('childPolicyType', 'CHARGEABLE')} />
          <RadioRow checked={value.childPolicyType === 'CUSTOM'} name="child-policy" label="Custom policy per room type" onChange={() => update('childPolicyType', 'CUSTOM')} />
        </div>
      </section>

      <section className="policyCard houseRulesCard">
        <CardHeading icon={<ReferenceIcon kind="file" />} title="House Rules" />
        {editingHouseRules ? <textarea className="houseRulesEditor" aria-label="House Rules" rows={8} value={value.houseRules} onChange={(event) => update('houseRules', event.target.value)} /> : <div className="houseRulesList"><ul>{houseRules.map((rule, index) => <li key={`${rule}-${index}`}>{rule}</li>)}</ul></div>}
        <div className="houseRulesActions"><button type="button" onClick={() => setEditingHouseRules((current) => !current)}><Pencil /> {editingHouseRules ? 'Done' : 'Edit'}</button></div>
      </section>
    </div>

    <div className="policiesMiddleGrid">
      <section className="policyCard cancellationPolicyCard">
        <div className="policyCardHeadingRow"><CardHeading icon={<ReferenceIcon kind="calendar-x" />} title="Cancellation Policy" subtitle="Define cancellation rules and charges" /><button className="addPolicyButton" type="button" onClick={() => openRule('new')}><Plus /> Add Policy</button></div>
        {editingRule !== null && <div className="policyRuleEditor">
          <label>From (Days)<input type="number" min={0} value={ruleDraft.fromDays} onChange={(event) => setRuleDraft({ ...ruleDraft, fromDays: Number(event.target.value) })} /></label>
          <label>To (Days)<input type="number" min={0} value={ruleDraft.toDays} onChange={(event) => setRuleDraft({ ...ruleDraft, toDays: Number(event.target.value) })} /></label>
          <label>Charge<input type="number" min={0} value={ruleDraft.charge} onChange={(event) => setRuleDraft({ ...ruleDraft, charge: Number(event.target.value) })} /></label>
          <label>Type<select value={ruleDraft.chargeType} onChange={(event) => setRuleDraft({ ...ruleDraft, chargeType: event.target.value as CancellationRule['chargeType'] })}><option value="PERCENT">Percent</option><option value="FIXED">Fixed INR</option></select></label>
          <div><button type="button" onClick={saveRule}>Save</button><button type="button" onClick={() => setEditingRule(null)}>Cancel</button></div>
          {ruleError && <p role="alert">{ruleError}</p>}
        </div>}
        <div className="policyTableWrap"><table><thead><tr><th>From (Days)</th><th>To (Days)</th><th>Cancellation Charge</th><th>Type</th><th>Action</th></tr></thead><tbody>{value.cancellationRules.map((rule, index) => <tr key={`${rule.fromDays}-${rule.toDays}-${index}`}><td>{rule.fromDays}</td><td>{rule.toDays}</td><td><b>{rule.chargeType === 'PERCENT' ? `${rule.charge}%` : `₹${rule.charge}`}</b></td><td>{rule.chargeType === 'PERCENT' ? 'Percent' : 'Fixed'}</td><td><div className="policyRowActions"><button type="button" title="Edit" aria-label={`Edit cancellation policy ${index + 1}`} onClick={() => openRule(index)}><Pencil /></button><button type="button" title="Delete" aria-label={`Delete cancellation policy ${index + 1}`} onClick={() => update('cancellationRules', value.cancellationRules.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></button></div></td></tr>)}</tbody></table></div>
      </section>

      <section className="policyCard splitPolicyCard">
        <div className="policySubsection">
          <CardHeading icon={<ReferenceIcon kind="ban" />} title="No Show Policy" subtitle="Define charges for no show" />
          <label className="policyFieldLabel">Charge Type</label>
          <div className="policyRadioGroup compact">
            <RadioRow checked={value.noShowPolicy === 'TOTAL'} name="no-show-policy" label="100% of total booking amount" onChange={() => update('noShowPolicy', 'TOTAL')} />
            <RadioRow checked={value.noShowPolicy === 'SPECIFIC'} name="no-show-policy" label="Specific amount (INR)" onChange={() => update('noShowPolicy', 'SPECIFIC')} />
            <RadioRow checked={value.noShowPolicy === 'CUSTOM'} name="no-show-policy" label="Custom policy" onChange={() => update('noShowPolicy', 'CUSTOM')} />
          </div>
          {value.noShowPolicy === 'SPECIFIC' && <input className="policyConditionalInput" aria-label="No show amount" type="number" min={0} placeholder="Amount in INR" value={value.noShowAmount ?? ''} onChange={(event) => update('noShowAmount', event.target.value)} />}
          {value.noShowPolicy === 'CUSTOM' && <textarea className="policyConditionalInput" aria-label="Custom no show policy" rows={2} placeholder="Enter custom no-show terms" value={value.noShowCustomText} onChange={(event) => update('noShowCustomText', event.target.value)} />}
        </div>
        <div className="policySubsection amendmentSubsection">
          <CardHeading icon={<ReferenceIcon kind="amendment" />} title="Amendment Policy" subtitle="Define rules for date / guest / room amendments" />
          <div className="policyRadioGroup compact">
            <RadioRow checked={value.amendmentPolicy === 'CHARGES_APPLY'} name="amendment-policy" label="Allow amendments (charges may apply)" onChange={() => update('amendmentPolicy', 'CHARGES_APPLY')} />
            <RadioRow checked={value.amendmentPolicy === 'WITHOUT_CHARGES'} name="amendment-policy" label="Allow amendments without charges" onChange={() => update('amendmentPolicy', 'WITHOUT_CHARGES')} />
            <RadioRow checked={value.amendmentPolicy === 'NOT_ALLOWED'} name="amendment-policy" label="Not allowed" onChange={() => update('amendmentPolicy', 'NOT_ALLOWED')} />
          </div>
        </div>
      </section>

      <section className="policyCard additionalPoliciesCard">
        <CardHeading icon={<ReferenceIcon kind="file" />} title="Additional Policies" />
        <div className="additionalPolicyList">
          <PolicySwitch checked={value.allowEarlyCheckIn} label="Allow Early Check-in" note="(subject to availability)" onChange={(next) => update('allowEarlyCheckIn', next)} />
          <PolicySwitch checked={value.allowLateCheckOut} label="Allow Late Check-out" note="(subject to availability)" onChange={(next) => update('allowLateCheckOut', next)} />
          <PolicySwitch checked={value.allowExtraBed} label="Allow Extra Bed" onChange={(next) => update('allowExtraBed', next)} />
          <PolicySwitch checked={value.allowPets} label="Allow Pets" onChange={(next) => update('allowPets', next)} />
          <PolicySwitch checked={value.allowOutsideFood} label="Allow Outside Food" onChange={(next) => update('allowOutsideFood', next)} />
          <PolicySwitch checked={value.smokingAllowed} label="Smoking Allowed" onChange={(next) => update('smokingAllowed', next)} />
          <PolicySwitch checked={value.alcoholAllowed} label="Alcohol Allowed" onChange={(next) => update('alcoholAllowed', next)} />
        </div>
      </section>
    </div>

    <section className="policyCard termsPolicyCard">
      <CardHeading icon={<ReferenceIcon kind="file" />} title="Terms & Conditions" subtitle="Display terms and conditions to agents and guests" />
      <div className="policyRichEditor">
        <div className="policyEditorToolbar"><div><button type="button" title="Bold" onClick={() => formatTerms('bold')}><Bold /></button><button type="button" title="Italic" onClick={() => formatTerms('italic')}><Italic /></button><button type="button" title="Underline" onClick={() => formatTerms('underline')}><Underline /></button><i /><button type="button" title="Bullet List" onClick={() => formatTerms('bullet')}><List /></button><button type="button" title="Numbered List" onClick={() => formatTerms('numbered')}><ListOrdered /></button><button type="button" title="Link" onClick={() => formatTerms('link')}><Link2 /></button></div><span>{value.termsAndConditions.length}/2000</span></div>
        <textarea ref={termsRef} aria-label="Terms and Conditions" maxLength={2000} value={value.termsAndConditions} onChange={(event) => update('termsAndConditions', event.target.value)} />
      </div>
    </section>

    <div className="policyFormActions"><button type="button" className="btn secondary" onClick={onBack}>Back</button><button type="submit" className="btn" disabled={busy}>{busy ? 'Saving...' : 'Save Policies'}</button><button type="button" className="btn" disabled={busy} onClick={() => onSave(true)}>{busy ? 'Saving...' : 'Update & Continue'}</button></div>
  </form>;
}
