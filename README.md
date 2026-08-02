# RainWood Direct Booking Engine

RainWood is a separate-application hotel direct-booking and reservation system:

- frontend/: Next.js App Router, React and TypeScript.
- backend/: NestJS REST API, Prisma and PostgreSQL.

The system uses native Node/npm processes and host PostgreSQL. It does not use Docker, a monorepo, PNPM workspaces or a Vite replacement.

## Quick start

Prerequisites: Node 22 LTS, npm and PostgreSQL 15+.

1. Create the role/database as a PostgreSQL administrator:

   powershell
   & 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -U postgres -f .\database\create_database.sql

2. Configure local environment files without committing them:

   powershell
   Copy-Item backend/.env.example backend/.env
   Copy-Item frontend/.env.example frontend/.env.local

   Set a real local DATABASE_URL and generated JWT secrets in backend/.env.

3. Install, migrate and seed the backend:

   powershell
   Set-Location backend
   npm.cmd install
   npm.cmd run prisma:generate
   npm.cmd run prisma:deploy
   npm.cmd run prisma:seed

4. Start each application independently:

   powershell
   # terminal 1, backend
   Set-Location backend
   npm.cmd run start:dev

   # terminal 2, frontend
   Set-Location frontend
   npm.cmd install
   npm.cmd run dev

URLs:

- Frontend: http://localhost:3000
- API: http://localhost:4000/api/v1
- Readiness: http://localhost:4000/api/v1/health/ready

Local seed login: admin@rainwood.demo. Set SEED_ADMIN_PASSWORD locally before seeding and change it before using a shared environment.

## Implemented local capabilities

- Server-rendered hotel content, dynamic SEO metadata, sitemap, robots and JSON-LD.
- Availability for every occupied night with occupancy, CTA, CTD, stop-sell, MLOS/maxLOS and server-side pricing.
- PostgreSQL row-locking and serializable retry for temporary holds and atomic conversion to reservations.
- Rotating hashed refresh tokens, generic login failures, role guards and audit events.
- Separate reservation/payment state machines, signed/idempotent mock webhooks, manual payment verification and payment-proof storage.
- Cancellation inventory restoration, versioned non-inventory modifications, vouchers and transactional outbox workers.
- AxisRooms mock adapter boundary, retry/reconciliation state, reports, health and Prometheus metrics.

## Validation and operations

See docs/CODEX_INITIAL_AUDIT.md, docs/CODEX_IMPLEMENTATION_REPORT.md, docs/CODEX_TEST_REPORT.md, docs/CODEX_RUNBOOK.md, docs/API_CONTRACT_VALIDATION.md, docs/EXTERNAL_INTEGRATION_GAPS.md and docs/PRODUCTION_READINESS_CHECKLIST.md.

Live payment merchant credentials, official AxisRooms specification/certification, SMTP and production object storage are intentionally external dependencies. Mock mode is the complete local path; it is not a production certification claim.
