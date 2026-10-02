# RainWood PMS Demo Guide

Verified source commit: pending release commit
Branch: `main`
Verification date/time: 2026-10-02 16:28 Asia/Calcutta
Demo environment: `https://demo.dhisoft.in/rainwood` (read-only smoke target); local verification uses `http://localhost:3001/rainwood`

Use configured demo credentials from the local environment. They are intentionally not reproduced in this guide.

## Recommended Demo Length

- 5-minute quick demo: management overview and one operational story.
- 10-minute standard demo: guest booking through front desk and Room Rack.
- 20-minute full demo: add folio, housekeeping, maintenance, reporting, and role boundaries.

## 5-Minute Demo

### 1. Admin Dashboard

Where: sign in at `/rainwood/login`, then open Dashboard.

Show: hotel context, operational summary, and the Operations command bar.

Say: “RainWood brings commercial, front-office, and operational information into one hotel-scoped workspace.”

Expected result: the authorized dashboard loads without an Unauthorized state.

### 2. Front Desk

Where: Admin → Operations → Front Desk.

Show: Arrivals, In-house, Departures, and Exceptions queues.

Say: “The front desk works from operational queues, while Reservation 360 keeps the complete guest context in one reusable workspace.”

Expected result: queue tabs and URL state remain stable when switching views.

### 3. Reservation 360

Where: open an arrival or reservation reference.

Show: Overview, Stay & Room, Folio, Guest, and Timeline tabs.

Say: “The same Reservation 360 workspace is reused by Front Desk and Room Rack, so staff do not learn two competing detail screens.”

Expected result: the drawer opens, loads the reservation, and closes back to the previous queue or rack state.

### 4. Room Rack

Where: Admin → Operations → Room Rack.

Show: physical rooms on rows, reservation blocks across dates, the Unassigned lane, and current housekeeping/maintenance overlays.

Say: “RainWood separates sellable room-type inventory from physical-room assignment. This board shows which guest is planned into which physical room without changing the rate or inventory engine.”

Expected result: assigned stays render on physical rooms, genuine gaps appear in Unassigned, and historical checked-out assignments are not mistaken for current gaps.

### 5. Folio / Checkout

Where: Reservation 360 → Folio.

Show: authoritative reservation balance, incidental charges, payments, and settlement status.

Say: “Financial totals come from the server-authoritative folio and settlement workflow.”

Expected result: the folio refreshes after an authorized demo action. Use Preview when a live business-day close is not intentionally prepared.

### 6. Night Audit

Where: Admin → Night Audit.

Show: Preview, warnings, blockers, and the review step.

Say: “Night Audit closes the hotel business day and preserves an historical snapshot rather than recalculating history from today’s data.”

Expected result: Preview is safe to show. Do not close a real business date merely for a presentation.

## 10–15 Minute Standard Demo

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
Check-in
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

Speaking script:

1. Start with Public Booking to show hotel, dates, occupancy, availability, hold, guest-safe fields, and demo payment.
2. Move to Front Desk to show the arrival queue and open Reservation 360.
3. Move to Room Rack to explain the difference between physical rooms and sellable room types.
4. Show Expected, Checked In, and Checked Out stay filters plus the 7/14/30-day controls.
5. Show current HK and maintenance overlays without implying historical operational status.
6. Return to Reservation 360 for Folio and a safe permitted charge demonstration if the disposable/demo workflow is prepared.
7. Finish with Checkout or Night Audit Preview, depending on the prepared data.

## ASCII System Overview

```text
                         RAINWOOD PMS
                              |
        +---------------------+---------------------+
        |                     |                     |
        v                     v                     v
  Guest Booking          Hotel Operations       Agent Portal
        |                     |                     |
        v                     v                     v
 Availability           Front Desk             Availability
        |                     |                     |
        v                     +--------+            v
       Hold                            |          Booking
        |                              |
        v                              v
     Payment                      Reservation 360
        |                              |
        v                 +------------+------------+
   Reservation            |            |            |
                          v            v            v
                     Room Rack       Folio      Guest CRM
                          |            |
                          v            v
                     Room Ops      Settlement
                          |            |
                    +-----+-----+      v
                    |           |   Checkout
                    v           v
               Housekeeping Maintenance
                                     |
                                     v
                                 Night Audit
```

## ASCII Public Booking Flow

```text
Home
 |
 v
Hotel + Dates + Occupancy
 |
 v
Availability
 |
 v
Room / Rate
 |
 v
Inventory Hold
 |
 +------ expires ------> Recheck Availability
 |
 v
Guest Details
 |
 v
Payment
 |
 v
Reservation Confirmed
```

The public journey uses server-authoritative availability/pricing, separate adults and children, a temporary inventory hold, and guest-safe fields only.

## ASCII Reservation Lifecycle

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
        | Room change possible
        | Charges / Payments / Folio
        v
CHECKED_OUT

