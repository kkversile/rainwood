'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Building2, Check, ChevronDown, Circle, MoreVertical, Pencil, Plus, Power, Search, Tag, X } from 'lucide-react';
import { AdminLayout } from '../../../components/Shell';
import { apiRequest } from '../../../lib/api';
import { useDialog } from '../../../components/ReactDialog';

type RoomOption = { id: string; name: string; code: string; hotel: { id: string; name: string; city: string } };
type Hotel = { id: string; name: string; city: string; rooms?: { id: string; name: string; code: string }[] };
type RatePlan = { id: string; roomTypeId: string; code: string; name: string; mealPlan: string; description?: string | null; active: boolean; axisRatePlanId?: string | null; roomType: RoomOption; _count: { rates: number; lines: number; holdLines: number } };
type PlanForm = { roomTypeId: string; code: string; name: string; mealPlan: string; description: string; axisRatePlanId: string; active: boolean };
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'SEASONAL' | 'PROMOTIONAL';

const blank: PlanForm = { roomTypeId: '', code: '', name: '', mealPlan: 'CP', description: '', axisRatePlanId: '', active: true };

export default function RatePlansMaster() {
  const dialog = useDialog();
  const [plans, setPlans] = useState<RatePlan[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [form, setForm] = useState<PlanForm>(blank);
  const [editing, setEditing] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [hotelFilter, setHotelFilter] = useState('ALL');
  const [mealFilter, setMealFilter] = useState('ALL');
  const [selectedId, setSelectedId] = useState('');
  const [openMenuId, setOpenMenuId] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [loadedPlans, loadedHotels] = await Promise.all([apiRequest<RatePlan[]>('/hotels/rate-plans'), apiRequest<Hotel[]>('/hotels')]);
      setPlans(loadedPlans);
      setSelectedId((current) => current || loadedPlans[0]?.id || '');
      setRooms(loadedHotels.flatMap((hotel) => (hotel.rooms ?? []).map((room) => ({ ...room, hotel: { id: hotel.id, name: hotel.name, city: hotel.city } }))));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load rate plans');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const hotelOptions = useMemo(() => Array.from(new Map(plans.map((plan) => [plan.roomType.hotel.id, plan.roomType.hotel.name])).entries()), [plans]);
  const mealOptions = useMemo(() => Array.from(new Set(plans.map((plan) => plan.mealPlan))).sort(), [plans]);
  const filteredPlans = useMemo(() => plans.filter((plan) => {
    const haystack = `${plan.name} ${plan.code} ${plan.roomType.name} ${plan.roomType.hotel.name}`.toLowerCase();
    const statusMatch = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' && plan.active) || (statusFilter === 'INACTIVE' && !plan.active) || (statusFilter === 'SEASONAL' && false) || (statusFilter === 'PROMOTIONAL' && false);
    return haystack.includes(search.toLowerCase()) && statusMatch && (hotelFilter === 'ALL' || plan.roomType.hotel.id === hotelFilter) && (mealFilter === 'ALL' || plan.mealPlan === mealFilter);
  }), [plans, search, statusFilter, hotelFilter, mealFilter]);

  function startCreate() { setEditing(''); setForm({ ...blank, roomTypeId: rooms[0]?.id ?? '' }); setOpen(true); setError(''); setMessage(''); }
  function startEdit(plan: RatePlan) { setEditing(plan.id); setForm({ roomTypeId: plan.roomTypeId, code: plan.code, name: plan.name, mealPlan: plan.mealPlan, description: plan.description ?? '', axisRatePlanId: plan.axisRatePlanId ?? '', active: plan.active }); setOpen(true); setError(''); setMessage(''); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const body = { code: form.code.trim().toUpperCase(), name: form.name.trim(), mealPlan: form.mealPlan.trim().toUpperCase(), description: form.description, active: form.active, axisRatePlanId: form.axisRatePlanId || undefined };
      if (editing) await apiRequest(`/hotels/rate-plans/${editing}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await apiRequest(`/hotels/rooms/${form.roomTypeId}/rate-plans`, { method: 'POST', body: JSON.stringify(body) });
      setOpen(false); setMessage(editing ? 'Rate plan updated.' : 'Rate plan created.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save rate plan'); }
    finally { setBusy(false); }
  }
  async function remove(plan: RatePlan) {
    setOpenMenuId('');
    if (!await dialog.confirm({ title: 'Delete rate plan?', message: `${plan.name} will be deleted. Plans with rates or booking history must be deactivated instead.`, confirmLabel: 'Delete Rate Plan', danger: true })) return;
    setBusy(true); setError('');
    try { await apiRequest(`/hotels/rate-plans/${plan.id}`, { method: 'DELETE' }); setMessage('Rate plan deleted.'); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete rate plan'); }
    finally { setBusy(false); }
  }
  async function toggle(plan: RatePlan) {
    setBusy(true); setError('');
    try { await apiRequest(`/hotels/rate-plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ active: !plan.active }) }); setMessage(plan.active ? 'Rate plan deactivated.' : 'Rate plan activated.'); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not change rate plan status'); }
    finally { setBusy(false); }
  }

  const filters: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'ALL', label: 'All', count: plans.length },
    { key: 'ACTIVE', label: 'Active', count: plans.filter((plan) => plan.active).length },
    { key: 'INACTIVE', label: 'Inactive', count: plans.filter((plan) => !plan.active).length },
    { key: 'SEASONAL', label: 'Seasonal', count: 0 },
    { key: 'PROMOTIONAL', label: 'Promotional', count: 0 },
  ];

  return <AdminLayout title="Rate Plans"><section className="ratePlansPage">
    <header className="ratePlansHeader"><div><h1>Rate Plans</h1><p>Manage your hotel&apos;s rate plans and availability</p></div><div className="ratePlansHeaderActions"><label className="ratePlansSearch"><Search size={18} /><input aria-label="Search rate plans" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rate plans, rooms or hotels..." /></label><button className="ratePlanAddButton" type="button" onClick={startCreate}><Plus size={18} /> Add Rate Plan</button></div></header>
    <div className="ratePlansFilters"><div className="ratePlanStatusFilters">{filters.map((filter) => <button key={filter.key} className={statusFilter === filter.key ? 'active' : ''} type="button" onClick={() => setStatusFilter(filter.key)}><span className="ratePlanFilterRadio">{statusFilter === filter.key && <Check size={11} />}</span>{filter.label} ({filter.count})</button>)}</div><div className="ratePlanSelectFilters"><label><Building2 size={15} /><select aria-label="Filter by hotel" value={hotelFilter} onChange={(event) => setHotelFilter(event.target.value)}><option value="ALL">All Hotels</option>{hotelOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><ChevronDown size={15} /></label><label><Tag size={15} /><select aria-label="Filter by meal plan" value={mealFilter} onChange={(event) => setMealFilter(event.target.value)}><option value="ALL">All Meal Plans</option>{mealOptions.map((meal) => <option key={meal} value={meal}>{meal}</option>)}</select><ChevronDown size={15} /></label></div></div>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
    {open && <form className="formCard masterForm" onSubmit={submit}><div className="rangeSectionHeader"><h2>{editing ? 'Edit rate plan' : 'Add rate plan'}</h2><button className="smallBtn" type="button" onClick={() => setOpen(false)}><X size={14} /> Close</button></div><div className="two"><label>Room<select value={form.roomTypeId} onChange={(event) => setForm({ ...form, roomTypeId: event.target.value })} disabled={Boolean(editing)} required><option value="">Select room</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.hotel.name} / {room.name} ({room.code})</option>)}</select></label><label>Plan code<input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="CP" required /></label></div><div className="two"><label>Plan name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Continental Plan" required /></label><label>Meal plan<select value={form.mealPlan} onChange={(event) => setForm({ ...form, mealPlan: event.target.value })}><option>EP</option><option>CP</option><option>MAP</option><option>AP</option></select></label></div><label>Description<textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Breakfast included" /></label><label>AxisRooms rate-plan ID<input value={form.axisRatePlanId} onChange={(event) => setForm({ ...form, axisRatePlanId: event.target.value })} placeholder="Optional mapping ID" /></label><label className="checkLabel"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active and available for booking</label><button className="btn" disabled={busy}>{busy ? 'Saving...' : editing ? 'Save changes' : 'Create rate plan'}</button></form>}
    <section className="ratePlansTableCard"><div className="ratePlansTableWrap"><table className="ratePlansTable"><thead><tr><th className="selectColumn"><span className="tableCheckbox" /></th><th>Plan <span className="sortMark">↕</span></th><th>Room / Hotel <span className="sortMark">↕</span></th><th>Meal Plan <span className="sortMark">↕</span></th><th>Status <span className="sortMark">↕</span></th><th>Rates (INR) <span className="sortMark">↕</span></th><th>Bookings <span className="sortMark">↕</span></th><th>Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={8} className="ratePlansLoading">Loading rate plans...</td></tr> : filteredPlans.map((plan) => <tr className={selectedId === plan.id ? 'selected' : ''} key={plan.id}><td className="selectColumn"><button className={`tableRadio ${selectedId === plan.id ? 'selected' : ''}`} type="button" aria-label={`Select ${plan.name}`} onClick={() => setSelectedId((current) => current === plan.id ? '' : plan.id)}>{selectedId === plan.id ? <Check size={12} /> : <Circle size={16} />}</button></td><td><div className="ratePlanName"><b>{plan.name}</b><code>{plan.code}</code><small>{plan.description || 'No description'}</small></div></td><td><div className="ratePlanRoom"><span>{plan.roomType.hotel.name}</span><span>{plan.roomType.hotel.city}</span><small>{plan.roomType.name} ({plan.roomType.code})</small></div></td><td>{plan.mealPlan}</td><td><span className={`ratePlanStatus ${plan.active ? 'active' : 'inactive'}`}><i />{plan.active ? 'Active' : 'Inactive'}</span></td><td>{plan._count.rates}</td><td>{plan._count.lines + plan._count.holdLines}</td><td><div className="ratePlanActions"><button className="ratePlanEditButton" type="button" disabled={busy} onClick={() => startEdit(plan)}><Pencil size={14} /> Edit</button><button className="ratePlanDeactivateButton" type="button" disabled={busy} onClick={() => void toggle(plan)}><Power size={14} /> {plan.active ? 'Deactivate' : 'Activate'}</button><div className="ratePlanMore"><button type="button" disabled={busy} aria-label={`More actions for ${plan.name}`} aria-expanded={openMenuId === plan.id} onClick={() => setOpenMenuId((current) => current === plan.id ? '' : plan.id)}><MoreVertical size={19} /></button>{openMenuId === plan.id && <div className="ratePlanMoreMenu" role="menu"><button type="button" role="menuitem" onClick={() => void remove(plan)}>Delete</button></div>}</div></div></td></tr>)}{!loading && !filteredPlans.length && <tr><td colSpan={8} className="ratePlansEmpty">No rate plans match these filters.</td></tr>}</tbody></table></div></section>
  </section></AdminLayout>;
}
