export type AssignedRatePlanView = {
  id: string;
  code: string;
  name: string;
  mealPlan: string;
  hotel: { name: string; city: string };
  room: { name: string; code: string };
};

export type AgentRatePlanFilters = {
  search: string;
  hotel: string;
  room: string;
  mealPlan: string;
};

export function filterAssignedRatePlans<T extends AssignedRatePlanView>(plans: T[], filters: AgentRatePlanFilters) {
  const query = filters.search.trim().toLowerCase();
  return plans.filter((plan) => {
    const searchable = `${plan.name} ${plan.code} ${plan.mealPlan} ${plan.hotel.name} ${plan.hotel.city} ${plan.room.name} ${plan.room.code}`.toLowerCase();
    return (!query || searchable.includes(query))
      && (!filters.hotel || plan.hotel.name === filters.hotel)
      && (!filters.room || plan.room.name === filters.room)
      && (!filters.mealPlan || plan.mealPlan === filters.mealPlan);
  });
}
