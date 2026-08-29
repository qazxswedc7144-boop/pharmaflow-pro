import { BusinessWorkflow, WorkflowContext } from '@/core/workflow';
import { InvoiceItem, InvoiceStatus, Sale, Purchase } from '@/types';
import { ValidationService as validationService } from '@/services/integrity/ValidationService';
import { FIFOEngine as fifoEngine } from '@features/inventory/services/fifoEngine';
import { StockMovementEngine as stockEngine } from '@features/inventory/services/stockMovementEngine';
import { InvoiceRepository } from '@/database/repositories/invoice.repository';
import { FinancialTransactionRepository } from '@/database/repositories/FinancialTransactionRepository';
import { AccountingEngine as accountingEngine } from '@features/accounting/services/AccountingEngine';
import { CurrencyService } from '@/services/localization/CurrencyService';
import { db } from '@/core/db';
import { ProjectionEventBus } from '@/services/system/ProjectionEventBus';

export interface PurchaseWorkflowInput {
  supplierId?: string;
  items: InvoiceItem[];
  total: number;
  id?: string;
  date?: string;
  notes?: string;
  attachment?: string;
  isCash?: boolean;
  isReturn?: boolean;
  invoiceStatus?: InvoiceStatus;
  currency?: string;
  isEdit?: boolean;
}

export interface PurchaseWorkflowResult {
  refId: string;
  purchase: Purchase | any;
}

export class PurchaseWorkflow implements BusinessWorkflow<PurchaseWorkflowInput, PurchaseWorkflowResult> {
  public id = 'purchases.invoice.process';
  public name = 'معالجة فاتورة مشتريات';
  public operationType = 'PURCHASE';
  public requiredPermissions = ['purchases.create', 'purchases.edit'];
  public tables = [
    'invoices', 'invoiceItems', 'products', 'inventoryTransactions',
    'inventory_layers', 'suppliers', 'journalEntries', 'journalLines',
    'accounts', 'financialTransactions', 'auditLogs', 'idempotencyKeys',
    'projectionEvents'
  ];

  public async validateInput(input: PurchaseWorkflowInput): Promise<void> {
    if (!input.items || input.items.length === 0) {
      throw new Error('يجب إضافة صنف واحد على الأقل بفاتورة المشتريات');
    }
    if (input.total < 0) {
      throw new Error('إجمالي الفاتورة يجب أن يكون أكبر من أو يساوي الصفر');
    }
  }

  public async validateBusinessRules(input: PurchaseWorkflowInput): Promise<void> {
    await validationService.validateInvoice(input, 'PURCHASE');
    if (!input.isEdit && input.id) {
      await validationService.validateInvoiceIdUniqueness(input.id, 'purchases', db.db);
    }
  }

  public async executeDomainSteps(
    input: PurchaseWorkflowInput,
    ctx: WorkflowContext
  ): Promise<PurchaseWorkflowResult> {
    const finalStatus: InvoiceStatus = input.invoiceStatus || 'POSTED';
    const isPosting = finalStatus === 'POSTED' || finalStatus === 'LOCKED';
    const effectiveDate = input.date || ctx.startedAt;
    const isReturn = !!input.isReturn;

    let costResult = { totalCost: 0, itemCosts: {} };
    if (isPosting) {
      costResult = await fifoEngine.apply({
        ...input,
        subtotal: input.total,
        finalTotal: input.total,
        type: 'PURCHASE'
      } as unknown as Sale);

      await stockEngine.apply({
        ...input,
        subtotal: input.total,
        finalTotal: input.total,
        type: 'PURCHASE'
      } as unknown as Sale);
    }

    const docId = input.id || db.generateId('PUR');
    const savedDoc = await InvoiceRepository.savePurchase(
      input.supplierId!,
      input.items,
      input.total,
      docId,
      input.isCash || false,
      input.currency || CurrencyService.getCurrentCurrencyCode(),
      finalStatus,
      0,
      'LOW',
      docId,
      input.attachment,
      isReturn,
      effectiveDate,
      ctx.idempotencyKey
    );

    const refId = (savedDoc as any)?.id || docId;

    if (isPosting) {
      const suppId = input.supplierId;
      if (suppId && suppId !== 'مورد نقدي') {
        const balanceDelta = isReturn ? -input.total : input.total;
        await db.updateSupplierBalance(suppId, balanceDelta);
      }

      await FinancialTransactionRepository.record({
        id: db.generateId('FT'),
        Transaction_Type: isReturn ? 'Refund' : (input.isCash ? 'Payment' : 'Invoice'),
        Reference_ID: refId,
        Reference_Table: 'Purchase_Invoices',
        Entity_Type: 'Supplier',
        Entity_Name: input.supplierId || 'مورد نقدي',
        Amount: input.total,
        Direction: isReturn ? 'Debit' : 'Credit',
        Transaction_Date: effectiveDate,
        Notes: `فاتورة مشتريات #${refId}`
      });

      await accountingEngine.postInvoice(
        { ...input, type: 'PURCHASE', id: refId, transactionUuid: ctx.idempotencyKey },
        costResult
      );

      await ProjectionEventBus.publish('INVOICE_POSTED', refId, {
        type: 'PURCHASE',
        transactionUuid: ctx.idempotencyKey,
        correlationId: ctx.correlationId
      });
    }

    return {
      refId,
      purchase: savedDoc
    };
  }
}

export const purchaseWorkflow = new PurchaseWorkflow();
