# RainWood PMS Demo Guide

Verified commit: `701dc3c1` (`feat: prefill operational demo forms`)
Branch: `main`
Verification date: 2026-10-02
Demo environment: `https://demo.dhisoft.in/rainwood`
Local verification environment: `http://localhost:3001/rainwood` with disposable PostgreSQL

This guide contains no passwords, JWTs, API keys, database credentials, or private tokens. Use the configured demo-login shortcuts or approved credentials from the local environment.

## 5-Minute Demo

Use this sequence for a concise management demonstration.

### 1. Dashboard

Where to click: Sign in at `/rainwood/login`, then open Dashboard.

What to show: Hotel context, operational summary, command bar, and grouped navigation.

What to say: "RainWood brings commercial, front-office, finance, and hotel operations into one hotel-scoped workspace."

Expected result: The authorized dashboard loads without an Unauthorized state.

### 2. Front Desk

Where to click: Admin -> Operations -> Front Desk.

What to show: Arrivals, In-house, Departures, and Exceptions queues.

What to say: "Front Desk staff work from operational queues while Reservation 360 keeps the complete guest context in one place."

Expected result: Queue switching preserves URL state and shows the seeded operational records.

### 3. Reservation 360

Where to click: Open an arrival or reservation reference from Front Desk.

What to show: Overview, Stay & Room, Folio, Guest, and Timeline sections.

What to say: "The same Reservation 360 workspace connects the guest, stay, room, folio, and operational history."

Expected result: The detail workspace opens and closes back to the previous queue or Room Rack context.

### 4. Room Rack

Where to click: Admin -> Operations -> Room Rack.

What to show: Physical rooms, reservation blocks by date, Unassigned stays, housekeeping state, and maintenance overlays.

What to say: "Room Rack is physical-room planning. Rates and inventory remain separate sellable room-type inventory."

Expected result: Assigned stays render on physical rooms and genuinely unassigned stays remain visible in the Unassigned lane.

### 5. Folio / Checkout

Where to click: Open Reservation 360 -> Folio.

What to show: Room charges, incidental charges, payments, balance, and settlement state.

What to say: "Financial totals are calculated from the server-authoritative folio and settlement workflow."

Expected result: The folio shows safe seeded values. Use a prepared disposable record for any demonstration mutation.

### 6. Night Audit

Where to click: Admin -> Night Audit -> Preview.

What to show: Business date, occupancy, revenue, outstanding amount, blockers, and warnings.

What to say: "Night Audit provides a controlled business-day review and preserves an historical snapshot."

Expected result: Preview loads. Do not close a real business day during a presentation unless it was intentionally prepared.

## 10-15 Minute Demo

```text
Public Booking
      |
      v
Reservation / Quote
      |
      v
Front Desk
      |
      v
Room Rack
      |
      v
Check In
      |
      v
In-house
      |
      v
Folio / Charge
      |
      v
Checkout
      |
      v
Night Audit Preview
```

Presenter talking points:

1. Start with Public Booking: select a hotel, dates, adults, and children; show availability and the authoritative quote.
2. Show the temporary inventory hold and guest-safe details before reaching the mock payment step.
3. Open the resulting reservation in Front Desk and Reservation 360.
4. Use Room Rack to explain physical-room planning, assigned rooms, unassigned stays, and date-range controls.
5. Show Check In, In-house, room context, folio charges, payment state, and safe settlement behavior.
6. Open Housekeeping and Maintenance to show how room readiness is controlled by operational workflows.
7. Finish with Night Audit Preview, showing warnings and blockers without closing a real business day.

## ASCII Architecture

```text
                         RAINWOOD PMS
                              |
          +-------------------+-------------------+
          |                   |                   |
          v                   v                   v
   Public Booking       Hotel Operations      Agent Portal
          |                   |                   |
          v                   v                   v
     Availability         Front Desk          Availability
          |                   |                   |
          v                   v                   v
         Hold          Reservation 360         Booking
          |                   |                   |
          v          +--------+--------+        v
       Payment       |        |        |     Agent Reports
          |          v        v        v
          v      Room Rack  Folio   Guest CRM
     Reservation      |        |
                      v        v
                 Room Operations  Settlement
                   /       \        |
                  v         v      v
            Housekeeping Maintenance Checkout
                                |
                                v
                           Night Audit
```

