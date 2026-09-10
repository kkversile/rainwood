'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BedDouble, Building2, CheckCircle2, ChevronDown, Clock3, Link2, PackagePlus, Plus, Users, X } from 'lucide-react';
import { AdminLayout } from '../../../components/Shell';
import { apiRequest } from '../../../lib/api';

type HotelSummary = { id: string; name: string; code: string; city: string; state?: string | null };
type RatePlanMaster = { id: string; code: string; name: string; mealPlan: string; active: boolean; assignments: { roomTypeId: string }[] };
type RoomPlan = { id: string; code: string; name: string; mealPlan: string; active: boolean; axisRatePlanId?: string | null; master?: { id: string; code: string; name: string; mealPlan: string; active: boolean } };
type Room = { id: string; code: string; name: string; roomTypeTitle?: string | null; roomsAvailable?: number; totalRooms?: number; todayAvailable?: number | null; preferredFor?: string | null; acAvailable?: boolean; description?: string | null; maxAdults?: number; maxChildren?: number; maxOccupancy?: number; checkInTime?: string | null; checkOutTime?: string | null; gstType?: string | null; gstPercentage?: string | null; inbuiltAmenities?: string | null; breakfastIncluded?: boolean; lunchIncluded?: boolean; dinnerIncluded?: boolean; active?: boolean; ratePlans?: RoomPlan[]; inventory?: { id: string }[] };
type HotelCatalog = HotelSummary & { rooms: Room[] };
type RoomForm = { roomTypeTitle: string; name: string; code: string; roomsAvailable: number; preferredFor: string; acAvailable: boolean; active: boolean; maxAdults: number; maxChildren: number; maxOccupancy: number; checkInTime: string; checkOutTime: string; gstType: string; gstPercentage: string; inbuiltAmenities: string; description: string; breakfastIncluded: boolean; lunchIncluded: boolean; dinnerIncluded: boolean };
type AssignmentForm = { masterId: string; axisRatePlanId: string; active: boolean };

const blankRoom: RoomForm = { roomTypeTitle: '', name: '', code: '', roomsAvailable: 0, preferredFor: 'Couple', acAvailable: true, active: true, maxAdults: 2, maxChildren: 1, maxOccupancy: 3, checkInTime: '', checkOutTime: '', gstType: 'Included', gstPercentage: 'GST - 0%', inbuiltAmenities: '', description: '', breakfastIncluded: false, lunchIncluded: false, dinnerIncluded: false };

