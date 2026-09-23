import {
  analyseCoordination,
  scorePair,
  type RepositoryComment,
} from '@/lib/detection/coordinated-behaviour';

const HOUR = 60 * 60 * 1000;
const T0 = new Date('2026-01-01T00:00:00Z').getTime();

function c(username: string, content: string, hoursAfter: number, thread: number | null = 1) {
  return { username, content, createdAt: new Date(T0 + hoursAfter * HOUR), thread };
}

describe('coordinated behaviour', () => {
  it('scores near-identical wording highest', () => {
    expect(scorePair({ similarity: 1, duplicate: true, sharedThreads: new Set() })).toBe(85);
    expect(scorePair({ similarity: 0.65, duplicate: false, sharedThreads: new Set([1]) })).toBe(75);
    expect(scorePair({ similarity: 0.1, duplicate: false, sharedThreads: new Set([1]) })).toBe(0);
  });

  it('gives only weak evidence for accounts that merely share threads', () => {
    expect(scorePair({ similarity: 0, duplicate: false, sharedThreads: new Set([1, 2, 3]) })).toBe(
      20
    );
  });

  it('flags accounts posting the same message, even on different threads', () => {
    const message = 'This project is abandoned and needs a new maintainer immediately';
    const { byAccount, clusters } = analyseCoordination([
      c('puppet-a', message, 0, 10),
      c('puppet-b', message, 30, 20),
      c('bystander', 'The release notes are missing the breaking change to the config file', 1, 10),
    ]);

    expect(byAccount.get('puppet-a')).toMatchObject({ detected: true, score: 85 });
    expect(byAccount.get('puppet-a')?.reason).toContain('near-identical comments to puppet-b');
    expect(byAccount.get('bystander')?.detected).toBe(false);
    expect(clusters).toEqual([
      expect.objectContaining({
        accounts: ['puppet-a', 'puppet-b'],
        patterns: ['near-identical comments'],
      }),
    ]);
  });

  it('does not treat short low-information comments as coordination', () => {
    const comments: RepositoryComment[] = ['a', 'b', 'c'].map((name, i) => c(name, '+1', i));

    const { byAccount, clusters } = analyseCoordination(comments);

    expect(Array.from(byAccount.values()).every(result => !result.detected)).toBe(true);
    expect(clusters).toHaveLength(0);
  });

  it('adds a bonus for accounts in a wider coordinated group', () => {
    const { byAccount, clusters } = analyseCoordination([
      c('x1', 'Merge the patches now because the maintainer keeps ignoring contributors', 0),
      c('x2', 'The maintainer keeps ignoring contributors so merge the patches now please', 1),
      c('x3', 'Please merge now, the maintainer keeps ignoring all the contributors here', 2),
    ]);

    expect(clusters[0].accounts).toEqual(['x1', 'x2', 'x3']);
    expect(byAccount.get('x1')!.score).toBeGreaterThan(85);
  });
});
