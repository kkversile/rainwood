import assert from 'node:assert/strict';
import test from 'node:test';
import { API, apiAssetUrl } from '../src/lib/api';

test('apiAssetUrl maps uploaded media to the configured API origin', () => {
  assert.equal(apiAssetUrl('/files/public/file-123'), `${API}/files/public/file-123`);
  assert.equal(apiAssetUrl('http://localhost:4001/api/v1/files/public/file-123'), `${API}/files/public/file-123`);
});

test('apiAssetUrl preserves external and empty image sources', () => {
  assert.equal(apiAssetUrl('https://images.example.com/hotel.jpg'), 'https://images.example.com/hotel.jpg');
  assert.equal(apiAssetUrl(null), '');
});
