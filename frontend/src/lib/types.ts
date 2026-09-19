export type Hotel = {
  id: string;
  name: string;
  slug: string;
  city: string;
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalPath?: string | null;
  ogImageUrl?: string | null;
  images?: { url: string; altText: string }[];
  amenities?: { amenity: { name: string } }[];
  rooms?: { id: string; name: string; description?: string | null; maxAdults: number; maxChildren: number; images?: { url: string; altText: string }[]; ratePlans?: { id: string; name: string; mealPlan: string }[] }[];
};

export type AvailabilityOption = {
  hotelId: string;
  roomTypeId: string;
  roomType: string;
  ratePlanId: string;
  ratePlan: string;
  mealPlan: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: number;
  adults: number;
  children: number;
  total: number;
  taxTotal: number;
  availableRooms?: number;
  priceBreakdown: { date: string; baseAmount: number; taxAmount: number; extrasAmount: number; totalAmount: number }[];
  restrictions: { cta: boolean; ctd: boolean; minLos: number | null; maxLos: number | null };
};

export type ReservationSummary = {
  reference: string;
  status: string;
  paymentStatus: string;
  syncStatus: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  currency: string;
  totalAmount: number | string;
  advanceAmount: number | string;
  balanceAmount: number | string;
  hotel: { name: string; slug: string; city: string };
  lines: { roomType: string; ratePlan: string; rooms: number; adults: number; children: number }[];
};
