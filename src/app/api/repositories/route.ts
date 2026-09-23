import { prisma } from '@/lib/db';
import { jsonResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const repositories = await prisma.repository.findMany({
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
