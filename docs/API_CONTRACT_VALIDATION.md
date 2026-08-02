# API contract validation

Base URL: `http://localhost:4000/api/v1`

The frontend uses `frontend/src/lib/api.ts` as its only request client. It sends JSON with `credentials: include`, attaches the in-memory/session access token, refreshes once through the HTTP-only cookie on 401, and renders the backend `{ statusCode, error, message, path, correlationId, timestamp }` error shape.

## Frontend-consumed endpoints

| Frontend use | Method and path | Backend controller | Contract status |
|---|---|---|---|
| Public hotel listing | `GET /hotels` | `HotelsController.list` | MATCHED |
| Public hotel detail/SEO | `GET /hotels/:slug` | `HotelsController.detail` | MATCHED |
| Search | `GET /availability/search` | `AvailabilityController.search` | MATCHED; numeric query transforms enabled |
| Hold inventory | `POST /holds` | `HoldsController.create` | MATCHED |
| Create website reservation | `POST /reservations/from-hold/:token` | `ReservationsController.create` | MATCHED |
| Public confirmation summary | `GET /reservations/:reference` | `ReservationsController.get` | MATCHED; limited public fields |
| Payment order | `POST /payments/:reference/order` with `idempotency-key` | `PaymentsController.order` | MATCHED; amount is backend-owned |
| Local payment completion | `POST /payments/:reference/mock-complete` | `PaymentsController.mockComplete` | MATCHED only in mock mode |
| Staff session bootstrap | `POST /auth/refresh` | `AuthController.refresh` | MATCHED; cookie-based refresh |
| Staff login | `POST /auth/login` | `AuthController.login` | MATCHED |
| Dashboard | `GET /reports/dashboard` | `ReportsController.dashboard` | MATCHED and role protected |
| Reservation table | `GET /reservations?limit=100` | `ReservationsController.list` | MATCHED; server pagination |
| Payments table | `GET /reports/payments` | `ReportsController.payments` | MATCHED; server totals |
| Job table | `GET /jobs` | `JobsController.list` | MATCHED and admin protected |
| User table | `GET /users` | `UsersController.list` | MATCHED and DTO-protected writes |
| Audit table | `GET /audit-logs` | `AuditController.list` | MATCHED |
| Reports page | `GET /reports/reservations?limit=100` | `ReportsController.reservations` | MATCHED |

## Backend endpoint inventory

### Public/core booking

- `GET /health/live`, `GET /health/ready`, `GET /metrics`
- `GET /hotels`, `GET /hotels/:slug`
- `GET /availability/search`
- `POST /holds`, `GET /holds/:token`
- `POST /reservations/from-hold/:token`, `GET /reservations/:reference`
- `POST /payments/:reference/order`, `POST /payments/:reference/mock-complete`
- `POST /payments/webhooks/:provider`

### Authenticated operations

- Auth: login, refresh and logout
- Reservations: list/detail, cancellation and contact/instruction modification
- Manual reservations: POST /reservations/manual with a staff role and an existing hold token
- Payments: manual payment and payment verification
- Hotels: admin create/update
- Files: payment-proof upload and authorized download
- Vouchers: generate, email and download
- Reports: dashboard, reservations, arrivals, departures, payments, cancellations and CSV
- Jobs: list and manual retry
- Users, audit logs and reconciliation summary/enqueue

### External boundary

- `POST /axisrooms/inbound/inventory`
- `POST /axisrooms/inbound/rates`
- Outbound AxisRooms booking, modification and cancellation are durable outbox job types dispatched through the adapter rather than exposing provider payloads to the frontend.

## Serialization rules

- Dates are ISO date-only values for stay boundaries; the backend expands `[checkIn, checkOut)` into occupied nights.
- Money is server-calculated and may be serialized as numbers in public DTOs or Decimal strings in reservation/admin payloads; the frontend normalizes only for display.
- Enums match Prisma values, including `WEBSITE`, `PHONE`, `EMAIL`, `WHATSAPP`, `WALK_IN`, `AGENT`, `COMPANY`, and `OTA`.
- Multipart upload uses `POST /files/payment-proof`; server-side MIME, magic-byte, size and authorization checks remain authoritative.
- Webhooks are excluded from normal staff authentication but require provider-specific raw-body signature validation.
