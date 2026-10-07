'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminLayout } from '../../../components/Shell';
import { GRID_FIELDS, GridBand, GridField, RateMasterGrid, RateMasterGridData } from '../../../components/RateMasterGrid';
import { RainwoodDatePicker } from '../../../components/RainwoodDatePicker';
import { apiRequest } from '../../../lib/api';

type Hotel = { id: string; name: string };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sameValues(left: string[], right: string[]) {
  return [...left].sort().join('|') === [...right].sort().join('|');
}

function isValidRange(from: string, to: string) {
  return Boolean(from && to && from <= to);
}

export default function RateMasterPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [draft, setDraft] = useState<RateMasterGridData | null>(null);
  const [original, setOriginal] = useState<RateMasterGridData | null>(null);
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const gridRequestRef = useRef(0);

  const dirty = useMemo(() => Boolean(draft && original && JSON.stringify(draft) !== JSON.stringify(original)), [draft, original]);
  const validRange = isValidRange(from, to);

  useEffect(() => {
    let active = true;
    apiRequest<Hotel[]>('/hotels').then((items) => {
      if (!active) return;
      setHotels(items);
      if (!hotelId && items[0]) setHotelId(items[0].id);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load hotels'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hotelId) return;
    if (!from || !to) {
      void loadGrid(hotelId, '', '');
      return;
    }
    if (!isValidRange(from, to)) return;
    void loadGrid(hotelId, from, to);
  }, [hotelId, from, to]);

  async function loadGrid(selectedHotelId: string, selectedFrom: string, selectedTo: string) {
    const requestId = ++gridRequestRef.current;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const params = new URLSearchParams({ hotelId: selectedHotelId });
      if (isValidRange(selectedFrom, selectedTo)) { params.set('from', selectedFrom); params.set('to', selectedTo); }
      const data = await apiRequest<RateMasterGridData>(`/rate-master/grid?${params.toString()}`);
      if (requestId !== gridRequestRef.current) return;
      setDraft(data);
      setOriginal(clone(data));
      setExpandedRooms(new Set(data.rooms.map((room) => room.id)));
      setExpandedPlans(new Set(data.rooms.flatMap((room) => room.plans.map((plan) => `${room.id}:${plan.ratePlanId}`))));
    } catch (reason) {
      if (requestId !== gridRequestRef.current) return;
      setError(reason instanceof Error ? reason.message : 'Could not load Rate Master');
    } finally {
      if (requestId === gridRequestRef.current) setLoading(false);
    }
  }

  function confirmDiscard() {
    return !dirty || window.confirm('You have unsaved Rate Master changes. Discard them?');
  }

  function changeHotel(value: string) {
    if (!confirmDiscard()) return;
    setHotelId(value);
  }

  function changeDate(field: 'from' | 'to', value: string) {
    if (!confirmDiscard()) return;
    if (field === 'from') setFrom(value);
    else setTo(value);
  }

  function updateDraft(mutator: (next: RateMasterGridData) => void) {
    setDraft((current) => {
      if (!current) return current;
      const next = clone(current);
      mutator(next);
      return next;
    });
  }

  function cellChange(ratePlanId: string, band: GridBand, field: GridField, value: string) {
    const numeric = value.trim() === '' ? 0 : Number(value);
    updateDraft((next) => {
      for (const room of next.rooms) for (const plan of room.plans) if (plan.ratePlanId === ratePlanId) {
        const row = plan.rows.find((item) => item.band === band);
        if (!row) return;
        row[field] = Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
        row.mixedFields = row.mixedFields.filter((item) => item !== field);
      }
    });
  }

  function copyRack(ratePlanId: string) {
    updateDraft((next) => {
      for (const room of next.rooms) for (const plan of room.plans) if (plan.ratePlanId === ratePlanId) {
        const rack = plan.rows.find((row) => row.band === 'RACK');
        if (!rack) return;
        for (const row of plan.rows) if (row.band !== 'RACK') {
          for (const field of GRID_FIELDS) row[field] = rack[field];
          row.mixedFields = [...rack.mixedFields];
        }
      }
    });
    setMessage('Rack values copied locally to categories A-E. Save Rates to persist them.');
  }

  function clearPlan(ratePlanId: string) {
    updateDraft((next) => {
      for (const room of next.rooms) for (const plan of room.plans) if (plan.ratePlanId === ratePlanId) for (const row of plan.rows) {
        for (const field of GRID_FIELDS) row[field] = 0;
        row.mixedFields = [];
      }
    });
    setMessage('Plan cleared locally. Save Rates to persist the zero values.');
  }

  function toggleRoom(roomId: string) {
    setExpandedRooms((current) => { const next = new Set(current); if (next.has(roomId)) next.delete(roomId); else next.add(roomId); return next; });
  }

  function togglePlan(key: string) {
    setExpandedPlans((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }

  function revert() {
    if (!original) return;
    setDraft(clone(original));
    setMessage('Unsaved Rate Master changes reverted.');
    setError('');
  }

  async function save() {
    if (!draft || !original || !hotelId || !validRange || !dirty) return;
    const changes: Array<Record<string, unknown>> = [];
    for (const room of draft.rooms) for (const plan of room.plans) {
      const originalPlan = original.rooms.flatMap((item) => item.plans).find((item) => item.ratePlanId === plan.ratePlanId);
      if (!originalPlan) continue;
      for (const row of plan.rows) {
        const oldRow = originalPlan.rows.find((item) => item.band === row.band);
        if (!oldRow) continue;
        const fields = GRID_FIELDS.filter((field) => row[field] !== oldRow[field] || !sameValues(row.mixedFields.filter((item) => item === field), oldRow.mixedFields.filter((item) => item === field)));
        if (fields.length) changes.push({ ratePlanId: plan.ratePlanId, band: row.band, fields, ...Object.fromEntries(fields.map((field) => [field, row[field]])) });
      }
    }
    if (!changes.length) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await apiRequest<RateMasterGridData>('/rate-master/grid', { method: 'PUT', body: JSON.stringify({ hotelId, validFrom: from, validTo: to, changes }) });
      setDraft(saved);
      setOriginal(clone(saved));
      setMessage('Rate Master saved successfully.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save Rate Master');
    } finally {
      setSaving(false);
    }
  }

  const saveDisabled = !hotelId || !validRange || !dirty || saving;
  return <AdminLayout title="Rate Master"><section className="pageSection rateMasterPage">
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    <section className="rateMasterToolbar" aria-label="Rate Master controls">
      <label>Hotel<select aria-label="Hotel" value={hotelId} onChange={(event) => changeHotel(event.target.value)}><option value="">Select hotel</option>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label>
      <label>From<RainwoodDatePicker label="From date" value={from} onChange={(value) => changeDate('from', value)} /></label>
      <span className="rateMasterArrow" aria-hidden="true">→</span>
      <label>To<RainwoodDatePicker label="To date" value={to} minDate={from} onChange={(value) => changeDate('to', value)} /></label>
      <button className="smallBtn secondary" type="button" disabled={!validRange || loading} onClick={() => void loadGrid(hotelId, from, to)}>Load rates</button>
      <div className="rateMasterToolbarActions"><button className="smallBtn secondary" type="button" disabled={!dirty} onClick={revert}>Revert Unsaved</button><button className="smallBtn" type="button" disabled={saveDisabled} onClick={() => void save()}>{saving ? 'Saving…' : 'Save Rates'}</button></div>
    </section>
    {!validRange && (from || to) && <p className="error" role="alert">Select both dates, with From on or before To, to load stored rates.</p>}
    {loading && <p className="loading" role="status">Loading Rate Master…</p>}
    {draft && !loading && <RateMasterGrid data={draft} expandedRooms={expandedRooms} expandedPlans={expandedPlans} onToggleRoom={toggleRoom} onTogglePlan={togglePlan} onCellChange={cellChange} onCopyRack={copyRack} onClearPlan={clearPlan} />}
    <footer className="rateMasterStatusBar"><span><b>Keyboard:</b> Tab moves through cells · numeric entry · mixed cells can be replaced directly</span><span>{dirty ? 'Unsaved changes' : 'All changes saved'}</span></footer>
  </section></AdminLayout>;
}
