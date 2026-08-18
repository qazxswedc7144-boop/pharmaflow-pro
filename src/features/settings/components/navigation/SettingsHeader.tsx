import React from 'react';
import { Settings, Search, Save, X, ArrowRight, Home } from 'lucide-react';

interface SettingsHeaderProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  onSave: () => void;
  isSaving: boolean;
  onBackToDashboard?: () => void;
  onBackToCardList?: () => void;
  isMobileDrillDown?: boolean;
  activeSectionTitle?: string;
  activeSectionDescription?: string;
}

export const SettingsHeader: React.FC<SettingsHeaderProps> = ({
  searchQuery,
  onSearchChange,
  onSave,
  isSaving,
  onBackToDashboard,
  onBackToCardList,
  isMobileDrillDown = false,
  activeSectionTitle,
  activeSectionDescription
}) => {
  return (
    <header className="bg-white dark:bg-slate-850 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl shadow-xs p-3 sm:p-4 box-border w-full shrink-0 transition-all">
      {/* Primary Navigation & Action Bar */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 w-full">
        {/* Right Section (RTL Start): Navigation + Icon + Section Title */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 shrink-0 sm:shrink">
          {/* Back Button (Drilldown back OR Dashboard back) with >= 48px touch target */}
          {isMobileDrillDown ? (
            <button
              onClick={onBackToCardList}
              className="min-h-[48px] min-w-[48px] px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer border border-slate-200/60 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1E4D4D]/20"
              aria-label="العودة لقائمة أقسام الإعدادات الرئيسية"
              title="العودة لقائمة الإعدادات"
            >
              <ArrowRight size={20} className="text-[#1E4D4D] dark:text-emerald-400" />
            </button>
          ) : (
            onBackToDashboard && (
              <button
                onClick={onBackToDashboard}
                className="min-h-[48px] min-w-[48px] px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer border border-slate-200/60 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1E4D4D]/20"
                aria-label="العودة للوحة التحكم الرئيسية"
                title="الرئيسية"
              >
                <Home size={19} className="text-slate-600 dark:text-slate-300" />
              </button>
            )
          )}

          {/* Settings Gear Icon ⚙️ */}
          <div className="w-10 h-10 sm:w-11 sm:h-11 bg-[#1E4D4D]/10 dark:bg-emerald-950/40 rounded-xl flex items-center justify-center text-[#1E4D4D] dark:text-emerald-400 shrink-0 border border-[#1E4D4D]/20 dark:border-emerald-800/40">
            <Settings size={22} className="transition-transform duration-700 hover:rotate-90" />
          </div>

          {/* Section Name & Description */}
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base md:text-lg font-black text-slate-850 dark:text-slate-100 font-cairo leading-tight truncate">
              {isMobileDrillDown && activeSectionTitle ? activeSectionTitle : 'مركز إعدادات النظام'}
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-cairo hidden sm:block truncate mt-0.5">
              {isMobileDrillDown
                ? (activeSectionDescription || 'تعديل وتخصيص خيارات وضوابط هذا القسم')
                : 'الإعدادات التنفيذية والسيادية الحاكمة لمنظومة PharmaFlow Pro'}
            </p>
          </div>
        </div>

        {/* Middle Section: Centered Responsive Search Bar */}
        <div className="hidden md:flex flex-1 max-w-xs lg:max-w-md mx-2 lg:mx-4 items-center justify-center">
          <div className="relative w-full">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
            <input
              type="text"
              placeholder="ابحث في كافة أقسام وإعدادات النظام..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-10 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-[#1E4D4D]/20 focus:border-[#1E4D4D] dark:text-white transition-all font-cairo placeholder:text-slate-400 font-medium"
              aria-label="البحث في إعدادات النظام"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-full hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                aria-label="مسح البحث"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Left Section (RTL End): Save Action Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onSave}
            disabled={isSaving}
            className={`min-h-[48px] px-3.5 sm:px-5 py-2.5 rounded-xl text-white font-bold font-cairo text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer active:scale-95 border border-emerald-600/30
              ${
                isSaving
                  ? 'bg-emerald-800 cursor-not-allowed opacity-90'
                  : 'bg-[#1E4D4D] hover:bg-[#153737] hover:shadow-md'
              }
            `}
            aria-label="حفظ وتطبيق جميع التغييرات"
          >
            <Save size={17} className={isSaving ? 'animate-spin' : 'shrink-0'} />
            <span className="whitespace-nowrap">{isSaving ? 'جاري الحفظ...' : 'حفظ التغييرات'}</span>
          </button>
        </div>
      </div>

      {/* Mobile Search Bar (< md screens) */}
      <div className="mt-3 md:hidden w-full">
        <div className="relative w-full">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
          <input
            type="text"
            placeholder="ابحث في الإعدادات، العملات، المستخدمين، الأمان..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-10 py-2.5 min-h-[44px] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-[#1E4D4D]/20 focus:border-[#1E4D4D] dark:text-white transition-all font-cairo placeholder:text-slate-400"
            aria-label="البحث في إعدادات النظام للموبايل"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800"
              aria-label="مسح البحث"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

