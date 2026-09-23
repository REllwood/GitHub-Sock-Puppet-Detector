import { detectSingleRepositoryActivity } from '@/lib/detection/single-repo';

const REPO = 'octo-org/widgets';

function summary(here: number, elsewhere: Array<[string, number]> = []) {
  return {
    eventsSampled: here + elsewhere.reduce((sum, [, n]) => sum + n, 0),
    repositories: [
      { name: REPO, events: here },
      ...elsewhere.map(([name, events]) => ({ name, events })),
    ],
  };
}

describe('single repository activity', () => {
  it('flags accounts whose public activity is almost all in this repository', () => {
    const result = detectSingleRepositoryActivity(summary(10), {}, REPO);

    expect(result).toMatchObject({ detected: true, score: 80, evaluated: true });
  });

  it('does not flag accounts active across many repositories', () => {
    const result = detectSingleRepositoryActivity(
      summary(2, [
        ['a/one', 10],
        ['b/two', 10],
        ['c/three', 10],
        ['d/four', 10],
      ]),
      { public_repos: 20, followers: 40 },
      REPO
    );

    expect(result).toMatchObject({ detected: false, score: 0 });
  });

  it('adds weight for an empty profile', () => {
    const result = detectSingleRepositoryActivity(
      summary(10),
      { public_repos: 0, followers: 0 },
      REPO
    );

    expect(result.score).toBe(100);
    expect(result.reason).toContain('No public repositories or followers');
  });

  it('is not evaluated before the profile has been synced', () => {
    const result = detectSingleRepositoryActivity(null, { login: 'someone' }, REPO);

    expect(result).toMatchObject({ detected: false, score: 0, evaluated: false });
  });
});
