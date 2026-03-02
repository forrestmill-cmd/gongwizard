'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

const STORAGE_KEY = 'gongwizard_filters';

interface PersistedFilters {
  excludeInternal: boolean;
  durationMin: number;
  durationMax: number;
  talkRatioMin: number;
  talkRatioMax: number;
  minExternalSpeakers: number;
}

function loadPersistedFilters(): Partial<PersistedFilters> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistFilters(filters: PersistedFilters) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // localStorage may be unavailable
  }
}

export function useFilterState() {
  const [persisted] = useState(() => loadPersistedFilters());

  // Text searches (not persisted — session-specific)
  const [searchText, setSearchText] = useState('');
  const [participantSearch, setParticipantSearch] = useState('');
  const [aiContentSearch, setAiContentSearch] = useState('');

  // Boolean toggles
  const [excludeInternal, setExcludeInternalRaw] = useState(persisted.excludeInternal ?? false);

  // Range filters
  const [durationRange, setDurationRangeRaw] = useState<[number, number]>([
    persisted.durationMin ?? 0,
    persisted.durationMax ?? 7200,
  ]);
  const [talkRatioRange, setTalkRatioRangeRaw] = useState<[number, number]>([
    persisted.talkRatioMin ?? 0,
    persisted.talkRatioMax ?? 100,
  ]);

  // Numeric
  const [minExternalSpeakers, setMinExternalSpeakersRaw] = useState(persisted.minExternalSpeakers ?? 0);

  // Multi-select (not persisted — depends on loaded data)
  const [activeTrackers, setActiveTrackers] = useState<Set<string>>(new Set());
  const [activeTopics, setActiveTopics] = useState<Set<string>>(new Set());

  // Ref always holds current filter values to avoid stale closures
  const currentFilters = useRef({ excludeInternal, durationRange, talkRatioRange, minExternalSpeakers });
  useEffect(() => {
    currentFilters.current = { excludeInternal, durationRange, talkRatioRange, minExternalSpeakers };
  }, [excludeInternal, durationRange, talkRatioRange, minExternalSpeakers]);

  // Wrapper to persist on change
  const updatePersisted = useCallback(
    (updates: Partial<PersistedFilters>) => {
      const { excludeInternal, durationRange, talkRatioRange, minExternalSpeakers } = currentFilters.current;
      const current: PersistedFilters = {
        excludeInternal,
        durationMin: durationRange[0],
        durationMax: durationRange[1],
        talkRatioMin: talkRatioRange[0],
        talkRatioMax: talkRatioRange[1],
        minExternalSpeakers,
      };
      persistFilters({ ...current, ...updates });
    },
    [] // stable reference — reads from ref
  );

  const setExcludeInternal = useCallback(
    (v: boolean) => {
      setExcludeInternalRaw(v);
      updatePersisted({ excludeInternal: v });
    },
    [updatePersisted]
  );

  const setDurationRange = useCallback(
    (v: [number, number]) => {
      setDurationRangeRaw(v);
      updatePersisted({ durationMin: v[0], durationMax: v[1] });
    },
    [updatePersisted]
  );

  const setTalkRatioRange = useCallback(
    (v: [number, number]) => {
      setTalkRatioRangeRaw(v);
      updatePersisted({ talkRatioMin: v[0], talkRatioMax: v[1] });
    },
    [updatePersisted]
  );

  const setMinExternalSpeakers = useCallback(
    (v: number) => {
      setMinExternalSpeakersRaw(v);
      updatePersisted({ minExternalSpeakers: v });
    },
    [updatePersisted]
  );

  const toggleTracker = useCallback((name: string) => {
    setActiveTrackers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const toggleTopic = useCallback((name: string) => {
    setActiveTopics((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setSearchText('');
    setParticipantSearch('');
    setAiContentSearch('');
    setExcludeInternalRaw(false);
    setDurationRangeRaw([0, 7200]);
    setTalkRatioRangeRaw([0, 100]);
    setMinExternalSpeakersRaw(0);
    setActiveTrackers(new Set());
    setActiveTopics(new Set());
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  return {
    searchText,
    setSearchText,
    participantSearch,
    setParticipantSearch,
    aiContentSearch,
    setAiContentSearch,
    excludeInternal,
    setExcludeInternal,
    durationRange,
    setDurationRange,
    talkRatioRange,
    setTalkRatioRange,
    minExternalSpeakers,
    setMinExternalSpeakers,
    activeTrackers,
    toggleTracker,
    activeTopics,
    toggleTopic,
    resetFilters,
  };
}
