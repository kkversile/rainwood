# RainWood access-control matrix

| Area | SUPER_ADMIN | CORPORATE_ADMIN | ADMIN | RESERVATION | SERVICE_STAFF | ACCOUNTS / VIEWER |
| --- | --- | --- | --- | --- | --- | --- |
| Hotel master, site settings, system security | All properties | No | No | No | No | No |
| Hotel content, rooms, inventory, rate plans, promotions | All properties | All properties | Own active `staffHotelId` | Read/operations permitted by route | No admin portal access | Existing read-only/account policy |
| Reservations and folios | All properties | All properties | Own active `staffHotelId` | Own assigned operational property | Staff PWA only | Existing policy |
| Reconciliation | Global | Global | Own active property | No | No | Existing accounts policy |
| Users | All internal roles | Property staff roles only | Own-property staff roles only | No | No | No |
| Audit logs | Global | Global | No global logs | No | No | No |

## Scope rules

- `SUPER_ADMIN` and `CORPORATE_ADMIN` are global roles and must not have `staffHotelId`.
- `ADMIN`, `RESERVATION`, and `SERVICE_STAFF` require an active `staffHotelId`; no missing-relation or legacy fallback is permitted.
- A property-scoped request is forced to its own hotel even when the client omits `hotelId`; a cross-property request is rejected as not found/forbidden.
- `ACCOUNTS` retains its existing accounting visibility and is not treated as a property `ADMIN` unless a route explicitly defines that behavior.
- The integrity gate is `npm run roles:scope-check` from `backend/`.
