import { createHmac, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { hmac, safeEqual } from '../../common/security';

export interface NormalizedPaymentEvent {
  eventId: string;
  eventType: string;
  orderId: string;
  paymentId: string;
  status: 'SUCCESS' | 'FAILED';
  amount: number;
  currency: string;
}

export interface PaymentGateway {
  createOrder(input: { amount: number; currency: string; reference: string }): Promise<Record<string, unknown>>;
  verify(raw: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  normalize(payload: any): NormalizedPaymentEvent;
}

export class MockGateway implements PaymentGateway {
  constructor(private readonly config: ConfigService) {}

  private secret() { return this.config.get<string>('MOCK_WEBHOOK_SECRET') ?? this.config.getOrThrow('JWT_ACCESS_SECRET'); }

  async createOrder(input: { amount: number; currency: string; reference: string }) {
    return { provider: 'MOCK', orderId: `mock_order_${randomUUID()}`, amount: input.amount, currency: input.currency, receipt: input.reference, checkout: { mode: 'mock' } };
  }

  verify(raw: Buffer, headers: Record<string, string | string[] | undefined>) {
    const signature = headers['x-mock-signature'];
    const value = Array.isArray(signature) ? signature[0] : signature;
    const expected = hmac(this.secret(), raw);
    return typeof value === 'string' && safeEqual(value, expected);
  }

  normalize(payload: any): NormalizedPaymentEvent {
    return { eventId: String(payload.eventId), eventType: payload.status === 'FAILED' ? 'payment.failed' : 'payment.succeeded', orderId: String(payload.orderId), paymentId: String(payload.paymentId), status: payload.status === 'FAILED' ? 'FAILED' : 'SUCCESS', amount: Number(payload.amount), currency: String(payload.currency ?? 'INR') };
  }

  sign(raw: Buffer) { return hmac(this.secret(), raw); }
}

export class RazorpayGateway implements PaymentGateway {
  constructor(private readonly config: ConfigService) {}

  async createOrder(input: { amount: number; currency: string; reference: string }) {
    const auth = Buffer.from(`${this.config.getOrThrow('RAZORPAY_KEY_ID')}:${this.config.getOrThrow('RAZORPAY_KEY_SECRET')}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/orders', { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: Math.round(input.amount * 100), currency: input.currency, receipt: input.reference, notes: { reservationReference: input.reference } }) });
    if (!response.ok) throw new Error(`Razorpay order creation failed with ${response.status}`);
    return response.json() as Promise<Record<string, unknown>>;
  }

  verify(raw: Buffer, headers: Record<string, string | string[] | undefined>) {
    const signature = headers['x-razorpay-signature'];
    const value = Array.isArray(signature) ? signature[0] : signature;
    const expected = createHmac('sha256', this.config.getOrThrow('RAZORPAY_WEBHOOK_SECRET')).update(raw).digest('hex');
    return typeof value === 'string' && safeEqual(value, expected);
  }

  normalize(payload: any): NormalizedPaymentEvent {
    const entity = payload.payload?.payment?.entity ?? {};
    const eventType = String(payload.event ?? 'payment.failed');
    return { eventId: String(payload.event_id ?? entity.id), eventType, orderId: String(entity.order_id), paymentId: String(entity.id), status: eventType === 'payment.captured' || eventType === 'order.paid' ? 'SUCCESS' : 'FAILED', amount: Number(entity.amount ?? 0) / 100, currency: String(entity.currency ?? 'INR') };
  }
}
