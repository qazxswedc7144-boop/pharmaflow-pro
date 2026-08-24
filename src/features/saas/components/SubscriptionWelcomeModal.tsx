// src/features/saas/components/SubscriptionWelcomeModal.tsx
import React from 'react';
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
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[1000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto" 
        dir="rtl"
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
          className="relative w-full max-w-xl bg-white dark:bg-gray-900 rounded-[28px] border border-emerald-100 dark:border-emerald-950/60 shadow-2xl shadow-emerald-950/20 overflow-hidden text-right p-6 sm:p-8"
        >
          {/* خلفيات هيدر الطابع الزمردي الأنيق (Emerald Theme Accents) */}
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-emerald-500/10 dark:bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-48 h-48 bg-emerald-600/10 dark:bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

          {/* 2. زر الإغلاق: في أقصى أعلى اليسار بشكل مستقل ونظيف تماماً */}
          <button 
            id="btn-close-subscription-welcome"
            type="button"
            onClick={onClose} 
            aria-label="إغلاق النافذة"
            className="absolute top-4 left-4 w-9 h-9 flex items-center justify-center bg-slate-100/90 hover:bg-rose-50 hover:text-rose-600 dark:bg-gray-800 dark:hover:bg-rose-950/40 text-slate-500 dark:text-gray-400 rounded-full transition-all duration-200 shadow-2xs hover:scale-105 active:scale-95 z-20 cursor-pointer"
          >
            <X size={18} />
          </button>

          {/* رأس النافذة والهوية الزمردية */}
          <div className="flex items-start gap-4 mb-6">
            <div className="relative flex-shrink-0">
              <div className="w-14 h-14 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-600/30">
                <Sparkles className="w-7 h-7 animate-pulse" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-100 dark:bg-emerald-900 border-2 border-white dark:border-gray-900 rounded-full flex items-center justify-center">
                <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>

            <div className="pr-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/60 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold mb-1.5">
                <Zap className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>النسخة السحابية المعتمدة | ترحيب الصيدلية</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                مرحباً بك في PharmaFlow Pro
              </h2>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                تم تهيئة منصة الإدارة السحابية الموحدة لصيدليتك مع تجربة مجانية تامة الصلاحيات
              </p>
            </div>
          </div>

          {/* المميزات ومؤشرات الخطة */}
          <div className="space-y-4 mb-6">
            <div className="bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl p-3.5 border border-emerald-100/80 dark:border-emerald-900/40">
              <p className="text-slate-700 dark:text-emerald-100 text-xs sm:text-sm font-medium leading-relaxed">
                تمنحك هذه النسخة الترحيبية استكشاف كافة إمكانيات النظام من مبيعات ذكية، استيراد فواتير المشتريات بالذكاء الاصطناعي، ومراقبة المخزون الدوائي المتقدم بدون أي قيود:
              </p>
            </div>

            {/* بطاقات المؤشرات الزمردية */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-50/80 dark:bg-gray-800/60 p-3 rounded-2xl border border-slate-100 dark:border-gray-700/60 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-1">
                  <Activity className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">العمليات المجانية</span>
                </div>
                <span className="text-base font-black text-slate-900 dark:text-white">200 عملية</span>
              </div>

              <div className="bg-slate-50/80 dark:bg-gray-800/60 p-3 rounded-2xl border border-slate-100 dark:border-gray-700/60 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-1">
                  <Building2 className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">الفروع النشطة</span>
                </div>
                <span className="text-base font-black text-slate-900 dark:text-white">1 فرع رئيسي</span>
              </div>

              <div className="bg-slate-50/80 dark:bg-gray-800/60 p-3 rounded-2xl border border-slate-100 dark:border-gray-700/60 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-1">
                  <Users className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">المستخدمين</span>
                </div>
                <span className="text-base font-black text-slate-900 dark:text-white">مستخدم كامل</span>
              </div>

              <div className="bg-slate-50/80 dark:bg-gray-800/60 p-3 rounded-2xl border border-slate-100 dark:border-gray-700/60 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">الدعم الفني</span>
                </div>
                <span className="text-base font-black text-emerald-600 dark:text-emerald-400">مباشر وموحد</span>
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
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// Export alias for seamless backward compatibility
export const SubscriptionOnboardingModal = SubscriptionWelcomeModal;
