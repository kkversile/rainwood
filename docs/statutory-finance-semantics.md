# Rainwood statutory finance amount semantics

This table is the internal contract between pricing, checkout settlement, and
statutory documents. Amounts are INR unless stated otherwise.

| Source | Field | Meaning | Statutory use |
| --- | --- | --- | --- |
| `Reservation` | `totalAmount` | Tax-inclusive finalized room amount | Included in the authoritative settlement gross total |
| `Reservation` | `taxAmount` | Persisted GST/tax component of `totalAmount` | Copied into checkout settlement and used to explain the invoice |
| `ReservationLine` | `lineTotal` | Tax-inclusive room-line total | Source for room taxable amount plus persisted tax |
| `ReservationLine` | `taxAmount` | Persisted room-line tax component | Never recalculated at invoice issue |
| `ReservationRoomNight` | `amount` | Base pre-tax room component (extras/supplements may also be carried in `totalAmount`) | Historical base component; final taxable value is `totalAmount - taxAmount` |
| `ReservationRoomNight` | `taxAmount` | Persisted room-night tax component | Copied/split into statutory GST components |
| `ReservationRoomNight` | `totalAmount` | Tax-inclusive room-night total | Must equal `amount + taxAmount` |
| `ReservationFolioCharge` | `taxableAmount` | Pre-tax posted service charge | Taxable F&B, laundry, room-service, or other-service amount |
| `ReservationFolioCharge` | `taxAmount` | Persisted posted service tax | Copied/split into statutory GST components |
| `ReservationFolioCharge` | `totalAmount` | Tax-inclusive posted service charge | Must equal `taxableAmount + taxAmount` |
| `ReservationSettlement` | `reservationAmount` + `incidentalAmount` | Finalized tax-inclusive folio components | Authoritative `grossAmount` input |
| `ReservationSettlement` | `taxAmount` | Snapshot of reservation and posted-charge tax | Explanation only; does not increase `grossAmount` |
| `ReservationSettlement` | `grossAmount` | Finalized amount payable at checkout | Invoice grand-total invariant |
| `TaxInvoice` | `taxableAmount`, tax components | Snapshot of finalized source lines | Must reconcile to settlement gross |
| `TaxInvoice` | `grandTotal` | Statutory snapshot of settlement gross | May differ only by explicit modeled `roundOff` within INR 0.01 |

New checkout snapshots are marked `TAX_INCLUSIVE_PERSISTED_BREAKDOWN_V1`.
Older settlements without that marker are not assigned tax from current
rules; invoice preview reports `LEGACY_TAX_BREAKDOWN_UNAVAILABLE` and issue is
blocked pending an approved migration policy.

Tax rules classify a source line by `TaxCategory`; they select the rule and
service code but do not recalculate a finalized payable amount. Place of supply
is resolved centrally and missing customer/billing state is an error, never an
implicit IGST decision.

## Credit notes and round-off

An ordinary partial credit note credits selected finalized invoice lines and
keeps `roundOff` at zero. A `fullCredit` request consumes the invoice's
remaining round-off exactly once, including a negative round-off, and computes
`grandTotal = credited line totals + roundOff`. Round-off is never silently
clamped, redistributed, or recalculated from current tax rules. The resulting
credit-note total is subtracted from statutory receivables, so a full credit
note reduces the receivable to exactly zero when no other balance remains.

## Role and workflow policy

`VIEWER` may read organization-wide statutory reports only. Tax settings,
invoice issue/cancel, credit-note issue, TDS record/reverse, and certificate
receipt remain finance mutations and require the existing finance roles.
TDS certificates transition from `CERTIFICATE_PENDING` or `RECORDED` to
`CERTIFICATE_RECEIVED`; once received, the certificate fields are immutable.
