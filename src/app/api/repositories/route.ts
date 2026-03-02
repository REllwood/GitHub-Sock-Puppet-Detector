import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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

    return NextResponse.json({ repositories });
  } catch (error) {
    console.error('Failed to get repositories:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
