import { analyseNewcomerBursts, scoreBurst } from '@/lib/detection/temporal-analysis';

const MINUTE = 60 * 1000;
const T0 = new Date('2026-01-01T00:00:00Z').getTime();

function c(username: string, minutesAfter: number, thread: number | null = 1) {
  return { username, content: 'text', createdAt: new Date(T0 + minutesAfter * MINUTE), thread };
}

describe('newcomer burst detection', () => {
  it('scores bursts by size and tightness', () => {
    expect(scoreBurst(2, 0)).toBe(0);
    expect(scoreBurst(3, 5 * 60 * MINUTE)).toBe(50);
    expect(scoreBurst(3, 30 * MINUTE)).toBe(65);
    expect(scoreBurst(8, 30 * MINUTE)).toBe(100);
  });

  it('detects several accounts first appearing on the same thread within hours', () => {
    const { byAccount, clusters } = analyseNewcomerBursts([
      c('new-a', 0),
      c('new-b', 20),
      c('new-c', 45),
      c('elsewhere', 30, 2),
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({
      accounts: ['new-a', 'new-b', 'new-c'],
      thread: 1,
      score: 65,
    });
    expect(byAccount.get('new-b')).toMatchObject({ detected: true, score: 65 });
    expect(byAccount.get('elsewhere')?.detected).toBe(false);
  });

  it('ignores established participants joining a discussion', () => {
    const { clusters } = analyseNewcomerBursts([
      // Regulars who first commented weeks earlier elsewhere
      c('regular-a', 0, 9),
      c('regular-b', 10, 9),
      c('regular-a', 40000, 1),
      c('regular-b', 40010, 1),
      c('newcomer', 40020, 1),
    ]);

    expect(clusters).toHaveLength(0);
  });

  it('does not group arrivals spread over more than the burst window', () => {
    const { clusters } = analyseNewcomerBursts([c('a', 0), c('b', 5 * 60), c('c', 10 * 60)]);

    expect(clusters).toHaveLength(0);
  });
});
