// src/features/purchases/components/smartImport/SmartImportProcessingCenter.tsx
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Mobile-First Enterprise Review Center — Unified Smart Import Review & Human Resolution UX
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  BatchProcessingSession,
  SupplierDecision,
  ProductDecision,
  ProductResolutionAction,
  CanonicalResolutionResult
} from '../../services/smartImport/batchProcessing/types';
import { BatchProcessingOrchestrator } from '../../services/smartImport/batchProcessing/batchProcessingOrchestrator';
import { ImportAnalysisResult, ExtractedImportRow } from '../../services/smartImport/types';
import { Product, Supplier } from '@/types';
import { SmartImportSupplierResolution } from './SmartImportSupplierResolution';
import { SmartImportBatchSummary, ProductFilterTab } from './SmartImportBatchSummary';
import { SmartImportBulkActions } from './SmartImportBulkActions';
import { SmartImportProductResolution } from './SmartImportProductResolution';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  X,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Camera,
  Edit3
} from 'lucide-react';
import { Modal } from '@/components/shared/SharedUI';
import { useUIStore } from '@/store/useUIStore';

interface SmartImportProcessingCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onCancel?: () => void;
  analysisResult: ImportAnalysisResult | null;
  isLoading: boolean;
  progressStage?: string;
  progressPercent?: number;
  progressMessage?: string;
  onApply: (
    approvedRows: ExtractedImportRow[],
    supplierName?: string,
    invoiceNumber?: string,
    date?: string,
    canonicalResult?: CanonicalResolutionResult
  ) => void;
  onApplyAndSaveImmediately?: (
    approvedRows: ExtractedImportRow[],
    supplierName?: string,
    invoiceNumber?: string,
    date?: string,
    canonicalResult?: CanonicalResolutionResult
  ) => void;
  availableProducts?: Product[];
  availableSuppliers?: Supplier[];
}

/**
 * Local type for canonical invoice item to avoid unsafe `any` usage while mapping results.
 * We keep fields optional to be defensive against missing properties.
 */
interface CanonicalInvoiceItem {
  name?: string;
  product_id?: number | string;
  productId?: number | string;
  qty?: number;
  price?: number;
  sum?: number;
  barcode?: string;
  expiryDate?: string;
  discountPercent?: number;
  bonusQty?: number;
  notes?: string;
}

