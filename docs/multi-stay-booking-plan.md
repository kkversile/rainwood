# Multi-Stay, Multi-Hotel Booking Plan

This document describes the future booking flow for multiple independent date ranges, cities, hotels, rooms, and meal plans.

## Goal

Allow a user or agent to build one booking from multiple independent hotel stays, similar to an e-commerce shopping cart.

Each stay has its own:

- Check-in and check-out dates
- City
- Hotel
- Room type
- Rate plan / meal plan
- Guest and room quantities
- Inventory availability
- Price and taxes

Date ranges do not need to be continuous.

## Example: Non-continuous stays

```text
Segment 1
12-Aug -> 15-Aug
Kodaikanal
3 nights

Gap
15-Aug -> 17-Aug
No hotel selected

Segment 2
17-Aug -> 18-Aug
Alleppey
1 night
```

```text
12        15        17       18
|---------|         |--------|
 Kodaikanal           Alleppey
 3 nights             1 night
```

The system must allow the gap because the user may stay elsewhere or may not need accommodation during that period.

The summary should clearly display:

```text
Selected stays: 2
Uncovered gap: 15-Aug to 17-Aug
Total hotel nights: 4
```

The user should acknowledge the uncovered period before checkout:

```text
You have an uncovered period from 15-Aug to 17-Aug.
No hotel booking will be created for these dates.

[Continue anyway] [Add another stay]
```

## User flow

```text
START
  |
  v
Select dates + city
  |
  v
Show hotels with complete availability for that range
  |
  v
Select hotel
  |
  v
Select room type + meal plan
  |
  v
Add stay to trip cart
  |
  +--> Add another stay?
  |       |
  |       +-- Yes --> Select another date range + city
  |       |
  |       +-- No --> Review trip cart
  |
  v
Review gaps, prices, taxes, and availability
  |
  v
Guest details
  |
  v
Recheck availability and prices
  |
  v
Hold inventory for all segments
  |
  v
Payment or agent wallet deduction
  |
  v
Create one reservation with multiple reservation lines
```

## Trip cart screen

```text
Create Booking

[Stay 1]
Check-in [12-Aug]  Check-out [15-Aug]  City [Kodaikanal]
[Search hotels]

Available hotels:
+--------------------------------------+
| RainWood Aurum Kodaikanal            |
| Premium Valley Room                  |
| Meal plan [CP]                       |
| INR 5,600                            |
| [Add to trip]                        |
+--------------------------------------+

[+ Add another stay]

[Stay 2]
Check-in [17-Aug]  Check-out [18-Aug]  City [Alleppey]
[Search hotels]

Available hotels:
+--------------------------------------+
| RainWood Lakeshore Alleppey          |
| Deluxe Lake Room                     |
| Meal plan [MAP]                      |
| INR 7,200                            |
| [Add to trip]                        |
+--------------------------------------+

Trip summary:
Kodaikanal | 3 nights | INR 5,600
Gap        | 2 nights | No hotel selected
Alleppey   | 1 night  | INR 7,200
--------------------------------------
Total: INR 12,800
[Continue to guest details]
```

## Availability rules

### Complete availability

A hotel is selectable only when the selected room and rate plan have inventory for every night in the requested range.

```text
Requested: 20-Aug -> 23-Aug
Required nights: 20-Aug, 21-Aug, 22-Aug

Available on all nights: selectable
Missing any night: not selectable as a complete stay
```

### No hotel or inventory

If no hotel has complete availability:

```text
No complete stays available for Munnar
20-Aug -> 23-Aug

[Change dates]
[Search another city]
[Show partial availability]
[Add another stay]
```

Do not silently create a shorter stay or change the dates.

### Partial availability

If a hotel has inventory for only part of the requested range:

```text
Requested: 20-Aug -> 23-Aug
Available: 20-Aug -> 22-Aug
Unavailable: 22-Aug -> 23-Aug
```

Display:

```text
RainWood Munnar
Available for 2 of 3 nights
20-Aug -> 22-Aug

[Select available dates]
```

The user must explicitly accept the changed range. The system must never shorten it silently.

### Split a stay

The user may choose different hotels for separate portions:

```text
20-Aug -> 22-Aug
Hotel A

22-Aug -> 23-Aug
Hotel B
```

These become two cart segments.

## Segment model

```ts
type BookingSegment = {
  id: string;
  city: string;
  hotelId: string;
  roomTypeId: string;
  ratePlanId: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children: number;
  nightlyRate: number;
  taxAmount: number;
  totalAmount: number;
  status: SegmentStatus;
};

type SegmentStatus =
  | 'DRAFT'
  | 'SEARCHING'
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'PRICE_CHANGED'
  | 'INVENTORY_EXPIRED'
  | 'SELECTED'
  | 'HELD'
  | 'CONFIRMED';
```

## Proposed database model

The final reservation remains the booking header. Each hotel stay becomes a reservation line.

```text
BookingCart
  id
  userId / agentId
  status
  expiresAt

BookingCartSegment
  id
  cartId
  city
  hotelId
  roomTypeId
  ratePlanId
  checkIn
  checkOut
  rooms
  adults
  children
  status
  nightlyRate
  taxAmount
  totalAmount
```

Existing/final reservation structure:

