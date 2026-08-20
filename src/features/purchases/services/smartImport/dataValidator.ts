// src/features/purchases/services/smartImport/dataValidator.ts
import { ExtractedImportRow, RowValidationStatus, ImportSummary } from './types';

export class DataValidator {
  /**
   * Normalizes an expiry date string into standard YYYY-MM-DD format
   */
  static normalizeExpiryDate(rawDate: string): { normalizedDate?: string; isValid: boolean; isExpired?: boolean; error?: string } {
    if (!rawDate || !rawDate.trim()) {
      return { isValid: true }; // Optional field, so empty is not an error
    }

    const clean = rawDate.trim().replace(/\s+/g, '');
    let year: number = 0;
    let month: number = 0;
    let day: number = 1;

    // Pattern 1: YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
    let match = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (match && match[1] && match[2] && match[3]) {
      year = parseInt(match[1], 10);
      month = parseInt(match[2], 10);
      day = parseInt(match[3], 10);
    } else {
      // Pattern 2: DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
      match = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
      if (match && match[1] && match[2] && match[3]) {
        day = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        year = parseInt(match[3], 10);
      } else {
        // Pattern 3: MM/YYYY or MM-YYYY
        match = clean.match(/^(\d{1,2})[-/.](\d{4})$/);
        if (match && match[1] && match[2]) {
          month = parseInt(match[1], 10);
          year = parseInt(match[2], 10);
          day = 1;
        } else {
          // Pattern 4: YYYY/MM or YYYY-MM
          match = clean.match(/^(\d{4})[-/.](\d{1,2})$/);
          if (match && match[1] && match[2]) {
            year = parseInt(match[1], 10);
            month = parseInt(match[2], 10);
            day = 1;
          }
        }
      }
    }

    if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
      return {
        isValid: false,
        error: `تنسيق تاريخ الصلاحية غير صالح: (${rawDate})`
      };
    }

    const paddedMonth = month.toString().padStart(2, '0');
    const paddedDay = day.toString().padStart(2, '0');
    const normalized = `${year}-${paddedMonth}-${paddedDay}`;

    // Check if expired
    const expDate = new Date(year, month - 1, day);
    const now = new Date();
    const isExpired = expDate < now;

    return {
      isValid: true,
      normalizedDate: normalized,
      isExpired
    };
  }

  /**
   * Validates an extracted invoice row and sets validation issues and status
   */
  static validateRow(
    row: Partial<ExtractedImportRow>,
    rowNumber: number,
    seenItemsMap: Map<string, number>
  ): ExtractedImportRow {
    const issues: string[] = [];
    let status: RowValidationStatus = 'VALID';

    // 1. Check Product Name
    const name = (row.productName || '').trim();
    if (!name || name.length < 2) {
      status = 'MISSING_PRODUCT_NAME';
      issues.push('اسم الصنف مفقود أو غير مكتمل');
    }

    // 2. Check Quantity
    const qty = row.quantity !== undefined ? Number(row.quantity) : 0;
    if (isNaN(qty) || qty <= 0) {
      status = 'INVALID_QUANTITY';
      issues.push('الكمية يجب أن تكون أكبر من الصفر');
    }

    // 3. Check Unit Price
    const price = row.unitPrice !== undefined ? Number(row.unitPrice) : 0;
    if (isNaN(price) || price < 0) {
      status = 'INVALID_PRICE';
      issues.push('سعر الوحدة غير صالح');
    }

    // 4. Check Calculation Math (Qty × Price vs Total)
    const discount = Number(row.discountPercent || 0);
    const calculatedSubtotal = qty * price;
    const expectedTotal = discount > 0 
      ? calculatedSubtotal * (1 - discount / 100) 
      : calculatedSubtotal;

    const supplierTotal = row.total !== undefined ? Number(row.total) : undefined;

    if (supplierTotal !== undefined && supplierTotal > 0 && qty > 0 && price > 0) {
      const diff = Math.abs(supplierTotal - expectedTotal);
      // Tolerance of 0.5 currency unit or 1%
      const tolerance = Math.max(0.5, expectedTotal * 0.01);
      if (diff > tolerance) {
        status = 'PRICE_TOTAL_MISMATCH';
        issues.push(`فارق في الإجمالي: الحسابي (${expectedTotal.toFixed(2)}) ≠ إجمالي المورد (${supplierTotal.toFixed(2)})`);
      }
    }

    // 5. Expiry Date validation
    let normalizedExpiry: string | undefined = undefined;
    if (row.expiryDate) {
      const expResult = this.normalizeExpiryDate(row.expiryDate);
      if (!expResult.isValid) {
        if (status === 'VALID') status = 'INVALID_EXPIRY';
        issues.push(expResult.error || 'تاريخ الصلاحية غير صالح');
      } else {
        normalizedExpiry = expResult.normalizedDate;
        if (expResult.isExpired) {
          issues.push('⚠️ تنبيه: تاريخ الصلاحية منتهي أو قارب على الانتهاء');
        }
      }
    }

    // 6. Duplicate check in the same import file
    let isDuplicate = false;
    let duplicateReason: string | undefined = undefined;
    if (name) {
      const key = `${name.toLowerCase()}__${row.batchNumber || ''}__${row.barcode || ''}`;
      if (seenItemsMap.has(key)) {
        isDuplicate = true;
        duplicateReason = `مكرر مع السطر رقم #${seenItemsMap.get(key)}`;
        issues.push(`⚠️ تنبيه: تكرار الصنف داخل نفس الفاتورة (${duplicateReason})`);
      } else {
        seenItemsMap.set(key, rowNumber);
      }
    }

    return {
      rowNumber,
      rawCells: row.rawCells || {},
      productName: name,
      quantity: qty > 0 ? qty : 1,
      unitPrice: price >= 0 ? price : 0,
      total: supplierTotal !== undefined ? supplierTotal : expectedTotal,
      expectedTotal,
      barcode: row.barcode,
      productCode: row.productCode,
      batchNumber: row.batchNumber,
      expiryDate: normalizedExpiry || row.expiryDate,
      discountPercent: discount,
      tax: row.tax,
      bonusQty: row.bonusQty,
      unit: row.unit,
      notes: row.notes,
      status,
      validationIssues: issues,
      isDuplicate,
      duplicateReason
    };
  }

  /**
   * Generates a comprehensive summary from validated rows
   */
  static generateSummary(rows: ExtractedImportRow[]): ImportSummary {
    let validCount = 0;
    let reviewCount = 0;
    let skippedCount = 0;
    let newCandidatesCount = 0;
    let duplicateCount = 0;
    let totalAmount = 0;

    for (const row of rows) {
      if (row.isSkipped) {
        skippedCount++;
        continue;
      }

      if (row.status === 'VALID') {
        validCount++;
      } else {
        reviewCount++;
      }

      if (row.isNewProductCandidate) {
        newCandidatesCount++;
      }

      if (row.isDuplicate) {
        duplicateCount++;
      }

      totalAmount += (row.total || (row.quantity * row.unitPrice));
    }

    return {
      totalRowsDetected: rows.length,
      validRowsCount: validCount,
      reviewRequiredCount: reviewCount,
      skippedRowsCount: skippedCount,
      newProductCandidatesCount: newCandidatesCount,
      duplicateCandidatesCount: duplicateCount,
      totalInvoiceAmount: Math.round(totalAmount * 100) / 100
    };
  }
}
