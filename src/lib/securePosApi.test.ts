import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialSecurePosState,
  createOrderConfirmationToast,
  formatSecurePosError,
  securePosApi,
  transitionSecurePosConfirmed,
  transitionSecurePosError,
  transitionSecurePosPending,
} from './securePosApi';

test('securePosApi state transitions cover idle -> pending -> confirmed -> error', () => {
  const initial = createInitialSecurePosState();
  assert.equal(initial.status, 'idle');
  assert.equal(initial.operation, null);
  assert.equal(initial.error, null);

  const pending = transitionSecurePosPending('save_order');
  assert.equal(pending.status, 'pending');
  assert.equal(pending.operation, 'save_order');
  assert.equal(pending.error, null);

  const confirmedAt = '2026-11-27T01:00:00.000Z';
  const confirmed = transitionSecurePosConfirmed('save_order', confirmedAt, 42);
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.operation, 'save_order');
  assert.equal(confirmed.confirmedAt, confirmedAt);
  assert.equal(confirmed.lastOrderNumber, 42);
  assert.equal(confirmed.error, null);

  const errored = transitionSecurePosError('update_order', 'Permisos insuficientes');
  assert.equal(errored.status, 'error');
  assert.equal(errored.operation, 'update_order');
  assert.equal(errored.error, 'Permisos insuficientes');
  assert.equal(errored.confirmedAt, null);
});

test('formatSecurePosError strips internal error code prefixes cleanly', () => {
  assert.equal(
    formatSecurePosError(new Error('ORDER_CLOSED:La cuenta ya fue cerrada.')),
    'La cuenta ya fue cerrada.'
  );
  assert.equal(
    formatSecurePosError(new Error('ALREADY_PAID:Cuenta ya cobrada.')),
    'Cuenta ya cobrada.'
  );
  assert.equal(formatSecurePosError(null, 'Fallback'), 'Fallback');
});

test('createOrderConfirmationToast builds user-friendly confirmation notifications', () => {
  const toast = createOrderConfirmationToast({
    operation: 'save_order',
    isNewOrder: true,
    assignedNumber: 18,
    order: {
      number: 17,
      service: 'mesa',
      location: '4',
      totalCents: 45000,
    },
    confirmedAt: '2026-11-27T01:00:00.000Z',
  });

  assert.equal(toast.variant, 'confirmed');
  assert.equal(toast.title, 'Pedido #18 confirmado');
  assert.match(toast.detail || '', /Mesa 4/);
  assert.equal(toast.orderNumber, 18);

  const splitToast = createOrderConfirmationToast({
    operation: 'split_order',
    assignedNumber: 19,
    order: {
      number: 19,
      service: 'barra_interior',
      location: '2',
      totalCents: 12000,
    },
  });
  assert.equal(splitToast.title, 'Cuenta dividida (#19)');
  assert.match(splitToast.detail || '', /Barra interior 2/);
});

test('securePosApi.saveOrder transitions pending -> error and suppresses confirmation toast when firebaseUser is missing', async () => {
  const statuses: string[] = [];
  const toasts: string[] = [];
  const res = await securePosApi.saveOrder(
    {
      id: 'ord-test',
      number: 1,
      service: 'mesa',
      location: '1',
      table: '1',
      waiter: 'Mesero',
      note: '',
      items: [],
      totalCents: 0,
      discountCents: 0,
      priority: 'normal',
      status: 'sent',
      paid: false,
      createdAt: '2026-11-27T00:00:00.000Z',
      updatedAt: '2026-11-27T00:00:00.000Z',
    },
    true,
    {
      id: 'aud-test',
      at: '2026-11-27T00:00:00.000Z',
      user: 'Mesero',
      action: 'Comanda creada',
      detail: 'Test',
    },
    {
      firebaseUser: null,
      authorizedEmails: [],
      onStatusChange: (s) => statuses.push(s.status),
      onConfirmedToast: (t) => toasts.push(t.title),
    }
  );

  assert.equal(res.status, 'error');
  assert.deepEqual(statuses, ['pending', 'error']);
  assert.deepEqual(toasts, []);
  assert.ok(res.error);
});
