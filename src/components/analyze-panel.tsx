'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2,
  Search,
  Sparkles,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  BarChart3,
  Send,
  Download,
} from 'lucide-react';
import { isInternalParty } from '@/lib/format-utils';
import { buildUtterances, alignTrackersToUtterances, extractTrackerOccurrences } from '@/lib/tracker-alignment';
import { performSurgery, formatExcerptsForAnalysis } from '@/lib/transcript-surgery';

// ─── Inline token utilities (safe for client components) ────────────────────

const TOKEN_BUDGET = 250_000;

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

interface Finding {
  exact_quote: string;
  timestamp: string;
  context: string;
  significance: string;
  finding_type: string;
}

interface CallFindings {
  callId: string;
  callTitle: string;
  account: string;
  findings: Finding[];
}

interface Theme {
  theme: string;
  frequency: number;
  representative_quotes: string[];
  call_ids: string[];
}

interface FollowUpAnswer {
  question: string;
  answer: string;
  supporting_quotes: Array<{ quote: string; call: string; timestamp: string }>;
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

// ─── Component ──────────────────────────────────────────────────────────────

export default function AnalyzePanel({ selectedCalls, session, allCalls }: AnalyzePanelProps) {
  const [question, setQuestion] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState('');

  // Scoring state
  const [scoredCalls, setScoredCalls] = useState<ScoredCall[]>([]);

  // Analysis state
  const [callFindings, setCallFindings] = useState<CallFindings[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [overallSummary, setOverallSummary] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState('');

  // Follow-up state
  const [followUps, setFollowUps] = useState<FollowUpAnswer[]>([]);
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [processedDataCache, setProcessedDataCache] = useState('');

  // Token tracking
  const [tokensUsed, setTokensUsed] = useState(0);

  // Expanded call findings
  const [expandedCalls, setExpandedCalls] = useState<Set<string>>(new Set());

  const toggleCallExpanded = (callId: string) => {
    setExpandedCalls(prev => {
      const next = new Set(prev);
      if (next.has(callId)) next.delete(callId);
      else next.add(callId);
      return next;
    });
  };

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
    setThemes([]);
    setOverallSummary('');
    setFollowUps([]);
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
      const allCallFindings: CallFindings[] = [];

      // Step 2: For each call — surgery + smart truncation + analysis
      for (let i = 0; i < activeCalls.length; i++) {
        const sc = activeCalls[i];
        const call = callMap.get(sc.callId);
        if (!call) continue;

        setAnalysisProgress(`Analyzing call ${i + 1} of ${activeCalls.length}: ${call.title}`);

        const monologues = transcriptMap.get(sc.callId) || [];
        const parties = call.parties || [];

        // Build speaker classifier
        const speakerInternalMap = new Map<string, boolean>();
        for (const p of parties) {
          const id = p.speakerId || p.userId || p.id;
          if (id) speakerInternalMap.set(id, isInternalParty(p, internalDomains));
        }
        const speakerClassifier = (speakerId: string) => speakerInternalMap.get(speakerId) ?? true;

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
          (call.duration || 0) * 1000
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
          call.title,
          call.started?.split('T')[0] || '',
          call.accountName || '',
          call.talkRatio != null ? Math.round(call.talkRatio * 100) : 0,
          trackerNames,
          surgery.sectionsUsed,
          call.keyPoints || []
        );

        allProcessedData.push(callDataStr);
        totalTokens += estimateInputTokens(callDataStr);

        // Budget check
        if (totalTokens > TOKEN_BUDGET) {
          setError(`Token budget exceeded (${totalTokens.toLocaleString()} / ${TOKEN_BUDGET.toLocaleString()}). Analysis stopped.`);
          break;
        }

        // Run analysis
        const runRes = await fetch('/api/analyze/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, callData: callDataStr }),
        });
        const runData = await runRes.json();
        if (!runRes.ok) throw new Error(runData.error || `Analysis failed for call ${sc.callId}`);

        allCallFindings.push({
          callId: sc.callId,
          callTitle: call.title,
          account: call.accountName || '',
          findings: runData.findings || [],
        });
      }

      setCallFindings(allCallFindings);
      setProcessedDataCache(allProcessedData.join('\n\n---\n\n'));

      // Step 3: Cross-call synthesis
      if (allCallFindings.some(cf => cf.findings.length > 0)) {
        setAnalysisProgress('Synthesizing themes across calls...');
        const synthRes = await fetch('/api/analyze/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, allFindings: allCallFindings }),
        });
        const synthData = await synthRes.json();
        if (!synthRes.ok) throw new Error(synthData.error || 'Synthesis failed');
        setThemes(synthData.themes || []);
        setOverallSummary(synthData.overall_summary || '');
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
    if (!followUpInput.trim() || followUps.length >= 10 || !processedDataCache) return;
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

