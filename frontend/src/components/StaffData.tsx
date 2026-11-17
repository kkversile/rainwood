'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BrushCleaning, LayoutDashboard, Menu, PackageSearch, ReceiptText, X } from 'lucide-react';
import { apiRequest, ApiRequestError, clearAccessToken } from '../lib/api';
import { staffServiceWorkerConfig } from '../lib/staff-service-worker';
import { HousekeepingData, type HousekeepingProfile } from './HousekeepingData';
import { MaintenanceData } from './MaintenanceData';
import { useNavigationDialog } from '../lib/use-navigation-dialog';
import { portalLoginPath } from '../lib/portal-session';
import { createRetryableSubmission } from '../lib/retryable-submission';
import { canUseStaffServiceOrders } from '../lib/staff-navigation';

export type StaffProfile = HousekeepingProfile & { allowedCategories: string[] };
type Stay = { reference: string; guestName: string; checkIn: string; checkOut: string; status: string; stayStatus: string; rooms: number; roomTypes: string[]; adults: number; children: number; pax: number; hotel: { id: string; name: string }; assignedRooms: { id: string; roomNumber: string; floor?: string | null; wing?: string | null; roomType?: string | null }[]; operationalPreferences?: Record<string, unknown> };
type StaffCharge = { id: string; category: string; description: string; quantity: number | string; unitAmount: number | string; totalAmount: number | string; postingDate: string; note?: string | null; status: string; postedBy: string; voidedAt?: string | null; voidedBy?: string | null; voidReason?: string | null; createdAt: string };
type StaffFolio = { reference: string; charges: StaffCharge[]; totals: { incidentalCharges: number | string; incidentalBalance: number | string; totalOutstanding: number | string } };
type ServiceItem = { id: string; type: string; name: string; unitPrice: number; taxRate: number; active: boolean };

