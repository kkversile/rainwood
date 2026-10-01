export type CashierProfile = { role?: string | null; staffHotelId?: string | null };
export type CashierHotel = { id: string; name: string; timezoneName?: string | null };

export const CASHIER_READ_ROLES = ['SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS'] as const;
export const CASHIER_OPERATION_ROLES = ['SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION'] as const;

export function isCashierReadRole(role?: string | null) {
  return !!role && CASHIER_READ_ROLES.includes(role as (typeof CASHIER_READ_ROLES)[number]);
}

export function isCashierOperationRole(role?: string | null) {
  return !!role && CASHIER_OPERATION_ROLES.includes(role as (typeof CASHIER_OPERATION_ROLES)[number]);
}

export function isPropertyCashierRole(role?: string | null) {
  return role === 'ADMIN' || role === 'RESERVATION';
}

export function scopedCashierHotels(profile: CashierProfile, hotels: CashierHotel[]) {
  if (!isPropertyCashierRole(profile.role)) return hotels;
  if (!profile.staffHotelId) return [];
  return hotels.filter((hotel) => hotel.id === profile.staffHotelId);
}
