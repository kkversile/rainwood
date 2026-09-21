import assert from 'node:assert/strict';
import test from 'node:test';
import { canPendingAgentVisit, onboardingStatusLabel } from '../src/lib/agent-onboarding';

test('onboarding status labels are business-friendly', () => {
  assert.equal(onboardingStatusLabel('KYC_PENDING'), 'KYC Pending');
  assert.equal(onboardingStatusLabel('UNDER_REVIEW'), 'Under Review');
  assert.equal(onboardingStatusLabel('ACTIVE'), 'Active');
  assert.equal(onboardingStatusLabel('DEACTIVATED'), 'Deactivated');
});

test('pending agents can only visit onboarding routes', () => {
  assert.equal(canPendingAgentVisit('/agent/profile'), true);
  assert.equal(canPendingAgentVisit('/agent/kyc'), true);
  assert.equal(canPendingAgentVisit('/agent/onboarding'), true);
  assert.equal(canPendingAgentVisit('/agent/book'), false);
  assert.equal(canPendingAgentVisit('/agent/bookings'), false);
  assert.equal(canPendingAgentVisit('/agent/wallet'), false);
});
