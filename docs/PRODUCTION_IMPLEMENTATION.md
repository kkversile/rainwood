# Production implementation included

The implementation includes:

1. PostgreSQL/Prisma schema, baseline migrations and idempotent development seed.
2. JWT access tokens plus hashed rotating refresh tokens with reuse-family revocation.
3. Role metadata/guards, global validation, Helmet, CORS, body limits, correlation IDs and sanitized errors.
4. Serializable PostgreSQL transactions and deterministic FOR UPDATE inventory locking.
5. Expiring room holds that move inventory between held and sold atomically.
6. Mock and Razorpay provider boundaries. Cashfree remains an intentionally documented adapter dependency until its account/API version is supplied.
7. Raw-body signature verification and webhook-event uniqueness for idempotency.
8. AxisRooms mapping DTOs, mock/live adapter boundary, retry jobs and reconciliation endpoints.
9. PostgreSQL transactional outbox worker using SKIP LOCKED, exponential retry and dead-letter state.
10. PDF voucher generation, SMTP log/live delivery and local payment-proof storage with checksum/type/size controls.
11. Append-only audit records, reports, readiness and Prometheus metrics.
12. Data-driven cancellation snapshot, inventory release, refund-pending state and AxisRooms cancellation job.
13. Versioned safe contact/instruction modifications with explicit rejection of direct inventory mutation.
14. Next.js server-rendered SEO pages, dynamic metadata, sitemap, robots, JSON-LD and accessible booking/admin flows.

## External certification boundary

No repository can truthfully contain certified AxisRooms mappings without the exact partner specification, credentials, test property mapping and successful certification results. The adapter and persistence are complete; replace the provider mapper after those documents are supplied. Razorpay/Cashfree live use likewise requires approved credentials and staging verification.
