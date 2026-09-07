'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminLayout } from '../../../components/Shell';
import { apiRequest } from '../../../lib/api';

type Hotel = {
  id: string; code: string; name: string; slug: string; city: string; state?: string | null; active: boolean; axisPropertyId?: string | null;
  images?: { url: string; altText?: string | null }[]; rooms?: { id: string }[];
};
const pageSizes = [10, 25, 50];

export default function HotelsAdminPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [search, setSearch] = useState(''); const [city, setCity] = useState('ALL'); const [status, setStatus] = useState('ALL');
  const [pageSize, setPageSize] = useState(10); const [page, setPage] = useState(1);
  async function loadHotels() { setLoading(true); try { setHotels(await apiRequest<Hotel[]>('/hotels')); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load hotels'); } finally { setLoading(false); } }
  useEffect(() => { void loadHotels(); }, []); useEffect(() => { setPage(1); }, [search, city, status, pageSize]);
  const cities = useMemo(() => Array.from(new Set(hotels.map((hotel) => hotel.city).filter(Boolean))).sort(), [hotels]);
  const filtered = useMemo(() => hotels.filter((hotel) => { const haystack = `${hotel.name} ${hotel.code} ${hotel.city} ${hotel.state ?? ''}`.toLowerCase(); return haystack.includes(search.toLowerCase()) && (city === 'ALL' || hotel.city === city) && (status === 'ALL' || (status === 'ACTIVE' ? hotel.active : !hotel.active)); }), [hotels, search, city, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize)); const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  return <AdminLayout title="Hotels"><section className="hotelListPanel hotelManagementPage">
    <div className="listToolbar"><div><span>Property management</span><h2>Hotels</h2><p>Manage hotel properties, room inventory, rate books and operational setup.</p></div><div className="listActions"><Link className="btn" href="/admin/hotels/new">+ Add Hotel</Link><Link className="btn secondary" href="/admin/rate-plans">▤ Price Book</Link></div></div>
    <div className="hotelMetrics"><div><span>▥</span><b>{hotels.length}</b><small>Total Hotels</small></div><div><span>●</span><b>{hotels.filter((hotel) => hotel.active).length}</b><small>Active Hotels</small></div><div><span>↗</span><b>{hotels.filter((hotel) => hotel.axisPropertyId).length}</b><small>Connected to PMS</small></div></div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="hotelFilters"><label className="hotelSearch">⌕ <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search hotel, code or city..." /></label><label>City<select value={city} onChange={(event) => setCity(event.target.value)}><option value="ALL">All Cities</option>{cities.map((item) => <option key={item}>{item}</option>)}</select></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All Status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label><label className="entries">Show<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}</select> entries</label></div>
    {loading ? <p className="loading">Loading hotels...</p> : <><div className="hotelTableWrap"><table className="hotelTable"><thead><tr><th>S.No</th><th>Hotel</th><th>Hotel Code</th><th>City</th><th>Rooms</th><th>PMS</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map((hotel, index) => <tr key={hotel.id}><td>{(page - 1) * pageSize + index + 1}</td><td><div className="hotelTableName">{hotel.images?.[0] && <img src={hotel.images[0].url} alt="" />}<span><b>{hotel.name}</b><small>{hotel.city}{hotel.state ? `, ${hotel.state}` : ''}</small></span></div></td><td><code>{hotel.code}</code></td><td>{hotel.city}</td><td>{hotel.rooms?.length ?? 0}</td><td><span className={hotel.axisPropertyId ? 'pmsStatus connected' : 'pmsStatus'}>{hotel.axisPropertyId ? '● Connected' : '○ Not connected'}</span></td><td><span className={`status ${hotel.active ? 'ok' : 'err'}`}>● {hotel.active ? 'Active' : 'Inactive'}</span></td><td><div className="tableActions"><Link className="actionButton" href={`/hotels/${hotel.slug}`} title="View hotel">◉ <span>View</span></Link><Link className="actionButton" href={`/admin/hotels/new?edit=${hotel.id}`} title="Edit hotel">✎ <span>Edit</span></Link><Link className="actionButton" href={`/admin/hotels/${hotel.id}/catalog`} title="Rooms and rates">▤ <span>Rooms</span></Link><button className="actionButton moreAction" type="button" title="More actions" onClick={() => window.alert('Delete/deactivate actions will be added here.')}>•••</button></div></td></tr>)}</tbody></table></div><div className="hotelTableFooter"><span>Showing {filtered.length ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} hotels</span><div className="pagination"><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>‹</button><b>{page}</b><button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>›</button></div></div></>}
    {!loading && !filtered.length && <p className="empty">No hotels match your filters.</p>}
  </section></AdminLayout>;
}
