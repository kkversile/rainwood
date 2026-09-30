'use client';

import { useEffect, useState } from 'react';
import { AdminLayout } from '../../../components/Shell';
import { apiRequest } from '../../../lib/api';
import { canUseRateSimulator, scopedRateSimulatorHotels, type RateSimulatorHotel, type RateSimulatorProfile } from '../../../lib/rate-simulator-scope';

type Option = {
  roomType: string;
  ratePlan: string;
  total: number;
  discountAmount: number;
  promotionApplied?: { name: string; code?: string | null } | null;
  priceBreakdown: Array<{
    date: string;
    baseAmount: number;
    manualOverride?: number | null;
    seasonApplied?: { name: string; adjustment: number } | null;
    yieldRuleApplied?: { name: string; occupancyPercent: number; adjustment: number } | null;
    discountAmount?: number;
    totalAmount: number;
  }>;
};

export default function RateSimulatorPage() {
  const [profile, setProfile] = useState<RateSimulatorProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [accessError, setAccessError] = useState('');
  const [hotels, setHotels] = useState<RateSimulatorHotel[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [rooms, setRooms] = useState('1');
  const [adults, setAdults] = useState('2');
  const [children, setChildren] = useState('0');
  const [channel, setChannel] = useState('DIRECT');
  const [promoCode, setPromoCode] = useState('');
  const [results, setResults] = useState<Option[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadScope() {
      try {
        const { user } = await apiRequest<{ user: RateSimulatorProfile }>('/auth/me');
        if (cancelled) return;
        setProfile(user);
        if (!canUseRateSimulator(user)) {
          setAccessError('Rate Simulator is not available for this account.');
          return;
        }
        if (user.role === 'ADMIN' && !user.staffHotelId) {
          setAccessError('Your account has no assigned hotel for Rate Simulator access.');
          return;
        }
        const allHotels = await apiRequest<RateSimulatorHotel[]>('/hotels');
        if (cancelled) return;
        const visibleHotels = scopedRateSimulatorHotels(user, allHotels);
        if (!visibleHotels.length) {
          setAccessError('No active hotel is available for this account.');
          return;
        }
        setHotels(visibleHotels);
        setHotelId(visibleHotels[0].id);
      } catch (reason) {
        if (!cancelled) setAccessError(reason instanceof Error ? reason.message : 'Could not verify Rate Simulator access.');
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }
    void loadScope();
    return () => { cancelled = true; };
  }, []);

  async function simulate(event: React.FormEvent) {
    event.preventDefault();
    if (!profile || !canUseRateSimulator(profile) || !hotelId) {
      setError('A valid authorized hotel is required before simulating a quote.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const query = new URLSearchParams({ hotelId, checkIn, checkOut, rooms, adults, children, source: channel, ...(promoCode ? { promotionCode: promoCode } : {}) });
      setResults(await apiRequest<Option[]>(`/availability/search?${query.toString()}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not simulate rates.');
    } finally {
      setBusy(false);
    }
  }

  return <AdminLayout title="Rate Simulator">
    <section className="pageSection">
      <header className="pageTitle"><div><span>Revenue management</span><h1>Non-booking rate simulator</h1><p>Calculates the quote only. It does not create a hold, reservation, payment, or inventory mutation.</p></div></header>
      {accessError && <p className="error" role="alert">{accessError}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {profileLoading && <section className="panel"><p className="loading">Checking Rate Simulator access...</p></section>}
      {!profileLoading && !accessError && profile && canUseRateSimulator(profile) && <section className="panel">
        <form className="formCard" onSubmit={simulate}>
          <div className="three">
            <label>Hotel<select required value={hotelId} disabled={profile.role === 'ADMIN'} onChange={(event) => setHotelId(event.target.value)}>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label>
            <label>Check-in<input required type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} /></label>
            <label>Check-out<input required type="date" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} /></label>
            <label>Rooms<input required type="number" min="1" value={rooms} onChange={(event) => setRooms(event.target.value)} /></label>
            <label>Adults<input required type="number" min="1" value={adults} onChange={(event) => setAdults(event.target.value)} /></label>
            <label>Children<input required type="number" min="0" value={children} onChange={(event) => setChildren(event.target.value)} /></label>
            <label>Channel<select value={channel} onChange={(event) => setChannel(event.target.value)}><option>DIRECT</option><option>WEBSITE</option><option>AGENT</option><option>OTA</option><option>PHONE</option></select></label>
            <label>Promo code<input value={promoCode} onChange={(event) => setPromoCode(event.target.value)} placeholder="Optional" /></label>
          </div>
          <button className="btn" disabled={busy}>{busy ? 'Calculating...' : 'Simulate quote'}</button>
        </form>
      </section>}
      {results.map((result, index) => <section className="panel" key={`${result.roomType}-${result.ratePlan}-${index}`}>
        <h2>{result.roomType} · {result.ratePlan}</h2>
        <p><strong>Total INR {Number(result.total).toLocaleString('en-IN')}</strong> · Discount INR {Number(result.discountAmount).toLocaleString('en-IN')} {result.promotionApplied ? `· ${result.promotionApplied.name}${result.promotionApplied.code ? ` (${result.promotionApplied.code})` : ''}` : ''}</p>
        <div className="dataTableWrap"><table className="dataTable"><thead><tr><th>Night</th><th>Base</th><th>Manual override</th><th>Season</th><th>Yield</th><th>Pre-promo / discount</th><th>Final</th></tr></thead><tbody>{result.priceBreakdown.map((night) => <tr key={night.date}><td>{night.date}</td><td>INR {Number(night.baseAmount).toLocaleString('en-IN')}</td><td>{night.manualOverride == null ? '—' : `INR ${night.manualOverride}`}</td><td>{night.seasonApplied ? `${night.seasonApplied.name} (${night.seasonApplied.adjustment >= 0 ? '+' : ''}${night.seasonApplied.adjustment})` : '—'}</td><td>{night.yieldRuleApplied ? `${night.yieldRuleApplied.name} · ${night.yieldRuleApplied.occupancyPercent}% (${night.yieldRuleApplied.adjustment >= 0 ? '+' : ''}${night.yieldRuleApplied.adjustment})` : '—'}</td><td>INR {Number(night.totalAmount + (night.discountAmount ?? 0)).toLocaleString('en-IN')} / {Number(night.discountAmount ?? 0).toLocaleString('en-IN')}</td><td>INR {Number(night.totalAmount).toLocaleString('en-IN')}</td></tr>)}</tbody></table></div>
      </section>)}
      {!results.length && !profileLoading && !accessError && <p className="empty">Run a simulation to see per-night precedence and pricing explanation.</p>}
    </section>
  </AdminLayout>;
}
