import { createWorker } from 'tesseract.js';
import { ExtractedImportRow } from './types';

export type OCRRow = Partial<ExtractedImportRow>;

export interface OCRResult {
  rows: OCRRow[];
  supplier?: string;
  invoiceNumber?: string;
  date?: string;
  rawText?: string;
}

// ---------------------------------------------------------------------------
// 1. Text & Digit Normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes Eastern Arabic (٠-٩) and Persian (۰-۹) digits to standard ASCII (0-9).
 * Also converts Arabic decimal comma (٫) and separator (٬).
 */
export function normalizeArabicDigits(value: string): string {
  if (!value) return '';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const easternDigits = '۰۱۲۳۴۵۶۷۸۹';
  return value
    .replace(/[٠-٩]/g, char => String(arabicDigits.indexOf(char)))
    .replace(/[۰-۹]/g, char => String(easternDigits.indexOf(char)))
    .replace(/\u066B/g, '.') // Arabic decimal separator
    .replace(/\u066C/g, ','); // Arabic thousands separator
}

/**
 * Cleans and normalizes Arabic text (removes harakat/tashkeel, tatweel, standardizes alef/taa/yaa).
 */
export function normalizeArabicText(value: string): string {
  if (!value) return '';
  return value
    .replace(/[\u064B-\u065F\u0670]/g, '') // Tashkeel / Harakat
    .replace(/\u0640/g, '') // Tatweel (Kashida)
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ة(?=[\s\p{P}]|$)/gu, 'ه')
    .replace(/ى(?=[\s\p{P}]|$)/gu, 'ي')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width spaces
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Standardizes raw OCR output by handling line breaks and spaces.
 */
export function normalizeOCRText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Parses numeric strings into numbers safely. Handles thousands commas and decimal points.
 */
export function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  let clean = normalizeArabicDigits(value).trim();

  // Strip currency markers
  clean = clean
    .replace(/(?:ج\.م|د\.أ|ر\.س|ريال|جنيه|دينار|درهم|EGP|SAR|USD|JOD|EUR|LE|\$|€|£)/gi, '')
    .trim();

  // Handle accounting brackets (120.00) => -120.00
  const isNegative = clean.startsWith('(') && clean.endsWith(')');
  clean = clean.replace(/[()]/g, '');

  // Handle number separators
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(clean)) {
    // European style 1.250,50
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(clean)) {
    // US style 1,250.50
    clean = clean.replace(/,/g, '');
  } else if (clean.includes(',') && !clean.includes('.')) {
    if (/,\d{1,2}$/.test(clean)) {
      clean = clean.replace(',', '.');
    } else {
      clean = clean.replace(/,/g, '');
    }
  }

  clean = clean.replace(/[^\d.-]/g, '');
  if (!clean || clean === '-' || clean === '.') return undefined;

  const parsed = Number(clean);
  if (!Number.isFinite(parsed)) return undefined;
  return isNegative ? -Math.abs(parsed) : parsed;
}

// ---------------------------------------------------------------------------
// 2. Metadata Extraction (Date, Invoice Number, Supplier)
// ---------------------------------------------------------------------------

/**
 * Extracts invoice date supporting standard formats (YYYY-MM-DD, DD/MM/YYYY, etc.)
 */
