export function bookingConfirmationState(status: string, paymentStatus: string) {
  if (status === 'CANCELLED') return { label: 'Cancelled', title: 'Booking cancelled', tone: 'warn' };
  if (status === 'NO_SHOW') return { label: 'No show', title: 'Booking marked no show', tone: 'warn' };
  if (status === 'EXPIRED') return { label: 'Expired', title: 'Booking expired', tone: 'warn' };
  if (status === 'COMPLETED') return { label: 'Completed', title: 'Stay completed', tone: 'ok' };
  if (status === 'CONFIRMED') return { label: 'Confirmed', title: 'Booking confirmed', tone: 'ok' };
  return { label: paymentStatus === 'PENDING' ? 'Pending approval' : 'Pending confirmation', title: 'Booking submitted', tone: 'warn' };
}
