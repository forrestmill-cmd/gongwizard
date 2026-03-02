'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  Sparkles,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { estimateTokens, contextLabel, contextColor } from '@/lib/token-utils';
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

const WORDS_PER_CALL_MINUTE = 130;
const WORDS_TO_TOKENS_RATIO = 1.3;

// ─── Types ──────────────────────────────────────────────────────────────────

interface GongCall {
  id: string;
  title: string;
  started: string;
  duration: number;
  accountName?: string;
  topics?: string[];
  trackers?: string[];
  brief?: string;
  parties?: any[];
  interactionStats?: any;
  internalSpeakerCount: number;
  externalSpeakerCount: number;
  talkRatio?: number;
  keyPoints?: string[];
  actionItems?: string[];
  outline?: Array<{ name: string; startTimeMs: number; durationMs: number; items?: Array<{ text: string; startTimeMs: number; durationMs: number }> }>;
  questions?: any[];
  url?: string;
}

// ─── CallCard ────────────────────────────────────────────────────────────────

function CallCard({ call, isSelected, onToggle }: {
  call: GongCall;
  isSelected: boolean;
  onToggle: (id: string) => void;
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

            {(call.topics?.length || call.trackers?.length) ? (
              <div className="flex flex-wrap gap-1">
                {(call.topics || []).map((topic) => (
                  <Badge key={topic} variant="secondary" className="text-xs px-1.5 py-0">
                    {topic}
                  </Badge>
                ))}
                {(call.trackers || []).map((tracker) => (
                  <Badge
                    key={tracker}
                    variant="outline"
                    className="text-xs px-1.5 py-0 border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300"
                  >
                    {tracker}
                  </Badge>
                ))}
              </div>
            ) : null}

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

  const [rightPanelTab, setRightPanelTab] = useState<'export' | 'analyze'>('analyze');

  const [exportFormat, setExportFormat] = useState<'markdown' | 'xml' | 'jsonl' | 'csv'>('markdown');
  const [exportOpts, setExportOpts] = useState<ExportOptions>({
    removeFillerGreetings: true,
    condenseMonologues: true,
    includeMetadata: true,
    includeAIBrief: true,
    includeInteractionStats: true,
  });

  const filters = useFilterState();

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
  ]);

  const selectedCalls = useMemo(
    () => calls.filter((c) => selectedIds.has(c.id)),
    [calls, selectedIds]
  );

  async function loadCalls() {
    if (!session) return;
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

        const trackerNames: string[] = [];
        for (const t of call.trackers || []) {
          if (t.count != null && t.count <= 0) continue;
          const name = t.name || t.trackerName || t.id;
          if (name) trackerNames.push(name);
        }

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
  }

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
          {session.workspaces?.length > 1 && (
            <div className="flex items-center gap-2">
              <Label htmlFor="workspace" className="text-sm whitespace-nowrap text-muted-foreground">
                Workspace
              </Label>
              <select
                id="workspace"
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">All workspaces</option>
                {session.workspaces.map((ws: any) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name || ws.id}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button size="sm" onClick={loadCalls} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Loading…
              </>
            ) : (
              'Load Calls'
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
          <div className="space-y-5">
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Filters
              </h3>

              {/* AI Content Search */}
              <div className="space-y-1">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search AI summaries…"
                    value={filters.aiContentSearch}
                    onChange={(e) => filters.setAiContentSearch(e.target.value)}
                    className="pl-8 h-8 text-sm border-blue-200 dark:border-blue-800"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">Searches brief, key points, action items, outline</p>
              </div>

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

            {/* Duration Range */}
            {hasLoaded && calls.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Duration
                </h3>
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
            {hasLoaded && calls.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Talk Ratio
                </h3>
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

            {/* Participant Search */}
            <div className="space-y-1">
              <Input
                placeholder="Search participants…"
                value={filters.participantSearch}
                onChange={(e) => filters.setParticipantSearch(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            {/* Trackers */}
            {allTrackers.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Trackers
                </h3>
                <div className="space-y-1.5">
                  {allTrackers.map((tracker) => (
                    <div key={tracker} className="flex items-center gap-2">
                      <Checkbox
                        id={`tracker-${tracker}`}
                        checked={filters.activeTrackers.has(tracker)}
                        onCheckedChange={() => filters.toggleTracker(tracker)}
                      />
                      <Label
                        htmlFor={`tracker-${tracker}`}
                        className="text-sm leading-tight cursor-pointer flex-1 truncate"
                      >
                        {tracker}
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        {trackerCounts[tracker] ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Topics */}
            {allTopics.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Topics
                </h3>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {allTopics.map((topic) => (
                    <div key={topic} className="flex items-center gap-2">
                      <Checkbox
                        id={`topic-${topic}`}
                        checked={filters.activeTopics.has(topic)}
                        onCheckedChange={() => filters.toggleTopic(topic)}
                      />
                      <Label
                        htmlFor={`topic-${topic}`}
                        className="text-sm leading-tight cursor-pointer flex-1 truncate"
                      >
                        {topic}
                      </Label>
                      <span className="text-xs text-muted-foreground">{topicCounts[topic] ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
              <p className="text-sm font-medium">No calls loaded yet</p>
              <p className="text-xs">Set a date range and click Load Calls</p>
            </div>
          )}

          {filteredCalls.map((call) => (
            <CallCard
              key={call.id}
              call={call}
              isSelected={selectedIds.has(call.id)}
              onToggle={toggleSelect}
            />
          ))}
        </main>

        {/* Right sidebar: analyze + export panel */}
        <aside className="w-[280px] shrink-0 border-l bg-background overflow-y-auto hidden lg:flex lg:flex-col">
          {/* Tab toggle */}
          <div className="border-b px-4 pt-3 pb-0 shrink-0">
            <Tabs value={rightPanelTab} onValueChange={(v) => setRightPanelTab(v as 'export' | 'analyze')}>
              <TabsList className="w-full h-8">
                <TabsTrigger value="analyze" className="flex-1 text-xs gap-1">
                  <Sparkles className="size-3" />
                  Analyze
                </TabsTrigger>
                <TabsTrigger value="export" className="flex-1 text-xs gap-1">
                  <Download className="size-3" />
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
                    <p className="text-xs text-center">Select calls from the list to export them</p>
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

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Format
                      </Label>
                      <Tabs
                        value={exportFormat}
                        onValueChange={(v) => setExportFormat(v as any)}
                      >
                        <TabsList className="w-full h-8 text-xs">
                          <TabsTrigger value="markdown" className="flex-1 text-xs">
                            Markdown
                          </TabsTrigger>
                          <TabsTrigger value="xml" className="flex-1 text-xs">
                            XML
                          </TabsTrigger>
                          <TabsTrigger value="jsonl" className="flex-1 text-xs">
                            JSONL
                          </TabsTrigger>
                          <TabsTrigger value="csv" className="flex-1 text-xs">
                            CSV
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Options
                      </Label>
                      <div className="space-y-2">
                        {(
                          [
                            ['removeFillerGreetings', 'Remove filler/greetings'],
                            ['condenseMonologues', 'Condense internal monologues'],
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
