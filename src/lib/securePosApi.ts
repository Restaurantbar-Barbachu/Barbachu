import type { User } from 'firebase/auth';
import { locationLabel } from '../core';
import {
  fsCancelOrder,
  fsMergeOrders,
  fsRecordAudit,
  fsSaveOrder,
  fsSplitOrder,
  fsUpdateOrder,
} from './firestoreSync';
import type { AuditLogEntry, Order } from '../types';

export type SecurePosStatus = 'idle' | 'pending' | 'confirmed' | 'error';

export type SecurePosOperation =
  | 'save_order'
  | 'update_order'
  | 'split_order'
  | 'merge_orders'
  | 'cancel_order'
  | 'record_audit';

export type ToastVariant = 'confirmed' | 'info' | 'pending' | 'error';

export interface OrderToastEvent {
  id: string;
  variant: ToastVariant;
  title: string;
  detail?: string;
  operation?: SecurePosOperation;
  orderNumber?: number;
  confirmedAt?: string;
}

export interface SecurePosState {
  status: SecurePosStatus;
  operation: SecurePosOperation | null;
  error: string | null;
  confirmedAt: string | null;
  lastOrderNumber: number | null;
}

export interface SecurePosResult<T = void> {
  status: 'confirmed' | 'error';
  data?: T;
  error?: string;
  confirmedAt?: string;
  toast?: OrderToastEvent;
}

export interface SecurePosMutationOptions {
  firebaseUser: User | null;
  authorizedEmails: string[];
  isOnline?: boolean;
  onStatusChange?: (next: SecurePosState) => void;
  onConfirmedToast?: (toast: OrderToastEvent) => void;
}

export function createInitialSecurePosState(): SecurePosState {
  return {
    status: 'idle',
    operation: null,
    error: null,
    confirmedAt: null,
    lastOrderNumber: null,
  };
}

export function transitionSecurePosPending(
  operation: SecurePosOperation
): SecurePosState {
  return {
    status: 'pending',
    operation,
    error: null,
    confirmedAt: null,
    lastOrderNumber: null,
  };
}

export function transitionSecurePosConfirmed(
  operation: SecurePosOperation,
  confirmedAt: string,
  orderNumber?: number
): SecurePosState {
  return {
    status: 'confirmed',
    operation,
    error: null,
    confirmedAt,
    lastOrderNumber: typeof orderNumber === 'number' ? orderNumber : null,
  };
}

export function transitionSecurePosError(
  operation: SecurePosOperation,
  errorMessage: string
): SecurePosState {
  return {
    status: 'error',
    operation,
    error: errorMessage,
    confirmedAt: null,
    lastOrderNumber: null,
  };
}

export function formatSecurePosError(
  err: unknown,
  fallback = 'No se pudo completar la transacción en el servidor.'
): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : fallback;
  const cleaned = raw
    .replace(
      /^(ORDER_CLOSED|ALREADY_PAID|SHIFT_CLOSED|SHIFT_ALREADY_CLOSED|SHIFT_ALREADY_OPEN|SHIFT_NOT_FOUND|INSUFFICIENT_CASH|ITEM_EXISTS|ITEM_NOT_FOUND):/,
      ''
    )
    .trim();
  return cleaned || fallback;
}

