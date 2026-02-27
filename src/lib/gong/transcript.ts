import type { GongCallParty, GongMonologue } from './types';
import { classifySpeaker } from './speakers';

export function formatTranscript(
  parties: GongCallParty[],
  transcript: GongMonologue[],
  internalDomains: string[]
): { speakerLines: string[]; transcriptLines: string[] } {
  const speakers = new Map<string, { firstName: string; affiliation: 'internal' | 'external' }>();
  const speakerLines: string[] = [];

  for (const party of parties) {
    if (!party.speakerId) continue;
    const aff = classifySpeaker(party, internalDomains);
    const firstName =
      party.name?.includes(' ') ? party.name.split(' ')[0] : party.name || 'Unknown';
    speakers.set(party.speakerId, { firstName, affiliation: aff });

    const tag = aff === 'internal' ? 'I' : 'E';
    let line = `${party.name || 'Unknown'} [${tag}]`;
    if (party.title) line += `: ${party.title}`;
    speakerLines.push(line);
  }

  const transcriptLines: string[] = [];
  let currentSpeaker: string | null = null;
  let currentSentences: string[] = [];
  let currentTimeMs = 0;

  const flushSpeaker = () => {
    if (currentSentences.length === 0 || currentSpeaker === null) return;
    const prev = speakers.get(currentSpeaker) || {
      firstName: 'Unknown',
      affiliation: 'external' as const,
    };
    const minutes = Math.floor(currentTimeMs / 60000);
    const seconds = Math.floor((currentTimeMs % 60000) / 1000);
    const tag = prev.affiliation === 'internal' ? 'I' : 'E';
    transcriptLines.push(`${minutes}:${String(seconds).padStart(2, '0')} | ${prev.firstName} [${tag}]`);
    transcriptLines.push(currentSentences.join(' '));
    transcriptLines.push('');
  };

  for (const mono of transcript) {
    const speakerId = mono.speakerId || '';
    const speaker = speakers.get(speakerId) || {
      firstName: 'Unknown',
      affiliation: 'external' as const,
    };

    for (const sentence of mono.sentences || []) {
      const ms = sentence.start || 0;
      let text = (sentence.text || '').trim();

      if (text && speaker.affiliation !== 'internal') {
        text = text.toUpperCase();
      }

      if (currentSpeaker !== speakerId || currentSentences.length === 0) {
        flushSpeaker();
        currentSpeaker = speakerId;
        currentSentences = text ? [text] : [];
        currentTimeMs = ms;
      } else {
        if (text) currentSentences.push(text);
      }
    }
  }

  flushSpeaker();

  return { speakerLines, transcriptLines };
}

export function flattenOutline(outline: unknown): string {
  if (!outline) return '';
  if (typeof outline === 'string') return outline;
  if (Array.isArray(outline)) {
    const texts: string[] = [];
    for (const item of outline) {
      if (typeof item === 'string') {
        texts.push(item);
      } else if (typeof item === 'object' && item !== null) {
        for (const value of Object.values(item)) {
          if (typeof value === 'string') texts.push(value);
        }
      }
    }
    return texts.join(' ');
  }
  return '';
}
