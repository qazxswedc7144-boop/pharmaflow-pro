// src/features/purchases/services/smartImport/providers/fallbackProvider.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.5: Safe Fallback Provider (Ensures Zero Import Lockout)
 */

import { 
  IDocumentExtractionProvider, 
  ExtractionProviderResult, 
  ProviderHealthStatus, 
  ExtractionProviderType 
} from './provider.types';
import { 
  ImportParseContext, 
  CanonicalImportDocument, 
  CanonicalImportTable, 
  CanonicalImportRawRow 
} from '../types';
import { parseInvoiceLocally } from '@/features/ai/services/localBackupOcrEngine';

export class FallbackProvider implements IDocumentExtractionProvider {
  public readonly name = 'SafeLocalFallbackEngine';
  public readonly type: ExtractionProviderType = 'FALLBACK';
  public healthStatus: ProviderHealthStatus = 'HEALTHY';

  public canExtract(): boolean {
    return true; // Always can act as ultimate fallback
  }

  public async extract(
    file: File | string, 
    context: ImportParseContext
  ): Promise<ExtractionProviderResult> {
    const startTime = Date.now();
    const { onProgress } = context;

    onProgress?.(50, 'جاري استخدام المحرك الاحتياطي المحلي لضمان عدم توقف الاستيراد...');

    const localResult = await parseInvoiceLocally(file);
    const executionTimeMs = Date.now() - startTime;

    const rawRows: CanonicalImportRawRow[] = (localResult.items || []).map((item, idx) => ({
      sourceRowIndex: idx + 1,
      cells: {
        productName: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        total: item.quantity * item.price,
        expiryDate: (item as any).expiryDate,
        batchNumber: (item as any).batchNumber,
        barcode: (item as any).barcode
      },
      rawCells: [item.name, item.quantity, item.price, item.quantity * item.price],
      sourceReference: { row: idx + 1 }
    }));

    const table: CanonicalImportTable = {
      id: `fallback-tbl-${Date.now()}`,
      sourceIndex: 0,
      name: 'Fallback_Items',
      headers: ['اسم الصنف', 'الكمية', 'سعر الوحدة', 'الإجمالي'],
      rows: rawRows,
      confidence: 0.60,
      isPrimaryInvoiceTable: true
    };

    const canonicalDoc: CanonicalImportDocument = {
      id: `can-fallback-${Date.now()}`,
      source: {
        type: 'IMAGE',
        fileName: file instanceof File ? file.name : 'fallback_doc.png'
      },
      metadata: {
        extractionMethod: 'OCR',
        extractedAt: new Date().toISOString(),
        parserVersion: '2.5.0',
        confidence: 0.60
      },
      documentFields: {
        supplierName: localResult.supplier,
        invoiceNumber: localResult.invoice_number,
        invoiceDate: localResult.date,
        notes: localResult.notes
      },
      tables: [table],
      warnings: [
        {
          code: 'FALLBACK_ENGINE_ACTIVE',
          message: 'تم تشغيل المحرك الاحتياطي المحلي بسبب تعذر الاتصال بالخادم. يرجى مراجعة وتدقيق البنود بعناية.',
          severity: 'WARNING'
        }
      ],
      diagnostics: []
    };

    return {
      canonicalDoc,
      providerType: this.type,
      providerName: this.name,
      executionTimeMs,
      rawText: localResult.notes,
      diagnostics: [],
      confidence: 0.60,
      isFallbackUsed: true,
      fallbackReason: 'تعذر المعالجة عبر المحركات الرئيسية؛ تم تفعيل المحرك الاحتياطي'
    };
  }
}
