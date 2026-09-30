import { PromotionDiscountType } from '@prisma/client';

export type PromotionCandidate = {
  id: string;
  code?: string | null;
  name: string;
  discountType: PromotionDiscountType | 'PERCENT' | 'FIXED';
  discountValue: number | string;
  bookingStart?: Date | string | null;
  bookingEnd?: Date | string | null;
  stayStart?: Date | string | null;
  stayEnd?: Date | string | null;
  minNights?: number | null;
  maxNights?: number | null;
  channels?: unknown;
  roomTypes?: Array<{ roomTypeId: string }>;
  ratePlans?: Array<{ ratePlanId: string }>;
  active?: boolean;
};

function day(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}
function normalized(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}
function includesTarget(targets: Array<{ roomTypeId: string }> | Array<{ ratePlanId: string }> | undefined, id: string) {
  return !targets?.length || targets.some((target: any) => target.roomTypeId === id || target.ratePlanId === id);
}

export function selectBestPromotion(promotions: PromotionCandidate[], input: { bookingDate: Date | string; stayDate: Date | string; nights: number; subtotal: number; channel?: string; code?: string; roomTypeId: string; ratePlanId: string }) {
  const booking = day(input.bookingDate)!;
  const stay = day(input.stayDate)!;
  const requestCode = normalized(input.code);
  const requestChannel = normalized(input.channel);
  return promotions
    .filter((promotion) => promotion.active !== false)
    .filter((promotion) => {
      const promotionCode = normalized(promotion.code);
      return !promotionCode ? true : Boolean(requestCode) && requestCode === promotionCode;
    })
    .filter((promotion) => !promotion.bookingStart || booking >= day(promotion.bookingStart)!)
    .filter((promotion) => !promotion.bookingEnd || booking <= day(promotion.bookingEnd)!)
    .filter((promotion) => !promotion.stayStart || stay >= day(promotion.stayStart)!)
    .filter((promotion) => !promotion.stayEnd || stay <= day(promotion.stayEnd)!)
    .filter((promotion) => promotion.minNights == null || input.nights >= promotion.minNights)
    .filter((promotion) => promotion.maxNights == null || input.nights <= promotion.maxNights)
    .filter((promotion) => {
      const channels = Array.isArray(promotion.channels) ? promotion.channels.map(normalized).filter(Boolean) : [];
      return !channels.length || (Boolean(requestChannel) && channels.includes(requestChannel));
    })
    .filter((promotion) => includesTarget(promotion.roomTypes, input.roomTypeId) && includesTarget(promotion.ratePlans, input.ratePlanId))
    .map((promotion) => ({ promotion, discount: promotion.discountType === 'PERCENT' ? input.subtotal * Number(promotion.discountValue) / 100 : Math.min(input.subtotal, Number(promotion.discountValue)) }))
    .sort((left, right) => right.discount - left.discount)[0] ?? null;
}
