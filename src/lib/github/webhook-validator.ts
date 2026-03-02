import crypto from 'crypto';

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  console.warn('GITHUB_WEBHOOK_SECRET is not set - webhook validation will fail');
}

/**
 * Verify GitHub webhook signature using timing-safe comparison
 */
export function verifyWebhookSignature(payload: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) {
    throw new Error('GITHUB_WEBHOOK_SECRET is not configured');
  }

  // GitHub sends the signature as 'sha256=<signature>'
  const sig = Buffer.from(signature.startsWith('sha256=') ? signature.slice(7) : signature, 'hex');
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = Buffer.from(hmac.update(payload).digest('hex'), 'hex');

  // Use timing-safe comparison to prevent timing attacks
  if (sig.length !== digest.length) {
    return false;
  }

  return crypto.timingSafeEqual(sig, digest);
}

/**
 * Extract and verify webhook signature from headers
 */
export function validateWebhookRequest(body: string, headers: Record<string, string>): boolean {
  const signature = headers['x-hub-signature-256'];

  if (!signature) {
    console.error('Missing X-Hub-Signature-256 header');
    return false;
  }

  try {
    return verifyWebhookSignature(body, signature);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return false;
  }
}

/**
 * Get webhook event type from headers
 */
export function getWebhookEventType(headers: Record<string, string>): string | null {
  return headers['x-github-event'] || null;
}

/**
 * Get webhook delivery ID from headers
 */
export function getWebhookDeliveryId(headers: Record<string, string>): string | null {
  return headers['x-github-delivery'] || null;
}
