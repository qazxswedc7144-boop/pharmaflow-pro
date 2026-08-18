// src/modules/branches/pages/BranchesList.tsx

import React, { useState, useEffect } from 'react';
import { BranchService } from '../services/BranchService';
import { Branch, BranchSettings } from '@/types';
import { useUI } from '@/contexts/AppContext';
import { 
  Building2, MapPin, Phone, SlidersHorizontal, 
  Plus, Search, Edit2, RotateCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BackButton } from '@/components/shared/BackButton';

export const BranchesList: React.FC<{ onNavigate?: (view: string) => void }> = ({ onNavigate }) => {
  const { addToast } = useUI();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Modals / Editors state
  const [isEditing, setIsEditing] = useState(false);
  const [currentBranch, setCurrentBranch] = useState<Partial<Branch> | null>(null);
  
  const [isConfiguringSettings, setIsConfiguringSettings] = useState(false);
  const [selectedSettings, setSelectedSettings] = useState<BranchSettings | null>(null);

  const fetchBranches = async () => {
    setIsLoading(true);
    try {
      const data = await BranchService.getBranches();
      setBranches(data);
    } catch (e) {
      addToast("خطأ أثناء جلب الفروع", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBranch?.name || !currentBranch?.code) {
      addToast("يرجى إدخال اسم ورمز الفرع", "warning");
      return;
    }
    try {
      await BranchService.saveBranch(currentBranch);
      addToast("تم حفظ الفرع بنجاح", "success");
      setIsEditing(false);
      setCurrentBranch(null);
      fetchBranches();
    } catch {
      addToast("فشل حفظ الفرع", "error");
    }
  };

  const handleConfigureSettings = async (branchId: string) => {
    try {
      const settings = await BranchService.getBranchSettings(branchId);
      setSelectedSettings(settings);
      setIsConfiguringSettings(true);
    } catch {
      addToast("خطأ أثناء جلب إعدادات الفرع", "error");
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSettings) return;
    try {
      await BranchService.saveBranchSettings(selectedSettings);
      addToast("تم تحديث خيارات التنبيهات وإعادة الطلب بنجاح", "success");
      setIsConfiguringSettings(false);
      setSelectedSettings(null);
    } catch {
      addToast("فشل تحديث إعدادات الفرع", "error");
    }
  };

  const filteredBranches = branches.filter(b => 
    b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.location || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-5 w-full pb-10" dir="rtl">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-br from-[#0c312d] via-[#0f3834] to-[#08221f] rounded-[28px] p-5 sm:p-6 text-white shadow-xl relative overflow-hidden w-full">
        {/* Background ambient lighting */}
        <div className="absolute left-0 top-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-0 bottom-0 w-48 h-48 bg-teal-500/5 rounded-full blur-2xl pointer-events-none" />

        {/* Header Top Section: Title, Subtitle, Icon */}
        <div className="flex justify-between items-start gap-3 sm:gap-4 mb-6 relative z-10">
          <div className="flex items-start gap-3 flex-1">
            {onNavigate && (
              <BackButton 
                onClick={() => onNavigate('dashboard')} 
                variant="emerald" 
              />
            )}
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                إدارة فروع المؤسسة
              </h1>
              <p className="text-xs md:text-sm text-emerald-200/90 font-medium mt-1.5 leading-relaxed">
                إدارة شاملة للمخازن والتحويلات البينية مع عزل كامل للصلاحيات
              </p>
            </div>
          </div>
          <div className="w-12 h-12 md:w-14 md:h-14 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center text-emerald-300 shrink-0 shadow-inner">
            <Building2 size={26} />
          </div>
        </div>

        {/* Action Controls Row */}
        <div className="flex items-center gap-3 relative z-10">
          <button
            onClick={() => {
              setCurrentBranch({
                code: '',
                name: '',
                location: '',
                phone: '',
                isActive: true
              });
              setIsEditing(true);
            }}
            className="flex-1 md:flex-initial bg-[#00c88c] hover:bg-[#00b07b] text-white font-bold text-xs md:text-sm px-6 py-3.5 rounded-2xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <Plus size={18} />
            <span>إضافة فرع جديد</span>
          </button>

          <button
            onClick={fetchBranches}
            title="تحديث البيانات"
            className="w-12 h-12 bg-emerald-900/40 hover:bg-emerald-900/60 border border-emerald-700/50 rounded-2xl flex items-center justify-center text-white transition-all cursor-pointer shrink-0 active:scale-95"
          >
            <RotateCw size={18} />
          </button>
        </div>
      </div>

      {/* 2. Search & Counter Section */}
      <div className="space-y-3">
        <div className="relative w-full">
          <input
            type="text"
            placeholder="ابحث بالاسم، الرمز، أو العنوان..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-4 pr-11 py-3.5 text-sm bg-white border border-slate-200/90 rounded-2xl focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 text-slate-800 placeholder:text-slate-400 shadow-sm transition-all"
          />
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        </div>

        <div className="text-center text-xs text-slate-500 font-medium">
          الفروع النشطة: <span className="font-bold text-slate-800">{branches.filter(b => b.isActive).length}</span> من أصل <span className="font-bold text-slate-800">{branches.length}</span>
        </div>
      </div>

      {/* 3. Cards List */}
      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredBranches.length === 0 ? (
        <div className="bg-white rounded-[24px] p-12 text-center border border-slate-100 shadow-sm">
          <Building2 className="mx-auto text-slate-300 mb-3" size={40} />
          <p className="text-slate-500 font-bold text-sm">لا توجد فروع لمطابقة البحث</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBranches.map((branch) => (
            <motion.div
              layout
              key={branch.id}
              className="bg-white rounded-[24px] p-5 md:p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
            >
              {/* Green vertical bar on left edge */}
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500 rounded-l-2xl" />

              {/* Card Top Row: Green Dot & Code Badge */}
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${branch.isActive ? 'bg-emerald-500 ring-4 ring-emerald-500/10' : 'bg-slate-300'}`} />
                </div>

                <span className="text-xs font-bold bg-[#eefaf6] text-emerald-800 px-3.5 py-1 rounded-full uppercase tracking-wider">
                  {branch.code}
                </span>
              </div>

              {/* Branch Name */}
              <h3 className="text-base md:text-lg font-black text-slate-800 mb-3 pr-1">
                {branch.name}
              </h3>

              {/* Branch Details */}
              <div className="space-y-2 text-xs font-bold text-slate-500 mb-5 pr-1">
                <div className="flex items-center gap-2.5">
                  <MapPin size={15} className="text-slate-400 shrink-0" />
                  <span>{branch.location || "بدون عنوان محدد"}</span>
                </div>
                {branch.phone && (
                  <div className="flex items-center gap-2.5">
                    <Phone size={15} className="text-slate-400 shrink-0" />
                    <span dir="ltr" className="text-right">{branch.phone}</span>
                  </div>
                )}
              </div>

              {/* Card Bottom Actions */}
              <div className="flex items-center gap-2.5 pt-2">
                <button
                  onClick={() => {
                    setCurrentBranch(branch);
                    setIsEditing(true);
                  }}
                  className="w-11 h-11 bg-slate-100/80 hover:bg-slate-200 text-slate-600 rounded-2xl flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95"
                  title="تعديل الفرع"
                >
                  <Edit2 size={16} />
                </button>

                <button
                  onClick={() => handleConfigureSettings(branch.id)}
                  className="flex-1 bg-slate-100/80 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
                >
                  <SlidersHorizontal size={16} />
                  <span>خيارات التنبؤ</span>
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Edit / Create Branch Modal */}
      <AnimatePresence>
        {isEditing && currentBranch && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setIsEditing(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-[28px] p-7 max-w-md w-full relative z-10 shadow-2xl border border-slate-50"
            >
              <h2 className="text-lg font-black text-[#0c312d] mb-5">
                {currentBranch.id ? 'تعديل بيانات الفرع' : 'إضافة فرع جديد'}
              </h2>

              <form onSubmit={handleSaveBranch} className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-slate-600 mb-1.5">رمز الفرع الفريد</label>
                  <input
                    type="text"
                    required
                    disabled={!!currentBranch.id}
                    placeholder="مثال: BRH-NORTH"
                    value={currentBranch.code}
                    onChange={(e) => setCurrentBranch({...currentBranch, code: e.target.value.toUpperCase()})}
                    className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0c312d] text-slate-800 disabled:opacity-50 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-600 mb-1.5">اسم الفرع</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: فرع الرياض - المروج"
                    value={currentBranch.name}
                    onChange={(e) => setCurrentBranch({...currentBranch, name: e.target.value})}
                    className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0c312d] text-slate-800 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-600 mb-1.5">جهة الرياض / العنوان</label>
                  <input
                    type="text"
                    placeholder="العنوان الكامل للفرع"
                    value={currentBranch.location}
                    onChange={(e) => setCurrentBranch({...currentBranch, location: e.target.value})}
                    className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0c312d] text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-600 mb-1.5">رقم الهاتف</label>
                  <input
                    type="text"
                    placeholder="مثال: +966 11 405 1234"
                    value={currentBranch.phone}
                    onChange={(e) => setCurrentBranch({...currentBranch, phone: e.target.value})}
                    className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0c312d] text-slate-800"
                  />
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="checkbox"
                    id="branch-active"
                    checked={currentBranch.isActive}
                    onChange={(e) => setCurrentBranch({...currentBranch, isActive: e.target.checked})}
                    className="w-4 h-4 text-[#00c88c] focus:ring-[#00c88c] border-slate-300 rounded"
                  />
                  <label htmlFor="branch-active" className="text-xs font-bold text-slate-700 cursor-pointer">الفرع نشط ويستقبل حركات المخزون والبيع</label>
                </div>

                <div className="flex gap-2.5 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-[#0c312d] hover:bg-[#07211e] text-white font-bold text-xs py-3.5 rounded-2xl transition-all shadow-md cursor-pointer"
                  >
                    حفظ التغييرات
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-5 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-2xl transition-all cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Configure Settings Modal */}
      <AnimatePresence>
        {isConfiguringSettings && selectedSettings && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setIsConfiguringSettings(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-[28px] p-7 max-w-md w-full relative z-10 shadow-2xl border border-slate-50"
            >
              <h2 className="text-lg font-black text-[#0c312d] mb-5 flex items-center gap-2">
                <SlidersHorizontal size={20} className="text-emerald-600" />
                <span>خيارات التنبؤ والطلب التلقائي للفرع</span>
              </h2>

              <form onSubmit={handleSaveSettings} className="space-y-5">
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="stock-alert"
                      checked={selectedSettings.minStockLevelAlert}
                      onChange={(e) => setSelectedSettings({...selectedSettings, minStockLevelAlert: e.target.checked})}
                      className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-slate-300 rounded mt-0.5"
                    />
                    <div>
                      <label htmlFor="stock-alert" className="text-xs font-black text-slate-700 cursor-pointer">تفعيل منبهات انخفاض مستوى المخزون</label>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">يقوم النظام بتنبيه أمين مستودع الفرع عندما يقل صنف عن نقطة إعادة الطلب المحددة له محلياً.</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-600 mb-1.5">أيام التغطية المستهدفة لإعادة الطلب التلقائي</label>
                  <input
                    type="number"
                    min={5}
                    max={120}
                    required
                    value={selectedSettings.autoReorderTargetDays}
                    onChange={(e) => setSelectedSettings({...selectedSettings, autoReorderTargetDays: parseInt(e.target.value, 10)})}
                    className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0c312d] text-slate-800 font-bold"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">أيام التغطية النموذجية التي يعتمد عليها خوارزمي التنبؤ بالطلب التلقائي لتغطية مبيعات الفرع.</p>
                </div>

                <div className="flex gap-2.5 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-[#0c312d] hover:bg-[#07211e] text-white font-bold text-xs py-3.5 rounded-2xl transition-all shadow-md cursor-pointer"
                  >
                    تطبيق الإعدادات
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfiguringSettings(false)}
                    className="px-5 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-2xl transition-all cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

