import { createRetryableSubmission } from './retryable-submission';

/** Keep a consumed hold and uploaded proof available after a transient failure. */
export function createOfflineBookingSubmission() {
  let uploaded: { file: File; id: string } | null = null;
  let booking: { signature: string; reference: string } | null = null;
  let pending: Promise<{ reference: string }> | null = null;
  const payment = createRetryableSubmission<{ amount: number; mode: string; reference?: string; proofFileId: string }, unknown>();
  return {
    hasBooking: () => Boolean(booking),
    submit(input: { token: string; guest: object; file: File; amount: number; mode: string; reference?: string }, actions: {
      upload: (file: File) => Promise<{ id: string }>;
      create: () => Promise<{ reference: string }>;
      pay: (reference: string, body: { amount: number; mode: string; reference?: string; proofFileId: string; idempotencyKey: string }) => Promise<unknown>;
    }) {
      if (pending) return pending;
      pending = Promise.resolve().then(async () => {
        const signature = JSON.stringify([input.token, input.guest]);
        if (booking && booking.signature !== signature) throw new Error('This booking was already created. Restore the submitted guest details to retry the proof submission.');
        if (!['application/pdf', 'image/png', 'image/jpeg'].includes(input.file.type) || input.file.size > 5 * 1024 * 1024 || input.file.size === 0) throw new Error('Upload a PNG, JPEG, or PDF proof up to 5 MB.');
        // A rejected upload must never consume room inventory or create a booking.
        if (uploaded?.file !== input.file) uploaded = { file: input.file, id: (await actions.upload(input.file)).id };
        if (!booking) booking = { signature, reference: (await actions.create()).reference };
        await payment.submit({ amount: input.amount, mode: input.mode, reference: input.reference, proofFileId: uploaded.id }, (body) => actions.pay(booking!.reference, body));
        return { reference: booking.reference };
      }).finally(() => { pending = null; });
      return pending;
    },
  };
}
