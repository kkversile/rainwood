import { ConfigService } from '@nestjs/config';
import { MockGateway } from './payment-provider';

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
