'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../../components/Shell';
import { API, apiRequest } from '../../../lib/api';

type Slab = {
  id: string; code: string; name: string; description?: string | null;
  validFrom: string; validTo: string; version: number; status: 'DRAFT' | 'PUBLISHED' | 'RETIRED'; active: boolean;
  agentCount?: number; rateCount?: number;
};
type Agent = { id: string; name: string; email: string; active: boolean };
type RatePlan = { id: string; code: string; name: string; mealPlan: string; active: boolean; master?: { code: string; name: string; mealPlan: string; kind?: string }; roomType?: { id: string; name: string; hotel?: { name: string } } };
type SlabRate = { id?: string; ratePlanId: string; validFrom: string; validTo: string; amount: number; extraAdultAmount: number; extraChildWithBedAmount: number; childWithoutBedAmount: number; occupancyPrices?: Record<string, number> | null; active?: boolean; ratePlan?: RatePlan };
type Assignment = { id: string; agentId: string; slabId: string; validFrom: string; validTo: string; active: boolean; agent?: Agent };
type SlabDetail = Slab & { rates: SlabRate[]; assignments: Assignment[] };
type Sheet = { id: string; version: number; publishedAt: string; snapshotJson: { slab?: { code: string; name: string; version: number }; hotels?: Array<{ name: string; rooms?: unknown[] }> } };

const mealPlans = ['EP', 'CP', 'MAP', 'AP'];
const today = new Date().toISOString().slice(0, 10);
const nextYear = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
const emptySlab = { code: '', name: '', description: '', validFrom: today, validTo: nextYear };
const emptyRate = { ratePlanId: '', validFrom: today, validTo: nextYear, amount: 0, extraAdultAmount: 0, extraChildWithBedAmount: 0, childWithoutBedAmount: 0 };

function dateOnly(value: string) { return value?.slice(0, 10) ?? ''; }
function mealLabel(value?: string) { return mealPlans.includes(value ?? '') ? value : 'Legacy'; }
function errorMessage(reason: unknown) { return reason instanceof Error ? reason.message : 'The request could not be completed.'; }