No-show is a separate stay outcome and is not normal physical-room occupancy.
```

## ASCII Front Desk Flow

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
                 Reservation 360
                        |
        +---------------+---------------+---------------+---------------+
        |               |               |               |               |
        v               v               v               v               v
    Overview        Stay & Room       Folio           Guest          Timeline
```

Authorized quick actions include Assign Room, Check In, Change Room, Post Charge, Record Payment, and Checkout.

## ASCII Room Rack Diagram

```text
ROOM RACK — 02 OCT → 06 OCT

Room      02      03      04      05      06
------------------------------------------------
201      [ Ravi Kumar  RW-1042 -------- ]
202              [ Priya RW-1051 ------ ]
203      AVAILABLE
204      OUT OF ORDER
205      [ Amit ------------------------ ]

UNASSIGNED
------------------------------------------------
RW-1060 · Suresh · Deluxe · 03–05 Oct
RW-1068 · Maya   · Suite  · 04–06 Oct
```

Room Rack means physical-room planning. Rates and inventory mean sellable room-type inventory.

## ASCII Housekeeping / Maintenance Flow

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
PENDING → ACCEPTED → CLEANING → COMPLETED
                                  |
                                  v
                            Room AVAILABLE
```

```text
Maintenance issue
      |
      v
Ticket
      |
      +---- requires OOO? ---- YES ----> OUT OF ORDER
      |                                 |
      |                                 v
      +----------------------------> Resolved
                                        |
                                        v
                         AVAILABLE only when blockers clear
```

## ASCII Finance Flow

```text
Reservation / Stay
       |
       v
Room Charges
       |
       +---- Incidental Charges
       |
       v
Folio
       |
       +---- Payments
       |
       v
Settlement
       |
       +---- Outstanding authorization if required
       |
       v
Checkout
       |
       v
Invoice / Credit Note / TDS as applicable
       |
       v
