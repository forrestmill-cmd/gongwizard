import { NextRequest, NextResponse } from 'next/server';
import { cheapCompleteJSON } from '@/lib/ai-providers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, calls } = body;

    if (!question || !calls || !Array.isArray(calls)) {
      return NextResponse.json(
        { error: 'question and calls[] are required' },
        { status: 400 }
      );
    }

    // Score calls in batches of 8 to avoid rate-limit bursts
    const BATCH_SIZE = 8;
    const allResults: any[] = [];
    for (let i = 0; i < calls.length; i += BATCH_SIZE) {
      const batch = calls.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map((call: any) => scoreCall(call, question)));
      allResults.push(...batchResults);
    }

    return NextResponse.json({ scores: allResults });
  } catch (error) {
    console.error('Score route error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scoring failed' },
      { status: 500 }
    );
  }
}

async function scoreCall(call: any, question: string) {
  const trackerNames = (call.trackers || [])
    .map((t: any) => t.name || t)
    .filter(Boolean);

  const outlineSections = (call.outline || [])
    .map((s: any) => s.name)
    .filter(Boolean);

  // Build outline with Gong AI item descriptions (up to 3 per section, 100 chars each)
  const outlineSummary = (call.outline || [])
    .filter((s: any) => s.name)
    .map((s: any) => {
      const items = (s.items || [])
        .map((item: any) => item.text)
        .filter(Boolean)
        .slice(0, 3)
        .map((t: string) => `    • ${t.slice(0, 100)}`)
        .join('\n');
      return items ? `  ${s.name}:\n${items}` : `  ${s.name}`;
    })
    .join('\n');

  const prompt = `You are scoring a sales call for relevance to a research question.

Research question: "${question}"

Call metadata:
- Title: ${call.title || 'Untitled'}
- Brief: ${call.brief || 'No summary available'}
- Key points: ${(call.keyPoints || []).join(' | ') || 'None'}
- Trackers fired: ${trackerNames.join(', ') || 'None'}
- Topics: ${(call.topics || []).join(', ') || 'None'}
- Talk ratio: ${call.talkRatio != null ? Math.round(call.talkRatio * 100) + '%' : 'Unknown'}

Call outline with Gong AI topic summaries:
${outlineSummary || 'None'}

Score this call 0-10 for relevance to the research question.
Return JSON: { "score": <0-10>, "reason": "<one sentence>", "relevant_sections": ["<section names from outline that likely contain signal>"] }`;

  try {
    const result = await cheapCompleteJSON<{
      score: number;
      reason: string;
      relevant_sections: string[];
    }>(prompt, { temperature: 0.2, maxTokens: 512 });

    return {
      callId: call.id,
      score: Math.max(0, Math.min(10, result.score || 0)),
      reason: result.reason || '',
      relevantSections: result.relevant_sections || [],
    };
  } catch (err) {
    console.error(`Scoring failed for call ${call.id}:`, err);
    return {
      callId: call.id,
      score: 5, // neutral fallback
      reason: 'Scoring failed — included at neutral priority',
      relevantSections: outlineSections,
    };
  }
}
