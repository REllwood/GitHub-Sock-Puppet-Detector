import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({ account });
  } catch (error) {
    console.error('Failed to get account:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