## ASCII Public Booking Flow

```text
Home
 |
 v
Hotel + Dates + Guests
 |
 v
Availability
 |
 v
Room + Rate
 |
 v
Inventory Hold
 |
 +---- expires ----> Recheck Availability
 |
 v
Guest Details
 |
 v
Payment
 |
 v
Booking Confirmation
```

The public flow uses server-authoritative pricing, separate adult/child occupancy, a temporary inventory hold, and guest-safe input fields.

## Reservation / Stay Lifecycle

```text
Reservation
CONFIRMED / MODIFIED
        |
        v
Stay
EXPECTED
        |
        | Check In
        v
CHECKED_IN
        |
        | Charges / Payments
        | Room change where authorized
        |
        v
CHECKED_OUT
```

`NO_SHOW` is a separate supported stay outcome and is not normal physical-room occupancy.

## Front Desk Flow

```text
                    FRONT DESK
                        |
        +---------------+---------------+
        |               |               |
        v               v               v
     ARRIVALS         IN-HOUSE       DEPARTURES
        |               |               |
        +---------------+---------------+
                        |
                        v
                 RESERVATION 360
                        |
        +---------------+---------------+---------------+---------------+
        |               |               |               |
        v               v               v               v
    Overview       Stay & Room       Folio          Guest / Timeline
```

Relevant authorized actions include Assign Room, Check In, Change Room, Post Charge, Record Payment, and Checkout, subject to role and hotel scope.

## Room Rack Diagram

```text
ROOM RACK - 02 OCT -> 06 OCT

Room      02      03      04      05      06
------------------------------------------------
201      [ Ravi Kumar RW-1042 -------- ]
202              [ Priya RW-1051 ----- ]
203      AVAILABLE
204      OUT OF ORDER
205      [ Amit ----------------------- ]

UNASSIGNED
------------------------------------------------
RW-1060 - Suresh - Deluxe - 03-05 Oct
RW-1068 - Maya   - Suite  - 04-06 Oct
```

Room Rack means physical-room planning. Rates and Inventory mean sellable room-type inventory.

## Housekeeping Flow

```text
Guest checks out
      |
      v
Room DIRTY
      |
      v
Housekeeping task
      |
      v
PENDING
      |
      v
ACCEPTED
      |
      v
CLEANING
      |
      v
COMPLETED
      |
      v
Room AVAILABLE
```

## Maintenance / Out-of-Order Flow

```text
Issue reported
      |
      v
Maintenance ticket
      |
      +---- requires blocking? ----+
      |                            |
      NO                           YES
      |                            |
      v                            v
Work / resolve                OUT OF ORDER
                                   |
                                   v
                               Resolve
                                   |
                                   v
                    AVAILABLE only after all blockers are clear
```

## Finance Flow

```text
Reservation / Stay
       |
       v
Room Charges
       |
       +---- Incidentals
       |
       v
Folio
       |
       +---- Payments
       |
       v
Settlement
       |
       +---- Outstanding authorization when required
       |
       v
Checkout
       |
       v
Invoice / Credit Note / TDS
       |
       v
Night Audit Snapshot
```

## Role Demo Matrix

