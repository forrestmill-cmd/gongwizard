import { NextRequest } from 'next/server';
import { smartCompleteJSON } from '@/lib/ai-providers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, callData } = body;

    if (!question || !callData) {
      return new Response(JSON.stringify({ error: 'question and callData required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // callData is the formatted transcript excerpt string from formatExcerptsForAnalysis
    const prompt = `Research question: "${question}"

${callData}

Find evidence relevant to the research question. For each finding:
- exact_quote: Exact customer quote (verbatim from transcript)
- timestamp: The timestamp from the transcript
- context: What prompted it (rep context)
- significance: "high", "medium", or "low"
- finding_type: "objection", "need", "competitive", "question", or "feedback"

If no relevant findings, return empty array.
Return JSON: { "findings": [{ "exact_quote": "", "timestamp": "", "context": "", "significance": "", "finding_type": "" }] }`;

    const result = await smartCompleteJSON<{
      findings: Array<{
        exact_quote: string;
        timestamp: string;
        context: string;
        significance: string;
        finding_type: string;
      }>;
    }>(prompt, {
      temperature: 0.3,
      maxTokens: 4096,
      systemPrompt: 'You are an expert sales call analyst. Extract findings precisely. Only include findings with direct evidence from the transcript. Use verbatim quotes.',
    });

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Run route error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Analysis failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
