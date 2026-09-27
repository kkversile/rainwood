'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

export type HousekeepingProfile = { id: string; name: string; role: string; department: string | null; jobTitle: string | null; hotel: { id: string; name: string } };
type Task = { id: string; status: 'PENDING' | 'ACCEPTED' | 'CLEANING' | 'COMPLETED' | 'CANCELLED'; assignedTo: { id: string; name: string } | null; createdAt: string; acceptedAt: string | null; cleaningStartedAt: string | null; completedAt: string | null; issueNote: string | null; issueReportedAt: string | null };
type Room = { roomId: string; roomNumber: string; floor: string | null; wing: string | null; roomType: { id: string; name: string }; roomStatus: string; task: Task | null };

function timeLabel(value?: string | null) { return value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'; }

export function HousekeepingData({ profile: initialProfile }: { profile?: HousekeepingProfile }) {
  const [profile, setProfile] = useState<HousekeepingProfile | null>(initialProfile ?? null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tab, setTab] = useState<'DIRTY' | 'MY' | 'CLEANING'>('DIRTY');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [issueTask, setIssueTask] = useState<Task | null>(null);
  const [issueNote, setIssueNote] = useState('');

  async function load(nextTab = tab) {
    setLoading(true); setError('');
    try {
      const [me, rows] = await Promise.all([
        profile ? Promise.resolve(profile) : apiRequest<HousekeepingProfile>('/staff/me'),
        apiRequest<Room[]>('/staff/housekeeping/rooms'),
      ]);
      setProfile(me);
      if (nextTab === 'MY') {
        const tasks = await apiRequest<Array<Task & { room: { id: string; roomNumber: string; floor: string | null; wing: string | null; status: string; roomType: { id: string; name: string } } }>>('/staff/housekeeping/tasks');
        setRooms(tasks.filter((task) => task.assignedTo?.id === me.id).map((task) => ({ roomId: task.room.id, roomNumber: task.room.roomNumber, floor: task.room.floor, wing: task.room.wing, roomType: task.room.roomType, roomStatus: task.room.status, task })));
      } else {
        setRooms(rows.filter((room) => room.roomStatus === nextTab));
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load housekeeping rooms.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function act(task: Task | null, action: 'accept' | 'start' | 'complete') {
    if (!task) return;
    setBusy(task.id); setError('');
    try { await apiRequest(`/staff/housekeeping/tasks/${task.id}/${action}`, { method: 'POST' }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Housekeeping action failed.'); }
    finally { setBusy(''); }
  }

  async function reportIssue() {
    if (!issueTask || issueNote.trim().length < 2) return;
    setBusy(issueTask.id); setError('');
    try { await apiRequest(`/staff/housekeeping/tasks/${issueTask.id}/report-issue`, { method: 'POST', body: JSON.stringify({ note: issueNote.trim() }) }); setIssueTask(null); setIssueNote(''); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not report the issue.'); }
    finally { setBusy(''); }
  }

  const title = useMemo(() => tab === 'MY' ? 'My Rooms' : tab === 'CLEANING' ? 'Cleaning' : 'Dirty Rooms', [tab]);
  if (profile && profile.department !== 'HOUSEKEEPING') return <section className="staffContent"><div className="staffEmpty"><strong>Housekeeping access is not enabled</strong><span>Your staff department does not have housekeeping permissions.</span></div></section>;
  return <section className="staffContent housekeepingPwa">
    <div className="staffWelcome"><span className="staffEyebrow">Housekeeping</span><h1>{profile?.hotel.name ?? 'Hotel operations'}</h1><p>Hi, <strong>{profile?.name ?? 'Housekeeper'}</strong>{profile?.jobTitle ? ` · ${profile.jobTitle}` : ''}</p></div>
    <nav className="housekeepingTabs" aria-label="Housekeeping views">{(['DIRTY', 'MY', 'CLEANING'] as const).map((item) => <button type="button" className={tab === item ? 'active' : ''} key={item} onClick={() => { setTab(item); void load(item); }}>{item === 'MY' ? 'My Rooms' : item === 'DIRTY' ? 'Dirty' : 'Cleaning'}</button>)}</nav>
    {error && <p className="staffError" role="alert">{error}</p>}
    {loading ? <p className="staffLoading">Loading {title.toLowerCase()}…</p> : !rooms.length ? <div className="staffEmpty"><strong>No {title.toLowerCase()} found</strong><span>Room tasks will appear here when the hotel operation changes a room.</span></div> : <div className="housekeepingRoomList">{rooms.map((room) => { const task = room.task; const mine = task?.assignedTo?.id === profile?.id; return <article className="housekeepingRoomCard" key={room.roomId}><div className="housekeepingRoomMain"><span className="housekeepingRoomNumber">ROOM {room.roomNumber}</span><strong>{room.roomType.name}</strong><span>Floor {room.floor || '—'}{room.wing ? ` · ${room.wing}` : ''}</span></div><div className="housekeepingRoomState"><b className={`housekeepingStatus ${room.roomStatus}`}>{room.roomStatus.replace(/_/g, ' ')}</b>{task && <span>{task.status === 'ACCEPTED' && mine ? `Assigned to you · accepted ${timeLabel(task.acceptedAt)}` : task.status === 'CLEANING' && mine ? `Started ${timeLabel(task.cleaningStartedAt)}` : task.status}</span>}{task?.issueNote && <small className="housekeepingIssue">Issue: {task.issueNote}</small>}</div><div className="housekeepingRoomActions">{task?.status === 'PENDING' && <button className="staffButton" type="button" disabled={busy === task.id} onClick={() => void act(task, 'accept')}>Accept Room</button>}{task?.status === 'ACCEPTED' && mine && <button className="staffButton" type="button" disabled={busy === task.id} onClick={() => void act(task, 'start')}>Start Cleaning</button>}{task?.status === 'CLEANING' && mine && <><button className="staffButton" type="button" disabled={busy === task.id} onClick={() => void act(task, 'complete')}>Mark Ready</button><button className="staffButton secondary" type="button" onClick={() => { setIssueTask(task); setIssueNote(''); }}>Report Issue</button></>}{task?.status === 'ACCEPTED' && !mine && <span className="mutedText">Assigned to {task.assignedTo?.name}</span>}</div></article>; })}</div>}
    {issueTask && <div className="staffSheetBackdrop" role="presentation"><section className="staffSheet" role="dialog" aria-modal="true" aria-labelledby="housekeeping-issue-title"><div className="staffSheetHeader"><div><span className="staffEyebrow">Room {rooms.find((room) => room.task?.id === issueTask.id)?.roomNumber}</span><h2 id="housekeeping-issue-title">Report issue</h2></div><button className="staffClose" type="button" aria-label="Close issue dialog" onClick={() => setIssueTask(null)}>×</button></div><form onSubmit={(event) => { event.preventDefault(); void reportIssue(); }}><label>Issue notes<textarea required minLength={2} maxLength={500} value={issueNote} onChange={(event) => setIssueNote(event.target.value)} placeholder="e.g. AC leaking" /></label><button className="staffButton full" disabled={busy === issueTask.id}>{busy === issueTask.id ? 'Saving…' : 'Report issue'}</button></form></section></div>}
  </section>;
}
