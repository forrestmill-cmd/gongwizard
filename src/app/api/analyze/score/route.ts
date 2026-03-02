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

    // Score each call in parallel (cheap model, fast)
    const results = await Promise.all(
      calls.map(async (call: any) => {
        const trackerNames = (call.trackers || [])
          .map((t: any) => t.name || t)
          .filter(Boolean);

        const outlineSections = (call.outline || [])
          .map((s: any) => s.name)
          .filter(Boolean);

        const prompt = `You are scoring a sales call for relevance to a research question.

Research question: "${question}"

Call metadata:
- Title: ${call.title || 'Untitled'}
- Brief: ${call.brief || 'No summary available'}
- Key points: ${(call.keyPoints || []).join(' | ') || 'None'}
- Outline sections: ${outlineSections.join(', ') || 'None'}
- Trackers fired: ${trackerNames.join(', ') || 'None'}
- Topics: ${(call.topics || []).join(', ') || 'None'}
- Talk ratio: ${call.talkRatio != null ? Math.round(call.talkRatio * 100) + '%' : 'Unknown'}

Score this call 0-10 for relevance to the research question.
Return JSON: { "score": <0-10>, "reason": "<one sentence>", "relevant_sections": ["<section names from outline that likely contain signal>"] }`;

        try {
          const result = await cheapCompleteJSON<{
            score: number;
            reason: string;
            relevant_sections: string[];
          }>(prompt, { temperature: 0.2, maxTokens: 256 });

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
            relevantSections: outlineSections, // use all sections as fallback
          };
        }
      })
    );

    return NextResponse.json({ scores: results });
  } catch (error) {
    console.error('Score route error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scoring failed' },
      { status: 500 }
    );
  }
}
