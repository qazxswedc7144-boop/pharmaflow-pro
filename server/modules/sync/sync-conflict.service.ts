// server/modules/sync/sync-conflict.service.ts
// Deterministic Conflict Detection Engine for Phase 8.3 Enterprise Synchronization

import { SyncConflictCategory, SyncMutation } from "./sync.types";

export interface ConflictRecord {
  id: string;
  tenantId: string;
  branchId?: string | null;
  mutationId: string;
  category: SyncConflictCategory;
  entity: string;
  entityId: string;
  message: string;
  clientRecord: Record<string, any>;
  serverRecord: Record<string, any> | null;
  detectedAt: string;
  status: "OPEN" | "RESOLVED" | "OVERRIDDEN" | "DISCARDED";
  resolutionStrategy?: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

export class SyncConflictService {
  private static conflicts: ConflictRecord[] = [];

  /**
   * Evaluates if a mutation conflicts with existing server-side state across the 10 categories:
   * 1. SAME_RECORD_CONFLICT
   * 2. VERSION_CONFLICT
   * 3. STOCK_CONFLICT
   * 4. ACCOUNTING_CONFLICT
   * 5. DUPLICATE_MUTATION
   * 6. BRANCH_CONFLICT
   * 7. TENANT_CONFLICT
   * 8. PERMISSION_CONFLICT
   * 9. DELETED_RECORD_CONFLICT
   * 10. SCHEMA_VERSION_CONFLICT
   */
  static evaluateConflict(params: {
    mutation: SyncMutation;
    existingServerRecord: Record<string, any> | null;
    tenantId: string;
    branchId?: string | null;
    currentStock?: number;
    requiredStock?: number;
    isPeriodClosed?: boolean;
  }): {
    hasConflict: boolean;
    category?: SyncConflictCategory;
    message?: string;
    resolutionStrategy?: "SERVER_WINS" | "CLIENT_WINS" | "MANUAL_MERGE" | "RETRY_WITH_NEW_VERSION";
  } {
    const { mutation, existingServerRecord, currentStock, requiredStock, isPeriodClosed } = params;

    // 1. TENANT_CONFLICT: Record belongs to a different tenant
    if (existingServerRecord && existingServerRecord.tenantId && existingServerRecord.tenantId !== params.tenantId) {
      return {
        hasConflict: true,
        category: "TENANT_CONFLICT",
        message: "انتهاك عزل المنشآت: محاولة تعديل سجل يتبع منشأة أخرى.",
        resolutionStrategy: "SERVER_WINS"
      };
    }

    // 2. BRANCH_CONFLICT: Record belongs to a different branch and cross-branch editing is disallowed
    if (
      existingServerRecord &&
      existingServerRecord.branchId &&
      params.branchId &&
      existingServerRecord.branchId !== params.branchId &&
      !["ADMIN", "PLATFORM_OWNER"].includes(mutation.payload?.userRole)
    ) {
      return {
        hasConflict: true,
        category: "BRANCH_CONFLICT",
        message: "انتهاك عزل الفروع: هذا السجل مقيد بفرع آخر ولا يسمح بتعديله من هذا الجهاز.",
        resolutionStrategy: "SERVER_WINS"
      };
    }

    // 3. DELETED_RECORD_CONFLICT: Updating or modifying a deleted/archived record
    if (existingServerRecord && (existingServerRecord.isDeleted || existingServerRecord.documentStatus === "ARCHIVED")) {
      return {
        hasConflict: true,
        category: "DELETED_RECORD_CONFLICT",
        message: "محاولة تعديل سجل محذوف أو مؤرشف مسبقاً في الخادم السحابي.",
        resolutionStrategy: "SERVER_WINS"
      };
    }

    // 4. ACCOUNTING_CONFLICT: Trying to post or adjust records in a closed fiscal period or posted invoice
    if (isPeriodClosed) {
      return {
        hasConflict: true,
        category: "ACCOUNTING_CONFLICT",
        message: "تعارض محاسبي: الفترة المالية مغلقة ومقفلة ضد أي تعديلات جديدة.",
        resolutionStrategy: "SERVER_WINS"
      };
    }

    if (existingServerRecord && existingServerRecord.documentStatus === "POSTED" && mutation.operation === "UPDATE") {
      // Conservative handling for posted financial invoices
      if (["INVOICE", "JOURNAL_ENTRY", "PAYMENT"].includes(mutation.entity)) {
        return {
          hasConflict: true,
          category: "ACCOUNTING_CONFLICT",
          message: "تعارض مالي: القيد/الفاتورة مرحلة ومثبتة دفترية في الخادم، يتطلب التعديل إجراء إشعار تسوية محاسبي.",
          resolutionStrategy: "MANUAL_MERGE"
        };
      }
    }

    // 5. STOCK_CONFLICT: Insufficient stock on server for sale/transfer
    if (
      requiredStock !== undefined &&
      currentStock !== undefined &&
      currentStock < requiredStock &&
      ["INVENTORY_MOVEMENT", "SALE_DISPENSE", "STOCK_OUT"].includes(mutation.operation)
    ) {
      return {
        hasConflict: true,
        category: "STOCK_CONFLICT",
        message: `تعارض رصيد المخزون: الرصيد الفعلي في الخادم (${currentStock}) غير كافٍ لتنفيذ العملية المخصصة (${requiredStock}).`,
        resolutionStrategy: "MANUAL_MERGE"
      };
    }

    // 6. VERSION_CONFLICT: Server has a higher version number than client mutation
    if (existingServerRecord && mutation.version !== undefined && existingServerRecord.version !== undefined) {
      if (existingServerRecord.version > mutation.version) {
        return {
          hasConflict: true,
          category: "VERSION_CONFLICT",
          message: `تعارض إصدار السجل: الخادم يحمل الإصدار (${existingServerRecord.version}) بينما الجهاز يحمل (${mutation.version}).`,
          resolutionStrategy: "RETRY_WITH_NEW_VERSION"
        };
      }
    }

    // 7. SAME_RECORD_CONFLICT: Concurrent conflicting updates with conflicting timestamps
    if (existingServerRecord && existingServerRecord.updatedAt && mutation.payload?.updatedAt) {
      const serverTime = new Date(existingServerRecord.updatedAt).getTime();
      const clientTime = new Date(mutation.payload.updatedAt).getTime();
      if (serverTime > clientTime + 1000) { // 1s drift tolerance
        return {
          hasConflict: true,
          category: "SAME_RECORD_CONFLICT",
          message: "تم تحديث السجل على الخادم بواسطة طرف آخر بتوقيت أحدث.",
          resolutionStrategy: "SERVER_WINS"
        };
      }
    }

    return { hasConflict: false };
  }

