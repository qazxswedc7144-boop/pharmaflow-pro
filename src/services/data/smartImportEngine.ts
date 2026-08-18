import { extractTextFromImage } from '@features/ai/services/ocrService';
import { normalizeArabic, cleanInvoiceText } from '@features/ai/services/arabicProcessor';
import { parseInvoice, ParsedInvoice } from '@features/ai/services/aiInvoiceParser';
import { generateFileHash } from '@/utils/hash';
import { getOCRCache, saveOCRCache } from '@features/ai/services/ocrCache';
import { applyLearning } from '@features/ai/services/learningService';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';

// Set worker source for pdfjs
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * Extracts text and structured items directly from Excel (.xlsx, .xls) or CSV files,
 * intelligently mapping key columns (Name, Qty, Cost/Price, Expiry, Barcode, Discount)
 * and discarding unnecessary supplier columns.
 */
async function extractDataFromExcelOrCSV(file: File): Promise<{ text: string; structuredItems?: any[] }> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('ملف الاكسل فارغ أو لا يحتوي على صفحات صالحة.');
  }
  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    throw new Error('صفحة العمل غير صالحة في ملف الاكسل.');
  }

  // Convert sheet to 2D array
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (!rows || rows.length === 0) {
    throw new Error('ملف الاكسل فارغ أو لا يحتوي على بيانات صالحة.');
  }

  // Keywords to detect columns
  const nameKeywords = ['صنف', 'دواء', 'اسم', 'مادة', 'بيان', 'وصف', 'مستحضر', 'item', 'product', 'description', 'name', 'article'];
  const qtyKeywords = ['كمية', 'كميه', 'عدد', 'مشتراه', 'مشتريات', 'qty', 'quantity', 'count', 'units'];
  const priceKeywords = ['سعر', 'تكلفة', 'تكلفه', 'شراء', 'وحدة', 'فاتورة', 'price', 'cost', 'unit price', 'rate'];
  const expiryKeywords = ['صلاحية', 'صلاحيه', 'انتهاء', 'تاريخ', 'exp', 'expiry', 'expire'];
  const barcodeKeywords = ['باركود', 'كود', 'رمز', 'code', 'barcode', 'gtin', 'upc'];
  const discountKeywords = ['خصم', 'نسبة', 'تخفيض', 'disc', 'discount'];
  const bonusKeywords = ['بونص', 'مجاني', 'مجانا', 'هدية', 'bonus', 'free'];
  const batchKeywords = ['تشغيلة', 'تشغيله', 'باتش', 'وجبة', 'شحنة', 'batch', 'lot'];

  let headerRowIndex = -1;
  const colIndices = {
    name: -1,
    barcode: -1,
    quantity: -1,
    price: -1,
    expiryDate: -1,
    discountPercent: -1,
    bonusQty: -1,
    batchNumber: -1
  };

  // Search first 25 rows for table headers
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const row = rows[r];
    if (!row || !Array.isArray(row)) continue;

    let matchedCount = 0;
    row.forEach((cell) => {
      const val = String(cell).toLowerCase().trim();
      if (!val) return;
      if (nameKeywords.some(k => val.includes(k))) matchedCount++;
      if (qtyKeywords.some(k => val.includes(k))) matchedCount++;
      if (priceKeywords.some(k => val.includes(k))) matchedCount++;
    });

    if (matchedCount >= 2) {
      headerRowIndex = r;
      row.forEach((cell, colIdx) => {
        const val = String(cell).toLowerCase().trim();
        if (!val) return;

        if (colIndices.name === -1 && nameKeywords.some(k => val.includes(k))) {
          colIndices.name = colIdx;
        } else if (colIndices.quantity === -1 && qtyKeywords.some(k => val.includes(k))) {
          colIndices.quantity = colIdx;
        } else if (colIndices.price === -1 && priceKeywords.some(k => val.includes(k))) {
          colIndices.price = colIdx;
        } else if (colIndices.expiryDate === -1 && expiryKeywords.some(k => val.includes(k))) {
          colIndices.expiryDate = colIdx;
        } else if (colIndices.barcode === -1 && barcodeKeywords.some(k => val.includes(k))) {
          colIndices.barcode = colIdx;
        } else if (colIndices.discountPercent === -1 && discountKeywords.some(k => val.includes(k))) {
          colIndices.discountPercent = colIdx;
        } else if (colIndices.bonusQty === -1 && bonusKeywords.some(k => val.includes(k))) {
          colIndices.bonusQty = colIdx;
        } else if (colIndices.batchNumber === -1 && batchKeywords.some(k => val.includes(k))) {
          colIndices.batchNumber = colIdx;
        }
      });
      break;
    }
  }

  const extractedItems: any[] = [];
  let formattedText = `[جدول الاكسل - استخراج مباشر وذكاء اصطناعي للتحقق]\n`;

  const startRow = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;
  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    let itemName = colIndices.name !== -1 ? String(row[colIndices.name] || '').trim() : '';
    
    // Fallback if no header found: take first cell with string longer than 2 chars that isn't purely a number
    if (!itemName) {
      const textCell = row.find(c => typeof c === 'string' && c.trim().length > 2 && isNaN(Number(c)));
      if (textCell) itemName = String(textCell).trim();
    }

    if (!itemName || itemName.length < 2) continue;

    const qty = colIndices.quantity !== -1 ? Number(row[colIndices.quantity]) || 1 : 1;
    const price = colIndices.price !== -1 ? Number(row[colIndices.price]) || 0 : 0;
    
    const rawExpiry = colIndices.expiryDate !== -1 ? row[colIndices.expiryDate] : '';
    let expiry = '';
    if (rawExpiry && typeof rawExpiry === 'object' && typeof (rawExpiry as any).toISOString === 'function') {
      expiry = (rawExpiry as any).toISOString().split('T')[0];
    } else if (rawExpiry !== undefined && rawExpiry !== null) {
      expiry = String(rawExpiry).trim();
    }

    const barcode = colIndices.barcode !== -1 ? String(row[colIndices.barcode] || '').trim() : '';
    const discount = colIndices.discountPercent !== -1 ? Number(row[colIndices.discountPercent]) || 0 : 0;
    const bonus = colIndices.bonusQty !== -1 ? Number(row[colIndices.bonusQty]) || 0 : 0;
    const batch = colIndices.batchNumber !== -1 ? String(row[colIndices.batchNumber] || '').trim() : '';

    extractedItems.push({
      name: itemName,
      barcode: barcode || undefined,
      quantity: qty > 0 ? qty : 1,
      price: price >= 0 ? price : 0,
      expiryDate: expiry || undefined,
      discountPercent: discount,
      bonusQty: bonus,
      batchNumber: batch || undefined
    });

    formattedText += `- صنف: ${itemName} | كمية: ${qty} | سعر الشراء: ${price} ${expiry ? '| صلاحية: ' + expiry : ''} ${barcode ? '| باركود: ' + barcode : ''}\n`;
  }

  return {
    text: formattedText,
    structuredItems: extractedItems.length > 0 ? extractedItems : undefined
  };
}