export function createOrderConfirmationToast(params: {
  operation: SecurePosOperation;
  order?: Pick<Order, 'number' | 'service' | 'location' | 'totalCents'>;
  assignedNumber?: number;
  isNewOrder?: boolean;
  customTitle?: string;
  customDetail?: string;
  confirmedAt?: string;
}): OrderToastEvent {
  const confirmedAt = params.confirmedAt || new Date().toISOString();
  const orderNumber = params.assignedNumber ?? params.order?.number;
  const loc = params.order
    ? locationLabel(params.order.service, params.order.location)
    : undefined;
  const id = `${params.operation}-${orderNumber ?? 'audit'}-${Date.now()}`;

  if (params.customTitle) {
    return {
      id,
      variant: 'confirmed',
      title: params.customTitle,
      detail: params.customDetail ?? (loc && orderNumber ? `Cuenta #${orderNumber} · ${loc}` : undefined),
      operation: params.operation,
      orderNumber,
      confirmedAt,
    };
  }

  switch (params.operation) {
    case 'save_order':
      return {
        id,
        variant: 'confirmed',
        title: params.isNewOrder
          ? `Pedido #${orderNumber ?? ''} confirmado`.trim()
          : `Comanda #${orderNumber ?? ''} actualizada`.trim(),
        detail: loc ? `Enviado a cocina/barra · ${loc}` : 'Sincronizado en Firestore',
        operation: params.operation,
        orderNumber,
        confirmedAt,
      };
    case 'update_order':
      return {
        id,
        variant: 'confirmed',
        title: `Comanda #${orderNumber ?? ''} confirmada`.trim(),
        detail: loc ? `Cambio guardado · ${loc}` : 'Sincronizado en Firestore',
        operation: params.operation,
        orderNumber,
        confirmedAt,
      };
    case 'split_order':
      return {
        id,
        variant: 'confirmed',
        title: `Cuenta dividida (#${orderNumber ?? ''})`.trim(),
        detail: loc ? `Nueva cuenta en ${loc}` : 'Transacción confirmada',
        operation: params.operation,
        orderNumber,
        confirmedAt,
      };
    case 'merge_orders':
      return {
        id,
        variant: 'confirmed',
        title: `Cuentas unidas en #${orderNumber ?? ''}`.trim(),
        detail: loc ? `Consolidado en ${loc}` : 'Transacción confirmada',
        operation: params.operation,
        orderNumber,
        confirmedAt,
      };
    case 'cancel_order':
      return {
        id,
        variant: 'confirmed',
        title: `Cuenta #${orderNumber ?? ''} cancelada`.trim(),
        detail: 'Registrado en bitácora de auditoría',
        operation: params.operation,
        orderNumber,
        confirmedAt,
      };
    case 'record_audit':
    default:
      return {
        id,
        variant: 'confirmed',
        title: 'Registro confirmado en bitácora',
        detail: 'Sincronizado en Firestore',
        operation: params.operation,
        orderNumber,
        confirmedAt,
      };
  }
}

async function runSecureTransaction<T>(
  operation: SecurePosOperation,
  options: SecurePosMutationOptions,
  executor: () => Promise<T>,
  buildToast: (data: T, confirmedAt: string) => OrderToastEvent,
  resolveOrderNumber?: (data: T) => number | undefined
): Promise<SecurePosResult<T>> {
  const { firebaseUser, onStatusChange, onConfirmedToast } = options;

  onStatusChange?.(transitionSecurePosPending(operation));

  try {
    if (!firebaseUser) {
      throw new Error('Se requiere sesión autenticada en Firestore para confirmar la operación.');
    }

    const data = await executor();
    const confirmedAt = new Date().toISOString();
    const orderNum = resolveOrderNumber ? resolveOrderNumber(data) : undefined;
    const toast = buildToast(data, confirmedAt);

    onStatusChange?.(transitionSecurePosConfirmed(operation, confirmedAt, orderNum));
    onConfirmedToast?.(toast);

    return {
      status: 'confirmed',
      data,
      confirmedAt,
      toast,
    };
  } catch (err) {
    const message = formatSecurePosError(err);
    onStatusChange?.(transitionSecurePosError(operation, message));
    return {
      status: 'error',
      error: message,
    };
  }
}

