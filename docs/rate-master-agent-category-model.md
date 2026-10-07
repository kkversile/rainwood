# Rate Master and Agent Category Mapping

## Scope

The Rate Master is an additive commercial layer for the RainWood PMS. Existing B2C occupancy pricing remains stored in `RateDay.occupancyPrices`, and the canonical EP, CP, MAP, and AP meal plans remain represented by `RatePlanMaster`.

Agent categories A, B, C, D, and E are fixed internal commercial values. They are not CRUD records and are never exposed as labels in the agent portal.

## Date bands and precedence

The new tables are:

- `AgentCategoryRateBand`: A–E amounts for a rate plan and dated period.
- `MealPlanGuestSupplementBand`: extra-adult, child-with-bed, and child-without-bed amounts for a hotel, meal plan, and dated period.
- `AgentHotelRateCategoryAssignment`: the category assigned to an agent for a hotel and dated period.

For an agent quote, the resolver uses this precedence:

1. Agent hotel/category assignment plus `AgentCategoryRateBand` (`AGENT_CATEGORY`)
2. Published legacy `AgentRateSlab` (`AGENT_SLAB`)
3. Legacy `AgentRatePlan` (`LEGACY_AGENT_RATE_PLAN`)

The category path must have exactly one assignment and one category-rate band for every selected night. Missing or overlapping coverage returns `Contract rate is not available for all selected nights.` and never silently falls back to a public or legacy amount.

Agent My Rates and the agent rate-sheet endpoint resolve category mappings first. The external view returns resolved amounts, meal plans, validity, taxes, and property details without exposing the internal A–E category code; the legacy rate-sheet response remains available when no category mapping exists.

## Atomic administration

`PUT /rate-master/:ratePlanId` updates the selected date band in one transaction. It can update B2C single/double/triple values, A–E values, and meal-plan guest supplements. A PostgreSQL transaction advisory lock serializes edits for the same rate plan. Active overlapping category periods are rejected. The new writes emit the documented audit actions.

The old bulk RateDay editor is retained at `/admin/rate-calendar`. `/admin/rates` is the Rate Master screen and shows the B2C values, category values, date period, and guest-supplement fields together.

## Agent mapping API

- `GET /agents/:agentId/rate-mappings`
- `POST /agents/:agentId/rate-mappings`
- `PATCH /agents/:agentId/rate-mappings/:mappingId`
- `DELETE /agents/:agentId/rate-mappings/:mappingId`
- `GET /agents/:agentId/rate-mappings/:mappingId/rates`

Writes are restricted to `SUPER_ADMIN` and `CORPORATE_ADMIN`; hotel scope is checked for every mapping write. Existing slab and legacy endpoints remain available for compatibility.

## Migration and demo data

Migration `20261007120000_add_agent_category_mapping` is additive and does not remove or rewrite legacy slab tables. Disposable demo fixtures should use generic synthetic names and must not be treated as production commercial rates.