export function extractDate(text: string): string | undefined {
  const normalized = normalizeArabicDigits(text);

  // 1. Look for labeled date first (e.g. التاريخ: 2026/05/12 or Date: 12-05-2026)
  const labeledMatch = normalized.match(
    /(?:التاريخ|تاريخ الفاتورة|تاريخ المستند|تاريخ التحرير|date|inv(?:oice)?\s*date)\s*[:#-]?\s*([0-9]{2,4}[-/.\\][0-9]{1,2}[-/.\\][0-9]{2,4})/i
  );
  const dateStr = labeledMatch ? labeledMatch[1] : undefined;

  const rawCandidate =
    dateStr ||
    normalized.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/)?.[0] ||
    normalized.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/)?.[0] ||
    normalized.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})\b/)?.[0];

  if (!rawCandidate) return undefined;

  const parts = rawCandidate.split(/[-/.\\]/);
  if (parts.length !== 3) return undefined;
  const part0 = parts[0];
  const part1 = parts[1];
  const part2 = parts[2];
  if (!part0 || !part1 || !part2) return undefined;

  let year: number;
  let month: number;
  let day: number;

  if (part0.length === 4) {
    // YYYY-MM-DD
    year = Number(part0);
    month = Number(part1);
    day = Number(part2);
  } else if (part2.length === 4) {
    // DD-MM-YYYY or MM-DD-YYYY
    year = Number(part2);
    const p0 = Number(part0);
    const p1 = Number(part1);
    if (p0 > 12 && p1 <= 12) {
      day = p0;
      month = p1;
    } else if (p1 > 12 && p0 <= 12) {
      month = p0;
      day = p1;
    } else {
      // Default standard Middle Eastern / European: DD-MM-YYYY
      day = p0;
      month = p1;
    }
  } else if (part2.length === 2) {
    // DD-MM-YY
    year = 2000 + Number(part2);
    day = Number(part0);
    month = Number(part1);
  } else {
    return undefined;
  }

  if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2050) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return undefined;
}

/**
 * Extracts invoice number using diverse label patterns and formats.
 */
export function extractInvoiceNumber(text: string): string | undefined {
  const normalized = normalizeArabicDigits(text);
  const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);

  // Pattern with label on same line
  const regexPatterns = [
    /(?:رقم الفاتورة|رقم الفاتوره|فاتورة رقم|فاتوره رقم|الفاتورة رقم|الفاتوره رقم|رقم السند|سند رقم|رقم القائمة|رقم الاشعار|رقم المرجع|رقم الطلبية|invoice\s*(?:no|number|#)?|inv\s*(?:no|number|#)?|bill\s*(?:no|#)?)\s*[:#-]?\s*([A-Za-z0-9/_-]+)/i,
    /(?:^|\s)#\s*([A-Za-z0-9/_-]{3,20})/
  ];

  for (const line of lines) {
    for (const pattern of regexPatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].trim();
        // Ignore if candidate is purely a short word like "no" or "num"
        if (candidate.length >= 2 && !/^(no|num|id|date)$/i.test(candidate)) {
          return candidate;
        }
      }
    }
  }

  // Check case where label is on one line and the number is immediately on the next line
  for (let i = 0; i < lines.length - 1; i++) {
    const currentLine = lines[i]?.toLowerCase() ?? '';
    if (
      /^(?:رقم الفاتورة|رقم الفاتوره|فاتورة رقم|فاتوره رقم|invoice\s*no|inv\s*#|bill\s*no)\s*[:#-]?$/i.test(
        currentLine
      )
    ) {
      const nextLine = lines[i + 1]?.trim() ?? '';
      const nextMatch = nextLine.match(/^([A-Za-z0-9/_-]{2,25})$/);
      if (nextMatch && nextMatch[1]) {
        return nextMatch[1];
      }
    }
  }

  return undefined;
}

export interface SupplierExtractionDetails {
  supplierName?: string;
  strategy?: 'EXPLICIT_LABEL' | 'HEADER_COMPANY' | 'PROXIMITY_META' | 'CATALOG_MATCH';
  confidence: number;
  reason: string;
  candidateLines?: string[];
}

/**
 * Extracts detailed supplier metadata from OCR text using 4 distinct strategies:
 * 1. Explicit supplier keywords/labels (المورد / موردية / supplier / vendor)
 * 2. Company name / brand in invoice header (top lines)
 * 3. Proximity to invoice number and date lines
 * 4. Catalog matching against known suppliers if provided
 */
