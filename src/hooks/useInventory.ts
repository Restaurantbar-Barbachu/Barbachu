import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { uid } from '../core';
import { fsSaveInventoryMovement } from '../lib/firestoreSync';
import type { AuditLogEntry, FullPosState, InventoryItem } from '../types';

export interface InventoryModalState {
  clave: number;
  descripcion: string;
  type: 'entrada' | 'ajuste' | 'merma' | 'minStock';
}

export interface PendingMermaAuthState {
  clave: number;
  descripcion: string;
  type: 'merma' | 'ajuste';
  qtyNum: number;
  costNum: number;
  reasonText: string;
}

interface UseInventoryParams {
  state: FullPosState;
  setState: React.Dispatch<React.SetStateAction<FullPosState>>;
  firebaseUser: User | null;
  isFirebaseAdmin: boolean;
  authorizedEmails: string[];
  notify: (msg: string) => void;
}

function formatInventoryError(err: unknown, fallback = 'Sin permisos'): string {
  const raw = err instanceof Error ? err.message : fallback;
  return raw.replace(/^(ITEM_EXISTS|ITEM_NOT_FOUND):/, '');
}

export function useInventory({
  state,
  setState,
  firebaseUser,
  isFirebaseAdmin,
  authorizedEmails,
  notify,
}: UseInventoryParams) {
  const [inventoryModal, setInventoryModal] = useState<InventoryModalState | null>(null);
  const [invQty, setInvQty] = useState<string>('');
  const [invCost, setInvCost] = useState<string>('');
  const [invReason, setInvReason] = useState<string>('');
  const [pendingInvMermaAuth, setPendingInvMermaAuth] = useState<PendingMermaAuthState | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  const lowStockItems = useMemo(() => {
    return Object.values(state.inventory).filter(
      (item) => item.minStock > 0 && item.stock <= item.minStock
    );
  }, [state.inventory]);

  const commitInlineInventoryMovement = useCallback(
    (
      payload: {
        clave: number;
        descripcion: string;
        type: 'entrada' | 'ajuste' | 'merma';
        qtyNum: number;
        costNum: number;
        reasonText: string;
      },
      authorizingAdminName?: string
    ) => {
      const latest = stateRef.current;
      const now = new Date().toISOString();
      const currentItem = latest.inventory[payload.clave] || {
        clave: payload.clave,
        descripcion: payload.descripcion,
        unidad: 'PZA',
        categoria: 'GENERAL',
        costo: payload.costNum,
        stock: 0,
        minStock: 5,
      };

      let newStock = currentItem.stock;
      if (payload.type === 'entrada') {
        newStock += payload.qtyNum;
      } else if (payload.type === 'merma') {
        newStock = Math.max(0, currentItem.stock - payload.qtyNum);
      } else {
        newStock = payload.qtyNum;
      }

      const updatedItem: InventoryItem = {
        ...currentItem,
        stock: Math.max(0, newStock),
        costo: payload.costNum > 0 ? payload.costNum : currentItem.costo,
      };

      const baseReason =
        payload.reasonText.trim() ||
        (payload.type === 'merma' ? 'Merma / Desperdicio' : 'Ajuste operativo');
      const finalReason = authorizingAdminName
        ? `${baseReason} (Autorizado por Admin: ${authorizingAdminName})`
        : baseReason;

      const mov = {
        id: uid(),
        at: now,
        clave: payload.clave,
        descripcion: payload.descripcion,
        type: payload.type,
        qty: payload.qtyNum,
        costUnit: payload.costNum > 0 ? payload.costNum : currentItem.costo,
        reason: finalReason,
        user: latest.activeUser.name,
      };

      const auditEntry: AuditLogEntry = {
        id: uid(),
        at: now,
        user: latest.activeUser.name,
        action: `Inventario: ${payload.type.toUpperCase()}`,
        detail: `${payload.descripcion} (${currentItem.unidad}) · ${
          payload.type === 'entrada'
            ? `+${payload.qtyNum}`
            : payload.type === 'merma'
            ? `-${payload.qtyNum} (Merma)`
            : `fijado a ${payload.qtyNum}`
        } · Nuevo stock: ${updatedItem.stock}${
          authorizingAdminName ? ` · Autorizó: ${authorizingAdminName}` : ''
        }`,
        reason: finalReason,
      };

      setState((prev) => ({
        ...prev,
        inventory: {
          ...prev.inventory,
          [payload.clave]: updatedItem,
        },
        inventoryMovements: [...prev.inventoryMovements, mov],
        audit: [...prev.audit, auditEntry],
      }));

      if (firebaseUser) {
        const costChanged =
          isFirebaseAdmin && payload.costNum > 0 && payload.costNum !== currentItem.costo;
        void fsSaveInventoryMovement(updatedItem, mov, firebaseUser, authorizedEmails, auditEntry, {
          updateCost: costChanged,
        })
          .then((committedStock) => {
            setState((prev) => {
              const target = prev.inventory[payload.clave];
              if (!target || target.stock === committedStock) return prev;
              return {
                ...prev,
                inventory: {
                  ...prev.inventory,
                  [payload.clave]: { ...target, stock: committedStock },
                },
              };
            });
          })
          .catch((err) => {
            notify(`Error guardando inventario en Firestore: ${formatInventoryError(err)}`);
          });
      }

      setInventoryModal(null);
      setInvQty('');
      setInvCost('');
      setInvReason('');
      notify(
        `Inventario actualizado: ${payload.descripcion} ahora tiene ${updatedItem.stock} ${updatedItem.unidad}.`
      );
    },
    [authorizedEmails, firebaseUser, isFirebaseAdmin, notify, setState]
  );

  const handleSaveInventoryMovement = useCallback(() => {
    if (!inventoryModal) return;
    const latest = stateRef.current;
    const qtyNum = Number(invQty);
    const costNum = Number(invCost) || 0;
    const now = new Date().toISOString();

    const currentItem = latest.inventory[inventoryModal.clave] || {
      clave: inventoryModal.clave,
      descripcion: inventoryModal.descripcion,
      unidad: 'PZA',
      categoria: 'GENERAL',
      costo: costNum,
      stock: 0,
      minStock: 5,
    };

    if (inventoryModal.type === 'minStock') {
      if (!Number.isFinite(qtyNum) || qtyNum < 0) {
        notify('Ingresa un umbral de stock mínimo válido.');
        return;
      }
      const updatedItem: InventoryItem = {
        ...currentItem,
        minStock: qtyNum,
      };
      const auditEntry: AuditLogEntry = {
        id: uid(),
        at: now,
        user: latest.activeUser.name,
        action: 'Alerta de inventario modificada',
        detail: `${inventoryModal.descripcion}: umbral mínimo fijado a ${qtyNum} ${currentItem.unidad}`,
      };
      setState((prev) => ({
        ...prev,
        inventory: {
          ...prev.inventory,
          [inventoryModal.clave]: updatedItem,
        },
        audit: [...prev.audit, auditEntry],
      }));
      if (firebaseUser) {
        void fsSaveInventoryMovement(updatedItem, null, firebaseUser, authorizedEmails, auditEntry).catch(
          (err) => {
            notify(`Error actualizando umbral en Firestore: ${formatInventoryError(err)}`);
          }
        );
      }
      setInventoryModal(null);
      setInvQty('');
      notify(`Umbral de alerta actualizado a ${qtyNum} ${currentItem.unidad}.`);
      return;
    }

    if (
      !Number.isFinite(qtyNum) ||
      (inventoryModal.type === 'ajuste' ? qtyNum < 0 : qtyNum <= 0)
    ) {
      notify(
        inventoryModal.type === 'ajuste'
          ? 'Ingresa un conteo válido (0 o mayor).'
          : 'Ingresa una cantidad mayor a 0.'
      );
      return;
    }

    if (
      (inventoryModal.type === 'merma' || inventoryModal.type === 'ajuste') &&
      latest.activeUser.role !== 'admin'
    ) {
      setPendingInvMermaAuth({
        clave: inventoryModal.clave,
        descripcion: inventoryModal.descripcion,
        type: inventoryModal.type,
        qtyNum,
        costNum,
        reasonText: invReason.trim(),
      });
      return;
    }

    commitInlineInventoryMovement(
      {
        clave: inventoryModal.clave,
        descripcion: inventoryModal.descripcion,
        type: inventoryModal.type,
        qtyNum,
        costNum,
        reasonText: invReason.trim(),
      },
      inventoryModal.type === 'merma' || inventoryModal.type === 'ajuste'
        ? latest.activeUser.name
        : undefined
    );
  }, [
    authorizedEmails,
    commitInlineInventoryMovement,
    firebaseUser,
    invCost,
    invQty,
    invReason,
    inventoryModal,
    notify,
    setState,
  ]);

  return {
    lowStockItems,
    inventoryModal,
    setInventoryModal,
    invQty,
    setInvQty,
    invCost,
    setInvCost,
    invReason,
    setInvReason,
    pendingInvMermaAuth,
    setPendingInvMermaAuth,
    commitInlineInventoryMovement,
    handleSaveInventoryMovement,
  };
}
