import { NextRequest, NextResponse } from 'next/server';
import {
  validateWebhookRequest,
  getWebhookEventType,
  getWebhookDeliveryId,
} from '@/lib/github/webhook-validator';
import { prisma } from '@/lib/db';
import type {
  WebhookIssueCommentEvent,
  WebhookPullRequestReviewCommentEvent,
  WebhookInstallationEvent,
} from '@/types/github';

export async function POST(req: NextRequest) {
  try {
    // Get raw body for signature validation
    const body = await req.text();
    const headers: Record<string, string> = {};

    // Convert Headers to plain object
    req.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Validate webhook signature
    if (!validateWebhookRequest(body, headers)) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const eventType = getWebhookEventType(headers);
    const deliveryId = getWebhookDeliveryId(headers);

    if (!eventType) {
      return NextResponse.json({ error: 'Missing event type' }, { status: 400 });
    }

    console.log(`Received webhook: ${eventType} (delivery: ${deliveryId})`);

      const payload = JSON.parse(body) as unknown;

    // Handle different event types
    switch (eventType) {
      case 'issue_comment':
        await handleIssueComment(payload as WebhookIssueCommentEvent);
        break;

      case 'pull_request_review_comment':
        await handlePullRequestReviewComment(payload as WebhookPullRequestReviewCommentEvent);
        break;

      case 'installation':
        await handleInstallation(payload as WebhookInstallationEvent);
        break;

      case 'installation_repositories':
        await handleInstallationRepositories(payload);
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    return NextResponse.json({ received: true, event: eventType });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function handleIssueComment(payload: WebhookIssueCommentEvent) {
  if (payload.action !== 'created') {
    return; // Only process new comments
  }

  const { comment, issue, repository, installation } = payload;

  try {
    // Ensure repository exists in database
    let repo = await prisma.repository.findUnique({
      where: { githubId: repository.id },
    });

    if (!repo) {
      repo = await prisma.repository.create({
        data: {
          githubId: repository.id,
          fullName: repository.full_name,
          installationId: installation.id,
        },
      });
    }

    // Ensure account exists
    let account = await prisma.account.findUnique({
      where: { githubId: comment.user.id },
    });

    if (!account) {
      account = await prisma.account.create({
        data: {
          githubId: comment.user.id,
          username: comment.user.login,
          email: comment.user.email || null,
          createdAt: new Date(comment.user.created_at),
          profileData: JSON.parse(JSON.stringify(comment.user)),
        },
      });
    }

    // Store comment
    await prisma.comment.upsert({
      where: { githubId: comment.id },
      create: {
        githubId: comment.id,
        accountId: account.id,
        repositoryId: repo.id,
        content: comment.body,
        createdAt: new Date(comment.created_at),
        issueNumber: issue.number,
      },
      update: {
        content: comment.body,
      },
    });

    // Queue analysis job
    const { queueCommentAnalysis } = await import('@/lib/queue/setup');
    await queueCommentAnalysis({
      commentId: comment.id.toString(),
      accountId: account.id,
      repositoryId: repo.id,
      installationId: installation.id,
    });

    console.log(
      `Stored comment ${comment.id} from ${comment.user.login} on ${repository.full_name}#${issue.number}`
    );
  } catch (error) {
    console.error('Error handling issue comment:', error);
    throw error;
  }
}

async function handlePullRequestReviewComment(payload: WebhookPullRequestReviewCommentEvent) {
  if (payload.action !== 'created') {
    return;
  }

  const { comment, pull_request, repository, installation } = payload;

  try {
    let repo = await prisma.repository.findUnique({
      where: { githubId: repository.id },
    });

    if (!repo) {
      repo = await prisma.repository.create({
        data: {
          githubId: repository.id,
          fullName: repository.full_name,
          installationId: installation.id,
        },
      });
    }

    let account = await prisma.account.findUnique({
      where: { githubId: comment.user.id },
    });

    if (!account) {
      account = await prisma.account.create({
        data: {
          githubId: comment.user.id,
          username: comment.user.login,
          email: comment.user.email || null,
          createdAt: new Date(comment.user.created_at),
          profileData: JSON.parse(JSON.stringify(comment.user)),
        },
      });
    }

    await prisma.comment.upsert({
      where: { githubId: comment.id },
      create: {
        githubId: comment.id,
        accountId: account.id,
        repositoryId: repo.id,
        content: comment.body,
        createdAt: new Date(comment.created_at),
        prNumber: pull_request.number,
      },
      update: {
        content: comment.body,
      },
    });

    // Queue analysis job
    const { queueCommentAnalysis } = await import('@/lib/queue/setup');
    await queueCommentAnalysis({
      commentId: comment.id.toString(),
      accountId: account.id,
      repositoryId: repo.id,
      installationId: installation.id,
    });

    console.log(
      `Stored PR comment ${comment.id} from ${comment.user.login} on ${repository.full_name}#${pull_request.number}`
    );
  } catch (error) {
    console.error('Error handling PR review comment:', error);
    throw error;
  }
}

async function handleInstallation(payload: WebhookInstallationEvent) {
  const { action, installation } = payload;

  try {
    if (action === 'created') {
      await prisma.installation.create({
        data: {
          githubInstallationId: installation.id,
          accountType: installation.target_type,
          accountLogin: installation.account.login,
          targetType: installation.target_type,
          permissions: installation.permissions,
        },
      });
      console.log(`Installation created: ${installation.id}`);
    } else if (action === 'deleted') {
      await prisma.installation.delete({
        where: { githubInstallationId: installation.id },
      });
      console.log(`Installation deleted: ${installation.id}`);
    }
  } catch (error) {
    console.error('Error handling installation:', error);
    throw error;
  }
}

async function handleInstallationRepositories(payload: any) {
  const { action, installation, repositories_added, repositories_removed } = payload;

  try {
    if (action === 'added' && repositories_added) {
      for (const repo of repositories_added) {
        await prisma.repository.upsert({
          where: { githubId: repo.id },
          create: {
            githubId: repo.id,
            fullName: repo.full_name,
            installationId: installation.id,
          },
          update: {
            fullName: repo.full_name,
            installationId: installation.id,
          },
        });
      }
      console.log(`Added ${repositories_added.length} repositories`);
    }

    if (action === 'removed' && repositories_removed) {
      for (const repo of repositories_removed) {
        await prisma.repository.deleteMany({
          where: { githubId: repo.id },
        });
      }
      console.log(`Removed ${repositories_removed.length} repositories`);
    }
  } catch (error) {
    console.error('Error handling installation repositories:', error);
    throw error;
  }
}
