'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AdminLayout } from '../../../components/Shell';
import { AccessibleDialog } from '../../../components/ReactDialog';
import { API, apiRequest } from '../../../lib/api';

type Agent = { id: string; name: string; email: string };
type Hotel = { id: string; name: string; city?: string };
type Mapping = { id: string; hotelId: string; category: string; validFrom: string; validTo: string; active: boolean; hotel: Hotel };
type RatePreview = { hotel: { id: string; name?: string }; room: { code: string; name: string }; mealPlan: string; contractRate: number | string | null; extraAdultAmount: number | string | null; childWithBedAmount: number | string | null; childWithoutBedAmount: number | string | null; category: string; validFrom: string; validTo: string };
type MappingForm = { hotelId: string; category: string; validFrom: string; validTo: string; active: boolean };
type CategorySheet = { id: string; version: number; publishedAt: string; snapshotJson?: { contract?: { validFrom?: string; validTo?: string }; hotels?: Array<{ name?: string }> } };

const iso = (value: Date) => value.toISOString().slice(0, 10);
const fromDefault = iso(new Date());
const toDefault = iso(new Date(Date.now() + 30 * 86_400_000));
const queryAgentId = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('agentId') ?? '';
const errorMessage = (reason: unknown) => reason instanceof Error ? reason.message : 'The request could not be completed.';
const money = (value: number | string | null) => value == null ? '—' : `₹${Number(value).toLocaleString('en-IN')}`;

