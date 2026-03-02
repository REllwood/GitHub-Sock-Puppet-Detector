import { detectAccountAge } from '@/lib/detection/account-age';

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
});