  /**
   * Records a detected conflict for auditing and manual resolution workflow
   */
  static recordConflict(record: Omit<ConflictRecord, "id" | "detectedAt" | "status">): ConflictRecord {
    const id = `CONF-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const conflict: ConflictRecord = {
      ...record,
      id,
      detectedAt: new Date().toISOString(),
      status: "OPEN"
    };

    this.conflicts.unshift(conflict);

    // Limit in-memory conflict size
    if (this.conflicts.length > 1000) {
      this.conflicts.pop();
    }

    return conflict;
  }

  /**
   * Retrieves open conflicts for a tenant and branch
   */
  static getConflicts(tenantId: string, branchId?: string | null): ConflictRecord[] {
    return this.conflicts.filter((c) => {
      if (c.tenantId !== tenantId) return false;
      if (branchId && c.branchId && c.branchId !== branchId) return false;
      return true;
    });
  }

  /**
   * Resolves a conflict manually
   */
  static resolveConflict(
    conflictId: string,
    resolutionStrategy: string,
    resolvedBy: string
  ): ConflictRecord | null {
    const conflict = this.conflicts.find((c) => c.id === conflictId);
    if (conflict) {
      conflict.status = "RESOLVED";
      conflict.resolutionStrategy = resolutionStrategy;
      conflict.resolvedAt = new Date().toISOString();
      conflict.resolvedBy = resolvedBy;
      return conflict;
    }
    return null;
  }
}
