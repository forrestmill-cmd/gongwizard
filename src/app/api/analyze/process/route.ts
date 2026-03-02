import { NextRequest, NextResponse } from 'next/server';
import { cheapCompleteJSON } from '@/lib/ai-providers';
import { buildSmartTruncationPrompt } from '@/lib/transcript-surgery';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, monologues } = body;

    if (!question || !monologues || !Array.isArray(monologues)) {
      return NextResponse.json(
        { error: 'question and monologues[] are required' },
        { status: 400 }
      );
    }

    // Batch all monologues for one call into a single prompt
    const prompt = buildSmartTruncationPrompt(question, monologues);

    const results = await cheapCompleteJSON<
      Array<{ index: number; kept: string }>
    >(prompt, { temperature: 0.2, maxTokens: 2048 });

    return NextResponse.json({ truncated: results });
  } catch (error) {
    console.error('Process route error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    );
  }
}
