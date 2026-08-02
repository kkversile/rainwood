# RainWood Initial Repository Audit

Audit date: 2026-08-01  
Audit scope: repository contents before implementation changes  
Workspace: `C:\projects\rainwood`

## Executive summary

RainWood contains two independent applications with a plausible high-level shape: a Next.js App Router frontend, a NestJS/Prisma backend, a PostgreSQL schema, and several named modules. It is not yet a complete integrated reservation system. The backend is mostly a compact proof-of-concept, while much of the frontend is static presentation content. There is no migration baseline, no backend E2E test directory, no frontend test setup, and no working public booking flow.

The highest-risk findings are the missing database migration and local environment, unsafe/incomplete inventory state transitions, unauthenticated or over-permissive payment and reservation endpoints, direct hardcoded frontend data, incomplete authentication security, and the lack of executable end-to-end validation.

## Actual repository structure

```text
rainwood/
  backend/
    .env.example
    nest-cli.json
    package.json
    prisma/
      schema.prisma
      seed.ts
      sql/post_deploy_constraints.sql
    src/
      app.module.ts
      main.ts
      common/
      modules/
        audit/
        auth/
        availability/
        axisrooms/
        files/
        health/
        holds/
        hotels/
        jobs/
        payments/
        reconciliation/
        reports/
        reservations/
        users/
        vouchers/
  database/
    README.md
    create_database.sql
    post_deploy_constraints.sql
  docs/
    ARCHITECTURE.md
    PRODUCTION_IMPLEMENTATION.md
  frontend/
    .env.example
    next.config.ts
    package.json
    src/
      app/
      components/Shell.tsx
      lib/api.ts
  install-linux.sh
  install-windows.bat
  package.json
  README.md
```

The repository contains 96 non-hidden project files at audit time. There is no `.git` directory in the workspace. There are no installed dependency trees, lockfiles, Prisma migrations, or backend `test/` directory in the initial repository.

## Versions and local prerequisites

Declared requirements and dependencies:

| Area | Finding | Severity |
|---|---|---|
| Node.js | README requires Node 20 LTS or newer; installed Node is `v24.18.0`. The package ranges should be validated against this runtime. | MEDIUM |
| npm | Installed npm is `11.16.0`; PowerShell `npm.ps1` execution is blocked, but `npm.cmd` is available. | MEDIUM |
| Frontend | Next `^15.1.6`, React `^19.0.0`, TypeScript `^5.7.3`. | LOW |
| Backend | NestJS `^11`, Prisma/Client `^6.3.1`, TypeScript `^5.7.3`, Jest `^29.7.0`. | LOW |
| PostgreSQL | A PostgreSQL 17 Windows service is running. `psql.exe` is installed under `C:\Program Files\PostgreSQL\17\bin` but is not on PATH; port reachability still requires verification. | HIGH |
| Database | `DATABASE_URL` is only present in the example file; no local backend `.env` exists at audit time. | BLOCKER |

The project has no `.nvmrc`. A compatible stable Node version will be selected after dependency installation and runtime checks; the existing Node 24 installation will not be assumed compatible until builds and tests prove it.

## Existing backend modules

The NestJS application registers modules for common services, authentication, hotels, availability, holds, reservations, payments, reports, AxisRooms, files, vouchers, jobs, health, users, audit, and reconciliation. The module graph is syntactically compact and appears free of an obvious circular dependency, but most controllers accept `any` payloads and most module boundaries lack validation and policy enforcement.

The Prisma schema models users and refresh tokens; hotels, rooms, rate plans, inventory and rates; holds; reservations and lines; payments, attempts and webhook events; AxisRooms sync logs; outbox jobs; stored files; vouchers; audit logs; cancellations; and modifications. This is a useful baseline but does not match all requested state and policy concepts.

## Existing frontend routes

Public routes include `/`, `/hotels`, `/hotels/[slug]`, `/booking`, `/contact`, `/policies`, and `/login`. Admin presentation routes exist for dashboard, reservations, payments, reports, AxisRooms, jobs, users, and audit logs. The pages are mostly Server Components with static arrays and non-functional HTML forms. No protected route boundary or API-backed client workflow exists.

## Severity-ranked findings

### BLOCKER

1. **No Prisma migration baseline or migrations directory.** The README instructs a developer to run `prisma migrate dev`, but the repository cannot be installed reproducibly from source and there is no reviewed migration to deploy. `prisma db push` is not an acceptable production substitute.
2. **No local environment files and no validated database connection.** The backend cannot start against the intended database without creating `.env`; the frontend example variable does not match the requested/public API variable name used by the implementation.
3. **The public booking flow is not implemented.** Search, hold, guest submission, payment order, webhook completion, confirmation, voucher access, and expiry/error recovery are not wired through the frontend.
4. **Frontend hotel data is hardcoded and inconsistent with the seeded database.** The UI advertises three properties while the seed creates one different hotel. Public content therefore cannot be trusted as real availability or SEO content.
5. **The project has no executable frontend tests, E2E tests, or backend E2E test configuration directory.** Current backend tests only assert string literals and do not exercise application behavior.

