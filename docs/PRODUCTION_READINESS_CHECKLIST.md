# Production readiness checklist

## Verified locally

- [x] Frontend/backend remain separate Next.js and NestJS applications.
- [x] Native PostgreSQL + Prisma migrations and idempotent seed work.
- [x] Backend lint, typecheck, unit, API E2E and build pass.
- [x] Frontend lint, typecheck, unit, Playwright and build pass.
- [x] Global validation, Helmet, CORS allow-list, body-size limit and sanitized exceptions are enabled.
- [x] Access/refresh authentication, hashed rotating refresh tokens and role guards are wired.
- [x] Availability expands every occupied night and enforces occupancy/restrictions server-side.
- [x] PostgreSQL inventory locking and serializable retry prevent concurrent oversell in the tested race.
- [x] Payment states are separate from reservation states; mock webhook replay is idempotent.
- [x] Cancellation restores sold inventory once and modification preserves original inventory on failure.
- [x] Outbox workers, retries, dead letters, vouchers, email log mode and AxisRooms mock jobs exist.
- [x] Public SEO metadata, sitemap, robots, JSON-LD, dynamic hotel pages, accessible loading/error/empty states exist.
- [x] Runtime liveness, readiness and metrics endpoints return successfully.
- [x] High-severity npm audits report zero vulnerabilities in both applications.

## Required before live launch

- [ ] Replace all development secrets, seed password, mock payment and mock AxisRooms configuration.
- [ ] Obtain and stage-test Razorpay or Cashfree credentials, webhooks, refunds and reconciliation.
- [ ] Obtain AxisRooms official specification, staging credentials, mappings and certification sign-off.
- [ ] Confirm final hotel/rate/tax/child/extra-person/cancellation/no-show policies with RainWood.
- [ ] Configure HTTPS, secure cookie domain, CSRF controls for the chosen topology, rate limiting/WAF and a secret manager.
- [ ] Replace local storage/SMTP with approved encrypted object storage and production email service.
- [ ] Configure least-privilege PostgreSQL role, TLS, backups, restore drills, retention and migration approval.
- [ ] Configure Nginx, PM2/systemd, log rotation, error monitoring, metrics alerting and dead-letter alerts.
- [ ] Run load/concurrency, payment replay, cancellation/refund, file abuse, authorization and browser tests in staging.
- [ ] Review public guest-data exposure, retention, consent, privacy policy and regional tax/legal requirements.
- [ ] Verify voucher/email branding, sender reputation, deliverability, PDF archive and approved modification versioning.