export function extractSupplierDetails(
  text: string, 
  knownSuppliers?: (string | { name?: string; Supplier_Name?: string })[]
): SupplierExtractionDetails {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);

  if (lines.length === 0) {
    return {
      supplierName: undefined,
      confidence: 0,
      reason: 'نص المستند فارغ ولا يحتوي على بيانات مورد'
    };
  }

  const cleanValue = (val: string): string => {
    return val
      .replace(/^[-*•:#\s\/\\]+|[-*•:#\s\/\\]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const blacklistKeywords = [
    'فاتورة',
    'فاتوره',
    'ضريبية',
    'ضريبه',
    'مبيعات',
    'مشتريات',
    'عرض أسعار',
    'سند',
    'إشعار',
    'المملكة',
    'الجمهورية',
    'وزارة',
    'tax invoice',
    'sales invoice',
    'cash receipt',
    'تلفون',
    'هاتف',
    'فاكس',
    'ص.ب',
    'سجل تجاري',
    'رقم ضريبي',
    'الرقم الضريبي',
    'العنوان',
    'شارع',
    'صندوق بريد',
    'tel',
    'phone',
    'email',
    'vat',
    'c.r'
  ];

  // Helper to check if line is purely blacklisted
  const isBlacklisted = (lineStr: string): boolean => {
    const norm = normalizeArabicText(lineStr).toLowerCase();
    return blacklistKeywords.some(b => norm.includes(b));
  };

  // --- STRATEGY 1: Explicit Supplier Labels ---
  const explicitPattern = /^(?:المورد|اسم المورد|مورد|موردية|الموردية|جهة التوريد|الجهة الموردة|الشركة الموردة|السادة|الساده|مستودع|supplier|vendor|from|billed by|issuer|sold by)\s*[:：\-\/]/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (explicitPattern.test(line)) {
      const parts = line.split(/[:：\-\/]/);
      if (parts.length >= 2) {
        const val = cleanValue(parts.slice(1).join(':'));
        if (val.length >= 3 && !looksLikeHeader(val) && !isBlacklisted(val)) {
          return {
            supplierName: val,
            strategy: 'EXPLICIT_LABEL',
            confidence: 0.95,
            reason: `تم التعرف على المورد بواسطة دلالة صريحة في المستند: "${val}"`
          };
        }
      }
      // Check next line if current line only had the label
      if (i + 1 < lines.length) {
        const nextLine = cleanValue(lines[i + 1]);
        if (nextLine.length >= 3 && !looksLikeHeader(nextLine) && !isBlacklisted(nextLine)) {
          return {
            supplierName: nextLine,
            strategy: 'EXPLICIT_LABEL',
            confidence: 0.92,
            reason: `تم التعرف على المورد في السطر التالي لدلالة التوريد: "${nextLine}"`
          };
        }
      }
    }
  }

  // --- STRATEGY 4 (Early Check): Catalog match against known suppliers ---
  if (knownSuppliers && knownSuppliers.length > 0) {
    const knownNames: string[] = knownSuppliers
      .map(s => typeof s === 'string' ? s : (s.Supplier_Name || s.name || ''))
      .map(s => s.trim())
      .filter(s => s.length >= 3);

    const topCandidateLines = lines.slice(0, 15).map(l => cleanValue(l)).filter(l => l.length >= 3 && !isBlacklisted(l));
    for (const line of topCandidateLines) {
      const normLine = normalizeArabicText(line).toLowerCase();
      for (const kName of knownNames) {
        const normK = normalizeArabicText(kName).toLowerCase();
        if (normLine === normK || normLine.includes(normK) || normK.includes(normLine)) {
          return {
            supplierName: kName,
            strategy: 'CATALOG_MATCH',
            confidence: 0.96,
            reason: `تم التعرف على المورد عبر مطابقته مع المورد المسجل في النظام: "${kName}"`
          };
        }
      }
    }
  }

  // --- STRATEGY 2: Company / Depot in Invoice Header (Top 10 lines) ---
  const companyKeywords = [
    'شركة',
    'مؤسسة',
    'مستودع',
    'مكتب',
    'مجموعة',
    'فارما',
    'pharma',
    'pharmaceutical',
    'medical',
    'distribut',
    'trading',
    'warehouse',
    'depot',
    'موزع',
    'ادوية',
    'أدوية',
    'صيدلية',
    'معمل',
    'مستلزمات',
    'توزيع',
    'وكالة',
    'وكيل',
    'تجارة',
    'استيراد'
  ];

  const topLines = lines.slice(0, 12);
  for (const line of topLines) {
    const cleaned = cleanValue(line);
    if (cleaned.length < 3 || cleaned.length > 80) continue;
    if (isBlacklisted(cleaned) || looksLikeHeader(cleaned)) continue;

    const normLine = normalizeArabicText(cleaned).toLowerCase();
    const hasCompanyKeyword = companyKeywords.some(c => normLine.includes(c));
    if (hasCompanyKeyword) {
      return {
        supplierName: cleaned,
        strategy: 'HEADER_COMPANY',
        confidence: 0.88,
        reason: `تم استخراج اسم الشركة الموردة من ترويسة الفاتورة: "${cleaned}"`
      };
    }
  }

  // --- STRATEGY 3: Proximity to Invoice Number and Date ---
  const metaAnchorRegex = /(?:رقم الفاتورة|فاتورة رقم|فاتورة\s*#|invoice\s*no|bill\s*no|التاريخ|تاريخ الفاتورة|date)/i;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i];
    if (metaAnchorRegex.test(line)) {
      // 3a. Check if the line itself contains a supplier separated by delimiter
      if (line.includes('|') || line.includes(' - ') || line.includes('//')) {
        const segments = line.split(/[|\-\/]/).map(s => cleanValue(s));
        for (const seg of segments) {
          if (seg.length >= 4 && !metaAnchorRegex.test(seg) && !isBlacklisted(seg) && !looksLikeHeader(seg)) {
            return {
              supplierName: seg,
              strategy: 'PROXIMITY_META',
              confidence: 0.78,
              reason: `تم استخراج اسم المورد بجوار بيانات الفاتورة والتاريخ: "${seg}"`
            };
          }
        }
      }

      // 3b. Check the preceding lines (1 or 2 lines above the metadata anchor)
      for (let prev = i - 1; prev >= Math.max(0, i - 2); prev--) {
        const prevLine = cleanValue(lines[prev]);
        if (prevLine.length >= 4 && prevLine.length <= 60 && !isBlacklisted(prevLine) && !looksLikeHeader(prevLine) && !metaAnchorRegex.test(prevLine)) {
          // Reject if it's purely digits or dates
          if (/^[\d\s\-\/.:]+$/.test(prevLine)) continue;
          return {
            supplierName: prevLine,
            strategy: 'PROXIMITY_META',
            confidence: 0.75,
            reason: `تم العثور على اسم محتمل للمورد في السطر السابق لبيانات الفاتورة: "${prevLine}"`
          };
        }
      }
    }
  }

  // If all 4 strategies failed to reliably detect a supplier:
  return {
    supplierName: undefined,
    confidence: 0.30,
    reason: 'لم يتم العثور على اسم المورد صراحة في ترويسة المستند أو بجوار رقم الفاتورة والتاريخ (يحتاج مراجعة واختيار يدوي)'
  };
}

