import { NextResponse } from 'next/server';

export class GongApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public endpoint: string
  ) {
    super(message);
    this.name = 'GongApiError';
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// Gong enforces ~3 req/s; 350ms keeps us safely under the limit
export const GONG_RATE_LIMIT_MS = 350;
// Gong API limits: /v2/calls/extensive accepts max 10 IDs, /v2/calls/transcript accepts max 50
export const EXTENSIVE_BATCH_SIZE = 10;
export const TRANSCRIPT_BATCH_SIZE = 50;
const MAX_RETRIES = 5;

export function makeGongFetch(baseUrl: string, authHeader: string) {
  // Exponential backoff: 2s → 4s → 8s → 16s → 30s (capped at 30s)
  const retryDelayMs = (attempt: number) => Math.min(2 ** attempt * 2, 30) * 1000;

  return async function gongFetch(endpoint: string, options: RequestInit = {}) {
    const url = `${baseUrl}${endpoint}`;
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });

        if (response.ok) {
          return await response.json();
        }

        if (response.status === 401 || response.status === 403 || response.status === 404) {
          const text = await response.text().catch(() => '');
          throw new GongApiError(response.status, text, endpoint);
        }

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : retryDelayMs(attempt);
          console.warn(`Gong API rate limited on ${endpoint}, attempt ${attempt + 1}/${MAX_RETRIES}, retrying in ${delayMs}ms`);
          await sleep(delayMs);
          continue;
        }

        const text = await response.text().catch(() => '');
        lastError = new GongApiError(response.status, text, endpoint);
        // Exponential backoff: 2s, 4s, 8s, 16s, 30s (capped)
        const delayMs = retryDelayMs(attempt);
        console.warn(`Gong API error ${response.status} on ${endpoint}, attempt ${attempt + 1}/${MAX_RETRIES}, retrying in ${delayMs}ms`);
        await sleep(delayMs);
      } catch (err) {
        if (err instanceof GongApiError && (err.status === 401 || err.status === 403 || err.status === 404)) {
          throw err;
        }
        lastError = err;
        const delayMs = retryDelayMs(attempt);
        console.warn(`Gong API network error on ${endpoint}, attempt ${attempt + 1}/${MAX_RETRIES}, retrying in ${delayMs}ms`, err);
        await sleep(delayMs);
      }
    }

    throw lastError ?? new GongApiError(429, 'Max retries exceeded', endpoint);
  };
}

export function handleGongError(error: unknown): NextResponse {
  console.error('Gong API error:', error);
  if (error instanceof GongApiError) {
    if (error.status === 401) {
      return NextResponse.json({ error: 'Invalid API credentials' }, { status: 401 });
    }
    return NextResponse.json(
      { error: `Gong API error (${error.status}): ${error.message}` },
      { status: error.status >= 400 && error.status < 500 ? error.status : 500 }
    );
  }
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  );
}
