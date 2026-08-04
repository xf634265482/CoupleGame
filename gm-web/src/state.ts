import type { AdminSessionState } from './types';

const SESSION_KEY = 'tata_gm_admin_session';

export function loadSession(): AdminSessionState | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AdminSessionState;
    if (!parsed.token || !parsed.expireAt) return null;
    if (parsed.expireAt <= Date.now()) {
      clearSession();
      return null;
    }
    return parsed;
  } catch {
    clearSession();
    return null;
  }
}

export function saveSession(session: AdminSessionState): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}
