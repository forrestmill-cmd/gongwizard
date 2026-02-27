import type { GongSession } from './gong/types';

const SESSION_KEY = 'gongwizard_session';

export function saveSession(session: GongSession): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (err) {
    console.error('Failed to save session:', err);
  }
}

export function getSession(): GongSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GongSession;
  } catch (err) {
    console.error('Failed to read session:', err);
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (err) {
    console.error('Failed to clear session:', err);
  }
}

export function isConnected(): boolean {
  const session = getSession();
  return session !== null && Boolean(session.accessKey) && Boolean(session.secretKey);
}
