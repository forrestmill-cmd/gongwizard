import type { ConnectResult, ProcessedCall } from './gong/types';
import type { TranscriptData } from './gong/formatters';
import { getSession } from './session-store';

function getAuthHeader(): string {
  const session = getSession();
  if (!session) throw new Error('Not connected to Gong');
  return 'Basic ' + btoa(`${session.accessKey}:${session.secretKey}`);
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Gong-Auth': getAuthHeader(),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(path, { ...options, headers });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export async function connectToGong(
  accessKey: string,
  secretKey: string
): Promise<ConnectResult> {
  const authHeader = 'Basic ' + btoa(`${accessKey}:${secretKey}`);
  const res = await fetch('/api/gong/connect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Gong-Auth': authHeader,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Connect failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<ConnectResult>;
}

export async function fetchCalls(fromDate: string, toDate: string): Promise<ProcessedCall[]> {
  return apiFetch<ProcessedCall[]>(
    `/api/gong/calls?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`
  );
}

export async function fetchTranscripts(
  callIds: string[]
): Promise<Map<string, TranscriptData>> {
  const result = await apiFetch<Record<string, TranscriptData>>('/api/gong/transcripts', {
    method: 'POST',
    body: JSON.stringify({ callIds }),
  });

  const map = new Map<string, TranscriptData>();
  for (const [id, data] of Object.entries(result)) {
    map.set(id, data);
  }
  return map;
}
