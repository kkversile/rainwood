# RainWood implementation report

Date: 2026-08-01/02 local validation window

## Outcome

The separate Next.js frontend and NestJS backend now install independently, use PostgreSQL through Prisma migrations, expose a real versioned API, and pass the local unit, API E2E, frontend, and Playwright gates in `CODEX_TEST_REPORT.md`. Local payments and AxisRooms use explicit mock adapters; no external certification is claimed.

## Material issues and resolutions

| Severity | Root cause | Resolution | Security/database/compatibility impact |
|---|---|---|---|
| BLOCKER | Prisma schema was compact/invalid and there were no migrations or seed path. | Replaced it with a reviewed relational schema, generated baseline and post-deploy migrations, added idempotent seed data and validated with Prisma. | Adds foreign keys, uniqueness, checks and indexes; existing empty development databases need migrations. |
| CRITICAL | Holds and reservation conversion had no reliable database serialization. | Added deterministic row locking, serializable retry, stale-hold expiry, guarded counters, atomic hold conversion, and concurrency E2E coverage. | Prevents oversell and negative held/sold counts; uses PostgreSQL row locks and `40001` retries. |
| CRITICAL | Payment state could be trusted from a client callback and duplicate webhooks could create duplicate attempts. | Added provider abstraction, backend amount calculation, signed mock/Razorpay events, raw-body validation, event ledger, idempotency and transaction-safe payment recalculation. | Secrets stay server-side; repeated events are safe. Live Razorpay still needs merchant configuration. |
| CRITICAL | Refresh tokens were not a complete rotation/reuse policy. | Added HTTP-only refresh cookie, hashed token storage, family tracking, rotation, reuse-family revocation, session revocation and generic login failures. | Long-lived refresh tokens are not placed in localStorage; production must use HTTPS and CSRF policy appropriate to deployment. |
| HIGH | Reservation status, cancellation and modification behavior was implicit. | Added explicit transition policy, policy snapshots, idempotent cancellation, exact inventory restoration, versioned contact modifications, and rejection of unsafe inventory-affecting direct edits. | Confirmed room nights are not overwritten casually; cancellation creates refund and sync work. |
| HIGH | Background work had no durable outbox/lease semantics. | Added transactional outbox jobs, `SKIP LOCKED` claiming, worker identity, lease recovery, retries, exponential backoff, dead-letter state and manual retry. | A failed voucher/email/sync job does not roll back a confirmed reservation. |
| HIGH | Uploaded files and vouchers lacked a safe lifecycle. | Added local storage abstraction, randomized keys, size/MIME/magic-byte checks, SHA-256 metadata, authorization, branded PDF vouchers and SMTP log mode. | Only PDF/PNG/JPEG payment proof is accepted; object storage remains a deployment dependency. |
| HIGH | Frontend was largely static and API contracts were scattered. | Added one API client, refresh handling, live hotel/availability/hold/payment flow, protected admin data components, loading/error/empty states, and server-rendered SEO hotel pages. | Access tokens are short-lived and stored only in memory/sessionStorage; refresh uses an HTTP-only cookie. |
| HIGH | Dependency installation under Node 24 failed on native bcrypt. | Replaced native `bcrypt` with `bcryptjs`, regenerated lockfiles, and documented Node 22 as the project baseline. | No native bcrypt build dependency; password hashing remains cost 12. |
| MEDIUM | High dependency advisories were present. | Upgraded Nodemailer to 9.0.3, Next to 16.2.12, and pinned patched `postcss`/`sharp` overrides. Both high-severity audits report zero vulnerabilities. | Next build remains App Router/Turbopack compatible; lockfiles record resolved versions. |
| MEDIUM | Admin/user update bodies were unvalidated and readiness returned an unclassified database error. | Added DTO validation for hotel/user updates and a 503 readiness response for database failure. | Global whitelist/forbid-non-whitelisted validation rejects unexpected fields. |
| HIGH | The hold conversion endpoint accepted non-website source values without a staff boundary. | Restricted the public route to WEBSITE and added a role-protected POST /reservations/manual route that records the creating staff user. | Manual source attribution is now authorization-controlled and auditable. |
| LOW | Initial UI/docs contained stale boilerplate and Docker references. | Reworked public/admin wiring and documentation to use native PostgreSQL/Node processes; removed the unused vulnerable Swagger dependency. | No Docker or workspace conversion was introduced. |

## Key implementation decisions

- Frontend and backend remain independent npm applications under their original directories.
- PostgreSQL is the system of record. The validation run used a disposable native PostgreSQL 17 cluster on port 55432 because administrator credentials for the host cluster were unavailable; normal clean-machine configuration remains port 5432.
- Money is calculated on the server and persisted as Decimal snapshots. Dates are date-only UTC values and stays use `[checkIn, checkOut)` nights.
- Mock payment and mock AxisRooms behavior are behind configuration and are not presented as production certification.
- A failed external side effect creates an actionable job state instead of changing a successful booking into a failure.

## Main files changed

### Backend

`package.json`, `package-lock.json`, `eslint.config.mjs`, `.env.example`, `prisma/schema.prisma`, `prisma/seed.ts`, both migration files, `src/main.ts`, `src/app.module.ts`, common configuration/security/date/filter files, and the auth, availability, holds, hotels, reservations, payments, reports, AxisRooms, files, jobs, vouchers, users and health modules.

### Frontend

`package.json`, `package-lock.json`, `playwright.config.ts`, `.env.example`, `tsconfig.json`, the central API client and types, `booking-helpers.ts`, booking/admin components, public/admin/login routes, SEO metadata routes, placeholder asset, global styling, and unit/Playwright tests.

### Database and documentation

`database/create_database.sql`, database setup documentation, and the required Codex audit, contract, implementation, test, runbook, integration-gap and production-readiness reports.
