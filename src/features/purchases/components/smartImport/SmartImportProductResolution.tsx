// src/features/purchases/components/smartImport/SmartImportProductResolution.tsx
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.4: Human Resolution UX — Product Resolution Card & Pharmaceutical Safety Shield
 */

import React, { useState } from 'react';
import { 
  ProductDecision, 
  ProductResolutionAction, 
  ProductCandidate 
} from '../../services/smartImport/batchProcessing/types';
import { Product } from '@/types';
import { 
  CheckSquare, 
  Square, 
  CheckCircle2, 
  AlertCircle, 
  PlusCircle, 
  Ban, 
  Search, 
  ShieldAlert,
  Pill,
  Edit3,
  Check,
  Calculator
} from 'lucide-react';
import { isValidExpiryDate } from '@/utils/expiryUtils';
import { CorrectionFeedbackRepository } from '../../services/smartImport/feedback/correctionFeedbackRepository';
import { authService } from '@features/auth/services/authService';

interface SmartImportProductResolutionProps {
  productDecisions: ProductDecision[];
  selectedRowIds: Set<number>;
  availableProducts: Product[];
  onToggleSelectRow: (rowId: number) => void;
  onUpdateDecision: (rowId: number, update: Partial<ProductDecision>) => void;
}

export const SmartImportProductResolution: React.FC<SmartImportProductResolutionProps> = ({
  productDecisions,
  selectedRowIds,
  availableProducts,
  onToggleSelectRow,
  onUpdateDecision
}) => {
  const [activeSearchRowId, setActiveSearchRowId] = useState<number | null>(null);
  const [editingDraftRowId, setEditingDraftRowId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSearchProducts = React.useMemo(() => {
    if (!searchTerm) return availableProducts.slice(0, 10);
    const q = searchTerm.toLowerCase();
    return availableProducts.filter(p => 
      (p.Name || p.name || '').toLowerCase().includes(q) ||
      (p.barcode || '').includes(q) ||
      (p.id || '').toLowerCase().includes(q) ||
      (p.categoryName || '').toLowerCase().includes(q)
    ).slice(0, 15);
  }, [availableProducts, searchTerm]);

  const handleSelectCandidate = (rowId: number, candidate: ProductCandidate | Product) => {
    const isCandidate = 'score' in candidate;
    const name = isCandidate ? candidate.name : (candidate.Name || candidate.name);
    const id = candidate.id;
    const barcode = candidate.barcode;

    const row = productDecisions.find(p => p.sourceRowId === rowId);

    // Record human correction telemetry (without polluting alias rules)
    const user = authService.getCurrentUser();
    const tenantId = (user as any)?.tenantId || 'DEFAULT_TENANT';
    const branchId = (user as any)?.branchId || 'WH-MAIN';

    CorrectionFeedbackRepository.recordCorrection({
      tenantId,
      branchId,
      sourceType: 'IMAGE',
      field: 'productName',
      originalExtractedValue: row?.importedProductName,
      correctedValue: name,
      provider: 'HumanReview',
      confidenceBefore: row?.confidence || 0.5,
      correctionReason: 'Manual Candidate Selection'
    }).catch(() => {});

    onUpdateDecision(rowId, {
      matchedProductId: id,
      matchedProductName: name,
      barcode: barcode || undefined,
      action: ProductResolutionAction.LINK_EXISTING,
      isSkipped: false,
      resolutionStatus: 'USER_RESOLVED',
      userDecision: 'LINK_EXISTING',
      reason: `تم ربطه يدوياً بالصنف: ${name}`
    });
    setActiveSearchRowId(null);
  };

  const handleSetAction = (rowId: number, action: ProductResolutionAction) => {
    const row = productDecisions.find(p => p.sourceRowId === rowId);

    if (action === ProductResolutionAction.SKIP) {
      onUpdateDecision(rowId, {
        action: ProductResolutionAction.SKIP,
        isSkipped: true,
        resolutionStatus: 'SKIPPED',
        userDecision: 'SKIP',
        reason: 'تم استبعاد الصنف من الفاتورة بقرار المستخدم'
      });
    } else if (action === ProductResolutionAction.CREATE_NEW) {
      onUpdateDecision(rowId, {
        action: ProductResolutionAction.CREATE_NEW,
        isSkipped: false,
        resolutionStatus: 'USER_RESOLVED',
        userDecision: 'CREATE_NEW',
        newProductData: row?.newProductData || {
          name: row?.importedProductName || '',
          barcode: row?.barcode,
          unitPrice: row?.unitPrice,
          costPrice: row?.unitPrice,
          strength: row?.extractedInfo?.dosage ? `${row.extractedInfo.dosage.value}${row.extractedInfo.dosage.unit}` : undefined,
          form: row?.extractedInfo?.form
        },
        reason: 'تم تأكيد إنشاء صنف جديد في قاعدة البيانات'
      });
    } else if (action === ProductResolutionAction.AUTO_MATCH || action === ProductResolutionAction.LINK_EXISTING) {
      const topCand = row?.suggestedProducts[0];
      if (topCand) {
        handleSelectCandidate(rowId, topCand);
      } else {
        setActiveSearchRowId(rowId);
      }
    }
  };

  return (
    <div className="space-y-2.5 font-cairo" id="smart-import-product-resolution-list">
      {productDecisions.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 font-bold text-xs">
          لا توجد أصناف مطابقة للبحث أو الفلتر المحدد
        </div>
      ) : (
        productDecisions.map((row) => {
          const isSelected = selectedRowIds.has(row.sourceRowId);
          const isSearchOpen = activeSearchRowId === row.sourceRowId;
          const isDraftEditing = editingDraftRowId === row.sourceRowId;
          const isExpValid = !row.expiryDate || isValidExpiryDate(row.expiryDate);
          const hasDosageConflict = row.dosageSafety?.isConflict;

          return (
            <div
              key={row.sourceRowId}
              id={`product-card-${row.sourceRowId}`}
              className={`p-3.5 rounded-2xl border transition-all space-y-2.5 ${
                row.isSkipped || row.action === ProductResolutionAction.SKIP
                  ? 'bg-slate-100/70 border-slate-200 opacity-60'
                  : hasDosageConflict && row.action === ProductResolutionAction.UNRESOLVED
                    ? 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-500/20 shadow-xs'
                    : row.action === ProductResolutionAction.UNRESOLVED
                      ? 'bg-amber-50/50 border-amber-300 shadow-xs'
                      : row.action === ProductResolutionAction.CREATE_NEW
                        ? 'bg-blue-50/40 border-blue-200'
                        : 'bg-white border-slate-200/90 hover:border-emerald-300 shadow-2xs'
              }`}
            >
              {/* Row Header: Checkbox + Name + Badges + Action Buttons */}
              <div className="flex items-start justify-between gap-2 flex-wrap">
                {/* Checkbox & Product Name */}
                <div className="flex items-start gap-2.5 flex-1 min-w-[260px]">
                  <button
                    type="button"
                    onClick={() => onToggleSelectRow(row.sourceRowId)}
                    className="mt-0.5 text-slate-400 hover:text-[#1E4D4D] transition-all shrink-0"
                  >
                    {isSelected ? (
                      <CheckSquare size={18} className="text-[#1E4D4D]" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>

                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-mono font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        #{row.sourceRowId}
                      </span>
                      <h4 className="text-xs sm:text-sm font-black text-slate-900 leading-tight">
                        {row.importedProductName}
                      </h4>

                      {/* Extracted Pharmaceutical Badges */}
                      {row.extractedInfo?.dosage && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-black rounded-md flex items-center gap-1">
                          <Pill size={11} />
                          {row.extractedInfo.dosage.value} {row.extractedInfo.dosage.unit}
                        </span>
                      )}
                      {row.extractedInfo?.form && (
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-black rounded-md">
                          {row.extractedInfo.form}
                        </span>
                      )}
                      {row.extractedInfo?.packSize && (
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-black rounded-md">
                          عبوة {row.extractedInfo.packSize}
                        </span>
                      )}
                    </div>

                    {/* Barcode & Code & Matched Target Name */}
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 font-bold flex-wrap">
                      {row.barcode && (
                        <span>باركود: <strong className="text-slate-700 font-mono">{row.barcode}</strong></span>
                      )}
                      {row.supplierProductCode && (
                        <span>كود الصنف: <strong className="text-slate-700 font-mono">{row.supplierProductCode}</strong></span>
                      )}
                      {row.matchedProductName && (
                        <span className="text-emerald-700 font-black">
                          المرتبط به: <strong className="text-emerald-800 underline">{row.matchedProductName}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Badge & Action Controls */}
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                  {/* Status Badge */}
                  {row.action === ProductResolutionAction.AUTO_MATCH && (
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-black flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      مطابقة تلقائية ({Math.round(row.confidence * 100)}%)
                    </span>
                  )}
                  {row.action === ProductResolutionAction.LINK_EXISTING && (
                    <span className="px-2.5 py-1 bg-teal-100 text-teal-800 rounded-lg text-[10px] font-black flex items-center gap-1">
                      <Check size={12} />
                      تم الربط يدوياً
                    </span>
                  )}
                  {row.action === ProductResolutionAction.CREATE_NEW && (
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg text-[10px] font-black flex items-center gap-1">
                      <PlusCircle size={12} />
                      صنف جديد قيد الإنشاء
                    </span>
                  )}
                  {row.action === ProductResolutionAction.SKIP && (
                    <span className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded-lg text-[10px] font-black flex items-center gap-1">
                      <Ban size={12} />
                      مستبعد
                    </span>
                  )}
                  {row.action === ProductResolutionAction.UNRESOLVED && !hasDosageConflict && (
                    <span className="px-2.5 py-1 bg-amber-100 text-amber-900 rounded-lg text-[10px] font-black flex items-center gap-1 animate-pulse">
                      <AlertCircle size={12} />
                      يحتاج قرار
                    </span>
                  )}
                  {row.action === ProductResolutionAction.UNRESOLVED && hasDosageConflict && (
                    <span className="px-2.5 py-1 bg-rose-100 text-rose-900 rounded-lg text-[10px] font-black flex items-center gap-1">
                      <ShieldAlert size={12} className="text-rose-600" />
                      تعارض أمان دوائي
                    </span>
                  )}

                  {/* Direct Action Dropdown / Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSearchRowId(isSearchOpen ? null : row.sourceRowId);
                        setEditingDraftRowId(null);
                      }}
                      className={`px-2.5 py-1 text-[11px] font-black rounded-lg transition-all flex items-center gap-1 ${
                        isSearchOpen
                          ? 'bg-[#1E4D4D] text-white shadow-2xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      <Search size={12} />
                      <span>{isSearchOpen ? 'إغلاق البحث' : 'بحث وربط'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSetAction(row.sourceRowId, ProductResolutionAction.CREATE_NEW)}
                      className={`px-2.5 py-1 text-[11px] font-black rounded-lg transition-all flex items-center gap-1 ${
                        row.action === ProductResolutionAction.CREATE_NEW
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200'
                      }`}
                    >
                      <PlusCircle size={12} />
                      <span>إنشاء كجديد</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSetAction(row.sourceRowId, ProductResolutionAction.SKIP)}
                      className={`px-2 py-1 text-[11px] font-black rounded-lg transition-all flex items-center gap-1 ${
                        row.isSkipped
                          ? 'bg-slate-700 text-white'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200'
                      }`}
                    >
                      <Ban size={12} />
                      <span>تخطي</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* PHARMACEUTICAL SAFETY CONFLICT BANNER */}
              {hasDosageConflict && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1.5 text-rose-900 text-xs">
                  <div className="flex items-center gap-2 font-black">
                    <ShieldAlert size={16} className="text-rose-600 shrink-0" />
                    <span>تنبيه أمان صيدلاني حرج: {row.dosageSafety?.reason}</span>
                  </div>
                  <p className="text-[11px] text-rose-800">
                    تم حظر الاعتماد التلقائي لحماية المرضى من خطأ صرف تركيز أو شكل دوائي مختلف. يرجى اختيار الإجراء المناسب:
                  </p>
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleSetAction(row.sourceRowId, ProductResolutionAction.CREATE_NEW)}
                      className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-black shadow-2xs"
                    >
                      إنشاء كصنف دوائي منفصل (آمن وموصى به)
                    </button>
                    {row.suggestedProducts && row.suggestedProducts.length > 0 && row.suggestedProducts[0] && (
                      <button
                        type="button"
                        onClick={() => {
                          const candidate = row.suggestedProducts[0];
                          if (candidate) {
                            handleSelectCandidate(row.sourceRowId, candidate);
                          }
                        }}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-black shadow-2xs"
                      >
                        تأكيد الربط بالصنف المقترح رغم الاختلاف
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Quantity, Price, Expiry, Batch row with Confidence & Self-Healing Indicators */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 p-2 bg-slate-50/70 border border-slate-200/60 rounded-xl text-xs font-bold text-slate-700">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-bold">الكمية:</span>
                    {row.quantity > 0 && <span className="text-[9px] text-emerald-600 font-black">✓ صالحة</span>}
                  </div>
                  <input
                    type="number"
                    value={row.quantity}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 1;
                      const user = authService.getCurrentUser();
                      CorrectionFeedbackRepository.recordCorrection({
                        tenantId: (user as any)?.tenantId || 'DEFAULT_TENANT',
                        branchId: (user as any)?.branchId || 'WH-MAIN',
                        sourceType: 'IMAGE',
                        field: 'quantity',
                        originalExtractedValue: row.quantity,
                        correctedValue: val,
                        provider: 'HumanReview',
                        confidenceBefore: 0.8,
                        correctionReason: 'Manual Quantity Edit'
                      }).catch(() => {});

                      onUpdateDecision(row.sourceRowId, { quantity: val, total: val * row.unitPrice });
                    }}
                    className="w-full bg-white border border-slate-200 px-2 py-1 rounded text-xs font-mono font-bold text-slate-800"
                    min="1"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-bold">سعر الوحدة:</span>
                    {row.unitPrice > 0 && <span className="text-[9px] text-emerald-600 font-black">✓ محدد</span>}
                  </div>
                  <input
                    type="number"
                    value={row.unitPrice}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const user = authService.getCurrentUser();
                      CorrectionFeedbackRepository.recordCorrection({
                        tenantId: (user as any)?.tenantId || 'DEFAULT_TENANT',
                        branchId: (user as any)?.branchId || 'WH-MAIN',
                        sourceType: 'IMAGE',
                        field: 'unitPrice',
                        originalExtractedValue: row.unitPrice,
                        correctedValue: val,
                        provider: 'HumanReview',
                        confidenceBefore: 0.8,
                        correctionReason: 'Manual Price Edit'
                      }).catch(() => {});

                      onUpdateDecision(row.sourceRowId, { unitPrice: val, total: row.quantity * val });
                    }}
                    className="w-full bg-white border border-slate-200 px-2 py-1 rounded text-xs font-mono font-bold text-slate-800"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-bold">الإجمالي:</span>
                    <span className="text-[9px] text-teal-600 font-bold flex items-center gap-0.5">
                      <Calculator size={10} />
                      تطابق
                    </span>
                  </div>
                  <span className="font-mono font-black text-slate-900 mt-1 block">
                    {(row.total || (row.quantity * row.unitPrice) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
                  </span>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-bold">الصلاحية:</span>
                    {row.expiryDate && isExpValid && <span className="text-[9px] text-emerald-600 font-black">✓ ISO</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={row.expiryDate || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const user = authService.getCurrentUser();
                        CorrectionFeedbackRepository.recordCorrection({
                          tenantId: (user as any)?.tenantId || 'DEFAULT_TENANT',
                          branchId: (user as any)?.branchId || 'WH-MAIN',
                          sourceType: 'IMAGE',
                          field: 'expiryDate',
                          originalExtractedValue: row.expiryDate,
                          correctedValue: val,
                          provider: 'HumanReview',
                          confidenceBefore: 0.7,
                          correctionReason: 'Manual Expiry Edit'
                        }).catch(() => {});

                        onUpdateDecision(row.sourceRowId, { expiryDate: val });
                      }}
                      placeholder="YYYY-MM"
                      className={`w-full bg-white border px-2 py-1 rounded text-xs font-mono font-bold ${
                        isExpValid ? 'border-slate-200 text-slate-800' : 'border-rose-300 text-rose-800 bg-rose-50'
                      }`}
                    />
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-slate-400 block font-bold">رقم التشغيلة (Batch):</span>
                  <input
                    type="text"
                    value={row.batchNumber || ''}
                    onChange={(e) => onUpdateDecision(row.sourceRowId, { batchNumber: e.target.value })}
                    placeholder="Batch #"
                    className="w-full bg-white border border-slate-200 px-2 py-1 rounded text-xs font-mono font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* Suggestions Cards (when Unresolved or Matched) */}
              {!isSearchOpen && row.suggestedProducts?.length > 0 && row.action === ProductResolutionAction.UNRESOLVED && (
                <div className="space-y-1 pt-1 border-t border-slate-100">
                  <span className="text-[10px] font-black text-slate-500">أصناف مقترحة في قاعدة البيانات:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                    {row.suggestedProducts.map((cand) => (
                      <div
                        key={cand.id}
                        onClick={() => handleSelectCandidate(row.sourceRowId, cand)}
                        className="p-2 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-2 shadow-2xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black text-slate-800 truncate">{cand.name}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            {cand.barcode && <span>باركود: {cand.barcode}</span>}
                            {cand.costPrice !== undefined && <span>تكلفة: {cand.costPrice} ج.م</span>}
                          </div>
                        </div>
                        <div className="text-left shrink-0">
                          <span className="text-[10px] font-mono font-black text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded">
                            {Math.round(cand.score * 100)}%
                          </span>
                          <button
                            type="button"
                            className="block mt-1 px-2 py-0.5 bg-[#1E4D4D] text-white rounded text-[10px] font-black"
                          >
                            ربط
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search Existing Products Panel */}
              {isSearchOpen && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="relative">
                    <Search size={14} className="absolute inset-y-0 right-3 my-auto text-slate-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="ابحث في سجل الأصناف بالاسم، الباركود، الكود، أو التصنيف..."
                      className="w-full pl-3 pr-9 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E4D4D]/20 focus:border-[#1E4D4D]"
                      autoFocus
                    />
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredSearchProducts.length === 0 ? (
                      <p className="p-3 text-center text-xs text-slate-400 font-bold">لا يوجد صنف مسجل مطابق للبحث</p>
                    ) : (
                      filteredSearchProducts.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => handleSelectCandidate(row.sourceRowId, p)}
                          className="p-2 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 rounded-lg cursor-pointer transition-all flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-black text-slate-800">{p.Name || p.name}</span>
                            {p.barcode && <span className="text-[10px] text-slate-400 mr-2">({p.barcode})</span>}
                            {p.categoryName && <span className="text-[10px] text-purple-600 mr-2">[{p.categoryName}]</span>}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            {p.UnitPrice && <span>سعر: {p.UnitPrice} ج.م</span>}
                            <button
                              type="button"
                              className="px-2.5 py-0.5 bg-[#1E4D4D] text-white rounded text-[10px] font-black"
                            >
                              ربط
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Create New Product Draft Form */}
              {row.action === ProductResolutionAction.CREATE_NEW && (
                <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-blue-900">بيانات الصنف الجديد المزمع إضافته للمخزون:</span>
                    <button
                      type="button"
                      onClick={() => setEditingDraftRowId(isDraftEditing ? null : row.sourceRowId)}
                      className="text-[10px] font-black text-blue-700 hover:underline flex items-center gap-1"
                    >
                      <Edit3 size={11} />
                      <span>{isDraftEditing ? 'إخفاء التعديل' : 'تعديل التفاصيل'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-0.5">اسم الصنف الدوائي *</label>
                      <input
                        type="text"
                        value={row.newProductData?.name || row.importedProductName}
                        onChange={(e) => {
                          onUpdateDecision(row.sourceRowId, {
                            newProductData: {
                              ...row.newProductData,
                              name: e.target.value
                            }
                          });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-0.5">الباركود</label>
                      <input
                        type="text"
                        value={row.newProductData?.barcode || row.barcode || ''}
                        onChange={(e) => {
                          onUpdateDecision(row.sourceRowId, {
                            newProductData: {
                              ...row.newProductData,
                              name: row.newProductData?.name || row.importedProductName,
                              barcode: e.target.value
                            }
                          });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800"
                        placeholder="الباركود الدولي"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-0.5">التركيز / القوة</label>
                      <input
                        type="text"
                        value={row.newProductData?.strength || ''}
                        onChange={(e) => {
                          onUpdateDecision(row.sourceRowId, {
                            newProductData: {
                              ...row.newProductData,
                              name: row.newProductData?.name || row.importedProductName,
                              strength: e.target.value
                            }
                          });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800"
                        placeholder="e.g. 500mg"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-0.5">الشكل الدوائي</label>
                      <input
                        type="text"
                        value={row.newProductData?.form || ''}
                        onChange={(e) => {
                          onUpdateDecision(row.sourceRowId, {
                            newProductData: {
                              ...row.newProductData,
                              name: row.newProductData?.name || row.importedProductName,
                              form: e.target.value
                            }
                          });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800"
                        placeholder="e.g. Tab / شراب"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
