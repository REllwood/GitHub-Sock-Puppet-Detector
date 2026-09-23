/**
 * End-to-end calibration of the detectors and risk scoring on realistic scenarios.
 */
import { analyzeRepository } from '@/lib/detection/analyzer';
import { getRiskLevel } from '@/lib/detection/risk-scorer';

const mockFindUnique = jest.fn();
const mockFindMany = jest.fn();
jest.mock('@/lib/db', () => ({
  prisma: {
    repository: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
    comment: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}));

const REPO = 'octo-org/widgets';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = new Date('2026-06-01T09:00:00Z').getTime();

interface AccountSpec {
  username: string;
  ageDaysAtFirstComment: number | null;
  email?: string | null;
  // Share of public events in this repository and number of repositories active in
  activity?: { eventsHere: number; eventsElsewhere: number; otherRepos: number } | null;
  emptyProfile?: boolean;
}

let accountSeq = 0;
let commentSeq = 0;

function account(spec: AccountSpec, firstCommentAt: number) {
  const id = `acc-${++accountSeq}`;
  const activity =
    spec.activity === undefined
      ? { eventsHere: 3, eventsElsewhere: 40, otherRepos: 8 }
      : spec.activity;

  return {
    id,
    username: spec.username,
    email: spec.email ?? null,
    createdAt:
      spec.ageDaysAtFirstComment === null
        ? null
        : new Date(firstCommentAt - spec.ageDaysAtFirstComment * DAY),
    profileData: spec.emptyProfile
      ? { login: spec.username, public_repos: 0, followers: 0 }
      : { login: spec.username, public_repos: 12, followers: 30 },
    activitySummary: activity && {
      eventsSampled: activity.eventsHere + activity.eventsElsewhere,
      repositories: [
        { name: REPO, events: activity.eventsHere },
        ...Array.from({ length: activity.otherRepos }, (_, i) => ({
          name: `someone/project-${i}`,
          events: Math.max(
            1,
            Math.round(activity.eventsElsewhere / Math.max(1, activity.otherRepos))
          ),
        })),
      ].filter(repo => repo.events > 0),
    },
  };
}

function comment(acc: ReturnType<typeof account>, content: string, at: number, thread: number) {
  return {
    id: `c-${++commentSeq}`,
    accountId: acc.id,
    account: acc,
    repositoryId: 'repo-1',
    content,
    createdAt: new Date(at),
    issueNumber: thread,
    prNumber: null,
  };
}

async function analyse(comments: ReturnType<typeof comment>[]) {
  mockFindUnique.mockResolvedValue({ fullName: REPO });
  mockFindMany.mockResolvedValue(comments);
  const { accountAnalyses, clusters } = await analyzeRepository('repo-1');
  const byName = Object.fromEntries(accountAnalyses.map(a => [a.username, a]));
  return { byName, accountAnalyses, clusters };
}

// Legitimate discussion: long-standing contributors, varied wording, spread over time
function busyLegitimateRepo() {
  const people = [
    'alice',
    'bwhite',
    'chen-li',
    'dmitri',
    'eowyn',
    'fatima',
    'gustavo',
    'hiroshi',
    'ingrid',
    'jkowalski',
    'kwame',
    'lucia',
    'mfarah',
    'nadia',
    'oliver',
    'john1990',
  ];
  const texts = [
    'Segfault in the parser when the input file is empty, stack trace attached below',
    'There is a typo on the installation page, the flag should be --prefix not --perfix',
    'Could we publish arm64 builds? Our CI runners moved to Graviton instances last month',
    'Benchmarks show a 20% regression since v2.3, bisected it to the allocator change',
    'Windows path handling breaks when the directory name contains spaces',
    'Thanks, upgrading to the latest release fixed the crash for me',
    'I rebased onto main and addressed the review feedback, please take another look',
    'The macOS runner keeps timing out on the integration suite, probably a flaky network test',
    'Proposal: expose a plugin API so formatters can be registered without forking',
    'Memory usage grows without bound when streaming files larger than two gigabytes',
    'Question about the licence of the vendored compression library before we ship',
    'Added regression tests covering the unicode normalisation edge cases',
    'Looks good to me once the nit about variable naming is sorted',
    'Is anyone still maintaining the Debian packaging scripts in the contrib folder?',
    'Updated the German translation strings for the new settings dialog',
    'The docs example for custom reporters no longer compiles with the current types',
  ];
  return people.map((name, i) => {
    const at = T0 + i * 7 * HOUR;
    const acc = account({ username: name, ageDaysAtFirstComment: 800 + i * 50 }, at);
    return comment(acc, texts[i], at, 100 + (i % 6));
  });
}

describe('detection scenarios', () => {
  beforeEach(() => {
    accountSeq = 0;
    commentSeq = 0;
  });

  it('A: rates every contributor in a busy legitimate repository as low risk', async () => {
    const { accountAnalyses } = await analyse(busyLegitimateRepo());

    for (const analysis of accountAnalyses) {
      expect(getRiskLevel(analysis.riskScore)).toBe('low');
    }
  });

  it('B: rates an XZ-style pressure campaign by new accounts as high risk or worse', async () => {
    const campaignStart = T0 + 10 * DAY;
    const puppets = [
      {
        username: 'jigarkumar',
        message:
          'Progress will not happen until there is a new maintainer. Patches have been waiting for months, this needs to be merged now',
      },
      {
        username: 'dennis3ns',
        message:
          'Is there any progress on this? Patches have been waiting for months. A new maintainer should be found so this can be merged',
      },
      {
        username: 'JiaT75',
        message:
          'I agree the patches have been waiting too long. Happy to help as a new maintainer so these can be merged',
      },
    ];
    const comments = [
      ...busyLegitimateRepo(),
      ...puppets.map((p, i) => {
        const at = campaignStart + i * 2 * HOUR;
        const acc = account(
          {
            username: p.username,
            ageDaysAtFirstComment: 5 + i * 10,
            activity: { eventsHere: 4, eventsElsewhere: 0, otherRepos: 0 },
            emptyProfile: true,
          },
          at
        );
        return comment(acc, p.message, at, 200);
      }),
    ];

    const { byName, clusters } = await analyse(comments);

    for (const p of puppets) {
      expect(['high', 'critical']).toContain(getRiskLevel(byName[p.username].riskScore));
      expect(byName[p.username].detections.coordinatedBehaviour.detected).toBe(true);
      expect(byName[p.username].detections.temporalClustering.detected).toBe(true);
    }

    expect(byName['JiaT75'].detections.namePattern.detected).toBe(true);
    expect(clusters.some(c => c.type === 'coordination' && c.accounts.length === 3)).toBe(true);

    // The legitimate contributors are unaffected by the campaign
    expect(getRiskLevel(byName['alice'].riskScore)).toBe('low');
  });

  it('C: rates a blatant bot farm as critical', async () => {
    const start = T0 + 20 * DAY;
    const comments = ['user1234', 'user5678', 'test4321', 'user9876'].map((name, i) => {
      const at = start + i * 4 * 60 * 1000;
      const acc = account(
        {
          username: name,
          ageDaysAtFirstComment: 2,
          email: `${name}@mailinator.com`,
          activity: { eventsHere: 5, eventsElsewhere: 0, otherRepos: 0 },
          emptyProfile: true,
        },
        at
      );
      return comment(
        acc,
        'The maintainer is far too slow. Please merge this patch immediately',
        at,
        300
      );
    });

    const { accountAnalyses } = await analyse(comments);

    for (const analysis of accountAnalyses) {
      expect(getRiskLevel(analysis.riskScore)).toBe('critical');
    }
  });

  it('D: does not rate a genuine newcomer as high risk', async () => {
    const at = T0 + 30 * DAY;
    const newcomer = account(
      {
        username: 'sam-dev',
        ageDaysAtFirstComment: 4,
        activity: { eventsHere: 2, eventsElsewhere: 0, otherRepos: 0 },
        emptyProfile: true,
      },
      at
    );
    const comments = [
      ...busyLegitimateRepo(),
      comment(
        newcomer,
        'Found the root cause of the empty file segfault, the reader returns null before the header check',
        at,
        100
      ),
    ];

    const { byName } = await analyse(comments);

    expect(['low', 'medium']).toContain(getRiskLevel(byName['sam-dev'].riskScore));
  });

  it('E: does not rate a "+1" pile-on by established users as high risk', async () => {
    const start = T0 + 40 * DAY;
    const texts = ['+1', 'Same here', '+1, any update?', 'Also seeing this', '+1'];
    const comments = [
      ...busyLegitimateRepo(),
      ...['pat', 'quinn', 'riley', 'sasha', 'taylor'].map((name, i) => {
        const at = start + i * 20 * 60 * 1000;
        const acc = account({ username: name, ageDaysAtFirstComment: 1500 }, at);
        return comment(acc, texts[i], at, 400);
      }),
    ];

    const { byName } = await analyse(comments);

    for (const name of ['pat', 'quinn', 'riley', 'sasha', 'taylor']) {
      expect(['low', 'medium']).toContain(getRiskLevel(byName[name].riskScore));
      expect(byName[name].detections.coordinatedBehaviour.detected).toBe(false);
    }
  });

  it('F: does not flag maintainers who regularly discuss the same threads', async () => {
    const maintainers = ['core-anna', 'core-ben', 'core-cara'];
    const topics = [
      'Reviewed the allocator change, the arena reset path needs a bounds check',
      'Agreed on the release timeline, cutting the branch Thursday after the freeze',
      'The flaky test is a race in the watcher, I will add a barrier',
      'Tagging this for the next minor release since it changes public behaviour',
      'Benchmarked both approaches, the lock free queue wins under contention',
      'Please split the refactor from the bug fix so we can backport the fix',
    ];
    const comments = [];
    for (let thread = 0; thread < 6; thread++) {
      for (let m = 0; m < 3; m++) {
        const at = T0 + thread * 3 * DAY + m * 3 * HOUR;
        const acc = account({ username: maintainers[m], ageDaysAtFirstComment: 2500 }, T0);
        comments.push(
          comment(acc, `${topics[(thread + m) % topics.length]} (${thread})`, at, 500 + thread)
        );
      }
    }

    const { accountAnalyses } = await analyse(comments);

    for (const analysis of accountAnalyses) {
      expect(getRiskLevel(analysis.riskScore)).toBe('low');
    }
  });

  it('G: ignores quoted text when comparing replies', async () => {
    const at = T0 + 50 * DAY;
    const original = account({ username: 'reporter', ageDaysAtFirstComment: 900 }, at);
    const replier = account({ username: 'helper', ageDaysAtFirstComment: 1200 }, at);
    const text = 'The exporter drops every row after the first null value in the timestamp column';
    const comments = [
      comment(original, text, at, 600),
      comment(
        replier,
        `> ${text}\n\nThat was fixed in 2.4.1, try upgrading and let us know`,
        at + HOUR,
        600
      ),
    ];

    const { byName } = await analyse(comments);

    expect(byName['helper'].detections.coordinatedBehaviour.detected).toBe(false);
  });
});
