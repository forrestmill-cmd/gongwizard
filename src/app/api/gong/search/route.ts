import { NextRequest } from 'next/server';
import { makeGongFetch, TRANSCRIPT_BATCH_SIZE, GONG_RATE_LIMIT_MS, sleep } from '@/lib/gong-api';
import { formatTimestamp } from '@/lib/format-utils';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('X-Gong-Auth');
  const body = await request.json();
  const { callIds, keyword, baseUrl: rawBaseUrl } = body;

  if (!authHeader) {
    return Response.json({ error: 'Missing auth' }, { status: 401 });
  }
  if (!callIds?.length || !keyword?.trim()) {
    return Response.json({ error: 'Missing callIds or keyword' }, { status: 400 });
  }

  const baseUrl = (rawBaseUrl || 'https://api.gong.io').replace(/\/$/, '');
  const gongFetch = makeGongFetch(baseUrl, authHeader);
  const lowerKeyword = keyword.toLowerCase().trim();
  const ids: string[] = callIds.slice(0, 500);

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: object) =>
        controller.enqueue(new TextEncoder().encode(JSON.stringify(obj) + '\n'));

      let searched = 0;
      let matchCount = 0;

      for (let i = 0; i < ids.length; i += TRANSCRIPT_BATCH_SIZE) {
        const batch = ids.slice(i, i + TRANSCRIPT_BATCH_SIZE);
        try {
          const result = await gongFetch('/v2/calls/transcript', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filter: { callIds: batch } }),
          });

          for (const ct of (result.callTranscripts || [])) {
            for (const monologue of (ct.transcript || [])) {
              const sentences: any[] = monologue.sentences || [];
              for (let j = 0; j < sentences.length; j++) {
                const sentence = sentences[j];
                if (sentence.text?.toLowerCase().includes(lowerKeyword)) {
                  matchCount++;
                  emit({
                    type: 'match',
                    callId: ct.callId,
                    speakerId: monologue.speakerId,
                    timestamp: formatTimestamp(sentence.start), // sentence.start is milliseconds
                    text: sentence.text,
                    context: sentences[j - 1]?.text ?? '',
                  });
                }
              }
            }
          }
        } catch (e) {
          console.error('Transcript batch failed, skipping:', batch, e);
        }

        searched += batch.length;
        emit({ type: 'progress', searched, total: ids.length, matchCount });
        if (i + TRANSCRIPT_BATCH_SIZE < ids.length) await sleep(GONG_RATE_LIMIT_MS);
      }

      emit({ type: 'done', searched, matchCount });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}
