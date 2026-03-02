const SESSION_KEY = 'gongwizard_session';

export function saveSession(data: Record<string, unknown>) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
