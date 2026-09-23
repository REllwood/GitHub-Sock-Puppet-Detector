import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Alert", "AccountAnalysis", "Analysis", "Comment", "Account", "Repository", "Installation" CASCADE'
  );
}

export function signedWebhookRequest(
  event: string,
  payload: unknown,
  secret = process.env.GITHUB_WEBHOOK_SECRET!
) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

  return new NextRequest('http://localhost/api/webhooks/github', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-github-event': event,
      'x-github-delivery': crypto.randomUUID(),
      'x-hub-signature-256': `sha256=${signature}`,
    },
  });
}

// Minimal user object exactly as GitHub sends it in webhook payloads: no created_at, no email
export function webhookUser(login: string, id: number, type = 'User') {
  return {
    login,
    id,
    node_id: `U_${id}`,
    avatar_url: `https://avatars.githubusercontent.com/u/${id}?v=4`,
    html_url: `https://github.com/${login}`,
    type,
    site_admin: false,
  };
}

export const repository = { id: 1234567890, full_name: 'octo-org/widgets', name: 'widgets' };
export const installation = { id: 424242, node_id: 'MDIz' };

export function issueCommentPayload(
  action: 'created' | 'edited' | 'deleted',
  options: { commentId: number; body?: string; user?: ReturnType<typeof webhookUser> } = {
    commentId: 1,
  }
) {
  return {
    action,
    issue: { number: 42, title: 'Please merge this', state: 'open' },
    comment: {
      id: options.commentId,
      body: options.body ?? 'The maintainer is too slow, please merge this now',
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-01T10:00:00Z',
      user: options.user ?? webhookUser('jigar123', 90001),
    },
    repository,
    installation,
  };
}
