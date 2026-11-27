import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  clearIndexedDbPersistence,
  doc,
  getDocFromServer,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentSingleTabManager,
  terminate,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  buildFirestoreIndexedDbNames,
  evaluateRecoveryAction,
  FIRESTORE_CACHE_MODE_KEY,
  FIRESTORE_LAST_RECOVERY_KEY,
  isFirestoreInternalAssertionError,
  type FirestoreCacheMode,
} from '../utils/firestoreRecovery';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'maurocazqiez013@gmail.com';
export const FIREBASE_CONFIG = firebaseConfig;

const app = initializeApp(firebaseConfig);

function readPersistedCacheMode(): FirestoreCacheMode {
  if (typeof window === 'undefined') return 'persistent';
  try {
    return window.sessionStorage.getItem(FIRESTORE_CACHE_MODE_KEY) === 'memory'
      ? 'memory'
      : 'persistent';
  } catch {
    return 'persistent';
  }
}

const configuredDatabaseId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-barbachu-d5d9c18a-3e30-4f57-83ae-eb37592edf0c';

let activeCacheMode: FirestoreCacheMode = readPersistedCacheMode();

function createResilientFirestore(): Firestore {
  if (activeCacheMode === 'memory') {
    return initializeFirestore(
      app,
      { localCache: memoryLocalCache() },
      configuredDatabaseId
    );
  }
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentSingleTabManager({ forceOwnership: true }),
        }),
      },
      configuredDatabaseId
    );
  } catch (err) {
    console.warn('Persistent Firestore cache unavailable; falling back to memory cache.', err);
    activeCacheMode = 'memory';
    return initializeFirestore(
      app,
      { localCache: memoryLocalCache() },
      configuredDatabaseId
    );
  }
}

// CRITICAL: Configure Firestore with named database ID and resilient offline persistence
export const db = createResilientFirestore();

function deleteIndexedDbByName(dbName: string): Promise<void> {
  if (typeof window === 'undefined' || !('indexedDB' in window) || !dbName) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    const timer = window.setTimeout(done, 700);
    try {
      const req = window.indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => {
        window.clearTimeout(timer);
        done();
      };
      req.onerror = () => {
        window.clearTimeout(timer);
        done();
      };
      req.onblocked = () => {
        window.clearTimeout(timer);
        done();
      };
    } catch {
      window.clearTimeout(timer);
      done();
    }
  });
}

function clearFirestoreWebStorageKeys(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const store of [window.localStorage, window.sessionStorage]) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (
          key &&
          key !== FIRESTORE_CACHE_MODE_KEY &&
          key !== FIRESTORE_LAST_RECOVERY_KEY &&
          (/^firestore[_/]/i.test(key) || key.startsWith('firebase:persistence:'))
        ) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        store.removeItem(key);
      }
    }
  } catch {
    // Ignore storage access errors in restricted contexts
  }
}

export async function purgeFirestorePersistenceCache(options?: { forceMemoryMode?: boolean }): Promise<void> {
  if (options?.forceMemoryMode && typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(FIRESTORE_CACHE_MODE_KEY, 'memory');
    } catch {
      // Ignore storage errors
    }
  }

  // Terminate with short timeout so a wedged AsyncQueue never hangs recovery
  await Promise.race([
    (async () => {
      try {
        await terminate(db);
        await clearIndexedDbPersistence(db);
      } catch {
        // Ignore if already terminated or failed
      }
    })(),
    new Promise<void>((resolve) => {
      if (typeof window !== 'undefined') {
        window.setTimeout(resolve, 800);
      } else {
        resolve();
      }
    }),
  ]);

  const dbNames = new Set<string>(
    buildFirestoreIndexedDbNames(firebaseConfig.projectId, configuredDatabaseId)
  );
  if (typeof window !== 'undefined' && typeof window.indexedDB?.databases === 'function') {
    try {
      const existing = await Promise.race([
        window.indexedDB.databases(),
        new Promise<IDBDatabaseInfo[]>((resolve) => window.setTimeout(() => resolve([]), 500)),
      ]);
      for (const info of existing) {
        if (info.name && /^firestore/i.test(info.name)) {
          dbNames.add(info.name);
        }
      }
    } catch {
      // Ignore if databases() enumerator is restricted
    }
  }

  await Promise.all(Array.from(dbNames).map((name) => deleteIndexedDbByName(name)));
  clearFirestoreWebStorageKeys();
}

