import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { jsonResponse } from '@/lib/http';
import { requestRepositoryAnalysis } from '@/lib/analysis/service';

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
      return jsonResponse(
        { error: 'Repository not found. Please install the GitHub App first.' },
        { status: 404 }
      );
    }

    const { analysis, alreadyRunning } = await requestRepositoryAnalysis(repository.id);

    return jsonResponse(
      {
        message: alreadyRunning ? 'Analysis already in progress' : 'Analysis queued successfully',
        repository: fullName,
        analysisId: analysis.id,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('Failed to queue analysis:', error);
    return jsonResponse({ error: 'Internal server error' }, { status: 500 });
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
      return jsonResponse({ error: 'Repository not found' }, { status: 404 });
    }

    return jsonResponse({
      repository: {
        id: repository.id,
        fullName: repository.fullName,
        installationId: repository.installationId,
      },
      analyses: repository.analyses,
    });
  } catch (error) {
    console.error('Failed to get repository analyses:', error);
    return jsonResponse({ error: 'Internal server error' }, { status: 500 });
  }
}