| Persona | Login / entry | Landing | Key modules to demonstrate | Mutations allowed? |
|---|---|---|---|---|
| Public Guest | `/rainwood/booking` | Booking flow | Hotel search, availability, hold, guest details, mock payment | Guest booking inputs only |
| SUPER_ADMIN | `/rainwood/login` | `/admin/dashboard` | Organization, hotels, operations, finance, Night Audit, system administration | Yes, within system policy |
| CORPORATE_ADMIN | `/rainwood/login` | `/admin/dashboard` | Multi-property operations, rates, promotions, guests, reports | Authorized corporate scope |
| ADMIN | `/rainwood/login` | `/admin/dashboard` | Front Desk, Room Rack, Arrivals, In-house, folio, housekeeping, maintenance | Authorized property scope |
| RESERVATION | `/rainwood/login` | `/admin/arrivals` | Quotes, reservations, arrivals, search, authorized Room Rack | Reservation scope; not unrestricted finance/system administration |
| ACCOUNTS | `/rainwood/login` | `/admin/cashier` | Cashier, payments, expenses, tax invoices, credit notes, TDS, reports | Authorized finance actions |
| VIEWER | `/rainwood/login` | `/admin/reports` | Reports and read-only information | No operational or financial mutation |
| SERVICE_STAFF | `/rainwood/staff/login` | `/staff` | Assigned stays, service orders, permitted charges, housekeeping context | Department-scoped service actions |
| AGENT | `/rainwood/agent/login` | `/agent` | Assigned hotels/rates, availability, booking history, reports/settings | Agent-scoped bookings and settings |

## Role-by-Role Presentation Script

### Public Guest

1. Open `/rainwood/booking`.
2. Select a hotel, dates, adults, and children.
3. Show availability, room/rate selection, temporary hold, guest details, mock payment, and confirmation.

Say: "The guest sees only guest-safe fields; availability and pricing remain authoritative on the server."

Cannot access: Internal notes, staff fields, admin navigation, hotel operations, or other guests' data.

### SUPER_ADMIN

1. Sign in at `/rainwood/login`.
2. Show Dashboard, Manage Hotels, Operations, Rates, Finance, Night Audit, and Users.
3. Open Reservation 360 from Front Desk or Room Rack.

Say: "This is the broad system and operational view, with backend authorization still applied to every mutation."

Cannot access: No ordinary property restriction; sensitive actions still require their explicit authorization.

### CORPORATE_ADMIN

1. Sign in at `/rainwood/login`.
2. Show the multi-property dashboard, reports, rates, promotions, guests, and operations.

Say: "Corporate administration works across authorized properties without receiving SUPER_ADMIN-only site configuration controls."

Cannot access: SUPER_ADMIN-only site and organization administration.

### ADMIN

1. Sign in at `/rainwood/login`.
2. Open Front Desk -> an arrival -> Reservation 360.
3. Show Room Rack, Arrivals, In-house, Folio, Housekeeping, Maintenance, and Night Audit Preview.

Say: "The property team can move from arrival to physical room to folio without leaving the hotel workspace."

Cannot access: Other hotels outside the assigned property scope.

### RESERVATION

1. Sign in at `/rainwood/login` and land on Expected Arrivals.
2. Open New Reservation and request an authoritative quote.
3. Show the hold/quote and explain that changing dates, room, rate, or occupancy invalidates stale pricing.

Say: "Reservation staff work from authoritative quotes and hotel scope; they do not bypass inventory or settlement rules."

Cannot access: System administration and unrestricted finance or room-lifecycle mutation.

### ACCOUNTS

1. Sign in at `/rainwood/login` and open Cashier Shift.
2. Show Payments, Expenses, Tax Invoices, Credit Notes, TDS, Reports, and corporate receivables.

Say: "Accounts sees the financial workflow without inheriting front-office and room-mutation permissions."

Cannot access: New Reservation and unrelated operational mutation controls.

### VIEWER

1. Sign in at `/rainwood/login` and open Reports.
2. Show read-only reports and reporting/tax views.
3. Confirm that New Reservation, Check In, Checkout, Payment, and room-mutation controls are absent.

Say: "Viewer access is fail-closed and read-only; hidden navigation is backed by route authorization."

Cannot access: Operational and financial mutations.

### SERVICE_STAFF

1. Sign in at `/rainwood/staff/login`.
2. Search by room, guest, or reservation.
3. Show assigned stays, service orders, permitted service charges, and department scope.

Say: "The Staff PWA is limited to the assigned hotel and department and does not expose admin navigation."

