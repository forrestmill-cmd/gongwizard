import { NextRequest, NextResponse } from 'next/server';
import { smartCompleteJSON } from '@/lib/ai-providers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, allFindings } = body;

    if (!question || !allFindings || !Array.isArray(allFindings)) {
      return NextResponse.json(
        { error: 'question and allFindings[] are required' },
        { status: 400 }
      );
    }

    // allFindings is array of { callId, callTitle, account, findings[] }
    const findingsSummary = allFindings
      .filter((cf: any) => cf.findings && cf.findings.length > 0)
      .map((cf: any) => {
        const findingTexts = cf.findings
          .map((f: any, i: number) =>
            `  ${i + 1}. [${f.significance}] "${f.exact_quote}" (${f.finding_type}) — ${f.context}`
          )
          .join('\n');
        return `Call: ${cf.callTitle} (${cf.account})\n${findingTexts}`;
      })
      .join('\n\n');

    if (!findingsSummary) {
      return NextResponse.json({
        themes: [],
        summary: 'No relevant findings were identified across the analyzed calls.',
      });
    }

    const prompt = `Research question: "${question}"

All findings across ${allFindings.length} calls:

${findingsSummary}

Synthesize cross-call themes. For each theme:
- theme: Short name for the pattern
- frequency: How many calls exhibit this pattern
- representative_quotes: 2-3 best verbatim quotes illustrating the theme
- call_ids: Which calls contain this theme

Also provide an overall_summary (2-3 sentences).

Return JSON: { "themes": [{ "theme": "", "frequency": 0, "representative_quotes": [], "call_ids": [] }], "overall_summary": "" }`;

    const result = await smartCompleteJSON<{
      themes: Array<{
        theme: string;
        frequency: number;
        representative_quotes: string[];
        call_ids: string[];
      }>;
      overall_summary: string;
    }>(prompt, {
      temperature: 0.3,
      maxTokens: 4096,
      systemPrompt: 'You are a senior sales analyst synthesizing patterns across multiple customer calls. Identify recurring themes, not one-off mentions. Use exact quotes from the data.',
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
