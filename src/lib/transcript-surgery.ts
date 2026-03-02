// Transcript surgery — surgical extraction of relevant transcript segments
// Reduces ~16K tokens/call to ~2-3K of analysis-ready input

import type { Utterance } from './tracker-alignment';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OutlineSection {
  name: string;
  startTimeMs: number;
  durationMs: number;
  items?: Array<{ text: string; startTimeMs: number; durationMs: number }>;
}

export interface SurgicalExcerpt {
  speakerId: string;
  text: string;
  timestampMs: number;
  timestampFormatted: string;
  isInternal: boolean;
  trackers: string[];
  sectionName?: string;
  needsSmartTruncation: boolean; // true if internal monologue > 60 words
  contextBefore?: string; // preceding utterance(s) for context
}

export interface SurgeryResult {
  callId: string;
  excerpts: SurgicalExcerpt[];
  sectionsUsed: string[];
  originalUtteranceCount: number;
  extractedUtteranceCount: number;
  longInternalMonologues: Array<{
    index: number; // index into excerpts[]
    text: string;
    wordCount: number;
  }>;
}

// ─── Filler detection ───────────────────────────────────────────────────────

const FILLER_PATTERNS = [
  /^(hi|hello|hey|thanks|thank you|bye|goodbye|talk soon|have a great|sounds good|absolutely|of course|sure|yeah|yes|no|okay|ok|alright|right|great|perfect|mm-hmm|uh-huh|um|uh)[!.,\s]*$/i,
];

function isFiller(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 5) return true;
  return FILLER_PATTERNS.some(p => p.test(trimmed));
}

function isGreetingOrClosing(timestampMs: number, callDurationMs: number, text: string): boolean {
  const wordCount = text.split(/\s+/).length;
  if (wordCount >= 15) return false;
  // First or last 60 seconds
  return timestampMs < 60000 || timestampMs > (callDurationMs - 60000);
}

// ─── Timestamp formatting ───────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// ─── Chapter index ──────────────────────────────────────────────────────────

/**
 * Given an outline and a list of relevant section names (from scoring),
 * returns time windows [startMs, endMs] for extraction.
 */
export function buildChapterWindows(
  outline: OutlineSection[],
  relevantSections: string[]
): Array<{ name: string; startMs: number; endMs: number }> {
  const sectionSet = new Set(relevantSections.map(s => s.toLowerCase()));
  return outline
    .filter(s => sectionSet.has(s.name.toLowerCase()))
    .map(s => ({
      name: s.name,
      startMs: s.startTimeMs,
      endMs: s.startTimeMs + s.durationMs,
    }));
}

/**
 * Check if a timestamp falls within any of the chapter windows.
 */
function isInWindow(
  timestampMs: number,
  windows: Array<{ startMs: number; endMs: number }>
): string | null {
  for (const w of windows) {
    if (timestampMs >= w.startMs && timestampMs <= w.endMs) {
      return (w as any).name || null;
    }
  }
  return null;
}

// ─── Context enrichment ─────────────────────────────────────────────────────

/**
 * For each external speaker utterance, look back to preceding utterance(s)
 * to provide context. If preceding is < 11 words, reach back one more (max depth 2).
 * Ported from V2 app.py lines 942-975.
 */
function enrichContext(
  utterances: Utterance[],
  index: number
): string {
  if (index === 0) return '';

  const prev = utterances[index - 1];
  const prevLabel = prev.isInternal ? 'internal' : 'external';
  const prevText = prev.text;

  if (index > 1 && prevText.split(/\s+/).length < 11) {
    const prevPrev = utterances[index - 2];
    const ppLabel = prevPrev.isInternal ? 'internal' : 'external';
    return `[${ppLabel}] ${prevPrev.text} | [${prevLabel}] ${prevText}`;
  }

  return `[${prevLabel}] ${prevText}`;
}

// ─── Main surgery function ──────────────────────────────────────────────────

/**
 * Perform surgical transcript extraction for a single call.
 *
 * @param callId - Call identifier
 * @param utterances - Full utterance list (from buildUtterances + alignTrackersToUtterances)
 * @param outline - Call outline sections with timestamps
 * @param relevantSections - Section names identified as relevant by scoring
 * @param callDurationMs - Total call duration in milliseconds
 * @returns SurgeryResult with extracted excerpts and metadata
 */
