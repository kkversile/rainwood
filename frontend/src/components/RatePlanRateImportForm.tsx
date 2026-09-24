'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { apiFileBlob, apiRequest } from '../lib/api';

type Hotel = { id: string; name: string; code: string; city: string };
type Master = { id: string; hotelId: string; code: string; name: string; mealPlan: string; active: boolean; assignments: { id: string; active: boolean; roomType: { id: string; name: string; code: string } }[] };

export type ImportResult = {
  rowsReceived: number;
  rowsValid: number;
  rowsInvalid: number;
  rowsImported: number;
  rowsUpdated: number;
  errors: { row: number; field: string; message: string }[];
};

export type RatePlanRateImportFormProps = {
  initialHotelId?: string;
  initialMasterId?: string;
  mode?: 'page' | 'modal';
  lockContext?: boolean;
  onImportSuccess?: (result: ImportResult) => void | Promise<void>;
  onCancel?: () => void;
  onBusyChange?: (busy: boolean) => void;
};

export function RatePlanRateImportForm({ initialHotelId = '', initialMasterId = '', mode = 'page', lockContext = false, onImportSuccess, onCancel, onBusyChange }: RatePlanRateImportFormProps) {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [masters, setMasters] = useState<Master[]>([]);
  const [hotelId, setHotelId] = useState(initialHotelId);
  const [masterId, setMasterId] = useState(initialMasterId);
  const [loadingHotels, setLoadingHotels] = useState(true);
  const [loadingMasters, setLoadingMasters] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function setBusyState(nextBusy: boolean) {
    setBusy(nextBusy);
    onBusyChange?.(nextBusy);
  }

  function resetImportState() {
    setSelectedFile(null);
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  useEffect(() => {
    let cancelled = false;
    setHotelId(initialHotelId);
    setMasterId(initialMasterId);
    resetImportState();
    setLoadingHotels(true);
    apiRequest<Hotel[]>('/hotels').then((items) => {
      if (cancelled) return;
      setHotels(items);
      const validHotelId = items.some((item) => item.id === initialHotelId) ? initialHotelId : '';
      setHotelId(validHotelId);
      if (lockContext && initialHotelId && !validHotelId) setError('The selected hotel is no longer available.');
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load hotels');
    }).finally(() => {
      if (!cancelled) setLoadingHotels(false);
    });
    return () => { cancelled = true; };
  }, [initialHotelId, initialMasterId, lockContext]);

  useEffect(() => {
    if (!hotelId) {
      setMasters([]);
      setMasterId('');
      setLoadingMasters(false);
      return;
    }
    let cancelled = false;
    setLoadingMasters(true);
    apiRequest<Master[]>(`/hotels/${hotelId}/rate-plan-masters`).then((items) => {
      if (cancelled) return;
      const available = items.filter((item) => item.active || (lockContext && item.id === initialMasterId));
      setMasters(available);
      const validMasterId = available.some((item) => item.id === initialMasterId) ? initialMasterId : '';
      setMasterId(validMasterId);
      if (lockContext && initialMasterId && !validMasterId) setError('The selected rate plan is no longer available.');
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load rate plans');
    }).finally(() => {
      if (!cancelled) setLoadingMasters(false);
    });
    return () => { cancelled = true; };
  }, [hotelId, initialMasterId, lockContext]);

  const selectedHotel = hotels.find((hotel) => hotel.id === hotelId);
  const selectedMaster = masters.find((master) => master.id === masterId);
  const assignedRooms = useMemo(() => selectedMaster?.assignments.filter((assignment) => assignment.active).map((assignment) => assignment.roomType) ?? [], [selectedMaster]);

  function changeHotel(nextHotelId: string) {
    setHotelId(nextHotelId);
    setMasters([]);
    setMasterId('');
    resetImportState();
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    setResult(null);
    setError('');
  }

  async function download() {
    if (!hotelId || !masterId || busy) return;
    try {
      const blob = await apiFileBlob(`/hotels/${hotelId}/rate-plan-masters/${masterId}/rates/import-template.xlsx`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'rainwood-rate-plan-rate-template.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not download rate template');
    }
  }

  async function importRates() {
    if (busy || !hotelId || !masterId || !selectedFile) return;
    setBusyState(true);
    setError('');
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', selectedFile);
      const imported = await apiRequest<ImportResult>(`/hotels/${hotelId}/rate-plan-masters/${masterId}/rates/import`, { method: 'POST', body: form });
      setResult(imported);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imported.errors.length) {
        setError('Import could not be completed. No rows were saved.');
      } else {
        await onImportSuccess?.(imported);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not import rate plan rates');
    } finally {
      setBusyState(false);
    }
  }

  const hotelLabel = selectedHotel ? `${selectedHotel.name} (${selectedHotel.code})` : loadingHotels ? 'Loading hotel...' : 'Hotel unavailable';
  const masterLabel = selectedMaster ? `${selectedMaster.code} - ${selectedMaster.name} · ${selectedMaster.mealPlan}` : loadingMasters ? 'Loading rate plan...' : 'Rate plan unavailable';

  return <div className={`rateImportForm ${mode === 'modal' ? 'rateImportFormModal' : ''}`} data-testid="rate-import-form">
    {error && <p className="error rateImportError" role="alert">{error}</p>}
    <div className="rateImportContext">
      {lockContext ? <>
        <div className="rateImportLockedField"><span>Hotel</span><b>{hotelLabel}</b></div>
        <div className="rateImportLockedField"><span>Rate Plan</span><b>{masterLabel}</b></div>
      </> : <>
        <label>Hotel<select aria-label="Hotel" value={hotelId} onChange={(event) => changeHotel(event.target.value)} disabled={loadingHotels || busy}><option value="">Select hotel</option>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name} ({hotel.code})</option>)}</select></label>
        <label>Rate Plan<select aria-label="Rate Plan" value={masterId} disabled={!hotelId || loadingMasters || busy} onChange={(event) => { setMasterId(event.target.value); resetImportState(); }}><option value="">{loadingMasters ? 'Loading rate plans...' : 'Select rate plan'}</option>{masters.map((master) => <option key={master.id} value={master.id}>{master.code} - {master.name} · {master.mealPlan}</option>)}</select></label>
      </>}
    </div>
    {selectedMaster && <div className="rateImportAssignedRooms"><span>Assigned Rooms</span><p>{assignedRooms.length ? assignedRooms.map((room) => `${room.name} (${room.code})`).join(', ') : 'No active room assignments.'}</p><small>This import applies to the complete selected rate plan master.</small></div>}
    <div className="rateImportFilePicker">
      <span>Excel File</span>
      <label className="smallBtn" aria-disabled={busy || !hotelId || !masterId}>
        {selectedFile ? 'Replace Excel' : 'Choose Excel'}
        <input ref={fileInputRef} type="file" accept=".xlsx,.xlsm" hidden onChange={chooseFile} disabled={busy || !hotelId || !masterId} />
      </label>
      <b className="rateImportFileName">{selectedFile?.name ?? 'No file selected'}</b>
    </div>
    <p className="mutedText rateImportNote">The workbook is validated completely before anything saves. Agents assigned to this rate plan automatically receive these rates.</p>
    {!result && <div className="rowActions rateImportActions">
      <button className="smallBtn" type="button" onClick={() => void download()} disabled={!hotelId || !masterId || busy}>Download Rate Template</button>
      {onCancel && <button className="smallBtn" type="button" onClick={onCancel} disabled={busy}>Cancel</button>}
      <button className="btn" type="button" onClick={() => void importRates()} disabled={busy || !hotelId || !masterId || !selectedFile}>{busy ? 'Importing...' : 'Import Rates'}</button>
    </div>}
    {result && <section className={`rateImportResult ${result.errors.length ? 'hasErrors' : ''}`} role="status" aria-live="polite">
      <h3>{result.errors.length ? 'Import could not be completed' : 'Import completed'}</h3>
      <div className="rateImportResultGrid"><span>Received <b>{result.rowsReceived}</b></span><span>Valid <b>{result.rowsValid}</b></span><span>Imported <b>{result.rowsImported}</b></span><span>Updated <b>{result.rowsUpdated}</b></span><span>Invalid <b>{result.rowsInvalid}</b></span></div>
      {result.errors.length ? <><p>No rows were saved.</p><div className="rateImportErrors">{result.errors.map((item, index) => <div key={`${item.row}-${item.field}-${index}`}><b>Row {item.row}</b><span>{item.field}</span><small>{item.message}</small></div>)}</div></> : <p>Rates were saved for the selected rate plan.</p>}
      {onCancel && <div className="rowActions rateImportActions"><button className="btn" type="button" onClick={onCancel} disabled={busy}>{result.errors.length ? 'Close' : 'Done'}</button></div>}
    </section>}
  </div>;
}
