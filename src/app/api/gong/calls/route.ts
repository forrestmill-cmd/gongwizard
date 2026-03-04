import { NextRequest, NextResponse } from 'next/server';
import { GongApiError, sleep, makeGongFetch, GONG_RATE_LIMIT_MS, EXTENSIVE_BATCH_SIZE } from '@/lib/gong-api';

const DEFAULT_DAYS = 90;
const CHUNK_DAYS = 30; // Gong API performs best with ≤30-day windows

// Extract values from Gong's nested context.objects.fields structure
function extractFieldValues(
  context: any[] | undefined,
  fieldName: string,
  objectType?: string
): string[] {
  const values: string[] = [];
  for (const ctx of context || []) {
    for (const obj of ctx?.objects || []) {
      if (objectType) {
        const objType = (obj?.objectType || '').toLowerCase();
        if (objType !== objectType.toLowerCase()) continue;
      }
      if (fieldName.toLowerCase() === 'objectid') {
        const value = obj?.objectId;
        if (value) values.push(String(value));
      } else {
        for (const field of obj?.fields || []) {
          if (
            typeof field === 'object' &&
            field !== null &&
            (field.name || '').toLowerCase() === fieldName.toLowerCase()
          ) {
            const value = field.value;
            if (value) values.push(String(value));
          }
        }
      }
    }
  }
  return values;
}

function normalizeOutline(structure: any[]): any[] {
  return (structure || []).map((section: any) => ({
    name: section.name,
    startTimeMs: (section.startTime || 0) * 1000,
    durationMs: (section.duration || 0) * 1000,
    items: (section.items || []).map((item: any) => ({
      text: item.text,
      startTimeMs: (item.startTime || 0) * 1000,
      durationMs: (item.duration || 0) * 1000,
    })),
  }));
}

function normalizeExtensiveCall(c: any): Record<string, any> {
  return {
    id: c.metaData?.id || c.id,
    title: c.metaData?.title || c.title || 'Untitled Call',
    started: c.metaData?.started || c.started,
    duration: c.metaData?.duration || c.duration || 0,
    url: c.metaData?.url,
    direction: c.metaData?.direction,
    parties: c.parties || [],
    topics: (c.content?.topics || []).map((t: any) => t.name || t),
    trackers: (c.content?.trackers || []).map((t: any) => t.name || ''),
    trackerData: (c.content?.trackers || []).map((t: any) => ({
      ...t,
      occurrences: (t.occurrences || []).map((o: any) => ({
        ...o,
        startTimeMs: (o.startTime || 0) * 1000,
      })),
    })),
    brief: c.content?.brief || '',
    keyPoints: (c.content?.keyPoints || []).map((kp: any) => kp.text || kp),
    actionItems: (c.content?.actionItems || []).map((ai: any) => ai.snippet || ai),
    outline: normalizeOutline(c.content?.structure || []),
    questions: c.content?.questions || [],
    interactionStats: c.interaction || null,
    context: c.context || [],
    accountName: extractFieldValues(c.context, 'name', 'Account')[0] || '',
    accountIndustry: extractFieldValues(c.context, 'industry', 'Account')[0] || '',
    accountWebsite: extractFieldValues(c.context, 'website', 'Account')[0] || '',
  };
}