### CRITICAL

1. **Inventory conversion is not safely locked or revalidated.** Reservation creation reads an active hold without locking it, updates inventory with an unchecked `updateMany`, and can race expiry or duplicate conversion. It does not verify that every expected night was updated.
2. **Cancellation is not idempotent or transactionally serialized around the reservation.** It reads outside the transaction, can create multiple cancellation records, decrements inventory without guarded quantities, uses only the first line for penalty calculation, and can produce negative inventory or duplicate restoration.
3. **Availability logic applies CTA and CTD to every night, does not enforce CTD/arrival conventions, max LOS, occupancy, past-date policy, or adult/child rules, and returns only a total rather than a complete server-side per-night price breakdown.**
4. **Payment confirmation can be over-permissive.** Manual payment requests accept a client-supplied `verified` flag from any authenticated role; order creation is unauthenticated; payment amount and currency are not fully revalidated against the attempt; and the mock webhook is accepted without a signed test-event contract.
5. **Reservation and payment state machines are not enforced.** Any status can be written through service logic; required statuses such as `DRAFT`, `HELD`, `NO_SHOW`, `COMPLETED`, `PENDING`, `PARTIALLY_REFUNDED`, and `MANUAL_ACTION_REQUIRED` are absent or represented inconsistently.
6. **Authentication is incomplete for production use.** Refresh tokens are returned for frontend storage rather than an HTTP-only cookie strategy, refresh rotation is not one atomic operation with `replacedById` or reuse audit, there is no login throttling, no password-reset foundation, no all-device logout endpoint, no permission model beyond roles, and no authentication audit events.
7. **Public reservation detail exposes reservation, guest, payment, synchronization, voucher, cancellation, and modification data without authentication.**
8. **Database constraints do not protect the full inventory invariant.** The check constraint is useful, but the application performs unchecked decrements and the schema has no reservation-room-night/date-level persistence, no unique cancellation/idempotency key, and no explicit version/concurrency safeguards for reservation edits.
9. **AxisRooms endpoints and inbound updates are not authenticated or validated.** Live configuration uses `AXISROOMS_API_KEY` even though the example file provides username/password. Booking, modification, and cancellation use one generic path, and no official payload certification boundary is enforced.
10. **Voucher/email behavior is incomplete.** Voucher generation omits room, rate, occupancy, tax, source, policy, and version details; version calculation is race-prone; `SMTP_MODE=log` is not implemented; email is synchronous and not an outbox job; and no safe download endpoint exists.

### HIGH

1. Global validation uses `whitelist` and `transform` but not `forbidNonWhitelisted`; controllers use `any` DTOs, allowing contract drift and unsafe input.
2. CORS uses `origin: true` with credentials, which reflects arbitrary origins. There are no configured request-size limits, correlation-ID middleware, structured logging, or production exception redaction.
3. Configuration has no schema validation, uses inconsistent names (`PORT`/`API_PORT`, `HOLD_EXPIRY_MINUTES`/`HOLD_MINUTES`, `STORAGE_PATH`/`STORAGE_LOCAL_PATH`, `JWT_REFRESH_EXPIRES_IN`/`JWT_REFRESH_TTL_DAYS`), and does not validate secure secrets.
4. The payment webhook event is not persisted before all processing can fail; failed processing attempts, last error, checksum, provider event type, and retry state are absent. Unknown-order failures roll back the event record, weakening operational replay handling.
5. Outbox worker recovery for abandoned `PROCESSING` jobs is missing. Job leasing is not transactionally isolated from execution, email/payment reconciliation jobs are incomplete, and completed job idempotency is not consistently enforced.
6. File storage trusts the supplied MIME type, has no magic-byte validation, no safe download authorization, and `read()` accepts a path that is not normalized/contained explicitly. Missing-file upload handling is not safe.
7. AxisRooms sync does not persist all request/response outcomes into the sync log, does not validate all mappings before push, and lacks retry/manual-action/reconciliation semantics required by the brief.
8. Reports expose only dashboard and arrivals, without filters, authorization, pagination, totals, exports, timezone policy, or the required report families.
9. Admin routes have no authentication boundary and display hardcoded operational records and metrics. The dashboard also calls an unprotected backend report endpoint.
10. Frontend forms are not client components and do not submit to the API. Login does not authenticate, admin actions do not mutate data, and there are no loading, error, empty, expired-hold, or payment-recovery states.
11. SEO dynamic hotel metadata is derived from a slug rather than backend published content. The hotel detail page is hardcoded, the sitemap does not include database hotel slugs, `next/image` is not used, and there is no `not-found` handling.
12. Several source files contain UTF-8 mojibake (`â‚¹`, `â€“`, `Â·`), degrading customer-facing text and PDFs.
13. `npm run lint` is configured as `next lint`, which is not available in current Next.js 15 workflows; there is no frontend `typecheck` or `test` script and no backend `typecheck` script.
14. Database setup SQL always attempts to create the role and database, is not safely rerunnable, and embeds the example password in source. It needs a documented/idempotent local workflow without exposing real credentials.

