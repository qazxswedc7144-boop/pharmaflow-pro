// src/features/purchases/components/SmartImportModal.tsx
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, CheckCircle2, AlertTriangle, 
  FileSpreadsheet, FileText, Image as ImageIcon, Camera, 
  SlidersHorizontal, Check, X, Trash2, Edit3, Plus, 
  Layers, Search, Clock, ShieldCheck
} from 'lucide-react';
import { Modal } from '@/components/shared/SharedUI';
import { 
  ImportAnalysisResult, 
  ExtractedImportRow, 
  ColumnDefinition,
  TargetField 
} from '../services/smartImport/types';
import { Product } from '@/types';

interface SmartImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysisResult: ImportAnalysisResult | null;
  isLoading: boolean;
  progressStage?: string;
  progressPercent?: number;
  progressMessage?: string;
  onApply: (approvedRows: ExtractedImportRow[], supplierName?: string, invoiceNumber?: string, date?: string) => void;
  onApplyAndSaveImmediately?: (approvedRows: ExtractedImportRow[], supplierName?: string, invoiceNumber?: string, date?: string) => void;
  availableProducts?: Product[];
}

const TARGET_FIELD_LABELS: Record<TargetField, string> = {
  productName: 'اسم الصنف (مطلوب)',
  quantity: 'الكمية (مطلوب)',
  unitPrice: 'سعر الوحدة',
  total: 'الإجمالي',
  batchNumber: 'رقم التشغيلة',
  expiryDate: 'تاريخ الصلاحية',
  discount: 'الخصم %',
  tax: 'الضريبة',
  barcode: 'الباركود',
  productCode: 'كود الصنف',
  bonusQty: 'البونص المجاني',
  unit: 'الوحدة / التعبئة',
  notes: 'ملاحظات',
  ignore: '-- تجاهل العمود --'
};