export const SmartImportProcessingCenter: React.FC<SmartImportProcessingCenterProps> = ({
  isOpen,
  onClose,
  onCancel,
  analysisResult,
  isLoading,
  progressPercent = 50,
  progressMessage = 'جاري تحليل ومعالجة المستند...',
  onApply,
  onApplyAndSaveImmediately,
  availableProducts = [],
  availableSuppliers = []
}) => {
  const [session, setSession] = useState<BatchProcessingSession | null>(null);
  const [activeFilterTab, setActiveFilterTab] = useState<ProductFilterTab>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [validationErrorMsg, setValidationErrorMsg] = useState<string | null>(null);

  // Manual overrides for invoice metadata
  const [customInvoiceNumber, setCustomInvoiceNumber] = useState<string>('');
  const [customInvoiceDate, setCustomInvoiceDate] = useState<string>('');

  const addToast = useUIStore(state => state.addToast);

  // Initialize batch session whenever analysisResult is ready and modal is open
  useEffect(() => {
    let isMounted = true;

    const initSession = async () => {
      if (!analysisResult || !isOpen) return;
      try {
        const newSession = await BatchProcessingOrchestrator.startSession({
          analysis: analysisResult,
          sourceType: analysisResult.sourceType,
          fileName: analysisResult.fileName
        });
        if (!isMounted) return;
        setSession(newSession);
        setSelectedRowIds(new Set());
        setValidationErrorMsg(null);
        setCustomInvoiceNumber(newSession.summary.detectedInvoiceNumber || '');
        setCustomInvoiceDate(newSession.summary.detectedDate || '');
      } catch (err) {
        // Keep error handling minimal but informative for debugging
        // eslint-disable-next-line no-console
        console.error('[SmartImportProcessingCenter] Session init error:', err);
      }
    };

    initSession();

    return () => {
      isMounted = false;
    };
  }, [analysisResult, isOpen]);

  // Filtered product decisions based on active tab and search query
  const displayedProductDecisions = useMemo(() => {
    if (!session) return [];
    const q = searchTerm.trim().toLowerCase();
    return session.productDecisions.filter(p => {
      if (q) {
        const matchesName =
          (p.importedProductName || '').toLowerCase().includes(q) ||
          (p.matchedProductName || '').toLowerCase().includes(q);
        const matchesBarcode = (p.barcode || '').toLowerCase().includes(q);
        const matchesCode = (p.supplierProductCode || '').toLowerCase().includes(q);
        if (!matchesName && !matchesBarcode && !matchesCode) return false;
      }

      switch (activeFilterTab) {
        case 'CONFLICTS':
          return Boolean(p.dosageSafety?.isConflict) && !p.isSkipped;
        case 'NEEDS_REVIEW':
          return p.action === ProductResolutionAction.UNRESOLVED && !p.isSkipped;
        case 'MATCHED':
          return (
            (p.action === ProductResolutionAction.AUTO_MATCH || p.action === ProductResolutionAction.LINK_EXISTING) &&
            !p.isSkipped
          );
        case 'NEW':
          return p.action === ProductResolutionAction.CREATE_NEW && !p.isSkipped;
        case 'SKIPPED':
          return p.action === ProductResolutionAction.SKIP || p.isSkipped;
        case 'ALL':
        default:
          return true;
      }
    });
  }, [session, activeFilterTab, searchTerm]);

  // Selection handlers
  const allDisplayedSelected = useMemo(() => {
    if (displayedProductDecisions.length === 0) return false;
    return displayedProductDecisions.every(p => selectedRowIds.has(p.sourceRowId));
  }, [displayedProductDecisions, selectedRowIds]);

  const handleToggleSelectAll = () => {
    if (allDisplayedSelected) {
      setSelectedRowIds(new Set());
    } else {
      const newSet = new Set<number>(selectedRowIds);
      displayedProductDecisions.forEach(p => newSet.add(p.sourceRowId));
      setSelectedRowIds(newSet);
    }
  };

  const handleToggleSelectRow = (rowId: number) => {
    const newSet = new Set<number>(selectedRowIds);
    if (newSet.has(rowId)) {
      newSet.delete(rowId);
    } else {
      newSet.add(rowId);
    }
    setSelectedRowIds(newSet);
  };

  // Supplier update handler
  const handleUpdateSupplier = (update: Partial<SupplierDecision>) => {
    if (!session) return;
    const updatedSession = BatchProcessingOrchestrator.updateSupplier(session, update);
    setSession(updatedSession);
    setValidationErrorMsg(null);
  };

  // Product update handler
  const handleUpdateProduct = (sourceRowId: number, update: Partial<ProductDecision>) => {
    if (!session) return;
    const updatedSession = BatchProcessingOrchestrator.updateProduct(session, sourceRowId, update);
    setSession(updatedSession);
    setValidationErrorMsg(null);
  };

  // Bulk actions handlers
  const handleBulkApproveMatched = () => {
    if (!session) return;
    const updated = BatchProcessingOrchestrator.applyBulkAction(session, 'APPROVE_ALL_MATCHED');
    setSession(updated);
    addToast('تم اعتماد المطابقات التلقائية الآمنة بنجاح', 'success');
  };

  const handleBulkCreateNew = () => {
    if (!session || selectedRowIds.size === 0) return;
    // Capture count before resetting selection state to ensure accurate toast message
    const count = selectedRowIds.size;
    const ids = Array.from(selectedRowIds);
    const updated = BatchProcessingOrchestrator.applyBulkAction(session, 'CREATE_SELECTED', ids);
    setSession(updated);
    setSelectedRowIds(new Set());
    addToast(`تم تعيين ${count} صنف لإنشائها كأصناف جديدة`, 'info');
  };

  const handleBulkSkipSelected = () => {
    if (!session || selectedRowIds.size === 0) return;
    const count = selectedRowIds.size;
    const ids = Array.from(selectedRowIds);
    const updated = BatchProcessingOrchestrator.applyBulkAction(session, 'SKIP_SELECTED', ids);
    setSession(updated);
    setSelectedRowIds(new Set());
    addToast(`تم استبعاد ${count} صنف من الفاتورة`, 'info');
  };

  // Execution Apply handlers
  const handleExecuteApply = async (saveImmediately: boolean = false) => {
    if (!session) return;
    setIsApplying(true);
    setValidationErrorMsg(null);

    try {
      // 1. Validate Session
      const validation = await BatchProcessingOrchestrator.validateSession(session);
      if (!validation.canApply) {
        const firstError = validation.errors?.[0]?.message ?? 'يرجى استكمال القرارات لجميع الأصناف والمورد قبل التطبيق';
        setValidationErrorMsg(firstError);
        addToast(`⚠️ تعذر التطبيق: ${firstError}`, 'error');
        setIsApplying(false);
        return;
      }

      // 2. Atomic Batch Apply
      const canonicalResult: CanonicalResolutionResult = await BatchProcessingOrchestrator.applyBatchSession(session);

      // Convert canonical invoice items to legacy row structure for backwards compatibility
      const invoiceItems: CanonicalInvoiceItem[] = Array.isArray(canonicalResult.invoiceItems)
        ? (canonicalResult.invoiceItems as CanonicalInvoiceItem[])
        : [];

      const approvedRows: ExtractedImportRow[] = invoiceItems.map((item, idx) => {
        const matchedId = item.product_id ?? item.productId ?? null;
        const quantity = typeof item.qty === 'number' ? item.qty : Number(item.qty) || 0;
        const unitPrice = typeof item.price === 'number' ? item.price : Number(item.price) || 0;
        const total = typeof item.sum === 'number' ? item.sum : Number(item.sum) || unitPrice * quantity;

        const row: ExtractedImportRow = {
          rowNumber: idx + 1,
          rawCells: {},
          productName: item.name ?? '',
          matchedProductId: matchedId ?? undefined,
          matchedProductName: item.name ?? '',
          quantity,
          unitPrice,
          total,
          expectedTotal: total,
          barcode: item.barcode,
          expiryDate: item.expiryDate,
          discountPercent: item.discountPercent,
          bonusQty: item.bonusQty,
          notes: item.notes,
          status: 'VALID',
          confidenceScore: 1.0,
          validationIssues: []
        };

        return row;
      });

      const finalSupplierName = canonicalResult.appliedSupplierName ?? session.summary.detectedSupplier;
      const finalInvoiceNumber = customInvoiceNumber || canonicalResult.appliedInvoiceNumber || session.summary.detectedInvoiceNumber;
      const finalDate = customInvoiceDate || canonicalResult.appliedDate || session.summary.detectedDate;

      if (saveImmediately && typeof onApplyAndSaveImmediately === 'function') {
        onApplyAndSaveImmediately(approvedRows, finalSupplierName, finalInvoiceNumber, finalDate, canonicalResult);
      } else {
        onApply(approvedRows, finalSupplierName, finalInvoiceNumber, finalDate, canonicalResult);
      }

      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error('[SmartImportProcessingCenter] Apply error:', err);
      setValidationErrorMsg(message || 'حدث خطأ أثناء تطبيق دفعة الاستيراد');
      addToast(`❌ خطأ في تطبيق الاستيراد: ${message || 'حدث خطأ غير متوقع'}`, 'error');
    } finally {
      setIsApplying(false);
    }
  };

  const handleCancel = async () => {
    try {
      if (session) {
        await BatchProcessingOrchestrator.cancelSession(session.sessionId);
      }
    } catch (err) {
      // ignore cancel errors but log for diagnostics
      // eslint-disable-next-line no-console
      console.error('[SmartImportProcessingCenter] Cancel session error:', err);
    } finally {
      onCancel?.();
      onClose();
    }
  };

  const getSourceIcon = (type?: string) => {
    switch (type) {
      case 'EXCEL':
        return <FileSpreadsheet className="text-emerald-600" size={14} />;
      case 'CSV':
        return <FileText className="text-blue-600" size={14} />;
      case 'PDF':
        return <FileText className="text-red-600" size={14} />;
      case 'CAMERA':
        return <Camera className="text-amber-600" size={14} />;
      default:
        return <ImageIcon className="text-purple-600" size={14} />;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title=""
      maxWidth="max-w-[880px] w-full sm:w-[95vw]"
      noPadding={true}
      centerOnMobile={true}
      showCloseButton={false}
    >
      <div
        dir="rtl"
        className="flex flex-col h-[96dvh] sm:h-[90vh] max-h-[96dvh] bg-white rounded-2xl sm:rounded-3xl overflow-hidden font-cairo select-none max-w-full"
      >
        {/* COMPACT FIXED HEADER */}
        <div className="bg-[#1E4D4D] text-white px-3.5 py-2.5 flex items-center justify-between shadow-xs shrink-0 pt-safe">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-emerald-300 shrink-0">
              <Sparkles size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-xs sm:text-sm font-black tracking-wide">مركز مراجعة الاستيراد</h2>
                {analysisResult && (
                  <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-200 text-[10px] font-bold rounded flex items-center gap-1">
                    {getSourceIcon(analysisResult.sourceType)}
                    {analysisResult.sourceType}
                  </span>
                )}
                {analysisResult?.metadata?.providerName && (
                  <span className="px-1.5 py-0.2 bg-teal-500/20 text-teal-100 text-[10px] font-bold rounded">
                    ⚡ {analysisResult.metadata.providerName}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-emerald-100/80 font-medium truncate max-w-[260px] sm:max-w-md">
                راجع البيانات المستخرجة واتخذ القرار قبل إضافة الأصناف إلى الفاتورة
              </p>
            </div>
          </div>

          <button
            id="btn-close-processing-center"
            onClick={handleCancel}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all active:scale-95 shrink-0"
            title="إغلاق"
          >
            <X size={16} />
          </button>
        </div>

        {/* LOADING STATE */}
        {isLoading && (
          <div className="p-8 flex flex-col items-center justify-center space-y-4 my-auto">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-100 animate-ping opacity-30" />
              <div className="w-14 h-14 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin flex items-center justify-center">
                <Sparkles className="text-emerald-600 animate-pulse" size={20} />
              </div>
            </div>
            
            <div className="text-center space-y-1 max-w-sm">
              <h3 className="text-xs sm:text-sm font-black text-[#1E4D4D]">{progressMessage}</h3>
              <p className="text-[10px] sm:text-[11px] font-bold text-slate-400">
                جاري فحص سلامة المستند، مطابقة الأصناف والمورد...
              </p>
            </div>

            <div className="w-full max-w-xs bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(15, progressPercent))}%` }}
              />
            </div>

            <button
              id="btn-abort-smart-import"
              type="button"
              onClick={handleCancel}
              className="mt-2 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all active:scale-95"
            >
              إلغاء المعالجة
            </button>
          </div>
        )}

        {/* MAIN BATCH PROCESSING WORKSPACE */}
        {!isLoading && session && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Scrollable Container for Top Panels */}
            <div className="p-2.5 sm:p-3 space-y-2.5 overflow-y-auto shrink-0 max-h-[40vh] border-b border-slate-100 bg-slate-50/50">
              {/* Invoice Data & Supplier Resolution Panel */}
              <SmartImportSupplierResolution
                supplierDecision={session.supplierDecision}
                availableSuppliers={availableSuppliers}
                onChange={handleUpdateSupplier}
                detectedInvoiceNumber={customInvoiceNumber || session.summary.detectedInvoiceNumber}
                detectedDate={customInvoiceDate || session.summary.detectedDate}
                onUpdateInvoiceNumber={setCustomInvoiceNumber}
                onUpdateInvoiceDate={setCustomInvoiceDate}
              />

              {/* Batch Summary & Filter Tabs */}
              <SmartImportBatchSummary
                summary={session.summary}
                supplierStatus={session.supplierDecision.status}
                activeTab={activeFilterTab}
                onTabChange={setActiveFilterTab}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                confidenceScore={analysisResult?.summary?.confidenceScore}
                confidenceLevel={analysisResult?.summary?.confidenceLevel}
                providerName={analysisResult?.metadata?.providerName}
                isCached={analysisResult?.metadata?.isCached}
                isFallbackActive={analysisResult?.metadata?.isFallbackUsed}
                healedRowsCount={analysisResult?.summary?.healedRowsCount}
              />

              {/* Bulk Actions Toolbar */}
              <SmartImportBulkActions
                selectedCount={selectedRowIds.size}
                totalDisplayedCount={displayedProductDecisions.length}
                allSelected={allDisplayedSelected}
                onToggleSelectAll={handleToggleSelectAll}
                onBulkApproveMatched={handleBulkApproveMatched}
                onBulkCreateNew={handleBulkCreateNew}
                onBulkSkipSelected={handleBulkSkipSelected}
              />
            </div>

            {/* Validation Error Alert if any */}
            {validationErrorMsg && (
              <div className="mx-2.5 mt-2 p-2 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-800 flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-600 shrink-0" />
                <span>{validationErrorMsg}</span>
              </div>
            )}

            {/* Products Resolution Cards List */}
            <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-2 min-h-0">
              <SmartImportProductResolution
                productDecisions={displayedProductDecisions}
                selectedRowIds={selectedRowIds}
                availableProducts={availableProducts}
                onToggleSelectRow={handleToggleSelectRow}
                onUpdateDecision={handleUpdateProduct}
              />
            </div>

            {/* FIXED FOOTER ACTIONS (Mobile Safe Bottom) */}
            <div className="p-2.5 sm:p-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row gap-2 shrink-0 pb-safe">
              <button
                id="btn-apply-import-invoice"
                type="button"
                disabled={isApplying}
                onClick={() => handleExecuteApply(false)}
                className="flex-[2] min-h-[42px] h-11 bg-[#1E4D4D] hover:bg-[#163a3a] text-white rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all"
              >
                {isApplying ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Edit3 size={15} />
                )}
                <span>
                  اعتماد القرارات وتعبئة الفاتورة ({session.summary.totalRows - session.summary.skippedCount} صنف)
                </span>
              </button>

              {onApplyAndSaveImmediately && (
                <button
                  id="btn-apply-and-save-immediately"
                  type="button"
                  disabled={isApplying}
                  onClick={() => handleExecuteApply(true)}
                  className="flex-1 min-h-[42px] h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all"
                >
                  {isApplying ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 size={15} />
                  )}
                  <span>حفظ فوري وترحيل 💾</span>
                </button>
              )}

              <button
                id="btn-cancel-processing-center"
                type="button"
                onClick={handleCancel}
                disabled={isApplying}
                className="min-h-[42px] h-11 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-xs active:scale-95 transition-all disabled:opacity-50"
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
