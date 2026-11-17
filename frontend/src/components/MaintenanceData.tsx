'use client';

import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import { useNavigationDialog } from '../lib/use-navigation-dialog';
import type { HousekeepingProfile } from './HousekeepingData';

type Ticket = { id: string; room: { roomNumber: string; floor: string | null; wing: string | null; status: string; roomType: { name: string } } | null; category: string; priority: string; status: string; title: string; description: string; assignedTo: { id: string; name: string } | null; requiresOutOfOrder: boolean };
type Profile = HousekeepingProfile & { department: string | null };
type View = 'OPEN' | 'MINE' | 'IN_PROGRESS';
const pretty = (value: string) => value.replace(/_/g, ' ');

export function MaintenanceData({ profile: initialProfile }: { profile?: Profile }) {
  const [profile, setProfile] = useState<Profile | null>(initialProfile ?? null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [tab, setTab] = useState<View>('OPEN');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [resolveTicket, setResolveTicket] = useState<Ticket | null>(null);
  const [note, setNote] = useState('');
  const requestRef = useRef(0);
  const pendingRef = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useNavigationDialog(Boolean(resolveTicket), dialogRef, triggerRef, () => { if (!pendingRef.current) setResolveTicket(null); });

  async function load(nextTab = tab) {
    const request = ++requestRef.current;
    setLoading(true); setError('');
    try {
      const me = profile ?? await apiRequest<Profile>('/staff/me');
      if (request !== requestRef.current) return;
      setProfile(me);
      if (me.department !== 'MAINTENANCE') { setTickets([]); return; }
      const rows = await apiRequest<Ticket[]>(`/staff/maintenance/tasks?view=${nextTab}`);
      if (request === requestRef.current) setTickets(rows);
    } catch (reason) { if (request === requestRef.current) setError(reason instanceof Error ? reason.message : 'Could not load maintenance work.'); }
    finally { if (request === requestRef.current) setLoading(false); }
  }
  useEffect(() => { void load(); return () => { requestRef.current += 1; }; }, []);

  async function act(ticket: Ticket, action: 'accept' | 'start') {
    if (pendingRef.current) return;
    pendingRef.current = true; setBusy(ticket.id); setError(''); setMessage('');
    try {
      await apiRequest(`/staff/maintenance/tasks/${ticket.id}/${action}`, { method: 'POST' });
      setMessage(action === 'accept' ? 'Job accepted. Open My jobs to start work.' : 'Maintenance work started.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Maintenance action failed.'); }
    finally { pendingRef.current = false; setBusy(''); }
  }
  async function resolve() {
    if (pendingRef.current || !resolveTicket || note.trim().length < 2 || note.trim().length > 1000) return;
    pendingRef.current = true; setBusy(resolveTicket.id); setError(''); setMessage('');
    try {
      await apiRequest(`/staff/maintenance/tasks/${resolveTicket.id}/resolve`, { method: 'POST', body: JSON.stringify({ resolutionNote: note.trim() }) });
      setResolveTicket(null); setNote(''); setMessage('Job resolved successfully.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not resolve ticket.'); }
    finally { pendingRef.current = false; setBusy(''); }
  }
  if (profile && profile.department !== 'MAINTENANCE') return <section className="staffContent"><div className="staffEmpty"><strong>Maintenance access is not enabled</strong><span>Your staff department does not have maintenance permissions.</span></div></section>;
  return <section className="staffContent maintenancePwa">
    <div className="staffWelcome"><span className="staffEyebrow">Hotel operations</span><h1>Maintenance Work</h1><p>Hi, <strong>{profile?.name ?? 'Maintenance technician'}</strong><br /><span>{profile?.hotel.name} - {profile?.jobTitle ?? 'Engineering'}</span></p></div>
    <nav className="maintenanceTabs" aria-label="Maintenance views">{(['OPEN', 'MINE', 'IN_PROGRESS'] as const).map((item) => <button className={tab === item ? 'active' : ''} aria-pressed={tab === item} type="button" key={item} onClick={() => { setTab(item); setMessage(''); void load(item); }}>{item === 'OPEN' ? 'Open jobs' : item === 'MINE' ? 'My jobs' : 'In progress'}</button>)}</nav>
    <button className="staffButton secondary" type="button" aria-label="Refresh maintenance jobs" disabled={loading || Boolean(busy)} onClick={() => void load()}>Refresh jobs</button>
    {error && !resolveTicket && <p className="staffError" role="alert">{error} <button className="staffButton secondary" type="button" onClick={() => void load()}>Try again</button></p>}
    {message && <p className="staffSuccess" role="status">{message}</p>}
    {loading ? <p className="staffLoading" role="status">Loading maintenance work...</p> : tickets.length ? <div className="maintenanceTicketList">{tickets.map((ticket) => <article className="maintenanceTicketCard" key={ticket.id}><div className="maintenanceTicketMain"><span className="maintenanceRoomNumber">{ticket.room ? `ROOM ${ticket.room.roomNumber}` : 'HOTEL-WIDE'}</span><strong>{ticket.title}</strong><span>{pretty(ticket.category)} - {pretty(ticket.priority)}{ticket.requiresOutOfOrder ? ' - OOO impact' : ''}</span><p>{ticket.description}</p></div><div className="maintenanceTicketState"><b>{pretty(ticket.status)}</b>{ticket.assignedTo && <span>{ticket.assignedTo.name}</span>}{ticket.status === 'OPEN' && <button className="staffButton" disabled={Boolean(busy)} type="button" onClick={() => void act(ticket, 'accept')}>Accept job</button>}{ticket.status === 'ASSIGNED' && ticket.assignedTo?.id === profile?.id && <button className="staffButton" disabled={Boolean(busy)} type="button" onClick={() => void act(ticket, 'start')}>Start work</button>}{ticket.status === 'IN_PROGRESS' && ticket.assignedTo?.id === profile?.id && <button className="staffButton" disabled={Boolean(busy)} type="button" onClick={(event) => { triggerRef.current = event.currentTarget; setResolveTicket(ticket); setNote(''); setError(''); }}>Resolve job</button>}</div></article>)}</div> : <div className="staffEmpty"><strong>No {tab === 'OPEN' ? 'open' : tab === 'MINE' ? 'assigned' : 'in-progress'} maintenance jobs</strong><span>Refresh to check for new engineering tickets.</span></div>}
    {resolveTicket && <div className="staffSheetBackdrop"><section ref={dialogRef} className="staffSheet" role="dialog" aria-modal="true" aria-labelledby="maintenance-resolve-title"><div className="staffSheetHeader"><div><span className="staffEyebrow">{resolveTicket.room ? `Room ${resolveTicket.room.roomNumber}` : 'Hotel-wide'}</span><h2 id="maintenance-resolve-title">Resolve job</h2></div><button className="staffClose" type="button" disabled={Boolean(busy)} onClick={() => setResolveTicket(null)} aria-label="Close resolve job">x</button></div><form onSubmit={(event) => { event.preventDefault(); void resolve(); }}><label>Resolution note<textarea required minLength={2} maxLength={1000} disabled={Boolean(busy)} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Describe the repair completed" /></label>{error && <p className="staffError" role="alert">{error}</p>}<button className="staffButton full" disabled={Boolean(busy) || note.trim().length < 2} type="submit">{busy ? 'Saving...' : 'Resolve ticket'}</button></form></section></div>}
  </section>;
}
