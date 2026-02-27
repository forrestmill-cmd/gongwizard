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

// Extract values from Gong's nested context.objects.fields structure
// Ported from Python v1 extract_field_values()
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

    // Step 1: Fetch all call IDs for the date range (paginated GET)
    const basicCalls: any[] = [];
    let cursor: string | undefined;

    do {
      const params = new URLSearchParams({
        fromDateTime: fromDate,
        toDateTime: toDate,
      });
      if (workspaceId) params.set('workspaceId', workspaceId);
      if (cursor) params.set('cursor', cursor);

      const data = await gongFetch(`/v2/calls?${params.toString()}`);
      const page = data.calls || [];
      basicCalls.push(...page);

      cursor = data?.records?.cursor;
      if (cursor) await sleep(350);
    } while (cursor);

    if (basicCalls.length === 0) {
      return NextResponse.json({ calls: [] });
    }

    const callIds = basicCalls.map((c: any) => c.id).filter(Boolean);

    // Step 2: Fetch extensive details in batches of 10
    const BATCH_SIZE = 10;
    const extensiveCalls: any[] = [];
    let extensiveFailed = false;

    for (let i = 0; i < callIds.length; i += BATCH_SIZE) {
      const batch = callIds.slice(i, i + BATCH_SIZE);

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
          if (batchCursor) await sleep(350);
        } while (batchCursor);

      } catch (err) {
        if (err instanceof GongApiError && err.status === 403) {
          extensiveFailed = true;
          break;
        }
        throw err;
      }

      if (i + BATCH_SIZE < callIds.length) await sleep(350);
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
        interactionStats: null,
        metaData: c,
      }));
      return NextResponse.json({ calls: normalized });
    }

    const normalized = extensiveCalls.map((c: any) => ({
      id: c.metaData?.id || c.id,
      title: c.metaData?.title || c.title || 'Untitled Call',
      started: c.metaData?.started || c.started,
      duration: c.metaData?.duration || c.duration || 0,
      url: c.metaData?.url,
      direction: c.metaData?.direction,
      parties: c.parties || [],
      topics: (c.content?.topics || []).map((t: any) => t.name || t),
      trackers: c.content?.trackers || [],
      brief: c.content?.brief || '',
      keyPoints: (c.content?.keyPoints || []).map((kp: any) => kp.text || kp),
      actionItems: (c.content?.actionItems || []).map((ai: any) => ai.snippet || ai),
      interactionStats: c.interaction || null,
      context: c.context || [],
      accountName: extractFieldValues(c.context, 'name', 'Account')[0] || '',
      accountIndustry: extractFieldValues(c.context, 'industry', 'Account')[0] || '',
      accountWebsite: extractFieldValues(c.context, 'website', 'Account')[0] || '',
    }));
    return NextResponse.json({ calls: normalized });

  } catch (error) {
    console.error('Calls fetch error:', error);
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
      { error: 'Failed to fetch calls from Gong' },
      { status: 500 }
    );
  }
}
