'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../../components/Shell';
import { apiFileBlob, apiRequest } from '../../../lib/api';
import { hasUsableDocumentFile } from '../../../lib/booking-pricing';
import {
  defaultMilestones,
  milestoneLabel,
  PaymentMilestoneEditor,
  toDraft,
  toPayload,
  validMilestones,
  type ApiMilestone,
  type MilestoneDraft,
} from '../../../components/PaymentMilestoneEditor';
import { CompactPaymentTermsEditor } from '../../../components/CompactPaymentTermsEditor';

type AgentDocumentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type Mapping = {
  active?: boolean;
  pricingMode?: 'BASE' | 'OVERRIDE';
  ratePlan: {
    id: string;
    name: string;
    code: string;
    mealPlan: string;
    master: { id: string; code: string; name: string; mealPlan: string; active: boolean };
    roomType: { name: string; hotel: { id: string; name: string; city: string } };
  };
};
type AgentDocument = {
  id: string;
  fileId?: string | null;
  documentType: string;
  status: AgentDocumentStatus;
  reviewRemark?: string | null;
  file?: { originalName: string; mimeType: string; size: number } | null;
};
type Agent = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  companyName?: string | null;
  agentPaymentPolicy?: string | null;
  bookingPaymentPercent?: number | string | null;
  paymentMilestones?: ApiMilestone[];
  agentDocuments?: AgentDocument[];
  assignedRatePlans?: Mapping[];
};
type AgentDetail = Agent & {
  contactPerson?: string | null;
  mobile?: string | null;
  gstin?: string | null;
  place?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  state?: string | null;
  pinCode?: string | null;
  additionalInformation?: string | null;
  agentDocuments: AgentDocument[];
};
type Plan = {
  id: string;
  code: string;
  name: string;
  mealPlan: string;
  active: boolean;
  master: { id: string; code: string; name: string; mealPlan: string; active: boolean };
  roomType: { name: string; hotel: { id: string; name: string; city: string } };
};

const blank = { name: '', email: '', password: '' };

