import { AgentPaymentPolicy } from '@prisma/client';
import { PaymentMilestoneDueType } from '@prisma/client';
import { calculateAgentBookingPaymentTerms, calculateAgentPaymentSchedule, calculateReservationPaymentSchedule, validatePaymentMilestones } from './agent-payment-terms';

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
  it('calculates due-now milestones as thresholds pass', () => {
    const terms = [
      { percentage: 10, dueType: PaymentMilestoneDueType.ON_BOOKING },
      { percentage: 30, dueType: PaymentMilestoneDueType.DAYS_BEFORE_CHECKIN, daysBeforeCheckIn: 20 },
      { percentage: 20, dueType: PaymentMilestoneDueType.DAYS_BEFORE_CHECKIN, daysBeforeCheckIn: 10 },
      { percentage: 40, dueType: PaymentMilestoneDueType.DAYS_BEFORE_CHECKIN, daysBeforeCheckIn: 0 },
    ];
    const checkIn = new Date('2026-11-30T00:00:00.000Z');
    expect(calculateAgentPaymentSchedule(20000, checkIn, new Date('2026-10-31T12:00:00.000Z'), terms).requiredAtBooking).toBe(2000);
    expect(calculateAgentPaymentSchedule(20000, checkIn, new Date('2026-11-15T12:00:00.000Z'), terms).requiredAtBooking).toBe(8000);
    expect(calculateAgentPaymentSchedule(20000, checkIn, new Date('2026-11-25T12:00:00.000Z'), terms).requiredAtBooking).toBe(12000);
    expect(calculateAgentPaymentSchedule(20000, checkIn, new Date('2026-11-30T12:00:00.000Z'), terms).requiredAtBooking).toBe(20000);
  });
  it('merges duplicate due points and preserves exact currency totals', () => {
    const normalized = validatePaymentMilestones([
      { percentage: 20, dueType: PaymentMilestoneDueType.DAYS_BEFORE_CHECKIN, daysBeforeCheckIn: 15 },
      { percentage: 30, dueType: PaymentMilestoneDueType.DAYS_BEFORE_CHECKIN, daysBeforeCheckIn: 15 },
      { percentage: 50, dueType: PaymentMilestoneDueType.ON_BOOKING },
    ]);
    expect(normalized).toEqual(expect.arrayContaining([expect.objectContaining({ percentage: 50, daysBeforeCheckIn: 15 })]));
    const schedule = calculateAgentPaymentSchedule(10001, new Date('2026-11-30T00:00:00.000Z'), new Date('2026-11-01T00:00:00.000Z'), [
      { percentage: 33.33, dueType: PaymentMilestoneDueType.ON_BOOKING },
      { percentage: 33.33, dueType: PaymentMilestoneDueType.DAYS_BEFORE_CHECKIN, daysBeforeCheckIn: 10 },
      { percentage: 33.34, dueType: PaymentMilestoneDueType.DAYS_BEFORE_CHECKIN, daysBeforeCheckIn: 0 },
    ]);
    expect(schedule.schedule.reduce((sum, item) => sum + item.amount, 0)).toBe(10001);
  });
  it('does not treat On Booking as zero days before check-in', () => {
    expect(() => validatePaymentMilestones([{ percentage: 100, dueType: PaymentMilestoneDueType.ON_BOOKING, daysBeforeCheckIn: 0 }])).toThrow('must be empty');
    expect(() => validatePaymentMilestones([{ percentage: 100, dueType: PaymentMilestoneDueType.DAYS_BEFORE_CHECKIN }])).toThrow('is required');
  });
  it('allocates verified payments and exposes due versus future milestones', () => {
    const snapshot = { milestones: [
      { percentage: 10, dueType: 'ON_BOOKING', daysBeforeCheckIn: null, amount: 2000, dueAt: '2026-09-01T10:00:00.000Z', sortOrder: 0 },
      { percentage: 30, dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: 20, amount: 6000, dueAt: '2026-09-20T00:00:00.000Z', sortOrder: 1 },
      { percentage: 20, dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: 10, amount: 4000, dueAt: '2026-10-01T00:00:00.000Z', sortOrder: 2 },
      { percentage: 40, dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: 0, amount: 8000, dueAt: '2026-11-30T00:00:00.000Z', sortOrder: 3 },
    ] };
    const result = calculateReservationPaymentSchedule(snapshot, 2000, new Date('2026-09-23T12:00:00.000Z'));
    expect(result.milestones.map((item) => item.status)).toEqual(['PAID', 'DUE', 'UPCOMING', 'UPCOMING']);
    expect(result.milestones.find((item) => item.status === 'DUE')?.outstandingAmount).toBe(6000);
    expect(result.outstandingAmount).toBe(18000);
  });
});
