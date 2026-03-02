// Pure filter predicates for call list filtering

interface FilterableCall {
  title: string;
  brief?: string;
  duration: number;
  topics?: string[];
  trackers?: string[];
  parties?: any[];
  externalSpeakerCount: number;
  talkRatio?: number;
  keyPoints?: string[];
  actionItems?: string[];
  outline?: Array<{ name: string; items?: Array<{ text: string }> }>;
}

export function matchesTextSearch(call: FilterableCall, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return (
    call.title.toLowerCase().includes(q) ||
    (call.brief || '').toLowerCase().includes(q)
  );
}

export function matchesTrackers(call: FilterableCall, activeTrackers: Set<string>): boolean {
  if (activeTrackers.size === 0) return true;
  const callTrackers = new Set(call.trackers || []);
  return [...activeTrackers].some((t) => callTrackers.has(t));
}

export function matchesTopics(call: FilterableCall, activeTopics: Set<string>): boolean {
  if (activeTopics.size === 0) return true;
  const callTopics = new Set(call.topics || []);
  return [...activeTopics].some((t) => callTopics.has(t));
}

export function matchesDurationRange(call: FilterableCall, min: number, max: number): boolean {
  return call.duration >= min && call.duration <= max;
}

export function matchesTalkRatioRange(call: FilterableCall, min: number, max: number): boolean {
  if (call.talkRatio === undefined) return true;
  const pct = Math.round(call.talkRatio * 100);
  return pct >= min && pct <= max;
}

export function matchesParticipantName(call: FilterableCall, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return (call.parties || []).some((p: any) => {
    const name = [p.name, p.firstName, p.lastName].filter(Boolean).join(' ').toLowerCase();
    return name.includes(q);
  });
}

export function matchesMinExternalSpeakers(call: FilterableCall, min: number): boolean {
  if (min <= 0) return true;
  return call.externalSpeakerCount >= min;
}

export function matchesAiContentSearch(call: FilterableCall, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  const searchable = [
    call.brief || '',
    ...(call.keyPoints || []),
    ...(call.actionItems || []),
    ...((call.outline || []).flatMap((s) => [
      s.name || '',
      ...(s.items || []).map((i) => i.text || ''),
    ])),
  ]
    .join(' ')
    .toLowerCase();
  return searchable.includes(q);
}

export function computeTrackerCounts(
  calls: FilterableCall[],
  allTrackers: string[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of allTrackers) counts[t] = 0;
  for (const call of calls) {
    for (const t of call.trackers || []) {
      if (counts[t] !== undefined) counts[t]++;
      else counts[t] = 1;
    }
  }
  return counts;
}

export function computeTopicCounts(calls: FilterableCall[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const call of calls) {
    for (const t of call.topics || []) {
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return counts;
}
