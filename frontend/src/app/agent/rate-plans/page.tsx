'use client';

import { useEffect, useMemo, useState } from 'react';
import { AgentWorkspace } from '../../../components/AgentData';
import { RainwoodDatePicker } from '../../../components/RainwoodDatePicker';
import { apiRequest } from '../../../lib/api';
import { filterAssignedRatePlans, type AgentRatePlanFilters, type AssignedRatePlanView } from '../../../lib/agent-rate-plan-view';

type RateRow = {
  date: string;
  validFrom?: string;
  validTo?: string;
  amount: number | string | null;
  taxAmount: number | string | null;
  taxPolicy?: string | null;
  extraAdultAmount: number | string | null;
  childAmount: number | string | null;
  extraChildWithBedAmount?: number | string | null;
  childWithoutBedAmount?: number | string | null;
  occupancyPrices?: Record<string, number> | null;
};

type AssignedPlan = AssignedRatePlanView & { description?: string | null; rates: RateRow[] };
type CoverageStatus = 'VALID' | 'PARTIAL' | 'UNAVAILABLE';
type Coverage = {
  hotel: { name: string; city: string };
  status: CoverageStatus;
  coveredDates: number;
  totalDates: number;
  coveredFrom?: string | null;
  coveredTo?: string | null;
  missingDates?: string[];
};
type RateBookResponse = {
  source: string;
  requestedRange: { from: string; to: string };
  coverage: Coverage[];
  rates: AssignedPlan[];
};

const emptyFilters: AgentRatePlanFilters & { from: string; to: string; coverageStatus: '' | CoverageStatus } = {
  search: '', hotel: '', room: '', ratePlan: '', mealPlan: '', from: '', to: '', coverageStatus: '',
};
const mealPlans = ['EP', 'CP', 'MAP', 'AP'];