function agentHasTerms(agent: Agent) {
  return Boolean(agent.paymentMilestones?.length || agent.agentPaymentPolicy || agent.bookingPaymentPercent != null);
}
function agentStatus(agent: Agent) {
  if (agent.active) return 'Active';
  if (agentHasTerms(agent)) return 'Deactivated';
  return agent.agentDocuments?.length ? 'Under Review' : 'KYC Pending';
}
function planLabel(plan: { code: string; name: string; roomType: { name: string } }) {
  return `${plan.code} - ${plan.name} - ${plan.roomType.name}`;
}
function pricingModeLabel(mode?: Mapping['pricingMode']) {
  return mode === 'OVERRIDE' ? 'Contract Rate' : 'Hotel Rate';
}
function agentEmail(email: string) {
  const at = email.indexOf('@');
  if (at <= 0) return <span className="agentEmail">{email}</span>;
  return <span className="agentEmail"><span>{email.slice(0, at)}</span><span className="agentEmailDomain">@{email.slice(at + 1)}</span></span>;
}
export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [form, setForm] = useState(blank);
  const [formMilestones, setFormMilestones] = useState<MilestoneDraft[]>(defaultMilestones());
  const [editing, setEditing] = useState<Agent | null>(null);
  const [review, setReview] = useState<AgentDetail | null>(null);
  const [reviewMilestones, setReviewMilestones] = useState<MilestoneDraft[]>(defaultMilestones());
  const [editingPaymentAgentId, setEditingPaymentAgentId] = useState<string | null>(null);
  const [termsMilestones, setTermsMilestones] = useState<MilestoneDraft[]>(defaultMilestones());
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState<Plan[]>([]);
  const [assignmentAgent, setAssignmentAgent] = useState<Agent | null>(null);
  const [selectedMasterId, setSelectedMasterId] = useState('');
  const [hotelFilter, setHotelFilter] = useState('');
  const [planSearch, setPlanSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    try {
      setAgents(await apiRequest<Agent[]>('/users/agents'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load agents');
    }
  }
  useEffect(() => { void load(); }, []);

  function create() {
    setEditing(null);
    setForm(blank);
    setFormMilestones(defaultMilestones());
    setOpen(true);
    setError('');
    setMessage('');
  }
  function edit(agent: Agent) {
    setEditing(agent);
    setForm({ name: agent.name, email: agent.email, password: '' });
    setOpen(true);
    setError('');
  }
  async function openReview(agent: Agent) {
    try {
      const loaded = await apiRequest<AgentDetail>(`/users/agents/${agent.id}`);
      setReview(loaded);
      setReviewMilestones(toDraft(loaded.paymentMilestones));
      setRemarks(Object.fromEntries(loaded.agentDocuments.map((doc) => [doc.id, doc.reviewRemark ?? ''])));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load agent details');
    }
  }
  function openTerms(agent: Agent) {
    setEditingPaymentAgentId(agent.id);
    setTermsMilestones(toDraft(agent.paymentMilestones));
    setError('');
    setMessage('');
  }
  function cancelTerms() {
    setEditingPaymentAgentId(null);
    setTermsMilestones(defaultMilestones());
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing) {
        await apiRequest(`/users/agents/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name: form.name }) });
        setMessage('Agent updated.');
      } else {
        await apiRequest('/users/agents', {
          method: 'POST',
          body: JSON.stringify({ name: form.name, email: form.email, password: form.password, paymentMilestones: toPayload(formMilestones) }),
        });
        setMessage('Agent created with payment milestones.');
      }
      setOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save agent');
    } finally {
      setBusy(false);
    }
  }
  async function saveTerms(active: boolean) {
    if (!review || !validMilestones(reviewMilestones)) {
      setError('Payment milestones must contain valid due points and total exactly 100%.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/users/agents/${review.id}/approval`, {
        method: 'PATCH',
        body: JSON.stringify({ active, paymentMilestones: toPayload(reviewMilestones) }),
      });
      setMessage(active && !review.active ? 'Agent access is active.' : 'Payment milestones saved.');
      setReview(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save payment milestones');
    } finally {
      setBusy(false);
    }
  }
  async function saveInlineTerms() {
    if (!editingPaymentAgentId || !validMilestones(termsMilestones)) {
      setError('Payment milestones must contain valid due points and total exactly 100%.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<{ milestones: ApiMilestone[] }>(`/users/agents/${editingPaymentAgentId}/payment-terms`, {
        method: 'PUT',
        body: JSON.stringify({ milestones: toPayload(termsMilestones) }),
      });
      setAgents((current) => current.map((agent) => agent.id === editingPaymentAgentId
        ? { ...agent, paymentMilestones: result.milestones, agentPaymentPolicy: null, bookingPaymentPercent: null }
        : agent));
      const savedAgent = agents.find((agent) => agent.id === editingPaymentAgentId);
      setEditingPaymentAgentId(null);
      setMessage(`Payment terms saved for ${savedAgent?.name ?? 'agent'}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save payment terms');
    } finally {
      setBusy(false);
    }
  }
  async function toggle(agent: Agent) {
    setBusy(true);
    try {
      await apiRequest(`/users/agents/${agent.id}/approval`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !agent.active, paymentMilestones: agent.paymentMilestones?.length ? toPayload(toDraft(agent.paymentMilestones)) : undefined }),
      });
      setMessage(agent.active ? 'Agent access deactivated.' : 'Agent access reactivated.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update agent access');
    } finally {
      setBusy(false);
    }
  }
  async function reviewDocument(document: AgentDocument, status: AgentDocumentStatus) {
    if (!review) return;
    setBusy(true);
    try {
      const updated = await apiRequest<AgentDocument>(`/users/agents/${review.id}/documents/${document.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reviewRemark: remarks[document.id] || undefined }),
      });
      setReview((current) => current ? { ...current, agentDocuments: current.agentDocuments.map((item) => item.id === updated.id ? updated : item) } : current);
      setMessage(`${document.documentType} marked ${status === 'APPROVED' ? 'verified' : status.toLowerCase()}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not review document');
    } finally {
      setBusy(false);
    }
  }
  async function viewDocument(document: AgentDocument) {
    if (!hasUsableDocumentFile(document.fileId)) return;
    try {
      const blob = await apiFileBlob(`/files/${document.fileId}`);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.file?.originalName || 'agent-document';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not download document');
    }
  }
  function openAssignments(agent: Agent) {
    setAssignmentAgent(agent);
    setSelectedMasterId('');
    setHotelFilter('');
    setPlanSearch('');
    setError('');
    void apiRequest<Plan[]>('/hotels/rate-plans')
      .then((items) => setPlans(items.filter((item) => item.active)))
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load rate plans'));
  }
  const hotels = useMemo(() => Array.from(new Map(plans.map((plan) => [plan.roomType.hotel.id, plan.roomType.hotel])).values()).sort((a, b) => a.name.localeCompare(b.name)), [plans]);
  const visiblePlans = useMemo(() => {
    const query = planSearch.trim().toLowerCase();
    return plans.filter((plan) => Boolean(hotelFilter) && plan.roomType.hotel.id === hotelFilter && (!query || `${plan.code} ${plan.name} ${plan.mealPlan} ${plan.roomType.name}`.toLowerCase().includes(query)));
  }, [hotelFilter, planSearch, plans]);
  const masterGroups = useMemo(() => {
    const groups = new Map<string, { master: Plan['master']; plans: Plan[] }>();
    for (const plan of visiblePlans) {
      const group = groups.get(plan.master.id) ?? { master: plan.master, plans: [] };
      group.plans.push(plan);
      groups.set(plan.master.id, group);
    }
    return [...groups.values()].sort((a, b) => `${a.master.code} ${a.master.name}`.localeCompare(`${b.master.code} ${b.master.name}`));
  }, [visiblePlans]);
  const assignedMasterGroups = useMemo(() => {
    const groups = new Map<string, { hotel: Mapping['ratePlan']['roomType']['hotel']; master: Mapping['ratePlan']['master']; items: Mapping[] }>();
    for (const mapping of (assignmentAgent?.assignedRatePlans ?? []).filter((item) => item.active !== false)) {
      const key = `${mapping.ratePlan.roomType.hotel.id}:${mapping.ratePlan.master.id}`;
      const group = groups.get(key) ?? { hotel: mapping.ratePlan.roomType.hotel, master: mapping.ratePlan.master, items: [] };
      group.items.push(mapping);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [assignmentAgent]);
  const hotelConflicts = useMemo(() => new Set(assignedMasterGroups.filter((group) => group.hotel.id === hotelFilter).map((group) => group.master.id)).size > 1, [assignedMasterGroups, hotelFilter]);
  useEffect(() => {
    if (!hotelFilter) return;
    const masters = new Set((assignmentAgent?.assignedRatePlans ?? []).filter((item) => item.active !== false && item.ratePlan.roomType.hotel.id === hotelFilter).map((item) => item.ratePlan.master.id));
    setSelectedMasterId(masters.size === 1 ? [...masters][0] : '');
  }, [assignmentAgent, hotelFilter]);
  async function saveAssignments() {
    if (!assignmentAgent || !hotelFilter || !selectedMasterId) return;
    setBusy(true);
    setError('');
    try {
      const saved = await apiRequest<Agent>(`/users/agents/${assignmentAgent.id}/hotel-rate-plan`, {
        method: 'PUT',
        body: JSON.stringify({ hotelId: hotelFilter, masterId: selectedMasterId }),
      });
      setAssignmentAgent(saved);
      setMessage(`Rate plans saved for ${assignmentAgent.name}. Existing contract-rate modes were preserved.`);
      setAgents((current) => current.map((item) => item.id === saved.id ? saved : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save rate-plan assignments');
    } finally {
      setBusy(false);
    }
  }
  async function removeAssignment(masterId: string, hotelName: string) {
    if (!assignmentAgent || !window.confirm(`Remove the commercial rate plan from ${hotelName}? Existing contract rates will be retained.`)) return;
    setBusy(true);
    try {
      const saved = await apiRequest<Agent>(`/users/agents/${assignmentAgent.id}/rate-plan-masters/${masterId}`, { method: 'DELETE' });
      setAssignmentAgent(saved);
      setAgents((current) => current.map((item) => item.id === saved.id ? saved : item));
      if (selectedMasterId === masterId) setSelectedMasterId('');
      setMessage(`Rate plan removed from ${hotelName}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove rate-plan assignment');
    } finally { setBusy(false); }
  }
  const kycReady = Boolean(review?.agentDocuments.length && review.agentDocuments.every((document) => document.status === 'APPROVED'));

  return <AdminLayout title="Agents">
    <section className="masterPanel">
      <div className="listToolbar"><div><span>Partner access</span><h2>Agents</h2><p>Review registrations, configure payment milestones, and assign existing hotel rate plans.</p></div><button className="btn" type="button" onClick={create}>+ Add Agent</button></div>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="notice" role="status">{message}</p>}
      {open && <form className="formCard masterForm" onSubmit={(event) => void submit(event)}><div className="rangeSectionHeader"><h2>{editing ? 'Edit agent' : 'Add agent'}</h2><button className="smallBtn" type="button" onClick={() => setOpen(false)}>Close</button></div><label>Agency / agent name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} disabled={Boolean(editing)} required /></label>{!editing && <><label>Password<input type="password" minLength={12} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label><PaymentMilestoneEditor value={formMilestones} onChange={setFormMilestones} /></>}<button className="btn" disabled={busy || (!editing && !validMilestones(formMilestones))}>{busy ? 'Saving...' : editing ? 'Save changes' : 'Create agent'}</button></form>}
      {review && <section className="panel"><div className="rangeSectionHeader"><div><span>{review.active ? 'Agent Details' : agentHasTerms(review) ? 'Deactivated Agent Details' : review.agentDocuments.length ? 'Agent Onboarding Review' : 'Agent Registration Review'}</span><h2>{review.companyName || review.name}</h2></div><button className="smallBtn" type="button" onClick={() => setReview(null)}>Close</button></div><div className="reviewGrid">{[['Contact person', review.contactPerson], ['Email', review.email], ['Mobile', review.mobile], ['GSTIN (Optional)', review.gstin], ['Place', review.place], ['Address line 1', review.addressLine1], ['Address line 2', review.addressLine2], ['State', review.state], ['PIN code', review.pinCode], ['Additional information', review.additionalInformation]].map(([label, value]) => <div key={String(label)}><span>{label}</span><b>{value || '-'}</b></div>)}</div><h3>KYC Documents</h3>{review.agentDocuments.length ? <div className="tableScroll"><table><thead><tr><th>Document Type</th><th>Filename</th><th>Status</th><th>Review Remark</th><th>Actions</th></tr></thead><tbody>{review.agentDocuments.map((document) => <tr key={document.id}><td>{document.documentType}</td><td>{document.file?.originalName || 'Unavailable'}</td><td><select value={document.status} onChange={(event) => void reviewDocument(document, event.target.value as AgentDocumentStatus)}><option value="PENDING">Pending</option><option value="APPROVED">Verified</option><option value="REJECTED">Rejected</option></select></td><td><input value={remarks[document.id] ?? ''} onChange={(event) => setRemarks((current) => ({ ...current, [document.id]: event.target.value }))} placeholder="Optional remark" /></td><td><div className="rowActions">{hasUsableDocumentFile(document.fileId) && <button className="smallBtn" type="button" disabled={busy} onClick={() => void viewDocument(document)}>View / Download</button>}<button className="smallBtn" type="button" disabled={busy} onClick={() => void reviewDocument(document, document.status)}>Save review</button></div></td></tr>)}</tbody></table></div> : <p className="mutedText">No documents uploaded. GST documents are optional.</p>}<PaymentMilestoneEditor value={reviewMilestones} onChange={setReviewMilestones} /><div className="rowActions">{!review.active && !agentHasTerms(review) && <button className="btn" type="button" disabled={busy || !kycReady || !validMilestones(reviewMilestones)} onClick={() => void saveTerms(true)}>Approve Agent</button>}{review.active && <button className="btn" type="button" disabled={busy || !validMilestones(reviewMilestones)} onClick={() => void saveTerms(true)}>Save Payment Milestones</button>}{!review.active && agentHasTerms(review) && <button className="btn" type="button" disabled={busy || !validMilestones(reviewMilestones)} onClick={() => void saveTerms(true)}>Reactivate Agent</button>}</div>{!review.active && !agentHasTerms(review) && (!kycReady || !validMilestones(reviewMilestones)) && <p className="mutedText">Verify all submitted KYC documents and save a 100% milestone schedule before approval.</p>}</section>}
      <section className="panel"><div className="tableScroll"><table><thead><tr><th>Agent</th><th>Email</th><th>Payment Terms</th><th>Rate Plans</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {agents.map((agent) => {
          const status = agentStatus(agent);
          const mappings = (agent.assignedRatePlans ?? []).filter((item) => item.active !== false);
          const grouped = Array.from(new Map(mappings.map((item) => {
            const hotel = item.ratePlan.roomType.hotel;
            return [`${hotel.id}:${item.ratePlan.master.id}`, { hotel, master: item.ratePlan.master, items: mappings.filter((candidate) => candidate.ratePlan.roomType.hotel.id === hotel.id && candidate.ratePlan.master.id === item.ratePlan.master.id) }];
          })).values());
          const hotelsWithConflicts = new Set(mappings.map((item) => item.ratePlan.roomType.hotel.id)).size !== grouped.length;
          const summary = grouped.length > 3
            ? [`${new Set(grouped.map((group) => group.hotel.id)).size} Hotels`]
            : grouped.flatMap((group) => group.items.length > 0
              ? [`${group.hotel.name} · ${group.master.code} - ${group.master.name} (${group.items.length} rooms)`]
              : []).concat(hotelsWithConflicts ? ['Multiple Plans ⚠'] : []);
          const isEditingTerms = editingPaymentAgentId === agent.id;
          return <tr key={agent.id}>
            <td><b>{agent.name}</b><small>{agent.companyName || ''}</small></td>
            <td className="agentEmailCell">{agentEmail(agent.email)}</td>
            <td className="agentPaymentTermsCell">{isEditingTerms ? <CompactPaymentTermsEditor value={termsMilestones} onChange={setTermsMilestones} onCancel={cancelTerms} onSave={() => void saveInlineTerms()} busy={busy} /> : <div className="agentPaymentTermsDisplay"><div className="agentMilestoneBadges agentPaymentMilestones">{agent.paymentMilestones?.length ? agent.paymentMilestones.map((item, index) => <span className="status" title={item.dueType === 'DAYS_BEFORE_CHECKIN' ? String(Number(item.daysBeforeCheckIn ?? 0)) + ' days before check-in' : 'Due when the booking is made'} key={item.dueType + '-' + String(item.daysBeforeCheckIn) + '-' + String(index)}>{milestoneLabel(item)}</span>) : <span>{agentHasTerms(agent) ? String(Number(agent.bookingPaymentPercent ?? 0)) + '% legacy' : 'Unassigned'}</span>}</div><button className="paymentTermsEditIcon" type="button" aria-label={'Edit payment terms for ' + agent.name} onClick={() => openTerms(agent)}>Edit</button></div>}</td>
            <td><div className="agentMilestoneBadges agentRatePlanSummary">{summary.map((item) => <span className="status" key={item}>{item}</span>)}{!summary.length && <span>Not assigned</span>}<button className="smallBtn" type="button" aria-label={'Edit rate plans for ' + agent.name} onClick={() => openAssignments(agent)}> - </button></div></td>
            <td><span className={'status ' + (status === 'Active' ? 'ok' : status === 'Under Review' || status === 'KYC Pending' ? 'warn' : 'muted')}>{status}</span></td>
            <td><div className="rowActions"><button className="smallBtn" type="button" onClick={() => void openReview(agent)}>{status === 'Under Review' || status === 'KYC Pending' ? 'Open / Review' : 'Open Details'}</button><button className="smallBtn" type="button" onClick={() => edit(agent)}>Edit</button>{status === 'Active' && <button className="smallBtn secondary" type="button" disabled={busy} onClick={() => void toggle(agent)}>Deactivate</button>}{status === 'Deactivated' && <button className="smallBtn secondary" type="button" disabled={busy} onClick={() => void toggle(agent)}>Reactivate</button>}</div></td>
          </tr>;
        })}
      </tbody></table></div></section>
    </section>
    {assignmentAgent && <div className="agentRateModalBackdrop"><section className="panel agentRateEditor agentRateModal" role="dialog" aria-modal="true" aria-label="Rate plan assignments"><div className="rangeSectionHeader"><div><span>Rate-plan access</span><h2>Rate Plan Assignments - {assignmentAgent.companyName || assignmentAgent.name}</h2></div><button className="smallBtn" type="button" onClick={() => setAssignmentAgent(null)}>Cancel</button></div><label>Hotel<select value={hotelFilter} onChange={(event) => setHotelFilter(event.target.value)}><option value="">Select a hotel</option>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name} - {hotel.city}</option>)}</select></label>{hotelFilter ? <><label>Search commercial plans<input value={planSearch} onChange={(event) => setPlanSearch(event.target.value)} placeholder="BAR, CP Breakfast or Deluxe Room" /></label><p className="mutedText">Choose exactly one commercial rate plan for this hotel. All of its active room plans will be available to the agent.</p>{hotelConflicts && <p className="error">This agent currently has more than one commercial plan for this hotel. Select one plan and save to resolve the conflict.</p>}<div className="mappingGrid">{masterGroups.map((group) => <label className={`mappingCard ${selectedMasterId === group.master.id ? 'selected' : ''}`} key={group.master.id}><input type="radio" name={`agent-hotel-master-${hotelFilter}`} value={group.master.id} checked={selectedMasterId === group.master.id} onChange={() => setSelectedMasterId(group.master.id)} /><b>{group.master.code} - {group.master.name}</b><small>{group.master.mealPlan} · Available for: {Array.from(new Set(group.plans.map((plan) => plan.roomType.name))).sort().join(', ')}</small></label>)}{!masterGroups.length && <p className="empty">No active commercial rate plans found for this hotel.</p>}</div></> : <p className="empty">Select a hotel to see its active commercial rate plans.</p>}<h3>Current assignments</h3><div className="currentAssignmentList">{assignedMasterGroups.map((group) => <div key={`${group.hotel.id}:${group.master.id}`}><b>{group.hotel.name} - {group.master.code} - {group.master.name}</b><p className="mutedText">Rooms: {group.items.length} · {Array.from(new Set(group.items.map((item) => item.ratePlan.roomType.name))).sort().join(', ')}</p><button className="smallBtn secondary" type="button" disabled={busy} onClick={() => void removeAssignment(group.master.id, group.hotel.name)}>Delete assignment</button></div>)}{!assignedMasterGroups.length && <p className="empty">No hotel rate-plan assignments.</p>}</div><div className="rowActions"><button className="btn" type="button" disabled={busy || !hotelFilter || !selectedMasterId || hotelConflicts} onClick={() => void saveAssignments()}>{busy ? 'Saving...' : 'Save assignment'}</button></div></section></div>}
    {assignmentAgent && <button className="agentRateModalFloatingSave smallBtn" type="button" disabled={busy || !hotelFilter || !selectedMasterId || hotelConflicts} onClick={() => void saveAssignments()}>{busy ? 'Saving...' : 'Save assignment'}</button>}
  </AdminLayout>;
}
