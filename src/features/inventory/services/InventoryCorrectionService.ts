// src/features/inventory/services/InventoryCorrectionService.ts
/**
 * PharmaFlow PRO ERP — Phase 3.3: Controlled Inventory Correction Service
 * Enforces human-governed resolution, strict RBAC, multi-tenant isolation,
 * atomic transactions, idempotency, and post-execution reconciliation verification.
 */

import { db, getCurrentUserSession } from '@/core/db';
import { InventoryCorrectionRepository } from '../repositories/InventoryCorrectionRepository';
import { 
  InventoryReconciliationService, 
  ProductReconciliationAudit
} from './InventoryReconciliationService';
import { 
  InventoryCorrectionCase, 
  CorrectionProposal, 
  CorrectionApproval, 
  UserSecurityContext
} from '../types/correction.types';
import { AuditService } from '@/services/system/AuditService';

// Custom Enterprise Domain Errors
export class UnauthorizedCorrectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedCorrectionError';
  }
}

export class InvalidStateTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStateTransitionError';
  }
}

export class DuplicateExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateExecutionError';
  }
}

export class ReconciliationVerificationFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReconciliationVerificationFailedError';
  }
}

export class MandatoryFieldMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MandatoryFieldMissingError';
  }
}

export class InventoryCorrectionService {

  // =========================================================================
  // RBAC & PERMISSION POLICIES
  // =========================================================================
  
  private static readonly APPROVER_ROLES = new Set([
    'ADMIN', 'ADMINISTRATOR', 'OWNER', 'SUPER_ADMIN', 'SYSTEM_ADMIN'
  ]);

  private static readonly REVIEWER_ROLES = new Set([
    'ADMIN', 'ADMINISTRATOR', 'OWNER', 'SUPER_ADMIN', 'SYSTEM_ADMIN',
    'MANAGER', 'INVENTORY_MANAGER', 'ACCOUNTANT', 'CHIEF_PHARMACIST'
  ]);

  private static normalizeRole(role?: string): string {
    if (!role) return 'EMPLOYEE';
    return role.trim().toUpperCase().replace(/[\s-]/g, '_');
  }

  static canReview(role?: string): boolean {
    const r = this.normalizeRole(role);
    return this.REVIEWER_ROLES.has(r);
  }

  static canPropose(role?: string): boolean {
    const r = this.normalizeRole(role);
    return this.REVIEWER_ROLES.has(r);
  }

  static canApprove(role?: string): boolean {
    const r = this.normalizeRole(role);
    return this.APPROVER_ROLES.has(r);
  }

  static canExecute(role?: string): boolean {
    const r = this.normalizeRole(role);
    return this.APPROVER_ROLES.has(r);
  }

