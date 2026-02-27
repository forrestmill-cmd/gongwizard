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

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('X-Gong-Auth');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const baseUrl = (body.baseUrl || 'https://api.gong.io').replace(/\/+$/, '');

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

    async function fetchAllPages<T>(
      endpoint: string,
      dataKey: string,
      method: 'GET' | 'POST' = 'GET',
      body?: object
    ): Promise<T[]> {
      const items: T[] = [];
      let cursor: string | undefined;

      do {
        const params = cursor ? `?cursor=${cursor}` : '';
        let data;

        if (method === 'GET') {
          data = await gongFetch(`${endpoint}${params}`);
        } else {
          data = await gongFetch(endpoint, {
            method: 'POST',
            body: JSON.stringify({ ...body, cursor }),
          });
        }

        const pageItems = data[dataKey] || [];
        items.push(...pageItems);

        cursor = data?.records?.cursor;
        if (cursor) {
          await new Promise(r => setTimeout(r, 350));
        }
      } while (cursor);

      return items;
    }

    const [usersResult, trackersResult, workspacesResult] = await Promise.allSettled([
      fetchAllPages('/v2/users', 'users'),
      fetchAllPages('/v2/settings/trackers', 'trackers'),
      gongFetch('/v2/workspaces'),
    ]);

    if (usersResult.status === 'rejected') {
      const err = usersResult.reason;
      if (err instanceof GongApiError && err.status === 401) {
        return NextResponse.json({ error: 'Invalid API credentials' }, { status: 401 });
      }
    }

    const users = usersResult.status === 'fulfilled' ? usersResult.value : [];
    const trackers = trackersResult.status === 'fulfilled' ? trackersResult.value : [];
    const workspaces = workspacesResult.status === 'fulfilled'
      ? (workspacesResult.value.workspaces || [])
      : [];

    const domainSet = new Set<string>();
    for (const user of users as any[]) {
      const email = user.emailAddress || '';
      if (email.includes('@')) {
        domainSet.add(email.split('@').pop()!.trim().toLowerCase());
      }
    }
    const internalDomains = Array.from(domainSet);

    const warnings: string[] = [];
    if (usersResult.status === 'rejected') warnings.push('Failed to fetch users. Speaker classification may be limited.');
    if (trackersResult.status === 'rejected') warnings.push('Failed to fetch trackers.');

    return NextResponse.json({
      users,
      trackers,
      workspaces,
      internalDomains,
      baseUrl,
      warnings: warnings.length > 0 ? warnings : undefined,
    });

  } catch (error) {
    console.error('Connect error:', error);
    if (error instanceof GongApiError) {
      return NextResponse.json(
        { error: `Gong API error (${error.status}): ${error.message}` },
        { status: error.status >= 400 && error.status < 500 ? error.status : 500 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to connect to Gong' },
      { status: 500 }
    );
  }
}
