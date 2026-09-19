'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

const documentTypes = [
  'Company PAN Card', 'GST Document', 'MSME Certificate', 'Trade License',
  'Hotel Contract - Signed', 'Cancelled Cheque Leaf', 'Address proof',
  'Owner PAN Document', 'Owner ID proof', 'Owner Address proof', 'Others',
];

type AgentDocument = { id: string; documentType: string; description?: string | null; status: 'PENDING' | 'APPROVED' | 'REJECTED'; reviewRemark?: string | null; createdAt: string; file: { originalName: string; mimeType: string; size: number } };

export default function AgentKyc() {
  const [documents, setDocuments] = useState<AgentDocument[] | null>(null);
  const [documentType, setDocumentType] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadDocuments() {
    try { setDocuments(await apiRequest<AgentDocument[]>('/agents/me/documents')); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load documents'); }
  }
  useEffect(() => { void loadDocuments(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(''); setMessage('');
    if (!documentType || !file) { setError('Select a document type and choose a PDF, PNG, or JPEG file.'); return; }
    setSaving(true);
    try {
      const form = new FormData(); form.append('file', file);
      const stored = await apiRequest<{ id: string }>('/files/agent-document', { method: 'POST', body: form });
      await apiRequest('/agents/me/documents', { method: 'POST', body: JSON.stringify({ documentType, description, fileId: stored.id }) });
      setDocumentType(''); setDescription(''); setFile(null); setMessage('Document uploaded and sent for hotel approval.');
      const input = document.getElementById('agent-kyc-file') as HTMLInputElement | null; if (input) input.value = '';
      await loadDocuments();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not upload document'); } finally { setSaving(false); }
  }

  return <div className="agentKycWorkspace">
    <div className="agentKycGrid">
      <form className="agentKycForm" onSubmit={(event) => void submit(event)}>
        <label>Document Type <sup>*</sup><select value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="">Select Document Type</option>{documentTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add a short description" rows={3} /></label>
        <label>Upload Document <sup>*</sup><input id="agent-kyc-file" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        {file && <small className="agentKycSelectedFile">Selected: {file.name}</small>}
        <button className="btn agentKycSave" type="submit" disabled={saving}>{saving ? 'Uploading...' : 'Save'}</button>
      </form>
      <div className="agentKycStatus">
        <p className="agentKycWarning">Please upload required documents. You can create bookings once the Hotel approve your documents.</p>
        {message && <p className="agentKycSuccess">{message}</p>}{error && <p className="error">{error}</p>}
        <h2>Uploaded documents</h2>
        {!documents ? <p className="loading">Loading documents...</p> : !documents.length ? <p className="empty">No documents uploaded yet.</p> : <div className="agentKycDocumentList">{documents.map((document) => <div className="agentKycDocument" key={document.id}><div><b>{document.documentType}</b><span>{document.file.originalName}</span>{document.description && <small>{document.description}</small>}</div><span className={`agentKycStatusBadge ${document.status.toLowerCase()}`}>{document.status}</span></div>)}</div>}
      </div>
    </div>
  </div>;
}
