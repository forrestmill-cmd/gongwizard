import { NextRequest } from 'next/server';
import { smartCompleteJSON } from '@/lib/ai-providers';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, callData, speakerDirectory, callMeta } = body;

    if (!question || !callData) {
      return new Response(JSON.stringify({ error: 'question and callData required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build speaker context for attribution
    const externalSpeakers = speakerDirectory
      ? speakerDirectory.filter((s: { isInternal: boolean }) => !s.isInternal)
      : [];

    const speakerContext =
      externalSpeakers.length > 0
        ? `External speakers in this call:\n${externalSpeakers
            .map(
              (s: { name: string; jobTitle?: string; company?: string }) =>
                `- ${s.name}${s.jobTitle ? `, ${s.jobTitle}` : ''}${s.company ? ` at ${s.company}` : ''}`
            )
            .join('\n')}`
        : 'Note: External speaker details not available. Identify external speakers from context.';

    const callContext = callMeta ? `Call: "${callMeta.title}" on ${callMeta.date}` : '';

    const prompt = `Research question: "${question}"

${callContext}
${speakerContext}

${callData}

Find evidence relevant to the research question from EXTERNAL speakers only (prospects, customers, partners — not internal team members or sales reps).

For each finding:
- exact_quote: Verbatim quote from an external speaker only
- speaker_name: Full name of the external speaker
- job_title: Their job title (from speaker directory above, or inferred from context)
- company: Their company/affiliation (from speaker directory above, or inferred from context)
- is_external: true (only include external speaker quotes)
- timestamp: The timestamp from the transcript
- context: Brief description of what prompted this statement
- significance: "high", "medium", or "low"
- finding_type: "objection", "need", "competitive", "question", or "feedback"

IMPORTANT: Never quote internal team members or sales reps. Only quote external speakers.

If no relevant external speaker findings, return empty array.
Return JSON: { "findings": [{ "exact_quote": "", "speaker_name": "", "job_title": "", "company": "", "is_external": true, "timestamp": "", "context": "", "significance": "", "finding_type": "" }] }`;

    const result = await smartCompleteJSON<{
      findings: Array<{
        exact_quote: string;
        speaker_name: string;
        job_title: string;
        company: string;
        is_external: boolean;
        timestamp: string;
        context: string;
        significance: string;
        finding_type: string;
      }>;
    }>(prompt, {
      temperature: 0.3,
      maxTokens: 4096,
      systemPrompt:
        "You are an expert sales call analyst. Extract verbatim quotes exclusively from external/prospect speakers — never from internal team members or sales reps. Always attribute quotes with the speaker's full name, job title, and company from the speaker directory provided.",
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
