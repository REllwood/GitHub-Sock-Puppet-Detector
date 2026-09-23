import { bySeverity, percentage } from '@/lib/format';
import { getAppInstallUrl } from '@/lib/app-config';

describe('display helpers', () => {
  it('sorts by severity, most severe first', () => {
    const sorted = ['medium', 'low', 'critical', 'high']
      .map(severity => ({ severity }))
      .sort(bySeverity);

    expect(sorted.map(s => s.severity)).toEqual(['critical', 'high', 'medium', 'low']);
  });

  it('returns 0% for an empty total instead of NaN', () => {
    expect(percentage(0, 0)).toBe(0);
    expect(percentage(1, 4)).toBe(25);
  });

  it('builds the install link from GITHUB_APP_SLUG', () => {
    delete process.env.GITHUB_APP_SLUG;
    expect(getAppInstallUrl()).toBeNull();

    process.env.GITHUB_APP_SLUG = 'my-detector';
    expect(getAppInstallUrl()).toBe('https://github.com/apps/my-detector/installations/new');
    delete process.env.GITHUB_APP_SLUG;
  });
});