  // =========================================================================
  // 1. CASE CREATION (From Read-Only Reconciliation)
  // Strictly creates OPEN cases for human review. Never auto-fixes.
  // =========================================================================
  static async registerDiscrepancyCases(
    audit: ProductReconciliationAudit,
    context?: Partial<UserSecurityContext>
  ): Promise<InventoryCorrectionCase[]> {
    if (!audit || !audit.discrepancies || audit.discrepancies.length === 0) {
      return [];
    }

    const session = getCurrentUserSession();
    const tenantId = context?.tenantId || audit.tenantId || session.tenantId || 'default-tenant';
    const branchId = context?.branchId ?? audit.branchId ?? session.branchId ?? null;

    const createdCases: InventoryCorrectionCase[] = [];

    for (const disc of audit.discrepancies) {
      // 1. Check if an active open case already exists to prevent duplication
      const existing = await InventoryCorrectionRepository.findExistingOpenCase(
        audit.productId,
        disc.type,
        tenantId,
        branchId
      );

      if (existing) {
        continue;
      }

      // 2. Build new case in OPEN status
      const caseNumber = await InventoryCorrectionRepository.getNextCaseNumber(tenantId);
      const caseId = `CASE-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();

      const newCase: InventoryCorrectionCase = {
        id: caseId,
        caseNumber,
        tenantId,
        branchId,
        productId: audit.productId,
        productName: audit.productName,
        categoryName: audit.categoryName,
        discrepancyType: disc.type,
        severity: disc.severity,
        status: 'OPEN',
        details: {
          expectedQty: disc.expected,
          actualQty: disc.actual,
          variance: disc.difference,
          sourceDocId: disc.documentId,
          diagnosticMessage: disc.reason,
          rawDiscrepancy: disc
        },
        auditTrail: [{
          id: `AUD-${Date.now()}-1`,
          timestamp: now,
          action: 'CASE_OPENED',
          userId: context?.userId || session.userId || 'SYSTEM',
          userName: context?.userName || 'Reconciliation Engine',
          userRole: context?.role || 'SYSTEM',
          previousStatus: 'OPEN',
          newStatus: 'OPEN',
          notes: `تم رصد فرق مخزني (${disc.type}): ${disc.reason}`
        }],
        createdAt: now,
        updatedAt: now
      };

      const saved = await InventoryCorrectionRepository.save(newCase);
      createdCases.push(saved);
    }

    return createdCases;
  }

  // =========================================================================
  // 2. CASE LIFECYCLE: START REVIEW (OPEN -> UNDER_REVIEW)
  // =========================================================================
  static async startReview(
    caseId: string,
    user: UserSecurityContext,
    notes?: string
  ): Promise<InventoryCorrectionCase> {
    if (!this.canReview(user.role)) {
      throw new UnauthorizedCorrectionError(`User role ${user.role} is not authorized to review correction cases.`);
    }

    const currentCase = await InventoryCorrectionRepository.findById(caseId, user.tenantId);
    if (!currentCase) {
      throw new Error(`Correction case ${caseId} not found or tenant mismatch.`);
    }

    if (currentCase.status !== 'OPEN' && currentCase.status !== 'UNDER_REVIEW') {
      throw new InvalidStateTransitionError(
        `Cannot review case in status '${currentCase.status}'. Case must be 'OPEN'.`
      );
    }

    const now = new Date().toISOString();
    currentCase.status = 'UNDER_REVIEW';
    currentCase.assignedTo = user.userId;
    currentCase.reviewedBy = user.userName || user.userId;
    currentCase.reviewedAt = now;
    if (notes) currentCase.reviewNotes = notes;

    currentCase.auditTrail.push({
      id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      timestamp: now,
      action: 'REVIEW_STARTED',
      userId: user.userId,
      userName: user.userName || user.userId,
      userRole: user.role,
      previousStatus: 'OPEN',
      newStatus: 'UNDER_REVIEW',
      notes: notes || 'بدأت عملية مراجعة وتدقيق الفرق المخزني بواسطة المسؤول المختص'
    });

    return await InventoryCorrectionRepository.save(currentCase);
  }

  // =========================================================================
  // 3. CASE LIFECYCLE: SUBMIT PROPOSAL (UNDER_REVIEW / OPEN -> PROPOSED)
  // =========================================================================
  static async submitProposal(
    caseId: string,
    proposal: Omit<CorrectionProposal, 'proposedBy' | 'proposedRole' | 'proposedAt'>,
    user: UserSecurityContext
  ): Promise<InventoryCorrectionCase> {
    if (!this.canPropose(user.role)) {
      throw new UnauthorizedCorrectionError(`User role ${user.role} is not authorized to propose corrections.`);
    }

    if (!proposal.reason || proposal.reason.trim().length < 5) {
      throw new MandatoryFieldMissingError('A detailed reason (minimum 5 characters) is strictly mandatory for any correction proposal.');
    }

    const currentCase = await InventoryCorrectionRepository.findById(caseId, user.tenantId);
    if (!currentCase) {
      throw new Error(`Correction case ${caseId} not found or tenant mismatch.`);
    }

    if (currentCase.status !== 'OPEN' && currentCase.status !== 'UNDER_REVIEW' && currentCase.status !== 'REJECTED') {
      throw new InvalidStateTransitionError(
        `Cannot propose correction for case in status '${currentCase.status}'. Must be 'OPEN' or 'UNDER_REVIEW'.`
      );
    }

    const now = new Date().toISOString();
    const fullProposal: CorrectionProposal = {
      ...proposal,
      targetWarehouseId: proposal.targetWarehouseId || 'WH-MAIN',
      proposedBy: user.userId,
      proposedRole: user.role,
      proposedAt: now
    };

    const prevStatus = currentCase.status;
    currentCase.status = 'PROPOSED';
    currentCase.proposedAction = fullProposal;

    currentCase.auditTrail.push({
      id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      timestamp: now,
      action: 'PROPOSAL_SUBMITTED',
      userId: user.userId,
      userName: user.userName || user.userId,
      userRole: user.role,
      previousStatus: prevStatus,
      newStatus: 'PROPOSED',
      notes: `تم تقديم مقترح تصحيح (${proposal.actionType}): ${proposal.reason}`
    });

    return await InventoryCorrectionRepository.save(currentCase);
  }

  // =========================================================================
  // 4. CASE LIFECYCLE: APPROVE / REJECT (PROPOSED -> APPROVED / REJECTED)
  // Separation of duties: Employee/Manager cannot approve. Only Owner/Admin.
  // =========================================================================
  static async approveCase(
    caseId: string,
    approver: UserSecurityContext,
    notes?: string
  ): Promise<InventoryCorrectionCase> {
    if (!this.canApprove(approver.role)) {
      throw new UnauthorizedCorrectionError(`User role ${approver.role} is not authorized to approve inventory corrections. Admin/Owner authority required.`);
    }

    const currentCase = await InventoryCorrectionRepository.findById(caseId, approver.tenantId);
    if (!currentCase) {
      throw new Error(`Correction case ${caseId} not found or tenant mismatch.`);
    }

    if (currentCase.status !== 'PROPOSED') {
      throw new InvalidStateTransitionError(
        `Cannot approve case in status '${currentCase.status}'. Case must be in 'PROPOSED' state.`
      );
    }

    if (!currentCase.proposedAction) {
      throw new MandatoryFieldMissingError('Cannot approve case without an existing proposed correction action.');
    }

    const now = new Date().toISOString();
    const approval: CorrectionApproval = {
      decision: 'APPROVED',
      approvedBy: approver.userId,
      approvalRole: approver.role,
      approvedAt: now,
      approvalNotes: notes || 'تمت الموافقة الرسمية على مقترح التسوية المخزنية'
    };

    currentCase.status = 'APPROVED';
    currentCase.approval = approval;

    currentCase.auditTrail.push({
      id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      timestamp: now,
      action: 'CASE_APPROVED',
      userId: approver.userId,
      userName: approver.userName || approver.userId,
      userRole: approver.role,
      previousStatus: 'PROPOSED',
      newStatus: 'APPROVED',
      notes: notes || 'تم اعتماد مقترح التصحيح من صاحب الصلاحية'
    });

    return await InventoryCorrectionRepository.save(currentCase);
  }

  static async rejectCase(
    caseId: string,
    approver: UserSecurityContext,
    rejectionReason: string
  ): Promise<InventoryCorrectionCase> {
    if (!this.canApprove(approver.role) && !this.canReview(approver.role)) {
      throw new UnauthorizedCorrectionError(`User role ${approver.role} is not authorized to reject correction cases.`);
    }

    if (!rejectionReason || rejectionReason.trim().length < 5) {
      throw new MandatoryFieldMissingError('A valid rejection reason (minimum 5 characters) is required.');
    }

    const currentCase = await InventoryCorrectionRepository.findById(caseId, approver.tenantId);
    if (!currentCase) {
      throw new Error(`Correction case ${caseId} not found or tenant mismatch.`);
    }

    if (currentCase.status !== 'PROPOSED' && currentCase.status !== 'UNDER_REVIEW') {
      throw new InvalidStateTransitionError(
        `Cannot reject case in status '${currentCase.status}'. Must be in 'PROPOSED' or 'UNDER_REVIEW'.`
      );
    }

    const now = new Date().toISOString();
    const approval: CorrectionApproval = {
      decision: 'REJECTED',
      approvedBy: approver.userId,
      approvalRole: approver.role,
      approvedAt: now,
      approvalNotes: rejectionReason
    };

    const prevStatus = currentCase.status;
    currentCase.status = 'REJECTED';
    currentCase.approval = approval;

    currentCase.auditTrail.push({
      id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      timestamp: now,
      action: 'CASE_REJECTED',
      userId: approver.userId,
      userName: approver.userName || approver.userId,
      userRole: approver.role,
      previousStatus: prevStatus,
      newStatus: 'REJECTED',
      notes: `تم رفض مقترح التصحيح: ${rejectionReason}`
    });

    return await InventoryCorrectionRepository.save(currentCase);
  }

  // =========================================================================
  // 5. ATOMIC EXECUTION & POST-RECONCILIATION VERIFICATION
  // (APPROVED -> EXECUTED -> RECONCILED)
  // Ensures:
  // - Atomic Transaction (Rollback on failure)
  // - Idempotency
  // - Tenant/Branch Scoping
  // - Post-execution automatic reconciliation confirmation
  // =========================================================================
  static async executeCorrection(
    caseId: string,
    executor: UserSecurityContext,
    idempotencyKey?: string
  ): Promise<InventoryCorrectionCase> {
    // 1. RBAC Guard
    if (!this.canExecute(executor.role)) {
      throw new UnauthorizedCorrectionError(`User role ${executor.role} is not authorized to execute inventory corrections.`);
    }

    // 2. Fetch and Validate Case
    const currentCase = await InventoryCorrectionRepository.findById(caseId, executor.tenantId);
    if (!currentCase) {
      throw new Error(`Correction case ${caseId} not found or tenant mismatch.`);
    }

    // 3. Strict State Transition Guard: Must be APPROVED
    if (currentCase.status !== 'APPROVED') {
      throw new InvalidStateTransitionError(
        `Cannot execute case in status '${currentCase.status}'. Case MUST be explicitly 'APPROVED' by an authorized admin first.`
      );
    }

    // 4. Idempotency Guard
    const finalIdempotencyKey = idempotencyKey || `IDEMP-CORR-${caseId}`;
    if (currentCase.execution?.idempotencyKey === finalIdempotencyKey && (currentCase.status as string) === 'RECONCILED') {
      throw new DuplicateExecutionError(`Correction case ${caseId} has already been successfully executed and reconciled.`);
    }

    const proposal = currentCase.proposedAction;
    if (!proposal) {
      throw new MandatoryFieldMissingError('Missing proposed action details on approved case.');
    }

    const tenantId = currentCase.tenantId || executor.tenantId || 'default-tenant';
    const branchId = currentCase.branchId || executor.branchId || null;
    const refId = `CORR-REF-${Date.now()}`;
    const now = new Date().toISOString();

    // 5. Capture BEFORE snapshot for comprehensive audit trail
    const beforeProduct = await db.products.get(currentCase.productId);
    const beforeStock = Number(beforeProduct?.stock ?? beforeProduct?.StockQuantity ?? 0);
    const beforeLayers = await db.inventory_layers.where('item_id').equals(currentCase.productId).toArray().catch(() => []);

    let generatedJournalEntryId: string | undefined;
    let generatedStockMovementId: string | undefined;
    let generatedInventoryTransactionId: string | undefined;

    // 6. Execute inside Atomic Transaction
    const txTables = [
      'products', 'inventoryTransactions', 'journalEntries', 
      'stock_movements', 'warehouseStock', 'inventory_layers', 
      'invoices', 'sales', 'purchases', 'inventoryCorrectionCases',
      'medicineBatches', 'Audit_Log', 'auditLogs'
    ];

    try {
      await db.safeTransaction('rw', txTables, async () => {
        // --- STEP A: Perform Specific Correction Action ---
        switch (proposal.actionType) {
          
          // Case 1: PHYSICAL_COUNT_ADJUSTMENT & RESOLVE_NEGATIVE_STOCK
          case 'PHYSICAL_COUNT_ADJUSTMENT':
          case 'RESOLVE_NEGATIVE_STOCK': {
            const targetQty = Number(proposal.proposedQty);
            const preAudit = await InventoryReconciliationService.auditProduct(
              currentCase.productId,
              { tenantId, branchId: branchId || undefined }
            );
            const currentBook = preAudit.bookBalance;
            const bookDiff = targetQty - currentBook;
            const stockDiff = targetQty - beforeStock;

            if (bookDiff !== 0) {
              const txId = db.generateId('ITX');
              generatedInventoryTransactionId = txId;

              // 1. Record formal Inventory Transaction for book balance adjustment
              await db.inventoryTransactions.add({
                id: txId,
                productId: currentCase.productId,
                product_id: currentCase.productId,
                warehouseId: proposal.targetWarehouseId || 'WH-MAIN',
                warehouse_id: proposal.targetWarehouseId || 'WH-MAIN',
                quantityChange: bookDiff,
                QuantityChange: bookDiff,
                change_quantity: bookDiff,
                changeQty: bookDiff,
                transactionType: 'INVENTORY_COUNT',
                TransactionType: 'INVENTORY_COUNT',
                type: 'INVENTORY_COUNT',
                sourceDocId: refId,
                source_doc_id: refId,
                sourceDocType: 'CORRECTION_CASE',
                reason: proposal.reason,
                notes: `تسوية جردية رسمية بموجب القضية ${currentCase.caseNumber}: ${proposal.reason}`,
                transactionDate: now,
                created_at: now,
                tenantId,
                branchId,
                userId: executor.userId
              });
            }

            // 2. Create Balanced Double-Entry Accounting Entry
            const costPrice = Number(beforeProduct?.CostPrice || beforeProduct?.cost || 0);
            const accountingDiff = bookDiff !== 0 ? bookDiff : stockDiff;
            const totalValue = Math.abs(accountingDiff * costPrice);
            const entryId = db.generateId('JE');
            generatedJournalEntryId = entryId;

            const invAcc = 'ACC-104-INVENTORY';
            const gainAcc = 'ACC-403-INV-GAIN';
            const lossAcc = 'ACC-504-INV-LOSS';

            const lines: any[] = [];
            if (accountingDiff >= 0) {
              // Gain: Debit Inventory (+Asset), Credit Inventory Gain (+Revenue)
              lines.push({
                id: db.generateId('JL'),
                entryId,
                accountId: invAcc,
                debit: totalValue,
                credit: 0,
                description: `تسوية زيادة مخزنية للصنف ${currentCase.productName} | ${currentCase.caseNumber}`
              });
              lines.push({
                id: db.generateId('JL'),
                entryId,
                accountId: gainAcc,
                debit: 0,
                credit: totalValue,
                description: `أرباح تسويات مخزنية للصنف ${currentCase.productName} | ${currentCase.caseNumber}`
              });
            } else {
              // Loss: Debit Inventory Loss (+Expense), Credit Inventory (-Asset)
              lines.push({
                id: db.generateId('JL'),
                entryId,
                accountId: lossAcc,
                debit: totalValue,
                credit: 0,
                description: `خسائر عجز مخزني للصنف ${currentCase.productName} | ${currentCase.caseNumber}`
              });
              lines.push({
                id: db.generateId('JL'),
                entryId,
                accountId: invAcc,
                debit: 0,
                credit: totalValue,
                description: `تسوية نقص مخزني للصنف ${currentCase.productName} | ${currentCase.caseNumber}`
              });
            }

            await db.journalEntries.add({
              id: entryId,
              date: now,
              description: `قيد تسوية مخزنية معتمد - قضية ${currentCase.caseNumber} (${proposal.reason})`,
              totalAmount: totalValue,
              status: 'POSTED',
              sourceId: currentCase.productId,
              sourceType: 'INVENTORY_ADJUSTMENT',
              referenceId: refId,
              tenantId,
              branchId,
              lines,
              createdAt: now
            });

            // 3. Record Stock Movement
            const moveId = db.generateId('SM');
            generatedStockMovementId = moveId;
            await db.stock_movements.add({
              id: moveId,
              item_id: currentCase.productId,
              product_id: currentCase.productId,
              type: 'ADJUSTMENT',
              movement_type: 'ADJUSTMENT',
              quantity: Math.abs(stockDiff !== 0 ? stockDiff : bookDiff),
              quantity_before: beforeStock,
              quantity_after: targetQty,
              unit_cost: costPrice,
              reference_id: refId,
              sourceDocId: refId,
              reason: proposal.reason,
              created_at: now,
              tenantId,
              branchId
            });

            // 4. Update Product Master Stock Safely
            await db.products.update(currentCase.productId, {
              stock: targetQty,
              StockQuantity: targetQty,
              stock_qty: targetQty,
              updatedAt: now
            });

            // 5. Update Warehouse Stock
            const ws = await db.warehouseStock
              .where('[warehouseId+productId]')
              .equals([proposal.targetWarehouseId || 'WH-MAIN', currentCase.productId])
              .first();

            if (ws) {
              await db.warehouseStock.update(ws.id, {
                quantity: targetQty,
                lastUpdated: now
              });
            } else {
              await db.warehouseStock.add({
                id: db.generateId('WHS'),
                warehouseId: proposal.targetWarehouseId || 'WH-MAIN',
                productId: currentCase.productId,
                quantity: targetQty,
                lastUpdated: now,
                tenantId,
                branchId
              });
            }

            // 6. Ensure Layer sync if necessary
            if (beforeLayers.length === 0 && targetQty > 0) {
              await db.inventory_layers.add({
                id: `LAY-ADJ-${Date.now()}`,
                item_id: currentCase.productId,
                productId: currentCase.productId,
                quantity: targetQty,
                quantity_remaining: targetQty,
                remaining_qty: targetQty,
                unit_cost: costPrice,
                reference_id: refId,
                created_at: now,
                tenant_id: tenantId,
                tenantId
              });
            }
            break;
          }

          // Case 2: ALIGN_LAYERS_ADJUSTMENT (Align FIFO layers with master stock)
          case 'ALIGN_LAYERS_ADJUSTMENT': {
            const costPrice = Number(beforeProduct?.CostPrice || beforeProduct?.cost || 0);
            const targetQty = proposal.proposedQty !== undefined ? Number(proposal.proposedQty) : beforeStock;
            const activeLayers = beforeLayers.filter((l: any) => Number(l.quantity_remaining ?? l.remaining_qty ?? 0) > 0);
            const layersSum = activeLayers.reduce((s: number, l: any) => s + Number(l.quantity_remaining ?? l.remaining_qty ?? 0), 0);
            const layerDiff = targetQty - layersSum;

            if (layerDiff > 0) {
              // Add balancing layer
              await db.inventory_layers.add({
                id: `LAY-ALIGN-${Date.now()}`,
                item_id: currentCase.productId,
                productId: currentCase.productId,
                quantity: layerDiff,
                quantity_remaining: layerDiff,
                remaining_qty: layerDiff,
                unit_cost: costPrice,
                reference_id: refId,
                created_at: now,
                tenant_id: tenantId,
                tenantId
              });
            } else if (layerDiff < 0) {
              // Consume excess layer quantity in FIFO order
              let neededDeduction = Math.abs(layerDiff);
              for (const layer of activeLayers) {
                if (neededDeduction <= 0) break;
                const rem = Number(layer.quantity_remaining ?? layer.remaining_qty ?? 0);
                if (rem <= neededDeduction) {
                  await db.inventory_layers.update(layer.id, {
                    quantity_remaining: 0,
                    remaining_qty: 0,
                    lastModified: now
                  });
                  neededDeduction -= rem;
                } else {
                  await db.inventory_layers.update(layer.id, {
                    quantity_remaining: rem - neededDeduction,
                    remaining_qty: rem - neededDeduction,
                    lastModified: now
                  });
                  neededDeduction = 0;
                }
              }
            }

            // Log movement
            const moveId = db.generateId('SM');
            generatedStockMovementId = moveId;
            await db.stock_movements.add({
              id: moveId,
              item_id: currentCase.productId,
              product_id: currentCase.productId,
              type: 'ADJUSTMENT',
              movement_type: 'ADJUSTMENT',
              quantity: Math.abs(layerDiff),
              quantity_before: layersSum,
              quantity_after: targetQty,
              unit_cost: costPrice,
              reference_id: refId,
              reason: `مواءمة وتصحيح طبقات الـ FIFO بموجب القضية ${currentCase.caseNumber}`,
              created_at: now,
              tenantId,
              branchId
            });
            break;
          }

          // Case 3: QUARANTINE_EXPIRED_BATCH (Zero out expired active layer with documented loss)
          case 'QUARANTINE_EXPIRED_BATCH': {
            const costPrice = Number(beforeProduct?.CostPrice || beforeProduct?.cost || 0);
            const expiredLayers = beforeLayers.filter((l: any) => {
              const rem = Number(l.quantity_remaining ?? l.remaining_qty ?? 0);
              const exp = l.expiry_date || l.expiryDate;
              return rem > 0 && exp && new Date(exp) < new Date();
            });

            let expiredQty = 0;
            for (const el of expiredLayers) {
              const rem = Number(el.quantity_remaining ?? el.remaining_qty ?? 0);
              expiredQty += rem;
              await db.inventory_layers.update(el.id, {
                quantity_remaining: 0,
                remaining_qty: 0,
                is_quarantined: true,
                quarantine_reason: proposal.reason,
                lastModified: now
              });
            }

            if (expiredQty > 0) {
              // Deduct from master stock
              const newMasterStock = Math.max(0, beforeStock - expiredQty);
              await db.products.update(currentCase.productId, {
                stock: newMasterStock,
                StockQuantity: newMasterStock,
                stock_qty: newMasterStock,
                updatedAt: now
              });

              // Record damage transaction
              const txId = db.generateId('ITX');
              generatedInventoryTransactionId = txId;
              await db.inventoryTransactions.add({
                id: txId,
                productId: currentCase.productId,
                product_id: currentCase.productId,
                warehouseId: proposal.targetWarehouseId || 'WH-MAIN',
                quantityChange: -expiredQty,
                QuantityChange: -expiredQty,
                change_quantity: -expiredQty,
                changeQty: -expiredQty,
                transactionType: 'DAMAGE',
                TransactionType: 'DAMAGE',
                type: 'DAMAGE',
                sourceDocId: refId,
                reason: `عزل وإعدام دفعات منتهية الصلاحية: ${proposal.reason}`,
                transactionDate: now,
                created_at: now,
                tenantId,
                branchId,
                userId: executor.userId
              });

              // Loss Journal Entry
              const lossValue = expiredQty * costPrice;
              const entryId = db.generateId('JE');
              generatedJournalEntryId = entryId;
              await db.journalEntries.add({
                id: entryId,
                date: now,
                description: `قيد إعدام وعزل مخزون منتهي الصلاحية - قضية ${currentCase.caseNumber}`,
                totalAmount: lossValue,
                status: 'POSTED',
                sourceId: currentCase.productId,
                sourceType: 'INVENTORY_SPOILAGE',
                referenceId: refId,
                tenantId,
                branchId,
                lines: [
                  {
                    id: db.generateId('JL'),
                    entryId,
                    accountId: 'ACC-504-INV-LOSS',
                    debit: lossValue,
                    credit: 0,
                    description: `خسائر مخزون منتهي الصلاحية للصنف ${currentCase.productName}`
                  },
                  {
                    id: db.generateId('JL'),
                    entryId,
                    accountId: 'ACC-104-INVENTORY',
                    debit: 0,
                    credit: lossValue,
                    description: `تخفيض المخزون بسبب انتهاء الصلاحية للصنف ${currentCase.productName}`
                  }
                ],
                createdAt: now
              });
            }
            break;
          }

          // Case 4: LINK_ORPHAN_DOCUMENT
          case 'LINK_ORPHAN_DOCUMENT': {
            if (proposal.referenceDocId) {
              const movements = await db.stock_movements.toArray();
              const orphan = movements.find((m: any) => m.id === proposal.referenceDocId || m.reference_id === proposal.referenceDocId);
              if (orphan) {
                await db.stock_movements.update(orphan.id, {
                  item_id: currentCase.productId,
                  product_id: currentCase.productId,
                  sourceDocId: proposal.referenceDocId,
                  notes: `تم ربط الحركة اليتيمة بالصنف بموجب القضية ${currentCase.caseNumber}`
                });
              }
            }
            break;
          }

          // Case 5: RECONCILE_UNLINKED_RETURN
          case 'RECONCILE_UNLINKED_RETURN': {
            if (proposal.referenceDocId) {
              const inv = await db.invoices.get(proposal.referenceDocId);
              if (inv) {
                await db.invoices.update(inv.id, {
                  isReturn: true,
                  document_status: 'POSTED',
                  notes: `${inv.notes || ''} | تم ربط المرتجع وتسويته مع القضية ${currentCase.caseNumber}`
                });
              }
            }
            break;
          }
        }

        // --- STEP B: Post-Execution Automatic Reconciliation Verification ---
        // Verify that the target discrepancy is resolved.
        const postAudit = await InventoryReconciliationService.auditProduct(
          currentCase.productId,
          { tenantId, branchId: branchId || undefined }
        );

        // Check if discrepancy of this specific type is resolved
        const remainingSpecificDisc = postAudit.discrepancies.filter(d => d.type === currentCase.discrepancyType);

        if (remainingSpecificDisc.length > 0) {
          // Discrepancy was NOT resolved! Throw error to trigger full atomic rollback.
          throw new ReconciliationVerificationFailedError(
            `Post-correction reconciliation failed! Discrepancy '${currentCase.discrepancyType}' remains unresolved with variance: ${remainingSpecificDisc[0]?.difference ?? 'unknown'}. Triggering full atomic rollback.`
          );
        }
      });
    } catch (txError: any) {
      // Transaction failed or rolled back
      console.error(`[InventoryCorrectionService] Transaction aborted and rolled back:`, txError);

      currentCase.status = 'ROLLBACK_FAILED';
      currentCase.auditTrail.push({
        id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        timestamp: now,
        action: 'EXECUTION_ROLLED_BACK',
        userId: executor.userId,
        userName: executor.userName || executor.userId,
        userRole: executor.role,
        previousStatus: 'APPROVED',
        newStatus: 'ROLLBACK_FAILED',
        notes: `فشل تنفيذ وتدقيق التسوية وتم التراجع عن كافة التغييرات: ${txError.message || String(txError)}`
      });

      await InventoryCorrectionRepository.save(currentCase);
      throw txError;
    }

    // --- STEP C: Finalize Case Success Status ---
    const finalPostAudit = await InventoryReconciliationService.auditProduct(
      currentCase.productId,
      { tenantId, branchId: branchId || undefined }
    );

    currentCase.status = 'RECONCILED';
    currentCase.execution = {
      executedBy: executor.userId,
      executionRole: executor.role,
      executedAt: now,
      idempotencyKey: finalIdempotencyKey,
      refId,
      journalEntryId: generatedJournalEntryId,
      stockMovementId: generatedStockMovementId,
      inventoryTransactionId: generatedInventoryTransactionId,
      reconciliationResult: {
        isReconciled: true,
        postAuditStatus: finalPostAudit.status,
        remainingDiscrepanciesCount: finalPostAudit.discrepancies.length,
        verifiedAt: now
      }
    };

    currentCase.auditTrail.push({
      id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      timestamp: now,
      action: 'CORRECTION_RECONCILED',
      userId: executor.userId,
      userName: executor.userName || executor.userId,
      userRole: executor.role,
      previousStatus: 'APPROVED',
      newStatus: 'RECONCILED',
      notes: `تم تنفيذ التسوية بنجاح واجتياز فحص المطابقة الدفترية الآلية. المعرف: ${refId}`
    });

    const saved = await InventoryCorrectionRepository.save(currentCase);

    // Write system-level audit
    await AuditService.log({
      action: 'EDIT',
      module: 'INVENTORY_CORRECTION',
      transactionUuid: refId,
      before: { stock: beforeStock, layersCount: beforeLayers.length },
      after: { stock: proposal.proposedQty, status: 'RECONCILED' },
      recordId: currentCase.id
    });

    return saved;
  }
}
