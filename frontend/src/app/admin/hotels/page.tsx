'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminLayout } from '../../../components/Shell';
import { apiRequest } from '../../../lib/api';

type Hotel = { id: string; code: string; name: string; slug: string; city: string; active: boolean; rooms?: { id: string }[] };

export default function HotelsAdminPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [search, setSearch] = useState('');
  async function loadHotels() { setLoading(true); try { setHotels(await apiRequest<Hotel[]>('/hotels')); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load hotels'); } finally { setLoading(false); } }
  useEffect(() => { void loadHotels(); }, []);
  const filtered = hotels.filter((hotel) => `${hotel.name} ${hotel.code} ${hotel.city}`.toLowerCase().includes(search.toLowerCase()));
  return <AdminLayout title="Hotels"><section className="hotelListPanel"><div className="listToolbar"><div><span>Property management</span><h2>List of Hotels</h2></div><div className="listActions"><Link className="btn" href="/admin/hotels/new">+ Add Hotel</Link><Link className="btn secondary" href="/admin/hotels/new?step=3">Price Book</Link></div></div>{error && <p className="error" role="alert">{error}</p>}<div className="listFilters"><label>Show<select defaultValue="10"><option>10</option><option>25</option><option>50</option></select> entries</label><label>Search<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search hotel, code or city" /></label></div>{loading ? <p className="loading">Loading hotels…</p> : <div className="hotelTableWrap"><table className="hotelTable"><thead><tr><th>S.No</th><th>Action</th><th>Hotel Name</th><th>Hotel Code</th><th>Hotel City</th><th>Rooms</th><th>Status</th></tr></thead><tbody>{filtered.map((hotel, index) => <tr key={hotel.id}><td>{index + 1}</td><td><div className="tableActions"><Link className="iconBtn" href={`/hotels/${hotel.slug}`} title="View">◉</Link><Link className="iconBtn edit" href={`/admin/hotels/new?edit=${hotel.id}`} title="Edit">✎</Link><Link className="iconBtn" href={`/admin/hotels/${hotel.id}/catalog`} title="Rooms and rates">▤</Link></div></td><td><b>{hotel.name}</b></td><td><code>{hotel.code}</code></td><td>{hotel.city}</td><td>{hotel.rooms?.length ?? 0}</td><td><span className={`status ${hotel.active ? 'ok' : 'err'}`}>{hotel.active ? 'Active' : 'Inactive'}</span></td></tr>)}</tbody></table></div>}{!loading && !filtered.length && <p className="empty">No hotels match your search.</p>}</section></AdminLayout>;
}
