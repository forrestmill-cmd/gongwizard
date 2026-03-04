'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AnalyzePanel from '@/components/analyze-panel';
import { Slider } from '@/components/ui/slider';
import {
  Loader2,
  Download,
  Copy,
  Archive,
  LogOut,
  Search,
  CheckSquare,
  Square,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, subDays } from 'date-fns';
import { contextLabel, contextColor } from '@/lib/token-utils';
import { formatDuration, isInternalParty, truncateToFirstSentence } from '@/lib/format-utils';
import {
  matchesTextSearch,
  matchesTrackers,
  matchesTopics,
  matchesDurationRange,
  matchesTalkRatioRange,
  matchesParticipantName,
  matchesMinExternalSpeakers,
  matchesAiContentSearch,
  computeTrackerCounts,
  computeTopicCounts,
} from '@/lib/filters';
import { type ExportOptions } from '@/lib/transcript-formatter';
import { useCallExport } from '@/hooks/useCallExport';
import { useFilterState } from '@/hooks/useFilterState';
import { getSession } from '@/lib/session';
import { GongCall } from '@/types/gong';

const WORDS_PER_CALL_MINUTE = 130;
const WORDS_TO_TOKENS_RATIO = 1.3;

const FORMAT_OPTIONS = [
  { value: 'markdown',      label: 'Markdown',      desc: 'Upload to ChatGPT or Claude' },
  { value: 'xml',           label: 'XML',           desc: 'Structured format for Claude API' },
  { value: 'jsonl',         label: 'JSONL',         desc: 'One object per call, structured' },
  { value: 'csv',           label: 'CSV Summary',   desc: '1 row per call · Excel / BI tools' },
  { value: 'utterance-csv', label: 'Utterance CSV', desc: '1 row per turn · Clay / Zapier' },
] as const;

interface TranscriptMatch {
  callId: string;
  speakerId: string;
  timestamp: string;
  text: string;
  context: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function highlightKeyword(text: string, keyword: string): React.ReactNode[] {
  if (!keyword) return [text];
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === keyword.toLowerCase()
      ? <strong key={i} className="font-semibold text-foreground">{part}</strong>
      : part
  );
}

// ─── CallCard ────────────────────────────────────────────────────────────────

