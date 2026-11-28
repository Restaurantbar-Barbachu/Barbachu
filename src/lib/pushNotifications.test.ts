import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNewOrderNotificationPayload,
  detectNewlyArrivedOrders,
} from './pushNotifications';
import type { Order } from '../types';

const baseOrder: Order = {
  id: 'ord-100',
  number: 42,
  service: 'mesa',
  location: '5',
  table: '5',
  waiter: 'Luis',
  note: '',
  customer: {
    name: 'Sofía Ramírez',
    phone: '',
    address: '',
    reference: '',
  },
  items: [
    {
      key: '701',
      name: 'Orden de Birria',
      priceCents: 18500,
      qty: 2,
      note: '',
      station: 'cocina',
      itemStatus: 'pending',
    },
  ],
  totalCents: 37000,
  discountCents: 0,
  priority: 'normal',
  status: 'sent',
  paid: false,
  createdAt: '2026-11-28T16:00:00.000Z',
  updatedAt: '2026-11-28T16:00:00.000Z',
};

test('detectNewlyArrivedOrders returns only unseen active orders matching station filter', () => {
  const prev = new Set<string>(['ord-100']);
  const newKitchenOrder: Order = {
    ...baseOrder,
    id: 'ord-101',
    number: 43,
  };
  const newBarraOrder: Order = {
    ...baseOrder,
    id: 'ord-102',
    number: 44,
    items: [
      {
        key: '801',
        name: 'Cerveza',
        priceCents: 6000,
        qty: 3,
        note: '',
        station: 'barra',
        itemStatus: 'pending',
      },
    ],
  };
  const alreadyClosedOrder: Order = {
    ...baseOrder,
    id: 'ord-103',
    number: 45,
    paid: true,
    status: 'closed',
  };

  const allArrived = detectNewlyArrivedOrders(prev, [
    baseOrder,
    newKitchenOrder,
    newBarraOrder,
    alreadyClosedOrder,
  ]);
  assert.deepEqual(
    allArrived.map((o) => o.id),
    ['ord-101', 'ord-102']
  );

  const barraOnly = detectNewlyArrivedOrders(
    prev,
    [baseOrder, newKitchenOrder, newBarraOrder, alreadyClosedOrder],
    { stationFilter: 'barra' }
  );
  assert.deepEqual(
    barraOnly.map((o) => o.id),
    ['ord-102']
  );
});

test('buildNewOrderNotificationPayload formats order summary, priority, and target URL', () => {
  const payload = buildNewOrderNotificationPayload(
    {
      ...baseOrder,
      priority: 'alta',
    },
    'kitchen'
  );

  assert.match(payload.title, /URGENTE/);
  assert.match(payload.title, /#42/);
  assert.match(payload.title, /Mesa 5/);
  assert.match(payload.body, /2 art\./);
  assert.match(payload.body, /Mesero: Luis/);
  assert.match(payload.body, /Cliente: Sofía Ramírez/);
  assert.equal(payload.requireInteraction, true);
  assert.equal(
    payload.url,
    '/?view=pos&targetView=kitchen&orderId=ord-100'
  );
});