```text
Reservation
  id
  reference
  guest details
  total amount
  tax amount
  payment status
  source

ReservationLine
  reservationId
  hotelId
  roomTypeId
  ratePlanId
  checkIn
  checkOut
  rooms
  adults
  children
  nightlyRate
  taxAmount
  lineTotal
```

After confirmation:

```text
BookingCart
   |
   +-- Segment 1 --> ReservationLine 1
   +-- Segment 2 --> ReservationLine 2
   +-- Segment 3 --> ReservationLine 3
```

## Backend implementation plan

### 1. Search availability by segment

Create an availability endpoint that accepts:

```json
{
  "city": "Kodaikanal",
  "checkIn": "2026-08-12",
  "checkOut": "2026-08-15",
  "rooms": 1,
  "adults": 2,
  "children": 0,
  "agentId": "optional-agent-id"
}
```

Return only hotels, rooms, and rate plans with complete inventory for the requested nights.

For an agent, return only assigned rate plans.

### 2. Create or update a cart

The frontend can maintain the cart temporarily, but a server-side cart is recommended for:

- Cross-device continuation
- Expiration
- Price revalidation
- Inventory holds
- Agent wallet bookings

Suggested endpoints:

```text
POST   /booking-carts
GET    /booking-carts/:id
POST   /booking-carts/:id/segments
PATCH  /booking-carts/:id/segments/:segmentId
DELETE /booking-carts/:id/segments/:segmentId
POST   /booking-carts/:id/revalidate
POST   /booking-carts/:id/checkout
```

### 3. Validate date ranges

Rules:

1. Check-in cannot be before today.
2. Check-out must be after check-in.
3. Date ranges may be non-continuous.
4. Overlapping segments should be rejected unless explicitly supported later.
5. Gaps are allowed and must be shown.
6. City and hotel must match.
7. A selected hotel must cover every night in its segment.

Example invalid overlap:

```text
Segment 1: 12-Aug -> 15-Aug
Segment 2: 14-Aug -> 18-Aug
                 OVERLAP
```

Example valid gap:

```text
Segment 1: 12-Aug -> 15-Aug
Segment 2: 17-Aug -> 18-Aug
                 GAP ALLOWED
```

### 4. Revalidate before checkout

Availability and price can change while the user shops.

```text
Cart created
    |
    v
Recheck every segment
    |
    +-- All available and prices unchanged
    |       |
    |       v
    |    Create holds
    |
    +-- Inventory changed
    |       |
    |       v
    |    Show affected segment
    |
    +-- Price changed
            |
            v
         Ask user to accept new price
```

Example:

```text
Stay 1: Available, INR 5,600
Stay 2: No longer available

Booking cannot continue.

[Remove Stay 2]
[Change Stay 2]
[Search again]
```

### 5. Hold all inventory atomically

At checkout:

1. Revalidate all cart segments.
2. Start a database transaction.
3. Create a hold for each segment.
4. If any segment cannot be held, release all newly created holds.
5. Continue to payment or wallet deduction only when all segments are held.

### 6. Create one multi-line reservation

Create one reservation header and multiple lines in the same transaction.

```text
RW-BOOK-001

Line 1: Kodaikanal / Hotel A / 12-Aug -> 15-Aug
Line 2: Alleppey / Hotel B / 17-Aug -> 18-Aug
```

### 7. Handle payment and wallet

For an agent booking:

1. Calculate the complete amount across all segments.
2. Verify wallet balance.
3. Deduct the total atomically.
4. Create the reservation only after successful deduction.
5. Refund the complete or partial amount if cancellation rules require it.

If payment or wallet deduction fails, release every segment hold.

## Frontend implementation plan

### Components

```text
MultiStayBookingPage
  BookingCart
    BookingSegmentCard
      DateRangePicker
      CitySelector
      HotelResults
      RoomSelector
      MealPlanSelector
      PriceSummary
    GapWarning
    CartTotals
    RevalidationNotice
```

### Segment interaction

```text
1. User clicks Add stay.
2. Empty segment editor appears.
3. User selects city and date range.
4. Hotels load for that city/range.
5. User selects one hotel.
6. Rooms and rate plans load.
7. User selects room and meal plan.
8. Price is displayed.
9. User clicks Add to trip.
10. Segment becomes selected in the cart.
11. User can add another independent segment.
```

### Cart review

The cart should display:

- Every segment in date order
- City and hotel
- Room and meal plan
- Number of nights
- Segment price and tax
- Uncovered gaps
- Availability status
- Remove/edit actions
- Overall total

The checkout button must be disabled when any selected segment is unavailable or has an unresolved price change.

## Final reservation example

```text
RW-BOOK-001

Guest: Test Guest
Total: INR 12,800
Status: CONFIRMED

Lines:
1. Kodaikanal
   RainWood Aurum Kodaikanal
   Premium Valley Room / CP
   12-Aug -> 15-Aug
   3 nights

2. Alleppey
   RainWood Lakeshore Alleppey
   Deluxe Lake Room / MAP
   17-Aug -> 18-Aug
   1 night
```

## Core rules

```text
A date range is an independent requested stay.
A gap is allowed.
A hotel is selectable only when it covers the complete requested range.
Partial availability requires explicit user confirmation.
Dates and prices are revalidated before checkout.
All selected segments are held before payment.
One reservation may contain multiple hotel lines.
```
