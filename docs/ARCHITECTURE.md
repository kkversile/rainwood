# Architecture

    RainWood website / Next.js booking UI
                    |
                    v
             NestJS REST API
        +-----------+-------------+
        |           |             |
     Booking     Payments      Reports/Admin
        |           |             |
        +-----------+-------------+
                    |
                PostgreSQL
                    |
         AxisRooms integration adapter
            inbound ARI / outbound booking

## Bounded modules

- Hotels: published hotel/room/rate-plan content and external mapping.
- Availability: date-wise inventory/rates and restriction enforcement.
- Holds: deterministic PostgreSQL locks, expiring temporary inventory and atomic conversion.
- Reservations: website/manual sources, guest details, state transitions, snapshots and versions.
- Payments: provider/manual payments, signed webhooks and independent payment state.
- Reports: server-side filters, totals, arrivals, departures, payments and cancellations.
- Jobs: transactional outbox, SKIP LOCKED claims, retries, leases and dead letters.
- AxisRooms: anti-corruption adapter so provider payloads do not leak into core booking logic.

## State separation

    Reservation: DRAFT -> HELD -> PENDING_PAYMENT -> CONFIRMED -> CANCELLED/COMPLETED
    Payment:     UNPAID -> PENDING -> PARTIALLY_PAID -> PAID -> REFUND_PENDING/REFUNDED
    Sync:        NOT_REQUIRED/PENDING -> PROCESSING -> SYNCED/RETRY/FAILED/MANUAL_ACTION_REQUIRED

A confirmed payment and successful AxisRooms sync are separate facts and remain visible independently.

## Deployment boundary

The frontend and backend are deployed as separate Node applications. PostgreSQL runs directly on the host or a managed PostgreSQL service. Nginx, PM2/systemd, backup and log-rotation examples belong in the native deployment runbook; Docker is intentionally not part of this project.
