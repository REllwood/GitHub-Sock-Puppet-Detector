import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { queueRepositoryAnalysis } from '@/lib/queue/setup';

export async function POST(
  req: NextRequest,
  { params }: { params: { owner: string; repo: string } }
) {
  try {
    const { owner, repo } = params;
    const fullName = `${owner}/${repo}`;

    // Find repository
    const repository = await prisma.repository.findFirst({
      where: { fullName },
    });

    if (!repository) {
      return NextResponse.json(
        { error: 'Repository not found. Please install the GitHub App first.' },
        { status: 404 }
      );
    }

    // Check if there's already an analysis in progress
    const existingAnalysis = await prisma.analysis.findFirst({
      where: {
        repositoryId: repository.id,
        status: { in: ['pending', 'processing'] },
      },
    });

    if (existingAnalysis) {
      return NextResponse.json(
        {
          message: 'Analysis already in progress',
          analysisId: existingAnalysis.id,
        },
        { status: 202 }
      );
    }

    // Queue analysis
    await queueRepositoryAnalysis({
      repositoryId: repository.id,
      installationId: repository.installationId,
      triggeredBy: 'manual',
    });

    return NextResponse.json({
      message: 'Analysis queued successfully',
      repository: fullName,
    });
  } catch (error) {
    console.error('Failed to queue analysis:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { owner: string; repo: string } }
) {
  try {
    const { owner, repo } = params;
    const fullName = `${owner}/${repo}`;

    // Find repository
    const repository = await prisma.repository.findFirst({
      where: { fullName },
      include: {
        analyses: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            accountResults: {
              include: { account: true },
              orderBy: { riskScore: 'desc' },
            },
          },
        },
      },
    });

    if (!repository) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    return NextResponse.json({
      repository: {
        id: repository.id,
        fullName: repository.fullName,
        installationId: repository.installationId,
      },
      analyses: repository.analyses,
    });
  } catch (error) {
    console.error('Failed to get repository analyses:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
