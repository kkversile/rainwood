# RainWood feature enforcement map

Feature checks are additive to RBAC: a role must still be authorized, and a disabled feature can only remove access. `SUPER_ADMIN` bypasses feature checks. Public, health, authentication, hotel-selector, and other shared bootstrap endpoints are intentionally not feature-gated.

| Feature key | Protected admin/API surface | Enforcement |
|---|---|---|
| revenueForecast | `/revenue-forecast` | `RevenueForecastController` + `FeatureGuard` |
| roomsInventory | hotel inventory/rate-book admin screens | existing hotel scope/RBAC; feature key is reserved for UI and inventory action checks |
| physicalRooms | `/hotels/physical-rooms`, room setup actions | existing hotel scope/RBAC; shared hotel selector remains ungated |
| roomRack | `/reports/room-rack` | report route mapping; shared report access remains RBAC-authoritative |
| housekeeping | `/housekeeping`, staff housekeeping workflows | `HousekeepingController` + `FeatureGuard` |
| maintenance | `/maintenance`, staff maintenance workflows | `MaintenanceController` + `FeatureGuard` |
| logbook | `/operations-logbook` | `OperationsLogbookController` + entity-aware `FeatureGuard` |
| banquets | `/banquets` | `BanquetsController` + entity-aware `FeatureGuard` |
| functionSpaces | `/function-spaces` | `FunctionSpacesController` + entity-aware `FeatureGuard` |
| ratePlans | hotel rate-plan admin surfaces | hotel scope/RBAC; shared `/hotels` selectors remain ungated |
| rates | hotel rate admin surfaces | hotel scope/RBAC; shared `/hotels` selectors remain ungated |
| rateSeasons | hotel rate-season admin surfaces | hotel scope/RBAC; shared `/hotels` selectors remain ungated |
| yieldRules | hotel yield-rule admin surfaces | hotel scope/RBAC; shared `/hotels` selectors remain ungated |
| rateSimulator | rate simulator UI and quote reads | rate-management role/RBAC surface |
| promotions | hotel promotion admin surfaces | hotel scope/RBAC |
| rateImport | rate import/template endpoints | hotel scope/RBAC |
| supplementaryCharges | `/supplementary-charges` | `SupplementaryChargesController` + `FeatureGuard` |
| expenses | `/expenses` | `ExpensesController` + `FeatureGuard` |
| serviceItems | `/service-items`, `/service-orders` | guest-services controllers + `FeatureGuard` |
| cashier | `/cashier-shifts` | `CashierShiftsController` + `FeatureGuard` |
| taxSettings | `/tax-settings` | tax document settings methods + entity-aware `FeatureGuard` |
| taxInvoices | `/tax-invoices`, reservation tax invoice methods | tax document invoice methods + entity-aware `FeatureGuard` |
| creditNotes | `/tax-credit-notes`, credit-note methods | tax document credit-note methods + entity-aware `FeatureGuard` |
| tds | `/tds`, TDS methods | tax document TDS methods + entity-aware `FeatureGuard` |
| agents | `/users/agents` admin management | `UsersController` method guards + `FeatureGuard`; `/agents/me/*` remains Agent-authenticated self-service |
| corporates | `/corporates` | `CorporatesController` + `FeatureGuard` |
| inquiries | `/inquiries` | `InquiriesController` + `FeatureGuard` |
| reservations | authenticated reservation list/operations | reservation role/RBAC remains authoritative; public booking and agent checkout are excluded |
| groups | `/groups` | `GroupsController` + entity-aware `FeatureGuard` |
| frontDesk | front-desk reservation operations | reservation role/RBAC surface |
| arrivals | `/reports/arrivals`, arrivals UI | report/RBAC surface |
| inHouse | `/reservations/in-house`, in-house UI | reservation role/RBAC surface |
| lostFound | `/lost-found` | guest-services controller + `FeatureGuard` |
| guests | `/guests` | `GuestsController` + `FeatureGuard` |
| nightAudit | `/night-audit` | `NightAuditController` + `FeatureGuard` |
| contactRequests | `/contact-requests` admin surface | contact RBAC surface; public contact submission remains ungated |
| payments | `/payments` | payment RBAC surface |
| reports | `/reports` | `ReportsController` + `FeatureGuard` |
| axisRooms | AxisRooms admin integrations | signed inbound webhooks remain available for integration health; admin access remains RBAC |
| jobs | `/jobs` | `JobsController` + `FeatureGuard` |

The remaining mixed controllers deliberately keep shared selectors and public endpoints available. Their admin mutations continue to be protected by existing RBAC and hotel-scope guards; frontend navigation and `FeatureGate` fail closed until effective feature resolution is ready.