export function performSurgery(
  callId: string,
  utterances: Utterance[],
  outline: OutlineSection[],
  relevantSections: string[],
  callDurationMs: number
): SurgeryResult {
  const windows = buildChapterWindows(outline, relevantSections);
  const excerpts: SurgicalExcerpt[] = [];
  const sectionsUsed = new Set<string>();
  const longInternalMonologues: SurgeryResult['longInternalMonologues'] = [];

  for (let i = 0; i < utterances.length; i++) {
    const u = utterances[i];

    // Relevance gate: skip filler
    if (isFiller(u.text)) continue;

    // Skip short greeting/closing turns
    if (isGreetingOrClosing(u.startTimeMs, callDurationMs, u.text)) continue;

    // Skip utterances under 8 words (V2 rule)
    if (u.text.split(/\s+/).length < 8) continue;

    // Determine if utterance is in a relevant section OR has a tracker match
    const sectionName = isInWindow(u.startTimeMs, windows);
    const hasTracker = u.trackers.length > 0;

    if (!sectionName && !hasTracker) continue;

    if (sectionName) sectionsUsed.add(sectionName);

    // Check if this is a long internal monologue needing smart truncation
    const wordCount = u.text.split(/\s+/).length;
    const needsSmartTruncation = u.isInternal && wordCount > 60;

    // Context enrichment for external utterances
    let contextBefore: string | undefined;
    if (!u.isInternal) {
      contextBefore = enrichContext(utterances, i);
    }

    const excerpt: SurgicalExcerpt = {
      speakerId: u.speakerId,
      text: u.text,
      timestampMs: u.startTimeMs,
      timestampFormatted: formatMs(u.startTimeMs),
      isInternal: u.isInternal,
      trackers: [...u.trackers],
      sectionName: sectionName || undefined,
      needsSmartTruncation,
      contextBefore,
    };

    const excerptIndex = excerpts.length;
    excerpts.push(excerpt);

    if (needsSmartTruncation) {
      longInternalMonologues.push({
        index: excerptIndex,
        text: u.text,
        wordCount,
      });
    }
  }

  return {
    callId,
    excerpts,
    sectionsUsed: [...sectionsUsed],
    originalUtteranceCount: utterances.length,
    extractedUtteranceCount: excerpts.length,
    longInternalMonologues,
  };
}

/**
 * Build the smart truncation prompt for internal monologues.
 * Batches all long internal turns for one call into one prompt.
 */
export function buildSmartTruncationPrompt(
  question: string,
  monologues: Array<{ index: number; text: string }>
): string {
  const parts = monologues.map((m, i) =>
    `--- Segment ${i + 1} (excerpt index ${m.index}) ---\n${m.text}`
  ).join('\n\n');

  return `The user is researching: "${question}"
Below are internal rep monologues from a sales call. For each segment, keep ONLY sentences that:
1. Set up or prompted the customer's response
2. Contain pricing, product claims, or commitments relevant to the research question
3. Ask a question the customer then answers
Drop: pleasantries, filler, repetition.

${parts}

Return JSON array of objects: [{ "index": <excerpt_index>, "kept": "<kept sentences verbatim or [context omitted]>" }]`;
}

/**
 * Format excerpts into the analysis-ready text block for the smart model.
 */
export function formatExcerptsForAnalysis(
  excerpts: SurgicalExcerpt[],
  callTitle: string,
  callDate: string,
  accountName: string,
  talkRatioPct: number,
  trackersFired: string[],
  relevantSections: string[],
  keyPoints: string[]
): string {
  let out = `Call: ${callTitle} (${callDate}) | Account: ${accountName} | Talk ratio: ${talkRatioPct}%\n`;
  out += `Trackers fired: ${trackersFired.join(', ') || 'none'}\n`;
  out += `Outline context: ${relevantSections.join(', ')}\n`;
  if (keyPoints.length > 0) {
    out += `Key points: ${keyPoints.join(' | ')}\n`;
  }
  out += `\nTranscript excerpts:\n\n`;

  for (const ex of excerpts) {
    const label = ex.isInternal ? 'REP CONTEXT' : 'CUSTOMER';
    const trackerTag = ex.trackers.length > 0
      ? `\n[TRACKER: ${ex.trackers.map(t => `"${t}"`).join(', ')} fired here]`
      : '';

    if (ex.contextBefore) {
      out += `[${ex.timestampFormatted}] [CONTEXT: ${ex.contextBefore}]\n`;
    }
    out += `[${ex.timestampFormatted}] [${label}: ${ex.text}]${trackerTag}\n\n`;
  }

  return out;
}
