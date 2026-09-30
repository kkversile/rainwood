# Rate seasons and yield policy

Rate seasons and occupancy yield rules are evaluated for Rainwood/direct/local quote calculations. The precedence is:

`manual RateDay override -> promotion`

or, when no manual override exists:

`RateDay base -> one matching season -> one matching yield rule -> promotion`.

Yield occupancy is calculated per room type and stay date from `InventoryDay.sold + InventoryDay.held` divided by `InventoryDay.available` (sellable inventory). Expired holds are released before they stop contributing to `held`; physical room status is not used.

Existing RateDay base and manual override values are never overwritten by season/yield automation. Existing AxisRooms synchronization continues to use stored RateDay values. Dynamic season/yield calculations are currently local/direct quote behavior and are not silently pushed to AxisRooms; channel parity requires a separately designed integration.

Reservations and holds retain their quoted per-night breakdown, so later changes to a season, yield rule, or promotion do not mutate an existing price snapshot.
