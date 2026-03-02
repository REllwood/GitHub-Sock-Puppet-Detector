import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const analysis = await prisma.analysis.findUnique({
      where: { id: params.id },
      include: {
        repository: true,
        accountResults: {
          include: { account: true },
          orderBy: { riskScore: 'desc' },
        },
      },
    });

    if (!analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('Failed to get analysis:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
