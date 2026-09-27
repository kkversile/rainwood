import { normalizeGuestEmail, normalizeGuestMobile } from './guest-normalization';

describe('guest normalization', () => {
  it('normalizes email conservatively', () => expect(normalizeGuestEmail('  AARAV@Example.COM ')).toBe('aarav@example.com'));
  it('normalizes mobile punctuation without assuming an international country code', () => {
    expect(normalizeGuestMobile('+91 98765-43210')).toBe('+919876543210');
    expect(normalizeGuestMobile('98765 43210')).toBe('9876543210');
  });
  it('returns null for empty identity values', () => {
    expect(normalizeGuestEmail('  ')).toBeNull();
    expect(normalizeGuestMobile('')).toBeNull();
  });
});