function CallCard({
  call,
  isSelected,
  onToggle,
  transcriptSearchActive,
  matchSnippets,
  speakerFilter,
  transcriptKeyword,
  getMatchAffiliation,
  activeTrackers,
  activeTopics,
}: {
  call: GongCall;
  isSelected: boolean;
  onToggle: (id: string) => void;
  transcriptSearchActive: boolean;
  matchSnippets: TranscriptMatch[];
  speakerFilter: 'all' | 'external' | 'internal';
  transcriptKeyword: string;
  getMatchAffiliation: (speakerId: string, call: GongCall) => 'internal' | 'external';
  activeTrackers: Set<string>;
  activeTopics: Set<string>;
}) {
  const callDate = call.started ? format(new Date(call.started), 'MMM d, yyyy') : '';
  return (
    <Card
      onClick={() => onToggle(call.id)}
      className={`cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'ring-2 ring-primary shadow-sm' : ''
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggle(call.id)}
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 shrink-0"
          />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-sm leading-tight">{call.title}</p>
              <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                {callDate}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span>{formatDuration(call.duration)}</span>
              <span>
                {call.internalSpeakerCount} internal, {call.externalSpeakerCount} external
              </span>
              {call.accountName && <span>{call.accountName}</span>}
            </div>

            {(() => {
              const hasTrackerFilter = activeTrackers.size > 0;
              const hasTopicFilter = activeTopics.size > 0;
              if (!hasTrackerFilter && !hasTopicFilter) {
                const parts: string[] = [];
                if (call.trackers?.length) parts.push(`${call.trackers.length} tracker${call.trackers.length !== 1 ? 's' : ''}`);
                if (call.topics?.length) parts.push(`${call.topics.length} topic${call.topics.length !== 1 ? 's' : ''}`);
                if (!parts.length) return null;
                return <span className="text-[10px] text-muted-foreground">{parts.join(' · ')}</span>;
              }
              const matchingTrackers = (call.trackers || []).filter(t => activeTrackers.has(t));
              const matchingTopics = (call.topics || []).filter(t => activeTopics.has(t));
              if (!matchingTrackers.length && !matchingTopics.length) return null;
              return (
                <div className="flex flex-wrap gap-1">
                  {matchingTopics.map(topic => (
                    <Badge key={topic} variant="secondary" className="text-xs px-1.5 py-0">{topic}</Badge>
                  ))}
                  {matchingTrackers.map(tracker => (
                    <Badge key={tracker} variant="outline" className="text-xs px-1.5 py-0 border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300">{tracker}</Badge>
                  ))}
                </div>
              );
            })()}

            {call.brief && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {truncateToFirstSentence(call.brief)}
              </p>
            )}

            {call.talkRatio !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16 shrink-0">
                  Talk ratio
                </span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.min(100, (call.talkRatio || 0) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right">
                  {Math.round((call.talkRatio || 0) * 100)}%
                </span>
              </div>
            )}

            {transcriptSearchActive && (() => {
              const visible =
                speakerFilter === 'all'
                  ? matchSnippets
                  : matchSnippets.filter(
                      (m) => getMatchAffiliation(m.speakerId, call) === speakerFilter
                    );
              if (!visible.length) return null;
              return (
                <div className="mt-2 pt-2 border-t space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium">
                    {visible.length} match{visible.length !== 1 ? 'es' : ''}
                  </p>
                  {visible.slice(0, 3).map((m, i) => {
                    const affiliation = getMatchAffiliation(m.speakerId, call);
                    return (
                      <div key={i} className="text-xs text-muted-foreground leading-relaxed">
                        <span className="font-mono text-[10px] mr-1">[{m.timestamp}]</span>
                        <span className="mr-1 opacity-60">
                          {affiliation === 'external' ? 'Customer' : 'Rep'}
                        </span>
                        {highlightKeyword(m.text, transcriptKeyword)}
                      </div>
                    );
                  })}
                  {visible.length > 3 && (
                    <p className="text-xs text-muted-foreground">+{visible.length - 3} more</p>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function CallsPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);

  const today = new Date();
  const [fromDate, setFromDate] = useState(format(subDays(today, 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(today, 'yyyy-MM-dd'));

  const [calls, setCalls] = useState<GongCall[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const [rightPanelTab, setRightPanelTab] = useState<'export' | 'analyze'>('analyze');

  const [exportFormat, setExportFormat] = useState<'markdown' | 'xml' | 'jsonl' | 'csv' | 'utterance-csv'>('markdown');
  const [exportOpts, setExportOpts] = useState<ExportOptions>({
    condenseMonologues: true,
    includeMetadata: true,
    includeAIBrief: true,
    includeInteractionStats: true,
  });

  const filters = useFilterState();

  const [transcriptKeyword, setTranscriptKeyword] = useState('');
  const [isSearchingTranscripts, setIsSearchingTranscripts] = useState(false);
  const [transcriptSearchActive, setTranscriptSearchActive] = useState(false);
  const [searchProgress, setSearchProgress] = useState({ searched: 0, total: 0, matchCount: 0 });
  const [searchMatches, setSearchMatches] = useState<Map<string, TranscriptMatch[]>>(new Map());
  const [speakerFilter, setSpeakerFilter] = useState<'all' | 'external' | 'internal'>('all');

  const { exporting, copied, handleExport, handleCopy, handleZipExport } = useCallExport({
    selectedIds,
    session,
    calls,
    exportFormat,
    exportOpts,
  });

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/');
      return;
    }
    setSession(s);
  }, [router]);

  useEffect(() => {
    if (transcriptSearchActive || isSearchingTranscripts) {
      setTranscriptSearchActive(false);
      setIsSearchingTranscripts(false);
      setSearchMatches(new Map());
    }
  // calls in deps: reset search state when the call list changes (e.g., after reload)
  }, [
    filters.searchText,
    filters.activeTrackers,
    filters.activeTopics,
    filters.excludeInternal,
    filters.durationRange,
    filters.talkRatioRange,
    filters.participantSearch,
    filters.minExternalSpeakers,
    filters.aiContentSearch,
    calls,
  ]);

  const allTrackers: string[] = useMemo(() => {
    if (!session?.trackers) return [];
    return session.trackers.map((t: any) => t.name || t.id || String(t));
  }, [session]);

  const allTopics = useMemo(() => {
    const topicSet = new Set<string>();
    for (const call of calls) {
      for (const t of call.topics || []) topicSet.add(t);
    }
    return [...topicSet].sort();
  }, [calls]);

  const trackerCounts = useMemo(
    () => computeTrackerCounts(calls, allTrackers),
    [calls, allTrackers]
  );

  const topicCounts = useMemo(() => computeTopicCounts(calls), [calls]);

  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      if (filters.excludeInternal && call.externalSpeakerCount === 0) return false;
      if (!matchesTextSearch(call, filters.searchText)) return false;
      if (!matchesTrackers(call, filters.activeTrackers)) return false;
      if (!matchesTopics(call, filters.activeTopics)) return false;
      if (!matchesDurationRange(call, filters.durationRange[0], filters.durationRange[1])) return false;
      if (!matchesTalkRatioRange(call, filters.talkRatioRange[0], filters.talkRatioRange[1])) return false;
      if (!matchesParticipantName(call, filters.participantSearch)) return false;
      if (!matchesMinExternalSpeakers(call, filters.minExternalSpeakers)) return false;
      if (!matchesAiContentSearch(call, filters.aiContentSearch)) return false;
      if (transcriptSearchActive) {
        const matches = searchMatches.get(call.id) || [];
        if (matches.length === 0) return false;
        if (speakerFilter !== 'all') {
          const hasVisible = matches.some(
            (m) => getMatchAffiliation(m.speakerId, call) === speakerFilter
          );
          if (!hasVisible) return false;
        }
      }
      return true;
    });
  }, [
    calls,
    filters.excludeInternal,
    filters.searchText,
    filters.activeTrackers,
    filters.activeTopics,
    filters.durationRange,
    filters.talkRatioRange,
    filters.participantSearch,
    filters.minExternalSpeakers,
    filters.aiContentSearch,
    transcriptSearchActive,
    searchMatches,
    speakerFilter,
    session,
  ]);

  const selectedCalls = useMemo(
    () => calls.filter((c) => selectedIds.has(c.id)),
    [calls, selectedIds]
  );

  const loadCalls = useCallback(async () => {
    if (!session) return;
    if (loading) return;
    setLoading(true);
    setLoadError('');
    setCalls([]);
    setSelectedIds(new Set());
    setHasLoaded(false);

    try {
      const res = await fetch('/api/gong/calls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gong-Auth': session.authHeader,
        },
        body: JSON.stringify({
          fromDate: `${fromDate}T00:00:00Z`,
          toDate: `${toDate}T23:59:59Z`,
          baseUrl: session.baseUrl,
          ...(workspaceId ? { workspaceId } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || 'Failed to load calls.');
        setLoading(false);
        return;
      }

      const internalDomains: string[] = session.internalDomains || [];

      const processed: GongCall[] = (data.calls || []).map((call: any) => {
        const parties: any[] = call.parties || [];
        let internalCount = 0;
        let externalCount = 0;
        for (const p of parties) {
          const internal = isInternalParty(p, internalDomains);
          if (internal) internalCount++;
          else externalCount++;
        }

        const trackerSet = new Set<string>();
        for (const t of call.trackers || []) {
          if (t.count != null && t.count <= 0) continue;
          const name = t.name || t.trackerName || t.id;
          if (name) trackerSet.add(name);
        }
        const trackerNames = [...trackerSet];

        return {
          id: call.id,
          title: call.title || 'Untitled Call',
          started: call.started,
          duration: call.duration || 0,
          accountName: call.metaData?.accountName || call.accountName || '',
          topics: call.topics || [],
          trackers: trackerNames,
          brief: call.brief || call.highlights?.brief || '',
          parties,
          interactionStats: call.interactionStats,
          internalSpeakerCount: internalCount,
          externalSpeakerCount: externalCount,
          talkRatio: call.interactionStats?.talkRatio ?? undefined,
          keyPoints: call.keyPoints || [],
          actionItems: call.actionItems || [],
          outline: call.outline || [],
          questions: call.questions || [],
          url: call.url,
        };
      });

      setCalls(processed);
      setHasLoaded(true);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Network error loading calls.');
    } finally {
      setLoading(false);
    }
  }, [session, fromDate, toDate, workspaceId, loading]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(filteredCalls.map((c) => c.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  function getMatchAffiliation(speakerId: string, call: GongCall): 'internal' | 'external' {
    const domains: string[] = session?.internalDomains || [];
    const party = (call.parties || []).find(
      (p: any) => (p.speakerId || p.userId || p.id) === speakerId
    );
    return party && isInternalParty(party, domains) ? 'internal' : 'external';
  }

  async function runTranscriptSearch() {
    if (!session || !transcriptKeyword.trim()) return;
    const ids = filteredCalls.map((c) => c.id).slice(0, 500); // Cap at 500 to stay within transcript batch limits and keep search latency reasonable

    setIsSearchingTranscripts(true);
    setSearchMatches(new Map());
    setTranscriptSearchActive(false);
    setSearchProgress({ searched: 0, total: ids.length, matchCount: 0 });

    let res: Response;
    try {
      res = await fetch('/api/gong/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gong-Auth': session.authHeader,
        },
        body: JSON.stringify({
          callIds: ids,
          keyword: transcriptKeyword.trim(),
          baseUrl: session.baseUrl,
        }),
      });
    } catch {
      setIsSearchingTranscripts(false);
      return;
    }

    if (!res.ok || !res.body) {
      setIsSearchingTranscripts(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let event: { type: string; [key: string]: unknown };
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.type === 'progress') {
            setSearchProgress({
              searched: event.searched as number,
              total: event.total as number,
              matchCount: event.matchCount as number,
            });
          } else if (event.type === 'match') {
            setSearchMatches((prev) => {
              const next = new Map(prev);
              next.set(event.callId as string, [...(next.get(event.callId as string) || []), event as unknown as TranscriptMatch]);
              return next;
            });
          } else if (event.type === 'done') {
            setTranscriptSearchActive(true);
            setIsSearchingTranscripts(false);
          }
        }
      }
    } finally {
      setIsSearchingTranscripts(false);
    }
  }

  function disconnect() {
    sessionStorage.removeItem('gongwizard_session');
    router.replace('/');
  }

  const tokenEstimate = useMemo(() => {
    return selectedCalls.reduce((sum, c) => {
      const minutes = c.duration / 60;
      const estimatedWords = minutes * WORDS_PER_CALL_MINUTE;
      return sum + Math.ceil(estimatedWords * WORDS_TO_TOKENS_RATIO);
    }, 0);
  }, [selectedCalls]);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      {/* Top bar */}
      <header className="bg-background border-b px-4 py-3 flex items-center gap-4 sticky top-0 z-10">
        <span className="font-bold text-base tracking-tight">GongWizard</span>
        <div className="flex-1 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Label htmlFor="fromDate" className="text-sm whitespace-nowrap text-muted-foreground">
              From
            </Label>
            <Input
              id="fromDate"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-8 w-36 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="toDate" className="text-sm whitespace-nowrap text-muted-foreground">
              To
            </Label>
            <Input
              id="toDate"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-8 w-36 text-sm"
            />
          </div>
          <Button size="sm" onClick={loadCalls} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Loading…
              </>
            ) : (
              'Load My Calls'
            )}
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={disconnect} className="text-muted-foreground">
          <LogOut className="size-4" />
          Disconnect
        </Button>
      </header>

      {/* Body: 3-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar: filters */}
        <aside className="w-[240px] shrink-0 border-r bg-background p-4 overflow-y-auto hidden md:block">
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Filters
            </h3>

            {/* Text search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search calls…"
                value={filters.searchText}
                onChange={(e) => filters.setSearchText(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>

            {/* Exclude internal */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="excludeInternal"
                checked={filters.excludeInternal}
                onCheckedChange={(v) => filters.setExcludeInternal(!!v)}
              />
              <Label htmlFor="excludeInternal" className="text-sm leading-tight cursor-pointer">
                Exclude internal-only calls
              </Label>
            </div>

            {/* Tracker chips */}
            {hasLoaded && allTrackers.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Trackers
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {allTrackers.map((tracker) => (
                    <button
                      key={tracker}
                      type="button"
                      onClick={() => filters.toggleTracker(tracker)}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors",
                        filters.activeTrackers.has(tracker)
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {tracker}
                      <span className="opacity-60">{trackerCounts[tracker] ?? 0}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Topic chips */}
            {hasLoaded && allTopics.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Topics
                </h3>
                <div className="flex flex-wrap gap-1.5 max-h-[110px] overflow-y-auto">
                  {allTopics.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => filters.toggleTopic(topic)}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors",
                        filters.activeTopics.has(topic)
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {topic}
                      <span className="opacity-60">{topicCounts[topic] ?? 0}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* More filters toggle */}
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              {showAdvancedFilters ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
              {showAdvancedFilters ? 'Hide filters' : 'More filters'}
            </button>

            {/* Advanced filters (collapsed by default) */}
            {showAdvancedFilters && (
              <div className="space-y-4">
                {/* AI Content Search */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">AI summary search</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search AI summaries…"
                      value={filters.aiContentSearch}
                      onChange={(e) => filters.setAiContentSearch(e.target.value)}
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                </div>

                {/* Participant Search */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Participant name</Label>
                  <Input
                    placeholder="Search participants…"
                    value={filters.participantSearch}
                    onChange={(e) => filters.setParticipantSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>

                {/* Duration Range */}
                {calls.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Duration</Label>
                    <Slider
                      min={0}
                      max={7200}
                      step={60}
                      value={filters.durationRange}
                      onValueChange={(v) => filters.setDurationRange(v as [number, number])}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{formatDuration(filters.durationRange[0])}</span>
                      <span>{formatDuration(filters.durationRange[1])}</span>
                    </div>
                  </div>
                )}

                {/* Talk Ratio Range */}
                {calls.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Talk ratio</Label>
                    <Slider
                      min={0}
                      max={100}
                      step={5}
                      value={filters.talkRatioRange}
                      onValueChange={(v) => filters.setTalkRatioRange(v as [number, number])}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{filters.talkRatioRange[0]}%</span>
                      <span>{filters.talkRatioRange[1]}%</span>
                    </div>
                  </div>
                )}

                {/* Min External Speakers */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Min external</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={filters.minExternalSpeakers}
                    onChange={(e) => filters.setMinExternalSpeakers(Number(e.target.value) || 0)}
                    className="h-7 w-16 text-xs"
                  />
                </div>

                {/* Workspace (moved from header) */}
                {session.workspaces?.length > 1 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Workspace</Label>
                    <select
                      aria-label="Workspace"
                      value={workspaceId}
                      onChange={(e) => setWorkspaceId(e.target.value)}
                      className="w-full h-8 rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="">All workspaces</option>
                      {session.workspaces.map((ws: any) => (
                        <option key={ws.id} value={ws.id}>{ws.name || ws.id}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Footer summary */}
            {hasLoaded && (
              <div className="pt-2 space-y-1 text-xs text-muted-foreground border-t">
                <p>{calls.length} calls loaded</p>
                <p>{filteredCalls.length} shown</p>
              </div>
            )}
          </div>
        </aside>

        {/* Center: call list */}
        <main className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Transcript search — full-text search across loaded call transcripts */}
          {hasLoaded && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium">Search inside transcripts</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search transcripts…"
                    value={transcriptKeyword}
                    onChange={(e) => setTranscriptKeyword(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && !isSearchingTranscripts && runTranscriptSearch()
                    }
                    className="pl-8 h-8 text-sm"
                    disabled={isSearchingTranscripts}
                  />
                </div>
                <select
                  value={speakerFilter}
                  onChange={(e) =>
                    setSpeakerFilter(e.target.value as 'all' | 'external' | 'internal')
                  }
                  title="Filter by speaker type"
                  className="h-8 rounded-md border bg-background px-2 text-sm text-muted-foreground"
                >
                  <option value="all">All speakers</option>
                  <option value="external">Customer only</option>
                  <option value="internal">Rep only</option>
                </select>
                <Button
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={runTranscriptSearch}
                  disabled={
                    isSearchingTranscripts ||
                    !transcriptKeyword.trim() ||
                    filteredCalls.length === 0
                  }
                >
                  {isSearchingTranscripts ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    'Search'
                  )}
                </Button>
              </div>

              {isSearchingTranscripts && (
                <p className="text-xs text-muted-foreground">
                  Searching {searchProgress.searched}/{searchProgress.total} calls —{' '}
                  {searchProgress.matchCount} matches…
                </p>
              )}

              {transcriptSearchActive && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {searchProgress.matchCount} match
                    {searchProgress.matchCount !== 1 ? 'es' : ''} in {searchMatches.size} call
                    {searchMatches.size !== 1 ? 's' : ''}
                  </span>
                  {searchMatches.size > 0 && (
                    <button
                      type="button"
                      className="text-primary underline"
                      onClick={() =>
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          [...searchMatches.keys()].forEach((id) => next.add(id));
                          return next;
                        })
                      }
                    >
                      Select all
                    </button>
                  )}
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    className="text-muted-foreground underline"
                    onClick={() => {
                      setTranscriptSearchActive(false);
                      setSearchMatches(new Map());
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}

              {!transcriptSearchActive &&
                !isSearchingTranscripts &&
                filteredCalls.length > 500 && (
                  <p className="text-xs text-amber-600">
                    Note: transcript search covers first 500 of {filteredCalls.length} calls
                  </p>
                )}
            </div>
          )}

          {/* Mobile search */}
          <div className="md:hidden relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search calls…"
              value={filters.searchText}
              onChange={(e) => filters.setSearchText(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>

          {/* Select all / deselect all */}
          {filteredCalls.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Button variant="ghost" size="xs" onClick={selectAll} className="h-7 gap-1">
                <CheckSquare className="size-3.5" />
                Select All
              </Button>
              <Button variant="ghost" size="xs" onClick={deselectAll} className="h-7 gap-1">
                <Square className="size-3.5" />
                Deselect All
              </Button>
              <span className="ml-auto">
                {selectedIds.size} selected
              </span>
            </div>
          )}

          {loadError && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 text-destructive px-3 py-2.5 text-sm">
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              {loadError}
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <Loader2 className="size-8 animate-spin" />
              <p className="text-sm">Loading calls from Gong…</p>
            </div>
          )}

          {!loading && hasLoaded && filteredCalls.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
              <p className="text-sm font-medium">No calls found</p>
              <p className="text-xs">Try adjusting your date range or filters</p>
            </div>
          )}

          {!loading && !hasLoaded && !loadError && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
              <p className="text-sm font-medium">Your call library is ready to analyze.</p>
              <p className="text-xs">Set a date range above and load your calls.</p>
              <p className="text-xs opacity-60">Most users load 30–90 days at a time.</p>
            </div>
          )}

          {filteredCalls.map((call) => (
            <CallCard
              key={call.id}
              call={call}
              isSelected={selectedIds.has(call.id)}
              onToggle={toggleSelect}
              transcriptSearchActive={transcriptSearchActive}
              matchSnippets={searchMatches.get(call.id) || []}
              speakerFilter={speakerFilter}
              transcriptKeyword={transcriptKeyword}
              getMatchAffiliation={getMatchAffiliation}
              activeTrackers={filters.activeTrackers}
              activeTopics={filters.activeTopics}
            />
          ))}
        </main>

        {/* Right sidebar: analyze + export panel */}
        <aside className="w-[280px] shrink-0 border-l bg-background overflow-y-auto hidden lg:flex lg:flex-col">
          {/* Tab toggle */}
          <div className="border-b px-4 pt-3 pb-0 shrink-0">
            <Tabs value={rightPanelTab} onValueChange={(v) => setRightPanelTab(v as 'export' | 'analyze')}>
              <TabsList className="w-full h-8">
                <TabsTrigger value="analyze" className="flex-1 text-xs">
                  Analyze
                </TabsTrigger>
                <TabsTrigger value="export" className="flex-1 text-xs">
                  Export
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {rightPanelTab === 'analyze' && (
              <AnalyzePanel
                selectedCalls={selectedCalls}
                session={session}
                allCalls={calls}
              />
            )}

            {rightPanelTab === 'export' && (
              <>
                {selectedIds.size === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-10">
                    <p className="text-sm font-medium">No calls selected</p>
                    <p className="text-xs text-center">Select calls from the list to export them.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <p className="font-semibold text-sm">
                        {selectedIds.size} {selectedIds.size === 1 ? 'call' : 'calls'} selected
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ~{tokenEstimate.toLocaleString()} tokens estimated
                      </p>
                      <p className={`text-xs mt-0.5 font-medium ${contextColor(tokenEstimate)}`}>
                        {contextLabel(tokenEstimate)}
                      </p>
                    </div>

                    <Separator />

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Format
                      </Label>
                      <div className="space-y-1 mt-1">
                        {FORMAT_OPTIONS.map((f) => (
                          <button
                            key={f.value}
                            type="button"
                            onClick={() => setExportFormat(f.value as typeof exportFormat)}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-md text-xs border transition-colors",
                              exportFormat === f.value
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "border-transparent hover:bg-muted"
                            )}
                          >
                            <span className="font-medium text-foreground">{f.label}</span>
                            <span className="block text-[10px] text-muted-foreground mt-0.5">{f.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Options
                      </Label>
                      <div className="space-y-2">
                        {(
                          [
                            ['condenseMonologues', 'Truncate long internal turns (150+ words)'],
                            ['includeMetadata', 'Include call metadata'],
                            ['includeAIBrief', 'Include Gong AI brief'],
                            ['includeInteractionStats', 'Include interaction stats'],
                          ] as [keyof ExportOptions, string][]
                        ).map(([key, label]) => (
                          <div key={key} className="flex items-center gap-2">
                            <Checkbox
                              id={`opt-${key}`}
                              checked={exportOpts[key]}
                              onCheckedChange={(v) =>
                                setExportOpts((prev) => ({ ...prev, [key]: !!v }))
                              }
                            />
                            <Label htmlFor={`opt-${key}`} className="text-xs cursor-pointer leading-tight">
                              {label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Button
                        className="w-full"
                        size="sm"
                        onClick={handleExport}
                        disabled={exporting}
                      >
                        {exporting ? (
                          <>
                            <Loader2 className="size-3.5 animate-spin" />
                            Exporting…
                          </>
                        ) : (
                          <>
                            <Download className="size-3.5" />
                            Download
                          </>
                        )}
                      </Button>
                      {selectedIds.size <= 10 && (
                        <Button
                          variant="outline"
                          className="w-full"
                          size="sm"
                          onClick={handleCopy}
                          disabled={exporting}
                        >
                          <Copy className="size-3.5" />
                          {copied ? 'Copied!' : 'Copy to Clipboard'}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={handleZipExport}
                        disabled={exporting || selectedIds.size === 0}
                      >
                        {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Archive className="h-4 w-4 mr-1" />}
                        ZIP Bundle
                      </Button>
                    </div>

                    <div className="flex gap-1 flex-wrap pt-1">
                      <Button variant="ghost" size="xs" onClick={selectAll} className="h-6 text-xs">
                        Select All
                      </Button>
                      <Button variant="ghost" size="xs" onClick={deselectAll} className="h-6 text-xs">
                        Deselect All
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Mobile export bar */}
      {selectedIds.size > 0 && (
        <div className="lg:hidden sticky bottom-0 bg-background border-t px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-medium flex-1">
            {selectedIds.size} selected · ~{tokenEstimate.toLocaleString()} tokens
          </span>
          <Button size="sm" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            Export
          </Button>
        </div>
      )}
    </div>
  );
}
