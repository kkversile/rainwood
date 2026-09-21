import { AgentPaymentPolicy } from '@prisma/client';
import { calculateAgentBookingPaymentTerms } from './agent-payment-terms';

describe('agent booking payment terms', () => {
  it('calculates a 25 percent advance', () => {
    expect(calculateAgentBookingPaymentTerms(20000, { agentPaymentPolicy: AgentPaymentPolicy.PERCENTAGE, bookingPaymentPercent: 25 })).toMatchObject({ requiredAtBooking: 5000, balanceAtBooking: 15000, percentage: 25 });
  });
  it('calculates a 50 percent advance', () => {
    expect(calculateAgentBookingPaymentTerms(20000, { agentPaymentPolicy: AgentPaymentPolicy.PERCENTAGE, bookingPaymentPercent: 50 })).toMatchObject({ requiredAtBooking: 10000, balanceAtBooking: 10000 });
  });
  it('keeps credit bookings confirmed without a required payment', () => {
    expect(calculateAgentBookingPaymentTerms(20000, { agentPaymentPolicy: AgentPaymentPolicy.CREDIT })).toMatchObject({ requiredAtBooking: 0, balanceAtBooking: 20000, percentage: null });
  });
  it('preserves legacy full-payment behaviour at 100 percent', () => {
    expect(calculateAgentBookingPaymentTerms(20000, { agentPaymentPolicy: AgentPaymentPolicy.PERCENTAGE, bookingPaymentPercent: 100 })).toMatchObject({ requiredAtBooking: 20000, balanceAtBooking: 0 });
  });
});
