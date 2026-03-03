// Transcript formatting and export builders

import { estimateTokens } from './token-utils';
import { formatDuration, formatTimestamp } from './format-utils';
import { buildUtterances, alignTrackersToUtterances, extractTrackerOccurrences } from './tracker-alignment';
import { findNearestOutlineItem, type OutlineSection } from './transcript-surgery';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Speaker {
  speakerId: string;
  name: string;
  firstName: string;
  isInternal: boolean;
  title?: string;
}

export interface TranscriptSentence {
  speakerId: string;
  text: string;
  start: number;
}

export interface FormattedTurn {
  speakerId: string;
  firstName: string;
  isInternal: boolean;
  timestamp: string;
  text: string;
}

export interface CallForExport {
  id: string;
  title: string;
  date: string;
  duration: number;
  accountName: string;
  speakers: Speaker[];
  brief: string;
  turns: FormattedTurn[];
  interactionStats?: any;
  rawMonologues?: Array<{
    speakerId: string;
    sentences?: Array<{ text: string; start: number; end?: number }>;
  }>;
}

export interface ExportOptions {
  condenseMonologues: boolean;
  includeMetadata: boolean;
  includeAIBrief: boolean;
  includeInteractionStats: boolean;
}

// ─── Transcript grouping ────────────────────────────────────────────────────

export function groupTranscriptTurns(
  sentences: TranscriptSentence[],
  speakerMap: Map<string, Speaker>
): FormattedTurn[] {
  const turns: FormattedTurn[] = [];
  let current: { speakerId: string; sentences: TranscriptSentence[] } | null = null;

  function flushGroup() {
    if (!current) return;
    const spk = speakerMap.get(current.speakerId);
    const firstName = spk?.firstName || spk?.name?.split(' ')[0] || 'Unknown';
    const isInternal = spk?.isInternal ?? true;
    const ts = formatTimestamp(current.sentences[0].start);
    const text = current.sentences.map((s) => s.text).join(' ');
    turns.push({ speakerId: current.speakerId, firstName, isInternal, timestamp: ts, text });
  }

  for (const sentence of sentences) {
    if (!current || current.speakerId !== sentence.speakerId) {
      flushGroup();
      current = { speakerId: sentence.speakerId, sentences: [sentence] };
    } else {
      current.sentences.push(sentence);
    }
  }
  flushGroup();

  return turns;
}

// ─── Internal turn truncation ────────────────────────────────────────────────
// Turns ≥150 words: keep first 2 sentences + [...] + last 2 sentences.
// Below threshold: pass verbatim. Applied only to internal (rep) turns.

const INTERNAL_WORD_THRESHOLD = 150;

function truncateIfLong(text: string): string {
  const words = text.trim().split(/\s+/);
  if (words.length < INTERNAL_WORD_THRESHOLD) return text.trim();
  const sentences = text.trim().match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [text.trim()];
  if (sentences.length <= 4) return text.trim();
  const first2 = sentences.slice(0, 2).join(' ').trim();
  const last2 = sentences.slice(-2).join(' ').trim();
  return `${first2} [...] ${last2}`;
}

export function truncateLongInternalTurns(turns: FormattedTurn[]): FormattedTurn[] {
  return turns.map((turn) =>
    turn.isInternal ? { ...turn, text: truncateIfLong(turn.text) } : turn
  );
}

// ─── Export builders ────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildCallText(call: CallForExport, opts: ExportOptions): string {
  let out = `## Call: ${call.title}\n`;
  out += `**Date:** ${call.date} | **Duration:** ${formatDuration(call.duration)}\n`;
  if (opts.includeMetadata && call.accountName) {
    out += `**Account:** ${call.accountName}\n`;
  }
  out += '\n';

  if (opts.includeMetadata && call.speakers.length > 0) {
    out += `### Speakers\n`;
    for (const s of call.speakers) {
      out += `- ${s.name} [${s.isInternal ? 'I' : 'E'}]${s.title ? `: ${s.title}` : ''}\n`;
    }
    out += '\n';
  }

  if (opts.includeAIBrief && call.brief) {
    out += `### Gong AI Brief\n${call.brief}\n\n`;
  }

  if (opts.includeInteractionStats && call.interactionStats) {
    out += `### Interaction Stats\n`;
    const stats = call.interactionStats;
    if (stats.talkRatio != null) out += `- Talk Ratio: ${Math.round(stats.talkRatio * 100)}%\n`;
    if (stats.interactivity != null) out += `- Interactivity: ${stats.interactivity.toFixed(2)}\n`;
    if (stats.longestMonologue != null) out += `- Longest Monologue: ${formatDuration(Math.round(stats.longestMonologue))}\n`;
    if (stats.patience != null) out += `- Patience: ${stats.patience.toFixed(2)}\n`;
    if (stats.questionRate != null) out += `- Question Rate: ${stats.questionRate.toFixed(2)}\n`;
    out += '\n';
  }

  out += `### Transcript\n`;
  out += `[I]=Internal, [E]=External (shown in ALL CAPS)\n\n`;

  let turns = call.turns;
  if (opts.condenseMonologues) turns = truncateLongInternalTurns(turns);

  for (const turn of turns) {
    const label = `${turn.isInternal ? 'I' : 'E'}`;
    const text = turn.isInternal ? turn.text : turn.text.toUpperCase();
    out += `${turn.timestamp} | ${turn.firstName} [${label}]\n${text}\n\n`;
  }

  return out;
}

