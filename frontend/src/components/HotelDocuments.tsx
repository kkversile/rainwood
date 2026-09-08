'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, CheckCircle2, Download, Eye, File, FileCheck2, FileText, Info, Pencil, Search, ShieldCheck, Trash2, Upload, UserRound, X } from 'lucide-react';
import { apiFileBlob } from '../lib/api';

export type HotelDocumentRecord = {
  id: string;
  documentType: string;
  name: string;
  fileId: string;
  fileName: string;
  expiryDate?: string | null;
  createdAt: string;
  mimeType?: string | null;
  size?: number | null;
};

type DocumentChanges = { name: string; documentType: string; expiryDate: string | null };

const uploadTypes = [
  { name: 'Business Registration', detail: 'Company / Proprietor / GST', formats: 'PDF, JPG, PNG (Max 5MB)', icon: FileText, tone: 'blue' },
  { name: 'GST Certificate', detail: 'GST registration document', formats: 'PDF (Max 5MB)', icon: FileCheck2, tone: 'green' },
  { name: 'Hotel License', detail: 'Trade / Operating License', formats: 'PDF (Max 5MB)', icon: ShieldCheck, tone: 'purple' },
  { name: 'Identity Proof', detail: 'PAN / Aadhar / Passport', formats: 'PDF, JPG, PNG (Max 5MB)', icon: UserRound, tone: 'amber' },
  { name: 'Bank Details', detail: 'Cancelled Cheque / Bank Proof', formats: 'PDF, JPG, PNG (Max 5MB)', icon: Building2, tone: 'rose' },
  { name: 'Other Document', detail: 'Any other supporting document', formats: 'PDF, JPG, PNG (Max 5MB)', icon: File, tone: 'slate' },
] as const;

function extension(fileName: string) { return fileName.toLowerCase().split('.').pop() ?? ''; }
function isImage(document: HotelDocumentRecord) { return Boolean(document.mimeType?.startsWith('image/')) || ['jpg', 'jpeg', 'png', 'webp'].includes(extension(document.fileName)); }
function isPdf(document: HotelDocumentRecord) { return document.mimeType === 'application/pdf' || extension(document.fileName) === 'pdf'; }
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—'; }
function inputDate(value?: string | null) { return value ? new Date(value).toISOString().slice(0, 10) : ''; }
function documentStatus(value?: string | null) {
  if (!value) return { label: 'Active', tone: 'active' };
  const expiry = new Date(value).getTime();
  const now = Date.now();
  if (expiry < now) return { label: 'Expired', tone: 'expired' };
  if (expiry - now < 31 * 24 * 60 * 60 * 1000) return { label: 'Expiring Soon', tone: 'soon' };
  return { label: 'Valid', tone: 'valid' };
}