export default function AgentMappingsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [agentId, setAgentId] = useState(queryAgentId);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [form, setForm] = useState<MappingForm>({ hotelId: '', category: 'A', validFrom: fromDefault, validTo: toDefault, active: true });
  const [editing, setEditing] = useState<Mapping | null>(null);
  const [editForm, setEditForm] = useState<MappingForm | null>(null);
  const [rates, setRates] = useState<RatePreview[] | null>(null);
  const [categorySheets, setCategorySheets] = useState<CategorySheet[]>([]);
  const [categoryPreview, setCategoryPreview] = useState<{ html: string } | null>(null);
  const [sheetFrom, setSheetFrom] = useState(fromDefault);
  const [sheetTo, setSheetTo] = useState(toDefault);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([apiRequest<Agent[]>('/users/agents'), apiRequest<Hotel[]>('/hotels')]).then(([agentRows, hotelRows]) => {
      setAgents(agentRows); setHotels(hotelRows);
      const requested = queryAgentId && agentRows.some((agent) => agent.id === queryAgentId) ? queryAgentId : agentRows[0]?.id ?? '';
      setAgentId(requested);
      if (hotelRows[0]) setForm((current) => ({ ...current, hotelId: current.hotelId || hotelRows[0].id }));
    }).catch((reason) => setError(errorMessage(reason)));
  }, []);

  async function load() {
    if (!agentId) return;
    try { setMappings(await apiRequest<Mapping[]>(`/agents/${agentId}/rate-mappings`)); } catch (reason) { setError(errorMessage(reason)); }
  }
  async function loadCategorySheets() {
    if (!agentId) return;
    try { setCategorySheets(await apiRequest<CategorySheet[]>(`/agents/${agentId}/category-rate-sheet/sheets`)); } catch (reason) { setError(errorMessage(reason)); }
  }
  useEffect(() => { void load(); void loadCategorySheets(); }, [agentId]);

  function updateForm(field: keyof MappingForm, value: string | boolean) { setForm((current) => ({ ...current, [field]: value })); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!agentId || !form.hotelId) return; setBusy(true); setError(''); setMessage('');
    try { await apiRequest(`/agents/${agentId}/rate-mappings`, { method: 'POST', body: JSON.stringify(form) }); setMessage('Agent hotel category mapping saved.'); await load(); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }
  function openEdit(mapping: Mapping) { setEditing(mapping); setEditForm({ hotelId: mapping.hotelId, category: mapping.category, validFrom: mapping.validFrom.slice(0, 10), validTo: mapping.validTo.slice(0, 10), active: mapping.active }); }
  async function saveEdit(event: FormEvent) {
    event.preventDefault(); if (!editing || !editForm) return; setBusy(true); setError('');
    try { await apiRequest(`/agents/${agentId}/rate-mappings/${editing.id}`, { method: 'PATCH', body: JSON.stringify(editForm) }); setMessage('Agent hotel category mapping updated.'); setEditing(null); setEditForm(null); await load(); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }
  async function remove(mapping: Mapping) {
    if (!window.confirm('Remove this active category mapping?')) return; setBusy(true);
    try { await apiRequest(`/agents/${agentId}/rate-mappings/${mapping.id}`, { method: 'DELETE' }); setMessage('Mapping removed.'); await load(); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }
  async function viewRates(mapping: Mapping) {
    try { setRates(await apiRequest<RatePreview[]>(`/agents/${agentId}/rate-mappings/${mapping.id}/rates?from=${mapping.validFrom.slice(0, 10)}&to=${mapping.validTo.slice(0, 10)}`)); }
    catch (reason) { setError(errorMessage(reason)); }
  }
  async function previewCategorySheet() {
    if (!agentId) return; setBusy(true); setError('');
    try { setCategoryPreview(await apiRequest<{ html: string }>(`/agents/${agentId}/category-rate-sheet/preview?from=${sheetFrom}&to=${sheetTo}`)); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }
  async function publishCategorySheet() {
    if (!agentId || !window.confirm('Publish the current category rate-sheet snapshot? Published sheets are immutable.')) return; setBusy(true); setError('');
    try { await apiRequest(`/agents/${agentId}/category-rate-sheet/publish?from=${sheetFrom}&to=${sheetTo}`, { method: 'POST' }); await loadCategorySheets(); setMessage('Category rate-sheet snapshot published.'); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }

  return <AdminLayout title="Agent Category Mappings"><section className="pageSection">
    <header className="pageTitle"><div><span>Commercial access</span><h1>Agent → Hotel → Category</h1><p>Assign one internal commercial category for each agent and hotel period. Category labels are administrative only.</p></div></header>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
    <section className="panel"><div className="rangeToolbar"><label>Agent<select value={agentId} onChange={(event) => setAgentId(event.target.value)}><option value="">Select agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.email}</option>)}</select></label></div><form className="formGrid" onSubmit={(event) => void save(event)}><label>Hotel<select required value={form.hotelId} onChange={(event) => updateForm('hotelId', event.target.value)}><option value="">Select hotel</option>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}{hotel.city ? ` · ${hotel.city}` : ''}</option>)}</select></label><label>Category<select value={form.category} onChange={(event) => updateForm('category', event.target.value)}>{['A', 'B', 'C', 'D', 'E'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Valid from<input type="date" required value={form.validFrom} onChange={(event) => updateForm('validFrom', event.target.value)} /></label><label>Valid to<input type="date" required value={form.validTo} onChange={(event) => updateForm('validTo', event.target.value)} /></label><div className="rowActions"><button className="btn" disabled={busy || !agentId}>{busy ? 'Saving…' : 'Assign category'}</button></div></form></section>
    <section className="panel"><div className="rangeSectionHeader"><div><h2>Current mappings</h2><p className="mutedText">Overlapping active periods are rejected by the server.</p></div></div>{mappings.length ? <div className="tableScroll"><table className="dataTable"><thead><tr><th>Hotel</th><th>Category</th><th>Valid period</th><th>Status</th><th>Actions</th></tr></thead><tbody>{mappings.map((mapping) => <tr key={mapping.id}><td>{mapping.hotel.name}</td><td><strong>{mapping.category}</strong></td><td>{mapping.validFrom.slice(0, 10)} → {mapping.validTo.slice(0, 10)}</td><td>{mapping.active ? 'Active' : 'Inactive'}</td><td><div className="rowActions"><button className="smallBtn" type="button" onClick={() => void viewRates(mapping)}>View Rates</button><button className="smallBtn" type="button" onClick={() => openEdit(mapping)}>Edit</button><button className="smallBtn secondary" type="button" disabled={busy} onClick={() => void remove(mapping)}>Remove</button></div></td></tr>)}</tbody></table></div> : <p className="empty">No category mappings for this agent.</p>}</section>
    <section className="panel"><div className="rangeSectionHeader"><div><h2>Category rate sheet</h2><p className="mutedText">Preview, publish, and download the dated category contract. Internal A–E labels are not shown in the published sheet.</p></div></div><div className="rangeToolbar"><label>From date<input type="date" value={sheetFrom} onChange={(event) => setSheetFrom(event.target.value)} /></label><label>To date<input type="date" value={sheetTo} onChange={(event) => setSheetTo(event.target.value)} /></label></div><div className="rowActions"><button className="smallBtn" type="button" disabled={busy || !agentId} onClick={() => void previewCategorySheet()}>Preview category sheet</button><button className="smallBtn" type="button" disabled={busy || !agentId} onClick={() => void publishCategorySheet()}>Publish category sheet</button></div>{categorySheets.length > 0 && <div className="tableScroll"><table className="dataTable"><thead><tr><th>Version</th><th>Published</th><th>Validity</th><th>Hotels</th><th>Download</th></tr></thead><tbody>{categorySheets.map((sheet) => <tr key={sheet.id}><td>v{sheet.version}</td><td>{new Date(sheet.publishedAt).toLocaleString()}</td><td>{sheet.snapshotJson?.contract?.validFrom ?? '—'} → {sheet.snapshotJson?.contract?.validTo ?? '—'}</td><td>{sheet.snapshotJson?.hotels?.length ?? 0}</td><td><a className="smallBtn" href={`${API}/agents/${agentId}/category-rate-sheet/sheets/${sheet.id}.html`} target="_blank" rel="noreferrer">Download HTML</a></td></tr>)}</tbody></table></div>}{categoryPreview && <div className="rateSheetPreview"><h3>Preview</h3><iframe title="Category rate sheet preview" sandbox="" srcDoc={categoryPreview.html} style={{ width: '100%', minHeight: 640, border: '1px solid #c5dce2', background: 'white' }} /></div>}</section>
    {rates && <section className="panel"><div className="rangeSectionHeader"><div><h2>Mapped rate preview</h2><p className="mutedText">Dated contract rates and guest supplements resolved from the selected hotel category.</p></div><button className="smallBtn" type="button" onClick={() => setRates(null)}>Close</button></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>Hotel</th><th>Room</th><th>Meal plan</th><th>Category</th><th>Valid from</th><th>Valid to</th><th>Contract rate</th><th>Extra adult</th><th>Child with bed</th><th>Child without bed</th></tr></thead><tbody>{rates.map((rate, index) => <tr key={`${rate.room.code}-${rate.mealPlan}-${rate.validFrom}-${index}`}><td>{rate.hotel.name ?? 'Selected hotel'}</td><td>{rate.room.name} <span className="mutedText">({rate.room.code})</span></td><td>{rate.mealPlan}</td><td><span className="statusPill">{rate.category}</span></td><td>{rate.validFrom.slice(0, 10)}</td><td>{rate.validTo.slice(0, 10)}</td><td>{money(rate.contractRate)}</td><td>{money(rate.extraAdultAmount)}</td><td>{money(rate.childWithBedAmount)}</td><td>{money(rate.childWithoutBedAmount)}</td></tr>)}</tbody></table></div></section>}
    {editing && editForm && <AccessibleDialog title="Edit Agent Hotel Mapping" eyebrow="Agent Category Mapping" onClose={() => { setEditing(null); setEditForm(null); }}><form className="formGrid" onSubmit={(event) => void saveEdit(event)}><label>Hotel<select required value={editForm.hotelId} onChange={(event) => setEditForm({ ...editForm, hotelId: event.target.value })}>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label><label>Category<select value={editForm.category} onChange={(event) => setEditForm({ ...editForm, category: event.target.value })}>{['A', 'B', 'C', 'D', 'E'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Valid from<input type="date" required value={editForm.validFrom} onChange={(event) => setEditForm({ ...editForm, validFrom: event.target.value })} /></label><label>Valid to<input type="date" required value={editForm.validTo} onChange={(event) => setEditForm({ ...editForm, validTo: event.target.value })} /></label><label className="checkLabel"><input type="checkbox" checked={editForm.active} onChange={(event) => setEditForm({ ...editForm, active: event.target.checked })} /> Active</label><div className="dialogActions"><button className="smallBtn secondary" type="button" onClick={() => { setEditing(null); setEditForm(null); }}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save mapping'}</button></div></form></AccessibleDialog>}
  </section></AdminLayout>;
}
