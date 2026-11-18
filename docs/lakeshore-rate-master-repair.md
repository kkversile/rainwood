# Lakeshore demo Rate Master repair

The Lakeshore hotel had two active legacy room plans and an unassigned canonical EP master. Rate Master intentionally displays only active canonical EP/CP/MAP/AP room assignments, so neither room appeared.

`backend/scripts/repair-lakeshore-rate-master.ts` is an explicitly scoped, additive repair for `RW-ALLEPPEY-DEMO`. Preview is the default:

```sh
cd backend
node --import tsx scripts/repair-lakeshore-rate-master.ts
node --import tsx scripts/repair-lakeshore-rate-master.ts --apply
node --import tsx --test scripts/repair-lakeshore-rate-master.test.ts
```

Take a database backup before applying. The serializable transaction creates the missing canonical CP master, reuses the existing canonical EP master, and assigns CP to Lakeshore Deluxe Room and EP to Lakeshore Garden View Room. It copies all existing dated prices, taxes, occupancy amounts, and restrictions into the new assignments. It retains legacy contracts, agent access, external PMS identifiers, reservations, and payments. Existing canonical assignments are preserved on reruns, including later price edits; conflicting records abort the repair.

The source Deluxe CP has 180 dates from 19 September 2026 through 17 March 2027. Garden View EP has seven historical dates from 1–7 October 2026. No current Garden View tariffs or category A–E contracts are invented. For current November dates the Garden View row is visible but has no published price. The hotel owner must supply current EP prices before selling that plan.

This is a one-time demo data correction, not a general conversion of legacy negotiated contracts. It does not relax Rate Master's canonical filtering.