/**
 * Extracts supplier name from explicit labels or from invoice header company indicators.
 */
export function extractSupplier(
  text: string, 
  knownSuppliers?: (string | { name?: string; Supplier_Name?: string })[]
): string | undefined {
  const result = extractSupplierDetails(text, knownSuppliers);
  return result.supplierName;
}

// ---------------------------------------------------------------------------
// 3. Header & Footer Detection
// ---------------------------------------------------------------------------

/**
 * Detects whether a line represents the table column header.
 */
export function looksLikeHeader(line: string): boolean {
  const norm = normalizeArabicText(line).toLowerCase();

  const keywords = [
    'صنف',
    'اسم الصنف',
    'الدواء',
    'الماده',
    'البيان',
    'الوصف',
    'كميه',
    'الكميه',
    'العدد',
    'سعر',
    'السعر',
    'سعر الوحده',
    'سعر الشراء',
    'اجمالي',
    'الاجمالي',
    'القيمه',
    'المجموع',
    'المبلغ',
    'باركود',
    'الباركود',
    'تشغيله',
    'التشغيله',
    'دفعه',
    'صلاحيه',
    'الصلاحيه',
    'انتهاء',
    'بونص',
    'مجاني',
    'خصم',
    'الخصم',
    'item',
    'description',
    'product',
    'medicine',
    'quantity',
    'qty',
    'price',
    'rate',
    'total',
    'amount',
    'barcode',
    'batch',
    'expiry',
    'exp',
    'bonus',
    'discount',
    'disc'
  ];

  let matches = 0;
  for (const kw of keywords) {
    if (norm.includes(kw)) {
      matches++;
    }
  }

  return matches >= 2;
}

