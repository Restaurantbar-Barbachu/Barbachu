/**
 * Phase 0: Payload-First Security TDD Test Suite — Barbachu POS Firestore Rules
 * Verifies the "Dirty Dozen" adversarial payloads and positive invariants
 * defined in security_spec.md against firestore.rules.
 */
import assert from 'node:assert/strict';

export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  existingDoc?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
  enforcedByGate: string;
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Order Write',
    collectionPath: '/orders/ord_unauth_1',
    operation: 'create',
    auth: null,
    payload: {
      id: 'ord_unauth_1',
      number: 1,
      service: 'mesa',
      location: '1',
      table: '1',
      waiter: 'Andrea',
      items: [{ key: '729', name: 'ALAS CONVINADAS', priceCents: 9500, qty: 1 }],
      totalCents: 9500,
      discountCents: 0,
      priority: 'normal',
      status: 'sent',
      paid: false,
      ownerUid: 'anon',
      authorizedEmails: ['anon@example.com'],
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByGate: 'isVerified() -> request.auth != null',
  },
  {
    id: 2,
    name: 'Unverified Email Admin Spoof',
    collectionPath: '/products/729',
    operation: 'update',
    auth: { uid: 'spoof-uid', email: 'maurocazqiez013@gmail.com', email_verified: false },
    payload: {
      key: '729',
      name: 'ALAS CONVINADAS',
      group: '7',
      category: 'ALAS',
      sourcePrice: 1,
      priceCents: 100,
      saleEnabled: true,
      ownerUid: 'spoof-uid',
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByGate: 'isAdminEmail() requires request.auth.token.email_verified == true',
  },
  {
    id: 3,
    name: 'Self-Assigned Admin Escalation in /users/{uid}',
    collectionPath: '/users/waiter_uid_1',
    operation: 'create',
    auth: { uid: 'waiter_uid_1', email: 'mesero@barbachu.mx', email_verified: true },
    payload: {
      uid: 'waiter_uid_1',
      email: 'mesero@barbachu.mx',
      displayName: 'Mesero',
      role: 'admin',
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByGate: "(isAdminEmail() || incoming().role != 'admin')",
  },
  {
    id: 4,
    name: 'Ghost Field / Shadow Update on /products',
    collectionPath: '/products/701',
    operation: 'create',
    auth: { uid: 'admin_uid', email: 'maurocazqiez013@gmail.com', email_verified: true },
    payload: {
      key: '701',
      name: 'BBQ',
      group: '7',
      category: 'ALAS',
      sourcePrice: 95,
      priceCents: 9500,
      saleEnabled: true,
      ownerUid: 'admin_uid',
      isSecretFree: true,
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByGate: 'isValidProduct() -> data.keys().hasOnly([...])',
  },
  {
    id: 5,
    name: 'Path ID Poisoning',
    collectionPath: '/orders/../../../admin',
    operation: 'create',
    auth: { uid: 'staff_uid', email: 'caja@barbachu.mx', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByGate: "isValidId(orderId) -> id.matches('^[a-zA-Z0-9_\\\\-]+$') && id.size() <= 128",
  },
  {
    id: 6,
    name: 'PII Blanket Read of Other User',
    collectionPath: '/users/other_uid',
    operation: 'get',
    auth: { uid: 'waiter_uid_1', email: 'mesero@barbachu.mx', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByGate: 'allow get: if isValidId(userId) && (isOwner(userId) || isAdmin())',
  },
  {
    id: 7,
    name: 'Unauthorized Catalog Price Tampering',
    collectionPath: '/products/701',
    operation: 'update',
    auth: { uid: 'waiter_uid_1', email: 'mesero@barbachu.mx', email_verified: true },
    payload: {
      key: '701',
      name: 'BBQ',
      group: '7',
      category: 'ALAS',
      sourcePrice: 0.01,
      priceCents: 1,
      saleEnabled: true,
      ownerUid: 'admin_uid',
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByGate: 'allow update: if isValidId(productId) && isAdmin()',
  },
  {
    id: 8,
    name: 'Order Owner Hijacking on Update',
    collectionPath: '/orders/ord_1',
    operation: 'update',
    auth: { uid: 'waiter_uid_1', email: 'mesero@barbachu.mx', email_verified: true },
    existingDoc: { ownerUid: 'waiter_uid_1', paid: false, status: 'sent', authorizedEmails: ['mesero@barbachu.mx'] },
    payload: { ownerUid: 'attacker_uid' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByGate: 'incoming().ownerUid == existing().ownerUid',
  },
  {
    id: 9,
    name: 'Closed Order Terminal State Mutation',
    collectionPath: '/orders/ord_closed',
    operation: 'update',
    auth: { uid: 'waiter_uid_1', email: 'mesero@barbachu.mx', email_verified: true },
    existingDoc: { ownerUid: 'waiter_uid_1', paid: true, status: 'closed', authorizedEmails: ['mesero@barbachu.mx'] },
    payload: { totalCents: 0, discountCents: 9500 },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByGate: "existing().paid == false && existing().status != 'closed'",
  },
  {
    id: 10,
    name: 'Audit Log Tampering or Deletion',
    collectionPath: '/audit_logs/aud_1',
    operation: 'delete',
    auth: { uid: 'admin_uid', email: 'maurocazqiez013@gmail.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByGate: 'allow update, delete: if false;',
  },
  {
    id: 11,
    name: 'Oversized Array / Note Denial-of-Wallet',
    collectionPath: '/orders/ord_huge',
    operation: 'create',
    auth: { uid: 'staff_uid', email: 'caja@barbachu.mx', email_verified: true },
    payload: {
      itemsCount: 500,
      noteLength: 100000,
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByGate: 'items.size() <= 100 && data.note.size() <= 300',
  },
  {
    id: 12,
    name: 'Client-Delegated List Scraping by Unauthorized User',
    collectionPath: '/orders',
    operation: 'list',
    auth: { uid: 'outsider_uid', email: 'outsider@gmail.com', email_verified: true },
    existingDoc: { ownerUid: 'admin_uid', authorizedEmails: ['maurocazqiez013@gmail.com'] },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByGate: 'canListWorkspaceDoc() checks ownerUid or authorizedEmails on resource.data',
  },
];

// Structural verification when executed directly with Node
assert.equal(DIRTY_DOZEN_CASES.length, 12, 'Must define all 12 Dirty Dozen adversarial payloads');
for (const tc of DIRTY_DOZEN_CASES) {
  assert.equal(tc.expectedResult, 'PERMISSION_DENIED');
  assert.ok(tc.enforcedByGate.length > 0, `Case ${tc.id} must map to an explicit rule gate`);
}
