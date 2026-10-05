'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AdminLayout } from '../../../components/Shell';
import { apiRequest } from '../../../lib/api';
import { canResetFeatureOverride, orderFeatureRows } from '../../../lib/admin-features';
import { ADMIN_GROUPS } from '../../../config/admin-navigation';

type FeatureRow = ReturnType<typeof orderFeatureRows>[number];
type Hotel = { id: string; name: string; code: string };
const valuesOf = (rows: FeatureRow[]) => Object.fromEntries(rows.map((row) => [row.key, row.enabled]));

export default function FeaturesPage() {
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<{ role: string } | null>(null);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState(() => searchParams.get('hotelId') ?? '');
  const [rows, setRows] = useState<FeatureRow[]>([]);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';
  const isDirty = useMemo(() => rows.some((row) => draft[row.key] !== row.enabled), [draft, rows]);

  useEffect(() => { apiRequest<{ user: { role: string } }>('/auth/me').then((body) => setProfile(body.user)).catch(() => setProfile(null)); }, []);
  useEffect(() => {
    if (!isSuperAdmin) return;
    apiRequest<Hotel[]>('/hotels').then((list) => {
      setHotels(list);
      const requested = searchParams.get('hotelId');
      if (requested && list.some((hotel) => hotel.id === requested)) setHotelId(requested);
      else if (requested) { setHotelId(''); setError('The requested hotel scope is not available. Showing group defaults.'); }
    }).catch(() => setError('Could not load hotel scopes.'));
  }, [isSuperAdmin, searchParams]);
  useEffect(() => {
    if (!profile) return;
    if (!isSuperAdmin) { setLoading(false); return; }
    let active = true;
    setLoading(true); setError(''); setMessage('');
    const path = hotelId ? `/features/${encodeURIComponent(hotelId)}` : '/features';
    apiRequest<{ features: FeatureRow[] }>(path).then((body) => { if (active) { const ordered = orderFeatureRows(body.features); setRows(ordered); setDraft(valuesOf(ordered)); } }).catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Could not load feature settings.')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [hotelId, isSuperAdmin, profile]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (isDirty) { event.preventDefault(); event.returnValue = ''; } };
    const internalNavigation = (event: MouseEvent) => {
      if (!isDirty) return;
      const anchor = (event.target as HTMLElement).closest('a');
      if (!anchor || !anchor.href.startsWith(window.location.origin) || window.confirm('Discard unsaved feature changes?')) return;
      event.preventDefault(); event.stopPropagation();
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', internalNavigation, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', internalNavigation, true); };
  }, [isDirty]);

  const groups = useMemo(() => ADMIN_GROUPS.map((group) => group.label).filter((group) => rows.some((row) => row.group === group)), [rows]);
  const visibleRows = (group: string) => rows.filter((row) => row.group === group && `${row.label} ${row.key}`.toLowerCase().includes(query.toLowerCase()));
  const allRows = (group: string) => rows.filter((row) => row.group === group);
  function setAll(group: string, enabled: boolean) { setDraft((current) => ({ ...current, ...Object.fromEntries(allRows(group).map((row) => [row.key, enabled])) })); }
  function reset() { setDraft(valuesOf(rows)); setMessage(''); }
  function changeScope(next: string) { if (next !== hotelId && isDirty && !window.confirm('Discard unsaved feature changes before changing scope?')) return; setHotelId(next); }
  async function save() {
    const changes = Object.fromEntries(rows.filter((row) => draft[row.key] !== row.enabled).map((row) => [row.key, draft[row.key]]));
    if (!Object.keys(changes).length || !window.confirm('Save these feature settings? Disabled features will be unavailable to affected users.')) return;
    setSaving(true); setError('');
    try { const path = hotelId ? `/features/${encodeURIComponent(hotelId)}` : '/features'; const body = await apiRequest<{ features: FeatureRow[] }>(path, { method: 'PUT', body: JSON.stringify({ features: changes }) }); const ordered = orderFeatureRows(body.features); setRows(ordered); setDraft(valuesOf(ordered)); setMessage('Feature settings saved.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save feature settings.'); }
    finally { setSaving(false); }
  }
  async function resetOverride(key: string) {
    if (!canResetFeatureOverride(isDirty)) {
      setError('You have unsaved feature changes. Save or cancel them before resetting an inherited override.');
      return;
    }
    if (!hotelId || !window.confirm('Reset this hotel override and inherit the group default?')) return;
    try { const body = await apiRequest<{ features: FeatureRow[] }>(`/features/${encodeURIComponent(hotelId)}/${encodeURIComponent(key)}`, { method: 'DELETE' }); const ordered = orderFeatureRows(body.features); setRows(ordered); setDraft(valuesOf(ordered)); setMessage('Hotel override reset.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not reset override.'); }
  }
  if (!isSuperAdmin && !loading) return <AdminLayout title="Features"><section className="featureUnavailable"><span>Access restricted</span><h2>Features</h2><p>Only the system administrator can manage feature availability.</p><Link className="btn" href="/admin/dashboard">Back to Dashboard</Link></section></AdminLayout>;
  return <AdminLayout title="Features"><section className="featureSettingsPage"><div className="featureSettingsHeader"><div><span>System controls</span><h1>Features</h1><p>Control group defaults and optional hotel-specific overrides. Existing role permissions still apply.</p></div><label>Scope<select value={hotelId} onChange={(event) => changeScope(event.target.value)}><option value="">All hotels · group defaults</option>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name} ({hotel.code})</option>)}</select></label></div><div className="featureToolbar"><label>Search features<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by feature name..." /></label><div><button className="btn secondary" type="button" onClick={() => setExpanded(Object.fromEntries(groups.map((group) => [group, false])))} disabled={loading}>Collapse all</button><button className="btn secondary" type="button" onClick={() => setExpanded(Object.fromEntries(groups.map((group) => [group, true])))} disabled={loading}>Expand all</button><button className="btn secondary" type="button" onClick={reset} disabled={saving || !isDirty}>Cancel</button><button className="btn" type="button" onClick={() => void save()} disabled={saving || loading || !isDirty}>{saving ? 'Saving...' : 'Save settings'}</button></div></div>{message && <p className="success" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}{loading ? <p className="loading" role="status">Loading feature settings...</p> : <div className="featureGroups">{groups.map((group) => { const items = allRows(group); const visible = visibleRows(group); const count = items.filter((row) => draft[row.key]).length; const all = count === items.length && items.length > 0; const mixed = count > 0 && !all; return <section className="featureGroup" key={group}><div className="featureGroupHeader"><button type="button" className="featureExpand" onClick={() => setExpanded((current) => ({ ...current, [group]: current[group] === false }))} aria-expanded={expanded[group] !== false}>{expanded[group] === false ? '▸' : '▾'}</button><label><input type="checkbox" checked={all} ref={(element) => { if (element) element.indeterminate = mixed; }} onChange={(event) => setAll(group, event.target.checked)} /> <b>{group}</b></label><small>{count}/{items.length} enabled</small></div>{expanded[group] !== false && <div className="featureRows">{visible.map((row) => <div className="featureRow" key={row.key}><label><input type="checkbox" checked={Boolean(draft[row.key])} onChange={() => setDraft((current) => ({ ...current, [row.key]: !current[row.key] }))} /><span><b>{row.label}</b><small>{row.key}</small></span></label>{hotelId && <span className="featureSource">{row.source === 'HOTEL_OVERRIDE' ? <><i>Hotel override</i><button type="button" onClick={() => void resetOverride(row.key)}>Reset</button></> : 'Inherited group default'}</span>}</div>)}{!visible.length && <p className="empty">No features match this search.</p>}</div>}</section>; })}</div>}</section></AdminLayout>;
}
