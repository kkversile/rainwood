# Real agent rate-sheet demo data audit

The source of truth for this demo import is `COR-SEASON RATES2 6-27.html`.
The source states seasonal validity `2026-10-01` through `2027-03-31`.

## Hotel selection and mapping

The live demo was checked before import. Its existing hotel records were
RainWood Aurum Kodaikanal, RainWood Lakeshore Alleppey, and RainWood Misty
Hills Munnar. None is an exact or safe normalized match for the selected
source properties. The seed therefore does not map source prices onto an
unrelated property: it reuses an exact matching record when present and
otherwise creates stable additive source-backed demo records.

Selected source properties:

| Destination | Source hotel | Demo code | Source URL |
| --- | --- | --- | --- |
| Thekkady | Casa Bella Thekkady | `RW-DEMO-CASA-BELLA-THEKKADY` | `https://rainwoodhotels.com/hotels/casa-bella-thekkady/` |
| Thekkady | The Patio Thekkady | `RW-DEMO-THE-PATIO-THEKKADY` | `https://rainwoodhotels.com/hotels/the-patio-thekkady/` |

## Source values imported

All values below are source values before statutory tax.

| Hotel | Room category | CPAI → CP | MAP | Extra adult | Child with bed | Child without bed |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Casa Bella Thekkady | Premium Cottage | 5,000 | 6,700 | 1,500 | 1,000 | 800 |
| Casa Bella Thekkady | Duplex Cottage (For 4 Pax) | 9,500 | 12,900 | 1,500 | 1,000 | 800 |
| The Patio Thekkady | Deluxe Room | 3,000 | 4,300 | 1,000 | 800 | 500 |
| The Patio Thekkady | Deluxe AC | 3,700 | 5,000 | 1,000 | 800 | 500 |
| The Patio Thekkady | Suite Room AC | 4,500 | 5,800 | 1,000 | 800 | 500 |

Source-to-canonical mappings are explicit:

| Source label | RainWood canonical plan | Decision |
| --- | --- | --- |
| `CPAI` | `CP` | Existing RainWood canonical meal semantics define CP as breakfast included. |
| `MAP` | `MAP` | Direct match. |
| `APAI` | Not imported | Not present in either selected source property. No AP rate was fabricated. |
| Missing source rate | `—` | Remains unavailable; it is never stored as INR 0. |

Both selected properties have room/night supplementary charges in the source:

| Hotel | Charge | Dates | Amount | Scope |
| --- | --- | --- | ---: | --- |
| Casa Bella Thekkady | Diwali Hike | 2026-11-05 → 2026-11-15 | 1,000 / room / night | AGENTS |
| Casa Bella Thekkady | Peak Season Hike | 2026-12-20 → 2027-01-05 | 1,500 / room / night | AGENTS |
| The Patio Thekkady | Diwali Hike | 2026-11-05 → 2026-11-15 | 500 / room / night | AGENTS |
| The Patio Thekkady | Peak Season Hike | 2026-12-20 → 2027-01-05 | 1,000 / room / night | AGENTS |

The selected properties were chosen because their applicable source
supplements are representable by the existing `HotelSupplementaryCharge`
model. The source's per-person festive lines on other properties were not
silently converted into room/night charges.

## Content and payment details

Source-supported property descriptions, Wi-Fi, parking, swimming pool or
welcome drink amenities, canonical property links, and structured bank
records are loaded where the current model supports them. Account numbers are
not printed in seed logs; the audit summary masks them.

The bank records are stored in `HotelBankAccount` with
`displayOnAgentRateSheet = true`:

| Hotel | Account name | Bank | Branch | IFSC | Account number in logs |
| --- | --- | --- | --- | --- | --- |
| Casa Bella Thekkady | Rain Wood Hotels | ICICI Bank | Ravipuram Branch, Ernakulam | ICIC0001162 | `11****66` |
| The Patio Thekkady | The Patio | SBI | SBI Kumily | SBIN0070132 | `38****64` |

## Seed and verification

Run from `backend`:

```powershell
npm.cmd run demo:seed-rate-sheet
```

The script is idempotent. It uses stable hotel codes, room codes, slab code,
date bands, and find-or-update keys for supplements and bank accounts. The
source HTML is verified when present locally; the audited fixture is used on a
deployment host because the downloaded source HTML is intentionally excluded
from the repository and release zips.

The slab is `SLAB-DEMO-SOURCE-2026-27`, named `2026-27 Seasonal Contract`,
version 1, published for the existing demo Agent selected by the seed. The
existing RainWood room-tax policy of 12% is used only for `RateDay` statutory
tax calculations; the agent slab amounts remain the source's pre-tax contract
values.