let recoveryInFlight = false;

export async function recoverFromFirestoreInternalError(error: unknown): Promise<boolean> {
  if (typeof window === 'undefined' || !isFirestoreInternalAssertionError(error)) {
    return false;
  }
  if (recoveryInFlight) return true;
  recoveryInFlight = true;

  try {
    let lastRaw: string | null = null;
    try {
      lastRaw = window.sessionStorage.getItem(FIRESTORE_LAST_RECOVERY_KEY);
    } catch {
      lastRaw = null;
    }
    const lastAutoReloadAt = lastRaw ? Number(lastRaw) : null;
    const now = Date.now();
    const action = evaluateRecoveryAction({
      lastAutoReloadAt: Number.isFinite(lastAutoReloadAt) ? lastAutoReloadAt : null,
      now,
      persistenceMode: activeCacheMode,
    });

    if (action === 'manual_prompt') {
      await purgeFirestorePersistenceCache({ forceMemoryMode: true });
      return false;
    }

    try {
      window.sessionStorage.setItem(FIRESTORE_LAST_RECOVERY_KEY, String(now));
      if (action === 'fallback_memory') {
        window.sessionStorage.setItem(FIRESTORE_CACHE_MODE_KEY, 'memory');
      }
    } catch {
      // Ignore sessionStorage failures
    }

    await purgeFirestorePersistenceCache({
      forceMemoryMode: action === 'fallback_memory',
    });
    window.location.reload();
    return true;
  } catch {
    recoveryInFlight = false;
    return false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const candidate = event.error ?? event.message;
    if (isFirestoreInternalAssertionError(candidate)) {
      event.preventDefault();
      void recoverFromFirestoreInternalError(candidate);
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (isFirestoreInternalAssertionError(event.reason)) {
      event.preventDefault();
      void recoverFromFirestoreInternalError(event.reason);
    }
  });
}

export const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.activity',
  'https://www.googleapis.com/auth/drive.activity.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.apps.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.install',
  'https://www.googleapis.com/auth/drive.meet.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.photos.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.scripts',
] as const;

export const googleProvider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  googleProvider.addScope(scope);
}
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Strictly in-memory OAuth access token cache (never stored in localStorage/sessionStorage)
let cachedDriveAccessToken: string | null = null;
const driveTokenSubscribers = new Set<(token: string | null) => void>();

function setCachedDriveAccessToken(token: string | null): void {
  cachedDriveAccessToken = token;
  for (const listener of driveTokenSubscribers) {
    listener(token);
  }
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    setCachedDriveAccessToken(null);
  }
});

export function getDriveAccessToken(): string | null {
  return cachedDriveAccessToken;
}

export function clearDriveAccessToken(): void {
  setCachedDriveAccessToken(null);
}

export function subscribeDriveAccessToken(listener: (token: string | null) => void): () => void {
  driveTokenSubscribers.add(listener);
  listener(cachedDriveAccessToken);
  return () => {
    driveTokenSubscribers.delete(listener);
  };
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  if (isFirestoreInternalAssertionError(error)) {
    void recoverFromFirestoreInternalError(error);
  }
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  if (!auth.currentUser) return true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Client is offline; running in offline cache mode.');
      return false;
    }
    return true;
  }
}

export async function measureCloudLatencyMs(): Promise<number | null> {
  if (!auth.currentUser || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return null;
  }
  const start = performance.now();
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return Math.max(1, Math.round(performance.now() - start));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      return null;
    }
    // Permission-denied or missing doc still confirms server round-trip completed
    return Math.max(1, Math.round(performance.now() - start));
  }
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) {
    setCachedDriveAccessToken(credential.accessToken);
  }
  return result.user;
}

export async function connectGoogleDriveWithPopup(): Promise<{ user: User; accessToken: string }> {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('No se recibió el token de acceso de Google Drive. Intenta autorizar de nuevo.');
  }
  setCachedDriveAccessToken(credential.accessToken);
  return { user: result.user, accessToken: credential.accessToken };
}

export async function signOutFirebase(): Promise<void> {
  setCachedDriveAccessToken(null);
  await signOut(auth);
}
