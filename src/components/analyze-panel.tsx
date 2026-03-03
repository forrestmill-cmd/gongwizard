'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2,
  Search,
  Sparkles,
  Send,
  Download,
} from 'lucide-react';
import { isInternalParty } from '@/lib/format-utils';
import { buildUtterances, alignTrackersToUtterances, extractTrackerOccurrences } from '@/lib/tracker-alignment';
import { performSurgery, formatExcerptsForAnalysis } from '@/lib/transcript-surgery';

// ─── Inline token utilities (safe for client components) ────────────────────

const TOKEN_BUDGET = 250_000;
const MAX_QUESTIONS = 5;

function estimateInputTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface ScoredCall {
  callId: string;
  score: number;
  reason: string;
  relevantSections: string[];
  selected: boolean;
}

interface QuoteAttribution {
  quote: string;
  speaker_name: string;
  job_title: string;
  company: string;
  call_title: string;
  call_date: string;
}

interface Finding {
  exact_quote: string;
  speaker_name: string;
  job_title: string;
  company: string;
  is_external: boolean;
  timestamp: string;
  context: string;
  significance: string;
  finding_type: string;
}

interface CallFindings {
  callId: string;
  callTitle: string;
  callDate: string;
  account: string;
  findings: Finding[];
}

interface QAEntry {
  question: string;
  answer: string;
  quotes: QuoteAttribution[];
}

type Stage = 'idle' | 'scoring' | 'scored' | 'analyzing' | 'results';

// ─── Props ──────────────────────────────────────────────────────────────────

interface AnalyzePanelProps {
  selectedCalls: any[];
  session: any;
  allCalls: any[];
}

// ─── Export helpers ─────────────────────────────────────────────────────────

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Template shortcuts ─────────────────────────────────────────────────────

const QUESTION_TEMPLATES = [
  { label: 'Objections', q: 'What objections are customers raising?' },
  { label: 'Needs', q: 'What unmet needs are customers expressing?' },
  { label: 'Competitive', q: 'What are customers saying about competitors?' },
  { label: 'Feedback', q: 'What product feedback are customers giving?' },
  { label: 'Questions', q: 'What questions are customers asking most?' },
];

// ─── Quote card ─────────────────────────────────────────────────────────────