      setFollowUps(prev => [...prev, {
        question: followUpInput,
        answer: data.answer || 'No answer generated.',
        supporting_quotes: data.supporting_quotes || [],
      }]);
      setFollowUpInput('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setFollowUpLoading(false);
    }
  }, [followUpInput, followUps, processedDataCache, question, callFindings]);

  // ─── Export ─────────────────────────────────────────────────────────────

  const handleExportJSON = () => {
    const exportDate = new Date().toISOString().split('T')[0];
    const payload = {
      question,
      exportDate,
      summary: overallSummary,
      themes,
      callFindings,
      followUpAnswers: followUps,
    };
    downloadBlob(
      JSON.stringify(payload, null, 2),
      `gongwizard-findings-${exportDate}.json`,
      'application/json'
    );
  };

  const handleExportCSV = () => {
    const headers = ['Call Title', 'Account', 'Finding Type', 'Significance', 'Quote', 'Timestamp', 'Context'];
    const rows = callFindings.flatMap(cf =>
      cf.findings.map(f => [
        escapeCSV(cf.callTitle),
        escapeCSV(cf.account),
        escapeCSV(f.finding_type),
        escapeCSV(f.significance),
        escapeCSV(f.exact_quote),
        escapeCSV(f.timestamp),
        escapeCSV(f.context),
      ])
    );
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const exportDate = new Date().toISOString().split('T')[0];
    downloadBlob(csv, `gongwizard-findings-${exportDate}.csv`, 'text/csv');
  };

  // ─── Reset ──────────────────────────────────────────────────────────────

  const handleReset = () => {
    setStage('idle');
    setQuestion('');
    setScoredCalls([]);
    setCallFindings([]);
    setThemes([]);
    setOverallSummary('');
    setFollowUps([]);
    setFollowUpInput('');
    setProcessedDataCache('');
    setTokensUsed(0);
    setError('');
    setExpandedCalls(new Set());
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (selectedCalls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-10">
        <Sparkles className="size-8 opacity-50" />
        <p className="text-sm font-medium">Select calls to analyze</p>
        <p className="text-xs text-center">Choose calls from the list, then ask a research question</p>
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
              Research Question
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
              <><Loader2 className="size-3.5 animate-spin" /> Scoring…</>
            ) : (
              <><Search className="size-3.5" /> Score Calls</>
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
              Deselect low-scoring calls before analysis
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

      {/* Stage: Results */}
      {stage === 'results' && (
        <div className="space-y-4">
          {/* Token usage */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Tokens used: {tokensUsed.toLocaleString()} / {TOKEN_BUDGET.toLocaleString()}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportJSON}>
                <Download className="h-3.5 w-3.5 mr-1" /> JSON
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="h-3.5 w-3.5 mr-1" /> CSV
              </Button>
            </div>
          </div>

          {/* Overall summary */}
          {overallSummary && (
            <Card>
              <CardContent className="p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-1">Summary</p>
                <p className="text-sm">{overallSummary}</p>
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Results tabs */}
          <Tabs defaultValue="themes">
            <TabsList className="w-full h-8">
              <TabsTrigger value="themes" className="flex-1 text-xs gap-1">
                <BarChart3 className="size-3" />
                Themes
              </TabsTrigger>
              <TabsTrigger value="calls" className="flex-1 text-xs gap-1">
                <MessageSquare className="size-3" />
                By Call
              </TabsTrigger>
            </TabsList>

            {/* Themes tab */}
            <TabsContent value="themes" className="mt-3">
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-3">
                  {themes.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No cross-call themes identified
                    </p>
                  )}
                  {themes.map((theme, i) => (
                    <Card key={i}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold flex-1">{theme.theme}</p>
                          <Badge variant="secondary" className="text-xs">
                            {theme.frequency} calls
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          {theme.representative_quotes.map((q, qi) => (
                            <p key={qi} className="text-xs text-muted-foreground italic">
                              &ldquo;{q}&rdquo;
                            </p>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* By Call tab */}
            <TabsContent value="calls" className="mt-3">
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-2">
                  {callFindings.map(cf => (
                    <div key={cf.callId} className="border rounded-md">
                      <button
                        className="w-full flex items-center gap-2 p-2 text-left hover:bg-muted/50"
                        onClick={() => toggleCallExpanded(cf.callId)}
                      >
                        {expandedCalls.has(cf.callId) ? (
                          <ChevronDown className="size-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="size-3.5 shrink-0" />
                        )}
                        <span className="text-xs font-medium flex-1 truncate">{cf.callTitle}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {cf.findings.length} findings
                        </Badge>
                      </button>
                      {expandedCalls.has(cf.callId) && (
                        <div className="px-3 pb-3 space-y-2">
                          {cf.findings.length === 0 && (
                            <p className="text-xs text-muted-foreground">No findings</p>
                          )}
                          {cf.findings.map((f, fi) => (
                            <div key={fi} className="space-y-1 pl-2 border-l-2 border-primary/20">
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant={f.significance === 'high' ? 'default' : 'secondary'}
                                  className="text-[10px] px-1 py-0"
                                >
                                  {f.significance}
                                </Badge>
                                <Badge variant="outline" className="text-[10px] px-1 py-0">
                                  {f.finding_type}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">{f.timestamp}</span>
                              </div>
                              <p className="text-xs italic">&ldquo;{f.exact_quote}&rdquo;</p>
                              {f.context && (
                                <p className="text-[10px] text-muted-foreground">{f.context}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>

          <Separator />

          {/* Follow-up questions */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Follow-Up Questions ({followUps.length}/10)
            </Label>

            {followUps.map((fu, i) => (
              <Card key={i}>
                <CardContent className="p-2 space-y-1">
                  <p className="text-xs font-medium">{fu.question}</p>
                  <p className="text-xs text-muted-foreground">{fu.answer}</p>
                  {fu.supporting_quotes.length > 0 && (
                    <div className="space-y-0.5 mt-1">
                      {fu.supporting_quotes.slice(0, 3).map((sq, qi) => (
                        <p key={qi} className="text-[10px] italic text-muted-foreground">
                          &ldquo;{sq.quote}&rdquo; — {sq.call}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {followUps.length < 10 && (
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}
