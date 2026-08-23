// src/features/purchases/services/smartImport/providers/localOcrProvider.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.5: Local OCR Provider
 */

import { 
  IDocumentExtractionProvider, 
  ExtractionProviderResult, 
  ProviderHealthStatus, 
  ExtractionProviderType 
} from './provider.types';
import { 
  ImportParseContext, 
  ImportSourceType, 
  CanonicalImportDocument, 
  CanonicalImportTable, 
  CanonicalImportRawRow 
} from '../types';
import { OCRDocumentParser } from '../ocrDocumentParser';

export class LocalOcrProvider implements IDocumentExtractionProvider {
  public readonly name = 'LocalOcrEngine';
  public readonly type: ExtractionProviderType = 'OCR';
  public healthStatus: ProviderHealthStatus = 'HEALTHY';

  public canExtract(file: File | string, sourceType: ImportSourceType): boolean {
    return (
      sourceType === 'IMAGE' ||
      sourceType === 'CAMERA' ||
      sourceType === 'PDF_SCANNED' ||
      sourceType === 'PDF' ||
      (typeof file === 'string' && (file.startsWith('data:') || file.endsWith('.jpg') || file.endsWith('.png')))
    );
  }

  public async extract(
    file: File | string, 
    context: ImportParseContext
  ): Promise<ExtractionProviderResult> {
    const startTime = Date.now();
    const { onProgress } = context;

    onProgress?.(35, 'جاري تشغيل محرك OCR المحلي للتعرف على محتويات المستند...');

    try {
      const ocrResult = await OCRDocumentParser.parseDocument(file);
      const executionTimeMs = Date.now() - startTime;

      const rawRows: CanonicalImportRawRow[] = (ocrResult.rows || []).map((row, idx) => ({
        sourceRowIndex: idx + 1,
        cells: {
          productName: row.productName || '',
          quantity: row.quantity || 1,
          unitPrice: row.unitPrice || 0,
          total: row.total,
          expiryDate: row.expiryDate,
          batchNumber: row.batchNumber,
          discount: row.discountPercent,
          barcode: row.barcode,
          bonusQty: row.bonusQty,
          unit: row.unit,
          notes: row.notes
        },
        rawCells: [
          row.productName,
          row.quantity,
          row.unitPrice,
          row.total,
          row.expiryDate,
          row.batchNumber,
          row.barcode
        ],
        sourceReference: { row: idx + 1 }
      }));

      const table: CanonicalImportTable = {
        id: `ocr-tbl-${Date.now()}`,
        sourceIndex: 0,
        name: 'Local_OCR_Items',
        headers: ['اسم الصنف', 'الكمية', 'سعر الوحدة', 'الإجمالي', 'الصلاحية', 'التشغيلة', 'الباركود'],
        rows: rawRows,
        confidence: 0.82,
        isPrimaryInvoiceTable: true
      };

      const canonicalDoc: CanonicalImportDocument = {
        id: `can-ocr-${Date.now()}`,
        source: {
          type: 'IMAGE',
          fileName: file instanceof File ? file.name : 'ocr_scan.png',
          size: file instanceof File ? file.size : 0
        },
        metadata: {
          extractionMethod: 'OCR',
          extractedAt: new Date().toISOString(),
          parserVersion: '2.5.0',
          confidence: 0.82
        },
        documentFields: {
          supplierName: ocrResult.supplier,
          invoiceNumber: ocrResult.invoiceNumber,
          invoiceDate: ocrResult.date,
          notes: ocrResult.rawText
        },
        tables: [table],
        warnings: [],
        diagnostics: []
      };

      return {
        canonicalDoc,
        providerType: this.type,
        providerName: this.name,
        executionTimeMs,
        rawText: ocrResult.rawText,
        diagnostics: [],
        confidence: 0.82,
        isFallbackUsed: false
      };
    } catch (err: any) {
      this.healthStatus = 'DEGRADED';
      throw new Error(`فشل محرك OCR المحلي: ${err?.message || 'خطأ غير معروف'}`);
    }
  }
}
