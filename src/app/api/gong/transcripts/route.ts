import { NextRequest, NextResponse } from 'next/server';
import { sleep, makeGongFetch, handleGongError, GONG_RATE_LIMIT_MS, TRANSCRIPT_BATCH_SIZE } from '@/lib/gong-api';

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
    const gongFetch = makeGongFetch(baseUrl, authHeader);

    const transcriptMap: Record<string, any[]> = {};

    for (let i = 0; i < callIds.length; i += TRANSCRIPT_BATCH_SIZE) {
      const batch = callIds.slice(i, i + TRANSCRIPT_BATCH_SIZE);
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
        if (cursor) await sleep(GONG_RATE_LIMIT_MS);
      } while (cursor);

      if (i + TRANSCRIPT_BATCH_SIZE < callIds.length) await sleep(GONG_RATE_LIMIT_MS);
    }

    // Return as array of { callId, transcript } for the UI
    const transcripts = Object.entries(transcriptMap).map(([callId, transcript]) => ({
      callId,
      transcript,
    }));
    return NextResponse.json({ transcripts });

  } catch (error) {
    return handleGongError(error);
  }
}
