import { NextRequest, NextResponse } from 'next/server';

class GongApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public endpoint: string
  ) {
    super(message);
    this.name = 'GongApiError';
  }
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('X-Gong-Auth');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { callIds, baseUrl: rawBaseUrl } = body;

    if (!callIds || !Array.isArray(callIds) || callIds.length === 0) {
      return NextResponse.json({ error: 'callIds array is required' }, { status: 400 });
    }

    const baseUrl = (rawBaseUrl || 'https://api.gong.io').replace(/\/+$/, '');

    async function gongFetch(endpoint: string, options: RequestInit = {}) {
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
    }

    const BATCH_SIZE = 50;
    const transcriptMap: Record<string, any[]> = {};

    for (let i = 0; i < callIds.length; i += BATCH_SIZE) {
      const batch = callIds.slice(i, i + BATCH_SIZE);
      let cursor: string | undefined;

      do {
        const reqBody: any = {
          filter: { callIds: batch },
        };
        if (cursor) reqBody.cursor = cursor;

        const data = await gongFetch('/v2/calls/transcript', {
          method: 'POST',
          body: JSON.stringify(reqBody),
        });

        const callTranscripts: any[] = data.callTranscripts || [];
        for (const ct of callTranscripts) {
          const id = ct.callId;
          if (!id) continue;
          if (!transcriptMap[id]) transcriptMap[id] = [];
          const monologues = ct.transcript || [];
          transcriptMap[id].push(...monologues);
        }

        cursor = data?.records?.cursor;
        if (cursor) await sleep(350);
      } while (cursor);

      if (i + BATCH_SIZE < callIds.length) await sleep(350);
    }

    // Return as array of { callId, transcript } for the UI
    const transcripts = Object.entries(transcriptMap).map(([callId, transcript]) => ({
      callId,
      transcript,
    }));
    return NextResponse.json({ transcripts });

  } catch (error) {
    console.error('Transcripts fetch error:', error);
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
      { error: 'Failed to fetch transcripts from Gong' },
      { status: 500 }
    );
  }
}