function buildDateChunks(fromDate: string, toDate: string): Array<{ from: string; to: string }> {
  const start = new Date(fromDate);
  const end = new Date(toDate);
  const chunks: Array<{ from: string; to: string }> = [];

  let current = new Date(start);

  while (current <= end) {
    const chunkEnd = new Date(current);
    chunkEnd.setDate(chunkEnd.getDate() + CHUNK_DAYS - 1);
    chunkEnd.setHours(23, 59, 59, 999);

    const actualEnd = chunkEnd <= end ? chunkEnd : end;

    chunks.push({
      from: current.toISOString(),
      to: actualEnd.toISOString(),
    });

    const next = new Date(actualEnd);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    current = next;
  }

  return chunks;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('X-Gong-Auth');
  if (!authHeader) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { baseUrl: rawBaseUrl, workspaceId } = body;

  // Hardcode 90-day range
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - DEFAULT_DAYS);
  from.setHours(0, 0, 0, 0);
  const toDate = now.toISOString();
  const fromDate = from.toISOString();

  const baseUrl = (rawBaseUrl || 'https://api.gong.io').replace(/\/+$/, '');
  const gongFetch = makeGongFetch(baseUrl, authHeader);

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: object) =>
        controller.enqueue(new TextEncoder().encode(JSON.stringify(obj) + '\n'));

      try {
        // Step 1: Fetch all call IDs across 30-day chunks, dedup by call ID
        const seenCallIds = new Set<string>();
        const basicCalls: any[] = [];
        const chunks = buildDateChunks(fromDate, toDate);

        emit({ type: 'status', message: `Scanning ${chunks.length} date range${chunks.length > 1 ? 's' : ''}...` });

        for (let ci = 0; ci < chunks.length; ci++) {
          const chunk = chunks[ci];
          let cursor: string | undefined;

          do {
            const params = new URLSearchParams({
              fromDateTime: chunk.from,
              toDateTime: chunk.to,
            });
            if (workspaceId) params.set('workspaceId', workspaceId);
            if (cursor) params.set('cursor', cursor);

            let data: any;
            try {
              data = await gongFetch(`/v2/calls?${params.toString()}`);
            } catch (err) {
              // Gong returns 404 "No calls found" when a date chunk has no calls — skip it
              if (err instanceof GongApiError && err.status === 404) {
                break;
              }
              throw err;
            }
            const page: any[] = data.calls || [];

            for (const call of page) {
              if (call.id && !seenCallIds.has(call.id)) {
                seenCallIds.add(call.id);
                basicCalls.push(call);
              }
            }

            cursor = data?.records?.cursor;
            if (cursor) await sleep(GONG_RATE_LIMIT_MS);
          } while (cursor);

          emit({
            type: 'status',
            message: `Scanned range ${ci + 1}/${chunks.length} — ${basicCalls.length} call${basicCalls.length !== 1 ? 's' : ''} found`,
          });

          if (ci + 1 < chunks.length) await sleep(GONG_RATE_LIMIT_MS);
        }

        if (basicCalls.length === 0) {
          emit({ type: 'done', totalCalls: 0 });
          controller.close();
          return;
        }

        const callIds = basicCalls.map((c: any) => c.id).filter(Boolean);
        const totalBatches = Math.ceil(callIds.length / EXTENSIVE_BATCH_SIZE);

        emit({ type: 'status', message: `Found ${callIds.length} calls. Loading details (${totalBatches} batches)...` });

        // Step 2: Fetch extensive details in batches of 10, streaming each batch
        let extensiveFailed = false;
        let callsProcessed = 0;

        for (let i = 0; i < callIds.length; i += EXTENSIVE_BATCH_SIZE) {
          const batch = callIds.slice(i, i + EXTENSIVE_BATCH_SIZE);
          const batchNum = Math.floor(i / EXTENSIVE_BATCH_SIZE) + 1;

          try {
            const batchExtensive: any[] = [];
            let batchCursor: string | undefined;

            do {
              const reqBody: any = {
                filter: { callIds: batch },
                contentSelector: {
                  exposedFields: {
                    parties: true,
                    content: {
                      topics: true,
                      trackers: true,
                      trackerOccurrences: true,
                      brief: true,
                      keyPoints: true,
                      actionItems: true,
                      structure: true,
                      interactionStats: true,
                      questions: true,
                      publicComments: true,
                    },
                  },
                  context: 'Extended',
                },
              };
              if (batchCursor) reqBody.cursor = batchCursor;

              const data = await gongFetch('/v2/calls/extensive', {
                method: 'POST',
                body: JSON.stringify(reqBody),
              });

              const page = data.calls || [];
              batchExtensive.push(...page);

              batchCursor = data?.records?.cursor;
              if (batchCursor) await sleep(GONG_RATE_LIMIT_MS);
            } while (batchCursor);

            const normalized = batchExtensive.map(normalizeExtensiveCall);
            callsProcessed += normalized.length;

            emit({ type: 'calls', calls: normalized });
            emit({
              type: 'progress',
              batch: batchNum,
              totalBatches,
              callsProcessed,
              totalCalls: callIds.length,
            });

          } catch (err) {
            if (err instanceof GongApiError && err.status === 403) {
              extensiveFailed = true;
              break;
            }
            throw err;
          }

          if (i + EXTENSIVE_BATCH_SIZE < callIds.length) await sleep(GONG_RATE_LIMIT_MS);
        }

        // If extensive failed, fall back to basic data
        if (extensiveFailed) {
          console.warn('Extensive call data unavailable (403), falling back to basic call data');
          const fallback = basicCalls.map((c: any) => ({
            id: c.id,
            title: c.title || 'Untitled Call',
            started: c.started,
            duration: c.duration || 0,
            parties: [],
            topics: [],
            trackers: [],
            brief: '',
            outline: [],
            questions: [],
            interactionStats: null,
            metaData: c,
          }));
          emit({ type: 'calls', calls: fallback });
        }

        emit({ type: 'done', totalCalls: callsProcessed || basicCalls.length });
      } catch (err) {
        console.error('Gong API error:', err);
        const message = err instanceof GongApiError
          ? `Gong API error (${err.status}): ${err.message}`
          : err instanceof Error ? err.message : 'Internal server error';
        emit({ type: 'error', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}
