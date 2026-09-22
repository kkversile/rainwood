'use client';

import { useEffect, useMemo, useState } from 'react';
import { AgentWorkspace } from '../../../components/AgentData';
import { apiRequest } from '../../../lib/api';
import { filterAssignedRatePlans, type AssignedRatePlanView } from '../../../lib/agent-rate-plan-view';

type AssignedPlan = AssignedRatePlanView & { description?: string | null; rates: { date: string; amount: number | string; taxAmount: number | string; occupancyPrices?: Record<string, number> | null }[] };

const emptyFilters = { search: '', hotel: '', room: '', mealPlan: '' };

function Plans() {
  const [plans, setPlans] = useState<AssignedPlan[] | null>(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest<AssignedPlan[]>('/reservations/mine/rate-plans')
      .then(setPlans)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load assigned rate plans'));
  }, []);

  const hotels = useMemo(() => Array.from(new Set((plans ?? []).map((plan) => plan.hotel.name))).sort(), [plans]);
  const rooms = useMemo(() => Array.from(new Set((plans ?? []).filter((plan) => !filters.hotel || plan.hotel.name === filters.hotel).map((plan) => plan.room.name))).sort(), [filters.hotel, plans]);
  const mealPlans = useMemo(() => Array.from(new Set((plans ?? []).map((plan) => plan.mealPlan))).sort(), [plans]);
  const visiblePlans = useMemo(() => filterAssignedRatePlans(plans ?? [], filters), [filters, plans]);

  function updateFilter(key: keyof typeof emptyFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value, ...(key === 'hotel' ? { room: '' } : {}) }));
  }

  const hasFilters = Object.values(filters).some(Boolean);

  if (error) return <p className="error">{error}</p>;
  if (!plans) return <p className="loading">Loading assigned rate plans...</p>;

  return <section className="agentRatePlansPage">
    <header className="agentRatePlansHeader">
      <div><span>Agent portal</span><h2>My Rate Plans</h2><p>View the hotel, room and meal-plan rates assigned to your account.</p></div>
      <strong>{visiblePlans.length} of {plans.length} assigned</strong>
    </header>
    <div className="agentRatePlansFilters" aria-label="Rate plan filters">
      <label className="agentRatePlanSearch">Search rate plans, rooms or hotels<input aria-label="Search assigned rate plans" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search by plan, room or hotel..." /></label>
      <label>Hotel<select aria-label="Filter assigned rate plans by hotel" value={filters.hotel} onChange={(event) => updateFilter('hotel', event.target.value)}><option value="">All Hotels</option>{hotels.map((hotel) => <option key={hotel} value={hotel}>{hotel}</option>)}</select></label>
      <label>Room Type<select aria-label="Filter assigned rate plans by room" value={filters.room} disabled={!filters.hotel && !rooms.length} onChange={(event) => updateFilter('room', event.target.value)}><option value="">All Room Types</option>{rooms.map((room) => <option key={room} value={room}>{room}</option>)}</select></label>
      <label>Meal Plan<select aria-label="Filter assigned rate plans by meal plan" value={filters.mealPlan} onChange={(event) => updateFilter('mealPlan', event.target.value)}><option value="">All Meal Plans</option>{mealPlans.map((mealPlan) => <option key={mealPlan} value={mealPlan}>{mealPlan}</option>)}</select></label>
      {hasFilters && <button className="agentRatePlanClear" type="button" onClick={() => setFilters(emptyFilters)}>Clear filters</button>}
    </div>
    {!plans.length ? <div className="panel agentRatePlanEmpty"><h3>No rate plans assigned</h3><p>Your Admin team has not assigned any hotel rate plans to this account yet.</p></div> : !visiblePlans.length ? <div className="panel agentRatePlanEmpty"><h3>No matching rate plans</h3><p>Try a different hotel, room type, meal plan or search term.</p><button className="btn secondary" type="button" onClick={() => setFilters(emptyFilters)}>Clear filters</button></div> : <section className="agentPlanGrid">{visiblePlans.map((plan) => <article className="panel agentPlanCard" key={plan.id}><div className="agentPlanHeader"><div><span className="status ok">Assigned</span><h2>{plan.name}</h2><p>{plan.hotel.name} · {plan.hotel.city} · {plan.room.name} ({plan.room.code})</p></div><b className="mappingCode">{plan.code}</b></div><p>{plan.description || `${plan.mealPlan} meal plan`}</p><h3>Effective rates</h3>{!plan.rates.length ? <p className="mutedText">No daily base rates published yet.</p> : <div className="tableScroll"><table><thead><tr><th>Date</th><th>Effective rate</th><th>Tax</th><th>Double occupancy</th></tr></thead><tbody>{plan.rates.slice(0, 14).map((rate) => <tr key={rate.date}><td>{rate.date.slice(0, 10)}</td><td>INR {Number(rate.amount).toFixed(2)}</td><td>INR {Number(rate.taxAmount).toFixed(2)}</td><td>{rate.occupancyPrices?.double ? `INR ${Number(rate.occupancyPrices.double).toFixed(2)}` : ' - '}</td></tr>)}</tbody></table></div>}</article>)}</section>}
  </section>;
}

export default function AgentRatePlansPage() { return <AgentWorkspace title="My Rate Plans">{() => <Plans />}</AgentWorkspace>; }
