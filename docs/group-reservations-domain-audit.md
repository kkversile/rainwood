# Group Reservations Domain Audit

## ALREADY REUSABLE

- `Reservation`, `ReservationLine`, and `ReservationRoomNight` remain the authoritative individual-stay records.
- `InventoryDay` is the authoritative room-type/date inventory ledger; existing `held` and `sold` accounting, row locking, and serializable transactions are reused.
- `AvailabilityService.quoteSelection` remains the authoritative quote, rate-plan, promotion, corporate-rate, and tax path.
- `AuditLog`, `Hotel`, `RoomType`, `RatePlan`, `CorporateAccount`, `User` (including agent users), physical rooms, Room Rack, Front Desk, Arrivals, and Reservation 360 remain shared domains.
- Existing authentication, hotel scope, RBAC guards, date-only helpers, ExcelJS dependency, and admin shell/navigation are reused.

## NEEDS EXTENSION

- `InventoryDay` gains a separate `groupBlocked` commitment count. Confirmed blocks reduce sellable availability through the existing availability calculation; pickup transfers commitment from `groupBlocked` to `sold` without double deduction.
- `Reservation` gains an optional group relation so pickup reservations continue to use normal references and lifecycle workflows while exposing group context.
- The safe post-login route allowlist is reconciled with the existing Reservation navigation for Front Desk, Room Rack, and Operations Logbook.

## NEW

- Group master, controlled group status/type/billing enums, nightly room blocks, and rooming-list entries.
- Group endpoints and admin workspace for overview, block confirmation, release, rooming-list validation, and reservation pickup.
- Server-side unique group-code generation, capacity safeguards, hotel scope checks, and idempotent rooming-list pickup.

## DEFERRED

- Automatic scheduled cutoff jobs (explicit release is provided).
- Consolidated master folio / payment settlement and agent self-service group management.
- Physical-room assignment on the group page; linked reservations continue through Room Rack / Front Desk.
- Banquet, conference, BEO, transport, seating, and other event-management modules.
