import { NextRequest, NextResponse } from 'next/server';
import { GongApiError, sleep, makeGongFetch, handleGongError, GONG_RATE_LIMIT_MS } from '@/lib/gong-api';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('X-Gong-Auth');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const baseUrl = (body.baseUrl || 'https://api.gong.io').replace(/\/+$/, '');
    const gongFetch = makeGongFetch(baseUrl, authHeader);

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
          await sleep(GONG_RATE_LIMIT_MS);
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
    return handleGongError(error);
  }
}
