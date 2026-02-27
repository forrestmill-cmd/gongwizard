'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  Download,
  Copy,
  LogOut,
  Search,
  CheckSquare,
  Square,
  AlertCircle,
} from 'lucide-react';
import { format, subDays } from 'date-fns';

// ─── Session helpers ────────────────────────────────────────────────────────

function saveSession(data: any) {
  sessionStorage.setItem('gongwizard_session', JSON.stringify(data));
}
function getSession(): any | null {
  const s = sessionStorage.getItem('gongwizard_session');
  return s ? JSON.parse(s) : null;
}

// ─── Token estimation ───────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function contextLabel(tokens: number): string {
  if (tokens < 8000) return 'Fits GPT-3.5 (8K)';
  if (tokens < 16000) return 'Fits Claude Haiku (16K)';
  if (tokens < 32000) return 'Fits ChatGPT Plus (32K)';
  if (tokens < 128000) return 'Fits GPT-4o / Claude (128K)';
  if (tokens < 200000) return 'Fits Claude (200K)';
  return 'Exceeds most context windows';
}

function contextColor(tokens: number): string {
  if (tokens < 32000) return 'text-green-600 dark:text-green-400';
  if (tokens < 128000) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

// ─── File download helper ───────────────────────────────────────────────────

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Duration formatting ────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── Transcript formatting ──────────────────────────────────────────────────

interface Speaker {
  speakerId: string;
  name: string;
  firstName: string;
  isInternal: boolean;
  title?: string;
}

interface TranscriptSentence {
  speakerId: string;
  text: string;
  start: number;
}

interface FormattedTurn {
  speakerId: string;
  firstName: string;
  isInternal: boolean;
  timestamp: string;
  text: string;
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function groupTranscriptTurns(
  sentences: TranscriptSentence[],
  speakerMap: Map<string, Speaker>
): FormattedTurn[] {
  const turns: FormattedTurn[] = [];
  let current: { speakerId: string; sentences: TranscriptSentence[] } | null = null;

  for (const sentence of sentences) {
    if (!current || current.speakerId !== sentence.speakerId) {
      if (current) {
        const spk = speakerMap.get(current.speakerId);
        const firstName = spk?.firstName || spk?.name?.split(' ')[0] || 'Unknown';
        const isInternal = spk?.isInternal ?? true;
        const ts = formatTimestamp(current.sentences[0].start);
        const text = current.sentences.map((s) => s.text).join(' ');
        turns.push({ speakerId: current.speakerId, firstName, isInternal, timestamp: ts, text });
      }
      current = { speakerId: sentence.speakerId, sentences: [sentence] };
    } else {
      current.sentences.push(sentence);
    }
  }

  if (current) {
    const spk = speakerMap.get(current.speakerId);
    const firstName = spk?.firstName || spk?.name?.split(' ')[0] || 'Unknown';
    const isInternal = spk?.isInternal ?? true;
    const ts = formatTimestamp(current.sentences[0].start);
    const text = current.sentences.map((s) => s.text).join(' ');
    turns.push({ speakerId: current.speakerId, firstName, isInternal, timestamp: ts, text });
  }

  return turns;
}

// ─── Export formatting ──────────────────────────────────────────────────────

interface CallForExport {
  id: string;
  title: string;
  date: string;
  duration: number;
  accountName: string;
  speakers: Speaker[];
  brief: string;
  turns: FormattedTurn[];
}

function buildMarkdown(calls: CallForExport[], opts: ExportOptions): string {
  const now = new Date().toISOString().split('T')[0];
  const allText = calls.map((c) => buildCallText(c, opts)).join('\n\n---\n\n');
  const tokens = estimateTokens(allText);

  let out = `# Call Transcripts Export\n`;
  out += `Generated: ${now}\n`;
  out += `Total Calls: ${calls.length}\n`;
  out += `Estimated Tokens: ~${tokens.toLocaleString()}\n\n---\n\n`;
  out += allText;
  return out;
}

function buildCallText(call: CallForExport, opts: ExportOptions): string {
  let out = `## Call: ${call.title}\n`;
  out += `**Date:** ${call.date} | **Duration:** ${formatDuration(call.duration)}\n`;
  if (opts.includeMetadata && call.accountName) {
    out += `**Account:** ${call.accountName}\n`;
  }
  out += '\n';

  if (opts.includeMetadata && call.speakers.length > 0) {
    out += `### Speakers\n`;
    for (const s of call.speakers) {
      out += `- ${s.name} [${s.isInternal ? 'I' : 'E'}]${s.title ? `: ${s.title}` : ''}\n`;
    }
    out += '\n';
  }

  if (opts.includeAIBrief && call.brief) {
    out += `### Gong AI Brief\n${call.brief}\n\n`;
  }

  out += `### Transcript\n`;
  out += `[I]=Internal, [E]=External (shown in ALL CAPS)\n\n`;

  let turns = call.turns;
  if (opts.removeFillerGreetings) {
    turns = filterFillerTurns(turns);
  }
  if (opts.condenseMonologues) {
    turns = condenseInternalMonologues(turns);
  }

  for (const turn of turns) {
    const label = `${turn.isInternal ? 'I' : 'E'}`;
    const text = turn.isInternal ? turn.text : turn.text.toUpperCase();
    out += `${turn.timestamp} | ${turn.firstName} [${label}]\n${text}\n\n`;
  }

  return out;
}

function buildXML(calls: CallForExport[], opts: ExportOptions): string {
  const now = new Date().toISOString().split('T')[0];
  let out = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  out += `<calls export_date="${now}" total="${calls.length}">\n`;

  for (const call of calls) {
    let turns = call.turns;
    if (opts.removeFillerGreetings) turns = filterFillerTurns(turns);
    if (opts.condenseMonologues) turns = condenseInternalMonologues(turns);

    out += `  <call id="${escapeXml(call.id)}" title="${escapeXml(call.title)}" date="${escapeXml(call.date)}" duration="${call.duration}">\n`;

    if (opts.includeMetadata) {
      out += `    <speakers>\n`;
      for (const s of call.speakers) {
        out += `      <speaker name="${escapeXml(s.name)}" role="${s.isInternal ? 'I' : 'E'}"${s.title ? ` title="${escapeXml(s.title)}"` : ''}/>\n`;
      }
      out += `    </speakers>\n`;
    }

    if (opts.includeAIBrief && call.brief) {
      out += `    <brief>${escapeXml(call.brief)}</brief>\n`;
    }

    out += `    <transcript>\n`;
    for (const turn of turns) {
      const text = turn.isInternal ? turn.text : turn.text.toUpperCase();
      out += `      <turn speaker="${escapeXml(turn.firstName)}" role="${turn.isInternal ? 'I' : 'E'}" time="${escapeXml(turn.timestamp)}">${escapeXml(text)}</turn>\n`;
    }
    out += `    </transcript>\n`;
    out += `  </call>\n`;
  }

  out += `</calls>`;
  return out;
}

function buildJSONL(calls: CallForExport[], opts: ExportOptions): string {
  return calls
    .map((call) => {
      let turns = call.turns;
      if (opts.removeFillerGreetings) turns = filterFillerTurns(turns);
      if (opts.condenseMonologues) turns = condenseInternalMonologues(turns);

      const obj: any = {
        id: call.id,
        title: call.title,
        date: call.date,
        duration: call.duration,
      };
      if (opts.includeMetadata) {
        obj.accountName = call.accountName;
        obj.speakers = call.speakers.map((s) => ({
          name: s.name,
          role: s.isInternal ? 'I' : 'E',
          title: s.title,
        }));
      }
      if (opts.includeAIBrief) {
        obj.brief = call.brief;
      }
      obj.transcript = turns.map((t) => ({
        time: t.timestamp,
        speaker: t.firstName,
        role: t.isInternal ? 'I' : 'E',
        text: t.isInternal ? t.text : t.text.toUpperCase(),
      }));
      return JSON.stringify(obj);
    })
    .join('\n');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const FILLER_PATTERNS = [
  /^(hi|hello|hey|thanks|thank you|bye|goodbye|talk soon|have a great|sounds good|absolutely|of course|sure|yeah|yes|no|okay|ok|alright|right|great|perfect)[!.,\s]*$/i,
];

function filterFillerTurns(turns: FormattedTurn[]): FormattedTurn[] {
  return turns.filter((t) => {
    const trimmed = t.text.trim();
    if (trimmed.length < 5) return false;
    return !FILLER_PATTERNS.some((p) => p.test(trimmed));
  });
}

function condenseInternalMonologues(turns: FormattedTurn[]): FormattedTurn[] {
  const result: FormattedTurn[] = [];
  let i = 0;
  while (i < turns.length) {
    const turn = turns[i];
    if (turn.isInternal) {
      let j = i + 1;
      const group: FormattedTurn[] = [turn];
      while (j < turns.length && turns[j].isInternal && turns[j].speakerId === turn.speakerId) {
        group.push(turns[j]);
        j++;
      }
      if (group.length > 2) {
        const condensed: FormattedTurn = {
          ...turn,
          text: group.map((t) => t.text).join(' '),
        };
        result.push(condensed);
        i = j;
      } else {
        result.push(turn);
        i++;
      }
    } else {
      result.push(turn);
      i++;
    }
  }
  return result;
}

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
}

interface ExportOptions {
  removeFillerGreetings: boolean;
  condenseMonologues: boolean;
  includeMetadata: boolean;
  includeAIBrief: boolean;
  includeInteractionStats: boolean;
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
  const [searchText, setSearchText] = useState('');
  const [excludeInternal, setExcludeInternal] = useState(false);
  const [activeTrackers, setActiveTrackers] = useState<Set<string>>(new Set());

  const [exportFormat, setExportFormat] = useState<'markdown' | 'xml' | 'jsonl'>('markdown');
  const [exportOpts, setExportOpts] = useState<ExportOptions>({
    removeFillerGreetings: true,
    condenseMonologues: true,
    includeMetadata: true,
    includeAIBrief: true,
    includeInteractionStats: true,
  });
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      if (excludeInternal && call.externalSpeakerCount === 0) return false;
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        const inTitle = call.title.toLowerCase().includes(q);
        const inBrief = (call.brief || '').toLowerCase().includes(q);
        if (!inTitle && !inBrief) return false;
      }
      if (activeTrackers.size > 0) {
        const callTrackers = new Set(call.trackers || []);
        const hasMatch = [...activeTrackers].some((t) => callTrackers.has(t));
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [calls, excludeInternal, searchText, activeTrackers]);

  const trackerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of allTrackers) counts[t] = 0;
    for (const call of calls) {
      for (const t of call.trackers || []) {
        if (counts[t] !== undefined) counts[t]++;
        else counts[t] = 1;
      }
    }
    return counts;
  }, [calls, allTrackers]);

  const selectedCalls = useMemo(
    () => filteredCalls.filter((c) => selectedIds.has(c.id)),
    [filteredCalls, selectedIds]
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
          fromDate,
          toDate,
          baseUrl: session.baseUrl,
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
          const email: string = p.emailAddress || '';
          const domain = email.includes('@') ? email.split('@')[1]?.toLowerCase() : '';
          const isInternal: boolean =
            p.affiliation === 'Internal' ||
            !!(domain && internalDomains.includes(domain));
          if (isInternal) internalCount++;
          else externalCount++;
        }

        const trackerNames: string[] = [];
        for (const t of call.trackers || []) {
          const name = t.name || t.trackerId;
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
        };
      });

      setCalls(processed);
      setHasLoaded(true);
    } catch {
      setLoadError('Network error loading calls.');
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

  function toggleTracker(name: string) {
    setActiveTrackers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function disconnect() {
    sessionStorage.removeItem('gongwizard_session');
    router.replace('/');
  }

  async function fetchTranscriptsForSelected(): Promise<CallForExport[]> {
    const ids = [...selectedIds];
    const res = await fetch('/api/gong/transcripts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gong-Auth': session.authHeader,
      },
      body: JSON.stringify({ callIds: ids, baseUrl: session.baseUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch transcripts');

    const internalDomains: string[] = session.internalDomains || [];
    const callMap = new Map(calls.map((c) => [c.id, c]));

    return (data.transcripts || []).map((t: any) => {
      const callMeta = callMap.get(t.callId) || ({} as any);
      // Transcript endpoint doesn't return parties — use stored call data
      const parties: any[] = callMeta.parties || [];

      const speakerMap = new Map<string, Speaker>();
      for (const p of parties) {
        const email: string = p.emailAddress || '';
        const domain = email.includes('@') ? email.split('@')[1]?.toLowerCase() : '';
        const isInternal: boolean =
          p.affiliation === 'Internal' ||
          !!(domain && internalDomains.includes(domain));
        const fullName = p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Unknown';
        speakerMap.set(p.speakerId || p.userId || p.id, {
          speakerId: p.speakerId || p.userId || p.id,
          name: fullName,
          firstName: p.firstName || fullName.split(' ')[0],
          isInternal,
          title: p.title || '',
        });
      }

      const sentences: TranscriptSentence[] = [];
      for (const track of t.transcript || []) {
        const speakerId = track.speakerId;
        for (const sentence of track.sentences || []) {
          sentences.push({
            speakerId,
            text: sentence.text,
            start: sentence.start,
          });
        }
      }
      sentences.sort((a, b) => a.start - b.start);

      const turns = groupTranscriptTurns(sentences, speakerMap);

      return {
        id: t.callId,
        title: callMeta.title || 'Untitled Call',
        date: callMeta.started ? callMeta.started.split('T')[0] : '',
        duration: callMeta.duration || 0,
        accountName: callMeta.accountName || '',
        speakers: [...speakerMap.values()],
        brief: callMeta.brief || '',
        turns,
      };
    });
  }

  async function handleExport() {
    if (selectedIds.size === 0) return;
    setExporting(true);
    try {
      const callsForExport = await fetchTranscriptsForSelected();
      let content: string;
      let filename: string;
      let mime: string;

      if (exportFormat === 'markdown') {
        content = buildMarkdown(callsForExport, exportOpts);
        filename = `gong-transcripts-${format(new Date(), 'yyyy-MM-dd')}.md`;
        mime = 'text/markdown';
      } else if (exportFormat === 'xml') {
        content = buildXML(callsForExport, exportOpts);
        filename = `gong-transcripts-${format(new Date(), 'yyyy-MM-dd')}.xml`;
        mime = 'application/xml';
      } else {
        content = buildJSONL(callsForExport, exportOpts);
        filename = `gong-transcripts-${format(new Date(), 'yyyy-MM-dd')}.jsonl`;
        mime = 'application/jsonl';
      }

      downloadFile(content, filename, mime);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function handleCopy() {
    if (selectedIds.size === 0) return;
    setExporting(true);
    try {
      const callsForExport = await fetchTranscriptsForSelected();
      let content: string;
      if (exportFormat === 'markdown') content = buildMarkdown(callsForExport, exportOpts);
      else if (exportFormat === 'xml') content = buildXML(callsForExport, exportOpts);
      else content = buildJSONL(callsForExport, exportOpts);

      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err: any) {
      alert(err.message || 'Copy failed');
    } finally {
      setExporting(false);
    }
  }

  const tokenEstimate = useMemo(() => {
    // Rough estimate: ~4-8K tokens per 30min call. Use duration as proxy.
    // Average speaking rate ~150 words/min, ~1.3 tokens/word
    return selectedCalls.reduce((sum, c) => {
      const minutes = c.duration / 60;
      const estimatedWords = minutes * 130; // slightly below avg to account for pauses
      return sum + Math.ceil(estimatedWords * 1.3);
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
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search calls…"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="excludeInternal"
                checked={excludeInternal}
                onCheckedChange={(v) => setExcludeInternal(!!v)}
              />
              <Label htmlFor="excludeInternal" className="text-sm leading-tight cursor-pointer">
                Exclude internal-only calls
              </Label>
            </div>

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
                        checked={activeTrackers.has(tracker)}
                        onCheckedChange={() => toggleTracker(tracker)}
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
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
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

          {filteredCalls.map((call) => {
            const isSelected = selectedIds.has(call.id);
            const callDate = call.started ? format(new Date(call.started), 'MMM d, yyyy') : '';
            return (
              <Card
                key={call.id}
                onClick={() => toggleSelect(call.id)}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  isSelected ? 'ring-2 ring-primary shadow-sm' : ''
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(call.id)}
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
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {call.brief}
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
          })}
        </main>

        {/* Right sidebar: export panel */}
        <aside className="w-[280px] shrink-0 border-l bg-background p-4 overflow-y-auto hidden lg:block">
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
