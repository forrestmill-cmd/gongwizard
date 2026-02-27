'use client';

import { useState, useCallback, useMemo } from 'react';
import type { ProcessedCall } from '@/lib/gong/types';
import { fetchCalls as apiFetchCalls } from '@/lib/api-client';

interface DateRange {
  from: string;
  to: string;
}

interface CallFilters {
  trackerIds: string[];
  excludeInternal: boolean;
  searchText: string;
}

interface UseCallsReturn {
  calls: ProcessedCall[];
  filteredCalls: ProcessedCall[];
  selectedCalls: ProcessedCall[];
  isLoading: boolean;
  progress: { loaded: number; total: number };
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  filters: CallFilters;
  setFilters: (filters: CallFilters | ((prev: CallFilters) => CallFilters)) => void;
  toggleSelect: (callId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  fetchCalls: (fromDate: string, toDate: string) => Promise<void>;
  error: string | null;
}

const DEFAULT_FILTERS: CallFilters = {
  trackerIds: [],
  excludeInternal: false,
  searchText: '',
};

export function useCalls(): UseCallsReturn {
  const [calls, setCalls] = useState<ProcessedCall[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: '',
    to: '',
  });
  const [filters, setFilters] = useState<CallFilters>(DEFAULT_FILTERS);

  const filteredCalls = useMemo(() => {
    let result = calls;

    if (filters.searchText.trim()) {
      const lower = filters.searchText.toLowerCase();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(lower) ||
          c.accountName.toLowerCase().includes(lower) ||
          c.speakers.some((s) => s.name.toLowerCase().includes(lower))
      );
    }

    if (filters.trackerIds.length > 0) {
      result = result.filter((c) =>
        c.trackers.some((t) => filters.trackerIds.includes(t.id))
      );
    }

    if (filters.excludeInternal) {
      result = result.filter((c) => c.externalCount > 0);
    }

    return result;
  }, [calls, filters]);

  const selectedCalls = useMemo(
    () => filteredCalls.filter((c) => c.selected),
    [filteredCalls]
  );

  const fetchCalls = useCallback(async (fromDate: string, toDate: string) => {
    setIsLoading(true);
    setError(null);
    setProgress({ loaded: 0, total: 0 });

    try {
      const result = await apiFetchCalls(fromDate, toDate);
      setCalls(result.map((c) => ({ ...c, selected: false })));
      setProgress({ loaded: result.length, total: result.length });
      setDateRange({ from: fromDate, to: toDate });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch calls';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleSelect = useCallback((callId: string) => {
    setCalls((prev) =>
      prev.map((c) => (c.id === callId ? { ...c, selected: !c.selected } : c))
    );
  }, []);

  const selectAll = useCallback(() => {
    const filteredIds = new Set(filteredCalls.map((c) => c.id));
    setCalls((prev) =>
      prev.map((c) => (filteredIds.has(c.id) ? { ...c, selected: true } : c))
    );
  }, [filteredCalls]);

  const deselectAll = useCallback(() => {
    setCalls((prev) => prev.map((c) => ({ ...c, selected: false })));
  }, []);

  return {
    calls,
    filteredCalls,
    selectedCalls,
    isLoading,
    progress,
    dateRange,
    setDateRange,
    filters,
    setFilters,
    toggleSelect,
    selectAll,
    deselectAll,
    fetchCalls,
    error,
  };
}