export default function RoomsInventoryPage() {
  const searchParams = useSearchParams();
  const requestedHotelId = searchParams.get('hotelId') ?? '';
  const masterCache = useRef<Record<string, RatePlanMaster[]>>({});
  const [hotels, setHotels] = useState<HotelSummary[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [catalog, setCatalog] = useState<HotelCatalog | null>(null);
  const [room, setRoom] = useState<RoomForm>(blankRoom);
  const [assignmentRoom, setAssignmentRoom] = useState<Room | null>(null);
  const [assignmentMasters, setAssignmentMasters] = useState<RatePlanMaster[]>([]);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm>({ masterId: '', axisRatePlanId: '', active: true });
  const [loadingHotels, setLoadingHotels] = useState(true);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingMasters, setLoadingMasters] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadHotels() {
    setLoadingHotels(true);
    try {
      const loaded = await apiRequest<HotelSummary[]>('/hotels');
      setHotels(loaded);
      setHotelId((current) => current || (loaded.some((hotel) => hotel.id === requestedHotelId) ? requestedHotelId : loaded[0]?.id || ''));
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load hotels'); }
    finally { setLoadingHotels(false); }
  }

  async function loadCatalog(id: string) {
    if (!id) { setCatalog(null); return; }
    setLoadingRooms(true);
    try { setCatalog(await apiRequest<HotelCatalog>(`/hotels/${id}/catalog`)); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load rooms'); }
    finally { setLoadingRooms(false); }
  }

  useEffect(() => { void loadHotels(); }, [requestedHotelId]);
  useEffect(() => { void loadCatalog(hotelId); }, [hotelId]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 1000);
    return () => window.clearTimeout(timer);
  }, [message]);

  function updateRoom<K extends keyof RoomForm>(key: K, value: RoomForm[K]) { setRoom((current) => ({ ...current, [key]: value })); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!hotelId) { setError('Select a hotel first.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      await apiRequest(`/hotels/${hotelId}/rooms`, { method: 'POST', body: JSON.stringify({ ...room, code: room.code.trim().toUpperCase(), name: room.name.trim(), roomTypeTitle: room.roomTypeTitle.trim() || undefined, preferredFor: room.preferredFor.trim() || undefined, inbuiltAmenities: room.inbuiltAmenities.trim() || undefined, description: room.description.trim() || undefined }) });
      setRoom(blankRoom); setMessage('Room type added successfully.'); await loadCatalog(hotelId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not add room type'); }
    finally { setBusy(false); }
  }

  async function openAssignmentModal(item: Room) {
    setAssignmentRoom(item); setAssignmentForm({ masterId: '', axisRatePlanId: '', active: true }); setError('');
    if (masterCache.current[hotelId]) { setAssignmentMasters(masterCache.current[hotelId]); return; }
    setLoadingMasters(true);
    try {
      const loaded = await apiRequest<RatePlanMaster[]>(`/hotels/${hotelId}/rate-plan-masters`);
      masterCache.current[hotelId] = loaded;
      setAssignmentMasters(loaded);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load rate plans'); }
    finally { setLoadingMasters(false); }
  }

  const availableMasters = useMemo(() => {
    if (!assignmentRoom) return [];
    const assignedIds = new Set((assignmentRoom.ratePlans ?? []).map((plan) => plan.master?.id).filter(Boolean));
    return assignmentMasters.filter((master) => !assignedIds.has(master.id));
  }, [assignmentMasters, assignmentRoom]);
  const activeAvailableMasters = availableMasters.filter((master) => master.active);

  async function submitAssignment(event: FormEvent) {
    event.preventDefault();
    if (!assignmentRoom || !assignmentForm.masterId) return;
    setBusy(true); setError('');
    try {
      await apiRequest(`/hotels/rate-plan-masters/${assignmentForm.masterId}/assignments`, { method: 'POST', body: JSON.stringify({ roomTypeId: assignmentRoom.id, axisRatePlanId: assignmentForm.axisRatePlanId.trim() || undefined, active: assignmentForm.active }) });
      setAssignmentRoom(null); setMessage('Rate plan assigned to the room.'); await loadCatalog(hotelId);
      delete masterCache.current[hotelId];
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not assign rate plan. It may already be assigned to this room.');
      await loadCatalog(hotelId);
      delete masterCache.current[hotelId];
    } finally { setBusy(false); }
  }

  const selectedHotel = hotels.find((hotel) => hotel.id === hotelId);
  const rooms = catalog?.rooms ?? [];
  return <AdminLayout title="Rooms & Inventory"><section className="roomsInventoryPage">
    <header className="roomsInventoryHeader"><div><span>Property operations</span><h1>Rooms &amp; Inventory</h1><p>Manage room types, availability and room-level rate plans for your hotels.</p></div><Link className="roomsInventoryRateLink" href={`/admin/rate-plans${hotelId ? `?hotelId=${encodeURIComponent(hotelId)}` : ''}`}>Manage Rate Plans</Link></header>
    <section className="roomsInventoryHotelBar"><label><Building2 size={17} /> Select Hotel<select aria-label="Select hotel" value={hotelId} disabled={loadingHotels} onChange={(event) => { setHotelId(event.target.value); setAssignmentRoom(null); }}><option value="">Select a hotel</option>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name} · {hotel.city}</option>)}</select><ChevronDown size={16} /></label>{selectedHotel && <div><b>{selectedHotel.code}</b><span>{selectedHotel.city}{selectedHotel.state ? `, ${selectedHotel.state}` : ''}</span></div>}</section>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
    <div className="roomsInventoryStats"><div><span><BedDouble size={19} /></span><b>{rooms.length}</b><small>Room types</small></div><div><span><PackagePlus size={19} /></span><b>{rooms.reduce((total, item) => total + (item.roomsAvailable ?? item.totalRooms ?? 0), 0)}</b><small>Physical rooms</small></div><div><span><CheckCircle2 size={19} /></span><b>{rooms.filter((item) => item.active !== false).length}</b><small>Active room types</small></div><div><span><Clock3 size={19} /></span><b>{rooms.reduce((total, item) => total + (item.ratePlans?.length ?? 0), 0)}</b><small>Rate plans</small></div></div>
    <div className="roomsInventoryGrid"><form className="roomsInventoryCard roomCreateForm" onSubmit={submit}><div className="roomsInventoryCardTitle"><span><BedDouble size={20} /></span><div><h2>Add Room Type</h2><p>Create a room under the selected hotel.</p></div></div><div className="roomsInventoryFormGrid"><label>Room Type<input value={room.roomTypeTitle} onChange={(event) => updateRoom('roomTypeTitle', event.target.value)} placeholder="Premium Valley Room" /></label><label>Room Title <em>*</em><input value={room.name} onChange={(event) => updateRoom('name', event.target.value)} placeholder="Enter room title" required /></label><label>Room Code <em>*</em><input value={room.code} onChange={(event) => updateRoom('code', event.target.value)} placeholder="PVR" required /></label><label>Physical Rooms<input type="number" min="0" value={room.roomsAvailable} onChange={(event) => updateRoom('roomsAvailable', Number(event.target.value))} /></label><label>Preferred For<select value={room.preferredFor} onChange={(event) => updateRoom('preferredFor', event.target.value)}><option>Couple</option><option>Family</option><option>Business</option><option>Group</option></select></label><label>AC Availability<select value={room.acAvailable ? 'Yes' : 'No'} onChange={(event) => updateRoom('acAvailable', event.target.value === 'Yes')}><option>Yes</option><option>No</option></select></label><label>Max Adults<input type="number" min="1" value={room.maxAdults} onChange={(event) => updateRoom('maxAdults', Number(event.target.value))} /></label><label>Max Children<input type="number" min="0" value={room.maxChildren} onChange={(event) => updateRoom('maxChildren', Number(event.target.value))} /></label><label>Max Occupancy<input type="number" min="1" value={room.maxOccupancy} onChange={(event) => updateRoom('maxOccupancy', Number(event.target.value))} /></label><label>Check-in Time<input type="time" value={room.checkInTime} onChange={(event) => updateRoom('checkInTime', event.target.value)} /></label><label>Check-out Time<input type="time" value={room.checkOutTime} onChange={(event) => updateRoom('checkOutTime', event.target.value)} /></label><label>Status<select value={room.active ? 'Active' : 'Inactive'} onChange={(event) => updateRoom('active', event.target.value === 'Active')}><option>Active</option><option>Inactive</option></select></label></div><label>Room Amenities<input value={room.inbuiltAmenities} onChange={(event) => updateRoom('inbuiltAmenities', event.target.value)} placeholder="Wi-Fi, Room Service, Air Conditioning" /></label><label>Description<textarea rows={3} value={room.description} onChange={(event) => updateRoom('description', event.target.value)} placeholder="Describe this room type" /></label><p className="roomsInventoryFormHint">Meal inclusion is configured on rate plans. Date-specific availability is managed in the inventory calendar.</p><button className="roomsInventoryPrimaryButton" type="submit" disabled={busy || !hotelId}>{busy ? 'Saving...' : 'Add Room Type'}</button></form>
      <section className="roomsInventoryCard configuredRoomsCard"><div className="roomsInventoryCardTitle"><span><Users size={20} /></span><div><h2>{selectedHotel ? selectedHotel.name : 'Configured Rooms'}</h2><p>Room types, physical inventory and assigned rate plans.</p></div></div>{loadingRooms ? <p className="loading">Loading rooms...</p> : !hotelId ? <p className="empty">Select a hotel to view its rooms.</p> : !rooms.length ? <p className="empty">No room types configured yet.</p> : <div className="configuredRoomsList">{rooms.map((item) => <article className="configuredRoom" key={item.id}><div className="configuredRoomIcon"><BedDouble size={19} /></div><div className="configuredRoomMain"><h3>{item.name} <small>{item.code}</small></h3><p>{item.roomTypeTitle || 'Room type'} · {item.description || 'No description'}</p><div><span>{item.totalRooms ?? item.roomsAvailable ?? 0} physical rooms</span><span>Today: {item.todayAvailable ?? 'Not set'} available</span><span>{item.maxOccupancy ?? 0} max occupancy</span><span>{item.ratePlans?.length ?? 0} plans</span></div><div className="configuredRoomPlans"><div className="configuredRoomPlansHeader"><b>Rate plans</b><div className="configuredRoomPlansActions"><Link className="configuredRoomPlansView" href={`/admin/rate-plans?hotelId=${encodeURIComponent(hotelId)}&roomTypeId=${encodeURIComponent(item.id)}`}>View all rate plans</Link><button type="button" onClick={() => void openAssignmentModal(item)} disabled={item.active === false}><Plus size={13} /> Assign Rate Plan</button></div></div>{item.ratePlans?.length ? <div className="configuredRoomPlanList">{item.ratePlans.map((plan) => <span className={plan.active === false || plan.master?.active === false ? 'inactive' : ''} key={plan.id}>{plan.master?.name ?? plan.name} <small>{plan.master?.mealPlan ?? plan.mealPlan}{plan.axisRatePlanId ? ' · Axis mapped' : ''}</small></span>)}</div> : <p className="configuredRoomPlansEmpty">No rate plans assigned yet.</p>}</div></div><span className={`status ${item.active === false ? 'err' : 'ok'}`}>{item.active === false ? 'Inactive' : 'Active'}</span></article>)}</div>}</section>
    </div>

    {assignmentRoom && <div className="ratePlanModalBackdrop"><form className="ratePlanCopyModal ratePlanAssignmentModal" role="dialog" aria-modal="true" aria-labelledby="room-assignment-title" onSubmit={submitAssignment}><header><div><h2 id="room-assignment-title">Assign Rate Plan</h2><p>{assignmentRoom.name} ({assignmentRoom.code})</p></div><button type="button" aria-label="Close" onClick={() => setAssignmentRoom(null)}><X size={18} /></button></header>{loadingMasters ? <p className="ratePlanModalLoading">Loading hotel rate plans...</p> : !activeAvailableMasters.length ? <div className="ratePlanModalEmpty"><b>All existing rate plans are already assigned to this room.</b><span>{availableMasters.length ? 'Inactive plans cannot be assigned as active.' : 'Create a hotel-level plan first, then assign it here.'}</span><Link href={`/admin/rate-plans?hotelId=${encodeURIComponent(hotelId)}&roomTypeId=${encodeURIComponent(assignmentRoom.id)}`} onClick={() => setAssignmentRoom(null)}>Create Rate Plan</Link></div> : <><label>Rate Plan<select aria-label="Select existing rate plan" value={assignmentForm.masterId} onChange={(event) => setAssignmentForm({ ...assignmentForm, masterId: event.target.value })} required><option value="">Select existing rate plan</option>{availableMasters.map((master) => <option key={master.id} value={master.id} disabled={!master.active}>{master.name} ({master.code}) · {master.mealPlan}{!master.active ? ' · Inactive' : ''}</option>)}</select></label><label>AxisRooms Rate Plan ID<input value={assignmentForm.axisRatePlanId} onChange={(event) => setAssignmentForm({ ...assignmentForm, axisRatePlanId: event.target.value })} placeholder="Optional assignment mapping ID" /></label><p className="ratePlanCopyNote"><Link2 size={14} /> AxisRooms mapping is optional and stays specific to this room.</p><label className="checkLabel"><input type="checkbox" checked={assignmentForm.active} onChange={(event) => setAssignmentForm({ ...assignmentForm, active: event.target.checked })} /> Active for this room</label><footer><button className="smallBtn" type="button" onClick={() => setAssignmentRoom(null)} disabled={busy}>Cancel</button><button className="btn" disabled={busy || !assignmentForm.masterId}>{busy ? 'Assigning...' : 'Assign Rate Plan'}</button></footer></>}</form></div>}
  </section></AdminLayout>;
}
