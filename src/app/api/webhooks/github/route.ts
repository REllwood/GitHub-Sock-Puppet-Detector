import { NextRequest, NextResponse } from 'next/server';
import {
  validateWebhookRequest,
  getWebhookEventType,
  getWebhookDeliveryId,
} from '@/lib/github/webhook-validator';
import {
  handleInstallation,
  handleInstallationRepositories,
  handleIssueComment,
  handlePullRequestReviewComment,
  type InstallationEvent,
  type InstallationRepositoriesEvent,
  type IssueCommentEvent,
  type PullRequestReviewCommentEvent,
  type WebhookResult,
} from '@/lib/github/webhook-handlers';

export async function POST(req: NextRequest) {
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

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  console.log(`Received webhook: ${eventType} (delivery: ${deliveryId})`);

  try {
    let result: WebhookResult;

    switch (eventType) {
      case 'ping':
        result = { status: 'ignored', reason: 'pong' };
        break;

      case 'issue_comment':
        result = await handleIssueComment(payload as IssueCommentEvent);
        break;

      case 'pull_request_review_comment':
        result = await handlePullRequestReviewComment(payload as PullRequestReviewCommentEvent);
        break;

      case 'installation':
        result = await handleInstallation(payload as InstallationEvent);
        break;

      case 'installation_repositories':
        result = await handleInstallationRepositories(payload as InstallationRepositoriesEvent);
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
        result = { status: 'ignored', reason: `Unhandled event type: ${eventType}` };
    }

    return NextResponse.json({ received: true, event: eventType, ...result });
  } catch (error) {
    console.error(`Webhook processing error (delivery: ${deliveryId}):`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
