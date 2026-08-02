# RainWood test report

All results below are actual local executions against the disposable native PostgreSQL 17 validation cluster at `localhost:55432`. No test was skipped or disabled.

| Test | Command or method | Result | Evidence | Notes |
|---|---|---:|---|---|
| Prisma format/validate/generate | `npx prisma format`; `npx prisma validate`; `npm run prisma:generate` | PASS | Schema validated and client v6.19.3 generated | Required after clean npm install because npm 11 may block postinstall scripts. |
| Prisma migrations | `DATABASE_URL=... npx prisma migrate status` | PASS | 2 migrations found; database schema up to date | Baseline plus post-deploy constraints. |
| Backend unit tests | `npm.cmd test -- --runInBand` | PASS | 6 suites, 8 tests passed, 0 failed | Dates, auth policy, hold token, availability restrictions/pricing, mock provider, reservation state. |
| Backend lint/typecheck/build | `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build` | PASS | All exit code 0 | Strict TypeScript and zero lint warnings. |
| Backend API E2E | `DATABASE_URL=... npm.cmd run test:e2e -- --runInBand` | PASS | 1 suite, 3 tests passed, 0 failed | Health, seeded hotel/availability, 9-way hold race: exactly 8 successes and 1 client rejection. |
| Frontend unit tests | `npm.cmd run test` | PASS | 3 tests passed, 0 failed | Date-only helper and search validation. |
| Frontend lint/typecheck/build | `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build` | PASS | All exit code 0 | Next 16.2.12; public hotel pages are dynamic. |
| Playwright public booking | `npm.cmd run test:e2e` | PASS | 1 test passed | Browser searched, held, created a reservation, sent signed mock payment and reached confirmation. |
| Runtime liveness/readiness/metrics | HTTP calls to port 4000 | PASS | Live/readiness HTTP 200; metrics HTTP 200, 8192 bytes | Database query included in readiness. |
| Manual API workflow | HTTP calls with seed admin and mock provider | PASS | Confirmed reservation, PAID payment, voucher/outbox jobs, manual payment verification, idempotent cancellation and versioned contact modification | References and credentials intentionally omitted. |
| Dependency audit | `npm.cmd audit --audit-level=high` in both apps | PASS | Both reported `found 0 vulnerabilities` | Lockfiles regenerated after safe updates. |

## Counts

- Backend tests passed: 11 (8 unit + 3 API E2E); failed: 0.
- Frontend tests passed: 3 unit; failed: 0.
- Playwright E2E tests passed: 1; failed: 0.
- Build, lint, typecheck, Prisma validation and migration status: all passed.

## External boundary

Live Razorpay/Cashfree calls, official AxisRooms staging/certification, production SMTP, S3-compatible storage and production PostgreSQL administrator provisioning were not claimed as local test results. Mock-mode paths were exercised instead.
