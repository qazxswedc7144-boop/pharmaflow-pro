import { BusinessWorkflow, WorkflowContext } from '@/core/workflow';
import { db } from '@/core/db';
import { InventoryService } from '@features/inventory/services/InventoryService';

export interface InventoryAdjustmentInput {
  productId: string;
  warehouseId: string;
  actualQty: number;
  userId: string;
  notes?: string;
}

export interface InventoryAdjustmentResult {
  success: boolean;
  adjustmentId: string;
  deltaQty: number;
}

export class InventoryAdjustmentWorkflow implements BusinessWorkflow<InventoryAdjustmentInput, InventoryAdjustmentResult> {
  public id = 'inventory.adjustment.process';
  public name = 'تسوية وتعديل المخزون';
  public operationType = 'INVENTORY_ADJUSTMENT';
  public requiredPermissions = ['inventory.adjust', 'inventory.manage'];
  public tables = [
    'inventoryTransactions', 'products', 'journalEntries', 'journalLines',
    'accounts', 'auditLogs', 'idempotencyKeys', 'projectionEvents'
  ];

  public async validateInput(input: InventoryAdjustmentInput): Promise<void> {
    if (!input.productId) {
      throw new Error('يجب تحديد الصنف المراد تسويته');
    }
    if (input.actualQty < 0) {
      throw new Error('الكمية الفعلية لا يمكن أن تكون بالسالب');
    }
  }

  public async validateBusinessRules(input: InventoryAdjustmentInput): Promise<void> {
    const product = await db.products.get(input.productId);
    if (!product) {
      throw new Error(`لم يتم العثور على الصنف رقم [${input.productId}] في النظام`);
    }
  }

  public async executeDomainSteps(
    input: InventoryAdjustmentInput,
    _ctx: WorkflowContext
  ): Promise<InventoryAdjustmentResult> {
    const product = await db.products.get(input.productId);
    const currentQty = product?.quantity || 0;
    const deltaQty = input.actualQty - currentQty;

    const adjustmentId = `ADJ-${Date.now()}`;

    await InventoryService.adjustStock({
      productId: input.productId,
      warehouseId: input.warehouseId,
      newQty: input.actualQty,
      reason: input.notes || 'تسوية جردية مخزنية',
      userId: input.userId
    });

    return {
      success: true,
      adjustmentId,
      deltaQty
    };
  }
}

export const inventoryAdjustmentWorkflow = new InventoryAdjustmentWorkflow();