### MEDIUM

1. The schema has no hotel images, amenities, policies, cancellation rule tables, tax/charge models, company/agent models, room-night snapshots, waitlist, reconfirmation, or explicit reservation audit/version snapshot structure beyond JSON fields.
2. Rate and inventory dates are stored as PostgreSQL `date`, but input parsing uses JavaScript `Date` without a single documented timezone/date-only utility. Report arrival filtering compares date columns to a current timestamp.
3. No explicit pagination or maximum query limits exist on reservations, audit logs, or operational data beyond a few hardcoded `take` values.
4. Seed data is not fully idempotent for all required content, does not create roles/permissions, mappings beyond nullable IDs, policies, test payments/reservations, or an explicitly safe test password workflow. It logs the seeded password in plaintext (not a hash), which is acceptable only for a local demo and should be handled carefully.
5. The root install scripts do not use the required independent npm workflow robustly on Windows and do not create/validate environments, migrations, constraints, or seed state.
6. There is no native Nginx/PM2/systemd/backup/log-rotation deployment documentation despite the production-oriented README claims.

### LOW

1. The root package scripts are minimal and omit frontend lint/typecheck/build/test convenience commands.
2. Swagger is mentioned in the README but is not configured in `main.ts`.
3. The architecture and production implementation documents contradict the current no-Docker requirement by describing Docker production images and claim more implementation than the code currently contains. These documents require correction after implementation.

## Existing API contract snapshot

Implemented controller paths before repair:

| Method | Path | Current status |
|---|---|---|
| POST | `/api/v1/auth/login` | Any-body login; returns bearer access and refresh tokens in JSON |
| POST | `/api/v1/auth/refresh` | Body refresh token; rotates a token record but no cookie strategy |
| POST | `/api/v1/auth/logout` | Single-token revocation only |
| GET | `/api/v1/hotels` | Active hotels, but with sparse static schema |
| GET | `/api/v1/hotels/:slug` | Does not filter inactive hotel on detail |
| GET | `/api/v1/availability/search` | Query-based, under-validated search |
| POST/GET | `/api/v1/holds`, `/api/v1/holds/:token` | Hold creation/read; public and under-validated |
| POST | `/api/v1/reservations/from-hold/:token` | Public reservation creation from hold; incomplete locking/state rules |
| GET | `/api/v1/reservations` | JWT-protected list |
| GET | `/api/v1/reservations/:reference` | Public detail leak |
| POST/PATCH | `/api/v1/reservations/:reference/cancel`, `/:reference` | JWT-protected but incomplete cancellation/modification workflows |
| POST | `/api/v1/payments/:reference/order` | Unauthenticated order creation |
| POST | `/api/v1/payments/:reference/manual` | JWT-protected but verification over-permissive |
| POST | `/api/v1/payments/webhooks/:provider` | Raw-body capable but incomplete provider/idempotency processing |
| POST | `/api/v1/files/payment-proof` | JWT upload with basic size/MIME filter |
| POST | `/api/v1/vouchers/reservation/:id` | JWT generation; no authorization granularity/download |
| POST | `/api/v1/vouchers/:id/email` | JWT synchronous SMTP send |
| POST | `/api/v1/axisrooms/inbound/inventory`, `/inbound/rates` | Public inbound mutation endpoints |
| GET/POST | `/api/v1/jobs`, `/jobs/:id/retry` | Admin-protected outbox list/retry |
| GET | `/api/v1/reports/dashboard`, `/reports/arrivals` | Public, minimal report data |
| GET/POST/PATCH | `/api/v1/users...` | Admin-protected basic CRUD |
| GET | `/api/v1/audit-logs` | Admin/viewer protected list |
| GET/POST | `/api/v1/reconciliation/summary`, `/enqueue` | Admin/accounts protected operational endpoints |
| GET | `/api/v1/health/live`, `/health/ready`, `/metrics` | Health and Prometheus endpoints |

The definitive repaired inventory will be written to `docs/API_CONTRACT_VALIDATION.md`.

## Initial implementation conclusion

The project requires a substantial but scoped completion pass. The implementation must preserve the two-app layout and PostgreSQL-hosted architecture while adding the missing migration/environment workflow, typed validation, safe state transitions and inventory transactions, real public API wiring, auth boundaries, mock-mode payment/AxisRooms behavior, outbox reliability, storage/voucher handling, tests, and operational documentation. External merchant credentials and official AxisRooms specifications remain certification dependencies and cannot be truthfully supplied by local code.
