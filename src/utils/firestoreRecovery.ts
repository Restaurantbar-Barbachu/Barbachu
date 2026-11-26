export type FirestoreCacheMode = 'persistent' | 'memory';

export type FirestoreRecoveryAction = 'reload_clean_idb' | 'fallback_memory' | 'manual_prompt';

export const FIRESTORE_CACHE_MODE_KEY = 'barbachu_fs_cache_mode';
export const FIRESTORE_LAST_RECOVERY_KEY = 'barbachu_fs_last_recovery_at';
export const AUTO_RECOVERY_WINDOW_MS = 60_000;

export function extractErrorMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    const raw = error.message || error.name || '';
    if (raw.startsWith('{') && raw.includes('"error"')) {
      try {
        const parsed = JSON.parse(raw) as { error?: unknown };
        if (typeof parsed.error === 'string' && parsed.error) {
          return parsed.error;
        }
      } catch {
        // Fall through to raw message
      }
    }
    return raw;
  }
  if (typeof error === 'object') {
    const record = error as { message?: unknown; reason?: unknown; error?: unknown };
    if (typeof record.message === 'string') return extractErrorMessage(new Error(record.message));
    if (typeof record.error === 'string') return record.error;
    if (record.reason !== undefined) return extractErrorMessage(record.reason);
  }
  return String(error);
}

export function isFirestoreInternalAssertionError(error: unknown): boolean {
  const msg = extractErrorMessage(error);
  if (!msg) return false;
  return (
    /INTERNAL ASSERTION FAILED/i.test(msg) ||
    /INTERNAL UNHANDLED ERROR/i.test(msg) ||
    (/FIRESTORE\s*\([^)]+\)/i.test(msg) && /Unexpected state/i.test(msg)) ||
    /\(ID:\s*(b7de|b815)\)/i.test(msg)
  );
}

export function isFirestorePermissionError(error: unknown): boolean {
  const msg = extractErrorMessage(error).toLowerCase();
  if (!msg) return false;
  return (
    msg.includes('missing or insufficient permissions') ||
    msg.includes('permission-denied') ||
    msg.includes('permission denied')
  );
}

export function buildFirestoreIndexedDbNames(projectId: string, databaseId?: string): string[] {
  const cleanProject = String(projectId || '').trim();
  const cleanDb = String(databaseId || '').trim();
  if (!cleanProject) return [];

  const names = new Set<string>();
  if (cleanDb && cleanDb !== '(default)') {
    names.add(`firestore/[DEFAULT]/${cleanProject}.${cleanDb}/main`);
  }
  names.add(`firestore/[DEFAULT]/${cleanProject}/main`);
  return Array.from(names);
}

export function evaluateRecoveryAction(params: {
  lastAutoReloadAt: number | null;
  now: number;
  persistenceMode: FirestoreCacheMode;
}): FirestoreRecoveryAction {
  const { lastAutoReloadAt, now, persistenceMode } = params;
  if (persistenceMode === 'memory') {
    return 'manual_prompt';
  }
  if (
    lastAutoReloadAt !== null &&
    Number.isFinite(lastAutoReloadAt) &&
    now - lastAutoReloadAt >= 0 &&
    now - lastAutoReloadAt < AUTO_RECOVERY_WINDOW_MS
  ) {
    return 'fallback_memory';
  }
  return 'reload_clean_idb';
}
