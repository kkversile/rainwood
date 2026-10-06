# Agent rate-plan migration audit

`RatePlanMaster.kind` is the explicit commercial classification. Existing A/B/C/D and other noncanonical masters remain `LEGACY`; they are not renamed or merged because their historical RateDay, AgentRatePlan, and reservation references may represent different negotiated values.

The reproducible audit is `tools/audit-rate-plans.ts`. It reports, for every legacy master:

- hotel, code, name, and meal plan;
- assigned room types;
- future RateDay count and the lowest upcoming effective amount;
- AgentRatePlan assignments; and
- historical reservation references.

Run it against an approved disposable or read-only database with `npm --prefix backend exec tsx ../tools/audit-rate-plans.ts`. A commercial owner must explicitly decide whether conflicting records are migrated into a canonical meal plan plus Agent Slab; this application does not silently convert them.

Canonical records are only `EP`, `CP`, `MAP`, and `AP` masters whose `kind` is `CANONICAL_MEAL`. Active canonical duplicates are rejected by the partial unique index on hotel and meal plan. Agent slabs can reference canonical masters only.

## Tax semantics

RainWood imports and stores `RateDay.taxAmount` as an explicit fixed amount for that dated public rate. `AgentRateSlabRate.amount` is a contract amount before statutory tax. Slab resolution derives the effective tax percentage from the same authoritative `RateDay` (`taxAmount / taxable amount`) and applies it to the contract amount; it does not copy the fixed public tax amount to a different contract rate.

The invariant is shared across My Rates, availability, quote, hold, and reservation: a canonical INR 5,000 rate with INR 900 tax implies 18%, so slab INR 6,000 resolves to INR 1,080 tax and slab INR 6,500 resolves to INR 1,170 tax. My Rates labels slab rows `Taxes calculated at booking` rather than implying zero tax.