Cannot access: Admin navigation and unrelated departments or properties.

### AGENT

1. Sign in at `/rainwood/agent/login`.
2. Show the Agent Dashboard, assigned rate plans, hotel availability, booking history, and settings.
3. Attempt an admin URL only if demonstrating route protection.

Say: "Agents see the commercial access granted to their account, not the hotel's internal operations console."

Cannot access: Admin operations, other agents' scope, and internal hotel data.

## Before Demo

- [ ] Demo URL responds.
- [ ] Backend liveness responds at `/api/v1/health/live`.
- [ ] Backend readiness responds at `/api/v1/health/ready`.
- [ ] Admin login works.
- [ ] Reservation login works.
- [ ] Accounts login works.
- [ ] Service Staff login works.
- [ ] Agent login works.
- [ ] Expected arrival is available.
- [ ] Checked-in stay is available.
- [ ] Room Rack has visible reservations.
- [ ] Folio has safe demo data.
- [ ] Night Audit Preview loads.
- [ ] Browser zoom is 100%.
- [ ] DevTools are closed.
- [ ] No test dialogs are open.

## If Something Fails

- Public booking unavailable -> demonstrate an existing confirmed reservation from Front Desk.
- Payment adapter unavailable -> explain the payment state and continue with an existing booking; do not claim a live payment.
- Room Rack empty -> change hotel/date range and show physical rooms plus current overlays.
- Night Audit cannot safely close -> demonstrate Preview only; do not close a real business day.
- Mutation failure -> move to a read-only module and continue the operational story.
- Role lands on an unauthorized page -> sign out, use the correct role landing route, and do not bypass route protection.

## Demo Safety Rules

- Use synthetic or approved demo data only.
- Do not expose `.env`, passwords, JWTs, API keys, or database credentials.
- Do not close a real business day merely for presentation.
- Do not cancel a real reservation or create uncontrolled maintenance blockers.
- Do not modify live rate inventory or tax configuration unless explicitly planned.
- Do not run destructive database commands against the hosted demo.

## Verification Results

All results below are from the current verification run on the disposable local PostgreSQL environment, plus the targeted Agent browser check.

Frontend unit: 107/107 PASS
Frontend browser E2E: 19/19 PASS after one isolated retry of the Images & Media test
Frontend typecheck: PASS
Frontend lint: PASS
Frontend build: PASS (77 static pages generated)

Backend unit: 343/343 PASS across 50 suites
Backend API E2E: 4/4 PASS
Backend PostgreSQL E2E: 6/6 PASS across 5 PostgreSQL suites with `RUN_DB_INTEGRATION=1`
Backend E2E total: 10/10 PASS across 7 suites
Backend typecheck: PASS
Backend lint: PASS
Backend build: PASS

Agent browser verification: PASS; Agent login reached `/rainwood/agent`, and direct access to `/rainwood/admin/dashboard` was protected and returned to the Agent portal.
Role browser matrix: PASS for SUPER_ADMIN, CORPORATE_ADMIN, ADMIN, RESERVATION, ACCOUNTS, VIEWER, and SERVICE_STAFF.
`git diff --check`: PASS

Core flow coverage included Public Booking, authoritative quote/hold, mock payment confirmation, admin navigation, Front Desk queues, Reservation 360 access, Room Rack planning, room assignment data, stay lifecycle, housekeeping concurrency, maintenance context, rate import, hotel setup forms, role landing/protection, expected arrivals pagination, document sequences, and Agent access.

## Release Handoff

Branch: `main`
Commit SHA: `701dc3c1586a922ea4fe4c2c779cc60b93335975`
Remote: `origin` (`https://github.com/kkversile/rainwood.git`)
Push status: YES
Upstream synchronized: YES
Ahead/behind after push: 0/0

`RAINWOOD_DEMO_GUIDE.md` is provided as a standalone root deliverable alongside the existing source archives. The existing `frontend-src.zip` and `backend-src.zip` were intentionally not changed or staged during this documentation verification task.