export function buildMarkdown(calls: CallForExport[], opts: ExportOptions): string {
  const now = new Date().toISOString().split('T')[0];
  const allText = calls.map((c) => buildCallText(c, opts)).join('\n\n---\n\n');
  const tokens = estimateTokens(allText);

  let out = `# Call Transcripts Export\n`;
  out += `Generated: ${now}\n`;
  out += `Total Calls: ${calls.length}\n`;
  out += `Estimated Tokens: ~${tokens.toLocaleString()}\n\n---\n\n`;
  out += allText;
  return out;
}

export function buildXML(calls: CallForExport[], opts: ExportOptions): string {
  const now = new Date().toISOString().split('T')[0];
  let out = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  out += `<calls export_date="${now}" total="${calls.length}">\n`;

  for (const call of calls) {
    let turns = call.turns;
    if (opts.condenseMonologues) turns = truncateLongInternalTurns(turns);

    out += `  <call id="${escapeXml(call.id)}" title="${escapeXml(call.title)}" date="${escapeXml(call.date)}" duration="${call.duration}">\n`;

    if (opts.includeMetadata) {
      out += `    <speakers>\n`;
      for (const s of call.speakers) {
        out += `      <speaker name="${escapeXml(s.name)}" role="${s.isInternal ? 'I' : 'E'}"${s.title ? ` title="${escapeXml(s.title)}"` : ''}/>\n`;
      }
      out += `    </speakers>\n`;
    }

    if (opts.includeAIBrief && call.brief) {
      out += `    <brief>${escapeXml(call.brief)}</brief>\n`;
    }

    if (opts.includeInteractionStats && call.interactionStats) {
      const stats = call.interactionStats;
      out += `    <interactionStats`;
      if (stats.talkRatio != null) out += ` talkRatio="${Math.round(stats.talkRatio * 100)}"`;
      if (stats.interactivity != null) out += ` interactivity="${stats.interactivity.toFixed(2)}"`;
      if (stats.longestMonologue != null) out += ` longestMonologue="${Math.round(stats.longestMonologue)}"`;
      if (stats.patience != null) out += ` patience="${stats.patience.toFixed(2)}"`;
      if (stats.questionRate != null) out += ` questionRate="${stats.questionRate.toFixed(2)}"`;
      out += `/>\n`;
    }

    out += `    <transcript>\n`;
    for (const turn of turns) {
      const text = turn.isInternal ? turn.text : turn.text.toUpperCase();
      out += `      <turn speaker="${escapeXml(turn.firstName)}" role="${turn.isInternal ? 'I' : 'E'}" time="${escapeXml(turn.timestamp)}">${escapeXml(text)}</turn>\n`;
    }
    out += `    </transcript>\n`;
    out += `  </call>\n`;
  }

  out += `</calls>`;
  return out;
}

export function buildJSONL(calls: CallForExport[], opts: ExportOptions): string {
  return calls
    .map((call) => {
      let turns = call.turns;
      if (opts.condenseMonologues) turns = truncateLongInternalTurns(turns);

      const obj: any = {
        id: call.id,
        title: call.title,
        date: call.date,
        duration: call.duration,
      };
      if (opts.includeMetadata) {
        obj.accountName = call.accountName;
        obj.speakers = call.speakers.map((s) => ({
          name: s.name,
          role: s.isInternal ? 'I' : 'E',
          title: s.title,
        }));
      }
      if (opts.includeAIBrief) {
        obj.brief = call.brief;
      }
      obj.transcript = turns.map((t) => ({
        time: t.timestamp,
        speaker: t.firstName,
        role: t.isInternal ? 'I' : 'E',
        text: t.isInternal ? t.text : t.text.toUpperCase(),
      }));
      return JSON.stringify(obj);
    })
    .join('\n');
}

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

export function buildCSVSummary(calls: CallForExport[], allCalls: any[]): string {
  const headers = [
    'Call ID', 'Title', 'Date', 'Duration (s)', 'Duration', 'Account',
    'Topics', 'Trackers', 'Talk Ratio %', 'Brief', 'Key Points', 'Action Items',
    'Internal Speakers', 'External Speakers', 'Gong URL'
  ];

  const callMap = new Map(allCalls.map((c: any) => [c.id, c]));

  const rows = calls.map(call => {
    const full = callMap.get(call.id) || {} as any;
    const internalSpeakers = call.speakers.filter(s => s.isInternal).map(s => s.name).join('; ');
    const externalSpeakers = call.speakers.filter(s => !s.isInternal).map(s => s.name).join('; ');
    const talkRatio = full.talkRatio != null ? Math.round(full.talkRatio * 100).toString() : (full.interactionStats?.talkRatio != null ? Math.round(full.interactionStats.talkRatio * 100).toString() : '');

    return [
      call.id,
      call.title,
      call.date,
      call.duration.toString(),
      formatDuration(call.duration),
      call.accountName || full.accountName || '',
      (full.topics || []).join('; '),
      (full.trackers || []).join('; '),
      talkRatio,
      (call.brief || full.brief || '').replace(/\n/g, ' '),
      (full.keyPoints || []).join('; '),
      (full.actionItems || []).join('; '),
      internalSpeakers,
      externalSpeakers,
      full.url || '',
    ];
  });

  const lines = [headers.map(escapeCSV).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCSV).join(','));
  }
  return lines.join('\n');
}

