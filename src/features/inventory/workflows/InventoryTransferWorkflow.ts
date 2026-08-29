import { BusinessWorkflow, WorkflowContext } from '@/core/workflow';
import { db } from '@/core/db';
import { TransferStatus } from '@/types';
import { ProjectionEventBus } from '@/services/system/ProjectionEventBus';

export interface InventoryTransferInput {
  sourceBranchId: string;
  targetBranchId: string;
  notes?: string;
  items: Array<{
    productId: string;
    qty: number;
    batchNumber?: string;
    expiryDate?: string;
  }>;
}

export interface InventoryTransferResult {
  transferId: string;
  success: boolean;
}

export class InventoryTransferWorkflow implements BusinessWorkflow<InventoryTransferInput, InventoryTransferResult> {
  public id = 'inventory.transfer.create';
  public name = 'إنشاء طلب تحويل مخزني';
  public operationType = 'INVENTORY_TRANSFER';
  public requiredPermissions = ['inventory.transfer', 'inventory.manage'];
  public tables = [
    'branchTransfers', 'branchTransferItems', 'branchInventory',
    'auditLogs', 'idempotencyKeys', 'projectionEvents'
  ];

  public async validateInput(input: InventoryTransferInput): Promise<void> {
    if (!input.sourceBranchId || !input.targetBranchId) {
      throw new Error('يجب تحديد فرع المصدر وفرع الوجهة');
    }
    if (input.sourceBranchId === input.targetBranchId) {
      throw new Error('لا يمكن تحويل المخزون لنفس الفرع');
    }
    if (!input.items || input.items.length === 0) {
      throw new Error('يجب اختيار صنف واحد على الأقل للتحويل');
    }
  }

  public async validateBusinessRules(input: InventoryTransferInput): Promise<void> {
    for (const item of input.items) {
      if (item.qty <= 0) {
        throw new Error(`الكمية المحولة للصنف [${item.productId}] يجب أن تكون أكبر من الصفر`);
      }
    }
  }

  public async executeDomainSteps(
    input: InventoryTransferInput,
    ctx: WorkflowContext
  ): Promise<InventoryTransferResult> {
    const transferId = `TRF-${Date.now()}`;
    const now = new Date().toISOString();

    const transferRecord = {
      id: transferId,
      sourceBranchId: input.sourceBranchId,
      targetBranchId: input.targetBranchId,
      status: 'DRAFT' as TransferStatus,
      createdBy: ctx.userId,
      notes: input.notes || 'تحويل مخزني بين الفروع',
      createdAt: now,
      updatedAt: now
    };

    await db.db.branchTransfers.put(transferRecord);

    const transferItems = input.items.map((item) => ({
      id: `TRFI-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      transferId,
      productId: item.productId,
      qty: item.qty,
      receivedQty: 0,
      batchNumber: item.batchNumber || 'BATCH-GEN',
      expiryDate: item.expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now
    }));

    await db.db.branchTransferItems.bulkAdd(transferItems);

    await ProjectionEventBus.publish('STOCK_TRANSFER_CREATED', transferId, {
      source: input.sourceBranchId,
      target: input.targetBranchId,
      correlationId: ctx.correlationId
    });

    return {
      success: true,
      transferId
    };
  }
}

export const inventoryTransferWorkflow = new InventoryTransferWorkflow();
