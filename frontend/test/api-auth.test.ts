import assert from 'node:assert/strict';
import test from 'node:test';
import { apiRequest, setAccessToken } from '../src/lib/api';

test('expired protected sessions clear auth state and redirect to login', async () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalFetch = globalThis.fetch;
  const values = new Map<string, string>();
  const location = {
    pathname: '/rainwood/admin/agents',
    search: '',
    href: '',
    replace(value: string) { this.href = value; },
  };
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      length: 0,
      key: () => null,
    },
    dispatchEvent: () => true,
    location,
  } as unknown as Window;
  setAccessToken('expired-token', 'ADMIN');
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  try {
    await assert.rejects(apiRequest('/users/agents'), /Unauthorized/);
    assert.equal(values.has('rainwood_access_token'), false);
    assert.equal(values.has('rainwood_user_role'), false);
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    assert.equal(location.href, `${basePath}/login?next=%2Frainwood%2Fadmin%2Fagents`);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) (globalThis as { window?: unknown }).window = originalWindow;
    else delete (globalThis as { window?: unknown }).window;
  }
});
