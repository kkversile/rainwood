# RainWood Direct Booking Engine

Production-oriented hotel direct-booking and reservation platform built with **Next.js, React, TypeScript, NestJS, Prisma and PostgreSQL**.

RainWood models the core commercial and operational concerns behind a hotel booking engine: discovery, room availability, pricing, temporary inventory holds, reservation creation, payment verification, vouchers, cancellations, reporting and external integration boundaries.

## Why this project matters

Hotel booking software is not ordinary CRUD. Availability and reservation flows must protect inventory under concurrency, pricing must be calculated consistently, payment events must be idempotent, cancellations must restore inventory correctly, and operational events must remain traceable.

This project is designed around those constraints.

## Core capabilities

- Hotel discovery and server-rendered hotel content
- Room availability across every occupied night
- Occupancy-aware pricing
- CTA / CTD restrictions
- Stop-sell controls
- Minimum and maximum length-of-stay rules
- Temporary inventory holds
- Atomic hold-to-reservation conversion
- Reservation and payment state management
- Manual payment verification and payment-proof storage
- Signed and idempotent mock payment webhooks
- Reservation vouchers
- Cancellation with inventory restoration
- Versioned non-inventory reservation modifications
- Admin and agent operational workflows
- Reports, health/readiness endpoints and Prometheus metrics
- AxisRooms adapter boundary with retry/reconciliation state

## Architecture highlights

### Transactional inventory protection

Temporary holds use PostgreSQL row locking and serializable transaction retry so concurrent booking attempts do not silently oversell the same inventory.

### Idempotent payment handling

Reservation and payment state are kept separate, and webhook processing is designed to tolerate retries without duplicating business effects.

### Durable background work

Transactional outbox jobs provide a boundary for work that should continue reliably after the originating database transaction succeeds.

### Security

- Rotating hashed refresh tokens
- Role-based authorization guards
- Generic authentication failure responses
- Audit events for sensitive operations
- Local secrets kept outside version control

## Technology

### Frontend

- Next.js App Router
- React
- TypeScript
- Server-rendered hotel content
- Dynamic SEO metadata, sitemap, robots and JSON-LD

### Backend

- NestJS REST API
- Prisma ORM
- PostgreSQL
- Health/readiness endpoints
- Prometheus-compatible metrics

## Repository structure

```text
rainwood/
├── frontend/
├── backend/
├── database/
└── docs/
```

## Quick start

Prerequisites: Node.js 22 LTS, npm and PostgreSQL 15+.

### 1. Create the local database

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -U postgres -f .\database\create_database.sql
```

### 2. Configure environment files

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env.local
```

Set a valid local `DATABASE_URL` and generated JWT secrets in `backend/.env`.

### 3. Install, migrate and seed the backend

```powershell
Set-Location backend
npm.cmd install
npm.cmd run prisma:generate
npm.cmd run prisma:deploy
npm.cmd run prisma:seed
```

### 4. Start both applications

Backend:

```powershell
Set-Location backend
npm.cmd run start:dev
```

Frontend:

```powershell
Set-Location frontend
npm.cmd install
npm.cmd run dev
```

Local URLs:

- Frontend: `http://localhost:3000`
- API: `http://localhost:4000/api/v1`
- Readiness: `http://localhost:4000/api/v1/health/ready`

Local seed login: `admin@rainwood.demo`. Set `SEED_ADMIN_PASSWORD` locally before seeding and change it before using a shared environment.

## Validation and operations documentation

See:

- `docs/CODEX_INITIAL_AUDIT.md`
- `docs/CODEX_IMPLEMENTATION_REPORT.md`
- `docs/CODEX_TEST_REPORT.md`
- `docs/CODEX_RUNBOOK.md`
- `docs/API_CONTRACT_VALIDATION.md`
- `docs/EXTERNAL_INTEGRATION_GAPS.md`
- `docs/PRODUCTION_READINESS_CHECKLIST.md`

## Production integration note

Live payment merchant credentials, official AxisRooms specification/certification, SMTP and production object storage are external deployment dependencies. Mock mode is the complete local integration path and is not presented as production supplier certification.

## What this repository demonstrates

This project is intended to demonstrate end-to-end product engineering for a transaction-heavy hospitality domain: **domain modelling, concurrency control, secure API design, booking workflows, idempotency, observability, integration boundaries and production-readiness thinking**.
