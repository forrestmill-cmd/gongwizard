import { NextRequest, NextResponse } from 'next/server';
import { smartCompleteJSON } from '@/lib/ai-providers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, allFindings } = body;

    if (!question || !allFindings || !Array.isArray(allFindings)) {
      return NextResponse.json({ error: 'question and allFindings[] are required' }, { status: 400 });
    }

    // allFindings: [{ callId, callTitle, callDate, account, findings[] }]
    // findings now include: exact_quote, speaker_name, job_title, company, is_external, timestamp, context
    const findingsSummary = allFindings
      .filter((cf: any) => cf.findings?.some((f: any) => f.is_external))
      .map((cf: any) => {
        const externalFindings = cf.findings.filter((f: any) => f.is_external);
        const findingTexts = externalFindings
          .map(
            (f: any) =>
              `  - "${f.exact_quote}" — ${f.speaker_name}${f.job_title ? `, ${f.job_title}` : ''}${f.company ? ` at ${f.company}` : ''}`
          )
          .join('\n');
        return `Call: "${cf.callTitle}" | Date: ${cf.callDate || 'Unknown'} | Account: ${cf.account}\n${findingTexts}`;
      })
      .join('\n\n');

    if (!findingsSummary) {
      return NextResponse.json({
        answer:
          'No relevant statements from external speakers were found in the analyzed calls.',
        quotes: [],
      });
    }

    const prompt = `Research question: "${question}"

Evidence from ${allFindings.length} analyzed calls (external speaker quotes only):

${findingsSummary}

Answer the research question directly and concisely in 2-4 sentences. Then select the most relevant supporting verbatim quotes from the evidence above.

For each quote, preserve ALL attribution data exactly as shown: speaker name, job title, company, call title, call date.

Return JSON:
{
  "answer": "Direct 2-4 sentence answer to the research question",
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

Include at least 1 quote if any external speaker evidence exists. Do not paraphrase — all quotes must be verbatim from the evidence above.`;

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
        'You are a research assistant synthesizing evidence from sales call transcripts. Answer questions directly. Support answers with verbatim quotes exclusively from external/prospect speakers. Preserve all attribution data exactly — speaker name, job title, company, call title, and date.',
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Synthesize route error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Synthesis failed' },
      { status: 500 }
    );
  }
}
