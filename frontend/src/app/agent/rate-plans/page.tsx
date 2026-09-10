'use client';

import { useEffect, useState } from 'react';
import { AgentWorkspace } from '../../../components/AgentData';
import { apiRequest } from '../../../lib/api';

type AssignedPlan = { id: string; code: string; name: string; mealPlan: string; description?: string | null; hotel: { name: string; city: string }; room: { name: string; code: string }; rates: { date: string; amount: number | string; taxAmount: number | string; occupancyPrices?: Record<string, number> | null }[] };

function Plans() {
  const [plans, setPlans] = useState<AssignedPlan[] | null>(null); const [error, setError] = useState('');
  useEffect(() => { apiRequest<AssignedPlan[]>('/reservations/mine/rate-plans').then(setPlans).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load assigned rate plans')); }, []);
  if (error) return <p className="error">{error}</p>;
  if (!plans) return <p className="loading">Loading assigned rate plans...</p>;
  return <section className="agentPlanGrid">{!plans.length ? <div className="panel"><p className="empty">No rate plans have been assigned to your account.</p></div> : plans.map((plan) => <article className="panel agentPlanCard" key={plan.id}><div className="agentPlanHeader"><div><span className="status ok">Assigned</span><h2>{plan.name}</h2><p>{plan.hotel.name} · {plan.hotel.city} · {plan.room.name} ({plan.room.code})</p></div><b className="mappingCode">{plan.code}</b></div><p>{plan.description || `${plan.mealPlan} meal plan`}</p><h3>Effective rates</h3>{!plan.rates.length ? <p className="mutedText">No daily base rates published yet.</p> : <div className="tableScroll"><table><thead><tr><th>Date</th><th>Effective rate</th><th>Tax</th><th>Double occupancy</th></tr></thead><tbody>{plan.rates.slice(0, 14).map((rate) => <tr key={rate.date}><td>{rate.date.slice(0, 10)}</td><td>INR {Number(rate.amount).toFixed(2)}</td><td>INR {Number(rate.taxAmount).toFixed(2)}</td><td>{rate.occupancyPrices?.double ? `INR ${Number(rate.occupancyPrices.double).toFixed(2)}` : ' - '}</td></tr>)}</tbody></table></div>}</article>)}</section>;
}

export default function AgentRatePlansPage() { return <AgentWorkspace title="My Rate Plans">{() => <Plans />}</AgentWorkspace>; }
