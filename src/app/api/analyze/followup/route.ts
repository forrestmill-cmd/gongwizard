import { NextRequest, NextResponse } from 'next/server';
import { smartCompleteJSON } from '@/lib/ai-providers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, followUpQuestion, processedData, previousFindings } = body;

    if (!followUpQuestion || !processedData) {
      return NextResponse.json(
        { error: 'followUpQuestion and processedData are required' },
        { status: 400 }
      );
    }

    const prompt = `Original research question: "${question || 'Not specified'}"

Follow-up question: "${followUpQuestion}"

Processed call data:
${processedData}

${previousFindings ? `Previous findings:\n${JSON.stringify(previousFindings, null, 2)}` : ''}

Answer the follow-up question using ONLY the call data above. Include:
- Direct quotes from the transcripts where applicable
- Specific call references (title, account)
- Quantitative observations (how many calls, frequency)

Return JSON: { "answer": "<detailed answer>", "supporting_quotes": [{ "quote": "", "call": "", "timestamp": "" }], "calls_referenced": [] }`;

    const result = await smartCompleteJSON<{
      answer: string;
      supporting_quotes: Array<{
        quote: string;
        call: string;
        timestamp: string;
      }>;
      calls_referenced: string[];
    }>(prompt, {
      temperature: 0.3,
      maxTokens: 4096,
      systemPrompt: 'You are a sales research assistant answering follow-up questions about analyzed call data. Be precise and cite specific evidence.',
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Followup route error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Follow-up failed' },
      { status: 500 }
    );
  }
}
