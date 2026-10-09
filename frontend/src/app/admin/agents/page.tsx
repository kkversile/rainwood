'use client';

import { FormEvent, useEffect, useState } from 'react';
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
type CategoryMapping = { id: string; hotelId: string; category: string; validFrom: string; validTo: string; active: boolean; hotel: { id: string; name: string; city?: string } };
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
  categoryMappings?: CategoryMapping[];
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

const blank = { name: '', email: '', password: '' };

function agentHasTerms(agent: Agent) {
  return Boolean(agent.paymentMilestones?.length || agent.agentPaymentPolicy || agent.bookingPaymentPercent != null);
}
function agentStatus(agent: Agent) {
  if (agent.active) return 'Active';
  if (agentHasTerms(agent)) return 'Deactivated';
  return agent.agentDocuments?.length ? 'Under Review' : 'KYC Pending';
}
function activeCategoryMappingCount(mappings: CategoryMapping[] | undefined) {
  const today = new Date().toISOString().slice(0, 10);
  return (mappings ?? []).filter((mapping) => mapping.active && mapping.validFrom.slice(0, 10) <= today && mapping.validTo.slice(0, 10) >= today).length;
}
function planLabel(plan: { code: string; name: string; roomType: { name: string } }) {
  return `${plan.code} - ${plan.name} - ${plan.roomType.name}`;
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
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    try {
      const base = await apiRequest<(Agent & { agentHotelRateCategoryAssignments?: CategoryMapping[] })[]>('/users/agents');
      setAgents(base.map((agent) => ({ ...agent, categoryMappings: agent.agentHotelRateCategoryAssignments ?? [] })));
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
  const kycReady = Boolean(review?.agentDocuments.length && review.agentDocuments.every((document) => document.status === 'APPROVED'));

  return <AdminLayout title="Agents">
    <section className="masterPanel">
      <div className="listToolbar"><div><span>Partner access</span><h2>Agents</h2><p>Review registrations, configure payment milestones, and assign agent → hotel → category access.</p></div><div className="rowActions"><a className="smallBtn" href="/rainwood/admin/agent-mappings">Manage category mappings</a><button className="btn" type="button" onClick={create}>+ Add Agent</button></div></div>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="notice" role="status">{message}</p>}
      {open && <form className="formCard masterForm" onSubmit={(event) => void submit(event)}><div className="rangeSectionHeader"><h2>{editing ? 'Edit agent' : 'Add agent'}</h2><button className="smallBtn" type="button" onClick={() => setOpen(false)}>Close</button></div><label>Agency / agent name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} disabled={Boolean(editing)} required /></label>{!editing && <><label>Password<input type="password" minLength={12} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label><PaymentMilestoneEditor value={formMilestones} onChange={setFormMilestones} /></>}<button className="btn" disabled={busy || (!editing && !validMilestones(formMilestones))}>{busy ? 'Saving...' : editing ? 'Save changes' : 'Create agent'}</button></form>}
      {review && <section className="panel"><div className="rangeSectionHeader"><div><span>{review.active ? 'Agent Details' : agentHasTerms(review) ? 'Deactivated Agent Details' : review.agentDocuments.length ? 'Agent Onboarding Review' : 'Agent Registration Review'}</span><h2>{review.companyName || review.name}</h2></div><button className="smallBtn" type="button" onClick={() => setReview(null)}>Close</button></div><div className="reviewGrid">{[['Contact person', review.contactPerson], ['Email', review.email], ['Mobile', review.mobile], ['GSTIN (Optional)', review.gstin], ['Place', review.place], ['Address line 1', review.addressLine1], ['Address line 2', review.addressLine2], ['State', review.state], ['PIN code', review.pinCode], ['Additional information', review.additionalInformation]].map(([label, value]) => <div key={String(label)}><span>{label}</span><b>{value || '-'}</b></div>)}</div><h3>KYC Documents</h3>{review.agentDocuments.length ? <div className="tableScroll"><table><thead><tr><th>Document Type</th><th>Filename</th><th>Status</th><th>Review Remark</th><th>Actions</th></tr></thead><tbody>{review.agentDocuments.map((document) => <tr key={document.id}><td>{document.documentType}</td><td>{document.file?.originalName || 'Unavailable'}</td><td><select value={document.status} onChange={(event) => void reviewDocument(document, event.target.value as AgentDocumentStatus)}><option value="PENDING">Pending</option><option value="APPROVED">Verified</option><option value="REJECTED">Rejected</option></select></td><td><input value={remarks[document.id] ?? ''} onChange={(event) => setRemarks((current) => ({ ...current, [document.id]: event.target.value }))} placeholder="Optional remark" /></td><td><div className="rowActions">{hasUsableDocumentFile(document.fileId) && <button className="smallBtn" type="button" disabled={busy} onClick={() => void viewDocument(document)}>View / Download</button>}<button className="smallBtn" type="button" disabled={busy} onClick={() => void reviewDocument(document, document.status)}>Save review</button></div></td></tr>)}</tbody></table></div> : <p className="mutedText">No documents uploaded. GST documents are optional.</p>}<PaymentMilestoneEditor value={reviewMilestones} onChange={setReviewMilestones} /><div className="rowActions">{!review.active && !agentHasTerms(review) && <button className="btn" type="button" disabled={busy || !kycReady || !validMilestones(reviewMilestones)} onClick={() => void saveTerms(true)}>Approve Agent</button>}{review.active && <button className="btn" type="button" disabled={busy || !validMilestones(reviewMilestones)} onClick={() => void saveTerms(true)}>Save Payment Milestones</button>}{!review.active && agentHasTerms(review) && <button className="btn" type="button" disabled={busy || !validMilestones(reviewMilestones)} onClick={() => void saveTerms(true)}>Reactivate Agent</button>}</div>{!review.active && !agentHasTerms(review) && (!kycReady || !validMilestones(reviewMilestones)) && <p className="mutedText">Verify all submitted KYC documents and save a 100% milestone schedule before approval.</p>}</section>}
      <section className="panel"><div className="tableScroll"><table><thead><tr><th>Agent</th><th>Email</th><th>Payment Terms</th><th>Hotel Rate Mapping</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {agents.map((agent) => {
          const status = agentStatus(agent);
          const mappings = (agent.assignedRatePlans ?? []).filter((item) => item.active !== false);
          const categoryMappings = (agent.categoryMappings ?? []).filter((item) => item.active !== false);
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
            <td><b>{agent.name}</b><small>{agent.companyName || ''}</small><small>{activeCategoryMappingCount(categoryMappings)} active hotel contract{activeCategoryMappingCount(categoryMappings) === 1 ? '' : 's'}</small></td>
            <td className="agentEmailCell">{agentEmail(agent.email)}</td>
            <td className="agentPaymentTermsCell">{isEditingTerms ? <CompactPaymentTermsEditor value={termsMilestones} onChange={setTermsMilestones} onCancel={cancelTerms} onSave={() => void saveInlineTerms()} busy={busy} /> : <div className="agentPaymentTermsDisplay"><div className="agentMilestoneBadges agentPaymentMilestones">{agent.paymentMilestones?.length ? agent.paymentMilestones.map((item, index) => <span className="status" title={item.dueType === 'DAYS_BEFORE_CHECKIN' ? String(Number(item.daysBeforeCheckIn ?? 0)) + ' days before check-in' : 'Due when the booking is made'} key={item.dueType + '-' + String(item.daysBeforeCheckIn) + '-' + String(index)}>{milestoneLabel(item)}</span>) : <span>{agentHasTerms(agent) ? String(Number(agent.bookingPaymentPercent ?? 0)) + '% legacy' : 'Unassigned'}</span>}</div><button className="paymentTermsEditIcon" type="button" aria-label={'Edit payment terms for ' + agent.name} onClick={() => openTerms(agent)}>Edit</button></div>}</td>
              <td><div className="agentMilestoneBadges agentRatePlanSummary">{categoryMappings.length ? <>{categoryMappings.slice(0, 3).map((item) => <span className="status ok" key={item.id}>{item.hotel.name} → {item.category}<small>{item.validFrom.slice(0, 10)} → {item.validTo.slice(0, 10)}</small></span>)}{categoryMappings.length > 3 && <span className="status">+{categoryMappings.length - 3} more</span>}<a className="paymentTermsEditIcon" href={`/rainwood/admin/agent-mappings?agentId=${encodeURIComponent(agent.id)}`}>Rate Mapping</a></> : <>{summary.map((item) => <span className="status" key={item}>{item}</span>)}{!summary.length && <span>Not assigned</span>}</>}</div>{categoryMappings.length ? <small className="mutedText">Pricing source: Hotel Category Mapping</small> : mappings.length ? <small className="mutedText">Pricing source: Legacy Agent Rate Plan · view only</small> : <small className="mutedText">No category mapping configured</small>}</td>
            <td><span className={'status ' + (status === 'Active' ? 'ok' : status === 'Under Review' || status === 'KYC Pending' ? 'warn' : 'muted')}>{status}</span></td>
            <td><div className="rowActions"><a className="smallBtn" href={`/rainwood/admin/agent-mappings?agentId=${encodeURIComponent(agent.id)}`}>Manage Mappings</a><button className="smallBtn" type="button" onClick={() => void openReview(agent)}>{status === 'Under Review' || status === 'KYC Pending' ? 'Open / Review' : 'Open Details'}</button><button className="smallBtn" type="button" onClick={() => edit(agent)}>Edit</button>{status === 'Active' && <button className="smallBtn secondary" type="button" disabled={busy} onClick={() => void toggle(agent)}>Deactivate</button>}{status === 'Deactivated' && <button className="smallBtn secondary" type="button" disabled={busy} onClick={() => void toggle(agent)}>Reactivate</button>}</div></td>
          </tr>;
        })}
      </tbody></table></div></section>
    </section>
  </AdminLayout>;
}
