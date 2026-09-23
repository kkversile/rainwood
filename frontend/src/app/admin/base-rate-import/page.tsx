'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminLayout } from '../../../components/Shell';
import { apiFileBlob, apiRequest } from '../../../lib/api';

type Hotel = { id: string; name: string; code: string; city: string };
type Master = { id: string; hotelId: string; code: string; name: string; mealPlan: string; active: boolean; assignments: { id: string; active: boolean; roomType: { id: string; name: string; code: string } }[] };
type ImportResult = { rowsReceived: number; rowsValid: number; rowsInvalid: number; rowsImported: number; rowsUpdated: number; errors: { row: number; field: string; message: string }[] };

export default function RatePlanRateImportPage() {
  const searchParams = useSearchParams();
  const requestedHotelId = searchParams.get('hotelId') ?? '';
  const requestedMasterId = searchParams.get('masterId') ?? '';
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [masters, setMasters] = useState<Master[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [masterId, setMasterId] = useState('');
  const [loadingMasters, setLoadingMasters] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest<Hotel[]>('/hotels').then((items) => {
      setHotels(items);
      setHotelId(items.some((item) => item.id === requestedHotelId) ? requestedHotelId : '');
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load hotels'));
  }, [requestedHotelId]);

  useEffect(() => {
    if (!hotelId) { setMasters([]); setMasterId(''); return; }
    setLoadingMasters(true);
    apiRequest<Master[]>(`/hotels/${hotelId}/rate-plan-masters`).then((items) => {
      const active = items.filter((item) => item.active);
      setMasters(active);
      setMasterId(active.some((item) => item.id === requestedMasterId) ? requestedMasterId : '');
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load rate plans')).finally(() => setLoadingMasters(false));
  }, [hotelId, requestedMasterId]);

  const selectedMaster = masters.find((master) => master.id === masterId);
  const assignedRooms = useMemo(() => selectedMaster?.assignments.filter((assignment) => assignment.active).map((assignment) => assignment.roomType) ?? [], [selectedMaster]);

  function changeHotel(nextHotelId: string) {
    setHotelId(nextHotelId); setMasters([]); setMasterId(''); setError(''); setMessage('');
  }

  async function download() {
    if (!hotelId || !masterId) return;
    try {
      const blob = await apiFileBlob(`/hotels/${hotelId}/rate-plan-masters/${masterId}/rates/import-template.xlsx`);
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'rainwood-rate-plan-rate-template.xlsx'; link.click(); URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not download rate template'); }
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file || !hotelId || !masterId) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const form = new FormData(); form.append('file', file);
      const result = await apiRequest<ImportResult>(`/hotels/${hotelId}/rate-plan-masters/${masterId}/rates/import`, { method: 'POST', body: form });
      if (result.errors.length) setError(`Received ${result.rowsReceived} row(s): ${result.rowsInvalid} invalid. No rows were saved.\n${result.errors.map((item) => `Row ${item.row} — ${item.field} — ${item.message}`).join('\n')}`);
      else setMessage(`Received ${result.rowsReceived}; imported ${result.rowsImported}; updated ${result.rowsUpdated}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import rate plan rates'); }
    finally { setBusy(false); event.target.value = ''; }
  }

  return <AdminLayout title="Rate Import"><section className="masterPanel">
    <div className="listToolbar"><div><span>Rate management</span><h2>Rate Plan Rate Import</h2><p>Import daily room rates for an existing hotel rate plan.</p></div></div>
    {error && <pre className="error" role="alert">{error}</pre>}{message && <p className="notice" role="status">{message}</p>}
    <section className="formCard masterForm">
      <label>Hotel<select aria-label="Hotel" value={hotelId} onChange={(event) => changeHotel(event.target.value)}><option value="">Select hotel</option>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name} ({hotel.code})</option>)}</select></label>
      <label>Rate Plan<select aria-label="Rate Plan" value={masterId} disabled={!hotelId || loadingMasters} onChange={(event) => setMasterId(event.target.value)}><option value="">{loadingMasters ? 'Loading rate plans...' : 'Select rate plan'}</option>{masters.map((master) => <option key={master.id} value={master.id}>{master.code} - {master.name} · {master.mealPlan}</option>)}</select></label>
      {selectedMaster && <div className="mutedText"><b>Assigned Rooms</b><p>{assignedRooms.length ? assignedRooms.map((room) => `${room.name} (${room.code})`).join(', ') : 'No active room assignments.'}</p></div>}
      <div className="rowActions"><button className="smallBtn" type="button" onClick={() => void download()} disabled={!hotelId || !masterId || busy}>Download Rate Template</button><label className="smallBtn">{busy ? 'Importing...' : 'Choose Excel to Import'}<input type="file" accept=".xlsx,.xlsm" hidden onChange={(event) => void upload(event)} disabled={!hotelId || !masterId || busy} /></label></div>
      <p className="mutedText">The workbook is validated completely before anything saves. Agents assigned to this rate plan automatically receive these rates.</p>
    </section>
  </section></AdminLayout>;
}
