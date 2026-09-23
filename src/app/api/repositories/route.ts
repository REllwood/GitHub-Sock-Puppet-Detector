import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { jsonResponse } from '@/lib/http';
import { authoriseApiRequest, isErrorResponse } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await authoriseApiRequest(req);
    if (isErrorResponse(auth)) return auth;

    const repositories = await prisma.repository.findMany({
      where: auth.repositoryFilter,
      include: {
        _count: {
          select: {
            analyses: true,
            alerts: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return jsonResponse({ repositories });
  } catch (error) {
    console.error('Failed to get repositories:', error);
    return jsonResponse({ error: 'Internal server error' }, { status: 500 });
  }
}
