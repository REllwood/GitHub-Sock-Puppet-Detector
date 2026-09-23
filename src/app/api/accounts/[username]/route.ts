import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { jsonResponse } from '@/lib/http';

export async function GET(req: NextRequest, { params }: { params: { username: string } }) {
  try {
    const account = await prisma.account.findUnique({
      where: { username: params.username },
      include: {
        comments: {
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
        analyses: {
          include: {
            analysis: {
              include: { repository: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!account) {
      return jsonResponse({ error: 'Account not found' }, { status: 404 });
    }

    return jsonResponse({ account });
  } catch (error) {
    console.error('Failed to get account:', error);
    return jsonResponse({ error: 'Internal server error' }, { status: 500 });
  }
}
