# Portal demo deployment

The admin, agent and staff portals share the RainWood interface and support
demo login prefills configured through `NEXT_PUBLIC_DEMO_*` variables. These
values are embedded in the browser bundle; configure them only on the demo site.

## Additive data seed

From `backend`, set `SEED_PORTAL_DEMO_PASSWORD` and
`SEED_PORTAL_AGENT_PASSWORD` from the demo site's matching prefill configuration.
Optionally set `SEED_PORTAL_HOTEL_CODE` (default `RW-KODAI`).

- Preview: `npx tsx scripts/seed-portal-demo.ts`
- Apply: `npm run demo:seed-portals`

This seed requires the selected hotel to exist and be active. It creates missing
demo admin, agent and department accounts plus three demo service items. Existing
accounts must already have the expected roles and hotel scopes. Passwords are
preserved by default. On an authorized demo site, add `--sync-demo-passwords` to
align only these six fixed demo identities with the configured prefills. Changed
credentials invalidate older sessions. Inactive accounts are not reactivated.

The seed also adds a dirty demo room and task, a complimentary checked-in demo
service guest, and a hotel-wide maintenance ticket. Demo room types and rate plans
are inactive with no public inventory. Subsequent runs preserve their progress.
Existing service items, public rates, inventory, reservations, payments and settlement
snapshots are preserved. The existing local service-demo stay is checked before and
after the seed to ensure its room, checkout and final-folio states are unchanged.
The full `prisma:seed` command updates pricing and inventory and should not be used
to deploy these portal improvements onto an already populated database.

## Release verification

Back up the database, environment files and current builds before updating the
existing checkout. Preserve server-specific configuration and package-lock edits.
Run `prisma migrate deploy`, build both applications with the deployment's own
configuration, run the additive seed, and restart `rainwood-api.service` and
`rainwood-web.service`. Verify readiness, all portal logins, the saved demo folio
and the completed housekeeping task in the deployed browser.