export function HotelDocuments({ documents, busy, onUpload, onUpdate, onDelete }: { documents: HotelDocumentRecord[]; busy: boolean; onUpload: (file: File, documentType: string) => Promise<void>; onUpdate: (id: string, changes: DocumentChanges) => Promise<void>; onDelete: (document: HotelDocumentRecord) => Promise<void> }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [editTarget, setEditTarget] = useState<HotelDocumentRecord | null>(null);
  const [previewTarget, setPreviewTarget] = useState<HotelDocumentRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const documentTypes = useMemo(() => Array.from(new Set(documents.map((document) => document.documentType))).sort(), [documents]);
  const visibleDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return documents.filter((document) => (filter === 'ALL' || document.documentType === filter) && (!query || `${document.name} ${document.documentType} ${document.fileName}`.toLowerCase().includes(query)));
  }, [documents, filter, search]);

  async function openPreview(document: HotelDocumentRecord) {
    setPreviewTarget(document); setPreviewLoading(true); setPreviewUrl(''); setPreviewError('');
    try { setPreviewUrl(URL.createObjectURL(await apiFileBlob(`/files/${document.fileId}`))); }
    catch (reason) { setPreviewError(reason instanceof Error ? reason.message : 'Could not load preview'); }
    finally { setPreviewLoading(false); }
  }

  async function downloadDocument(document: HotelDocumentRecord) {
    const url = URL.createObjectURL(await apiFileBlob(`/files/${document.fileId}`));
    const link = window.document.createElement('a'); link.href = url; link.download = document.fileName; link.click(); URL.revokeObjectURL(url);
  }

  return <section className="documentsWorkspace" aria-label="Hotel Documents">
    <div className="documentsOverviewCard">
      <div className="documentsOverviewInfo"><span className="documentsOverviewIcon"><FileText size={25} /></span><div><h2>Hotel Documents</h2><p>Upload and manage important documents related to your property. These documents may be required for compliance, contracts and partner integrations.</p></div></div>
      <div className="documentsGuidelines"><div><Info size={15} /><b>Guidelines</b></div><ul><li>Supported formats: PDF, JPG, PNG (Max 5MB per file)</li><li>Ensure documents are clear and valid</li><li>Keep documents updated as per expiry dates</li><li>Sensitive documents are securely stored</li></ul></div>
    </div>

    <section className="documentsUploadGrid" aria-label="Upload Document Types">
      {uploadTypes.map(({ name, detail, formats, icon: Icon, tone }) => <article className={`documentUploadCard ${tone}`} key={name}>
        <div className="documentUploadCardIntro"><span className="documentTypeIcon"><Icon size={21} /></span><h3>{name}</h3><p>{detail}</p></div>
        <div className="documentUploadAction"><input ref={(node) => { inputRefs.current[name] = node; }} type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file, name); event.currentTarget.value = ''; }} /><button type="button" disabled={busy} onClick={() => inputRefs.current[name]?.click()}><Upload size={13} /> Upload File</button><span>{formats}</span></div>
      </article>)}
    </section>

    <section className="documentsListCard" aria-label="Uploaded Documents">
      <header className="documentsListHeader"><div className="documentsListTitle"><span><FileText size={20} /></span><div><h3>Uploaded Documents ({documents.length})</h3><p>View, download and manage all uploaded documents</p></div></div><div className="documentsFilters"><label className="documentsSearch"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search documents..." aria-label="Search documents" /></label><label className="documentsTypeFilter"><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Document type filter"><option value="ALL">All Document Types</option>{documentTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label></div></header>
      <div className="documentsTableWrap"><table className="documentsTable"><thead><tr><th>S.No</th><th>Document Name</th><th>Document Type</th><th>File Name</th><th>Uploaded On</th><th>Expiry Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visibleDocuments.map((document, index) => { const status = documentStatus(document.expiryDate); return <tr key={document.id}><td>{index + 1}</td><td><b>{document.name}</b></td><td>{document.documentType}</td><td><code>{document.fileName}</code></td><td>{formatDate(document.createdAt)}</td><td>{formatDate(document.expiryDate)}</td><td><span className={`documentStatus ${status.tone}`}>{status.label}</span></td><td><div className="documentRowActions"><button type="button" aria-label={`View ${document.name}`} onClick={() => void openPreview(document)}><Eye size={14} /></button><button type="button" aria-label={`Download ${document.name}`} onClick={() => void downloadDocument(document)}><Download size={14} /></button><button type="button" aria-label={`Edit ${document.name}`} onClick={() => setEditTarget(document)}><Pencil size={14} /></button><button className="danger" type="button" aria-label={`Delete ${document.name}`} onClick={() => void onDelete(document)}><Trash2 size={14} /></button></div></td></tr>; })}{!visibleDocuments.length && <tr><td colSpan={8}><p className="documentsEmpty">No documents uploaded yet.</p></td></tr>}</tbody></table></div>
    </section>

    {editTarget && <DocumentEditModal document={editTarget} busy={busy} onClose={() => setEditTarget(null)} onSave={async (changes) => { await onUpdate(editTarget.id, changes); setEditTarget(null); }} />}
    {previewTarget && <div className="documentPreviewBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setPreviewTarget(null); setPreviewUrl(''); setPreviewError(''); } }}><section className="documentPreviewModal" role="dialog" aria-modal="true" aria-labelledby="document-preview-title"><header><div><h2 id="document-preview-title">{previewTarget.name}</h2><p>{previewTarget.fileName}</p></div><button type="button" aria-label="Close preview" onClick={() => { setPreviewTarget(null); setPreviewUrl(''); setPreviewError(''); }}><X size={18} /></button></header><div className="documentPreviewBody">{previewLoading && <p>Loading preview...</p>}{!previewLoading && previewError && <p role="alert">{previewError}</p>}{!previewLoading && !previewError && previewUrl && isImage(previewTarget) && <img src={previewUrl} alt={previewTarget.name} />}{!previewLoading && !previewError && previewUrl && isPdf(previewTarget) && <iframe title={`${previewTarget.name} preview`} src={previewUrl} />}{!previewLoading && !previewError && previewUrl && !isImage(previewTarget) && !isPdf(previewTarget) && <p>Preview is not available for this file type.</p>}</div><footer><button type="button" className="smallBtn" onClick={() => void downloadDocument(previewTarget)}><Download size={14} /> Download</button><button type="button" className="btn" onClick={() => { setPreviewTarget(null); setPreviewUrl(''); setPreviewError(''); }}>Close</button></footer></section></div>}
  </section>;
}

function DocumentEditModal({ document, busy, onClose, onSave }: { document: HotelDocumentRecord; busy: boolean; onClose: () => void; onSave: (changes: DocumentChanges) => Promise<void> }) {
  const [name, setName] = useState(document.name);
  const [documentType, setDocumentType] = useState(document.documentType);
  const [expiryDate, setExpiryDate] = useState(inputDate(document.expiryDate));
  return <div className="documentPreviewBackdrop" role="presentation"><form className="documentEditModal" role="dialog" aria-modal="true" aria-labelledby="document-edit-title" onSubmit={(event) => { event.preventDefault(); void onSave({ name: name.trim(), documentType, expiryDate: expiryDate || null }); }}><header><div><h2 id="document-edit-title">Edit Document</h2><p>Update document details and expiry tracking.</p></div><button type="button" aria-label="Close edit dialog" onClick={onClose}><X size={18} /></button></header><div className="documentEditBody"><label>Document Name<input value={name} onChange={(event) => setName(event.target.value)} required /></label><label>Document Type<select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>{uploadTypes.map((type) => <option key={type.name}>{type.name}</option>)}</select></label><label>Expiry Date<input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} /></label></div><footer><button className="smallBtn" type="button" onClick={onClose}>Cancel</button><button className="btn" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save Changes'}</button></footer></form></div>;
}