export const securePosApi = {
  saveOrder(
    order: Order,
    isNewOrder: boolean,
    auditEntry: AuditLogEntry,
    options: SecurePosMutationOptions,
    toastOverride?: { title?: string; detail?: string }
  ): Promise<SecurePosResult<number>> {
    return runSecureTransaction(
      'save_order',
      options,
      () =>
        fsSaveOrder(
          order,
          isNewOrder,
          options.firebaseUser!,
          options.authorizedEmails,
          auditEntry
        ),
      (assignedNumber, confirmedAt) =>
        createOrderConfirmationToast({
          operation: 'save_order',
          order,
          assignedNumber,
          isNewOrder,
          customTitle: toastOverride?.title,
          customDetail: toastOverride?.detail,
          confirmedAt,
        }),
      (assignedNumber) => assignedNumber
    );
  },

  updateOrder(
    order: Order,
    auditEntry: AuditLogEntry,
    options: SecurePosMutationOptions,
    toastOverride?: { title?: string; detail?: string }
  ): Promise<SecurePosResult<void>> {
    return runSecureTransaction(
      'update_order',
      options,
      () =>
        fsUpdateOrder(
          order,
          options.firebaseUser!,
          options.authorizedEmails,
          auditEntry
        ),
      (_data, confirmedAt) =>
        createOrderConfirmationToast({
          operation: 'update_order',
          order,
          customTitle: toastOverride?.title,
          customDetail: toastOverride?.detail,
          confirmedAt,
        }),
      () => order.number
    );
  },

  splitOrder(
    originalOrder: Order,
    splitOrder: Order,
    auditEntry: AuditLogEntry,
    options: SecurePosMutationOptions,
    toastOverride?: { title?: string; detail?: string }
  ): Promise<SecurePosResult<number>> {
    return runSecureTransaction(
      'split_order',
      options,
      () =>
        fsSplitOrder(
          originalOrder,
          splitOrder,
          options.firebaseUser!,
          options.authorizedEmails,
          auditEntry
        ),
      (assignedNumber, confirmedAt) =>
        createOrderConfirmationToast({
          operation: 'split_order',
          order: splitOrder,
          assignedNumber,
          customTitle: toastOverride?.title,
          customDetail: toastOverride?.detail,
          confirmedAt,
        }),
      (assignedNumber) => assignedNumber
    );
  },

  mergeOrders(
    targetOrder: Order,
    sourceOrderId: string,
    auditEntry: AuditLogEntry,
    options: SecurePosMutationOptions,
    toastOverride?: { title?: string; detail?: string }
  ): Promise<SecurePosResult<void>> {
    return runSecureTransaction(
      'merge_orders',
      options,
      () =>
        fsMergeOrders(
          targetOrder,
          sourceOrderId,
          options.firebaseUser!,
          options.authorizedEmails,
          auditEntry
        ),
      (_data, confirmedAt) =>
        createOrderConfirmationToast({
          operation: 'merge_orders',
          order: targetOrder,
          customTitle: toastOverride?.title,
          customDetail: toastOverride?.detail,
          confirmedAt,
        }),
      () => targetOrder.number
    );
  },

  cancelOrder(
    order: Order,
    isAdmin: boolean,
    auditEntry: AuditLogEntry,
    options: SecurePosMutationOptions,
    toastOverride?: { title?: string; detail?: string }
  ): Promise<SecurePosResult<void>> {
    return runSecureTransaction(
      'cancel_order',
      options,
      () =>
        fsCancelOrder(
          order,
          isAdmin,
          options.firebaseUser!,
          options.authorizedEmails,
          auditEntry
        ),
      (_data, confirmedAt) =>
        createOrderConfirmationToast({
          operation: 'cancel_order',
          order,
          customTitle: toastOverride?.title,
          customDetail: toastOverride?.detail,
          confirmedAt,
        }),
      () => order.number
    );
  },

  recordAudit(
    auditEntry: AuditLogEntry,
    options: SecurePosMutationOptions,
    toastOverride?: { title?: string; detail?: string }
  ): Promise<SecurePosResult<void>> {
    return runSecureTransaction(
      'record_audit',
      options,
      () =>
        fsRecordAudit(
          auditEntry,
          options.firebaseUser!,
          options.authorizedEmails
        ),
      (_data, confirmedAt) =>
        createOrderConfirmationToast({
          operation: 'record_audit',
          customTitle: toastOverride?.title,
          customDetail: toastOverride?.detail,
          confirmedAt,
        })
    );
  },
};