function buildCsvContext(
  utterances: import('./tracker-alignment').Utterance[],
  index: number,
  speakerMap: Map<string, Speaker>
): string {
  function formatTurn(u: import('./tracker-alignment').Utterance): string {
    const speaker = speakerMap.get(u.speakerId);
    const firstName = speaker?.firstName || speaker?.name?.split(' ')[0] || 'Unknown';
    const label = u.isInternal ? `Internal - ${firstName}` : `External - ${firstName}`;
    return `[${label}] ${truncateIfLong(u.text)}`;
  }

  const parts: string[] = [];

  const prev = index > 0 ? utterances[index - 1] : null;
  if (!prev) return '';

  const prevWords = prev.text.trim().split(/\s+/).length;
  if (prevWords < 11 && index > 1) {
    parts.push(formatTurn(utterances[index - 2]));
  }
  parts.push(formatTurn(prev));

  return parts.join(' | ');
}

export function buildUtteranceCSV(calls: CallForExport[], allCalls: any[]): string {
  const headers = [
    'Call ID', 'Call Date', 'Account Name',
    'Speaker Name', 'Speaker Title',
    'Outline Section', 'Tracker Hits',
    'PRIMARY_ANALYSIS_TEXT', 'REFERENCE_ONLY_CONTEXT',
  ];

  const callMap = new Map(allCalls.map((c: any) => [c.id, c]));
  const rows: string[][] = [];

  for (const call of calls) {
    if (!call.rawMonologues || call.rawMonologues.length === 0) continue;

    const speakerMap = new Map(call.speakers.map(s => [s.speakerId, s]));
    const rawCall = callMap.get(call.id) || {} as any;

    const utterances = buildUtterances(
      call.rawMonologues,
      (speakerId) => speakerMap.get(speakerId)?.isInternal ?? true
    );

    const trackerOccs = extractTrackerOccurrences(rawCall.trackers || []);
    alignTrackersToUtterances(utterances, trackerOccs);

    const outline: OutlineSection[] = (rawCall.outline || []).map((o: any) => ({
      name: o.section || o.name || '',
      startTimeMs: (o.startTime || 0) * 1000,
      durationMs: (o.duration || 0) * 1000,
      items: (o.items || []).map((item: any) => ({
        text: item.text || item.name || '',
        startTimeMs: (item.startTime || 0) * 1000,
        durationMs: (item.duration || 0) * 1000,
      })),
    }));

    for (let i = 0; i < utterances.length; i++) {
      const u = utterances[i];
      if (u.isInternal) continue;

      const speaker = speakerMap.get(u.speakerId);
      const speakerName = speaker?.name || 'Unknown';
      const speakerTitle = speaker?.title || '';

      const outlineSection = findNearestOutlineItem(outline, u.startTimeMs) || '';

      const trackerHits = u.trackers.join('; ');

      const context = buildCsvContext(utterances, i, speakerMap);

      rows.push([
        call.id,
        call.date,
        call.accountName || rawCall.accountName || '',
        speakerName,
        speakerTitle,
        outlineSection,
        trackerHits,
        u.text,
        context,
      ]);
    }
  }

  const lines = [headers.map(escapeCSV).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCSV).join(','));
  }
  return lines.join('\n');
}

export function buildExportContent(
  calls: CallForExport[],
  fmt: 'markdown' | 'xml' | 'jsonl' | 'csv' | 'utterance-csv',
  opts: ExportOptions,
  allCalls?: any[]
): { content: string; extension: string; mimeType: string } {
  if (fmt === 'markdown') {
    return { content: buildMarkdown(calls, opts), extension: 'md', mimeType: 'text/markdown' };
  } else if (fmt === 'xml') {
    return { content: buildXML(calls, opts), extension: 'xml', mimeType: 'application/xml' };
  } else if (fmt === 'csv') {
    return { content: buildCSVSummary(calls, allCalls || []), extension: 'csv', mimeType: 'text/csv' };
  } else if (fmt === 'utterance-csv') {
    return { content: buildUtteranceCSV(calls, allCalls || []), extension: 'csv', mimeType: 'text/csv' };
  } else {
    return { content: buildJSONL(calls, opts), extension: 'jsonl', mimeType: 'application/jsonl' };
  }
}
