// src/features/purchases/services/smartImport/spreadsheetParser.ts
import readXlsxFile from 'read-excel-file/browser';
import { IMPORT_LIMITS } from './sourceDetector';
import { ColumnIntelligence } from './columnIntelligence';
import { ColumnDefinition } from './types';

/**
 * Enterprise Spreadsheet & CSV Parser for PharmaFlow PRO ERP
 */
export class SpreadsheetParser {
  /**
   * Converts Eastern Arabic (٠-٩) and Persian (۰-۹) numerals into standard ASCII digits (0-9)
   */
  static normalizeNumerals(val: string): string {
    if (!val) return '';
    return val
      .replace(/[\u0660-\u0669]/g, d => (d.charCodeAt(0) - 0x0660).toString())
      .replace(/[\u06F0-\u06F9]/g, d => (d.charCodeAt(0) - 0x06F0).toString());
  }

  /**
   * Sanitizes cell values to prevent Formula Injection (CSV/Excel DDE Injection)
   * and Prototype Pollution.
   */
  static sanitizeCellValue(val: any): string {
    if (val === null || val === undefined) return '';
    if (val instanceof Date) {
      try {
        return val.toISOString().split('T')[0] || '';
      } catch {
        return '';
      }
    }
    
    let str = String(val).trim();

    // Neutralize dangerous formula injection prefixes for non-numeric content
    if (/^[=+\-@\t\r]/.test(str)) {
      const withoutLeading = str.replace(/^[=+\-@\t\r]+/, '');
      // If it's just a negative number like -5.0 or +10, keep the numeric sign
      if (!isNaN(Number(withoutLeading))) {
        str = (str.startsWith('-') ? '-' : '') + withoutLeading;
      } else {
        str = withoutLeading;
      }
    }

    // Block Prototype Pollution keywords
    if (str === '__proto__' || str === 'constructor' || str === 'prototype') {
      return '';
    }

    return str;
  }

  /**
   * Parses and cleans a numeric string: removes currencies, thousand commas, and converts Arabic digits
   */
  static parseCleanNumber(val: any, defaultValue: number = 0): number {
    if (val === null || val === undefined) return defaultValue;
    if (typeof val === 'number') return isNaN(val) ? defaultValue : val;

    let str = this.normalizeNumerals(String(val).trim());
    // Strip currency symbols and whitespace
    str = str.replace(/[$€£¥﷼]/g, '')
             .replace(/(YER|SAR|USD|EGP|AED|EUR|GBP|ريال|ر\.س|ر\.ي|ج\.م|درهم|دولار)/gi, '')
             .replace(/%/g, '')
             .replace(/,/g, '') // remove thousand separators
             .trim();

    const num = parseFloat(str);
    return isNaN(num) ? defaultValue : num;
  }

  /**
   * Parses CSV string safely supporting multiline values, quotes, and various delimiters
   */
  static parseCSVText(csvText: string): string[][] {
    const rows: string[][] = [];
    const lines = csvText.split(/\r?\n/);
    
    for (const line of lines) {
      if (!line.trim()) continue;
      if (rows.length >= IMPORT_LIMITS.MAX_TOTAL_ROWS) break;

      const row: string[] = [];
      let insideQuotes = false;
      let currentCell = '';
      
      // Delimiter detection for current line
      let delimiter = ',';
      if (line.includes('\t')) delimiter = '\t';
      else if (line.includes(';') && !line.includes(',')) delimiter = ';';

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (insideQuotes && line[i + 1] === '"') {
            currentCell += '"';
            i++;
          } else {
            insideQuotes = !insideQuotes;
          }
        } else if (char === delimiter && !insideQuotes) {
          row.push(this.sanitizeCellValue(currentCell));
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
      row.push(this.sanitizeCellValue(currentCell));
      if (row.length > 0 && row.some(c => c.length > 0)) {
        rows.push(row);
      }
    }
    return rows;
  }

