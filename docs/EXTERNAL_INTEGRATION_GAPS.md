# External integration gaps

The local architecture and mock workflows are complete. The following items require external information or credentials and are intentionally not fabricated.

## Razorpay

Provide approved merchant `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and webhook secret. The adapter sends paise amounts, unique receipts/metadata, validates raw-body HMAC signatures with constant-time comparison, persists events before processing and handles duplicates idempotently. Live merchant verification and webhook delivery still need staging testing.

## Cashfree

Provide merchant credentials, the selected Cashfree API version, endpoint, authentication headers, webhook signature rules and sandbox test cases. The provider boundary can accept this without changing reservation/inventory state logic; no production-certified Cashfree payloads are claimed.

## AxisRooms

Provide the official current API/ARI specification, staging credentials, authentication/signature rules, property/room/rate-plan/occupancy mappings, sample inbound/outbound payloads, retry expectations and certification process. The adapter includes mock inbound inventory/rates, mapping validation, outbound job boundaries, retries and reconciliation states. It is not AxisRooms-certified.

## Property and policy data

Confirm RainWood property code, room/rate-plan mappings, taxes, child/extra-person pricing, cancellation/no-show policy, payment/refund policy, timezone and operational cutoffs. Seed values are development fixtures, not final commercial policy.

## SMTP and object storage

Provide production SMTP credentials/domain/DKIM or an approved email provider, plus S3-compatible bucket credentials, retention, encryption and signed-download policy. Local SMTP log mode and local storage are safe development substitutes only.

## PostgreSQL administration

The validation run used a disposable local PostgreSQL 17 cluster on port 55432 because the host service's administrator password was unavailable. A normal installation should use `database/create_database.sql` against port 5432 with a real administrator account; no password was printed or committed.
