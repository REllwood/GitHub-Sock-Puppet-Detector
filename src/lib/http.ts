import { NextResponse } from 'next/server';

/**
 * JSON response that safely serialises BigInt values (e.g. GitHub IDs) as strings.
 */
export function jsonResponse(data: unknown, init?: ResponseInit): NextResponse {
  const body = JSON.stringify(data, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );

  return new NextResponse(body, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
}
