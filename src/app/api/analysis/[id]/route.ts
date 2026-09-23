import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { jsonResponse } from '@/lib/http';
import { authoriseApiRequest, isErrorResponse } from '@/lib/api-auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authoriseApiRequest(req);
    if (isErrorResponse(auth)) return auth;

    const analysis = await prisma.analysis.findFirst({
      where: { id: params.id, repository: auth.repositoryFilter },
      include: {
        repository: true,
        accountResults: {
          include: { account: true },
          orderBy: { riskScore: 'desc' },
        },
      },
    });

    if (!analysis) {
      return jsonResponse({ error: 'Analysis not found' }, { status: 404 });
    }

    return jsonResponse({ analysis });
  } catch (error) {
    console.error('Failed to get analysis:', error);
    return jsonResponse({ error: 'Internal server error' }, { status: 500 });
  }
}