function QuoteCard({ q }: { q: QuoteAttribution }) {
  const attribution = [
    q.speaker_name,
    [q.job_title, q.company].filter(Boolean).join(' at '),
  ]
    .filter(Boolean)
    .join(', ');

  const source = [q.call_title, q.call_date].filter(Boolean).join(' · ');

  return (
    <div className="border-l-2 border-primary/30 pl-3 py-1 space-y-0.5">
      <p className="text-xs italic text-foreground">&ldquo;{q.quote}&rdquo;</p>
      {attribution && (
        <p className="text-[10px] text-muted-foreground font-medium">{attribution}</p>
      )}
      {source && (
        <p className="text-[10px] text-muted-foreground">{source}</p>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AnalyzePanel({ selectedCalls, session, allCalls }: AnalyzePanelProps) {
  const [question, setQuestion] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState('');

  // Scoring state
  const [scoredCalls, setScoredCalls] = useState<ScoredCall[]>([]);

  // Analysis state
  const [callFindings, setCallFindings] = useState<CallFindings[]>([]);
  const [conversation, setConversation] = useState<QAEntry[]>([]);
  const [analysisProgress, setAnalysisProgress] = useState('');

  // Follow-up state
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [processedDataCache, setProcessedDataCache] = useState('');

  // Token tracking
  const [tokensUsed, setTokensUsed] = useState(0);

  // ─── Score calls ────────────────────────────────────────────────────────

  const handleScore = useCallback(async () => {
    if (!question.trim() || selectedCalls.length === 0) return;
    setStage('scoring');
    setError('');

    try {
      const res = await fetch('/api/analyze/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          calls: selectedCalls.map(c => ({
            id: c.id,
            title: c.title,
            brief: c.brief,
            keyPoints: c.keyPoints,
            outline: c.outline,
            trackers: c.trackers,
            topics: c.topics,
            talkRatio: c.talkRatio,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scoring failed');

      const scored = (data.scores || [])
        .sort((a: any, b: any) => b.score - a.score)
        .map((s: any) => ({ ...s, selected: s.score >= 3 }));

      setScoredCalls(scored);
      setStage('scored');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setStage('idle');
    }
  }, [question, selectedCalls]);

  // ─── Full analysis pipeline ─────────────────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    const activeCalls = scoredCalls.filter(sc => sc.selected);
    if (activeCalls.length === 0) return;

    setStage('analyzing');
    setError('');
    setCallFindings([]);
    setConversation([]);
    setFollowUpInput('');
    setProcessedDataCache('');
    let totalTokens = 0;

    try {
      // Step 1: Fetch transcripts for selected calls
      setAnalysisProgress('Fetching transcripts...');
      const callIds = activeCalls.map(sc => sc.callId);
      const transcriptRes = await fetch('/api/gong/transcripts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gong-Auth': session.authHeader,
        },
        body: JSON.stringify({ callIds, baseUrl: session.baseUrl }),
      });
      const transcriptData = await transcriptRes.json();
      if (!transcriptRes.ok) throw new Error(transcriptData.error || 'Failed to fetch transcripts');

      const transcriptMap = new Map<string, any[]>();
      for (const t of transcriptData.transcripts || []) {
        transcriptMap.set(t.callId, t.transcript);
      }

      const callMap = new Map(allCalls.map(c => [c.id, c]));
      const internalDomains: string[] = session.internalDomains || [];
      const allProcessedData: string[] = [];
      const callPayloads: Array<{
        callId: string;
        callData: string;
        speakerDirectory: Array<{ speakerId: string; name: string; jobTitle: string; company: string; isInternal: boolean }>;
        callMeta: { title: string; date: string };
      }> = [];

      // Step 2: For each call — surgery + smart truncation, accumulate payloads
      for (let i = 0; i < activeCalls.length; i++) {
        const sc = activeCalls[i];
        const call = callMap.get(sc.callId);
        if (!call) continue;

        setAnalysisProgress('Processing transcripts...');

        const monologues = transcriptMap.get(sc.callId) || [];
        const parties = call.parties || [];
        const callDate = call.started?.split('T')[0] || '';
        const callTitle = call.title || sc.callId;

        // Build speaker classifier
        const speakerInternalMap = new Map<string, boolean>();
        for (const p of parties) {
          const id = p.speakerId || p.userId || p.id;
          if (id) speakerInternalMap.set(id, isInternalParty(p, internalDomains));
        }
        const speakerClassifier = (speakerId: string) => speakerInternalMap.get(speakerId) ?? true;

        // Build speaker map for name/title resolution in transcript surgery
        const speakerMap: Record<string, { name: string; title: string }> = {};
        for (const p of parties) {
          const id = p.speakerId || p.userId || p.id;
          if (id && p.name) {
            speakerMap[id] = { name: p.name, title: p.title || p.jobTitle || '' };
          }
        }

        // Build speaker directory for attribution (passed to run route)
        const isExternal = (p: any) => !isInternalParty(p, internalDomains);
        const speakerDirectory = parties
          .map((p: any) => {
            const affiliation = p.affiliation || p.company || '';
            // Gong often leaves affiliation empty or as "External" for prospects.
            // Fall back to the call's account name for external speakers.
            const company =
              affiliation && affiliation.toLowerCase() !== 'external'
                ? affiliation
                : isExternal(p)
                ? call.accountName || affiliation
                : affiliation;
            return {
              speakerId: p.speakerId || p.userId || p.id,
              name: p.name || '',
              jobTitle: p.title || p.jobTitle || '',
              company,
              isInternal: isInternalParty(p, internalDomains),
            };
          })
          .filter((s: any) => s.speakerId && s.name);

        // Build utterances + align trackers
        const utterances = buildUtterances(monologues, speakerClassifier);
        const trackerOccs = extractTrackerOccurrences(call.trackers || []);
        alignTrackersToUtterances(utterances, trackerOccs);

        // Perform surgery
        const surgery = performSurgery(
          sc.callId,
          utterances,
          call.outline || [],
          sc.relevantSections,
          (call.duration || 0) * 1000,
          speakerMap
        );

        // Smart truncation for long internal monologues
        if (surgery.longInternalMonologues.length > 0) {
          try {
            const processRes = await fetch('/api/analyze/process', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                question,
                monologues: surgery.longInternalMonologues,
              }),
            });
            const processData = await processRes.json();
            if (processRes.ok && processData.truncated) {
              for (const t of processData.truncated) {
                if (surgery.excerpts[t.index]) {
                  surgery.excerpts[t.index].text = t.kept;
                  surgery.excerpts[t.index].needsSmartTruncation = false;
                }
              }
            }
          } catch {
            // Non-fatal: proceed with untruncated monologues
          }
        }

        // Format for analysis
        const trackerNames = [...new Set(utterances.flatMap(u => u.trackers))];
        const callDataStr = formatExcerptsForAnalysis(
          surgery.excerpts,
          callTitle,
          callDate,
          call.accountName || '',
          call.talkRatio != null ? Math.round(call.talkRatio * 100) : 0,
          trackerNames,
          surgery.sectionsUsed,
          call.keyPoints || []
        );

        // Prepend speaker directory to processed data for follow-up context
        const externalSpeakers = speakerDirectory.filter((s: any) => !s.isInternal);
        const speakerHeader =
          externalSpeakers.length > 0
            ? `External speakers:\n${externalSpeakers
                .map(
                  (s: any) =>
                    `- ${s.name}${s.jobTitle ? `, ${s.jobTitle}` : ''}${s.company ? ` at ${s.company}` : ''}`
                )
                .join('\n')}\n\n`
            : '';

        const enrichedCallData = `${speakerHeader}${callDataStr}`;
        allProcessedData.push(enrichedCallData);
        totalTokens += estimateInputTokens(enrichedCallData);

        // Budget check
        if (totalTokens > TOKEN_BUDGET) {
          setError(
            `Token budget exceeded (${totalTokens.toLocaleString()} / ${TOKEN_BUDGET.toLocaleString()}). Analysis stopped.`
          );
          break;
        }

        callPayloads.push({
          callId: sc.callId,
          callData: enrichedCallData,
          speakerDirectory,
          callMeta: { title: callTitle, date: callDate },
        });
      }

      // Step 2b: Single batch request for all calls
      setAnalysisProgress(`Analyzing ${callPayloads.length} calls...`);
      const batchRes = await fetch('/api/analyze/batch-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, calls: callPayloads }),
      });
      const batchData = await batchRes.json();
      if (!batchRes.ok) throw new Error(batchData.error || 'Batch analysis failed');

      const allCallFindings: CallFindings[] = callPayloads.map(cp => ({
        callId: cp.callId,
        callTitle: cp.callMeta.title,
        callDate: cp.callMeta.date,
        account: callMap.get(cp.callId)?.accountName || '',
        findings: batchData.results?.[cp.callId]?.findings || [],
      }));

      setCallFindings(allCallFindings);
      setProcessedDataCache(allProcessedData.join('\n\n---\n\n'));

      // Step 3: Synthesize into a direct answer with sourced quotes
      if (allCallFindings.some(cf => cf.findings.some(f => f.is_external))) {
        setAnalysisProgress('Synthesizing answer...');
        const synthRes = await fetch('/api/analyze/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question,
            allFindings: allCallFindings,
          }),
        });
        const synthData = await synthRes.json();
        if (!synthRes.ok) throw new Error(synthData.error || 'Synthesis failed');

        const firstEntry: QAEntry = {
          question,
          answer: synthData.answer || 'No answer generated.',
          quotes: synthData.quotes || [],
        };
        setConversation([firstEntry]);
      } else {
        setConversation([
          {
            question,
            answer: 'No relevant statements from external speakers were found in the analyzed calls.',
            quotes: [],
          },
        ]);
      }

      setTokensUsed(totalTokens);
      setStage('results');
      setAnalysisProgress('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setStage('scored');
      setAnalysisProgress('');
    }
  }, [scoredCalls, session, allCalls, question]);

  // ─── Follow-up questions ────────────────────────────────────────────────

  const handleFollowUp = useCallback(async () => {
    if (!followUpInput.trim() || conversation.length >= MAX_QUESTIONS || !processedDataCache) return;
    setFollowUpLoading(true);

    try {
      const res = await fetch('/api/analyze/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          followUpQuestion: followUpInput,
          processedData: processedDataCache,
          previousFindings: callFindings,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const newEntry: QAEntry = {
        question: followUpInput,
        answer: data.answer || 'No answer generated.',
        quotes: data.quotes || [],
      };
      setConversation(prev => [...prev, newEntry]);
      setFollowUpInput('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setFollowUpLoading(false);
    }
  }, [followUpInput, conversation, processedDataCache, question, callFindings]);

  // ─── Export ─────────────────────────────────────────────────────────────

  const handleExportJSON = () => {
    const exportDate = new Date().toISOString().split('T')[0];
    const payload = { exportDate, conversation };
    downloadBlob(
      JSON.stringify(payload, null, 2),
      `gongwizard-analysis-${exportDate}.json`,
      'application/json'
    );
  };

  const handleExportCSV = () => {
    const headers = ['Question', 'Quote', 'Speaker', 'Job Title', 'Company', 'Call', 'Date'];
    const rows = conversation.flatMap(entry =>
      entry.quotes.map(q => [
        escapeCSV(entry.question),
        escapeCSV(q.quote),
        escapeCSV(q.speaker_name),
        escapeCSV(q.job_title),
        escapeCSV(q.company),
        escapeCSV(q.call_title),
        escapeCSV(q.call_date),
      ])
    );
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const exportDate = new Date().toISOString().split('T')[0];
    downloadBlob(csv, `gongwizard-analysis-${exportDate}.csv`, 'text/csv');
  };

  // ─── Reset ──────────────────────────────────────────────────────────────

  const handleReset = () => {
    setStage('idle');
    setQuestion('');
    setScoredCalls([]);
    setCallFindings([]);
    setConversation([]);
    setFollowUpInput('');
    setProcessedDataCache('');
    setTokensUsed(0);
    setError('');
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (selectedCalls.length === 0) {
    return (
      <div className="space-y-3 py-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          How it works
        </p>
        <ol className="space-y-2.5 text-xs text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary font-bold shrink-0">1.</span>
            Set a date range and load your calls
          </li>
          <li className="flex gap-2">
            <span className="text-primary font-bold shrink-0">2.</span>
            Filter or select the calls you care about
          </li>
          <li className="flex gap-2">
            <span className="text-primary font-bold shrink-0">3.</span>
            Ask a question — get sourced answers with exact quotes
          </li>
        </ol>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm">
          {selectedCalls.length} {selectedCalls.length === 1 ? 'call' : 'calls'} selected
        </p>
        {stage !== 'idle' && (
          <Button variant="ghost" size="xs" onClick={handleReset} className="text-xs h-6">
            Start Over
          </Button>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-md bg-destructive/10 text-destructive px-3 py-2 text-xs">
          {error}
        </div>
      )}

      {/* Stage: Question input */}
      {(stage === 'idle' || stage === 'scoring') && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Your Question
            </Label>
            <Input
              placeholder="What objections are customers raising about pricing?"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              className="text-sm"
              onKeyDown={e => e.key === 'Enter' && handleScore()}
            />
          </div>

          <div className="flex flex-wrap gap-1">
            {QUESTION_TEMPLATES.map(t => (
              <Button
                key={t.label}
                variant="outline"
                size="xs"
                className="text-xs h-6"
                onClick={() => setQuestion(t.q)}
              >
                {t.label}
              </Button>
            ))}
          </div>

          <Button
            className="w-full"
            size="sm"
            onClick={handleScore}
            disabled={!question.trim() || stage === 'scoring'}
          >
            {stage === 'scoring' ? (
              <><Loader2 className="size-3.5 animate-spin" /> Scoring calls…</>
            ) : (
              <><Search className="size-3.5" /> Find Relevant Calls</>
            )}
          </Button>
        </div>
      )}

      {/* Stage: Scored — show ranked list */}
      {stage === 'scored' && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Relevance Scores
            </Label>
            <p className="text-xs text-muted-foreground">
              Deselect low-scoring calls before analyzing
            </p>
          </div>

          <ScrollArea className="max-h-[300px]">
            <div className="space-y-1.5">
              {scoredCalls.map(sc => {
                const call = allCalls.find(c => c.id === sc.callId);
                return (
                  <div
                    key={sc.callId}
                    className="flex items-start gap-2 p-2 rounded-md border bg-background"
                  >
                    <Checkbox
                      checked={sc.selected}
                      onCheckedChange={() => {
                        setScoredCalls(prev =>
                          prev.map(s =>
                            s.callId === sc.callId ? { ...s, selected: !s.selected } : s
                          )
                        );
                      }}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={sc.score >= 7 ? 'default' : sc.score >= 4 ? 'secondary' : 'outline'}
                          className="text-xs px-1.5 py-0 shrink-0"
                        >
                          {sc.score}/10
                        </Badge>
                        <span className="text-xs font-medium truncate">
                          {call?.title || sc.callId}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                        {sc.reason}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {scoredCalls.filter(s => s.selected).length} of {scoredCalls.length} calls selected
            </span>
          </div>

          <Button
            className="w-full"
            size="sm"
            onClick={handleAnalyze}
            disabled={scoredCalls.filter(s => s.selected).length === 0}
          >
            <Sparkles className="size-3.5" />
            Analyze {scoredCalls.filter(s => s.selected).length} Calls
          </Button>
        </div>
      )}

      {/* Stage: Analyzing */}
      {stage === 'analyzing' && (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground text-center">{analysisProgress}</p>
        </div>
      )}

      {/* Stage: Results — chat-style Q&A */}
      {stage === 'results' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {conversation.length} of {MAX_QUESTIONS} questions used
            </p>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={handleExportJSON} className="h-7 text-xs px-2">
                <Download className="h-3 w-3 mr-1" /> JSON
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCSV} className="h-7 text-xs px-2">
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </div>
          </div>

          {/* Conversation */}
          <div className="space-y-5">
            {conversation.map((entry, i) => (
              <div key={i} className="space-y-2">
                {/* Question */}
                <div className="flex gap-2">
                  <span className="text-[10px] font-bold text-primary shrink-0 mt-0.5">
                    Q{i + 1}
                  </span>
                  <p className="text-xs font-semibold leading-relaxed">{entry.question}</p>
                </div>

                {/* Answer */}
                <div className="pl-4 space-y-2">
                  <p className="text-xs text-foreground leading-relaxed">{entry.answer}</p>

                  {/* Quotes */}
                  {entry.quotes.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {entry.quotes.map((q, qi) => (
                        <QuoteCard key={qi} q={q} />
                      ))}
                    </div>
                  )}
                </div>

                {i < conversation.length - 1 && <Separator className="mt-3" />}
              </div>
            ))}
          </div>

          {/* Follow-up input */}
          {conversation.length < MAX_QUESTIONS ? (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] text-muted-foreground">
                {MAX_QUESTIONS - conversation.length} question{MAX_QUESTIONS - conversation.length !== 1 ? 's' : ''} remaining
              </p>
              <div className="flex gap-1.5">
                <Input
                  placeholder="Ask a follow-up question..."
                  value={followUpInput}
                  onChange={e => setFollowUpInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleFollowUp()}
                  className="text-xs h-8"
                  disabled={followUpLoading}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  onClick={handleFollowUp}
                  disabled={followUpLoading || !followUpInput.trim()}
                >
                  {followUpLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center pt-1">
              Maximum {MAX_QUESTIONS} questions reached. Export your results or start over.
            </p>
          )}

          {/* Token info */}
          <p className="text-[10px] text-muted-foreground text-right">
            {tokensUsed.toLocaleString()} / {TOKEN_BUDGET.toLocaleString()} tokens
          </p>
        </div>
      )}
    </div>
  );
}
