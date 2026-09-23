'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2, Check, ChevronDown, Circle, MoreVertical, Pencil, Plus, Power, Search, Tag, Trash2, X } from 'lucide-react';
import { AdminLayout } from '../../../components/Shell';
import { useDialog } from '../../../components/ReactDialog';
import { apiRequest } from '../../../lib/api';
import { filterRatePlanRows, flattenRatePlanRows, formatConfiguredDays, formatStartingRate, RatePlanSortKey, RatePlanTableRow, RatePlanViewMaster, sortRatePlanRows } from '../../../lib/rate-plan-view';

type Room = { id: string; name: string; code: string };
type Hotel = { id: string; name: string; city: string; rooms?: Room[] };
type Master = RatePlanViewMaster;
type Assignment = Master['assignments'][number];
type MasterForm = { code: string; name: string; mealPlan: string; description: string; active: boolean };
type AssignmentForm = { roomTypeId: string; axisRatePlanId: string; active: boolean };
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type SortDirection = 'asc' | 'desc';

const blankMaster: MasterForm = { code: '', name: '', mealPlan: 'EP', description: '', active: true };

export default function RatePlansPage() {
  const dialog = useDialog();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedHotelId = searchParams.get('hotelId') ?? '';
  const requestedRoomTypeId = searchParams.get('roomTypeId') ?? '';
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [roomTypeId, setRoomTypeId] = useState('');
  const [masters, setMasters] = useState<Master[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sortKey, setSortKey] = useState<RatePlanSortKey>('plan');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedId, setSelectedId] = useState('');
  const [openMenuId, setOpenMenuId] = useState('');
  const [loadingHotels, setLoadingHotels] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [masterModal, setMasterModal] = useState<{ editing?: Master } | null>(null);
  const [masterForm, setMasterForm] = useState<MasterForm>(blankMaster);
  const [assignmentModal, setAssignmentModal] = useState<{ master: Master; assignment?: Assignment } | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm>({ roomTypeId: '', axisRatePlanId: '', active: true });

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await apiRequest<Hotel[]>('/hotels');
        setHotels(loaded);
        const roomOwner = requestedRoomTypeId ? loaded.find((hotel) => hotel.rooms?.some((room) => room.id === requestedRoomTypeId)) : undefined;
        const validHotel = requestedHotelId ? loaded.find((hotel) => hotel.id === requestedHotelId) : undefined;
        const nextHotelId = roomOwner?.id ?? validHotel?.id ?? loaded[0]?.id ?? '';
        setHotelId(nextHotelId);
        setRoomTypeId(roomOwner ? requestedRoomTypeId : '');
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not load hotels');
      } finally {
        setLoadingHotels(false);
      }
    })();
  }, []);

  async function loadMasters(id: string) {
    if (!id) { setMasters([]); setLoading(false); return; }
    setLoading(true);
    try {
      setMasters(await apiRequest<Master[]>(`/hotels/${id}/rate-plan-masters`));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load rate plans');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadMasters(hotelId); }, [hotelId]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 1000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const selectedHotel = hotels.find((hotel) => hotel.id === hotelId);
  const rooms = selectedHotel?.rooms ?? [];
  const scopedRows = useMemo(() => filterRatePlanRows(flattenRatePlanRows(masters, hotelId), { roomTypeId, search }), [masters, hotelId, roomTypeId, search]);
  const visibleRows = useMemo(() => sortRatePlanRows(filterRatePlanRows(flattenRatePlanRows(masters, hotelId), { roomTypeId, search, status: statusFilter }), sortKey, sortDirection), [masters, hotelId, roomTypeId, search, statusFilter, sortKey, sortDirection]);
  const filters: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'ALL', label: 'All', count: scopedRows.length },
    { key: 'ACTIVE', label: 'Active', count: scopedRows.filter((row) => row.effectiveActive).length },
    { key: 'INACTIVE', label: 'Inactive', count: scopedRows.filter((row) => !row.effectiveActive).length },
  ];

  function syncUrl(nextHotelId: string, nextRoomTypeId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextHotelId) params.set('hotelId', nextHotelId); else params.delete('hotelId');
    if (nextRoomTypeId) params.set('roomTypeId', nextRoomTypeId); else params.delete('roomTypeId');
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
  }

  function changeHotel(nextHotelId: string) {
    setHotelId(nextHotelId);
    setRoomTypeId('');
    setSelectedId('');
    setOpenMenuId('');
    syncUrl(nextHotelId, '');
  }

  function changeRoomType(nextRoomTypeId: string) {
    const valid = rooms.some((room) => room.id === nextRoomTypeId) ? nextRoomTypeId : '';
    setRoomTypeId(valid);
    setSelectedId('');
    syncUrl(hotelId, valid);
  }

  function setSorting(nextKey: RatePlanSortKey) {
    if (sortKey === nextKey) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else { setSortKey(nextKey); setSortDirection('asc'); }
  }

  function sortLabel(key: RatePlanSortKey) { return sortKey === key ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'; }

  function startCreate() {
    setMasterForm(blankMaster);
    setMasterModal({});
    setError('');
  }

  function startEdit(master: Master) {
    setMasterForm({ code: master.code, name: master.name, mealPlan: master.mealPlan, description: master.description ?? '', active: master.active });
    setMasterModal({ editing: master });
    setError('');
  }

  async function saveMaster(event: FormEvent) {
    event.preventDefault();
    if (!hotelId) return;
    setBusy(true); setError('');
    const body = { code: masterForm.code.trim(), name: masterForm.name.trim(), mealPlan: masterForm.mealPlan, description: masterForm.description.trim() || undefined, active: masterForm.active };
    try {
      if (masterModal?.editing) await apiRequest(`/hotels/rate-plan-masters/${masterModal.editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await apiRequest(`/hotels/${hotelId}/rate-plan-masters`, { method: 'POST', body: JSON.stringify(body) });
      setMasterModal(null);
      setMessage(masterModal?.editing ? 'Rate plan updated.' : 'Rate plan created.');
      await loadMasters(hotelId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save rate plan');
    } finally {
      setBusy(false);
    }
  }

  function startAssign(master: Master) {
    const available = rooms.find((room) => !master.assignments.some((assignment) => assignment.roomTypeId === room.id));
    const preferred = rooms.some((room) => room.id === roomTypeId) && !master.assignments.some((assignment) => assignment.roomTypeId === roomTypeId) ? roomTypeId : available?.id ?? '';
    setAssignmentForm({ roomTypeId: preferred, axisRatePlanId: '', active: true });
    setAssignmentModal({ master });
    setError('');
  }

  function startEditAssignment(master: Master, assignment: Assignment) {
    setAssignmentForm({ roomTypeId: assignment.roomTypeId, axisRatePlanId: assignment.axisRatePlanId ?? '', active: assignment.active });
    setAssignmentModal({ master, assignment });
    setError('');
  }

  async function saveAssignment(event: FormEvent) {
    event.preventDefault();
    if (!assignmentModal) return;
    setBusy(true); setError('');
    try {
      if (assignmentModal.assignment) await apiRequest(`/hotels/rate-plan-assignments/${assignmentModal.assignment.id}`, { method: 'PATCH', body: JSON.stringify({ active: assignmentForm.active, axisRatePlanId: assignmentForm.axisRatePlanId.trim() || undefined }) });
      else await apiRequest(`/hotels/rate-plan-masters/${assignmentModal.master.id}/assignments`, { method: 'POST', body: JSON.stringify({ roomTypeId: assignmentForm.roomTypeId, active: assignmentForm.active, axisRatePlanId: assignmentForm.axisRatePlanId.trim() || undefined }) });
      setAssignmentModal(null);
      setMessage(assignmentModal.assignment ? 'Assignment updated.' : 'Rate plan assigned.');
      await loadMasters(hotelId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save assignment');
    } finally {
      setBusy(false);
    }
  }

  async function toggleRow(row: RatePlanTableRow) {
    if (!row.unassigned && !row.master.active) return;
    setBusy(true); setError('');
    try {
      if (row.assignment) await apiRequest(`/hotels/rate-plan-assignments/${row.assignment.id}`, { method: 'PATCH', body: JSON.stringify({ active: !row.assignment.active }) });
      else await apiRequest(`/hotels/rate-plan-masters/${row.master.id}`, { method: 'PATCH', body: JSON.stringify({ active: !row.master.active }) });
      setMessage(row.effectiveActive ? 'Rate plan deactivated.' : 'Rate plan activated.');
      await loadMasters(hotelId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update rate plan');
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(row: RatePlanTableRow) {
    setOpenMenuId('');
    const target = row.assignment ? `${row.master.name} will no longer be assigned to ${row.assignment.roomType.name}.` : `${row.master.name} will be deleted from this hotel.`;
    if (!await dialog.confirm({ title: row.assignment ? 'Remove room assignment?' : 'Delete unused rate plan?', message: `${target} History, rates and mappings are protected by the backend.`, confirmLabel: row.assignment ? 'Remove Assignment' : 'Delete Rate Plan', danger: true })) return;
    setBusy(true); setError('');
    try {
      if (row.assignment) await apiRequest(`/hotels/rate-plan-assignments/${row.assignment.id}`, { method: 'DELETE' });
      else await apiRequest(`/hotels/rate-plan-masters/${row.master.id}`, { method: 'DELETE' });
      setMessage(row.assignment ? 'Assignment removed.' : 'Rate plan deleted.');
      await loadMasters(hotelId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove rate plan');
    } finally {
      setBusy(false);
    }
  }

  const tableHeader = (label: string, key: RatePlanSortKey) => <button type="button" className="tableSortButton" onClick={() => setSorting(key)} aria-label={`Sort by ${label}`} aria-sort={sortKey === key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>{label}<span className="sortMark">{sortLabel(key)}</span></button>;

  return <AdminLayout title="Rate Plans"><section className="ratePlansPage">
    <header className="ratePlansHeader"><div><h1>Rate Plans</h1><p>Create hotel packages and assign them to room types.</p></div><div className="ratePlansHeaderActions"><label className="ratePlansSearch"><Search size={18} /><input aria-label="Search rate plans" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rate plans, rooms or hotels..." /></label><button className="ratePlanAddButton" type="button" onClick={startCreate} disabled={!hotelId}><Plus size={18} /> Create Rate Plan</button></div></header>
    <div className="ratePlansFilters"><div className="ratePlanStatusFilters">{filters.map((filter) => <button key={filter.key} className={statusFilter === filter.key ? 'active' : ''} type="button" onClick={() => setStatusFilter(filter.key)}><span className="ratePlanFilterRadio">{statusFilter === filter.key && <Check size={11} />}</span>{filter.label} ({filter.count})</button>)}</div><div className="ratePlanSelectFilters"><label><Building2 size={15} /><select aria-label="Filter by hotel" value={hotelId} disabled={loadingHotels} onChange={(event) => changeHotel(event.target.value)}><option value="">Select Hotel</option>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select><ChevronDown size={15} /></label><label><Tag size={15} /><select aria-label="Filter by room type" value={roomTypeId} disabled={!hotelId} onChange={(event) => changeRoomType(event.target.value)}><option value="">All Room Types</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name} ({room.code})</option>)}</select><ChevronDown size={15} /></label></div></div>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
    <section className="ratePlansTableCard"><div className="ratePlansTableWrap"><table className="ratePlansTable"><thead><tr><th className="selectColumn"><span className="tableCheckbox" /></th><th>{tableHeader('Plan', 'plan')}</th><th>{tableHeader('Room / Hotel', 'room')}</th><th>{tableHeader('Meal Plan', 'meal')}</th><th>{tableHeader('Status', 'status')}</th><th>{tableHeader('Rates (INR)', 'rate')}</th><th>{tableHeader('Bookings', 'bookings')}</th><th>Actions</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={8} className="ratePlansLoading">Loading rate plans...</td></tr> : visibleRows.map((row) => {
        const room = row.assignment?.roomType;
        const assignmentActionDisabled = Boolean(row.assignment && !row.master.active);
        return <tr className={selectedId === row.id ? 'selected' : ''} key={row.id}>
          <td className="selectColumn"><button className={`tableRadio ${selectedId === row.id ? 'selected' : ''}`} type="button" aria-label={`Select ${row.master.name}${room ? ` for ${room.name}` : ''}`} onClick={() => setSelectedId((current) => current === row.id ? '' : row.id)}>{selectedId === row.id ? <Check size={12} /> : <Circle size={16} />}</button></td>
          <td><div className="ratePlanName"><b>{row.master.name}</b><code>{row.master.code}</code><small>{row.master.description || 'No description'}</small></div></td>
          <td><div className="ratePlanRoom"><span>{row.master.hotel?.name ?? selectedHotel?.name}</span><span>{row.master.hotel?.city ?? selectedHotel?.city}</span><small>{room ? `${room.name} (${room.code})` : 'Not assigned'}</small></div></td>
          <td>{row.master.mealPlan}</td>
          <td><span className={`ratePlanStatus ${row.effectiveActive ? 'active' : 'inactive'}`} title={!row.master.active && row.assignment ? 'The shared hotel plan is inactive.' : undefined}><i />{row.effectiveActive ? 'Active' : 'Inactive'}</span></td>
          <td><span title={row.assignment ? formatConfiguredDays(row.assignment._count.rates) : undefined}>{formatStartingRate(row.startingRate)}</span></td>
          <td>{row.confirmedBookingCount}</td>
          <td><div className="ratePlanActions">{visibleRows.findIndex((item) => item.master.id === row.master.id) === visibleRows.findIndex((item) => item.master.id === row.master.id && item.id === row.id) && <button className="ratePlanEditButton" type="button" disabled={busy || !row.master.active} title="Import daily rates for this hotel rate plan" onClick={() => router.push(`/admin/base-rate-import?hotelId=${hotelId}&masterId=${row.master.id}`)}>Import rates</button>}{row.assignment && <button className="ratePlanEditButton" type="button" disabled={busy} title="Manage daily rates for this room assignment" onClick={() => router.push(`/admin/hotels/${hotelId}/catalog?roomTypeId=${row.assignment!.roomTypeId}&ratePlanId=${row.assignment!.id}`)}>Manage rates</button>}<button className="ratePlanEditButton" type="button" disabled={busy} title="Edit shared plan details" onClick={() => startEdit(row.master)}><Pencil size={14} /> Edit</button><button className="ratePlanDeactivateButton" type="button" disabled={busy || assignmentActionDisabled} title={row.assignment ? `${row.effectiveActive ? 'Deactivate' : 'Activate'} for ${room?.name ?? 'this room'}` : `${row.effectiveActive ? 'Deactivate' : 'Activate'} shared rate plan`} onClick={() => void toggleRow(row)}><Power size={14} /> {row.effectiveActive ? 'Deactivate' : 'Activate'}</button><div className="ratePlanMore"><button type="button" disabled={busy} aria-label={`More actions for ${row.master.name}${room ? ` on ${room.name}` : ''}`} aria-expanded={openMenuId === row.id} onClick={() => setOpenMenuId((current) => current === row.id ? '' : row.id)}><MoreVertical size={19} /></button>{openMenuId === row.id && <div className="ratePlanMoreMenu" role="menu">{row.assignment && <><button type="button" role="menuitem" onClick={() => { setOpenMenuId(''); startEditAssignment(row.master, row.assignment!); }}>Edit room assignment</button><button type="button" role="menuitem" onClick={() => setOpenMenuId('')}>{row.assignment.axisRatePlanId ? 'AxisRooms mapped' : 'AxisRooms not mapped'}</button></>}{!row.assignment && <button type="button" role="menuitem" onClick={() => void removeRow(row)}>Delete</button>}{row.assignment && <button type="button" role="menuitem" onClick={() => void removeRow(row)}>Remove assignment</button>}</div>}</div></div></td>
        </tr>;
      })}
      {!loading && !visibleRows.length && <tr><td colSpan={8} className="ratePlansEmpty">No rate plans match these filters.</td></tr>}
    </tbody></table></div></section>

    {masterModal && <div className="ratePlanModalBackdrop"><form className="ratePlanCopyModal ratePlanMasterModal" role="dialog" aria-modal="true" aria-labelledby="master-modal-title" onSubmit={saveMaster}><header><div><h2 id="master-modal-title">{masterModal.editing ? 'Edit rate plan' : 'Create rate plan'}</h2><p>Create the plan once and use it for one or more room types in this hotel.</p></div><button type="button" aria-label="Close" onClick={() => setMasterModal(null)}><X size={18} /></button></header><div className="two"><label>Plan code<input value={masterForm.code} onChange={(event) => setMasterForm({ ...masterForm, code: event.target.value })} placeholder="CP" required minLength={2} /></label><label>Plan name<input value={masterForm.name} onChange={(event) => setMasterForm({ ...masterForm, name: event.target.value })} placeholder="CP - Breakfast" required minLength={2} /></label></div><label>Meal plan<select value={masterForm.mealPlan} onChange={(event) => setMasterForm({ ...masterForm, mealPlan: event.target.value })}><option value="EP">EP · Room only</option><option value="CP">CP · Breakfast</option><option value="MAP">MAP · Breakfast + major meal</option><option value="AP">AP · All meals</option></select></label><label>Description<textarea rows={3} value={masterForm.description} onChange={(event) => setMasterForm({ ...masterForm, description: event.target.value })} placeholder="Describe inclusions and commercial terms" /></label><label className="checkLabel"><input type="checkbox" checked={masterForm.active} onChange={(event) => setMasterForm({ ...masterForm, active: event.target.checked })} /> Active and available for booking</label><footer><button className="smallBtn" type="button" onClick={() => setMasterModal(null)} disabled={busy}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Saving...' : masterModal.editing ? 'Save changes' : 'Create rate plan'}</button></footer></form></div>}

    {assignmentModal && <div className="ratePlanModalBackdrop"><form className="ratePlanCopyModal ratePlanAssignmentModal" role="dialog" aria-modal="true" aria-labelledby="assignment-modal-title" onSubmit={saveAssignment}><header><div><h2 id="assignment-modal-title">{assignmentModal.assignment ? 'Edit room assignment' : 'Assign existing rate plan'}</h2><p>{assignmentModal.master.name} ({assignmentModal.master.code})</p></div><button type="button" aria-label="Close" onClick={() => setAssignmentModal(null)}><X size={18} /></button></header><label>Room type<select value={assignmentForm.roomTypeId} onChange={(event) => setAssignmentForm({ ...assignmentForm, roomTypeId: event.target.value })} disabled={Boolean(assignmentModal.assignment)} required><option value="">Select room type</option>{rooms.filter((room) => room.id === assignmentModal.assignment?.roomTypeId || !assignmentModal.master.assignments.some((assignment) => assignment.roomTypeId === room.id)).map((room) => <option key={room.id} value={room.id}>{room.name} ({room.code})</option>)}</select></label><details><summary>Advanced / Channel Manager Mapping</summary><label>AxisRooms Rate Plan ID<input value={assignmentForm.axisRatePlanId} onChange={(event) => setAssignmentForm({ ...assignmentForm, axisRatePlanId: event.target.value })} placeholder="Optional assignment mapping ID" /></label><p className="ratePlanCopyNote">Optional. Used only when this room/rate plan is connected to AxisRooms.</p></details><label className="checkLabel"><input type="checkbox" checked={assignmentForm.active} onChange={(event) => setAssignmentForm({ ...assignmentForm, active: event.target.checked })} /> Active for this room</label><footer><button className="smallBtn" type="button" onClick={() => setAssignmentModal(null)} disabled={busy}>Cancel</button><button className="btn" disabled={busy || !assignmentForm.roomTypeId}>{busy ? 'Saving...' : assignmentModal.assignment ? 'Save assignment' : 'Assign rate plan'}</button></footer></form></div>}
  </section></AdminLayout>;
}