/**
 * Detects whether a line is a footer / summary line (e.g. Grand Total, Net, VAT, Signatures).
 */
export function looksLikeFooter(line: string): boolean {
  const norm = normalizeArabicText(line).toLowerCase();

  const footerKeywords = [
    'اجمالي عام',
    'الاجمالي العام',
    'اجمالي الفاتوره',
    'إجمالي الفاتورة',
    'صافي الفاتوره',
    'صافي القيمة',
    'المجموع الكلي',
    'المجموع النهائي',
    'المبلغ المطلوب',
    'المسدد',
    'المدفوع',
    'المتبقي',
    'الباقي',
    'الرصيد السابق',
    'الرصيد الحالي',
    'قيمه الضريبه',
    'ضريبه القيمه المضافه',
    'مجموع الضريبه',
    'اجمالي الخصم',
    'الخصم الاضافي',
    'توقيع المستلم',
    'توقيع المحاسب',
    'امين المستودع',
    'grand total',
    'total invoice',
    'net amount',
    'subtotal',
    'total vat',
    'tax amount',
    'total discount',
    'balance due',
    'amount due',
    'signature'
  ];

  return footerKeywords.some(kw => norm.includes(kw));
}

// ---------------------------------------------------------------------------
// 4. Intelligent Row Parsing
// ---------------------------------------------------------------------------