Night Audit Snapshot
```

## Role Demo Matrix

| Persona | Login URL | Landing page | Demonstrate | Do not expect |
|---|---|---|---|---|
| Public Guest | `/rainwood/booking` | Booking flow | Hotel search, availability, hold, guest details, demo payment | Internal notes, staff-only fields, admin navigation |
| SUPER_ADMIN | `/rainwood/login` | `/admin/dashboard` | Organization visibility, hotels, operations, finance, Night Audit, system administration | No restriction to one property |
| CORPORATE_ADMIN | `/rainwood/login` | `/admin/dashboard` | Multi-property dashboard, operations, rates, promotions, guests, reports | SUPER_ADMIN-only site settings |
| ADMIN | `/rainwood/login` | `/admin/dashboard` | Hotel dashboard, Front Desk, Room Rack, Arrivals, In-house, folio, housekeeping, maintenance | Other hotels outside assigned scope |
| RESERVATION | `/rainwood/login` | `/admin/arrivals` | New reservation, authoritative quote/hold, arrivals, search, Room Rack where authorized | System administration and unrestricted finance mutation |
| ACCOUNTS | `/rainwood/login` | `/admin/cashier` | Cashier, payments, expenses, tax invoices, credit notes, TDS, reports | New Reservation and operational mutation controls |
| VIEWER | `/rainwood/login` | `/admin/reports` | Reports and read-only information | New Reservation, check-in, checkout, payment, room mutation |
| SERVICE_STAFF | `/rainwood/staff/login` | `/staff` | Assigned stays, room/stay search, permitted service charge, housekeeping context | Admin navigation and unrelated departments |
| AGENT | `/rainwood/agent/login` | `/agent` | Assigned hotels/rates, availability, booking history, agent reports/settings | Admin navigation and other agents’ scope |

## Role-Specific Demo Steps

### SUPER_ADMIN

1. Sign in → Dashboard.
2. Show hotel/organization visibility.
3. Open Manage Hotels, Rooms, Room Rack, Front Desk, Reservations, Rates, Promotions, Housekeeping, Maintenance, Guests, Finance, Night Audit, and Users as needed.
4. Open and close Reservation 360 from Room Rack.

Presenter line: “This is the broad operational and system-admin view, while all financial and lifecycle actions remain guarded by backend authorization.”

### CORPORATE_ADMIN

1. Sign in → Dashboard.
2. Show multi-property context and Reports.
3. Open Front Desk, Room Rack, Rooms, Housekeeping, Maintenance, Rates, Promotions, Guests, and Finance.

Presenter line: “Corporate administration can work across authorized properties without receiving SUPER_ADMIN-only configuration controls.”

### ADMIN

1. Sign in → Dashboard.
2. Open Front Desk → an arrival → Reservation 360.
3. Open Room Rack and preserve the context while viewing the reservation.
4. Show Arrivals, In-house, Folio, Housekeeping, Maintenance, and Night Audit Preview.

Presenter line: “The property team can move from arrival to physical room to folio without leaving the hotel workspace.”

### RESERVATION

1. Sign in → Expected Arrivals.
2. Open Reservations → New Reservation.
3. Enter guest/stay inputs, request authoritative availability and price, review the hold/quote, then create only when the disposable/demo workflow is prepared.
4. Verify that changing dates, room, rate plan, or PAX invalidates the prior quote.

Presenter line: “Reservation staff work from authoritative quotes and hotel scope; they do not bypass inventory or settlement rules.”

### ACCOUNTS

1. Sign in → Cashier Shift.
2. Show Payments, Expenses, Tax Invoices, Credit Notes, TDS, Reports, and authorized corporate/accounting views.
3. Demonstrate that New Reservation and reservation command search are not exposed.

Presenter line: “Accounts sees financial workflows without inheriting front-office or room-mutation permissions.”

### VIEWER

1. Sign in → Reports.
2. Open read-only reports and tax/reporting views.
3. Verify that New Reservation, check-in, checkout, payment mutation, and room mutation controls are absent.
4. Directly request an unauthorized route to confirm backend/UI protection.

Presenter line: “Viewer access is fail-closed and read-only; hidden navigation is backed by route authorization.”

### SERVICE_STAFF

1. Use Staff Login → assigned staff landing.
2. Search by room, guest, or reservation.
3. Open the stay/folio and use only permitted service-item/charge actions.
4. Verify hotel and department scope and refreshed totals.

Presenter line: “Staff PWA access is scoped to the assigned hotel and department, without admin navigation.”

### AGENT

1. Use Agent Login → Agent Dashboard.
2. Show assigned rate plans and hotel availability.
3. Open booking history and agent reports/settings where available.
4. Keep agent-specific references and payment terms visible only in the agent context.

Presenter line: “Agents see the commercial access granted to their account, not the hotel’s internal operations console.”

## What to Say

- “RainWood keeps sellable inventory and physical-room assignment separate.”
- “All financial totals shown during checkout come from server-authoritative settlement calculations.”
- “Room assignment and room changes are transactional and preserve assignment history.”
- “Housekeeping and maintenance affect room readiness without bypassing front-office controls.”
- “Night Audit closes the hotel business day and stores historical snapshots.”
- “Role routing is fail-closed and hotel scope is enforced by the backend.”

## 15 Minutes Before Demo

- [ ] Demo URL responds.
- [ ] Backend readiness endpoint responds.
- [ ] Admin login works.
- [ ] Reservation login works.
- [ ] Accounts login works.
- [ ] Service Staff login works.
- [ ] Agent login works.
- [ ] Demo hotel is selected.
- [ ] At least one expected arrival exists.
- [ ] At least one checked-in stay exists.
- [ ] Room Rack has visible data.
- [ ] A safe demonstration folio is prepared.
- [ ] No test modal or error is left open.
- [ ] Browser zoom is 100%.
- [ ] DevTools are closed.

## If Something Fails During the Demo

- Public booking unavailable: go directly to Front Desk and demonstrate an existing reservation.
- Payment adapter unavailable: explain the payment state and continue with an existing confirmed reservation.
- Room Rack empty: change the hotel/date range and show physical rooms plus current overlays.
- Night Audit cannot safely close: show Preview only; do not close a real business day.
- A role lands on an unauthorized page: sign out, use the correct role landing URL, and do not bypass the route guard.

## Do Not Do During Demo

- Do not close a real hotel business date unless intentionally prepared.
- Do not create uncontrolled maintenance blockers.
- Do not cancel a real reservation.
- Do not expose `.env` or configured demo credentials.
- Do not modify tax configuration.
- Do not modify live rate inventory unless planned.
- Do not run destructive database commands.
- Do not use production/staging data for mutation-heavy testing.

## Verification Results

Final local verification used the disposable PostgreSQL instance and the local Chrome/Playwright environment.

- Frontend unit: 107/107 PASS
- Frontend browser E2E: 19/19 PASS
- Backend unit: 343/343 PASS across 50 suites
- Backend PostgreSQL E2E: 10/10 PASS across 7 suites
- Frontend typecheck: PASS
- Backend typecheck: PASS
- Frontend lint: PASS
- Backend lint: PASS
- Frontend build: PASS
- Backend build: PASS
- `git diff --check`: PASS before release staging

The seeded Room Rack browser workflow covered assigned Expected, Checked In, unassigned, historical Checked Out, housekeeping/maintenance overlays, Reservation 360 open/close, filters, date ranges, and mobile fallback. Public Booking covered search, hold, guest details, policy acceptance, demo payment, confirmation, and exclusion of internal staff fields.

## Known Demo Notes

- The configured Git repository has no detected GitHub Actions, deployment manifest, or other automatic deployment workflow in this checkout. A normal Git push therefore does not by itself prove that the hosted demo has updated.
- The full mutation-heavy verification is local/disposable. The hosted demo smoke check is read-only and should not be used for uncontrolled data creation.
- Use Night Audit Preview during a presentation unless a business date was deliberately prepared for closure.

## Release Handoff

The release commit and push result are recorded in the final assistant handoff after staging review. This document contains no credentials, JWTs, API keys, database secrets, or private tokens.
