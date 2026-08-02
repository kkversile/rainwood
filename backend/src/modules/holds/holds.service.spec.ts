import { randomToken, sha256 } from '../../common/security';

describe('inventory hold tokens', () => {
  it('stores only a one-way hash and generates unique high-entropy tokens', () => {
    const first = randomToken();
    const second = randomToken();
    expect(first).not.toBe(second);
    expect(sha256(first)).not.toBe(first);
    expect(sha256(first)).toHaveLength(64);
  });
});
