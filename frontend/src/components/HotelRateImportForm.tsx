'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { apiFileBlob, apiRequest } from '../lib/api';
import { RainwoodDatePicker } from './RainwoodDatePicker';

type Scope = 'HOTEL' | 'COMMON';
type Hotel = { id: string; name: string; code: string };

type ImportResult = {
  rowsReceived: number;
  rowsValid: number;
  rowsInvalid: number;
  rowsImported: number;
  rowsUpdated: number;
  affectedRooms?: number;
  commonRoomTypes?: number;
  errors: { row: number; field: string; message: string }[];
};

const DEFAULT_FROM = '2030-01-01';
const DEFAULT_TO = '2030-01-30';

type HotelRateImportFormProps = {
  initialHotelId?: string;
  initialFrom?: string;
  initialTo?: string;
  lockContext?: boolean;
  fixedScope?: Scope;
  roomTypeId?: string;
  roomTypeLabel?: string;
  onImportSuccess?: () => void;
};

export function HotelRateImportForm({ initialHotelId = '', initialFrom = DEFAULT_FROM, initialTo = DEFAULT_TO, lockContext = false, fixedScope, roomTypeId, roomTypeLabel, onImportSuccess }: HotelRateImportFormProps) {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState(initialHotelId);
  const [scope, setScope] = useState<Scope>(fixedScope ?? 'HOTEL');
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiRequest<Hotel[]>('/hotels').then((items) => {
      setHotels(items);
      if (initialHotelId && items.some((item) => item.id === initialHotelId)) setHotelId(initialHotelId);
      else if (!initialHotelId && items[0]) setHotelId(items[0].id);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load hotels'));
  }, [initialHotelId]);

  function reset() {
    setFile(null);
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function changeScope(next: Scope) {
    setScope(next);
    reset();
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setResult(null);
    setError('');
  }

  function queryString() {
    const params = new URLSearchParams({ scope, from, to });
    if (roomTypeId) params.set('roomTypeId', roomTypeId);
    return params.toString();
  }

  async function downloadTemplate() {
    if (!hotelId || !from || !to || busy) return;
    try {
      const blob = await apiFileBlob(`/hotels/${hotelId}/rates/import-template.xlsx?${queryString()}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = scope === 'HOTEL' ? 'rainwood-hotel-rate-master-sample.xlsx' : 'rainwood-common-room-rate-sample.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not download sample workbook');
    }
  }

  async function importRates() {
    if (!hotelId || !file || busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const imported = await apiRequest<ImportResult>(`/hotels/${hotelId}/rates/import?${queryString()}`, { method: 'POST', body: form });
      setResult(imported);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imported.errors.length) setError('Import could not be completed. No rates were saved.');
      else onImportSuccess?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not import rates');
    } finally {
      setBusy(false);
    }
  }

  const selectedHotel = hotels.find((hotel) => hotel.id === hotelId);
  const isValidRange = Boolean(from && to && from <= to);

  return <div className="rateImportForm hotelRateImportForm" data-testid="hotel-rate-import-form">
    {error && <p className="error rateImportError" role="alert">{error}</p>}
    {!fixedScope && <div className="rateImportScope" role="group" aria-label="Rate import scope">
      <button type="button" className={scope === 'HOTEL' ? 'active' : ''} onClick={() => changeScope('HOTEL')} disabled={busy}>Hotel room types</button>
      <button type="button" className={scope === 'COMMON' ? 'active' : ''} onClick={() => changeScope('COMMON')} disabled={busy}>Common room types</button>
    </div>}
    <p className="mutedText rateImportNote">{scope === 'HOTEL' ? (roomTypeId ? 'Import rates for every assigned rate plan in this room type.' : 'Import rates for every active room type and assigned rate plan in the selected hotel.') : 'Map this hotel’s room types to common room types, then apply one rate set to every room mapped to the same common type.'}</p>
    {lockContext ? <div className="rateImportContext">
      <div className="rateImportLockedField"><span>Hotel</span><b>{selectedHotel ? `${selectedHotel.name} (${selectedHotel.code})` : 'Select a hotel in Rate Master'}</b></div>
      {roomTypeLabel && <div className="rateImportLockedField"><span>Room type</span><b>{roomTypeLabel}</b></div>}
      <div className="rateImportLockedField"><span>Import date range</span><b>{from || '—'} → {to || '—'}</b></div>
    </div> : <>
      <div className="rateImportContext">
        <label>Hotel<select aria-label="Hotel" value={hotelId} onChange={(event) => { setHotelId(event.target.value); reset(); }} disabled={busy}><option value="">Select hotel</option>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name} ({hotel.code})</option>)}</select></label>
        <div className="rateImportLockedField"><span>Import scope</span><b>{scope === 'HOTEL' ? 'Hotel room types' : 'Common room types'}</b></div>
      </div>
      <div className="rateImportContext">
        <label>From<RainwoodDatePicker label="From date" value={from} onChange={(value) => { setFrom(value); reset(); }} /></label>
        <label>To<RainwoodDatePicker label="To date" value={to} minDate={from} onChange={(value) => { setTo(value); reset(); }} /></label>
      </div>
    </>}
    {!isValidRange && <p className="error" role="alert">Select a valid date range.</p>}
    {selectedHotel && <div className="rateImportAssignedRooms"><span>Workbook target</span><p>{selectedHotel.name} ({selectedHotel.code})</p><small>{scope === 'HOTEL' ? 'The sample workbook contains stable room-type and rate-plan IDs for this hotel.' : 'The common-room workbook contains a mapping sheet for this hotel and a shared rate sheet.'}</small></div>}
    <div className="rateImportFilePicker">
      <span>Excel File</span>
      <label className="smallBtn" aria-disabled={busy || !hotelId || !isValidRange}>{file ? 'Replace Excel' : 'Choose Excel'}<input ref={fileInputRef} type="file" accept=".xlsx,.xlsm" hidden onChange={chooseFile} disabled={busy || !hotelId || !isValidRange} /></label>
      <b className="rateImportFileName">{file?.name ?? 'No file selected'}</b>
    </div>
    {!result && <div className="rowActions rateImportActions">
      <button className="smallBtn" type="button" onClick={() => void downloadTemplate()} disabled={busy || !hotelId || !isValidRange}>Download Sample Excel</button>
      <button className="btn" type="button" onClick={() => void importRates()} disabled={busy || !hotelId || !isValidRange || !file}>{busy ? 'Importing...' : 'Import Rates'}</button>
    </div>}
    {result && <section className={`rateImportResult ${result.errors.length ? 'hasErrors' : ''}`} role="status" aria-live="polite">
      <h3>{result.errors.length ? 'Import could not be completed' : 'Import completed'}</h3>
      <div className="rateImportResultGrid"><span>Received <b>{result.rowsReceived}</b></span><span>Imported <b>{result.rowsImported}</b></span><span>Updated <b>{result.rowsUpdated}</b></span><span>Invalid <b>{result.rowsInvalid}</b></span><span>Rooms <b>{result.affectedRooms ?? 0}</b></span></div>
      {result.errors.length ? <><p>No rows were saved.</p><div className="rateImportErrors">{result.errors.map((item, index) => <div key={`${item.row}-${item.field}-${index}`}><b>{item.row ? `Row ${item.row}` : 'Workbook'}</b><span>{item.field}</span><small>{item.message}</small></div>)}</div></> : <p>Rates were saved for {scope === 'HOTEL' ? 'the selected hotel.' : 'the mapped common room types.'}</p>}
      <div className="rowActions rateImportActions"><button className="btn" type="button" onClick={reset}>Start another import</button></div>
    </section>}
  </div>;
}
