import type {
  GongUser,
  GongTracker,
  GongWorkspace,
  GongCall,
  GongCallMetaData,
  GongCallTranscript,
  GongMonologue,
} from './types';
import { buildApiUrl, parseBaseUrl } from './base-url';

const RATE_LIMIT_DELAY_MS = 350;
const EXTENSIVE_BATCH_SIZE = 10;
const TRANSCRIPT_BATCH_SIZE = 50;

const EXTENSIVE_CONTENT_SELECTOR = {
  exposedFields: {
    parties: true,
    content: {
      trackers: true,
      brief: true,
      keyPoints: true,
      highlights: true,
      outline: true,
      topics: true,
      actionItems: true,
      structure: true,
    },
  },
  context: 'Extended',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GongAPIClient {
  private accessKey: string;
  private secretKey: string;
  private baseUrl: string;
  private authHeader: string;

  constructor(accessKey: string, secretKey: string, baseUrl: string) {
    this.accessKey = accessKey;
    this.secretKey = secretKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.authHeader =
      'Basic ' + Buffer.from(`${accessKey}:${secretKey}`).toString('base64');
  }

  private async request<T = Record<string, unknown>>(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: unknown
  ): Promise<T | null> {
    const url = buildApiUrl(this.baseUrl, endpoint);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(`Gong API error ${res.status} ${method} ${endpoint}: ${text}`);
        return null;
      }

      const data = await res.json();

      // Update baseUrl if customer-specific URL is provided
      const customerUrl = parseBaseUrl(data as Record<string, unknown>);
      if (customerUrl && customerUrl !== this.baseUrl) {
        this.baseUrl = customerUrl;
      }

      return data as T;
    } catch (err) {
      console.error(`Gong fetch error ${method} ${endpoint}:`, err);
      return null;
    }
  }

  async fetchUsers(): Promise<GongUser[]> {
    const users: GongUser[] = [];
    let cursor: string | undefined;

    do {
      await sleep(RATE_LIMIT_DELAY_MS);
      const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const data = await this.request<Record<string, unknown>>('GET', `/v2/users${params}`);
      if (!data) break;

      const page = (data.users as GongUser[]) || [];
      users.push(...page);

      const records = data.records as Record<string, unknown> | undefined;
      cursor = records?.cursor as string | undefined;
    } while (cursor);

    return users;
  }

  async fetchTrackers(): Promise<GongTracker[]> {
    const trackers: GongTracker[] = [];
    let cursor: string | undefined;

    do {
      await sleep(RATE_LIMIT_DELAY_MS);
      const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const data = await this.request<Record<string, unknown>>(
        'GET',
        `/v2/settings/trackers${params}`
      );
      if (!data) break;

      const page = (data.trackers as GongTracker[]) || [];
      trackers.push(...page);

      const records = data.records as Record<string, unknown> | undefined;
      cursor = records?.cursor as string | undefined;
    } while (cursor);

    return trackers;
  }

  async fetchWorkspaces(): Promise<GongWorkspace[]> {
    await sleep(RATE_LIMIT_DELAY_MS);
    const data = await this.request<Record<string, unknown>>('GET', '/v2/workspaces');
    if (!data) return [];
    return (data.workspaces as GongWorkspace[]) || [];
  }

  async fetchCallList(fromDate: string, toDate: string): Promise<GongCallMetaData[]> {
    const calls: GongCallMetaData[] = [];
    let cursor: string | undefined;

    do {
      await sleep(RATE_LIMIT_DELAY_MS);
      const params = new URLSearchParams({
        fromDateTime: fromDate,
        toDateTime: toDate,
      });
      if (cursor) params.set('cursor', cursor);

      const data = await this.request<Record<string, unknown>>(
        'GET',
        `/v2/calls?${params.toString()}`
      );
      if (!data) break;

      const page = (data.calls as GongCallMetaData[]) || [];
      calls.push(...page);

      const records = data.records as Record<string, unknown> | undefined;
      cursor = records?.cursor as string | undefined;
    } while (cursor);

    return calls;
  }

  async fetchCallsExtensive(callIds: string[]): Promise<GongCall[]> {
    const results: GongCall[] = [];

    for (let i = 0; i < callIds.length; i += EXTENSIVE_BATCH_SIZE) {
      const batch = callIds.slice(i, i + EXTENSIVE_BATCH_SIZE);
      let cursor: string | undefined;

      do {
        await sleep(RATE_LIMIT_DELAY_MS);
        const body: Record<string, unknown> = {
          filter: { callIds: batch },
          contentSelector: EXTENSIVE_CONTENT_SELECTOR,
        };
        if (cursor) body.cursor = cursor;

        const data = await this.request<Record<string, unknown>>(
          'POST',
          '/v2/calls/extensive',
          body
        );
        if (!data) break;

        const page = (data.calls as GongCall[]) || [];
        results.push(...page);

        const records = data.records as Record<string, unknown> | undefined;
        cursor = records?.cursor as string | undefined;
      } while (cursor);
    }

    return results;
  }

  async fetchTranscripts(callIds: string[]): Promise<Map<string, GongMonologue[]>> {
    const transcriptMap = new Map<string, GongMonologue[]>();

    for (let i = 0; i < callIds.length; i += TRANSCRIPT_BATCH_SIZE) {
      const batch = callIds.slice(i, i + TRANSCRIPT_BATCH_SIZE);
      let cursor: string | undefined;

      do {
        await sleep(RATE_LIMIT_DELAY_MS);
        const body: Record<string, unknown> = {
          filter: { callIds: batch },
        };
        if (cursor) body.cursor = cursor;

        const data = await this.request<Record<string, unknown>>(
          'POST',
          '/v2/calls/transcript',
          body
        );
        if (!data) break;

        const transcripts = (data.callTranscripts as GongCallTranscript[]) || [];
        for (const entry of transcripts) {
          transcriptMap.set(entry.callId, entry.transcript || []);
        }

        const records = data.records as Record<string, unknown> | undefined;
        cursor = records?.cursor as string | undefined;
      } while (cursor);
    }

    return transcriptMap;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}
