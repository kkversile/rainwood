'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AdminLayout } from '../../../components/Shell';
import { apiRequest, API } from '../../../lib/api';

export default function SiteSettingsPage() {
  const [logoUrl, setLogoUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { apiRequest<{ logoUrl: string | null }>('/site-settings/admin').then((settings) => setLogoUrl(settings.logoUrl ?? '')).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load site settings')); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      let value = logoUrl.trim();
      if (file) {
        const formData = new FormData(); formData.append('file', file);
        const stored = await apiRequest<{ id: string }>('/files/hotel-image', { method: 'POST', body: formData });
        value = `${API}/files/public/${stored.id}`;
      }
      if (value && !/^https?:\/\//i.test(value)) throw new Error('Logo URL must start with http:// or https://.');
      await apiRequest('/site-settings/logo', { method: 'PUT', body: JSON.stringify({ logoUrl: value || null }) });
      setLogoUrl(value); setFile(null); setMessage('Logo saved. Refresh public pages to see the updated logo.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save logo'); } finally { setBusy(false); }
  }

  return <AdminLayout title="Site Settings"><section className="masterPanel"><div className="listToolbar"><div><span>Branding</span><h2>RainWood logo</h2><p>Upload a logo or provide an image URL. It will be displayed in the public header.</p></div></div><form className="formCard masterForm" onSubmit={submit}><label>Logo image URL<input type="url" value={logoUrl} onChange={(event) => { setLogoUrl(event.target.value); setFile(null); }} placeholder="https://example.com/rainwood-logo.png" /></label><label>Or upload logo<input type="file" accept="image/jpeg,image/png" onChange={(event) => { setFile(event.target.files?.[0] ?? null); if (event.target.files?.[0]) setLogoUrl(''); }} /><small className="mutedText">JPEG or PNG, maximum 5 MB.</small></label>{logoUrl && <div className="hotelImagePreview"><b>Preview</b><div className="hotelImageThumbs"><div className="hotelImageThumb"><img src={logoUrl} alt="Logo preview" /></div></div></div>}{error && <p className="error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}<div className="actions"><button className="btn" disabled={busy}>{busy ? 'Saving...' : 'Save logo'}</button><button className="smallBtn" type="button" disabled={busy} onClick={() => { setLogoUrl(''); setFile(null); }}>Remove logo</button></div></form></section></AdminLayout>;
}
