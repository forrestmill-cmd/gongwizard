// Tracker-to-utterance timestamp alignment
// Ported from GongWizard V2 app.py lines 650-730

export interface TrackerOccurrence {
  trackerName: string;
  phrase?: string;
  startTimeMs: number; // already converted to ms by calls/route.ts
  speakerId?: string;
}

export interface Utterance {
  speakerId: string;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  midTimeMs: number;
  trackers: string[];
  isInternal: boolean;
}

/**
 * Build utterance objects from raw transcript monologues.
 * Each monologue has a speakerId + sentences[]. We flatten into
 * per-turn utterances (consecutive sentences by same speaker).
 */
export function buildUtterances(
  monologues: Array<{
    speakerId: string;
    sentences?: Array<{ text: string; start: number; end?: number }>;
  }>,
  speakerClassifier: (speakerId: string) => boolean // returns true if internal
): Utterance[] {
  const utterances: Utterance[] = [];

  for (const mono of monologues) {
    const sentences = mono.sentences || [];
    if (sentences.length === 0) continue;

    const starts = sentences.map(s => s.start).filter(s => s >= 0);
    const ends = sentences.map(s => s.end ?? s.start).filter(s => s >= 0);

    if (starts.length === 0) continue;

    const startTimeMs = Math.min(...starts);
    const endTimeMs = Math.max(...ends);
    const midTimeMs = (startTimeMs + endTimeMs) / 2;
    const text = sentences.map(s => s.text).join(' ');

    utterances.push({
      speakerId: mono.speakerId,
      text,
      startTimeMs,
      endTimeMs,
      midTimeMs,
      trackers: [],
      isInternal: speakerClassifier(mono.speakerId),
    });
  }

  return utterances;
}

/**
 * Align tracker occurrences to utterances using the V2 algorithm:
 * 1. Exact containment: tracker timestamp falls within utterance time range
 * 2. ±3s fallback: expand utterance windows by 3 seconds each direction
 * 3. Speaker preference: if tracker has a speakerId, prefer matching utterances
 * 4. Closest by midpoint: among eligible, assign to the closest utterance
 *
 * Mutates utterances in place (adds tracker names to .trackers array).
 * Returns list of unmatched tracker names.
 */
export function alignTrackersToUtterances(
  utterances: Utterance[],
  trackerOccurrences: TrackerOccurrence[]
): string[] {
  const unmatched: string[] = [];
  const WINDOW_MS = 3000; // ±3 second fallback window

  for (const occ of trackerOccurrences) {
    const ts = occ.startTimeMs;

    // Step 1: Exact containment
    let eligible: Array<[Utterance, number]> = utterances
      .filter(u => u.startTimeMs > 0 && u.startTimeMs <= ts && ts <= u.endTimeMs)
      .map(u => [u, Math.abs(ts - u.midTimeMs)]);

    // Step 2: ±3s fallback
    if (eligible.length === 0) {
      eligible = utterances
        .filter(u => u.startTimeMs > 0 && (u.startTimeMs - WINDOW_MS) <= ts && ts <= (u.endTimeMs + WINDOW_MS))
        .map(u => [u, Math.abs(ts - u.midTimeMs)]);
    }

    if (eligible.length === 0) {
      unmatched.push(occ.trackerName);
      continue;
    }

    // Step 3: Speaker preference (narrows but doesn't expand)
    if (occ.speakerId) {
      const speakerMatches = eligible.filter(([u]) => u.speakerId === occ.speakerId);
      if (speakerMatches.length > 0) {
        eligible = speakerMatches;
      }
    }

    // Step 4: Sort by distance to midpoint, assign to closest
    eligible.sort((a, b) => a[1] - b[1]);
    const target = eligible[0][0];
    if (!target.trackers.includes(occ.trackerName)) {
      target.trackers.push(occ.trackerName);
    }
  }

  return unmatched;
}

/**
 * Extract flat tracker occurrences from the GongCall trackers array.
 * The trackers come from calls/route.ts with startTimeMs already computed.
 */
export function extractTrackerOccurrences(
  trackers: Array<{
    name: string;
    occurrences?: Array<{
      startTimeMs: number;
      speakerId?: string;
      phrase?: string;
    }>;
  }>
): TrackerOccurrence[] {
  const occurrences: TrackerOccurrence[] = [];
  for (const t of trackers) {
    for (const occ of t.occurrences || []) {
      occurrences.push({
        trackerName: t.name,
        phrase: occ.phrase,
        startTimeMs: occ.startTimeMs,
        speakerId: occ.speakerId,
      });
    }
  }
  return occurrences;
}
