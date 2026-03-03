import { NextRequest } from 'next/server';
import { smartCompleteJSON } from '@/lib/ai-providers';

export const maxDuration = 60;

interface SpeakerEntry {
  speakerId: string;
  name: string;
  jobTitle: string;
  company: string;
  isInternal: boolean;
}

interface CallPayload {
  callId: string;
  callData: string;
  speakerDirectory: SpeakerEntry[];
  callMeta: { title: string; date: string };
}

interface Finding {
  exact_quote: string;
  speaker_name: string;
  job_title: string;
  company: string;
  is_external: boolean;
  timestamp: string;
  context: string;
  significance: 'high' | 'medium' | 'low';
  finding_type: 'objection' | 'need' | 'competitive' | 'question' | 'feedback';
}

interface BatchResult {
  results: {
    [callId: string]: {
      findings: Finding[];
    };
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, calls }: { question: string; calls: CallPayload[] } = body;

    if (!question || !calls || calls.length === 0) {
      return new Response(JSON.stringify({ error: 'question and calls required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build the all-speakers header
    const allExternalSpeakers = calls.flatMap(c =>
      c.speakerDirectory
        .filter(s => !s.isInternal)
        .map(s => ({
          callId: c.callId,
          callTitle: c.callMeta.title,
          name: s.name,
          jobTitle: s.jobTitle,
          company: s.company,
        }))
    );

    const speakersHeader =
      allExternalSpeakers.length > 0
        ? `External speakers across all calls:\n${allExternalSpeakers
            .map(
              s =>
                `- ${s.name}${s.jobTitle ? `, ${s.jobTitle}` : ''}${s.company ? ` at ${s.company}` : ''} (Call: ${s.callTitle})`
            )
            .join('\n')}\n\n`
        : '';

    // Build per-call sections
    const callSections = calls
      .map(c => {
        const header = `=== CALL ${c.callId}: ${c.callMeta.title} | ${c.callMeta.date} ===`;
        return `${header}\n${c.callData}`;
      })
      .join('\n\n');

    const prompt = `Research question: "${question}"

${speakersHeader}${callSections}

For each call above, extract findings relevant to the research question from EXTERNAL speakers only (prospects, customers, partners — not internal team members or sales reps).

Return a JSON object keyed by callId. Each call's findings array must contain only verbatim quotes from external speakers.

Schema:
{
  "results": {
    "CALL_ID": {
      "findings": [{
        "exact_quote": "",
        "speaker_name": "",
        "job_title": "",
        "company": "",
        "is_external": true,
        "timestamp": "",
        "context": "",
        "significance": "high|medium|low",
        "finding_type": "objection|need|competitive|question|feedback"
      }]
    }
  }
}

If a call has no relevant external speaker findings, return an empty findings array for that callId. Include every callId from the input.`;

    const result = await smartCompleteJSON<BatchResult>(prompt, {
      temperature: 0.3,
      maxTokens: 16384,
      systemPrompt:
        'You are an expert sales call analyst. For each call below, extract verbatim quotes EXCLUSIVELY from external/prospect speakers. Never quote internal team members or sales reps. Each finding must include the exact verbatim quote, full speaker attribution, timestamp, context, significance level, and finding type.',
    });

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Batch-run route error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Batch analysis failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
