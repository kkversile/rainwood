import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOfflineBookingSubmission } from '../src/lib/offline-booking-submission';

const input = () => ({ token: 'hold-1', guest: { email: 'guest@rainwood.demo' }, file: new File(['demo proof'], 'demo.pdf', { type: 'application/pdf' }), amount: 6160, mode: 'BANK_TRANSFER', reference: 'DEMO' });
test('proof upload failure leaves the hold unconverted', async () => {
  let creates = 0;
  const submission = createOfflineBookingSubmission();
  await assert.rejects(submission.submit(input(), { upload: async () => { throw new Error('Upload failed'); }, create: async () => { creates++; return { reference: 'RW-1' }; }, pay: async () => {} }), /Upload failed/);
  assert.equal(creates, 0); assert.equal(submission.hasBooking(), false);
});
test('a lost payment response retries the same booking, proof and payment key', async () => {
  const submission = createOfflineBookingSubmission(); const request = input();
  let uploads = 0; let creates = 0; const keys: string[] = [];
  const actions = { upload: async () => { uploads++; return { id: 'proof-1' }; }, create: async () => { creates++; return { reference: 'RW-1' }; }, pay: async (ref: string, body: { idempotencyKey: string }) => { assert.equal(ref, 'RW-1'); keys.push(body.idempotencyKey); if (keys.length === 1) throw new Error('Response lost'); } };
  await assert.rejects(submission.submit(request, actions), /Response lost/);
  assert.equal(submission.hasBooking(), true);
  assert.deepEqual(await submission.submit(request, actions), { reference: 'RW-1' });
  assert.equal(uploads, 1); assert.equal(creates, 1); assert.equal(keys[0], keys[1]);
  await assert.rejects(submission.submit({ ...request, guest: { email: 'changed@rainwood.demo' } }, actions), /already created/);
});
test('duplicate clicks share one submission and invalid files never create bookings', async () => {
  const submission = createOfflineBookingSubmission(); const request = input(); let creates = 0;
  const actions = { upload: async () => ({ id: 'proof-1' }), create: async () => { creates++; return { reference: 'RW-1' }; }, pay: async () => {} };
  const first = submission.submit(request, actions); assert.equal(submission.submit(request, actions), first); await first; assert.equal(creates, 1);
  await assert.rejects(createOfflineBookingSubmission().submit({ ...request, file: new File(['bad'], 'proof.html', { type: 'text/html' }) }, actions), /PNG, JPEG, or PDF/);
  assert.equal(creates, 1);
});
