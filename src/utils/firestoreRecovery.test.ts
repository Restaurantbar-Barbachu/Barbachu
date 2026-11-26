import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_RECOVERY_WINDOW_MS,
  buildFirestoreIndexedDbNames,
  evaluateRecoveryAction,
  extractErrorMessage,
  isFirestoreInternalAssertionError,
  isFirestorePermissionError,
} from './firestoreRecovery';

test('isFirestoreInternalAssertionError detects raw SDK b7de/b815 and JSON-wrapped errors', () => {
  assert.equal(
    isFirestoreInternalAssertionError(
      new Error('FIRESTORE (13.4.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b7de) CONTEXT: {"batchId":2378}')
    ),
    true
  );
  assert.equal(
    isFirestoreInternalAssertionError(
      'FIRESTORE (13.4.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)'
    ),
    true
  );
  assert.equal(
    isFirestoreInternalAssertionError(
      new Error(
        JSON.stringify({
          error: 'FIRESTORE (13.4.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)',
          operationType: 'list',
          path: 'orders',
        })
      )
    ),
    true
  );
  assert.equal(
    isFirestoreInternalAssertionError(new Error('Missing or insufficient permissions.')),
    false
  );
  assert.equal(
    isFirestoreInternalAssertionError(new Error('Failed to get document because the client is offline.')),
    false
  );
});

test('isFirestorePermissionError detects permission errors and ignores internal assertions', () => {
  assert.equal(isFirestorePermissionError(new Error('Missing or insufficient permissions.')), true);
  assert.equal(
    isFirestorePermissionError(
      new Error(JSON.stringify({ error: 'permission-denied', operationType: 'get', path: 'orders' }))
    ),
    true
  );
  assert.equal(
    isFirestorePermissionError(
      new Error('FIRESTORE (13.4.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b7de)')
    ),
    false
  );
});

test('extractErrorMessage unwraps JSON FirestoreErrorInfo cleanly', () => {
  const msg = extractErrorMessage(
    new Error(JSON.stringify({ error: 'inner failure', operationType: 'write', path: 'orders/1' }))
  );
  assert.equal(msg, 'inner failure');
});

test('buildFirestoreIndexedDbNames returns named and default database keys', () => {
  assert.deepEqual(
    buildFirestoreIndexedDbNames('friendly-object-glvvl', 'ai-studio-barbachu-123'),
    [
      'firestore/[DEFAULT]/friendly-object-glvvl.ai-studio-barbachu-123/main',
      'firestore/[DEFAULT]/friendly-object-glvvl/main',
    ]
  );
  assert.deepEqual(buildFirestoreIndexedDbNames('friendly-object-glvvl', '(default)'), [
    'firestore/[DEFAULT]/friendly-object-glvvl/main',
  ]);
  assert.deepEqual(buildFirestoreIndexedDbNames(''), []);
});

test('evaluateRecoveryAction prevents infinite reload loops by falling back to memory mode', () => {
  const t0 = 1_700_000_000_000;
  assert.equal(
    evaluateRecoveryAction({ lastAutoReloadAt: null, now: t0, persistenceMode: 'persistent' }),
    'reload_clean_idb'
  );
  assert.equal(
    evaluateRecoveryAction({
      lastAutoReloadAt: t0 - 5_000,
      now: t0,
      persistenceMode: 'persistent',
    }),
    'fallback_memory'
  );
  assert.equal(
    evaluateRecoveryAction({
      lastAutoReloadAt: t0 - AUTO_RECOVERY_WINDOW_MS - 1,
      now: t0,
      persistenceMode: 'persistent',
    }),
    'reload_clean_idb'
  );
  assert.equal(
    evaluateRecoveryAction({
      lastAutoReloadAt: t0 - 1_000,
      now: t0,
      persistenceMode: 'memory',
    }),
    'manual_prompt'
  );
});
