# Canonical meal plans and agent rate slabs

## Model

RainWood keeps the existing `RatePlanMaster`, `RatePlan`, `RateDay`, reservation, hold, promotion, tax, supplement, and audit flows. The canonical meal-plan field is `EP`, `CP`, `MAP`, or `AP`; it describes inclusions and is separate from an agent's commercial contract.

Agent pricing is represented by a versioned `AgentRateSlab`:

```text
AgentRateSlab (DRAFT -> PUBLISHED -> RETIRED)
        | 1..n
AgentRateSlabRate (rate plan + date band + base/occupancy/child amounts)
        | assigned for a date band
AgentRateSlabAssignment (agent + published slab)
        | immutable output
AgentRateSheet (published snapshot)
```

## Implementation audit

| Area | Current / reusable | Missing or changed | Migration risk |
| --- | --- | --- | --- |
| Rate engine | `RatePlanMaster`, `RatePlan`, `RateDay`, restrictions, seasons, yield and taxes remain authoritative for public pricing. | Canonical meal-plan labels are now the normal admin vocabulary. | Low; legacy masters remain readable. |
| Agent pricing | Existing `AgentRatePlan` assignments remain supported as fallback. Holds and reservations already quote through availability. | Published dated slabs and snapshots are added as the authoritative agent source. | Medium; an agent must have complete slab coverage for a selected stay. |
| Commercial policy | Existing promotions and supplementary-charge scope are reused. | Agent promotions are explicit `AGENT` channel only; agent supplements use `AGENTS`/`ALL`. | Low; no public channel behavior changes. |
| Portal / sheets | Existing agent rate-plan endpoint and portal presentation are reusable. | Slab-backed effective rates and immutable sheet snapshots are exposed. | Medium; old agents without slabs continue on legacy mappings. |
| Child pricing | Existing child and extra-adult fields are retained. | Slabs add with-bed and without-bed amounts. | Low; public booking payloads remain compatible. |

Published slabs and sheets are immutable. To change a published contract, clone it to a new draft version, replace its complete rate matrix, validate the date bands, and publish the new version.

## Pricing rules

1. An agent with a published slab assignment uses slab rates when the selected stay is fully covered.
2. If no slab is assigned, the existing `AgentRatePlan` mapping remains the compatibility fallback.
3. A partial slab assignment never silently falls back to another commercial rate; the quote is rejected with a contract coverage message.
4. Fixed slab rates do not receive ordinary season or yield adjustments.
5. Promotions are applied to agent quotes only when the promotion explicitly includes the `AGENT` channel.
6. Supplementary charges use `AGENTS` or `ALL` scope for agent quotes.
7. Holds and reservations quote through the same availability service, so the effective price source is carried into the reservation snapshot.

## Child pricing

The slab rate stores separate values for an extra adult, child with bed, and child without bed, plus optional occupancy prices. Existing `RateDay.childAmount` and `extraAdultAmount` remain available for legacy plans and public booking.

## Tax semantics

`RateDay.taxAmount` is a fixed persisted tax amount for the selected dated public rate. `AgentRateSlabRate.amount` is the contracted room amount before statutory tax. When an agent slab is resolved, RainWood derives the effective tax percentage from the same authoritative `RateDay` (`taxAmount / taxable rate`) and applies that percentage to the slab amount. The fixed public tax amount is never copied onto a different slab amount.

For example, a canonical rate of INR 5,000 with INR 900 tax implies an 18% policy. A slab amount of INR 6,000 resolves to INR 1,080 tax; changing the slab to INR 6,500 resolves to INR 1,170 tax. My Rates therefore displays `Taxes calculated at booking` for slab bands, while availability, quote, hold, and reservation snapshots carry the calculated tax from the same policy.

## Admin workflow

Use `/admin/rate-plans` for the canonical meal-plan catalog and `/admin/agent-rate-slabs` for dated agent contracts:

1. Create or select a draft slab and define its validity.
2. Add one or more canonical EP/CP/MAP/AP rate-plan rows and child amounts.
3. Publish the slab.
4. Assign the published slab to an agent for a non-overlapping date band.
5. Preview and publish an immutable rate-sheet snapshot.

## Migration and audit

Migration `20261005120000_add_agent_rate_slabs` is additive. It does not rewrite legacy rate plans or assignments. Run `npx tsx tools/audit-rate-plans.ts` with the intended database connection to inspect current masters, room assignments, legacy agent mappings, daily-rate coverage, and overlap candidates before converting contracts.

Production deployment and seeding are intentionally separate from this change. Use a disposable PostgreSQL database for migration and end-to-end verification; do not seed or publish production contracts automatically.