/**
 * Extracts text from a PDF file.
 */
async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n';
  }

  return fullText;
}

/**
 * Full pipeline for processing an invoice file (image, PDF, Excel, or CSV).
 */
export async function processInvoice(file: File | string): Promise<ParsedInvoice> {
  const hash = await generateFileHash(file);
  
  // 1. Cache check
  let text = getOCRCache(hash);
  const aiCacheKey = `pharmaflow_ai_cache_${hash}`;
  const cachedAI = localStorage.getItem(aiCacheKey);

  if (cachedAI) {
    try {
      const { data, timestamp } = JSON.parse(cachedAI);
      // AI cache TTL: 24 hours (since invoice content doesn't change)
      if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
        return data;
      }
    } catch (e) {
      console.error("AI Cache Parse Error:", e);
    }
  }
  
  let excelItems: any[] | undefined = undefined;

  if (!text) {
    if (file instanceof File) {
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv') || file.type.includes('excel') || file.type.includes('csv') || file.type.includes('spreadsheet')) {
        const excelRes = await extractDataFromExcelOrCSV(file);
        text = excelRes.text;
        excelItems = excelRes.structuredItems;
      } else if (file.type === 'application/pdf' || fileName.endsWith('.pdf')) {
        text = await extractTextFromPDF(file);
      } else {
        text = await extractTextFromImage(file);
      }
    } else {
      text = await extractTextFromImage(file);
    }
    
    if (text) {
      saveOCRCache(hash, text);
    }
  }

  if (!text || text.trim().length < 5) {
    throw new Error('تعذر استخراج النص أو محتوى الجدول من الفاتورة.');
  }

  // 2. Apply learning
  text = applyLearning(text);

  // 3. Cleaning and Normalization
  text = normalizeArabic(text);
  text = cleanInvoiceText(text);

  // 4. AI Analysis
  let data: ParsedInvoice;
  try {
    data = await parseInvoice(text);
    // If AI items were sparse but Excel structured items exist, merge smartly
    if ((!data.items || data.items.length === 0) && excelItems && excelItems.length > 0) {
      data.items = excelItems;
    } else if (excelItems && excelItems.length > 0 && data.items.length > 0) {
      // Enhance AI items with barcodes or extra excel fields if AI omitted barcode/batch
      data.items = data.items.map((aiItem, idx) => {
        const exItem = excelItems?.[idx];
        return {
          ...aiItem,
          barcode: aiItem.barcode || exItem?.barcode,
          batchNumber: aiItem.batchNumber || exItem?.batchNumber,
          discountPercent: aiItem.discountPercent || exItem?.discountPercent,
          bonusQty: aiItem.bonusQty || exItem?.bonusQty
        };
      });
    }
  } catch (err) {
    if (excelItems && excelItems.length > 0) {
      data = {
        type: 'cash',
        supplier: 'مورد الفاتورة (مستخرج من ملف الاكسل)',
        invoice_number: `EXCEL-${Math.floor(Math.random() * 90000 + 10000)}`,
        date: new Date().toISOString().split('T')[0],
        notes: '[استيراد مباشر من ملف اكسل/CSV مع تصفية الأعمدة الزائدة]',
        items: excelItems,
        status: 'Draft',
        warning: '⚠️ تم استخراج بيانات الاكسل بنجاح بانتظار المراجعة والتدقيق.'
      };
    } else {
      throw err;
    }
  }

  // 5. Save AI to Cache
  try {
    localStorage.setItem(aiCacheKey, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (e) {
    // ignore storage quota issues
  }

  return data;
}