// Factory functions for regex patterns to prevent global lastIndex state persistence
function getPharmaStrengthRegex(): RegExp {
  return /\b\d+(?:\.\d+)?\s*(?:mg|g|gm|ml|mcg|iu|l|tab|tabs|cap|caps|sachet|amp|vial|مجم|مل|جم|جرام|ملغ|قرص|كبسوله|كبسولة|امبول|فيال|حبه|حبة|باكت|شريط)\b/gi;
}
function getPackRegex(): RegExp {
  return /\b\d+\s*[*xX×]\s*\d+\b/g;
}
function getPharmaNameProtectedRegex(): RegExp {
  return /\b(?:Omega|أوميجا|اوميجا)\s*\d+\b|\b(?:Vit(?:amin)?|فيتامين)\s*[A-Za-z0-9]+\b|\b\d+(?:\.\d+)?\s*%/gi;
}
const EXPIRY_PATTERN = /\b(20\d{2}[-/.]\d{1,2}(?:[-/.]\d{1,2})?|\d{1,2}[-/.]20\d{2}|\d{1,2}[-/.]\d{2})\b/;
const BATCH_PATTERN = /\b(?:BN|LOT|BATCH|B\.N\.|تشغيلة|دفعة)[:\s#]*([A-Za-z0-9/-]{3,15})\b/i;

interface ExtractedTokens {
  productName: string;
  numbers: number[];
  expiryDate?: string;
  batchNumber?: string;
  barcode?: string;
}

/**
 * Cleans tokens and extracts name, numbers, expiry, batch, and barcode while protecting drug strengths.
 */
function extractRowComponents(line: string): ExtractedTokens | null {
  let text = normalizeArabicDigits(line).trim();
  if (text.length < 2) return null;

  // 1. Check for Expiry Date
  let expiryDate: string | undefined;
  const expMatch = text.match(EXPIRY_PATTERN);
  if (expMatch && expMatch[0]) {
    const rawExp = expMatch[0];
    const parsedExp = extractDate(rawExp);
    if (parsedExp) {
      expiryDate = parsedExp;
      text = text.replace(rawExp, ' ');
    }
  }

  // 2. Check for Batch Number
  let batchNumber: string | undefined;
  const batchMatch = text.match(BATCH_PATTERN);
  if (batchMatch && batchMatch[0]) {
    batchNumber = batchMatch[1] || batchMatch[0];
    text = text.replace(batchMatch[0], ' ');
  }

  // 3. Protect pharmaceutical strengths (e.g. 500mg, 10ml, 1g)
  // Replace spaces in strength with an underscore so they remain a single non-numeric token
  const strengthMatches = text.match(getPharmaStrengthRegex()) || [];
  const protectedStrengths: string[] = [];
  strengthMatches.forEach((s, idx) => {
    const placeholder = `__STRG${String.fromCharCode(65 + (idx % 26))}__`;
    protectedStrengths.push(s);
    text = text.replace(s, placeholder);
  });

  // 4. Protect pack patterns (e.g. 10x10)
  const packMatches = text.match(getPackRegex()) || [];
  const protectedPacks: string[] = [];
  packMatches.forEach((p, idx) => {
    const placeholder = `__PACK${String.fromCharCode(65 + (idx % 26))}__`;
    protectedPacks.push(p);
    text = text.replace(p, placeholder);
  });

  // 5. Protect pharma names with numbers (e.g. Omega 3, Vitamin D3, 0.1%)
  const nameNumMatches = text.match(getPharmaNameProtectedRegex()) || [];
  const protectedNameNums: string[] = [];
  nameNumMatches.forEach((m, idx) => {
    const placeholder = `__NNUM${String.fromCharCode(65 + (idx % 26))}__`;
    protectedNameNums.push(m);
    text = text.replace(m, placeholder);
  });

  // Split into whitespace or pipe delimited tokens
  const rawTokens = text.split(/[\s|;,؛\t]+/).filter(Boolean);
  if (rawTokens.length === 0) return null;

  // 6. Check if first token is a sequence index (e.g. "1", "2", "1.", "#1", "01")
  let startIndex = 0;
  const firstRaw = rawTokens[0];
  if (firstRaw && /^#?\d{1,3}[.)-]?$/.test(firstRaw)) {
    const seqNum = Number(firstRaw.replace(/[^\d]/g, ''));
    if (seqNum >= 1 && seqNum <= 999 && rawTokens.length > 1) {
      startIndex = 1; // Skip sequence number so it doesn't pollute name or quantity
    }
  }

  const tokens = rawTokens.slice(startIndex);
  const nameParts: string[] = [];
  const numbers: number[] = [];
  let barcode: string | undefined;

  for (const token of tokens) {
    if (!token) continue;

    // If it's a protected placeholder, it's definitely part of the product name
    if (token.startsWith('__STRG') || token.startsWith('__PACK') || token.startsWith('__NNUM')) {
      nameParts.push(token);
      continue;
    }

    // Check for barcode (8-14 consecutive digits without decimal)
    if (!barcode && /^\d{8,14}$/.test(token)) {
      barcode = token;
      continue;
    }

    const num = parseNumber(token);
    if (num !== undefined) {
      numbers.push(num);
    } else {
      nameParts.push(token);
    }
  }

  // Restore protected drug strengths and packings
  let productName = nameParts.join(' ').trim();
  protectedStrengths.forEach((s, idx) => {
    const placeholder = `__STRG${String.fromCharCode(65 + (idx % 26))}__`;
    productName = productName.replace(placeholder, s);
  });
  protectedPacks.forEach((p, idx) => {
    const placeholder = `__PACK${String.fromCharCode(65 + (idx % 26))}__`;
    productName = productName.replace(placeholder, p);
  });
  protectedNameNums.forEach((m, idx) => {
    const placeholder = `__NNUM${String.fromCharCode(65 + (idx % 26))}__`;
    productName = productName.replace(placeholder, m);
  });

  // Clean trailing punctuation
  productName = productName.replace(/^[-*•:#\s]+|[-*•:#\s]+$/g, '').trim();

  return {
    productName,
    numbers,
    expiryDate,
    batchNumber,
    barcode
  };
}

/**
 * Resolves quantity, unit price, and total from extracted numbers based on mathematical correlation.
 */
function resolveNumbers(numbers: number[]): {
  quantity: number;
  unitPrice: number;
  total?: number;
  isHeuristic: boolean;
} {
  if (numbers.length === 0) {
    return { quantity: 1, unitPrice: 0, total: 0, isHeuristic: true };
  }

  if (numbers.length === 1) {
    const val = numbers[0] ?? 0;
    return { quantity: 1, unitPrice: val, total: val, isHeuristic: true };
  }

  if (numbers.length === 2) {
    const n1 = numbers[0] ?? 1;
    const n2 = numbers[1] ?? 0;
    if (Number.isInteger(n1) && n1 > 0 && n1 <= 1000) {
      return { quantity: n1, unitPrice: n2, total: n1 * n2, isHeuristic: false };
    }
    if (Number.isInteger(n2) && n2 > 0 && n2 <= 1000 && n1 > n2) {
      return { quantity: n2, unitPrice: n1, total: n1 * n2, isHeuristic: false };
    }
    return { quantity: n1 > 0 ? n1 : 1, unitPrice: n2 >= 0 ? n2 : 0, total: n1 * n2, isHeuristic: false };
  }

  // If 3 or more numbers: check math correlation (A * B ≈ C)
  for (let i = 0; i < numbers.length; i++) {
    for (let j = 0; j < numbers.length; j++) {
      if (i === j) continue;
      for (let k = 0; k < numbers.length; k++) {
        if (k === i || k === j) continue;
        const q = numbers[i] ?? 0;
        const p = numbers[j] ?? 0;
        const t = numbers[k] ?? 0;

        if (q > 0 && p >= 0 && t > 0) {
          const product = q * p;
          if (Math.abs(product - t) < 0.1 || Math.abs(product - t) / t < 0.02) {
            if (!Number.isInteger(q) && Number.isInteger(p) && p <= 5000) {
              return { quantity: p, unitPrice: q, total: t, isHeuristic: false };
            }
            return { quantity: q, unitPrice: p, total: t, isHeuristic: false };
          }
        }
      }
    }
  }

  const rawQ = numbers[0] ?? 1;
  const rawP = numbers[1] ?? 0;
  const q = rawQ > 0 && rawQ <= 10000 ? rawQ : 1;
  const p = rawP >= 0 ? rawP : 0;
  const t = numbers[2] ?? q * p;

  return { quantity: q, unitPrice: p, total: t, isHeuristic: false };
}

/**
 * Parses a single line of OCR text into an OCRRow.
 * Does NOT drop rows if some fields are missing; keeps them with appropriate review status.
 */
export function parseRow(line: string): OCRRow | null {
  if (!line || line.length < 2) return null;

  const components = extractRowComponents(line);
  if (!components) return null;

  let { productName } = components;
  const { numbers, expiryDate, batchNumber, barcode } = components;

  // If product name is missing or too short, check if we have enough numbers
  if (!productName || productName.length < 2) {
    if (numbers.length >= 2) {
      productName = 'صنف غير محدد';
    } else {
      return null; // Empty noise line
    }
  }

  const { quantity, unitPrice, total, isHeuristic } = resolveNumbers(numbers);

  const validationIssues: string[] = [];
  let status: ExtractedImportRow['status'] = 'VALID';

  if (isHeuristic || unitPrice === 0 || quantity === 1 && numbers.length <= 1) {
    status = 'WARNING';
    if (unitPrice === 0) {
      validationIssues.push('السعر غير محدد، يرجى إدخال سعر الشراء');
    } else {
      validationIssues.push('تم استخراج السعر افتراضياً، يرجى مراجعة الكمية');
    }
  }

  return {
    rowNumber: 0,
    productName,
    quantity,
    unitPrice,
    total: total ?? quantity * unitPrice,
    expiryDate,
    batchNumber,
    barcode,
    status,
    validationIssues
  };
}

/**
 * Extracts item rows from the raw OCR text while ignoring headers and summary footers.
 */
export function extractRowsFromOCRText(rawText: string): OCRRow[] {
  const normalizedText = normalizeOCRText(rawText);
  if (!normalizedText) return [];

  const rawLines = normalizedText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length >= 2);

  const rows: OCRRow[] = [];
  let tableHeaderFound = false;
  let inFooterSection = false;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line) continue;

    // Check if this line is a header
    if (looksLikeHeader(line)) {
      tableHeaderFound = true;
      continue;
    }

    // Check if we reached invoice footer/summary
    if (looksLikeFooter(line)) {
      inFooterSection = true;
      continue;
    }

    // Once we are in the footer section, stop capturing table rows
    if (inFooterSection) {
      continue;
    }

    // If before table header and line looks like metadata (e.g. phone, address, invoice no, company), skip
    if (!tableHeaderFound) {
      if (
        /^(?:رقم|تاريخ|المورد|السادة|الهاتف|العنوان|ص\.ب|س\.ت|Date|Invoice|Tel|Supplier|From|شركة|مؤسسة|مستودع|فاتورة|سند)/i.test(
          line
        ) ||
        extractInvoiceNumber(line) ||
        extractDate(line)
      ) {
        continue;
      }
    }

    const row = parseRow(line);
    if (!row || !row.productName || row.productName.length < 2) {
      continue;
    }

    // If before table header was found, require at least one number (quantity or price)
    // so random titles or company names aren't added as items
    if (!tableHeaderFound && row.unitPrice === 0 && row.quantity === 1 && !row.barcode) {
      continue;
    }

    rows.push({
      ...row,
      rowNumber: rows.length + 1
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// 5. OCRDocumentParser Class (Public API)
// ---------------------------------------------------------------------------

export class OCRDocumentParser {
  /**
   * Local OCR engine using Tesseract.js (ara+eng).
   * Parses image and extracts rows, supplier, invoice number, date, and rawText.
   */
  static async parseDocument(file: File | string): Promise<OCRResult> {
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

    try {
      console.log('🧠 Starting real local OCR engine (Tesseract)...');

      worker = await createWorker('ara+eng');
      const result = await worker.recognize(file);
      const rawText = normalizeOCRText(result.data.text || '');

      if (!rawText) {
        console.warn('⚠️ Tesseract returned empty text.');
        return {
          rows: [],
          rawText: ''
        };
      }

      const rows = extractRowsFromOCRText(rawText);

      console.log(
        `✅ Local OCR completed. Characters: ${rawText.length}, rows detected: ${rows.length}`
      );

      return {
        rows,
        supplier: extractSupplier(rawText),
        invoiceNumber: extractInvoiceNumber(rawText),
        date: extractDate(rawText),
        rawText
      };
    } catch (error) {
      console.error('❌ Local OCR engine failed:', error);
      throw new Error(
        `فشل محرك OCR المحلي: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`
      );
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (terminateError) {
          console.warn('⚠️ Failed to terminate OCR worker cleanly:', terminateError);
        }
      }
    }
  }
}
