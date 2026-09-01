import { BusinessWorkflow, WorkflowContext } from '@/core/workflow';
import { InvoiceItem, InvoiceStatus, Sale } from '@/types';
import { ValidationService as validationService } from '@/services/integrity/ValidationService';
import { FIFOEngine as fifoEngine } from '@features/inventory/services/fifoEngine';
import { StockMovementEngine as stockEngine } from '@features/inventory/services/stockMovementEngine';
import { InvoiceRepository } from '@/database/repositories/invoice.repository';
import { FinancialTransactionRepository } from '@/database/repositories/FinancialTransactionRepository';
import { AccountingEngine as accountingEngine } from '@features/accounting/services/AccountingEngine';
import { CurrencyService } from '@/services/localization/CurrencyService';
import { db } from '@/core/db';
import { ProjectionEventBus } from '@/services/system/ProjectionEventBus';
import { configurationService } from '@/services/config/configurationService';

export interface SalesWorkflowInput {
  customerId?: string;
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

export interface SalesWorkflowResult {
  refId: string;
  sale: Sale | any;
}

export class SalesWorkflow implements BusinessWorkflow<SalesWorkflowInput, SalesWorkflowResult> {
  public id = 'sales.invoice.process';
  public name = 'معالجة فاتورة مبيعات';
  public operationType = 'SALE';
  public requiredPermissions = ['sales.create', 'sales.edit'];
  public tables = [
    'invoices', 'invoiceItems', 'products', 'inventoryTransactions',
    'inventory_layers', 'fifo_consumption_log', 'customers', 'journalEntries',
    'journalLines', 'accounts', 'financialTransactions', 'auditLogs',
    'idempotencyKeys', 'projectionEvents'
  ];

  public async validateInput(input: SalesWorkflowInput): Promise<void> {
    if (!input.items || input.items.length === 0) {
      throw new Error('يجب إضافة صنف واحد على الأقل بفاتورة المبيعات');
    }
    if (input.total < 0) {
      throw new Error('إجمالي الفاتورة يجب أن يكون أكبر من أو يساوي الصفر');
    }
  }

  public async validateBusinessRules(input: SalesWorkflowInput): Promise<void> {
    await validationService.validateInvoice(input, 'SALE');

    // Check stock availability if negative stock is disallowed by configuration
    const allowNegativeStock = configurationService.getSync<boolean>('inventory.allowNegativeStock') ?? false;
    if (!allowNegativeStock && !input.isReturn) {
      for (const item of input.items) {
        if (!item.productId) continue;
        const product = await db.products.get(item.productId);
        if (product && (product.quantity || 0) < item.quantity) {
          throw new Error(
            `الكمية المطلوبة غير متوفرة بالمخزن للصنف [${product.name || item.name}]. المتوفر: ${product.quantity || 0}`
          );
        }
      }
    }

    if (!input.isEdit && input.id) {
      await validationService.validateInvoiceIdUniqueness(input.id, 'invoices', db.db);
    }
  }

  public async executeDomainSteps(
    input: SalesWorkflowInput,
    ctx: WorkflowContext
  ): Promise<SalesWorkflowResult> {
    const finalStatus: InvoiceStatus = input.invoiceStatus || 'POSTED';
    const isPosting = finalStatus === 'POSTED' || finalStatus === 'LOCKED';
    const effectiveDate = input.date || ctx.startedAt;
    const isReturn = !!input.isReturn;

    const docId = input.id || db.generateId('SALE');
    const salePayload = {
      ...input,
      id: docId,
      SaleID: docId,
      subtotal: input.total,
      finalTotal: input.total,
      paymentStatus: input.isCash ? 'Cash' : 'Credit',
      date: effectiveDate,
      type: 'SALE' as const
    } as unknown as Sale;

    let costResult = { totalCost: 0, itemCosts: {} };
    if (isPosting) {
      costResult = await fifoEngine.apply(salePayload);
      await stockEngine.apply(salePayload);
    }

    const savedDoc = await InvoiceRepository.saveSale(
      input.customerId!,
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
      const custId = input.customerId;
      if (custId && custId !== 'عميل نقدي') {
        const balanceDelta = isReturn ? -input.total : input.total;
        await db.updateCustomerBalance(custId, balanceDelta);
      }

      await FinancialTransactionRepository.record({
        id: db.generateId('FT'),
        Transaction_Type: isReturn ? 'Refund' : (input.isCash ? 'Payment' : 'Invoice'),
        Reference_ID: refId,
        Reference_Table: 'Sales_Invoices',
        Entity_Type: 'Customer',
        Entity_Name: input.customerId || 'عميل نقدي',
        Amount: input.total,
        Direction: isReturn ? 'Credit' : 'Debit',
        Transaction_Date: effectiveDate,
        Notes: `فاتورة مبيعات #${refId}`
      });

      await accountingEngine.postInvoice(
        { ...input, type: 'SALE', id: refId, transactionUuid: ctx.idempotencyKey },
        costResult
      );

      await ProjectionEventBus.publish('INVOICE_POSTED', refId, {
        type: 'SALE',
        transactionUuid: ctx.idempotencyKey,
        correlationId: ctx.correlationId
      });
    }

    return {
      refId,
      sale: savedDoc
    };
  }
}

export const salesWorkflow = new SalesWorkflow();
