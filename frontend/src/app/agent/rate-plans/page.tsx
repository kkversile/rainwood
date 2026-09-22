'use client';

import { useEffect, useMemo, useState } from 'react';
import { AgentWorkspace } from '../../../components/AgentData';
import { RainwoodDatePicker } from '../../../components/RainwoodDatePicker';
import { apiRequest } from '../../../lib/api';
import { filterAssignedRatePlans, type AgentRatePlanFilters, type AssignedRatePlanView } from '../../../lib/agent-rate-plan-view';

type RateRow = {
  date: string;
  amount: number | string | null;
  taxAmount: number | string | null;
  extraAdultAmount: number | string | null;
  childAmount: number | string | null;
  occupancyPrices?: Record<string, number> | null;
  priceSource?: 'BASE' | 'AGENT_OVERRIDE';
};

type AssignedPlan = AssignedRatePlanView & { description?: string | null; rates: RateRow[] };

const emptyFilters: AgentRatePlanFilters & { from: string; to: string } = {
  search: '', hotel: '', room: '', ratePlan: '', mealPlan: '', from: '', to: '',
};

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

function Plans() {
  const [plans, setPlans] = useState<AssignedPlan[] | null>(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [error, setError] = useState('');

  const dateRangeError = filters.from && filters.to && daysInRange(filters.from, filters.to) === 0
    ? 'End date must be on or after the start date.'
    : '';

  useEffect(() => {
    if (dateRangeError) {
      setPlans([]);
      setError(dateRangeError);
      return;
    }
    const query = new URLSearchParams();
    if (filters.from) query.set('from', filters.from);
    if (filters.to) query.set('to', filters.to);
    setPlans(null);
    setError('');
    apiRequest<AssignedPlan[]>(`/reservations/mine/rate-plans${query.toString() ? `?${query.toString()}` : ''}`)
      .then(setPlans)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load assigned rate plans'));
  }, [dateRangeError, filters.from, filters.to]);

  const hotels = useMemo(() => Array.from(new Set((plans ?? []).map((plan) => plan.hotel.name))).sort(), [plans]);
  const rooms = useMemo(() => Array.from(new Set((plans ?? []).filter((plan) => !filters.hotel || plan.hotel.name === filters.hotel).map((plan) => plan.room.name))).sort(), [filters.hotel, plans]);
  const ratePlans = useMemo(() => Array.from(new Map((plans ?? []).map((plan) => [plan.id, plan])).values()).sort((left, right) => left.name.localeCompare(right.name)), [plans]);
  const mealPlans = useMemo(() => Array.from(new Set((plans ?? []).map((plan) => plan.mealPlan))).sort(), [plans]);
  const visiblePlans = useMemo(() => filterAssignedRatePlans(plans ?? [], filters), [filters, plans]);
  const selectedDays = daysInRange(filters.from, filters.to);

  function updateFilter<K extends keyof typeof filters>(key: K, value: typeof filters[K]) {
    setFilters((current) => ({ ...current, [key]: value, ...(key === 'hotel' ? { room: '' } : {}) }));
  }

  const hasFilters = Object.values(filters).some(Boolean);

  if (error && !plans) return <p className="error" role="alert">{error}</p>;
  if (!plans) return <p className="loading">Loading assigned rate plans...</p>;

  return <section className="agentRatePlansPage">
    <header className="agentRatePlansHeader">
      <div><span>Agent portal</span><h2>My Rate Plans</h2><p>Search assigned hotels, contracted nett rates and effective dates.</p></div>
      <div className="agentRatePlansSummary"><strong>{visiblePlans.length} of {plans.length} assigned</strong><small>{selectedDays ? `${selectedDays} dates selected` : 'All available dates'}</small></div>
    </header>
    <div className="agentRatePlansFilters" aria-label="Rate plan filters">
      <label className="agentRatePlanSearch">Search plans, rooms or hotels<input aria-label="Search assigned rate plans" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search Alleppey, partner rate..." /></label>
      <label>Hotel<select aria-label="Filter assigned rate plans by hotel" value={filters.hotel} onChange={(event) => updateFilter('hotel', event.target.value)}><option value="">All Hotels</option>{hotels.map((hotel) => <option key={hotel} value={hotel}>{hotel}</option>)}</select></label>
      <label>Room Type<select aria-label="Filter assigned rate plans by room" value={filters.room} disabled={!rooms.length} onChange={(event) => updateFilter('room', event.target.value)}><option value="">All Room Types</option>{rooms.map((room) => <option key={room} value={room}>{room}</option>)}</select></label>
      <label className="agentRatePlanSelectWide">Rate Plan / Type<select aria-label="Filter assigned rate plans by rate plan" value={filters.ratePlan} onChange={(event) => updateFilter('ratePlan', event.target.value)}><option value="">All Rate Plans</option>{ratePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}{plan.code ? ` (${plan.code})` : ''}</option>)}</select></label>
      <label>Meal Plan<select aria-label="Filter assigned rate plans by meal plan" value={filters.mealPlan} onChange={(event) => updateFilter('mealPlan', event.target.value)}><option value="">All Meal Plans</option>{mealPlans.map((mealPlan) => <option key={mealPlan} value={mealPlan}>{mealPlan}</option>)}</select></label>
      <label className="agentRatePlanDateFilter"><span>From date</span><RainwoodDatePicker label="Start date" value={filters.from} accent onChange={(value) => updateFilter('from', value)} /></label>
      <label className="agentRatePlanDateFilter"><span>To date</span><RainwoodDatePicker label="End date" value={filters.to} minDate={filters.from} accent onChange={(value) => updateFilter('to', value)} /></label>
      {hasFilters && <button className="agentRatePlanClear" type="button" onClick={() => setFilters(emptyFilters)}>Clear filters</button>}
    </div>
    {error && <p className="error agentRatePlanFilterError" role="alert">{error}</p>}
    {!plans.length ? <div className="panel agentRatePlanEmpty"><h3>No rate plans assigned</h3><p>Your Admin team has not assigned any hotel rate plans to this account yet.</p></div> : !visiblePlans.length ? <div className="panel agentRatePlanEmpty"><h3>No matching rate plans</h3><p>Try another hotel, rate plan, room type, meal plan or date range.</p><button className="btn secondary" type="button" onClick={() => setFilters(emptyFilters)}>Clear filters</button></div> : <section className="agentPlanGrid">{visiblePlans.map((plan) => <article className="panel agentPlanCard" key={plan.id}><div className="agentPlanHeader"><div><span className="status ok">Assigned</span><h2>{plan.name}</h2><p>{plan.hotel.name} · {plan.hotel.city} · {plan.room.name} ({plan.room.code})</p></div><b className="mappingCode">{plan.code}</b></div><p>{plan.description || `${plan.mealPlan} meal plan`}</p><div className="agentRatePlanCardMeta"><h3>Contracted nett rates</h3><span>{plan.rates.length}{selectedDays ? ` of ${selectedDays}` : ''} date{plan.rates.length === 1 ? '' : 's'} returned</span></div>{!plan.rates.length ? <p className="mutedText">No rates published for the selected dates.</p> : <div className="tableScroll agentRatePlanRatesTable"><table><thead><tr><th>Date</th><th>Contracted nett rate</th><th>Tax</th><th>Double occupancy</th><th>Extra adult</th><th>Child</th><th>Source</th></tr></thead><tbody>{plan.rates.map((rate) => <tr key={rate.date}><td>{rate.date.slice(0, 10)}</td><td>{money(rate.amount)}</td><td>{money(rate.taxAmount)}</td><td>{money(rate.occupancyPrices?.double)}</td><td>{money(rate.extraAdultAmount)}</td><td>{money(rate.childAmount)}</td><td>{rate.priceSource === 'AGENT_OVERRIDE' ? 'Contracted' : 'Hotel base'}</td></tr>)}</tbody></table></div>}</article>)}</section>}
  </section>;
}

export default function AgentRatePlansPage() { return <AgentWorkspace title="My Rate Plans">{() => <Plans />}</AgentWorkspace>; }
