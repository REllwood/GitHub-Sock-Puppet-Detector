import { detectAccountAge, formatDays, getAccountAgeInDays } from '@/lib/detection/account-age';

describe('Account Age Detection', () => {
  it('should detect very new accounts (< 7 days)', () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

    const result = detectAccountAge(createdAt);

    expect(result.detected).toBe(true);
    expect(result.score).toBe(100);
  });

  it('should detect new accounts (< 30 days)', () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000); // 20 days ago

    const result = detectAccountAge(createdAt);

    expect(result.detected).toBe(true);
    expect(result.score).toBe(80);
  });

  it('should not detect old accounts', () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000); // 200 days ago

    const result = detectAccountAge(createdAt);

    expect(result.detected).toBe(false);
    expect(result.score).toBe(0);
  });

  it('does not flag accounts whose creation date is not yet known', () => {
    const result = detectAccountAge(null);

    expect(result.detected).toBe(false);
    expect(result.score).toBe(0);
  });

  it('calculates account age in days', () => {
    const now = new Date('2026-09-23T00:00:00Z');

    expect(getAccountAgeInDays(new Date('2026-09-13T00:00:00Z'), now)).toBe(10);
    expect(getAccountAgeInDays(null, now)).toBeNull();
  });

  it('pluralises day counts', () => {
    expect(formatDays(1)).toBe('1 day');
    expect(formatDays(2)).toBe('2 days');
  });
});
