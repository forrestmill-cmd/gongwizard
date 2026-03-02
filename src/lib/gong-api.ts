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

export function makeGongFetch(baseUrl: string, authHeader: string) {
  return async function gongFetch(endpoint: string, options: RequestInit = {}) {
    const url = `${baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new GongApiError(response.status, text, endpoint);
    }

    return response.json();
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