function daysInRange(from: string, to: string) {
  if (!from || !to) return 0;
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function money(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  return `INR ${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function dateLabel(value?: string | null) {
  if (!value) return '—';
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function hotelKey(hotel: { name: string; city: string }) {
  return `${hotel.name}:${hotel.city}`;
}

function normalizeRateBook(payload: RateBookResponse | AssignedPlan[]): RateBookResponse {
  if (!Array.isArray(payload)) return payload;
  const grouped = new Map<string, Coverage>();
  for (const plan of payload) {
    const key = hotelKey(plan.hotel);
    const current = grouped.get(key) ?? { hotel: plan.hotel, status: 'UNAVAILABLE', coveredDates: 0, totalDates: 0 };
    current.coveredDates = Math.max(current.coveredDates, plan.rates.length);
    current.status = current.coveredDates ? 'PARTIAL' : 'UNAVAILABLE';
    grouped.set(key, current);
  }
  return { source: 'LEGACY_AGENT_RATE_PLAN', requestedRange: { from: '', to: '' }, coverage: [...grouped.values()], rates: payload };
}

function summarizeRates(rates: RateRow[]) {
  const values = [...new Set(rates.map((rate) => Number(rate.amount)).filter((value) => Number.isFinite(value)))].sort((left, right) => left - right);
  if (!values.length) return '—';
  if (values.length === 1) return money(values[0]);
  return `${money(values[0])} – ${money(values[values.length - 1])}`;
}

function Plans() {
  const [rateBook, setRateBook] = useState<RateBookResponse | null>(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [detailFilters, setDetailFilters] = useState({ hotel: '', from: '', to: '', room: '', mealPlan: '' });
  const [error, setError] = useState('');

  const dateRangeError = filters.from && filters.to && daysInRange(filters.from, filters.to) === 0
    ? 'End date must be on or after the start date.'
    : '';

  useEffect(() => {
    if (dateRangeError) {
      setRateBook(null);
      setError(dateRangeError);
      return;
    }
    const query = new URLSearchParams({ view: 'rate-book' });
    if (filters.from) query.set('from', filters.from);
    if (filters.to) query.set('to', filters.to);
    setRateBook(null);
    setError('');
    apiRequest<RateBookResponse | AssignedPlan[]>(`/reservations/mine/rate-plans?${query.toString()}`)
      .then((payload) => setRateBook(normalizeRateBook(payload)))
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load assigned rates'));
  }, [dateRangeError, filters.from, filters.to]);

  const plans = rateBook?.rates ?? [];
  const plansWithRates = useMemo(() => plans.filter((plan) => plan.rates.length > 0), [plans]);
  const hotels = useMemo(() => Array.from(new Set(plansWithRates.map((plan) => plan.hotel.name))).sort(), [plansWithRates]);
  const rooms = useMemo(() => Array.from(new Set(plansWithRates.filter((plan) => !filters.hotel || plan.hotel.name === filters.hotel).map((plan) => plan.room.name))).sort(), [filters.hotel, plansWithRates]);
  const ratePlans = useMemo(() => Array.from(new Map(plansWithRates.map((plan) => [plan.id, plan])).values()).sort((left, right) => left.name.localeCompare(right.name)), [plansWithRates]);
  const mealPlanOptions = useMemo(() => Array.from(new Set(plansWithRates.map((plan) => plan.mealPlan))).sort(), [plansWithRates]);
  const visiblePlans = useMemo(() => filterAssignedRatePlans(plansWithRates, filters), [filters, plansWithRates]);
  const assignedCoverage = useMemo(() => rateBook?.coverage.filter((item) => plansWithRates.some((plan) => hotelKey(plan.hotel) === hotelKey(item.hotel))) ?? [], [plansWithRates, rateBook?.coverage]);
  const visibleCoverage = useMemo(() => assignedCoverage.filter((item) => {
    const matchesHotel = !filters.hotel || item.hotel.name === filters.hotel;
    const matchesStatus = !filters.coverageStatus || item.status === filters.coverageStatus;
    const hasVisiblePlan = visiblePlans.some((plan) => hotelKey(plan.hotel) === hotelKey(item.hotel));
    return matchesHotel && matchesStatus && hasVisiblePlan;
  }), [assignedCoverage, filters.coverageStatus, filters.hotel, visiblePlans]);
  const selectedDays = daysInRange(filters.from, filters.to);
  const requestedRange = rateBook?.requestedRange;
  const hasFilters = Object.values(filters).some(Boolean);
  const detailHotels = useMemo(() => Array.from(new Set(visiblePlans.map((plan) => plan.hotel.name))).sort(), [visiblePlans]);
  const detailPlans = useMemo(() => visiblePlans.filter((plan) => !detailFilters.hotel || plan.hotel.name === detailFilters.hotel), [detailFilters.hotel, visiblePlans]);
  const detailRows = useMemo(() => detailPlans.flatMap((plan) => plan.rates.map((rate) => ({ plan, rate }))), [detailPlans]);
  const detailRooms = useMemo(() => Array.from(new Set(detailRows.map(({ plan }) => plan.room.name))).sort(), [detailRows]);
  const detailMealPlans = useMemo(() => Array.from(new Set(detailRows.map(({ plan }) => plan.mealPlan))).sort(), [detailRows]);
  const filteredDetailRows = useMemo(() => detailRows.filter(({ plan, rate }) => {
    const date = rate.date.slice(0, 10);
    return (!detailFilters.from || date >= detailFilters.from) && (!detailFilters.to || date <= detailFilters.to) && (!detailFilters.room || plan.room.name === detailFilters.room) && (!detailFilters.mealPlan || plan.mealPlan === detailFilters.mealPlan);
  }), [detailFilters.from, detailFilters.mealPlan, detailFilters.room, detailFilters.to, detailRows]);
  const hasDetailFilters = Object.values(detailFilters).some(Boolean);
  const validCount = assignedCoverage.filter((item) => item.status === 'VALID').length;
  const partialCount = assignedCoverage.filter((item) => item.status === 'PARTIAL').length;
  const unavailableCount = assignedCoverage.filter((item) => item.status === 'UNAVAILABLE').length;

  function updateFilter<K extends keyof typeof filters>(key: K, value: typeof filters[K]) {
    setFilters((current) => ({ ...current, [key]: value, ...(key === 'hotel' ? { room: '' } : {}) }));
  }

  function openDailyRates(hotelName: string) {
    setDetailFilters((current) => ({ ...current, hotel: hotelName, room: '', mealPlan: '' }));
    window.requestAnimationFrame(() => document.getElementById('agentRateDailyDetails')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (error && !rateBook) return <p className="error" role="alert">{error}</p>;
  if (!rateBook) return <p className="loading">Loading your contracted rates...</p>;

  return <section className="agentRatePlansPage">
    <header className="agentRatePlansHeader">
      <div><span>Agent portal</span><h2>My Rates</h2><p>Your hotel-wise partner rate book, published from RainWood Rate Master.</p></div>
      <div className="agentRatePlansSummary"><strong>{visiblePlans.length} rate plans</strong><small>{selectedDays ? `${selectedDays} dates selected` : requestedRange?.from ? `${dateLabel(requestedRange.from)} – ${dateLabel(requestedRange.to)}` : 'Current published coverage'}</small></div>
    </header>

    <div className="agentRateCoverageSummary" aria-label="Rate coverage summary">
      <div><strong>{assignedCoverage.length}</strong><span>Hotels mapped</span></div>
      <div className="valid"><strong>{validCount}</strong><span>Complete coverage</span></div>
      <div className="partial"><strong>{partialCount}</strong><span>Partial coverage</span></div>
      <div className="unavailable"><strong>{unavailableCount}</strong><span>Unavailable</span></div>
    </div>

    <div className="agentRatePlansFilters" aria-label="Rate plan filters">
      <label className="agentRatePlanSearch">Search hotels, rooms or plans<input aria-label="Search assigned rate plans" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search hotel, room or meal plan..." /></label>
      <label>Hotel<select aria-label="Filter assigned rate plans by hotel" value={filters.hotel} onChange={(event) => updateFilter('hotel', event.target.value)}><option value="">All Hotels</option>{hotels.map((hotel) => <option key={hotel} value={hotel}>{hotel}</option>)}</select></label>
      <label>Room Type<select aria-label="Filter assigned rate plans by room" value={filters.room} disabled={!rooms.length} onChange={(event) => updateFilter('room', event.target.value)}><option value="">All Room Types</option>{rooms.map((room) => <option key={room} value={room}>{room}</option>)}</select></label>
      <label>Rate Plan<select aria-label="Filter assigned rate plans by rate plan" value={filters.ratePlan} onChange={(event) => updateFilter('ratePlan', event.target.value)}><option value="">All Rate Plans</option>{ratePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}{plan.code ? ` (${plan.code})` : ''}</option>)}</select></label>
      <label>Meal Plan<select aria-label="Filter assigned rate plans by meal plan" value={filters.mealPlan} onChange={(event) => updateFilter('mealPlan', event.target.value)}><option value="">All Meal Plans</option>{mealPlanOptions.map((mealPlan) => <option key={mealPlan} value={mealPlan}>{mealPlan}</option>)}</select></label>
      <label>Coverage<select aria-label="Filter assigned rates by coverage" value={filters.coverageStatus} onChange={(event) => updateFilter('coverageStatus', event.target.value as typeof filters.coverageStatus)}><option value="">All Coverage</option><option value="VALID">Complete</option><option value="PARTIAL">Partial</option><option value="UNAVAILABLE">Unavailable</option></select></label>
      <label className="agentRatePlanDateFilter"><span>From date</span><RainwoodDatePicker label="Start date" value={filters.from} accent onChange={(value) => updateFilter('from', value)} /></label>
      <label className="agentRatePlanDateFilter"><span>To date</span><RainwoodDatePicker label="End date" value={filters.to} minDate={filters.from} accent onChange={(value) => updateFilter('to', value)} /></label>
      {hasFilters && <button className="agentRatePlanClear" type="button" onClick={() => setFilters(emptyFilters)}>Clear filters</button>}
    </div>

    {error && <p className="error agentRatePlanFilterError" role="alert">{error}</p>}
    {!plansWithRates.length ? <div className="panel agentRatePlanEmpty"><h3>No rates assigned</h3><p>No published rates are currently assigned to this agent.</p></div> : !visibleCoverage.length ? <div className="panel agentRatePlanEmpty"><h3>No matching rates</h3><p>Try another hotel, room type, meal plan, coverage state or date range.</p><button className="btn secondary" type="button" onClick={() => setFilters(emptyFilters)}>Clear filters</button></div> : <section className="agentHotelRateBooks">
      {visibleCoverage.map((coverage) => {
        const hotelPlans = visiblePlans.filter((plan) => hotelKey(plan.hotel) === hotelKey(coverage.hotel));
        const roomsById = new Map<string, Map<string, AssignedPlan>>();
        for (const plan of hotelPlans) {
          const roomId = `${plan.room.name}:${plan.room.code}`;
          const roomPlans = roomsById.get(roomId) ?? new Map<string, AssignedPlan>();
          roomPlans.set(plan.mealPlan.toUpperCase(), plan);
          roomsById.set(roomId, roomPlans);
        }
        return <section className={`panel agentHotelRateBook agentCoverage-${coverage.status.toLowerCase()}`} key={hotelKey(coverage.hotel)}>
          <header className="agentHotelRateBookHeader"><div><span className={`status ${coverage.status === 'VALID' ? 'ok' : coverage.status === 'PARTIAL' ? 'warn' : 'err'}`}>{coverage.status === 'VALID' ? 'Complete coverage' : coverage.status === 'PARTIAL' ? 'Partial coverage' : 'Unavailable'}</span><h2>{coverage.hotel.name}</h2><p>{coverage.hotel.city} · {coverage.coveredDates} of {coverage.totalDates || selectedDays || 'selected'} nights covered</p></div><div className="agentHotelRateBookValidity"><strong>{coverage.coveredFrom ? `${dateLabel(coverage.coveredFrom)} – ${dateLabel(coverage.coveredTo)}` : 'No published dates'}</strong>{coverage.missingDates?.length ? <small>{coverage.missingDates.length} date{coverage.missingDates.length === 1 ? '' : 's'} need coverage</small> : <small>Published partner rates</small>}</div></header>
          {coverage.status !== 'VALID' && <div className="agentCoverageNotice"><strong>{coverage.status === 'PARTIAL' ? 'Rates are not published for every selected night.' : 'No contract rate is available for the selected period.'}</strong><span>{coverage.coveredTo ? `Available through ${dateLabel(coverage.coveredTo)}. Select a shorter date range or ask the hotel team to publish the missing dates.` : 'Ask the hotel team to assign a category and publish rates for this period.'}</span></div>}
          {roomsById.size ? <div className="tableScroll agentHotelRateGrid"><table><thead><tr><th>Room Type</th>{mealPlans.map((mealPlan) => <th key={mealPlan}>{mealPlan}</th>)}<th>Guest supplements</th></tr></thead><tbody>{[...roomsById.entries()].map(([roomId, planByMeal]) => { const first = planByMeal.values().next().value as AssignedPlan | undefined; return <tr key={roomId}><td><strong>{first?.room.name ?? 'Room'}</strong><small>{first?.room.code}</small></td>{mealPlans.map((mealPlan) => { const plan = planByMeal.get(mealPlan); return <td key={mealPlan}>{plan ? <><strong>{summarizeRates(plan.rates)}</strong><small>{plan.rates.length} night{plan.rates.length === 1 ? '' : 's'}</small></> : <span className="agentRateMissing">—</span>}</td>})}<td>{first ? <><strong>{money(first.rates[0]?.extraAdultAmount)}</strong><small>Extra adult</small><small>Child bed {money(first.rates[0]?.extraChildWithBedAmount ?? first.rates[0]?.childAmount)}</small><small>Child no bed {money(first.rates[0]?.childWithoutBedAmount)}</small></> : '—'}</td></tr>; })}</tbody></table></div> : <p className="mutedText">No room rates are published for this selected period.</p>}
          <div className="agentHotelRateBookFooter"><div>{hotelPlans.length > 0 ? <button className="agentRateDailyLink" type="button" onClick={() => openDailyRates(coverage.hotel.name)}>View daily rates</button> : <span className="mutedText">No daily rates available</span>}</div><button className="agentRateBookTopButton" type="button" aria-label={`Go to top from ${coverage.hotel.name}`} onClick={scrollToTop}>↑ <span>Go to top</span></button></div>
        </section>;
      })}
    </section>}
    {visibleCoverage.length > 0 && <section className="panel agentRateDailyDetails" id="agentRateDailyDetails" aria-labelledby="agentRateDailyDetailsTitle">
      <header className="agentRateDailyDetailsHeader"><div><span>Daily rate details</span><h2 id="agentRateDailyDetailsTitle">View daily rates</h2><p>Select a hotel to review its published daily contract rates.</p></div><button className="agentRateBookTopButton" type="button" onClick={scrollToTop}>↑ <span>Go to top</span></button></header>
      <div className="agentRateDetailFilters" aria-label="Daily rate filters"><label>Hotel<select aria-label="Filter daily rates by hotel" value={detailFilters.hotel} onChange={(event) => setDetailFilters((current) => ({ ...current, hotel: event.target.value, room: '', mealPlan: '' }))}><option value="">All Hotels</option>{detailHotels.map((hotel) => <option key={hotel} value={hotel}>{hotel}</option>)}</select></label><label>From Date<RainwoodDatePicker label="From date for daily rate details" displayLabel="From date" placeholder="From date" value={detailFilters.from} accent onChange={(value) => setDetailFilters((current) => ({ ...current, from: value, to: current.to && current.to < value ? '' : current.to }))} /></label><label>To Date<RainwoodDatePicker label="To date for daily rate details" displayLabel="To date" placeholder="To date" value={detailFilters.to} minDate={detailFilters.from} accent onChange={(value) => setDetailFilters((current) => ({ ...current, to: value }))} /></label><label>Room Type<select aria-label="Filter daily rates by room type" value={detailFilters.room} onChange={(event) => setDetailFilters((current) => ({ ...current, room: event.target.value }))}><option value="">All Room Types</option>{detailRooms.map((room) => <option key={room} value={room}>{room}</option>)}</select></label><label>Meal Plan<select aria-label="Filter daily rates by meal plan" value={detailFilters.mealPlan} onChange={(event) => setDetailFilters((current) => ({ ...current, mealPlan: event.target.value }))}><option value="">All Meal Plans</option>{detailMealPlans.map((mealPlan) => <option key={mealPlan} value={mealPlan}>{mealPlan}</option>)}</select></label>{hasDetailFilters && <button className="agentRateDetailClear" type="button" onClick={() => setDetailFilters({ hotel: '', from: '', to: '', room: '', mealPlan: '' })}>Clear</button>}</div>
      <div className="tableScroll agentRatePlanRatesTable"><table><thead><tr><th>Hotel</th><th>Room Type</th><th>Meal Plan</th><th>Date</th><th>Double</th><th>Tax</th><th>Extra Adult</th><th>Child With Bed</th><th>Child Without Bed</th></tr></thead><tbody>{filteredDetailRows.map(({ plan, rate }) => <tr key={`${plan.id}-${rate.date}`}><td>{plan.hotel.name}</td><td>{plan.room.name}</td><td>{plan.mealPlan}</td><td>{dateLabel(rate.date)}</td><td>{money(rate.amount)}</td><td>{rate.taxPolicy === 'CALCULATED_AT_BOOKING' ? 'At booking' : money(rate.taxAmount)}</td><td>{money(rate.extraAdultAmount)}</td><td>{money(rate.extraChildWithBedAmount ?? rate.childAmount)}</td><td>{money(rate.childWithoutBedAmount)}</td></tr>)}</tbody></table>{!filteredDetailRows.length && <p className="agentRateDetailEmpty">No daily rates match these filters.</p>}</div>
    </section>}
    <p className="agentRateBookFootnote">Rates are contract values. Final availability, taxes and booking eligibility are confirmed by RainWood when you create a booking.</p>
  </section>;
}

export default function AgentRatePlansPage() { return <AgentWorkspace title="My Rates">{() => <Plans />}</AgentWorkspace>; }
