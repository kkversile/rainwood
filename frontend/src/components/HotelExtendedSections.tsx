'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { createDefaultPolicy, HotelPolicies, type HotelPolicyValue, normalizePolicy } from './HotelPolicies';
import { HotelContacts, type HotelContact, type HotelContactDraft } from './HotelContacts';
import { HotelLocation } from './HotelLocation';
import { useDialog } from './ReactDialog';
import { HotelDocuments, type HotelDocumentRecord } from './HotelDocuments';

type Hotel = { id: string; name: string; address?: string | null; city: string; state?: string | null; country?: string | null; pincode?: string | null; latitude?: string | null; longitude?: string | null };
type Doc = HotelDocumentRecord;
type ExtendedSection = 'policy' | 'contacts' | 'location' | 'documents';
type NavigateSection = ExtendedSection | 'preview';

export function HotelExtendedSections({ hotelId, hotel: initialHotel, initialSection, onNavigate }: { hotelId: string; hotel: Hotel; initialSection: ExtendedSection; onNavigate?: (section: NavigateSection) => void }) {
  const dialog = useDialog();
  const [section, setSection] = useState(initialSection);
  const [policy, setPolicy] = useState<HotelPolicyValue>(createDefaultPolicy);
  const [policyLoaded, setPolicyLoaded] = useState(false);
  const [contacts, setContacts] = useState<HotelContact[]>([]);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [hotel, setHotel] = useState(initialHotel);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { setSection(initialSection); }, [initialSection]);
  useEffect(() => {
    setHotel(initialHotel);
  }, [initialHotel.id, initialHotel.name, initialHotel.address, initialHotel.city, initialHotel.state, initialHotel.country, initialHotel.pincode, initialHotel.latitude, initialHotel.longitude]);
  useEffect(() => {
    void Promise.all([
      apiRequest<Partial<HotelPolicyValue> | null>(`/hotels/${hotelId}/policy`),
      apiRequest<HotelContact[]>(`/hotels/${hotelId}/contacts`),
      apiRequest<Doc[]>(`/hotels/${hotelId}/documents`),
    ]).then(([loadedPolicy, loadedContacts, loadedDocuments]) => {
      setPolicy(normalizePolicy(loadedPolicy));
      setPolicyLoaded(true);
      setContacts(loadedContacts);
      setDocuments(loadedDocuments);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load hotel settings'));
  }, [hotelId]);

  function clearNotice() { setError(''); setMessage(''); }

  async function savePolicy() {
    clearNotice();
    if (policy.childMinAge > policy.childMaxAge) { setError('Child minimum age cannot be greater than maximum age.'); return false; }
    setBusy(true);
    try {
      const payload = { ...policy, noShowAmount: policy.noShowPolicy === 'SPECIFIC' && policy.noShowAmount !== '' ? Number(policy.noShowAmount) : null };
      const saved = await apiRequest<Partial<HotelPolicyValue>>(`/hotels/${hotelId}/policy`, { method: 'PUT', body: JSON.stringify(payload) });
      setPolicy(normalizePolicy(saved));
      setMessage('Policies saved.');
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save policies');
      return false;
    } finally { setBusy(false); }
  }

  async function saveContact(value: HotelContactDraft, editingId?: string) {
    clearNotice(); setBusy(true);
    try {
      const saved = await apiRequest<HotelContact>(editingId ? `/hotels/contacts/${editingId}` : `/hotels/${hotelId}/contacts`, { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(value) });
      setContacts((current) => {
        const next = current.map((item) => (item.id === saved.id ? saved : (saved.primary ? { ...item, primary: false } : item)));
        return editingId ? next : [saved, ...next];
      });
      setMessage(editingId ? 'Contact updated.' : 'Contact added.');
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : editingId ? 'Could not update contact' : 'Could not add contact'); return false; } finally { setBusy(false); }
  }

  async function removeContact(id: string) {
    if (!await dialog.confirm({ title: 'Delete hotel contact?', message: 'This contact will be permanently removed from the hotel profile.', confirmLabel: 'Delete Contact', danger: true })) return;
    setBusy(true);
    try { await apiRequest(`/hotels/contacts/${id}`, { method: 'DELETE' }); setContacts((current) => current.filter((item) => item.id !== id)); setMessage('Contact deleted.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete contact'); }
    finally { setBusy(false); }
  }

  async function uploadDocument(file: File, documentType: string) {
    clearNotice(); setBusy(true);
    try {
      const form = new FormData(); form.append('file', file);
      const stored = await apiRequest<{ id: string }>('/files/hotel-document', { method: 'POST', body: form });
      const saved = await apiRequest<Doc>(`/hotels/${hotelId}/documents`, { method: 'POST', body: JSON.stringify({ documentType, name: file.name.replace(/\.[^.]+$/, ''), fileId: stored.id, fileName: file.name }) });
      setDocuments((current) => [saved, ...current]); setMessage('Document uploaded.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not upload document'); }
    finally { setBusy(false); }
  }

  async function updateDocument(id: string, changes: { name: string; documentType: string; expiryDate: string | null }) {
    clearNotice(); setBusy(true);
    try {
      const saved = await apiRequest<Doc>(`/hotels/documents/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });
      setDocuments((current) => current.map((document) => document.id === id ? { ...document, ...saved } : document));
      setMessage('Document updated.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update document'); }
    finally { setBusy(false); }
  }

  async function removeDocument(item: Doc) {
    if (!await dialog.confirm({ title: 'Delete document?', message: `${item.name} will be permanently removed from this hotel.`, confirmLabel: 'Delete Document', danger: true })) return;
    setBusy(true);
    try { await apiRequest(`/hotels/documents/${item.id}`, { method: 'DELETE' }); setDocuments((current) => current.filter((doc) => doc.id !== item.id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete document'); }
    finally { setBusy(false); }
  }

  return <section className="hotelExtended">
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}

    {section === 'policy' && !policyLoaded && <section className="policyLoading" role="status">Loading policies...</section>}
    {section === 'policy' && policyLoaded && <HotelPolicies
      value={policy}
      busy={busy}
      onChange={(next) => { clearNotice(); setPolicy(next); }}
      onBack={() => onNavigate?.('preview')}
      onSave={(continueToNext) => { void savePolicy().then((saved) => { if (saved && continueToNext) onNavigate?.('contacts'); }); }}
    />}

    {section === 'contacts' && <HotelContacts contacts={contacts} busy={busy} onSave={saveContact} onDelete={(id) => void removeContact(id)} />}

    {section === 'location' && <HotelLocation hotel={hotel} busy={busy} onHotelChange={setHotel} />}

    {section === 'documents' && <HotelDocuments documents={documents} busy={busy} onUpload={uploadDocument} onUpdate={updateDocument} onDelete={removeDocument} />}
  </section>;
}
