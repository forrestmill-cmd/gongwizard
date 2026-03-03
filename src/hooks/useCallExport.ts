'use client';

import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { downloadZip } from 'client-zip';
import { isInternalParty } from '@/lib/format-utils';
import { downloadFile } from '@/lib/browser-utils';
import {
  groupTranscriptTurns,
  buildExportContent,
  type Speaker,
  type TranscriptSentence,
  type CallForExport,
  type ExportOptions,
} from '@/lib/transcript-formatter';

interface UseCallExportParams {
  selectedIds: Set<string>;
  session: any;
  calls: any[];
  exportFormat: 'markdown' | 'xml' | 'jsonl' | 'csv' | 'utterance-csv';
  exportOpts: ExportOptions;
}

export function useCallExport({
  selectedIds,
  session,
  calls,
  exportFormat,
  exportOpts,
}: UseCallExportParams) {
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchTranscriptsForSelected = useCallback(async (): Promise<CallForExport[]> => {
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
    const callMap = new Map(calls.map((c: any) => [c.id, c]));

    return (data.transcripts || [])
      .filter((t: any) => callMap.has(t.callId))
      .map((t: any) => {
        const callMeta = callMap.get(t.callId)!;
        const parties: any[] = callMeta.parties || [];

        const speakerMap = new Map<string, Speaker>();
        for (const p of parties) {
          const internal = isInternalParty(p, internalDomains);
          const fullName = p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Unknown';
          speakerMap.set(p.speakerId || p.userId || p.id, {
            speakerId: p.speakerId || p.userId || p.id,
            name: fullName,
            firstName: p.firstName || fullName.split(' ')[0],
            isInternal: internal,
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
          interactionStats: callMeta.interactionStats || undefined,
          rawMonologues: t.transcript || [],
        };
      });
  }, [selectedIds, session, calls]);

  const handleExport = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setExporting(true);
    try {
      const callsForExport = await fetchTranscriptsForSelected();
      const { content, extension, mimeType } = buildExportContent(callsForExport, exportFormat, exportOpts, calls);
      const filename = exportFormat === 'utterance-csv'
        ? `gong-utterances-${format(new Date(), 'yyyy-MM-dd')}.csv`
        : `gong-transcripts-${format(new Date(), 'yyyy-MM-dd')}.${extension}`;
      downloadFile(content, filename, mimeType);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [selectedIds, exportFormat, exportOpts, fetchTranscriptsForSelected]);

  const handleCopy = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setExporting(true);
    try {
      const callsForExport = await fetchTranscriptsForSelected();
      const { content } = buildExportContent(callsForExport, exportFormat, exportOpts, calls);
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err: any) {
      alert(err.message || 'Copy failed');
    } finally {
      setExporting(false);
    }
  }, [selectedIds, exportFormat, exportOpts, fetchTranscriptsForSelected]);

  const handleZipExport = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setExporting(true);
    try {
      const callsForExport = await fetchTranscriptsForSelected();
      const exportDate = new Date();
      const { extension } = buildExportContent([], exportFormat, exportOpts, calls);

      const fileEntries: { name: string; lastModified: Date; input: string }[] = [];

      const manifestEntries: { id: string; title: string; date: string; filename: string }[] = [];

      for (const call of callsForExport) {
        const { content } = buildExportContent([call], exportFormat, exportOpts, calls);
        const sanitized = (call.title || 'untitled')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 50);
        const filename = `calls/${sanitized}-${call.date || 'no-date'}.${extension}`;
        fileEntries.push({ name: filename, lastModified: exportDate, input: content });
        manifestEntries.push({ id: call.id, title: call.title, date: call.date, filename });
      }

      const manifest = {
        exportDate: exportDate.toISOString(),
        callCount: callsForExport.length,
        format: exportFormat,
        calls: manifestEntries,
      };

      const files = [
        { name: 'manifest.json', lastModified: exportDate, input: JSON.stringify(manifest, null, 2) },
        ...fileEntries,
      ];

      const blob = await downloadZip(files).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gong-export-${format(exportDate, 'yyyy-MM-dd')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'ZIP export failed');
    } finally {
      setExporting(false);
    }
  }, [selectedIds, exportFormat, exportOpts, fetchTranscriptsForSelected, calls]);

  return { exporting, copied, handleExport, handleCopy, handleZipExport };
}