export const SmartImportModal: React.FC<SmartImportModalProps> = ({
  isOpen,
  onClose,
  analysisResult,
  isLoading,
  progressStage: _progressStage = 'PARSING_DOCUMENT',
  progressPercent = 50,
  progressMessage = 'جاري تحليل المستند...',
  onApply,
  onApplyAndSaveImmediately,
  availableProducts: _availableProducts = []
}) => {
  const [rows, setRows] = useState<ExtractedImportRow[]>([]);
  const [columns, setColumns] = useState<ColumnDefinition[]>([]);
  const [showColumnOverrides, setShowColumnOverrides] = useState(false);
  const [filterMode, setFilterMode] = useState<'ALL' | 'ISSUES' | 'NEW' | 'VALID'>('ALL');
  const [searchFilter, setSearchFilter] = useState('');
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);

  // Sync state when analysisResult changes
  React.useEffect(() => {
    if (analysisResult) {
      setRows(analysisResult.rows || []);
      setColumns(analysisResult.detectedColumns || []);
      setShowColumnOverrides(false);
      setEditingRowIdx(null);
    }
  }, [analysisResult]);

  // Compute live summary from current row states
  const summary = useMemo(() => {
    let valid = 0;
    let issues = 0;
    let skipped = 0;
    let newProducts = 0;
    let duplicates = 0;
    let totalAmt = 0;

    rows.forEach(r => {
      if (r.isSkipped) {
        skipped++;
        return;
      }
      if (r.status === 'VALID') valid++;
      else issues++;

      if (r.isNewProductCandidate) newProducts++;
      if (r.isDuplicate) duplicates++;

      totalAmt += (r.total || (r.quantity * r.unitPrice));
    });

    return {
      total: rows.length,
      valid,
      issues,
      skipped,
      newProducts,
      duplicates,
      totalAmount: Math.round(totalAmt * 100) / 100
    };
  }, [rows]);

  // Filtered rows for the view
  const displayedRows = useMemo(() => {
    return rows.filter(r => {
      if (searchFilter) {
        const query = searchFilter.toLowerCase();
        const matchesName = r.productName.toLowerCase().includes(query);
        const matchesBarcode = r.barcode?.toLowerCase().includes(query);
        if (!matchesName && !matchesBarcode) return false;
      }

      if (filterMode === 'VALID') return r.status === 'VALID' && !r.isSkipped;
      if (filterMode === 'ISSUES') return r.status !== 'VALID' && !r.isSkipped;
      if (filterMode === 'NEW') return r.isNewProductCandidate && !r.isSkipped;
      return true;
    });
  }, [rows, filterMode, searchFilter]);

  const handleToggleSkip = (rowNum: number) => {
    setRows(prev => prev.map(r => r.rowNumber === rowNum ? { ...r, isSkipped: !r.isSkipped } : r));
  };

  const handleUpdateRowField = (rowNum: number, field: keyof ExtractedImportRow, val: any) => {
    setRows(prev => prev.map(r => {
      if (r.rowNumber === rowNum) {
        const updated = { ...r, [field]: val };
        // Recalculate total if price or qty changed
        if (field === 'quantity' || field === 'unitPrice' || field === 'discountPercent') {
          const q = field === 'quantity' ? Number(val) : updated.quantity;
          const p = field === 'unitPrice' ? Number(val) : updated.unitPrice;
          const disc = field === 'discountPercent' ? Number(val) : (updated.discountPercent || 0);
          const sub = q * p;
          updated.expectedTotal = disc > 0 ? sub * (1 - disc / 100) : sub;
          updated.total = updated.expectedTotal;
        }
        return updated;
      }
      return r;
    }));
  };

  const handleColumnMappingChange = (colIdx: number, newField: TargetField) => {
    setColumns(prev => prev.map(c => c.index === colIdx ? { ...c, mappedField: newField, isAutoMapped: false } : c));
  };

  const getSourceIcon = (type?: string) => {
    switch (type) {
      case 'EXCEL': return <FileSpreadsheet className="text-emerald-600" size={18} />;
      case 'CSV': return <FileText className="text-blue-600" size={18} />;
      case 'PDF': return <FileText className="text-red-600" size={18} />;
      case 'CAMERA': return <Camera className="text-amber-600" size={18} />;
      default: return <ImageIcon className="text-purple-600" size={18} />;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      maxWidth="max-w-[780px] w-[95vw]"
      noPadding={true}
      centerOnMobile={true}
      showCloseButton={false}
    >
      <div dir="rtl" className="flex flex-col max-h-[88vh] bg-white rounded-3xl overflow-hidden font-cairo select-none">
        
        {/* HEADER BAR */}
        <div className="bg-[#1E4D4D] text-white px-4 py-3 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-emerald-300">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black tracking-wide">الاستيراد الذكي للفاتورة</h2>
                {analysisResult && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-200 text-[10px] font-bold border border-emerald-400/30 flex items-center gap-1">
                    {getSourceIcon(analysisResult.sourceType)}
                    {analysisResult.sourceType}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-emerald-100/80 font-medium truncate max-w-[280px] sm:max-w-md">
                {analysisResult?.fileName || 'محرك تحليل فواتير المشتريات المتكيف'}
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all active:scale-95"
            title="إغلاق"
          >
            <X size={18} />
          </button>
        </div>

        {/* LOADING PROGRESS STATE */}
        {isLoading && (
          <div className="p-8 flex flex-col items-center justify-center space-y-4 my-auto">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-100 animate-ping opacity-30" />
              <div className="w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin flex items-center justify-center">
                <Sparkles className="text-emerald-600 animate-pulse" size={24} />
              </div>
            </div>
            
            <div className="text-center space-y-1.5 max-w-sm">
              <h3 className="text-sm font-black text-[#1E4D4D]">{progressMessage}</h3>
              <p className="text-[11px] font-bold text-slate-400">
                يتم قراءة الأعمدة، استخراج الحقول الضرورية وتصفية أعمدة المورد الزائدة...
              </p>
            </div>

            <div className="w-full max-w-xs bg-slate-100 rounded-full h-2 overflow-hidden">
              <motion.div 
                className="bg-emerald-600 h-full rounded-full"
                initial={{ width: '10%' }}
                animate={{ width: `${Math.min(100, Math.max(15, progressPercent))}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        {/* MAIN ANALYSIS CONTENT */}
        {!isLoading && analysisResult && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            
            {/* SUMMARY STATS & ACTION CHIPS */}
            <div className="p-3 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto text-[10px] font-black">
                <button 
                  onClick={() => setFilterMode('ALL')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${filterMode === 'ALL' ? 'bg-[#1E4D4D] text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600'}`}
                >
                  الكل ({summary.total})
                </button>
                <button 
                  onClick={() => setFilterMode('VALID')}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${filterMode === 'VALID' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white border border-emerald-200 text-emerald-700'}`}
                >
                  <CheckCircle2 size={12} />
                  سليمة ({summary.valid})
                </button>
                {summary.issues > 0 && (
                  <button 
                    onClick={() => setFilterMode('ISSUES')}
                    className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${filterMode === 'ISSUES' ? 'bg-amber-600 text-white shadow-sm' : 'bg-white border border-amber-200 text-amber-700'}`}
                  >
                    <AlertTriangle size={12} />
                    تحتاج تدقيق ({summary.issues})
                  </button>
                )}
                {summary.newProducts > 0 && (
                  <button 
                    onClick={() => setFilterMode('NEW')}
                    className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${filterMode === 'NEW' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-blue-200 text-blue-700'}`}
                  >
                    <Plus size={12} />
                    أصناف جديدة ({summary.newProducts})
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowColumnOverrides(!showColumnOverrides)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all flex items-center gap-1 ${
                    showColumnOverrides ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <SlidersHorizontal size={12} />
                  <span>تعديل تعيين الأعمدة ({columns.filter(c => c.mappedField !== 'ignore').length})</span>
                </button>

                <div className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[11px] font-black">
                  الإجمالي: {summary.totalAmount.toLocaleString()}
                </div>
              </div>
            </div>

            {/* COLUMN MAPPING OVERRIDE PANEL (COLLAPSIBLE) */}
            <AnimatePresence>
              {showColumnOverrides && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-emerald-50/50 border-b border-emerald-100 p-3 overflow-hidden shrink-0"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black text-emerald-900 flex items-center gap-1.5">
                      <Layers size={14} />
                      خريطة الأعمدة المكتشفة من ملف المورد:
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700">
                      تم استخراج {columns.filter(c => c.mappedField !== 'ignore').length} أعمدة واستبعاد البقية
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-36 overflow-y-auto p-1">
                    {columns.map((col) => (
                      <div key={col.index} className="p-2 bg-white rounded-xl border border-emerald-100 text-[10px] space-y-1 shadow-2xs">
                        <div className="flex justify-between items-center text-slate-500 font-bold truncate">
                          <span className="truncate">#{col.index + 1}: {col.rawHeader}</span>
                          <span className="text-[9px] font-mono text-emerald-600">{col.confidence}%</span>
                        </div>
                        <select 
                          value={col.mappedField}
                          onChange={(e) => handleColumnMappingChange(col.index, e.target.value as TargetField)}
                          className="w-full h-7 bg-slate-50 border border-slate-200 rounded-lg px-1 text-[10px] font-black text-[#1E4D4D] outline-none"
                        >
                          {Object.entries(TARGET_FIELD_LABELS).map(([fieldKey, label]) => (
                            <option key={fieldKey} value={fieldKey}>{label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* SEARCH & FILTER BAR */}
            <div className="px-3 py-2 bg-white border-b border-slate-100 flex items-center gap-2 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input 
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="بحث في الأصناف المستخرجة أو الباركود..."
                  className="w-full h-8 pr-8 pl-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-[#1E4D4D] focus:bg-white outline-none"
                />
              </div>
              <span className="text-[10px] font-black text-slate-400 shrink-0">
                عرض {displayedRows.length} من {rows.length}
              </span>
            </div>

            {/* ITEM ROWS TABLE PREVIEW */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {displayedRows.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-bold text-xs space-y-1">
                  <p>لا توجد أصناف مطابقة لخيارات الفلترة الحالية.</p>
                </div>
              ) : (
                displayedRows.map((row) => {
                  const isEditing = editingRowIdx === row.rowNumber;

                  return (
                    <div 
                      key={row.rowNumber}
                      className={`p-3 rounded-2xl border transition-all ${
                        row.isSkipped 
                          ? 'bg-slate-100/60 border-slate-200 opacity-60' 
                          : row.status === 'VALID'
                            ? 'bg-white border-slate-100 hover:border-emerald-200 shadow-2xs'
                            : 'bg-amber-50/40 border-amber-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        {/* Right: Item Info & Match Status */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              #{row.rowNumber}
                            </span>
                            
                            {isEditing ? (
                              <input 
                                type="text"
                                value={row.productName}
                                onChange={(e) => handleUpdateRowField(row.rowNumber, 'productName', e.target.value)}
                                className="h-7 px-2 bg-white border border-emerald-500 rounded-lg text-xs font-black text-[#1E4D4D] flex-1 min-w-[160px]"
                              />
                            ) : (
                              <span className="text-xs font-black text-[#1E4D4D] truncate">
                                {row.matchedProductName || row.productName}
                              </span>
                            )}

                            {/* Match Type Badge */}
                            {row.matchedProductId ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-black flex items-center gap-1">
                                <ShieldCheck size={10} />
                                مطابق ({row.matchType})
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[9px] font-black">
                                ✨ صنف جديد
                              </span>
                            )}

                            {row.isDuplicate && (
                              <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[9px] font-black">
                                ⚠️ مكرر
                              </span>
                            )}
                          </div>

                          {/* Secondary meta: Barcode, Expiry, Batch */}
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 font-bold">
                            {row.barcode && (
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded">باركود: {row.barcode}</span>
                            )}
                            {row.expiryDate && (
                              <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Clock size={10} />
                                انتهاء: {row.expiryDate}
                              </span>
                            )}
                            {row.batchNumber && (
                              <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">تشغيلة: {row.batchNumber}</span>
                            )}
                            {row.discountPercent && row.discountPercent > 0 ? (
                              <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">خصم: {row.discountPercent}%</span>
                            ) : null}
                          </div>

                          {/* Issues if any */}
                          {row.validationIssues.length > 0 && (
                            <div className="text-[10px] font-bold text-amber-700 space-y-0.5 pt-1">
                              {row.validationIssues.map((iss, i) => (
                                <p key={i}>• {iss}</p>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Middle: Qty, Price, Total */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isEditing ? (
                            <div className="flex items-center gap-1 text-[11px] font-black">
                              <div className="space-y-0.5">
                                <span className="block text-[9px] text-slate-400 text-center">الكمية</span>
                                <input 
                                  type="number"
                                  value={row.quantity}
                                  onChange={(e) => handleUpdateRowField(row.rowNumber, 'quantity', e.target.value)}
                                  className="w-14 h-7 text-center bg-white border border-emerald-500 rounded-lg text-xs font-black"
                                />
                              </div>
                              <div className="space-y-0.5">
                                <span className="block text-[9px] text-slate-400 text-center">السعر</span>
                                <input 
                                  type="number"
                                  value={row.unitPrice}
                                  onChange={(e) => handleUpdateRowField(row.rowNumber, 'unitPrice', e.target.value)}
                                  className="w-16 h-7 text-center bg-white border border-emerald-500 rounded-lg text-xs font-black"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="text-left space-y-0.5">
                              <div className="flex items-center gap-1.5 justify-end">
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-black">
                                  x{row.quantity}
                                </span>
                                <span className="text-[11px] font-black text-slate-700">
                                  {row.unitPrice.toLocaleString()}
                                </span>
                              </div>
                              <span className="block text-[11px] font-black text-[#1E4D4D] font-mono">
                                = {(row.total || (row.quantity * row.unitPrice)).toLocaleString()}
                              </span>
                            </div>
                          )}

                          {/* Actions: Edit, Skip */}
                          <div className="flex items-center gap-1 mr-2">
                            <button 
                              onClick={() => setEditingRowIdx(isEditing ? null : row.rowNumber)}
                              className={`p-1.5 rounded-lg border transition-all ${isEditing ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                              title={isEditing ? 'تم التعديل' : 'تعديل السطر'}
                            >
                              {isEditing ? <Check size={14} /> : <Edit3 size={14} />}
                            </button>

                            <button 
                              onClick={() => handleToggleSkip(row.rowNumber)}
                              className={`p-1.5 rounded-lg border transition-all ${row.isSkipped ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'}`}
                              title={row.isSkipped ? 'إلغاء الاستبعاد' : 'استبعاد السطر'}
                            >
                              {row.isSkipped ? <Plus size={14} /> : <Trash2 size={14} />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* BOTTOM ACTION BUTTONS */}
            <div className="p-3 bg-white border-t border-slate-100 flex flex-col sm:flex-row gap-2 shrink-0">
              <button 
                onClick={() => onApply(
                  rows.filter(r => !r.isSkipped),
                  analysisResult.summary.detectedSupplier,
                  analysisResult.summary.detectedInvoiceNumber,
                  analysisResult.summary.detectedDate
                )}
                className="flex-[2] h-11 bg-[#1E4D4D] hover:bg-[#163a3a] text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
              >
                <Edit3 size={16} />
                <span>تطبيق وتعبئة الفاتورة للمراجعة ({summary.total - summary.skipped} صنف)</span>
              </button>

              {onApplyAndSaveImmediately && (
                <button 
                  onClick={() => onApplyAndSaveImmediately(
                    rows.filter(r => !r.isSkipped),
                    analysisResult.summary.detectedSupplier,
                    analysisResult.summary.detectedInvoiceNumber,
                    analysisResult.summary.detectedDate
                  )}
                  className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
                >
                  <CheckCircle2 size={16} />
                  <span>حفظ فوري وترحيل 💾</span>
                </button>
              )}

              <button 
                onClick={onClose}
                className="h-11 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-xs active:scale-95 transition-all"
              >
                إلغاء
              </button>
            </div>

          </div>
        )}

      </div>
    </Modal>
  );
};
