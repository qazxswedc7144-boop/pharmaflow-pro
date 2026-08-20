// src/features/purchases/services/smartImport/types.ts
/**
 * Types & Data Contracts for PharmaFlow Enterprise Smart Purchase Import Engine
 */

export type ImportSourceType = 'EXCEL' | 'CSV' | 'IMAGE' | 'PDF' | 'CAMERA' | 'UNKNOWN';

export type TargetField = 
  | 'productName' 
  | 'quantity' 
  | 'unitPrice' 
  | 'total' 
  | 'batchNumber' 
  | 'expiryDate' 
  | 'discount' 
  | 'tax' 
  | 'barcode' 
  | 'productCode' 
  | 'bonusQty' 
  | 'unit' 
  | 'notes' 
  | 'ignore';

export interface ColumnDefinition {
  index: number;
  rawHeader: string;
  normalizedHeader: string;
  mappedField: TargetField;
  confidence: number; // 0 to 100
  isAutoMapped: boolean;
  sampleValues: string[];
}

export type RowValidationStatus = 
  | 'VALID'
  | 'WARNING'
  | 'INVALID_PRICE'
  | 'INVALID_QUANTITY'
  | 'MISSING_PRODUCT_NAME'
  | 'PRICE_TOTAL_MISMATCH'
  | 'INVALID_EXPIRY'
  | 'DUPLICATE_CANDIDATE'
  | 'NEW_PRODUCT_CANDIDATE'
  | 'FOOTER_IGNORED'
  | 'EMPTY_ROW';

export interface ExtractedImportRow {
  rowNumber: number;
  rawCells: Record<string, string>;
  productName: string;
  quantity: number;
  unitPrice: number;
  total?: number;
  expectedTotal?: number;
  barcode?: string;
  productCode?: string;
  batchNumber?: string;
  expiryDate?: string;
  discountPercent?: number;
  tax?: number;
  bonusQty?: number;
  unit?: string;
  notes?: string;
  
  // Intelligence & Matching
  matchedProductId?: string;
  matchedProductName?: string;
  matchType?: 'EXACT' | 'NORMALIZED' | 'BARCODE' | 'CODE' | 'ALIAS' | 'FUZZY' | 'NONE';
  matchScore?: number;
  isNewProductCandidate?: boolean;
  
  // Validation
  status: RowValidationStatus;
  validationIssues: string[];
  isDuplicate?: boolean;
  duplicateReason?: string;
  isSkipped?: boolean;
}

export interface ImportSummary {
  totalRowsDetected: number;
  validRowsCount: number;
  reviewRequiredCount: number;
  skippedRowsCount: number;
  newProductCandidatesCount: number;
  duplicateCandidatesCount: number;
  totalInvoiceAmount: number;
  detectedSupplier?: string;
  detectedInvoiceNumber?: string;
  detectedDate?: string;
}

export interface ImportAnalysisResult {
  sourceType: ImportSourceType;
  fileName: string;
  fileSize: number;
  detectedColumns: ColumnDefinition[];
  headerRowIndex: number;
  rows: ExtractedImportRow[];
  summary: ImportSummary;
  rawText?: string;
  metadata: {
    tenantId: string;
    branchId: string;
    userId: string;
    analyzedAt: string;
    processingTimeMs: number;
  };
}

export interface SmartImportProgressCallback {
  (stage: 'DETECTING_SOURCE' | 'PARSING_DOCUMENT' | 'DETECTING_COLUMNS' | 'EXTRACTING_ROWS' | 'MATCHING_PRODUCTS' | 'VALIDATING_DATA' | 'READY_FOR_REVIEW', progressPercent: number, message: string): void;
}
