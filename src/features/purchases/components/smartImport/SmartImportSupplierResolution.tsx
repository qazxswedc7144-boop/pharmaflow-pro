// src/features/purchases/components/smartImport/SmartImportSupplierResolution.tsx
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.4: Human Resolution UX — Supplier Resolution Card
 */

import React, { useState } from 'react';
import { 
  SupplierDecision, 
  SupplierResolutionAction, 
  SupplierResolutionStatus 
} from '../../services/smartImport/batchProcessing/types';
import { Supplier } from '@/types';
import { 
  Building2, 
  CheckCircle2, 
  AlertCircle, 
  UserPlus, 
  Search, 
  Sparkles,
  Ban
} from 'lucide-react';

interface SmartImportSupplierResolutionProps {
  supplierDecision: SupplierDecision;
  availableSuppliers: Supplier[];
  onChange: (update: Partial<SupplierDecision>) => void;
}

export const SmartImportSupplierResolution: React.FC<SmartImportSupplierResolutionProps> = ({
  supplierDecision,
  availableSuppliers,
  onChange
}) => {
  const [isSearching, setIsSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewSupplierForm, setShowNewSupplierForm] = useState(
    supplierDecision.action === SupplierResolutionAction.CREATE_NEW
  );

  const filteredSuppliers = React.useMemo(() => {
    if (!searchTerm) return availableSuppliers.slice(0, 8);
    const q = searchTerm.toLowerCase();
    return availableSuppliers.filter(s => 
      (s.Supplier_Name || '').toLowerCase().includes(q) ||
      (s.Supplier_ID || '').toLowerCase().includes(q) ||
      (s.Phone || '').includes(q)
    ).slice(0, 10);
  }, [availableSuppliers, searchTerm]);

  const getStatusBadge = () => {
    switch (supplierDecision.status) {
      case SupplierResolutionStatus.EXACT_MATCH:
        return (
          <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[11px] font-black flex items-center gap-1">
            <CheckCircle2 size={13} />
            تطابق تام (100%)
          </span>
        );
      case SupplierResolutionStatus.HIGH_CONFIDENCE_MATCH:
        return (
          <span className="px-2.5 py-1 rounded-lg bg-teal-100 text-teal-800 text-[11px] font-black flex items-center gap-1">
            <Sparkles size={13} />
            مطابقة موثوقة ({Math.round(supplierDecision.confidence * 100)}%)
          </span>
        );
      case SupplierResolutionStatus.POSSIBLE_MATCH:
      case SupplierResolutionStatus.AMBIGUOUS:
        return (
          <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 text-[11px] font-black flex items-center gap-1">
            <AlertCircle size={13} />
            مورد مقترح (يتطلب تأكيد)
          </span>
        );
      case SupplierResolutionStatus.NEW_SUPPLIER:
      default:
        return (
          <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 text-[11px] font-black flex items-center gap-1">
            <UserPlus size={13} />
            مورد جديد غير مسجل
          </span>
        );
    }
  };

  const handleSelectExisting = (supplier: Supplier) => {
    onChange({
      matchedSupplierId: supplier.id || supplier.Supplier_ID,
      matchedSupplierName: supplier.Supplier_Name,
      action: SupplierResolutionAction.LINK_EXISTING,
      isSkipped: false,
      reason: `تم الاختيار اليدوي للمورد: ${supplier.Supplier_Name}`
    });
    setIsSearching(false);
    setShowNewSupplierForm(false);
  };

  const handleCreateNewClick = () => {
    setShowNewSupplierForm(true);
    setIsSearching(false);
    onChange({
      action: SupplierResolutionAction.CREATE_NEW,
      isSkipped: false,
      newSupplierData: {
        name: supplierDecision.newSupplierData?.name || supplierDecision.importedSupplierName || '',
        phone: supplierDecision.newSupplierData?.phone || '',
        taxNumber: supplierDecision.newSupplierData?.taxNumber || '',
        address: supplierDecision.newSupplierData?.address || ''
      },
      reason: 'تم تحديد إنشاء مورد جديد في قاعدة البيانات'
    });
  };

  const handleSkipSupplier = () => {
    onChange({
      action: SupplierResolutionAction.SKIP,
      isSkipped: true,
      reason: 'تم تخطي تعيين المورد'
    });
    setIsSearching(false);
    setShowNewSupplierForm(false);
  };

  return (
    <div 
      id="smart-import-supplier-card"
      className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-2xs font-cairo space-y-3"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[#1E4D4D]/10 text-[#1E4D4D] rounded-xl">
            <Building2 size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-black text-slate-800">
                المورد المستورد:{' '}
                <span className="text-[#1E4D4D] font-mono">
                  {supplierDecision.importedSupplierName || 'غير محدد بالملف'}
                </span>
              </h4>
              {getStatusBadge()}
            </div>
            {supplierDecision.reason && (
              <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                {supplierDecision.reason}
              </p>
            )}
          </div>
        </div>

        {/* Quick Decision Actions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            id="btn-search-supplier"
            type="button"
            onClick={() => {
              setIsSearching(!isSearching);
              setShowNewSupplierForm(false);
            }}
            className="px-2.5 py-1 text-[11px] font-black bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1 transition-all"
          >
            <Search size={12} />
            <span>{isSearching ? 'إغلاق البحث' : 'بحث عن مورد مسجل'}</span>
          </button>

          <button
            id="btn-create-supplier"
            type="button"
            onClick={handleCreateNewClick}
            className={`px-2.5 py-1 text-[11px] font-black rounded-lg flex items-center gap-1 transition-all ${
              supplierDecision.action === SupplierResolutionAction.CREATE_NEW
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200'
            }`}
          >
            <UserPlus size={12} />
            <span>إنشاء مورد جديد</span>
          </button>

          <button
            id="btn-skip-supplier"
            type="button"
            onClick={handleSkipSupplier}
            className={`px-2 py-1 text-[11px] font-black rounded-lg flex items-center gap-1 transition-all ${
              supplierDecision.isSkipped
                ? 'bg-slate-700 text-white shadow-2xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200'
            }`}
          >
            <Ban size={12} />
            <span>تخطي</span>
          </button>
        </div>
      </div>

      {/* Suggested Supplier Match Cards (if any) */}
      {!isSearching && !showNewSupplierForm && supplierDecision.suggestedSuppliers?.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-slate-100">
          <span className="text-[10px] font-black text-slate-500">الموردون المقترحون بناءً على الاسم أو السجل:</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {supplierDecision.suggestedSuppliers.map((s) => {
              const isMatched = supplierDecision.matchedSupplierId === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => {
                    const full = availableSuppliers.find(sup => sup.id === s.id || sup.Supplier_ID === s.id);
                    if (full) handleSelectExisting(full);
                  }}
                  className={`p-2 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                    isMatched
                      ? 'bg-emerald-50/90 border-emerald-400 ring-2 ring-emerald-500/20'
                      : 'bg-slate-50/80 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-slate-800 truncate">{s.name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      {s.taxNumber && <span>س.ت: {s.taxNumber}</span>}
                      {s.phone && <span>هاتف: {s.phone}</span>}
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <span className="text-[10px] font-mono font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                      {Math.round(s.score * 100)}%
                    </span>
                    {isMatched && <CheckCircle2 size={14} className="text-emerald-600 mt-1" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search Registered Supplier Dropdown / Panel */}
      {isSearching && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <div className="relative">
            <Search size={14} className="absolute inset-y-0 right-3 my-auto text-slate-400" />
            <input
              id="input-search-supplier-term"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالاسم، كود المورد، أو رقم الهاتف..."
              className="w-full pl-3 pr-9 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E4D4D]/20 focus:border-[#1E4D4D]"
              autoFocus
            />
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1">
            {filteredSuppliers.length === 0 ? (
              <p className="p-3 text-center text-xs text-slate-400 font-bold">لا يوجد مورد مسجل بهذا الاسم</p>
            ) : (
              filteredSuppliers.map((s) => (
                <div
                  key={s.id || s.Supplier_ID}
                  onClick={() => handleSelectExisting(s)}
                  className="p-2 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 rounded-lg cursor-pointer transition-all flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-black text-slate-800">{s.Supplier_Name}</span>
                    <span className="text-[10px] text-slate-400 mr-2">({s.Supplier_ID || s.id})</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    {s.Phone && <span>{s.Phone}</span>}
                    <button
                      type="button"
                      className="px-2 py-0.5 bg-[#1E4D4D] text-white rounded text-[10px] font-black"
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

      {/* Create New Supplier Draft Form */}
      {showNewSupplierForm && (
        <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl space-y-2">
          <span className="text-[11px] font-black text-blue-900 block">بيانات المورد الجديد المزمع إنشاؤه:</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-0.5">اسم المورد *</label>
              <input
                id="input-new-supplier-name"
                type="text"
                value={supplierDecision.newSupplierData?.name || ''}
                onChange={(e) => {
                  onChange({
                    newSupplierData: {
                      ...supplierDecision.newSupplierData,
                      name: e.target.value
                    }
                  });
                }}
                className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800"
                placeholder="اسم المورد"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-0.5">رقم الهاتف</label>
              <input
                id="input-new-supplier-phone"
                type="text"
                value={supplierDecision.newSupplierData?.phone || ''}
                onChange={(e) => {
                  onChange({
                    newSupplierData: {
                      ...supplierDecision.newSupplierData,
                      name: supplierDecision.newSupplierData?.name || supplierDecision.importedSupplierName || '',
                      phone: e.target.value
                    }
                  });
                }}
                className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800"
                placeholder="01xxxxxxxxx"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-0.5">الرقم الضريبي / السجل</label>
              <input
                id="input-new-supplier-tax"
                type="text"
                value={supplierDecision.newSupplierData?.taxNumber || ''}
                onChange={(e) => {
                  onChange({
                    newSupplierData: {
                      ...supplierDecision.newSupplierData,
                      name: supplierDecision.newSupplierData?.name || supplierDecision.importedSupplierName || '',
                      taxNumber: e.target.value
                    }
                  });
                }}
                className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800"
                placeholder="123-456-789"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-0.5">العنوان</label>
              <input
                id="input-new-supplier-address"
                type="text"
                value={supplierDecision.newSupplierData?.address || ''}
                onChange={(e) => {
                  onChange({
                    newSupplierData: {
                      ...supplierDecision.newSupplierData,
                      name: supplierDecision.newSupplierData?.name || supplierDecision.importedSupplierName || '',
                      address: e.target.value
                    }
                  });
                }}
                className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800"
                placeholder="القاهرة، مصر"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
