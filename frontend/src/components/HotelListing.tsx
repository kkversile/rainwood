'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Hotel } from '../lib/types';
import { dateInDays, nextDate } from '../lib/booking-helpers';
import { HotelImage } from './HotelImage';

export function HotelListing({ hotels }: { hotels: Hotel[] }) {
  const [destination, setDestination] = useState('all');
  const [mealPlan, setMealPlan] = useState('any');
  const [checkIn, setCheckIn] = useState(dateInDays(1));
  const [checkOut, setCheckOut] = useState(dateInDays(2));
  const [adults, setAdults] = useState('2');
  const [children, setChildren] = useState('0');
  const [rooms, setRooms] = useState('1');
  const destinations = Array.from(new Set(hotels.map((hotel) => hotel.city))).sort();
  const filteredHotels = useMemo(() => hotels.filter((hotel) => {
    const destinationMatches = destination === 'all' || hotel.city === destination;
    const mealMatches = mealPlan === 'any' || hotel.rooms?.some((room) => room.ratePlans?.some((plan) => plan.mealPlan.toUpperCase() === mealPlan));
    return destinationMatches && mealMatches;
  }), [destination, mealPlan, hotels]);

  function bookingHref(hotel: Hotel) {
    const query = new URLSearchParams({ hotel: hotel.slug, checkIn, checkOut, adults, children, rooms });
    return `/booking?${query.toString()}`;
  }

  return <>
    <form className="demoHotelsSearch" onSubmit={(event) => event.preventDefault()}>
      <div><label htmlFor="hotel-destination">Destination</label><select id="hotel-destination" value={destination} onChange={(event) => setDestination(event.target.value)}><option value="all">All Destinations</option>{destinations.map((city) => <option key={city} value={city}>{city}</option>)}</select></div>
      <div><label htmlFor="hotel-meal-plan">Meal Plan</label><select id="hotel-meal-plan" value={mealPlan} onChange={(event) => setMealPlan(event.target.value)}><option value="any">Any Rate Plan</option><option value="EP">EP</option><option value="CP">CP</option><option value="MAP">MAP</option><option value="AP">AP</option></select></div>
      <div><label htmlFor="hotel-check-in">Check-in</label><input id="hotel-check-in" type="date" value={checkIn} onChange={(event) => { setCheckIn(event.target.value); if (checkOut <= event.target.value) setCheckOut(nextDate(event.target.value)); }} /></div>
      <div><label htmlFor="hotel-check-out">Check-out</label><input id="hotel-check-out" type="date" value={checkOut} min={nextDate(checkIn)} onChange={(event) => setCheckOut(event.target.value < nextDate(checkIn) ? nextDate(checkIn) : event.target.value)} /></div>
      <div><label htmlFor="hotel-adults">Adults</label><select id="hotel-adults" value={adults} onChange={(event) => setAdults(event.target.value)}><option value="1">1 adult</option><option value="2">2 adults</option><option value="3">3 adults</option><option value="4">4 adults</option></select></div>
      <div><label htmlFor="hotel-children">Children</label><select id="hotel-children" value={children} onChange={(event) => setChildren(event.target.value)}><option value="0">No children</option><option value="1">1 child</option><option value="2">2 children</option><option value="3">3 children</option></select></div>
      <div><label htmlFor="hotel-rooms">Rooms</label><select id="hotel-rooms" value={rooms} onChange={(event) => setRooms(event.target.value)}><option value="1">1 room</option><option value="2">2 rooms</option></select></div>
    </form>
    <p className="muted" aria-live="polite">Showing {filteredHotels.length} of {hotels.length} published hotels.</p>
    {!filteredHotels.length ? <p className="empty">No hotels match the selected filters.</p> : <div className="demoHotelsCards">{filteredHotels.map((hotel) => {
      const mealPlans = Array.from(new Set(hotel.rooms?.flatMap((room) => room.ratePlans?.map((plan) => plan.mealPlan) ?? []) ?? []));
      return <article className="demoHotelsCard" key={hotel.id}>
        <div className="demoHotelsCardImage"><HotelImage hotel={hotel} alt={hotel.images?.[0]?.altText ?? `${hotel.name} property`} /></div>
        <div className="demoHotelsCardBody"><h2>{hotel.name}</h2><p>{hotel.description ?? 'A thoughtful RainWood stay with direct reservation support.'}</p><div className="demoHotelsTags"><span className="goldTag">{mealPlans[0] ?? 'Direct'}</span><span>{hotel.rooms?.length ?? 0} room categories</span><span>Check availability</span></div><div className="demoHotelsCardActions"><Link className="btn" href={`/hotels/${hotel.slug}`}>View rooms</Link><Link className="demoHotelsBookLink" href={bookingHref(hotel)}>Check availability →</Link></div></div>
      </article>;
    })}</div>}
  </>;
}
