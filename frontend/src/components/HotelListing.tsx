'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Hotel } from '../lib/types';
import { dateInDays } from '../lib/booking-helpers';

export function HotelListing({ hotels }: { hotels: Hotel[] }) {
  const [destination, setDestination] = useState('all');
  const [mealPlan, setMealPlan] = useState('any');
  const [checkIn, setCheckIn] = useState(dateInDays(0));
  const [guests, setGuests] = useState('2');
  const destinations = Array.from(new Set(hotels.map((hotel) => hotel.city))).sort();
  const filteredHotels = useMemo(() => hotels.filter((hotel) => {
    const destinationMatches = destination === 'all' || hotel.city === destination;
    const mealMatches = mealPlan === 'any' || hotel.rooms?.some((room) => room.ratePlans?.some((plan) => plan.mealPlan.toUpperCase() === mealPlan));
    return destinationMatches && mealMatches;
  }), [destination, mealPlan, hotels]);

  function bookingHref(hotel: Hotel) {
    const query = new URLSearchParams({ hotel: hotel.id, checkIn, adults: guests });
    return `/booking?${query.toString()}`;
  }

  return <>
    <form className="demoHotelsSearch" onSubmit={(event) => event.preventDefault()}>
      <div><label htmlFor="hotel-destination">Destination</label><select id="hotel-destination" value={destination} onChange={(event) => setDestination(event.target.value)}><option value="all">All Destinations</option>{destinations.map((city) => <option key={city} value={city}>{city}</option>)}</select></div>
      <div><label htmlFor="hotel-meal-plan">Meal Plan</label><select id="hotel-meal-plan" value={mealPlan} onChange={(event) => setMealPlan(event.target.value)}><option value="any">Any Rate Plan</option><option value="EP">EP</option><option value="CP">CP</option><option value="MAP">MAP</option><option value="AP">AP</option></select></div>
      <div><label htmlFor="hotel-check-in">Check-in</label><input id="hotel-check-in" type="date" min={dateInDays(0)} value={checkIn} onChange={(event) => setCheckIn(event.target.value < dateInDays(0) ? dateInDays(0) : event.target.value)} /></div>
      <div><label htmlFor="hotel-guests">Guests</label><select id="hotel-guests" value={guests} onChange={(event) => setGuests(event.target.value)}><option value="2">2 Adults</option><option value="3">2 Adults, 1 Child</option><option value="4">4 Adults</option></select></div>
    </form>
    <p className="muted" aria-live="polite">Showing {filteredHotels.length} of {hotels.length} published hotels.</p>
    {!filteredHotels.length ? <p className="empty">No hotels match the selected filters.</p> : <div className="demoHotelsCards">{filteredHotels.map((hotel) => {
      const image = hotel.images?.[0]?.url ?? hotel.ogImageUrl ?? '/rainwood-placeholder.svg';
      return <article className="demoHotelsCard" key={hotel.id}><div className="demoHotelsCardImage"><img src={image} alt={hotel.images?.[0]?.altText ?? `${hotel.name} property`} /></div><div className="demoHotelsCardBody" style={{ display: 'flex', flexDirection: 'column', minHeight: '270px' }}><div style={{ color: '#c9952e', fontSize: '12px', fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '12px' }}>{hotel.city}</div><h2>{hotel.name}</h2><p>{hotel.description ?? 'A thoughtful RainWood stay with direct reservation support.'}</p><div className="demoHotelsTags"><span>{hotel.rooms?.length ?? 0} room categories</span><span>Open</span></div><div className="demoHotelsCardActions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: 'auto' }}><Link className="btn" href={`/hotels/${hotel.slug}`}>View hotel</Link><Link className="demoHotelsBookLink" href={bookingHref(hotel)}>Book direct →</Link></div></div></article>;
    })}</div>}
  </>;
}
