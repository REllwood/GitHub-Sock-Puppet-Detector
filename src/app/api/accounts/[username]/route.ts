import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { jsonResponse } from '@/lib/http';
import { authoriseApiRequest, isErrorResponse } from '@/lib/api-auth';
import { getScopedAccountRisk } from '@/lib/risk-summary';

export async function GET(req: NextRequest, { params }: { params: { username: string } }) {
  try {
    const auth = await authoriseApiRequest(req);
    if (isErrorResponse(auth)) return auth;

    // Only accounts that have commented in a repository the viewer can access
    const account = await prisma.account.findFirst({
      where: {
        username: params.username,
        comments: { some: { repository: auth.repositoryFilter } },
      },
      include: {
        comments: {
          where: { repository: auth.repositoryFilter },
          include: { repository: { select: { fullName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });

    if (!account) {
      return jsonResponse({ error: 'Account not found' }, { status: 404 });
    }

    const risk = await getScopedAccountRisk(account.id, auth.repositoryFilter);

    return jsonResponse({
      account: {
        id: account.id,
        githubId: account.githubId,
        username: account.username,
        accountType: account.accountType,
        email: account.email,
        createdAt: account.createdAt,
        profileSyncedAt: account.profileSyncedAt,
        riskScore: risk.riskScore,
        flagReasons: risk.flagReasons,
        comments: account.comments,
        analyses: risk.history.slice(0, 20),
      },
    });
  } catch (error) {
    console.error('Failed to get account:', error);
    return jsonResponse({ error: 'Internal server error' }, { status: 500 });
  }
}
