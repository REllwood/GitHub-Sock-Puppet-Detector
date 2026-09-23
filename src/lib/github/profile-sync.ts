import { prisma } from '@/lib/db';
import type { GitHubAPIClient, UserEvent } from './api-client';
import { upsertAccount } from './store';

const PROFILE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SUMMARY_REPOSITORIES = 20;

export interface ActivitySummary {
  eventsSampled: number;
  repositories: Array<{ name: string; events: number }>;
  syncedAt: string;
}

export function needsProfileSync(
  account: { profileSyncedAt: Date | null },
  now: Date = new Date()
): boolean {
  return (
    !account.profileSyncedAt ||
    now.getTime() - account.profileSyncedAt.getTime() > PROFILE_MAX_AGE_MS
  );
}

/**
 * Summarise which repositories an account has recently been active in
 */
export function summariseActivity(events: UserEvent[], now: Date = new Date()): ActivitySummary {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.repo.name, (counts.get(event.repo.name) ?? 0) + 1);
  }

  const repositories = Array.from(counts.entries())
    .map(([name, count]) => ({ name, events: count }))
    .sort((a, b) => b.events - a.events)
    .slice(0, MAX_SUMMARY_REPOSITORIES);

  return {
    eventsSampled: events.length,
    repositories,
    syncedAt: now.toISOString(),
  };
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 404;
}

/**
 * Fetch an account's full GitHub profile and recent public activity.
 * Webhook payloads don't include the account creation date or email, so this is
 * what makes the account age detector work.
 */
export async function syncAccountProfile(
  client: GitHubAPIClient,
  account: { id: string; githubId: number; username: string; email: string | null }
): Promise<'synced' | 'not_found'> {
  const now = new Date();

  let user;
  try {
    user = await client.getUserById(account.githubId);
  } catch (error) {
    if (isNotFound(error)) {
      // Deleted or suspended account - don't keep retrying
      await prisma.account.update({
        where: { id: account.id },
        data: { profileSyncedAt: now },
      });
      return 'not_found';
    }
    throw error;
  }

  let events: UserEvent[] = [];
  try {
    events = await client.getUserPublicEvents(user.login);
  } catch (error) {
    console.warn(`Could not fetch public events for ${user.login}:`, error);
  }

  if (user.login !== account.username) {
    // Renamed since we last saw them; this also releases the name from any stale record
    await upsertAccount({ id: user.id, login: user.login, type: user.type });
  }

  await prisma.account.update({
    where: { id: account.id },
    data: {
      profileData: JSON.parse(JSON.stringify(user)),
      email: user.email || account.email,
      accountType: user.type,
      createdAt: new Date(user.created_at),
      profileSyncedAt: now,
      activitySummary: JSON.parse(JSON.stringify(summariseActivity(events, now))),
    },
  });

  return 'synced';
}
