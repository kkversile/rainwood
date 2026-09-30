# RainWood role and hotel-scope matrix

| Role | Hotel scope | Commercial / operations | User administration | Platform controls |
| --- | --- | --- | --- | --- |
| `SUPER_ADMIN` | All hotels | Full | All internal roles, including `SUPER_ADMIN` | Full |
| `CORPORATE_ADMIN` | All hotels | Full business and operations | `ADMIN`, `RESERVATION`, `SERVICE_STAFF` (and preserved `ACCOUNTS`/`VIEWER` policy) | No site/security administration |
| `ADMIN` | Exactly one active `staffHotelId` | Own property only | Own-property `RESERVATION` and `SERVICE_STAFF` | No global settings or cross-property access |
| `RESERVATION` | Exactly one active `staffHotelId` | Front-office operations only | None | None |
| `SERVICE_STAFF` | Exactly one active `staffHotelId` plus department | Department PWA only | None | None |
| `ACCOUNTS` / `VIEWER` | Preserved during migration | Existing behavior | None | Existing behavior |
| `AGENT` | External agent portal; no staff hotel scope | Existing agent behavior | None | None |

## Enforcement points

- `validateUserRoleScope()` is the domain rule for role metadata.
- `getActorScope()` and `assertActorCanManageHotel()` are the shared service-level scope helpers.
- `RolesGuard` remains coarse role authorization; it is not used as the hotel boundary.
- `20260928190000_add_corporate_admin_and_enforce_role_scope` adds the enum value.
- `20260928190001_migrate_legacy_role_scope` converts legacy global `ADMIN` rows and applies only the deterministic seeded reservation mapping.
- `scripts/check-role-scope-integrity.ts` is the pre-deployment integrity gate.

The permission tables remain descriptive metadata; route and service authorization are still enforced by guards and domain helpers.
