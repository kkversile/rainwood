'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../../components/Shell';
import { apiRequest } from '../../../lib/api';

type Hotel = { id: string; name: string; rooms?: { id: string; name: string }[] };
type PhysicalRoom = { id: string; hotelId: string; roomNumber: string; floor: string | null; wing: string | null; status: string; active: boolean; hotel: { name: string }; roomType: { id: string; name: string } };
const statusTransitions: Record<string, string[]> = {
  AVAILABLE: ['AVAILABLE', 'OUT_OF_ORDER'],
  OCCUPIED: ['OCCUPIED'],
  DIRTY: ['DIRTY', 'CLEANING', 'OUT_OF_ORDER'],
  CLEANING: ['CLEANING', 'AVAILABLE', 'OUT_OF_ORDER'],
  OUT_OF_ORDER: ['OUT_OF_ORDER', 'DIRTY', 'AVAILABLE'],
};

export default function RoomsPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [rows, setRows] = useState<PhysicalRoom[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [form, setForm] = useState({ roomNumber: '', roomTypeId: '', floor: '', wing: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const selectedHotel = useMemo(() => hotels.find((hotel) => hotel.id === hotelId), [hotels, hotelId]);

  async function loadRooms(id = hotelId) {
    setRows(await apiRequest<PhysicalRoom[]>(`/hotels/physical-rooms${id ? `?hotelId=${encodeURIComponent(id)}` : ''}`));
  }

  useEffect(() => {
    apiRequest<Hotel[]>('/hotels').then((items) => { setHotels(items); if (items[0]) setHotelId(items[0].id); }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load hotels.'));
  }, []);

  useEffect(() => {
    if (hotelId) void loadRooms(hotelId).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load rooms.'));
  }, [hotelId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try {
      await apiRequest(`/hotels/${hotelId}/physical-rooms`, { method: 'POST', body: JSON.stringify({ ...form, roomTypeId: form.roomTypeId }) });
      setForm({ roomNumber: '', roomTypeId: '', floor: '', wing: '' }); setSuccess('Physical room added.'); await loadRooms();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save room.'); }
    finally { setBusy(false); }
  }

  async function changeStatus(room: PhysicalRoom, status: string) {
    setError('');
    try { await apiRequest(`/hotels/physical-rooms/${room.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await loadRooms(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update room.'); }
  }

  return <AdminLayout title="Physical Rooms"><section className="arrivalsPage">
    <div className="formCard arrivalsFilters"><div className="arrivalsFilterHeader"><div><span className="eyebrow">Front Desk Operations</span><h1>Physical Rooms</h1><p>Manage room numbers and operational housekeeping state separately from room types.</p></div></div>
      {error && <p className="error" role="alert">{error}</p>}{success && <p className="arrivalDetailsSuccess" role="status">{success}</p>}
      <form className="arrivalsFilterGrid" onSubmit={submit}>
        <label>Hotel<select required value={hotelId} onChange={(event) => setHotelId(event.target.value)}>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label>
        <label>Room Number<input required value={form.roomNumber} onChange={(event) => setForm({ ...form, roomNumber: event.target.value })} placeholder="203" /></label>
        <label>Room Type<select required value={form.roomTypeId} onChange={(event) => setForm({ ...form, roomTypeId: event.target.value })}><option value="">Select room type</option>{selectedHotel?.rooms?.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
        <label>Floor<input value={form.floor} onChange={(event) => setForm({ ...form, floor: event.target.value })} placeholder="2" /></label>
        <label>Wing<input value={form.wing} onChange={(event) => setForm({ ...form, wing: event.target.value })} placeholder="East" /></label>
        <div><button className="btn" type="submit" disabled={busy || !hotelId}>{busy ? 'Saving...' : 'Add Room'}</button></div>
      </form>
    </div>
    <section className="panel arrivalsTablePanel"><div className="arrivalsTableMeta"><span>{rows.length} physical room{rows.length === 1 ? '' : 's'}</span></div><div className="tableScroll"><table className="arrivalsTable"><thead><tr><th>Room</th><th>Hotel</th><th>Room Type</th><th>Floor</th><th>Wing</th><th>Status</th><th>Active</th><th>Update Status</th></tr></thead><tbody>
      {rows.map((room) => { const transitions = statusTransitions[room.status] ?? [room.status]; const occupied = room.status === 'OCCUPIED'; return <tr key={room.id}><td><strong>{room.roomNumber}</strong></td><td>{room.hotel.name}</td><td>{room.roomType.name}</td><td>{room.floor || '—'}</td><td>{room.wing || '—'}</td><td><span className={`status ${room.status === 'AVAILABLE' ? 'ok' : room.status === 'OUT_OF_ORDER' ? 'err' : 'warn'}`}>{room.status.replace(/_/g, ' ')}</span>{occupied && <small className="roomGuardHint">Assigned to an in-house guest. Use Room Change or Checkout.</small>}</td><td>{room.active ? 'Yes' : 'No'}</td><td><select aria-label={`Update room ${room.roomNumber} status`} value={room.status} disabled={occupied} onChange={(event) => void changeStatus(room, event.target.value)}>{transitions.map((status) => <option key={status}>{status}</option>)}</select></td></tr>; })}
      {!rows.length && <tr><td colSpan={8} className="empty">No physical rooms configured for this hotel.</td></tr>}
    </tbody></table></div></section>
  </section></AdminLayout>;
}
