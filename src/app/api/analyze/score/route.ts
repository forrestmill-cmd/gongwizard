import { NextRequest, NextResponse } from 'next/server';
import { cheapCompleteJSON } from '@/lib/ai-providers';
import type { GongCall } from '@/types/gong';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { question?: string; calls?: GongCall[] };
    const { question, calls } = body;

    if (!question || !calls || !Array.isArray(calls)) {
      return NextResponse.json(
        { error: 'question and calls[] are required' },
        { status: 400 }
      );
    }

    const prompt = `Score each of the following ${calls.length} sales calls for relevance to this research question: "${question}"

For each call, return a score 0-10, a one-sentence reason, and the section names from the outline that likely contain relevant signal.

Return JSON exactly: { "scores": [{ "callId": "...", "score": 0-10, "reason": "one sentence", "relevant_sections": ["section name", ...] }] }
Include all ${calls.length} calls in the scores array in the same order.

${calls.map((call: GongCall, i: number) => {
  const trackerNames = (call.trackers || []).filter(Boolean);

  const outlineSummary = (call.outline || [])
    .filter((s) => s.name)
    .map((s) => {
      const items = (s.items || [])
        .map((item) => item.text)
        .filter(Boolean)
        .slice(0, 3)
        .map((t: string) => `    • ${t.slice(0, 100)}`)
        .join('\n');
      return items ? `  ${s.name}:\n${items}` : `  ${s.name}`;
    })
    .join('\n');

  return `
=== CALL ${i + 1}: ${call.id} | ${call.title || 'Untitled'} ===
Brief: ${call.brief || 'None'}
Key points: ${(call.keyPoints || []).join(' | ') || 'None'}
Trackers fired: ${trackerNames.join(', ') || 'None'}
Topics: ${(call.topics || []).join(', ') || 'None'}
Talk ratio (internal): ${call.talkRatio != null ? Math.round(call.talkRatio * 100) + '%' : 'Unknown'}

Outline:
${outlineSummary || 'None'}`;
}).join('\n')}`;

    try {
      const result = await cheapCompleteJSON<{
        scores: Array<{
          callId: string;
          score: number;
          reason: string;
          relevant_sections: string[];
        }>;
      }>(prompt, { temperature: 0.2, maxTokens: 4096 });

      const normalizedScores = (result.scores || []).map((s) => ({
        callId: s.callId,
        score: Math.max(0, Math.min(10, s.score || 0)),
        reason: s.reason || '',
        relevantSections: s.relevant_sections || [],
      }));

      return NextResponse.json({ scores: normalizedScores });
    } catch (err) {
      console.error('Batch scoring failed, returning neutral scores:', err);
      const fallbackScores = calls.map((call: GongCall) => {
        const outlineSections = (call.outline || [])
          .map((s) => s.name)
          .filter(Boolean);
        return {
          callId: call.id,
          score: 5,
          reason: 'Scoring failed — included at neutral priority',
          relevantSections: outlineSections,
        };
      });
      return NextResponse.json({ scores: fallbackScores });
    }
  } catch (error) {
    console.error('Score route error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scoring failed' },
      { status: 500 }
    );
  }
}
