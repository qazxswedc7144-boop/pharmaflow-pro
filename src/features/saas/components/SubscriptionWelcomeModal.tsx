// src/features/saas/components/SubscriptionWelcomeModal.tsx
import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowLeft, 
  Building2, 
  Users, 
  Activity, 
  Zap
} from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { SubscriptionContactFooter, UNIFIED_SUPPORT_NUMBER } from './SubscriptionContactFooter';

export interface SubscriptionWelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTrial?: () => void;
  supportNumber?: string;
  systemVersion?: string;
}

export const SubscriptionWelcomeModal: React.FC<SubscriptionWelcomeModalProps> = ({
  isOpen,
  onClose,
  onStartTrial,
  supportNumber = UNIFIED_SUPPORT_NUMBER,
  systemVersion = "2.5.0"
}) => {
  const setSubscriptionOnboardingOpen = useUIStore((state) => state.setSubscriptionOnboardingOpen);

  useEffect(() => {
    if (isOpen) {
      setSubscriptionOnboardingOpen(true);
    }
    return () => {
      setSubscriptionOnboardingOpen(false);
    };
  }, [isOpen, setSubscriptionOnboardingOpen]);

  if (!isOpen) return null;

  const handleStart = () => {
    if (onStartTrial) {
      onStartTrial();
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <div 
        id="subscription-welcome-modal-overlay"
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[2500] flex items-center justify-center p-2.5 sm:p-6 overflow-hidden overscroll-none" 
        dir="rtl"
        style={{
          minHeight: '100dvh',
          height: '100dvh',
          paddingTop: 'max(0.625rem, env(safe-area-inset-top))',
          paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))',
          paddingLeft: 'max(0.625rem, env(safe-area-inset-left))',
          paddingRight: 'max(0.625rem, env(safe-area-inset-right))'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div 
          id="subscription-welcome-modal-container"
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
          className="relative w-full max-w-xl bg-white dark:bg-gray-900 rounded-[24px] sm:rounded-[28px] border border-emerald-100 dark:border-emerald-950/60 shadow-2xl shadow-emerald-950/20 text-right flex flex-col overflow-hidden"
          style={{
            maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1.25rem)'
          }}
        >
          {/* خلفيات هيدر الطابع الزمردي الأنيق (Emerald Theme Accents) */}
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-emerald-500/10 dark:bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-48 h-48 bg-emerald-600/10 dark:bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

          {/* رأس النافذة والهوية الزمردية - Fixed/Pinned at Top */}
          <div className="shrink-0 p-5 sm:p-7 pb-3 sm:pb-4 border-b border-slate-100 dark:border-slate-800/80 relative z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xs">
            {/* زر الإغلاق: في أقصى أعلى اليسار بشكل مستقل وواضح دائماً */}
            <button 
              id="btn-close-subscription-welcome"
              type="button"
              onClick={onClose} 
              aria-label="إغلاق النافذة"
              className="absolute top-4 left-4 w-9 h-9 flex items-center justify-center bg-slate-100/90 hover:bg-rose-50 hover:text-rose-600 dark:bg-gray-800 dark:hover:bg-rose-950/40 text-slate-500 dark:text-gray-400 rounded-full transition-all duration-200 shadow-2xs hover:scale-105 active:scale-95 z-20 cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-start gap-3.5 sm:gap-4 pl-8">
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-600/30">
                  <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 animate-pulse" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-100 dark:bg-emerald-900 border-2 border-white dark:border-gray-900 rounded-full flex items-center justify-center">
                  <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>

              <div className="pr-1 min-w-0 flex-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/60 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-[10px] sm:text-[11px] font-bold mb-1">
                  <Zap className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="truncate">النسخة السحابية المعتمدة | ترحيب الصيدلية</span>
                </div>
                <h2 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  مرحباً بك في PharmaFlow Pro
                </h2>
                <p className="text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  تم تهيئة منصة الإدارة السحابية الموحدة لصيدليتك مع تجربة مجانية تامة الصلاحيات
                </p>
              </div>
            </div>
          </div>

          {/* الحاوية الداخلية القابلة للتمرير بسلاسة على كافة الشاشات */}
          <div 
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-7 pt-3 sm:pt-4 space-y-4 custom-scrollbar"
            style={{
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain'
            }}
          >
            {/* المميزات ومؤشرات الخطة */}
            <div className="bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl p-3 sm:p-3.5 border border-emerald-100/80 dark:border-emerald-900/40">
              <p className="text-slate-700 dark:text-emerald-100 text-xs sm:text-sm font-medium leading-relaxed">
                تمنحك هذه النسخة الترحيبية استكشاف كافة إمكانيات النظام من مبيعات ذكية، استيراد فواتير المشتريات بالذكاء الاصطناعي، ومراقبة المخزون الدوائي المتقدم بدون أي قيود:
              </p>
            </div>

            {/* بطاقات المؤشرات الزمردية */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
              <div className="bg-slate-50/80 dark:bg-gray-800/60 p-2.5 sm:p-3 rounded-2xl border border-slate-100 dark:border-gray-700/60 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-1">
                  <Activity className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">العمليات المجانية</span>
                </div>
                <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">200 عملية</span>
              </div>

              <div className="bg-slate-50/80 dark:bg-gray-800/60 p-2.5 sm:p-3 rounded-2xl border border-slate-100 dark:border-gray-700/60 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-1">
                  <Building2 className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">الفروع النشطة</span>
                </div>
                <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">1 فرع رئيسي</span>
              </div>

              <div className="bg-slate-50/80 dark:bg-gray-800/60 p-2.5 sm:p-3 rounded-2xl border border-slate-100 dark:border-gray-700/60 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-1">
                  <Users className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">المستخدمين</span>
                </div>
                <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">مستخدم كامل</span>
              </div>

              <div className="bg-slate-50/80 dark:bg-gray-800/60 p-2.5 sm:p-3 rounded-2xl border border-slate-100 dark:border-gray-700/60 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">الدعم الفني</span>
                </div>
                <span className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400">مباشر وموحد</span>
              </div>
            </div>

            {/* قائمة التحقق السريعة */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-bold text-slate-600 dark:text-gray-300 pt-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>مزامنة سحابية لحظية ومقاومة لانقطاع النت</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>استيراد ذكي بالـ OCR وتحليل الأمان الدوائي</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>إدارة نقاط البيع والكاشير والباركود المزدوج</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>تقارير مالية وجردية دقيقة وقابلة للتصدير</span>
              </div>
            </div>

            {/* زر البدء الأساسي بالطابع الزمردي الرائد */}
            <button
              id="btn-start-subscription-trial"
              type="button"
              onClick={handleStart}
              className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white py-3.5 px-6 rounded-2xl font-black text-sm transition-all duration-200 shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/40 flex items-center justify-center gap-2 cursor-pointer group"
            >
              <span>ابدأ التجربة المجانية الآن</span>
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            </button>

            {/* 3. قنوات التواصل الموحدة عبر الفوتر المحدث برقم 772093714 */}
            <SubscriptionContactFooter supportNumber={supportNumber} systemVersion={systemVersion} />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// Export alias for seamless backward compatibility
export const SubscriptionOnboardingModal = SubscriptionWelcomeModal;