function label(value: string | null | undefined) { return (value ?? '').replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()); }
function dateLabel(value: string) { return new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
function money(value: number | string) { return `INR ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export function StaffAuthGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  useEffect(() => {
    let mounted = true; setError('');
    apiRequest<StaffProfile>('/staff/me').then((profile) => { if (mounted) { if (profile.role !== 'SERVICE_STAFF') throw new ApiRequestError('Use your hotel staff account.', 403); setReady(true); } })
      .catch((reason) => { if (!mounted) return; if (reason instanceof ApiRequestError && [401, 403].includes(reason.status)) window.location.replace(portalLoginPath(window.location.pathname, window.location.search, process.env.NEXT_PUBLIC_BASE_PATH ?? '')); else setError(reason instanceof Error ? reason.message : 'Could not check staff access.'); });
    return () => { mounted = false; };
  }, [retry]);
  if (!ready) return <main className="staffPage">{error ? <div className="staffError" role="alert"><p>{error}</p><button type="button" className="staffButton" onClick={() => setRetry((value) => value + 1)}>Try again</button></div> : <p className="staffLoading">Checking staff session...</p>}</main>;
  return <>{children}</>;
}

export function StaffPwaShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [profileError, setProfileError] = useState(''); const [profileRetry, setProfileRetry] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    let mounted = true;
    setProfileError('');
    apiRequest<StaffProfile>('/staff/me').then((me) => { if (mounted) setProfile(me); }).catch((reason) => { if (mounted) setProfileError(reason instanceof Error ? reason.message : 'Could not load staff profile.'); });
    return () => { mounted = false; };
  }, [profileRetry]);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 820px)');
    const update = () => { setMobile(query.matches); setNavigationOpen(false); };
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => { setNavigationOpen(false); }, [pathname]);
  useNavigationDialog(mobile && navigationOpen, sidebarRef, toggleRef, () => setNavigationOpen(false));
  useEffect(() => { if ('serviceWorker' in navigator) { const { url, scope } = staffServiceWorkerConfig(process.env.NEXT_PUBLIC_BASE_PATH ?? ''); navigator.serviceWorker.register(url, { scope }).catch(() => undefined); } }, []);
  async function logout() { try { await apiRequest('/auth/logout', { method: 'POST', body: JSON.stringify({ allDevices: false }) }); } catch { /* local session is cleared below */ } finally { clearAccessToken(); router.replace('/staff/login'); } }
  const navigation = [
    { href: '/staff', title: 'My workspace', icon: LayoutDashboard },
    ...(profile?.department === 'HOUSEKEEPING' ? [{ href: '/staff/housekeeping', title: 'Housekeeping', icon: BrushCleaning }] : []),
    ...(canUseStaffServiceOrders(profile?.department) ? [{ href: '/staff/service-orders', title: 'Service orders', icon: ReceiptText }] : []),
    { href: '/staff/lost-found', title: 'Lost & found', icon: PackageSearch },
  ];
  return <main className="staffPage rainwoodPortalShell rainwoodStaffWorkspace">
    <aside role={mobile && navigationOpen ? "dialog" : undefined} aria-modal={mobile && navigationOpen ? true : undefined} ref={sidebarRef} id="staff-sidebar" className={`rwStaffSidebar${navigationOpen ? ' is-open' : ''}`} aria-label="Staff sidebar" aria-hidden={mobile && !navigationOpen ? true : undefined} inert={mobile && !navigationOpen}>
      {mobile && navigationOpen && <button type="button" className="rwPortalDrawerClose" aria-label="Close staff navigation" onClick={() => setNavigationOpen(false)}><X size={20} aria-hidden="true" /></button>}
      <Link href="/staff" className="staffBrand"><span>RW</span><b>RAINWOOD<small>Staff portal</small></b></Link>
      <div className="rwStaffSidebarScope"><span>Property</span><strong>{profile?.hotel.name ?? 'Loading your property…'}</strong>{profileError && <div role="alert"><p>{profileError}</p><button type="button" className="staffButton secondary" onClick={() => setProfileRetry((value) => value + 1)}>Try again</button></div>}</div>
      <nav className="rwStaffSidebarNav" aria-label="Staff navigation">{navigation.map((item) => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined} onClick={() => setNavigationOpen(false)}><item.icon size={18} strokeWidth={1.8} aria-hidden="true" /><span>{item.title}</span></Link>)}</nav>
      <div className="rwStaffSidebarIdentity"><strong>{profile?.name ?? 'Staff workspace'}</strong><span>{profile ? label(profile.department) : 'Loading your staff profile…'}</span></div>
    </aside>
    {mobile && navigationOpen && <button className="rwStaffSidebarBackdrop" type="button" aria-label="Dismiss staff navigation" tabIndex={-1} onClick={() => { setNavigationOpen(false); toggleRef.current?.focus(); }} />}
    <div className="rwStaffMain" inert={mobile && navigationOpen}>
      <header className="staffHeader"><button ref={toggleRef} type="button" className="rwStaffSidebarToggle" aria-label={navigationOpen ? 'Close staff navigation' : 'Open staff navigation'} aria-expanded={navigationOpen} aria-controls="staff-sidebar" onClick={() => setNavigationOpen(!navigationOpen)}>{navigationOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}</button><Link href="/staff" className="staffBrand rwStaffMobileBrand"><span>RW</span><b>RainWood Staff</b></Link><div className="rwStaffHeaderScope"><span>Staff workspace</span><strong>{profile?.hotel.name ?? 'RainWood Hotels'}</strong></div><button className="staffLogout" type="button" onClick={() => void logout()}>Sign out</button></header>
      <div className="rwStaffBody" inert={mobile && navigationOpen}>{children}</div>
    </div>
  </main>;
}

export function StaffHomeData() {
  const [profile, setProfile] = useState<StaffProfile | null>(null); const [stays, setStays] = useState<Stay[]>([]); const [query, setQuery] = useState(''); const [submittedQuery, setSubmittedQuery] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { apiRequest<StaffProfile>('/staff/me').then(setProfile).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load staff profile.')); }, []);
  useEffect(() => { let current = true; setLoading(true); setError(''); const search = submittedQuery ? `?q=${encodeURIComponent(submittedQuery)}` : ''; apiRequest<Stay[]>(`/staff/stays${search}`).then((rows) => { if (current) setStays(rows); }).catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : 'Could not load guests.'); }).finally(() => { if (current) setLoading(false); }); return () => { current = false; }; }, [submittedQuery]);
  return <section className="staffContent"><div className="staffWelcome"><span className="staffEyebrow">Hotel operations</span><h1>Today&apos;s In-House Guests</h1>{profile && <p>Hi, <strong>{profile.name}</strong><br /><span>{profile.hotel.name} · {label(profile.department)}{profile.jobTitle ? ` · ${profile.jobTitle}` : ''}</span></p>}</div><form className="staffSearch" onSubmit={(event: FormEvent) => { event.preventDefault(); setSubmittedQuery(query.trim()); }}><input aria-label="Search room, guest or reservation" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search room, guest or reservation" /><button type="submit">Search</button></form>{error && <p className="staffError" role="alert">{error}</p>}{loading ? <p className="staffLoading">Loading in-house guests…</p> : stays.length ? <div className="staffStayList">{stays.map((stay) => <Link href={`/staff/stays/${encodeURIComponent(stay.reference)}`} className="staffStayCard" key={stay.reference}><div>{stay.assignedRooms.length > 0 && <strong className="staffRoomNumber">Room {stay.assignedRooms.map((room) => room.roomNumber).join(', ')}</strong>}<strong>{stay.guestName}</strong><span>{stay.reference}</span></div><div><span>{dateLabel(stay.checkIn)} → {dateLabel(stay.checkOut)}</span><span>{stay.roomTypes.join(', ')} · {stay.pax} pax</span></div><b>View / Add Charge&nbsp;›</b></Link>)}</div> : <div className="staffEmpty"><strong>No in-house guests found</strong><span>Search by room number, guest name, or reservation reference.</span></div>}</section>;
}

export function StaffGuestData({ reference }: { reference: string }) {
  const router = useRouter(); const [profile, setProfile] = useState<StaffProfile | null>(null); const [stay, setStay] = useState<Stay | null>(null); const [folio, setFolio] = useState<StaffFolio | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [showAdd, setShowAdd] = useState(false); const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false); const [actionError, setActionError] = useState(''); const [success, setSuccess] = useState(''); const [idempotencyKey, setIdempotencyKey] = useState(''); const [form, setForm] = useState({ category: '', description: '', quantity: '1', unitAmount: '', note: '' });
  useEffect(() => { Promise.all([apiRequest<StaffProfile>('/staff/me'), apiRequest<Stay>(`/staff/stays/${encodeURIComponent(reference)}`), apiRequest<StaffFolio>(`/staff/stays/${encodeURIComponent(reference)}/folio`)]).then(([staff, guest, guestFolio]) => { setProfile(staff); setStay(guest); setFolio(guestFolio); setForm((current) => ({ ...current, category: staff.allowedCategories[0] ?? '' })); }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load guest details.')).finally(() => setLoading(false)); }, [reference]);
  const chargeDialogRef = useRef<HTMLElement>(null); const chargeTriggerRef = useRef<HTMLButtonElement>(null); const chargePendingRef = useRef(false);
  useNavigationDialog(showAdd, chargeDialogRef, chargeTriggerRef, () => { if (!busy) { setShowAdd(false); setConfirm(false); } });
  const total = Math.max(0, Number(form.quantity || 0) * Number(form.unitAmount || 0));
  function startCharge() { setActionError(''); setSuccess(''); setIdempotencyKey(''); setConfirm(false); setShowAdd(true); }
  async function postCharge() { if (chargePendingRef.current) return; if (!stay || !form.category || !form.description.trim() || Number(form.quantity) <= 0 || Number(form.unitAmount) < 0) { setActionError('Complete the category, description, quantity, and unit price.'); return; } if (typeof navigator !== 'undefined' && !navigator.onLine) { setActionError("You're offline. Reconnect before posting this charge."); return; } const key = idempotencyKey || (typeof crypto !== 'undefined' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`); setIdempotencyKey(key); chargePendingRef.current = true; setBusy(true); setActionError(''); try { const result = await apiRequest<StaffFolio>(`/staff/stays/${encodeURIComponent(stay.reference)}/folio/charges`, { method: 'POST', body: JSON.stringify({ ...form, quantity: Number(form.quantity), unitAmount: Number(form.unitAmount), idempotencyKey: key }) }); setFolio(result); setShowAdd(false); setConfirm(false); setSuccess('Charge posted successfully.'); } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Could not post charge. Retry with the same key.'); } finally { chargePendingRef.current = false; setBusy(false); } }
  if (loading) return <section className="staffContent"><p className="staffLoading">Loading guest details…</p></section>;
  if (error || !stay || !folio || !profile) return <section className="staffContent"><p className="staffError" role="alert">{error || 'Guest details are unavailable.'}</p><button className="staffButton secondary" type="button" onClick={() => router.push('/staff')}>Back to guests</button></section>;
  return <section className="staffContent"><Link className="staffBack" href="/staff">‹ Today&apos;s guests</Link><div className="staffGuestCard"><span className="staffEyebrow">Guest stay</span><h1>{stay.guestName}</h1><strong>{stay.reference}</strong><div className="staffGuestGrid"><div><span>Arrival</span><b>{dateLabel(stay.checkIn)}</b></div><div><span>Departure</span><b>{dateLabel(stay.checkOut)}</b></div><div><span>Stay</span><b>{stay.roomTypes.join(', ')}</b></div><div><span>Pax</span><b>{stay.adults} adults{stay.children ? ` · ${stay.children} children` : ''}</b></div></div></div><section className="staffCharges"><div className="staffSectionHeading"><div><span className="staffEyebrow">Shared guest folio</span><h2>Guest Charges</h2></div><button ref={chargeTriggerRef} className="staffButton" type="button" onClick={startCharge}>+ Add Charge</button></div>{success && <p className="staffSuccess" role="status">{success}</p>}<div className="staffFolioTotal"><span>Active incidental total</span><strong>{money(folio.totals.incidentalCharges)}</strong></div>{folio.charges.length ? <div className="staffChargeList">{folio.charges.map((charge) => <article className={`staffChargeCard${charge.status === 'VOIDED' ? ' staffChargeVoided' : ''}`} key={charge.id}><div><strong>{charge.description}</strong><span>{label(charge.category)} · Qty {charge.quantity}</span></div><div><b>{money(charge.totalAmount)}</b><span>{charge.status === 'VOIDED' ? 'VOIDED' : `Posted by ${charge.postedBy} · ${dateLabel(charge.postingDate)}`}</span>{charge.voidReason && <small>Void reason: {charge.voidReason}</small>}</div></article>)}</div> : <div className="staffEmpty"><strong>No guest charges yet</strong><span>Post a charge only after confirming the guest and amount.</span></div>}</section>{showAdd && <div className="staffSheetBackdrop" role="presentation"><section ref={chargeDialogRef} className="staffSheet" role="dialog" aria-modal="true" aria-labelledby="staff-add-charge-title"><div className="staffSheetHeader"><div><span className="staffEyebrow">Guest Charges</span><h2 id="staff-add-charge-title">Add Charge</h2></div><button className="staffClose" type="button" aria-label="Close add charge" disabled={busy} onClick={() => { setShowAdd(false); setConfirm(false); }}>×</button></div>{actionError && <p className="staffError" role="alert">{actionError}</p>}{confirm ? <div className="staffConfirm"><p>Post <strong>{money(total)}</strong> to <strong>{stay.guestName}</strong> / {stay.reference}?</p><button className="staffButton secondary" type="button" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button><button className="staffButton" type="button" disabled={busy} onClick={() => void postCharge()}>{busy ? 'Posting…' : 'Confirm Post'}</button></div> : <form onSubmit={(event) => { event.preventDefault(); if (!form.category || !form.description.trim() || Number(form.quantity) <= 0 || Number(form.unitAmount) < 0) setActionError('Complete all required fields.'); else setConfirm(true); }}><label>Category<select required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{profile.allowedCategories.map((category) => <option value={category} key={category}>{label(category)}</option>)}</select></label><label>Description<input required minLength={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="e.g. Restaurant Dinner" /></label><div className="staffFormTwo"><label>Quantity<input required min="0.01" step="0.01" type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></label><label>Unit price<input required min="0" step="0.01" type="number" value={form.unitAmount} onChange={(event) => setForm({ ...form, unitAmount: event.target.value })} /></label></div><label>Notes<input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Optional note" /></label><div className="staffTotal"><span>Total</span><strong>{money(total)}</strong><small>Server calculates the final total and posting date.</small></div><button className="staffButton full" type="submit">Review Charge</button></form>}</section></div>}</section>;
}

function StaffServiceOrderPanel({ profile, reference, department, onPosted }: { profile: StaffProfile; reference: string; department: string; onPosted: (folio: StaffFolio) => void }) {
  const [items, setItems] = useState<ServiceItem[]>([]); const [quantities, setQuantities] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [review, setReview] = useState(false);
  useEffect(() => { const query = department === 'HOUSEKEEPING' ? '?type=LAUNDRY' : ''; apiRequest<ServiceItem[]>(`/staff/service-items${query}`).then(setItems).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load service items.')); }, [department]);
  const submission = useRef(createRetryableSubmission<{ reference: string; department: string; lines: { serviceItemId: string; quantity: number }[] }, StaffFolio>());
  const selected = items.filter((item) => Number(quantities[item.id] ?? 0) > 0); const estimate = selected.reduce((sum, item) => sum + Number(quantities[item.id]) * item.unitPrice * (1 + item.taxRate / 100), 0);
  async function post() { setBusy(true); setError(''); try { const result = await submission.current.submit({ reference, department, lines: selected.map((item) => ({ serviceItemId: item.id, quantity: Number(quantities[item.id]) })) }, ({ reference: target, ...body }) => apiRequest<StaffFolio>(`/staff/stays/${encodeURIComponent(target)}/service-orders`, { method: 'POST', body: JSON.stringify(body) })); onPosted(result); setQuantities({}); setReview(false); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not post service order.'); } finally { setBusy(false); } }
  return <section className="staffCharges"><div className="staffSectionHeading"><div><span className="staffEyebrow">Structured services</span><h2>{department === 'HOUSEKEEPING' ? 'Laundry posting' : 'F&B / Room Service posting'}</h2></div></div>{error && <p className="staffError" role="alert">{error}</p>}{review ? <div className="staffConfirm"><p>Post {selected.map((item) => `${item.name} × ${quantities[item.id]}`).join(', ')} for an estimated total of <strong>{money(estimate)}</strong> to the room folio?</p><button className="staffButton secondary" type="button" onClick={() => setReview(false)}>Back</button><button className="staffButton" type="button" disabled={busy} onClick={() => void post()}>{busy ? 'Posting…' : 'Confirm Post to Room'}</button></div> : !items.length ? <div className="staffEmpty"><strong>No configured service items</strong><span>Ask an administrator to configure operational items for this hotel.</span></div> : <><div className="staffChargeList">{items.map((item) => <label className="staffChargeCard" key={item.id}><div><strong>{item.name}</strong><span>{label(item.type)} · {money(item.unitPrice)} + {item.taxRate}% tax</span></div><input aria-label={`Quantity ${item.name}`} min="0" step="1" type="number" value={quantities[item.id] ?? ''} onChange={(event) => setQuantities({ ...quantities, [item.id]: event.target.value })} /></label>)}</div><div className="staffTotal"><span>Estimated total</span><strong>{money(estimate)}</strong><small>Final prices and tax are calculated by the server.</small></div><button className="staffButton full" type="button" disabled={!selected.length} onClick={() => setReview(true)}>Review service order</button></>}</section>;
}

export function StaffHomeRouter() {
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  useEffect(() => { let mounted = true; setLoading(true); setError(''); apiRequest<StaffProfile>('/staff/me').then((me) => { if (mounted) setProfile(me); }).catch((reason) => { if (mounted) setError(reason instanceof Error ? reason.message : 'Could not load your workspace.'); }).finally(() => { if (mounted) setLoading(false); }); return () => { mounted = false; }; }, [retry]);
  if (loading) return <section className="staffContent"><p className="staffLoading">Checking staff access...</p></section>;
  if (error || !profile) return <section className="staffContent"><p className="staffError" role="alert">{error || 'Staff profile unavailable.'}</p><button type="button" className="staffButton" onClick={() => setRetry((value) => value + 1)}>Try again</button></section>;
  if (profile.department === 'HOUSEKEEPING') return <><Link className="staffBack" href="/staff/lost-found">Report a found item</Link><HousekeepingData profile={profile} /></>;
  if (profile.department === 'MAINTENANCE') return <MaintenanceData profile={profile} />;
  return <><Link className="staffBack" href="/staff/service-orders">Open service order posting</Link><StaffHomeData /></>;
}
