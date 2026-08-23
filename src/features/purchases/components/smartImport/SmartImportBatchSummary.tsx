// src/features/purchases/components/smartImport/SmartImportBatchSummary.tsx
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.4: Resolution Metrics Bar & Dynamic Category Filter Tabs
 */

import React from 'react';
import { BatchProcessingSummary } from '../../services/smartImport/batchProcessing/types';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Plus, 
  Ban, 
  Layers, 
  Search,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Building2
} from 'lucide-react';

export type ProductFilterTab = 
  | 'ALL' 
  | 'NEEDS_REVIEW' 
  | 'CONFLICTS' 
  | 'MATCHED' 
  | 'NEW' 
  | 'SKIPPED';

export interface SmartImportBatchSummaryProps {
  summary: BatchProcessingSummary;
  supplierStatus?: string;
  activeTab: ProductFilterTab;
  onTabChange: (tab: ProductFilterTab) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  confidenceScore?: number;
  confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW' | 'BLOCKED';
  providerName?: string;
  isCached?: boolean;
  isFallbackActive?: boolean;
  healedRowsCount?: number;
}

export const SmartImportBatchSummary: React.FC<SmartImportBatchSummaryProps> = ({
  summary,
  supplierStatus,
  activeTab,
  onTabChange,
  searchTerm,
  onSearchChange,
  confidenceScore,
  confidenceLevel,
  providerName,
  isCached,
  isFallbackActive,
  healedRowsCount = 0
}) => {
  const criticalCount = summary.criticalConflictsCount || 0;

  const getConfidenceBadge = () => {
    if (confidenceScore === undefined) return null;
    const pct = Math.round(confidenceScore * 100);
    if (confidenceLevel === 'BLOCKED' || criticalCount > 0) {
      return (
        <span className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800 text-[10px] font-black border border-rose-300 flex items-center gap-1" title="تعارض أمان دوائي أو بيانات غير صالحة">
          <ShieldAlert size={12} className="text-rose-600" />
          <span>محظور للأمان ({pct}%)</span>
        </span>
      );
    }
    if (confidenceScore >= 0.90) {
      return (
        <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-black border border-emerald-300 flex items-center gap-1" title="دقة استخراج وتطابق عالية جداً">
          <CheckCircle2 size={12} className="text-emerald-600" />
          <span>دقة عالية ({pct}%)</span>
        </span>
      );
    }
    if (confidenceScore >= 0.70) {
      return (
        <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 text-[10px] font-black border border-amber-300 flex items-center gap-1" title="دقة متوسطة - يرجى مراجعة الأصناف">
          <AlertTriangle size={12} className="text-amber-600" />
          <span>دقة متوسطة ({pct}%)</span>
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800 text-[10px] font-black border border-rose-300 flex items-center gap-1" title="دقة منخفضة - يلزم مراجعة كاملة">
        <AlertTriangle size={12} className="text-rose-600" />
        <span>دقة منخفضة ({pct}%)</span>
      </span>
    );
  };

  return (
    <div className="space-y-2.5 font-cairo" id="smart-import-batch-summary">
      {/* Metrics Row / Chips */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 sm:p-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-[11px] font-black w-full sm:w-auto scrollbar-none">
          {/* ALL Tab */}
          <button
            id="tab-all"
            type="button"
            onClick={() => onTabChange('ALL')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shrink-0 select-none ${
              activeTab === 'ALL'
                ? 'bg-[#1E4D4D] text-white shadow-sm ring-2 ring-[#1E4D4D]/20'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Layers size={13} />
            <span>الكل ({summary.totalRows})</span>
          </button>

          {/* CRITICAL CONFLICTS Tab */}
          {criticalCount > 0 && (
            <button
              id="tab-conflicts"
              type="button"
              onClick={() => onTabChange('CONFLICTS')}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shrink-0 select-none animate-pulse ${
                activeTab === 'CONFLICTS'
                  ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-500/30'
                  : 'bg-rose-50 border border-rose-300 text-rose-800 hover:bg-rose-100'
              }`}
            >
              <ShieldAlert size={13} className="text-rose-500" />
              <span>تعارضات أمان ({criticalCount})</span>
            </button>
          )}

          {/* NEEDS REVIEW Tab */}
          {summary.unresolvedCount > 0 && (
            <button
              id="tab-needs-review"
              type="button"
              onClick={() => onTabChange('NEEDS_REVIEW')}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shrink-0 select-none ${
                activeTab === 'NEEDS_REVIEW'
                  ? 'bg-amber-600 text-white shadow-sm ring-2 ring-amber-500/20'
                  : 'bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100'
              }`}
            >
              <AlertTriangle size={13} className="text-amber-600" />
              <span>تحتاج قرار ({summary.unresolvedCount})</span>
            </button>
          )}

          {/* MATCHED Tab */}
          <button
            id="tab-matched"
            type="button"
            onClick={() => onTabChange('MATCHED')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shrink-0 select-none ${
              activeTab === 'MATCHED'
                ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/20'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <CheckCircle2 size={13} className="text-emerald-600" />
            <span>مطابقة ({summary.autoMatchedCount + summary.manualLinkedCount})</span>
          </button>

          {/* NEW PRODUCTS Tab */}
          {summary.createNewCount > 0 && (
            <button
              id="tab-new"
              type="button"
              onClick={() => onTabChange('NEW')}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shrink-0 select-none ${
                activeTab === 'NEW'
                  ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-500/20'
                  : 'bg-blue-50 border border-blue-200 text-blue-800 hover:bg-blue-100'
              }`}
            >
              <Plus size={13} className="text-blue-600" />
              <span>أصناف جديدة ({summary.createNewCount})</span>
            </button>
          )}

          {/* SKIPPED Tab */}
          {summary.skippedCount > 0 && (
            <button
              id="tab-skipped"
              type="button"
              onClick={() => onTabChange('SKIPPED')}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shrink-0 select-none ${
                activeTab === 'SKIPPED'
                  ? 'bg-slate-700 text-white shadow-sm ring-2 ring-slate-500/20'
                  : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Ban size={13} />
              <span>مستبعدة ({summary.skippedCount})</span>
            </button>
          )}
        </div>

        {/* Confidence & Badges & Total Amount */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-700 w-full sm:w-auto justify-between sm:justify-end pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-200">
          {getConfidenceBadge()}

          {healedRowsCount > 0 && (
            <span className="text-[10px] bg-sky-50 text-sky-800 px-2 py-0.5 rounded-lg border border-sky-200 font-bold flex items-center gap-1" title="تم تطبيع وإصلاح بعض الحقول ذاتياً">
              <Sparkles size={11} className="text-sky-600" />
              <span>{healedRowsCount} سطر تم علاجه</span>
            </span>
          )}

          {summary.detectedInvoiceNumber && (
            <span className="text-[11px] text-slate-500 bg-white px-2 py-1 rounded-lg border border-slate-200">
              فاتورة: <strong className="text-slate-800 font-mono">{summary.detectedInvoiceNumber}</strong>
            </span>
          )}
          <span className="text-[11px] bg-teal-50 text-[#1E4D4D] px-2.5 py-1 rounded-lg border border-teal-200 font-black">
            الإجمالي: {summary.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
          <Search size={14} />
        </div>
        <input
          id="search-imported-products"
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="بحث في الأصناف المستوردة بالاسم، الباركود، أو السعر..."
          className="w-full pl-3 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E4D4D]/20 focus:border-[#1E4D4D] transition-all"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-slate-400 hover:text-slate-600"
          >
            مسح
          </button>
        )}
      </div>
    </div>
  );
};
