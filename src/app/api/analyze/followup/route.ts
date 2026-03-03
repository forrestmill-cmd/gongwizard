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

Call evidence (external speaker quotes, with full attribution):
${processedData}

${previousFindings ? `Context from previous answers:\n${JSON.stringify(previousFindings, null, 2)}` : ''}

Answer the follow-up question using ONLY external speaker quotes from the call evidence above. Never quote internal team members or sales reps.

Return JSON:
{
  "answer": "Direct 2-4 sentence answer to the follow-up question",
  "quotes": [
    {
      "quote": "verbatim text exactly as it appears in the evidence above",
      "speaker_name": "full name",
      "job_title": "their title or empty string if unknown",
      "company": "their company or empty string if unknown",
      "call_title": "the call title",
      "call_date": "the call date"
    }
  ]
}

Include at least 1 quote if relevant external speaker evidence exists. All quotes must be verbatim from the evidence above.`;

    const result = await smartCompleteJSON<{
      answer: string;
      quotes: Array<{
        quote: string;
        speaker_name: string;
        job_title: string;
        company: string;
        call_title: string;
        call_date: string;
      }>;
    }>(prompt, {
      temperature: 0.3,
      maxTokens: 4096,
      systemPrompt:
        'You are a research assistant answering follow-up questions about analyzed call transcripts. Be precise. Only cite external/prospect speakers — never internal team members. Preserve all attribution data exactly: speaker name, job title, company, call title, and date.',
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
