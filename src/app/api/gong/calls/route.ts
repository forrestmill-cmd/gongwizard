import { NextRequest, NextResponse } from 'next/server';
import { GongApiError, sleep, makeGongFetch, handleGongError, GONG_RATE_LIMIT_MS, EXTENSIVE_BATCH_SIZE } from '@/lib/gong-api';

const MAX_DATE_RANGE_DAYS = 365; // Cap to prevent accidental multi-year queries
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
    trackers: (c.content?.trackers || []).map((t: any) => ({
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
  try {
    const authHeader = request.headers.get('X-Gong-Auth');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { fromDate, toDate, baseUrl: rawBaseUrl, workspaceId } = body;

    if (!fromDate || !toDate) {
      return NextResponse.json({ error: 'fromDate and toDate are required' }, { status: 400 });
    }

    const startMs = new Date(fromDate).getTime();
    const endMs = new Date(toDate).getTime();
    const rangeDays = (endMs - startMs) / (1000 * 60 * 60 * 24);

    if (rangeDays > MAX_DATE_RANGE_DAYS) {
      return NextResponse.json(
        { error: `Date range exceeds maximum of ${MAX_DATE_RANGE_DAYS} days` },
        { status: 400 }
      );
    }

    const baseUrl = (rawBaseUrl || 'https://api.gong.io').replace(/\/+$/, '');
    const gongFetch = makeGongFetch(baseUrl, authHeader);

    // Step 1: Fetch all call IDs across 30-day chunks, dedup by call ID
    const seenCallIds = new Set<string>();
    const basicCalls: any[] = [];
    const chunks = buildDateChunks(fromDate, toDate);

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

        const data = await gongFetch(`/v2/calls?${params.toString()}`);
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

      if (ci + 1 < chunks.length) await sleep(GONG_RATE_LIMIT_MS);
    }

    if (basicCalls.length === 0) {
      return NextResponse.json({ calls: [] });
    }

    const callIds = basicCalls.map((c: any) => c.id).filter(Boolean);

    // Step 2: Fetch extensive details in batches of 10
    const extensiveCalls: any[] = [];
    let extensiveFailed = false;

    for (let i = 0; i < callIds.length; i += EXTENSIVE_BATCH_SIZE) {
      const batch = callIds.slice(i, i + EXTENSIVE_BATCH_SIZE);

      try {
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
                  brief: true,
                  keyPoints: true,
                  actionItems: true,
                  outline: true,
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
          extensiveCalls.push(...page);

          batchCursor = data?.records?.cursor;
          if (batchCursor) await sleep(GONG_RATE_LIMIT_MS);
        } while (batchCursor);

      } catch (err) {
        if (err instanceof GongApiError && err.status === 403) {
          extensiveFailed = true;
          break;
        }
        throw err;
      }

      if (i + EXTENSIVE_BATCH_SIZE < callIds.length) await sleep(GONG_RATE_LIMIT_MS);
    }

    // Step 3: Normalize response shape
    // Extensive calls have nested metaData/content/parties structure
    // Basic calls have flat id/title/started/duration
    // Normalize both to a consistent shape for the UI

    if (extensiveFailed) {
      console.warn('Extensive call data unavailable (403), falling back to basic call data');
      const normalized = basicCalls.map((c: any) => ({
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
      return NextResponse.json({ calls: normalized });
    }

    const normalized = extensiveCalls.map(normalizeExtensiveCall);
    return NextResponse.json({ calls: normalized });

  } catch (error) {
    return handleGongError(error);
  }
}
