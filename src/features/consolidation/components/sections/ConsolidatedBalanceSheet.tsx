cat << 'EOF' > src/features/consolidation/components/sections/ConsolidatedBalanceSheet.tsx
import React, { useEffect, useState } from 'react';
import { financialApiClient } from '@/shared/network/idempotency';
import { ConsolidatedBalanceSheet as BalanceSheetType } from '../../consolidation.types';
import { CheckCircle, AlertTriangle, Layers, ArrowRight, FileSpreadsheet, RefreshCw } from 'lucide-react';

export const ConsolidatedBalanceSheet: React.FC = () => {
  const [data, setData] = useState<BalanceSheetType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingText, setLoadingText] = useState('جاري تشغيل محرك الاندماج ومعالجة الموازين الفيدرالية...');

  useEffect(() => {
    let isMounted = true;
    
    // محاكاة تحسين واجهة التحميل أثناء الاتصال بالشبكة
    const timer = setTimeout(() => {
      if (isMounted) setLoadingText('تجميع أرصدة الفروع وإلغاء الحسابات المتبادلة بين الفروع...');
    }, 1000);

    financialApiClient
      .get('/api/consolidation/balance-sheet')
      .then((res) => {
        if (res.data && isMounted) setData(res.data);
      })
      .catch((err) => console.warn('Failed to load balance sheet:', err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  // 1. شاشة التحميل المطابقة
  if (loading) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center p-6 text-center" dir="rtl">
        <div className="w-16 h-16 border-4 border-[#064e46]/20 border-t-[#064e46] rounded-full animate-spin mb-6" />
        <p className="text-slate-600 font-bold text-sm sm:text-base animate-pulse max-w-xs leading-relaxed">
          {loadingText}
        </p>
      </div>
    );
  }

  // 2. حالة عدم توفر بيانات
  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4" dir="rtl">
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle size={24} />
          </div>
          <h3 className="font-black text-slate-800 text-base">لا توجد بيانات متاحة</h3>
          <p className="text-xs text-slate-500 font-bold">لم يتم استرجاع أي بيانات ميزانية عمومية موحدة من الخادم.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full h-10 bg-[#064e46] text-white rounded-xl font-black text-xs flex items-center justify-center gap-2"
          >
            <RefreshCw size={14} />
            <span>إعادة المحاولة</span>
          </button>
        </div>
      </div>
    );
  }

  // 3. عرض الميزانية الموحدة مع البيانات الحقيقية من API
  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 px-2 py-3 sm:px-4 font-sans text-slate-800">
      <div className="max-w-5xl mx-auto space-y-4">
        
        {/* الهيدر الرئيسي */}
        <div className="bg-[#064e46] text-white rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white border border-white/10"
            >
              <ArrowRight size={20} />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-black flex items-center gap-2">
                <Layers className="text-emerald-300" size={20} />
                المركز المالي الموحد (الاندماج)
              </h1>
              <p className="text-[11px] text-emerald-100/80 font-medium">
                آخر تحديث: {new Date(data.timestamp).toLocaleString('ar-SA')}
              </p>
            </div>
          </div>
          <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1 border ${
            data.isBalanced 
              ? 'bg-emerald-400/20 text-emerald-300 border-emerald-400/30' 
              : 'bg-rose-400/20 text-rose-300 border-rose-400/30'
          }`}>
            {data.isBalanced ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
            {data.isBalanced ? 'الميزانية متوازنة تماماً' : 'غير متوازنة'}
          </span>
        </div>

        {/* كروت الأصول والالتزامات وحقوق الملكية */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* الأصول */}
          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h4 className="text-xs font-black text-[#064e46] border-b border-slate-100 pb-2 flex justify-between items-center">
              <span>الأصول الموحدة (Assets)</span>
              <FileSpreadsheet size={16} />
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">النقدية وما يعادلها:</span>
                <span className="font-mono font-bold text-slate-800">${data.assets.cashAndCashEquivalents.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ذمم مدينة / عملاء:</span>
                <span className="font-mono font-bold text-slate-800">${data.assets.accountsReceivable.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">مخزون الأدوية والبضائع:</span>
                <span className="font-mono font-bold text-slate-800">${data.assets.inventoryValue.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2 font-black text-[#064e46] bg-emerald-50/50 p-2 rounded-xl">
                <span>إجمالي الأصول:</span>
                <span className="font-mono text-sm">${data.assets.totalAssets.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* الالتزامات */}
          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h4 className="text-xs font-black text-rose-700 border-b border-slate-100 pb-2 flex justify-between items-center">
              <span>الالتزامات الموحدة (Liabilities)</span>
              <FileSpreadsheet size={16} />
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">ذمم دائنة / موردين:</span>
                <span className="font-mono font-bold text-slate-800">${data.liabilities.accountsPayable.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">التزامات متداولة أخرى:</span>
                <span className="font-mono font-bold text-slate-800">${data.liabilities.otherCurrentLiabilities.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2 font-black text-rose-700 bg-rose-50/50 p-2 rounded-xl">
                <span>إجمالي الالتزامات:</span>
                <span className="font-mono text-sm">${data.liabilities.totalLiabilities.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* حقوق الملكية */}
          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h4 className="text-xs font-black text-emerald-700 border-b border-slate-100 pb-2 flex justify-between items-center">
              <span>حقوق الملكية (Equity)</span>
              <FileSpreadsheet size={16} />
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">رأس المال المشترك:</span>
                <span className="font-mono font-bold text-slate-800">${data.equity.shareCapital.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الأرباح المبقاة المجمعة:</span>
                <span className="font-mono font-bold text-slate-800">${data.equity.retainedEarnings.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2 font-black text-emerald-700 bg-emerald-50/50 p-2 rounded-xl">
                <span>إجمالي حقوق الملكية:</span>
                <span className="font-mono text-sm">${data.equity.totalEquity.toLocaleString()}</span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default ConsolidatedBalanceSheet;
EOF
                                                                                                                       
