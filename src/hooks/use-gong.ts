'use client';

import { useState, useEffect, useCallback } from 'react';
import type { GongSession } from '@/lib/gong/types';
import { saveSession, getSession, clearSession, isConnected } from '@/lib/session-store';
import { connectToGong as apiConnect } from '@/lib/api-client';

interface UseGongReturn {
  session: GongSession | null;
  isConnected: boolean;
  connect: (accessKey: string, secretKey: string) => Promise<{ success: boolean; error?: string }>;
  disconnect: () => void;
}

export function useGong(): UseGongReturn {
  const [session, setSession] = useState<GongSession | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const stored = getSession();
    if (stored) {
      setSession(stored);
      setConnected(true);
    }
  }, []);

  const connect = useCallback(
    async (accessKey: string, secretKey: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const result = await apiConnect(accessKey, secretKey);

        const newSession: GongSession = {
          accessKey,
          secretKey,
          baseUrl: result.baseUrl,
          users: result.users,
          trackers: result.trackers,
          workspaces: result.workspaces,
          internalDomains: result.internalDomains,
          connectedAt: new Date().toISOString(),
        };

        saveSession(newSession);
        setSession(newSession);
        setConnected(true);

        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { success: false, error: message };
      }
    },
    []
  );

  const disconnect = useCallback(() => {
    clearSession();
    setSession(null);
    setConnected(false);
  }, []);

  return {
    session,
    isConnected: connected,
    connect,
    disconnect,
  };
}