export default function AgentRateSlabsPage() {
  const [slabs, setSlabs] = useState<Slab[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [plans, setPlans] = useState<RatePlan[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<SlabDetail | null>(null);
  const [form, setForm] = useState(emptySlab);
  const [rate, setRate] = useState(emptyRate);
  const [assignment, setAssignment] = useState({ agentId: '', validFrom: today, validTo: nextYear });
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadSlabs() {
    setSlabs(await apiRequest<Slab[]>('/agent-rate-slabs'));
  }
  async function loadDetail(id: string) {
    if (!id) { setDetail(null); return; }
    const loaded = await apiRequest<SlabDetail>(`/agent-rate-slabs/${id}`);
    setDetail(loaded);
    setForm({ code: loaded.code, name: loaded.name, description: loaded.description ?? '', validFrom: dateOnly(loaded.validFrom), validTo: dateOnly(loaded.validTo) });
    setSheets([]); setPreview(null);
  }

  useEffect(() => {
    void (async () => {
      try {
        const [loadedSlabs, loadedAgents, loadedPlans] = await Promise.all([
          apiRequest<Slab[]>('/agent-rate-slabs'),
          apiRequest<Agent[]>('/users/agents'),
          apiRequest<RatePlan[]>('/hotels/rate-plans'),
        ]);
        setSlabs(loadedSlabs); setAgents(loadedAgents); setPlans(loadedPlans);
        if (loadedSlabs[0]) { setSelectedId(loadedSlabs[0].id); await loadDetail(loadedSlabs[0].id); }
      } catch (reason) { setError(errorMessage(reason)); }
      finally { setLoading(false); }
    })();
  }, []);

  const canonicalPlans = useMemo(() => plans.filter((plan) => plan.master?.kind === 'CANONICAL_MEAL'), [plans]);
  const activeAssignment = detail?.assignments.find((item) => item.active);

  function selectSlab(id: string) { setSelectedId(id); setError(''); void loadDetail(id).catch((reason) => setError(errorMessage(reason))); }
  function startNew() { setSelectedId(''); setDetail(null); setForm(emptySlab); setRate(emptyRate); setError(''); setMessage('Draft form ready.'); }
  function editRate(item: SlabRate) { setRate({ ratePlanId: item.ratePlanId, validFrom: dateOnly(item.validFrom), validTo: dateOnly(item.validTo), amount: Number(item.amount), extraAdultAmount: Number(item.extraAdultAmount ?? 0), extraChildWithBedAmount: Number(item.extraChildWithBedAmount ?? 0), childWithoutBedAmount: Number(item.childWithoutBedAmount ?? 0) }); }

  async function saveSlab(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = { ...form, code: form.code.trim(), name: form.name.trim(), description: form.description.trim() || undefined };
      const saved = detail ? await apiRequest<Slab>(`/agent-rate-slabs/${detail.id}`, { method: 'PATCH', body: JSON.stringify(body) }) : await apiRequest<Slab>('/agent-rate-slabs', { method: 'POST', body: JSON.stringify(body) });
      await loadSlabs(); setSelectedId(saved.id); await loadDetail(saved.id); setMessage(detail ? 'Draft slab updated.' : 'Draft slab created.');
    } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }

  async function saveRate(event: FormEvent) {
    event.preventDefault(); if (!detail) { setError('Create a draft slab first.'); return; }
    const next = [...(detail.rates ?? []).filter((item) => item.ratePlanId !== rate.ratePlanId || dateOnly(item.validFrom) !== rate.validFrom).map((item) => ({ ratePlanId: item.ratePlanId, validFrom: dateOnly(item.validFrom), validTo: dateOnly(item.validTo), amount: Number(item.amount), extraAdultAmount: Number(item.extraAdultAmount ?? 0), extraChildWithBedAmount: Number(item.extraChildWithBedAmount ?? 0), childWithoutBedAmount: Number(item.childWithoutBedAmount ?? 0), occupancyPrices: item.occupancyPrices ?? null, active: item.active ?? true })), { ...rate, active: true }];
    setBusy(true); setError('');
    try { await apiRequest(`/agent-rate-slabs/${detail.id}/rates`, { method: 'PUT', body: JSON.stringify({ rates: next }) }); await loadDetail(detail.id); setMessage('Slab rate saved.'); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }

  async function publishSlab() {
    if (!detail) return; setBusy(true); setError('');
    try { await apiRequest(`/agent-rate-slabs/${detail.id}/publish`, { method: 'POST' }); await loadSlabs(); await loadDetail(detail.id); setMessage('Slab published and now immutable.'); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }

  async function cloneSlab() {
    if (!detail) return; setBusy(true); setError('');
    try { const copy = await apiRequest<Slab>(`/agent-rate-slabs/${detail.id}/clone`, { method: 'POST' }); await loadSlabs(); setSelectedId(copy.id); await loadDetail(copy.id); setMessage('New draft version created.'); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }

  async function assignSlab(event: FormEvent) {
    event.preventDefault(); if (!detail || !assignment.agentId) return; setBusy(true); setError('');
    try { await apiRequest(`/agents/${assignment.agentId}/rate-slab`, { method: 'POST', body: JSON.stringify({ slabId: detail.id, validFrom: assignment.validFrom, validTo: assignment.validTo }) }); await loadDetail(detail.id); setMessage('Slab assigned to the agent.'); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }

  async function showPreview(agentId: string) {
    if (!detail) return; setBusy(true); setError('');
    try { setPreview(await apiRequest(`/agent-rate-slabs/${detail.id}/agents/${agentId}/preview`)); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }

  async function publishSheet(agentId: string) {
    if (!detail) return; setBusy(true); setError('');
    try { await apiRequest(`/agent-rate-slabs/${detail.id}/agents/${agentId}/publish-sheet`, { method: 'POST' }); setSheets(await apiRequest<Sheet[]>(`/agent-rate-slabs/${detail.id}/agents/${agentId}/sheets`)); setMessage('Immutable rate sheet snapshot published.'); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }

  return <AdminLayout title="Agent Rate Slabs"><section className="masterPanel">
    <div className="listToolbar"><div><span>Revenue management</span><h2>Agent Rate Slabs</h2><p>Publish dated EP, CP, MAP and AP contract rates without changing the public rate-plan engine.</p></div><button className="btn" type="button" onClick={startNew}>+ New slab</button></div>
    {message && <p className="success" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
    {loading ? <p className="loading" role="status">Loading slabs, agents and meal plans...</p> : <>
      <section className="panel"><h3>Published and draft versions</h3><div className="tableScroll"><table><thead><tr><th>Code</th><th>Slab</th><th>Validity</th><th>Status</th><th>Rates</th><th>Agents</th></tr></thead><tbody>{slabs.map((item) => <tr key={item.id} onClick={() => selectSlab(item.id)} style={{ cursor: 'pointer', background: item.id === selectedId ? '#effbfb' : undefined }}><td><b>{item.code}</b><small>Version {item.version}</small></td><td>{item.name}<small>{item.description}</small></td><td>{dateOnly(item.validFrom)} – {dateOnly(item.validTo)}</td><td><span className={`status ${item.status === 'PUBLISHED' ? 'ok' : ''}`}>{item.status}</span></td><td>{item.rateCount ?? 0}</td><td>{item.agentCount ?? 0}</td></tr>)}{!slabs.length && <tr><td colSpan={6}>No slabs yet. Create the first dated agent contract.</td></tr>}</tbody></table></div></section>
      <form className="panel masterForm" onSubmit={saveSlab}><h3>{detail ? `Slab details · ${detail.code}` : 'Create a canonical agent slab'}</h3><div className="formGrid"><label>Code<input required value={form.code} disabled={detail?.status === 'PUBLISHED'} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="PARTNER-2026" /></label><label>Name<input required value={form.name} disabled={detail?.status === 'PUBLISHED'} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Partner Contract 2026" /></label><label>Valid from<input type="date" required value={form.validFrom} disabled={detail?.status === 'PUBLISHED'} onChange={(event) => setForm({ ...form, validFrom: event.target.value })} /></label><label>Valid to<input type="date" required value={form.validTo} disabled={detail?.status === 'PUBLISHED'} onChange={(event) => setForm({ ...form, validTo: event.target.value })} /></label><label className="formFull">Description<textarea value={form.description} disabled={detail?.status === 'PUBLISHED'} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Dated contract for partner distribution" /></label></div><div className="rowActions"><button className="btn" disabled={busy || detail?.status === 'PUBLISHED'}>{busy ? 'Saving...' : 'Save draft'}</button>{detail?.status === 'DRAFT' && <button className="btn secondary" type="button" disabled={busy || !detail.rates.length} onClick={() => void publishSlab()}>Publish slab</button>}{detail?.status === 'PUBLISHED' && <button className="btn secondary" type="button" disabled={busy} onClick={() => void cloneSlab()}>Clone new version</button>}</div></form>
      {detail && <>
        <section className="panel"><div className="listToolbar"><div><h3>Canonical meal-plan rate matrix</h3><p>Each row is one room/rate-plan/date band. Child pricing distinguishes bed and no-bed amounts.</p></div><div className="mealPlanLegend">{mealPlans.map((item) => <span className="status" key={item}>{item}</span>)}</div></div><form className="formGrid" onSubmit={saveRate}><label>Meal plan rate plan<select required value={rate.ratePlanId} disabled={detail.status === 'PUBLISHED'} onChange={(event) => setRate({ ...rate, ratePlanId: event.target.value })}><option value="">Select a canonical meal plan</option>{canonicalPlans.map((plan) => <option key={plan.id} value={plan.id}>{mealLabel(plan.mealPlan)} · {plan.roomType?.name ?? plan.name} · {plan.roomType?.hotel?.name ?? 'Hotel'}</option>)}</select></label><label>Base amount<input type="number" min="0" step="0.01" required value={rate.amount} disabled={detail.status === 'PUBLISHED'} onChange={(event) => setRate({ ...rate, amount: Number(event.target.value) })} /></label><label>Extra adult<input type="number" min="0" step="0.01" value={rate.extraAdultAmount} disabled={detail.status === 'PUBLISHED'} onChange={(event) => setRate({ ...rate, extraAdultAmount: Number(event.target.value) })} /></label><label>Child with bed<input type="number" min="0" step="0.01" value={rate.extraChildWithBedAmount} disabled={detail.status === 'PUBLISHED'} onChange={(event) => setRate({ ...rate, extraChildWithBedAmount: Number(event.target.value) })} /></label><label>Child without bed<input type="number" min="0" step="0.01" value={rate.childWithoutBedAmount} disabled={detail.status === 'PUBLISHED'} onChange={(event) => setRate({ ...rate, childWithoutBedAmount: Number(event.target.value) })} /></label><label>Rate from<input type="date" required value={rate.validFrom} disabled={detail.status === 'PUBLISHED'} onChange={(event) => setRate({ ...rate, validFrom: event.target.value })} /></label><label>Rate to<input type="date" required value={rate.validTo} disabled={detail.status === 'PUBLISHED'} onChange={(event) => setRate({ ...rate, validTo: event.target.value })} /></label><div className="rowActions formFull"><button className="btn" disabled={busy || detail.status === 'PUBLISHED'}>{busy ? 'Saving...' : 'Add / replace rate row'}</button></div></form><div className="tableScroll"><table><thead><tr><th>Meal</th><th>Hotel / room</th><th>Dates</th><th>Base</th><th>Adult</th><th>Child bed</th><th>Child no bed</th><th></th></tr></thead><tbody>{detail.rates.map((item) => <tr key={item.id ?? `${item.ratePlanId}-${item.validFrom}`}><td><b>{mealLabel(item.ratePlan?.mealPlan)}</b></td><td>{item.ratePlan?.roomType?.hotel?.name ?? 'Hotel'}<small>{item.ratePlan?.roomType?.name ?? item.ratePlan?.name}</small></td><td>{dateOnly(item.validFrom)} – {dateOnly(item.validTo)}</td><td>INR {Number(item.amount).toFixed(2)}</td><td>INR {Number(item.extraAdultAmount ?? 0).toFixed(2)}</td><td>INR {Number(item.extraChildWithBedAmount ?? 0).toFixed(2)}</td><td>INR {Number(item.childWithoutBedAmount ?? 0).toFixed(2)}</td><td><button className="smallBtn" type="button" disabled={detail.status === 'PUBLISHED'} onClick={() => editRate(item)}>Edit</button></td></tr>)}{!detail.rates.length && <tr><td colSpan={8}>No rates added. Add at least one canonical meal-plan row before publishing.</td></tr>}</tbody></table></div></section>
        <section className="panel"><h3>Agent assignment and rate sheet</h3><form className="formGrid" onSubmit={assignSlab}><label>Agent<select required value={assignment.agentId} disabled={detail.status !== 'PUBLISHED'} onChange={(event) => setAssignment({ ...assignment, agentId: event.target.value })}><option value="">Select an agent</option>{agents.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}</select></label><label>Assignment from<input type="date" required disabled={detail.status !== 'PUBLISHED'} value={assignment.validFrom} onChange={(event) => setAssignment({ ...assignment, validFrom: event.target.value })} /></label><label>Assignment to<input type="date" required disabled={detail.status !== 'PUBLISHED'} value={assignment.validTo} onChange={(event) => setAssignment({ ...assignment, validTo: event.target.value })} /></label><div className="rowActions"><button className="btn" disabled={busy || detail.status !== 'PUBLISHED'}>Assign published slab</button></div></form><div className="tableScroll"><table><thead><tr><th>Agent</th><th>Assigned dates</th><th>Status</th><th>Actions</th></tr></thead><tbody>{detail.assignments.map((item) => <tr key={item.id}><td>{item.agent?.name ?? item.agentId}<small>{item.agent?.email}</small></td><td>{dateOnly(item.validFrom)} – {dateOnly(item.validTo)}</td><td>{item.active ? 'Active' : 'Removed'}</td><td><button className="smallBtn" type="button" disabled={busy} onClick={() => void showPreview(item.agentId)}>Preview</button> <button className="smallBtn" type="button" disabled={busy} onClick={() => void publishSheet(item.agentId)}>Publish sheet</button></td></tr>)}{!detail.assignments.length && <tr><td colSpan={4}>Publish the slab, then assign it to an active agent.</td></tr>}</tbody></table></div></section>
        {preview && <section className="panel"><h3>Rate sheet preview</h3><p><b>{preview.snapshot?.agent?.name}</b> · {preview.snapshot?.slab?.name} · version {preview.snapshot?.slab?.version}</p>{preview.unassignedPreview && <p className="notice">UNASSIGNED PREVIEW — assign the published slab before publishing a contract sheet.</p>}<iframe title="Rendered agent rate sheet" sandbox="" srcDoc={preview.html} style={{ width: '100%', minHeight: 720, border: '1px solid #c5dce2', background: 'white' }} /></section>}
        {sheets.length > 0 && preview?.snapshot?.agent?.id && detail && <section className="panel"><h3>Published sheet history</h3><ul>{sheets.map((sheet) => <li key={sheet.id}>Version {sheet.version} · {new Date(sheet.publishedAt).toLocaleString()} <a className="smallBtn" target="_blank" rel="noreferrer" href={`${API}/agent-rate-slabs/${detail.id}/agents/${preview.snapshot.agent.id}/sheets/${sheet.id}.html`}>Download HTML</a></li>)}</ul></section>}
      </>}
    </>}
  </section></AdminLayout>;
}
