// Shared formatting utilities

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function isInternalParty(party: any, internalDomains: string[]): boolean {
  if (party.affiliation === 'Internal') return true;
  const email: string = party.emailAddress || '';
  const domain = email.includes('@') ? email.split('@')[1]?.toLowerCase() : '';
  return !!(domain && internalDomains.includes(domain));
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function truncateToFirstSentence(text: string, maxChars = 120): string {
  if (!text) return '';
  const sentenceEnd = text.indexOf('. ');
  if (sentenceEnd > 0 && sentenceEnd < maxChars) {
    return text.slice(0, sentenceEnd + 1);
  }
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trimEnd() + '…';
}
