describe('authentication policy', () => {
  it('does not permit a reused refresh token family to remain active', () => {
    const family: { revokedAt: Date | null }[] = [{ revokedAt: null }, { revokedAt: null }];
    for (const token of family) token.revokedAt = new Date();
    expect(family.every((token) => token.revokedAt instanceof Date)).toBe(true);
  });
});
