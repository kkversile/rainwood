# Banquet, Function Space & BEO domain audit

This audit is the boundary for the banquet phase. Existing domains remain the system of record for their current responsibilities.

## REUSED

- `Hotel` and `Hotel.timezoneName` for property scope and hotel-local function scheduling.
- `User`, `UserRole`, `staffHotelId`, `StaffDepartment`, `getActorScope`, `assertActorCanManageHotel`, and `resolveRequestedHotel` for feature-local scope/RBAC.
- `GroupReservation`, `CorporateAccount`, and `BookingInquiry` as optional links; no duplicate group, corporate, or inquiry records.
- `DocumentSequence`/`nextDocumentNumber` for hotel/year scoped event and BEO numbers.
- `AuditLog`/`AuditService` for banquet lifecycle and operational changes.
- Existing Operations Logbook for explicit event/BEO follow-up links; BEO requirements are not logbook rows.
- Existing tax/finance services as the future authority for invoiceable charge estimates.

## EXTENDED

- `DocumentSequenceType` gains banquet event and BEO sequence types.
- `GroupReservation` gains a relation to linked banquet events for a compact Events section.
- `CorporateAccount`, `BookingInquiry`, and `User` gain only the required banquet relations.
- Existing admin navigation and shell gain the Banquets & Events workspace links.

## NEW

- `FunctionSpace`: hotel-scoped, typed, capacity-aware, active/out-of-service venue master.
- `BanquetEvent`: event master and lifecycle, with optional Group/Inquiry/Corporate/Agent links.
- `BanquetFunction`: date/time/space schedule, local date/time plus UTC instants, overlap-safe booking.
- `BanquetEventOrder` (one per function): draft/final BEO, schedules, structured requirements, and estimate lines.
- Banquet API, admin event list/detail/calendar, function-space setup, print view, and focused tests.

## DEFERRED

- Turnover buffers and automatic setup/teardown padding.
- Restaurant POS, recipes, kitchen production, bar stock, food cost, and menus.
- A master banquet invoice, automatic merging into room folios/corporate receivables, and independent event payment accounting until the existing finance model can support it cleanly.
- Immutable BEO revision documents; the first phase reopens FINAL to DRAFT and retains audit history.
- Automatic logbook entries for requirements and broad front-desk row changes.
- Treating function spaces as bedroom inventory or creating a second maintenance-ticket system.
