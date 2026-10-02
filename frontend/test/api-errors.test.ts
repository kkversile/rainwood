import assert from 'node:assert/strict';
import test from 'node:test';
import { friendlyApiError } from '../src/lib/api';

test('maps room conflicts to an actionable operator message', () => {
  assert.equal(friendlyApiError(409, { message: 'ConflictException: active_assignment_exists' }), 'This room is already occupied. Choose another available room.');
});

test('maps permission and missing-record errors without exposing exception class names', () => {
  assert.equal(friendlyApiError(403, { message: 'ForbiddenException: not_allowed' }), 'You do not have permission to perform this action.');
  assert.equal(friendlyApiError(404, { message: 'NotFoundException: missing' }), 'The requested record could not be found. Refresh and try again.');
});
