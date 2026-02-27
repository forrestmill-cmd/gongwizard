import type { ProcessedCall, ExportOptions } from './types';

export interface TranscriptData {
  speakerLines: string[];
  transcriptLines: string[];
}

export interface ExportResult {
  content: string;
  filename: string;
  tokenEstimate: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateMarkdown(
  calls: ProcessedCall[],
  transcripts: Map<string, TranscriptData>,
  options: ExportOptions
): string {
  const now = new Date().toISOString();
  const lines: string[] = [];

  // Build content first to estimate tokens
  const bodyLines: string[] = [];

  for (const call of calls) {
    const t = transcripts.get(call.id);
    bodyLines.push(`## Call: ${call.title}`);
    bodyLines.push('');

    if (options.includeMetadata) {
      bodyLines.push(
        `**Date:** ${call.date} | **Duration:** ${call.durationFormatted}`
      );
      bodyLines.push(
        `**Account:** ${call.accountName} | **Industry:** ${call.accountIndustry}`
      );
      bodyLines.push(`**Direction:** ${call.direction}`);
      bodyLines.push('');
    }

    if (t && t.speakerLines.length > 0) {
      bodyLines.push('### Speakers');
      for (const sl of t.speakerLines) {
        bodyLines.push(`- ${sl}`);
      }
      bodyLines.push('');
    }

    if (options.includeAiBrief && call.brief) {
      bodyLines.push('### Gong AI Brief');
      bodyLines.push(call.brief);
      bodyLines.push('');
    }

    if (call.keyPoints.length > 0) {
      bodyLines.push('### Key Points');
      for (const kp of call.keyPoints) {
        bodyLines.push(`- ${kp}`);
      }
      bodyLines.push('');
    }

    if (call.actionItems.length > 0) {
      bodyLines.push('### Action Items');
      for (const ai of call.actionItems) {
        bodyLines.push(`- ${ai}`);
      }
      bodyLines.push('');
    }

    if (options.includeInteractionStats) {
      const stats = call.interactionStats;
      if (
        stats.talkRatio !== null ||
        stats.longestMonologue !== null ||
        stats.patience !== null
      ) {
        bodyLines.push('### Interaction Stats');
        if (stats.talkRatio !== null) {
          bodyLines.push(`- Talk Ratio: ${Math.round(stats.talkRatio * 100)}%`);
        }
        if (stats.longestMonologue !== null) {
          bodyLines.push(`- Longest Monologue: ${stats.longestMonologue}s`);
        }
        if (stats.patience !== null) {
          bodyLines.push(`- Patience: ${stats.patience}`);
        }
        bodyLines.push('');
      }
    }

    if (t && t.transcriptLines.length > 0) {
      bodyLines.push('### Transcript');
      bodyLines.push('[I]=Internal, [E]=External (shown in ALL CAPS)');
      bodyLines.push('');
      for (const tl of t.transcriptLines) {
        bodyLines.push(tl);
      }
    }

    bodyLines.push('---');
    bodyLines.push('');
  }

  const bodyText = bodyLines.join('\n');
  const tokenEst = estimateTokens(bodyText);

  lines.push('# Call Transcripts Export');
  lines.push(`Generated: ${now}`);
  lines.push(`Total Calls: ${calls.length}`);
  lines.push(`Estimated Tokens: ~${tokenEst}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(bodyText);

  return lines.join('\n');
}

function generateXml(
  calls: ProcessedCall[],
  transcripts: Map<string, TranscriptData>,
  options: ExportOptions
): string {
  const now = new Date().toISOString();
  const lines: string[] = [];

  // Pre-estimate tokens from a rough pass
  const roughText = calls
    .map((c) => {
      const t = transcripts.get(c.id);
      return [c.title, c.brief, ...(t?.transcriptLines || [])].join(' ');
    })
    .join(' ');
  const tokenEst = estimateTokens(roughText);

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<calls export_date="${escapeXml(now)}" total="${calls.length}" estimated_tokens="${tokenEst}">`
  );

  for (const call of calls) {
    const t = transcripts.get(call.id);

    lines.push(
      `  <call id="${escapeXml(call.id)}" title="${escapeXml(call.title)}" date="${escapeXml(call.date)}" duration="${escapeXml(call.durationFormatted)}">`
    );

    if (options.includeMetadata) {
      lines.push('    <metadata>');
      lines.push(`      <account>${escapeXml(call.accountName)}</account>`);
      lines.push(`      <industry>${escapeXml(call.accountIndustry)}</industry>`);
      lines.push(`      <direction>${escapeXml(call.direction)}</direction>`);
      lines.push('    </metadata>');
    }

    if (t && t.speakerLines.length > 0) {
      lines.push('    <speakers>');
      for (const party of call.speakers) {
        const role = party.affiliation === 'internal' ? 'I' : 'E';
        lines.push(
          `      <speaker name="${escapeXml(party.name)}" role="${role}" title="${escapeXml(party.title)}"/>`
        );
      }
      lines.push('    </speakers>');
    }

    if (options.includeAiBrief && call.brief) {
      lines.push(`    <ai_brief>${escapeXml(call.brief)}</ai_brief>`);
    }

    if (call.keyPoints.length > 0) {
      lines.push('    <key_points>');
      for (const kp of call.keyPoints) {
        lines.push(`      <point>${escapeXml(kp)}</point>`);
      }
      lines.push('    </key_points>');
    }

    if (call.actionItems.length > 0) {
      lines.push('    <action_items>');
      for (const ai of call.actionItems) {
        lines.push(`      <item>${escapeXml(ai)}</item>`);
      }
      lines.push('    </action_items>');
    }

    if (options.includeInteractionStats) {
      const stats = call.interactionStats;
      const ratio =
        stats.talkRatio !== null ? String(Math.round(stats.talkRatio * 100)) : '';
      const mono = stats.longestMonologue !== null ? String(stats.longestMonologue) : '';
      lines.push(
        `    <interaction_stats talk_ratio="${ratio}" longest_monologue="${mono}"/>`
      );
    }

    if (t && t.transcriptLines.length > 0) {
      lines.push('    <transcript>');

      let i = 0;
      while (i < t.transcriptLines.length) {
        const headerLine = t.transcriptLines[i];
        if (!headerLine) {
          i++;
          continue;
        }
        // Header format: "M:SS | FirstName [I/E]"
        const headerMatch = headerLine.match(/^(\d+:\d+)\s*\|\s*(.+?)\s*\[([IE])\]$/);
        if (headerMatch) {
          const [, time, name, role] = headerMatch;
          const textLine = t.transcriptLines[i + 1] || '';
          lines.push(
            `      <turn speaker="${escapeXml(name)}" role="${role}" time="${escapeXml(time)}">`
          );
          lines.push(`        ${escapeXml(textLine)}`);
          lines.push('      </turn>');
          i += 3; // header + text + blank line
        } else {
          i++;
        }
      }

      lines.push('    </transcript>');
    }

    lines.push('  </call>');
  }

  lines.push('</calls>');
  return lines.join('\n');
}

function generateJsonl(
  calls: ProcessedCall[],
  transcripts: Map<string, TranscriptData>
): string {
  const jsonlLines: string[] = [];

  for (const call of calls) {
    const t = transcripts.get(call.id);

    const obj = {
      id: call.id,
      title: call.title,
      date: call.date,
      dateRaw: call.dateRaw,
      duration: call.duration,
      durationFormatted: call.durationFormatted,
      url: call.url,
      direction: call.direction,
      accountName: call.accountName,
      accountIndustry: call.accountIndustry,
      speakers: call.speakers,
      internalCount: call.internalCount,
      externalCount: call.externalCount,
      topics: call.topics,
      trackers: call.trackers,
      brief: call.brief,
      keyPoints: call.keyPoints,
      actionItems: call.actionItems,
      interactionStats: call.interactionStats,
      speakerLines: t?.speakerLines || [],
      transcriptLines: t?.transcriptLines || [],
    };

    jsonlLines.push(JSON.stringify(obj));
  }

  return jsonlLines.join('\n');
}

export function generateExport(
  calls: ProcessedCall[],
  transcripts: Map<string, TranscriptData>,
  options: ExportOptions
): ExportResult {
  const timestamp = new Date().toISOString().slice(0, 10);
  const callCount = calls.length;

  let content: string;
  let filename: string;

  switch (options.format) {
    case 'markdown': {
      content = generateMarkdown(calls, transcripts, options);
      filename = `gong-transcripts-${callCount}calls-${timestamp}.md`;
      break;
    }
    case 'xml': {
      content = generateXml(calls, transcripts, options);
      filename = `gong-transcripts-${callCount}calls-${timestamp}.xml`;
      break;
    }
    case 'jsonl': {
      content = generateJsonl(calls, transcripts);
      filename = `gong-transcripts-${callCount}calls-${timestamp}.jsonl`;
      break;
    }
  }

  return {
    content,
    filename,
    tokenEstimate: estimateTokens(content),
  };
}
