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

The initial repair copied 180 Deluxe CP dates from 19 September 2026 through 17 March 2027 and seven historical Garden View EP dates from 1–7 October 2026. It did not extend the historical tariffs or add category A–E contracts. The subsequent explicitly requested current demo seed is described below.

This is a one-time demo data correction, not a general conversion of legacy negotiated contracts. It does not relax Rate Master's canonical filtering.

## Current Garden View demo tariffs

The subsequent user-authorized demo seed is `backend/scripts/seed-lakeshore-garden-demo.ts` (preview by default; add `--apply` to write). It adds missing canonical Garden View EP dates from 18 November 2026 through 17 March 2027, matching Deluxe's last published date. It preserves every existing dated row, including future edits on reruns, and leaves legacy contracts and category A–E rates untouched.

The demo tariff uses the earlier occupancy structure: single INR 4,200, double INR 4,800, triple INR 6,200, quad INR 7,200, extra adult INR 900, child with bed INR 600, and child without bed INR 0. The double rack amount/base is INR 4,800, with INR 576 fixed tax (the historical 12% rate). Historical October rows are retained exactly. These are explicitly configured demo prices, not an automatic renewal of a negotiated commercial contract.
