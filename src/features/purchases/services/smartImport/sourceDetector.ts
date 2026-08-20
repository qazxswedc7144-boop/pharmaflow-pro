// src/features/purchases/services/smartImport/sourceDetector.ts
import { ImportSourceType } from './types';

export const IMPORT_LIMITS = {
  MAX_EXCEL_FILE_SIZE: 20 * 1024 * 1024, // 20 MB
  MAX_CSV_FILE_SIZE: 15 * 1024 * 1024,   // 15 MB
  MAX_PDF_FILE_SIZE: 25 * 1024 * 1024,   // 25 MB
  MAX_IMAGE_FILE_SIZE: 15 * 1024 * 1024, // 15 MB
  MAX_TOTAL_ROWS: 5000,
  MAX_PROCESSING_TIMEOUT_MS: 30000,
  SUPPORTED_IMAGE_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.jfif'],
  SUPPORTED_EXCEL_EXTENSIONS: ['.xlsx', '.xls', '.xlsm', '.xlsb'],
  SUPPORTED_CSV_EXTENSIONS: ['.csv', '.tsv', '.txt'],
  SUPPORTED_PDF_EXTENSIONS: ['.pdf']
};

export interface FileValidationResult {
  isValid: boolean;
  sourceType: ImportSourceType;
  fileName: string;
  fileSize: number;
  errorMessage?: string;
  errorCode?: string;
}

/**
 * Enterprise Source Detection & File Security Gatekeeper
 */
export class SourceDetector {
  /**
   * Sniffs and detects the file source type based on extension, MIME type, or data URI
   */
  static detectSourceType(file: File | string, fileNameOverride?: string): ImportSourceType {
    if (typeof file === 'string') {
      if (file.startsWith('data:image/')) return 'IMAGE';
      if (file.startsWith('data:application/pdf')) return 'PDF';
      if (file.startsWith('data:text/csv') || file.startsWith('data:application/vnd.ms-excel')) return 'CSV';
      // String might be a camera capture or base64
      if (file.startsWith('data:')) return 'CAMERA';
      const lower = file.toLowerCase();
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'EXCEL';
      if (lower.endsWith('.csv')) return 'CSV';
      if (lower.endsWith('.pdf')) return 'PDF';
      if (IMPORT_LIMITS.SUPPORTED_IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext))) return 'IMAGE';
      return 'UNKNOWN';
    }

    const name = (fileNameOverride || file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();

    // 1. Check Excel
    if (
      IMPORT_LIMITS.SUPPORTED_EXCEL_EXTENSIONS.some(ext => name.endsWith(ext)) ||
      type.includes('spreadsheetml') ||
      type.includes('ms-excel') ||
      type.includes('vnd.openxmlformats-officedocument.spreadsheetml')
    ) {
      return 'EXCEL';
    }

    // 2. Check CSV
    if (
      IMPORT_LIMITS.SUPPORTED_CSV_EXTENSIONS.some(ext => name.endsWith(ext)) ||
      type.includes('csv') ||
      type.includes('comma-separated-values') ||
      (type === 'text/plain' && name.endsWith('.csv'))
    ) {
      return 'CSV';
    }

    // 3. Check PDF
    if (name.endsWith('.pdf') || type === 'application/pdf') {
      return 'PDF';
    }

    // 4. Check Image / Camera
    if (
      IMPORT_LIMITS.SUPPORTED_IMAGE_EXTENSIONS.some(ext => name.endsWith(ext)) ||
      type.startsWith('image/')
    ) {
      return 'IMAGE';
    }

    return 'UNKNOWN';
  }

  /**
   * Validates file size, type, and security constraints safely
   */
  static validateFile(file: File | string): FileValidationResult {
    let fileName = 'file_import';
    let fileSize = 0;

    if (typeof file === 'string') {
      fileSize = file.length;
      fileName = file.startsWith('data:') ? 'camera_or_base64_capture' : 'inline_data';
    } else if (file instanceof File) {
      fileName = file.name;
      fileSize = file.size;
    }

    const sourceType = this.detectSourceType(file, fileName);

    if (sourceType === 'UNKNOWN') {
      return {
        isValid: false,
        sourceType,
        fileName,
        fileSize,
        errorCode: 'UNSUPPORTED_FILE',
        errorMessage: `صيغة الملف غير مدعومة (${fileName}). الصيغ المدعومة تشمل Excel (.xlsx, .xls) و CSV والصور (JPG, PNG, WEBP) و PDF.`
      };
    }

    // Size limit enforcement per type
    let maxSize = IMPORT_LIMITS.MAX_EXCEL_FILE_SIZE;
    if (sourceType === 'CSV') maxSize = IMPORT_LIMITS.MAX_CSV_FILE_SIZE;
    if (sourceType === 'PDF') maxSize = IMPORT_LIMITS.MAX_PDF_FILE_SIZE;
    if (sourceType === 'IMAGE' || sourceType === 'CAMERA') maxSize = IMPORT_LIMITS.MAX_IMAGE_FILE_SIZE;

    if (fileSize > maxSize) {
      const mb = Math.round(maxSize / (1024 * 1024));
      return {
        isValid: false,
        sourceType,
        fileName,
        fileSize,
        errorCode: 'FILE_TOO_LARGE',
        errorMessage: `حجم الملف (${(fileSize / (1024 * 1024)).toFixed(1)} ميجابايت) يتجاوز الحد الأقصى المسموح به (${mb} ميجابايت).`
      };
    }

    if (fileSize === 0) {
      return {
        isValid: false,
        sourceType,
        fileName,
        fileSize,
        errorCode: 'EMPTY_FILE',
        errorMessage: 'الملف فارغ أو لا يحتوي على أي بيانات صالحة للقراءة.'
      };
    }

    return {
      isValid: true,
      sourceType,
      fileName,
      fileSize
    };
  }
}
