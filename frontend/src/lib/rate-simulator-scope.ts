export type RateSimulatorProfile = {
  role: string;
  staffHotelId?: string | null;
};

export type RateSimulatorHotel = { id: string; name: string };

export function canUseRateSimulator(profile: RateSimulatorProfile | null | undefined) {
  return profile?.role === 'SUPER_ADMIN' || profile?.role === 'CORPORATE_ADMIN' || profile?.role === 'ADMIN';
}

export function scopedRateSimulatorHotels(profile: RateSimulatorProfile | null | undefined, hotels: RateSimulatorHotel[]) {
  if (!canUseRateSimulator(profile)) return [];
  if (profile?.role === 'ADMIN') {
    return profile.staffHotelId ? hotels.filter((hotel) => hotel.id === profile.staffHotelId) : [];
  }
  return hotels;
}