  /**
   * Detects whether a row represents a summary, footer, grand total, or signature
   */
  static isFooterOrSummaryRow(row: string[]): boolean {
    const rawCombined = row.join(' ').toLowerCase();
    const normalizedCombined = rawCombined
      .replace(/[إأآا]/g, 'ا')
      .replace(/[\u064B-\u065F]/g, '')
      .replace(/\s+/g, ' ');

    const footerKeywords = [
      'grand total', 'subtotal', 'sub total', 'vat total', 'net total', 'total amount',
      'اجمالي عام', 'الاجمالي العام', 'المجموع الكلي', 'مجموع كلي', 'اجمالي الفاتورة', 'صافي الفاتورة',
      'الاجمالي النهائي', 'المجموع النهائي', 'اجمالي كلي',
      'توقيع', 'المستلم', 'المدير', 'signature', 'received by', 'approved by', 'page', 'صفحة'
    ];

    return footerKeywords.some(k => {
      const normK = k.replace(/[إأآا]/g, 'ا');
      return normalizedCombined.includes(normK) || rawCombined.includes(k);
    });
  }

  /**
   * Detects the probable header row in the table (scanning rows 0 through 25)
   */
  static findTableHeaders(rows: string[][]): { headerRowIndex: number; columnDefs: ColumnDefinition[] } {
    const maxScanRows = Math.min(rows.length, 25);
    let bestHeaderRowIndex = 0;
    let highestMatchScore = -1;
    let bestColumnDefs: ColumnDefinition[] = [];

    const sampleLookahead = 5;

    for (let r = 0; r < maxScanRows; r++) {
      const candidateRow = rows[r];
      if (!candidateRow || candidateRow.length === 0) continue;

      // Extract sample values from subsequent rows for each column
      const samplesByCol: string[][] = candidateRow.map((_, colIdx) => {
        const samples: string[] = [];
        for (let s = r + 1; s < Math.min(rows.length, r + 1 + sampleLookahead); s++) {
          const sampleRow = rows[s];
          if (sampleRow && sampleRow[colIdx]) {
            samples.push(sampleRow[colIdx] || '');
          }
        }
        return samples;
      });

      const colDefs = ColumnIntelligence.analyzeHeaders(candidateRow, samplesByCol);

      // Score this row as a potential header row
      // We want rows that have matched key fields (productName, quantity, unitPrice)
      let score = 0;
      colDefs.forEach(def => {
        if (def.mappedField === 'productName') score += 50;
        else if (def.mappedField === 'quantity') score += 40;
        else if (def.mappedField === 'unitPrice' || def.mappedField === 'total') score += 30;
        else if (def.mappedField !== 'ignore') score += 15;
      });

      if (score > highestMatchScore) {
        highestMatchScore = score;
        bestHeaderRowIndex = r;
        bestColumnDefs = colDefs;
      }

      // If we found a confident header row with both product name and quantity
      if (score >= 90) {
        break;
      }
    }

    return {
      headerRowIndex: bestHeaderRowIndex,
      columnDefs: bestColumnDefs
    };
  }

  /**
   * Parses an Excel File or CSV into a normalized 2D matrix of cleaned string cells
   */
  static async parseFileToGrid(file: File): Promise<string[][]> {
    const name = file.name.toLowerCase();
    
    if (name.endsWith('.csv') || file.type.includes('csv') || file.type === 'text/plain') {
      const text = await file.text();
      return this.parseCSVText(text);
    }

    // Try reading via read-excel-file
    try {
      const rawRows = await readXlsxFile(file);
      if (!rawRows || (rawRows as any[]).length === 0) {
        throw new Error('ملف الاكسل فارغ');
      }

      return (rawRows as any[]).slice(0, IMPORT_LIMITS.MAX_TOTAL_ROWS).map((row: any) =>
        (Array.isArray(row) ? row : []).map((cell: any) => this.sanitizeCellValue(cell))
      );
    } catch (parseErr: any) {
      // Fallback: try parsing as text/CSV if XLSX engine couldn't handle it
      try {
        const text = await file.text();
        const csvGrid = this.parseCSVText(text);
        if (csvGrid.length > 0) return csvGrid;
      } catch {
        // ignore fallback failure
      }
      throw new Error(`فشل قراءة ملف الاكسل: ${parseErr.message || 'تنسيق الملف غير مدعوم'}`);
    }
  }
}
