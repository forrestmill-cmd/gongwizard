// Transcript formatting and export builders

import { estimateTokens } from './token-utils';
import { formatDuration, formatTimestamp } from './format-utils';

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
}

export interface ExportOptions {
  removeFillerGreetings: boolean;
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

// ─── Filler / monologue processing ──────────────────────────────────────────

const FILLER_PATTERNS = [
  /^(hi|hello|hey|thanks|thank you|bye|goodbye|talk soon|have a great|sounds good|absolutely|of course|sure|yeah|yes|no|okay|ok|alright|right|great|perfect)[!.,\s]*$/i,
];

export function filterFillerTurns(turns: FormattedTurn[]): FormattedTurn[] {
  return turns.filter((t) => {
    const trimmed = t.text.trim();
    if (trimmed.length < 5) return false;
    return !FILLER_PATTERNS.some((p) => p.test(trimmed));
  });
}

export function condenseInternalMonologues(turns: FormattedTurn[]): FormattedTurn[] {
  const result: FormattedTurn[] = [];
  let i = 0;
  while (i < turns.length) {
    const turn = turns[i];
    if (turn.isInternal) {
      let j = i + 1;
      const group: FormattedTurn[] = [turn];
      while (j < turns.length && turns[j].isInternal && turns[j].speakerId === turn.speakerId) {
        group.push(turns[j]);
        j++;
      }
      if (group.length > 2) {
        const condensed: FormattedTurn = {
          ...turn,
          text: group.map((t) => t.text).join(' '),
        };
        result.push(condensed);
        i = j;
      } else {
        result.push(turn);
        i++;
      }
    } else {
      result.push(turn);
      i++;
    }
  }
  return result;
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
  if (opts.removeFillerGreetings) turns = filterFillerTurns(turns);
  if (opts.condenseMonologues) turns = condenseInternalMonologues(turns);

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
    if (opts.removeFillerGreetings) turns = filterFillerTurns(turns);
    if (opts.condenseMonologues) turns = condenseInternalMonologues(turns);

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
      if (opts.removeFillerGreetings) turns = filterFillerTurns(turns);
      if (opts.condenseMonologues) turns = condenseInternalMonologues(turns);

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

export function buildExportContent(
  calls: CallForExport[],
  fmt: 'markdown' | 'xml' | 'jsonl',
  opts: ExportOptions
): { content: string; extension: string; mimeType: string } {
  if (fmt === 'markdown') {
    return { content: buildMarkdown(calls, opts), extension: 'md', mimeType: 'text/markdown' };
  } else if (fmt === 'xml') {
    return { content: buildXML(calls, opts), extension: 'xml', mimeType: 'application/xml' };
  } else {
    return { content: buildJSONL(calls, opts), extension: 'jsonl', mimeType: 'application/jsonl' };
  }
}
