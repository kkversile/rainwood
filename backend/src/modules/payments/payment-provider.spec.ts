import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { MockGateway, RazorpayGateway } from './payment-provider';

describe('mock payment provider', () => {
  const config = new ConfigService({ MOCK_WEBHOOK_SECRET: 'unit-test-secret' });

  it('creates realistic orders and verifies signed events', async () => {
    const gateway = new MockGateway(config);
    const order = await gateway.createOrder({ amount: 1200, currency: 'INR', reference: 'RW-TEST' });
    const raw = Buffer.from(JSON.stringify({ eventId: 'evt-1', orderId: order.orderId, paymentId: 'pay-1', amount: 1200, currency: 'INR', status: 'SUCCESS' }));
    const signature = gateway.sign(raw);
    expect(gateway.verify(raw, { 'x-mock-signature': signature })).toBe(true);
    expect(gateway.verify(raw, { 'x-mock-signature': 'bad' })).toBe(false);
    expect(gateway.normalize(JSON.parse(raw.toString())).status).toBe('SUCCESS');
  });
});

describe('Razorpay Standard Checkout signatures', () => {
  it('accepts only the HMAC-SHA256(order_id|payment_id) signature', () => {
    const secret = 'razorpay-test-secret';
    const gateway = new RazorpayGateway(new ConfigService({ RAZORPAY_KEY_SECRET: secret }));
    const expected = createHmac('sha256', secret).update('order_test|pay_test').digest('hex');
    expect(gateway.verifyPaymentSignature('order_test', 'pay_test', expected)).toBe(true);
    expect(gateway.verifyPaymentSignature('order_test', 'pay_test', 'invalid')).toBe(false);
  });
});
