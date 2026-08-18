import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  BarChart3, Calendar, Download, Printer, ArrowRight,
  TrendingUp, Wallet, Package, ArrowDownRight, 
  Users, UserCheck, ShieldAlert, Receipt, Search, RefreshCw,
  FileSpreadsheet, FileText, ChevronDown, Layers,
  Clock, ShieldCheck, Filter,
  Activity, AlertCircle
} from "lucide-react";
import { useUI } from "@/contexts/AppContext";
import { ReportEngine, TrialBalanceRow } from "@/services/reports/reportEngine";
import { ExportService } from "@/services/data/exportService";
import { auditLogService } from "@/services/audit/auditLog";
import { db } from "@/core/db";

interface FinancialEngineReportProps {
  onNavigate: (view: string) => void;
}

export type ReportCategory = 'financial' | 'inventory' | 'partners' | 'tax' | 'audit';

export type TabType = 
  | 'trial-balance'
  | 'profit-loss'
  | 'balance-sheet'
  | 'cash-flow'
  | 'account-movement'
  | 'inventory-valuation'
  | 'remaining-stock'
  | 'expiry-items'
  | 'item-sales-movement'
  | 'customer-balances'
  | 'supplier-balances'
  | 'aging-reports-customer'
  | 'aging-reports-supplier'
  | 'tax-reports'
  | 'audit-trail';

interface ReportTabConfig {
  id: TabType;
  category: ReportCategory;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  desc: string;
}

const REPORT_TABS: ReportTabConfig[] = [
  // 1. Financial & Accounting
  { id: 'trial-balance', category: 'financial', label: 'ميزان المراجعة الشامل', shortLabel: 'ميزان المراجعة', icon: <BarChart3 size={18} />, desc: 'رصد توازن الحركات المدينة والدائنة لكافة حسابات الأستاذ العام.' },
  { id: 'profit-loss', category: 'financial', label: 'قائمة الأرباح والخسائر (P&L)', shortLabel: 'الأرباح والخسائر', icon: <TrendingUp size={18} />, desc: 'قائمة الدخل - الإيرادات، كلفة المبيعات والمصاريف التشغيلية وصافي الدخل.' },
  { id: 'balance-sheet', category: 'financial', label: 'الميزانية العمومية والمركز المالي', shortLabel: 'الميزانية العمومية', icon: <Wallet size={18} />, desc: 'تحليل الأصول، الالتزامات وحقوق الملكية للحسابات القائمة.' },
  { id: 'cash-flow', category: 'financial', label: 'قائمة التدفقات النقدية', shortLabel: 'التدفقات النقدية', icon: <ArrowDownRight size={18} />, desc: 'بيان حركة دخول وخروج النقد التشغيلي والاستثماري مباشرة.' },
  { id: 'account-movement', category: 'financial', label: 'حركة الحسابات ودفتر الأستاذ', shortLabel: 'حركة الحسابات', icon: <Activity size={18} />, desc: 'كشف تفصيلي بقيود اليومية وحركات الحسابات الفردية للفترة.' },

  // 2. Inventory & Valuation
  { id: 'inventory-valuation', category: 'inventory', label: 'تقييم المخزون والتكلفة', shortLabel: 'تقييم المخزون', icon: <Package size={18} />, desc: 'رصد تكلفة مخزون المنتجات متضمنة الهوامش والأرباح غير المحققة.' },
  { id: 'remaining-stock', category: 'inventory', label: 'المخزون المتبقي والنواقص', shortLabel: 'المخزون المتبقي', icon: <Layers size={18} />, desc: 'الكميات المتاحة حالياً مع تنبيهات نقص المخزون والحد الأدنى.' },
  { id: 'expiry-items', category: 'inventory', label: 'تواريخ الصلاحية والركود', shortLabel: 'تقرير الصلاحية', icon: <Clock size={18} />, desc: 'تتبع الأصناف القريبة من انتهاء الصلاحية أو المنتهية لتفادي الهالك.' },
  { id: 'item-sales-movement', category: 'inventory', label: 'حركة ومبيعات الأصناف', shortLabel: 'مبيعات الأصناف', icon: <TrendingUp size={18} />, desc: 'حجم مبيعات كل صنف مع هوامش الربحية وتكلفة التوريد.' },

  // 3. Partners & Debts
  { id: 'customer-balances', category: 'partners', label: 'أرصدة وذمم العملاء', shortLabel: 'أرصدة العملاء', icon: <Users size={18} />, desc: 'رصد المديونيات، مبيعات كل عميل والمبالغ المسددة ومستوى المخاطرة.' },
  { id: 'supplier-balances', category: 'partners', label: 'أرصدة وذمم الموردين', shortLabel: 'أرصدة الموردين', icon: <UserCheck size={18} />, desc: 'تتبع مشتريات ودفعات الموردين والأرصدة الدائنة المستحقة.' },
  { id: 'aging-reports-customer', category: 'partners', label: 'تعمير ذمم العملاء (30-60-90+)', shortLabel: 'تعمير ذمم العملاء', icon: <ShieldAlert size={18} />, desc: 'تقسيم ديون العملاء غير المسددة حسب الفترات الزمنية للتحصيل.' },
  { id: 'aging-reports-supplier', category: 'partners', label: 'تعمير ذمم الموردين (30-60-90+)', shortLabel: 'تعمير ذمم الموردين', icon: <ShieldAlert size={18} />, desc: 'توزيع التزامات الموردين المستحقة زمنياً لجدولة السداد.' },

  // 4. Tax & VAT
  { id: 'tax-reports', category: 'tax', label: 'إقرار ضريبة القيمة المضافة (VAT)', shortLabel: 'الإقرار الضريبي', icon: <Receipt size={18} />, desc: 'احتساب الضريبة المخرجة للمبيعات والمدخلة للمشتريات وفارق التسوية.' },

  // 5. Audit & Governance
  { id: 'audit-trail', category: 'audit', label: 'سجل العمليات والتدقيق الإداري', shortLabel: 'سجل التدقيق', icon: <ShieldCheck size={18} />, desc: 'تتبع العمليات الحساسة وإجراءات التعديل والحذف والتصدير في المنظومة.' }
];

const CATEGORIES: { id: ReportCategory; title: string; icon: React.ReactNode }[] = [
  { id: 'financial', title: 'التقارير المالية والمحاسبية', icon: <BarChart3 size={16} /> },
  { id: 'inventory', title: 'المخزون والعمليات التشغيلية', icon: <Package size={16} /> },
  { id: 'partners', title: 'الشركاء والعملاء والموردين', icon: <Users size={16} /> },
  { id: 'tax', title: 'التقارير الضريبية (VAT)', icon: <Receipt size={16} /> },
  { id: 'audit', title: 'التدقيق والرقابة الإدارية', icon: <ShieldCheck size={16} /> }
];

export default function FinancialEngineReport({ onNavigate }: FinancialEngineReportProps) {
  const { currency, addToast, version } = useUI();
  
  const formatNum = (val: any) => {
    if (val === undefined || val === null || isNaN(Number(val))) return "0";
    return Number(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const [activeCategory, setActiveCategory] = useState<ReportCategory>('financial');
  const [activeTab, setActiveTab] = useState<TabType>('trial-balance');
  
  // Date filter state with smart presets
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().substring(0, 10);
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().substring(0, 10));
  const [activePreset, setActivePreset] = useState<string>('month');

  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [reportData, setReportData] = useState<any>(null);
  const [exportDropdownOpen, setExportDropdownOpen] = useState<boolean>(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setExportDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Preset Date Handlers
  const handleDatePreset = (preset: 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all') => {
    setActivePreset(preset);
    const now = new Date();
    const endStr = now.toISOString().substring(0, 10);
    let startStr = endStr;

    if (preset === 'today') {
      startStr = endStr;
    } else if (preset === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      startStr = d.toISOString().substring(0, 10);
    } else if (preset === 'month') {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      startStr = d.toISOString().substring(0, 10);
    } else if (preset === 'quarter') {
      const d = new Date();
      d.setMonth(d.getMonth() - 3);
      startStr = d.toISOString().substring(0, 10);
    } else if (preset === 'year') {
      const d = new Date(now.getFullYear(), 0, 1);
      startStr = d.toISOString().substring(0, 10);
    } else if (preset === 'all') {
      startStr = '2020-01-01';
    }

    setStartDate(startStr);
    setEndDate(endStr);
  };

  // Main Report Data Fetching Engine
  const fetchReportData = async () => {
    setIsLoading(true);
    try {
      let data: any = null;
      switch (activeTab) {
        case 'trial-balance':
          data = await ReportEngine.getTrialBalance(startDate, endDate);
          break;
        case 'profit-loss':
          data = await ReportEngine.getProfitLoss(startDate, endDate);
          break;
        case 'balance-sheet':
          data = await ReportEngine.getBalanceSheet(endDate);
          break;
        case 'cash-flow':
          data = await ReportEngine.getCashFlow(startDate, endDate);
          break;
        case 'account-movement':
          data = await ReportEngine.getAccountMovement(startDate, endDate);
          break;
        case 'inventory-valuation':
          data = await ReportEngine.getInventoryValue();
          break;
        case 'remaining-stock': {
          const products = await db.getProducts();
          data = products.map((p: any) => ({
            id: p.id,
            name: p.name,
            code: p.barcode || 'N/A',
            category: p.categoryName || 'عام',
            stock: Number(p.stock ?? p.StockQuantity ?? 0),
            minStock: Number(p.MinStockLevel ?? p.minStock ?? 5),
            costPrice: Number(p.CostPrice ?? p.LastPurchasePrice ?? 0),
            salePrice: Number(p.price ?? 0),
            status: Number(p.stock ?? p.StockQuantity ?? 0) <= 0 ? 'نفد المخزون' : (Number(p.stock ?? p.StockQuantity ?? 0) <= Number(p.MinStockLevel ?? 5) ? 'منخفض' : 'متوفر')
          }));
          break;
        }
        case 'expiry-items': {
          const products = await db.getProducts();
          const today = new Date();
          data = products
            .filter((p: any) => p.expiryDate || p.ExpiryDate)
            .map((p: any) => {
              const exp = new Date(p.expiryDate || p.ExpiryDate);
              const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              return {
                id: p.id,
                name: p.name,
                barcode: p.barcode || 'N/A',
                expiryDate: (p.expiryDate || p.ExpiryDate || '').substring(0, 10),
                daysRemaining: diffDays,
                stock: Number(p.stock ?? p.StockQuantity ?? 0),
                cost: Number(p.CostPrice ?? p.LastPurchasePrice ?? 0),
                status: diffDays < 0 ? 'منتهي' : (diffDays <= 90 ? 'قريب الانتهاء' : 'صالح')
              };
            })
            .sort((a: any, b: any) => a.daysRemaining - b.daysRemaining);
          break;
        }
        case 'item-sales-movement': {
          const sales = await db.invoices.where('type').equals('SALE').toArray();
          const itemMap: Record<string, { name: string; qty: number; totalSales: number; profit: number }> = {};
          
          sales.forEach((s: any) => {
            const d = s.date || s.Date || '';
            if (startDate && d < startDate) return;
            if (endDate && d > endDate) return;

            (s.items || []).forEach((it: any) => {
              const key = it.productId || it.id || it.name;
              if (!itemMap[key]) {
                itemMap[key] = { name: it.name || 'صنف', qty: 0, totalSales: 0, profit: 0 };
              }
              const itemQty = Number(it.quantity || it.qty || 1);
              const lineTotal = Number(it.total || (it.price * itemQty) || 0);
              const lineCost = Number(it.costPrice || 0) * itemQty;
              itemMap[key].qty += itemQty;
              itemMap[key].totalSales += lineTotal;
              itemMap[key].profit += (lineTotal - lineCost);
            });
          });

          data = Object.entries(itemMap).map(([id, info]) => ({
            id,
            name: info.name,
            quantitySold: info.qty,
            totalSales: info.totalSales,
            estimatedProfit: info.profit,
            marginPct: info.totalSales > 0 ? (info.profit / info.totalSales) * 100 : 0
          })).sort((a, b) => b.totalSales - a.totalSales);
          break;
        }
        case 'customer-balances':
          data = await ReportEngine.getCustomerBalances();
          break;
        case 'supplier-balances':
          data = await ReportEngine.getSupplierBalances();
          break;
        case 'aging-reports-customer':
          data = await ReportEngine.getAgingReport('CUSTOMER');
          break;
        case 'aging-reports-supplier':
          data = await ReportEngine.getAgingReport('SUPPLIER');
          break;
        case 'tax-reports':
          data = await ReportEngine.getTaxReport(startDate, endDate);
          break;
        case 'audit-trail':
          data = await ReportEngine.getAuditSummary(startDate, endDate, 300);
          break;
      }
      
      setReportData(data);
      
      // Log report generation for governance
      auditLogService.log('REPORT_GENERATED', 'REPORT', activeTab, `Generated report for period ${startDate} to ${endDate}`);
    } catch (error) {
      console.error("Error executing report calculation:", error);
      addToast("خطأ أثناء تجميع واحتساب بيانات التقرير.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [activeTab, startDate, endDate, version]);

  const activeTabConfig: ReportTabConfig = useMemo(() => {
    const found = REPORT_TABS.find(t => t.id === activeTab);
    return (found || REPORT_TABS[0]) as ReportTabConfig;
  }, [activeTab]);

  // Synchronize category with active tab
  useEffect(() => {
    if (activeTabConfig.category !== activeCategory) {
      setActiveCategory(activeTabConfig.category);
    }
  }, [activeTab]);

  // Unified Export to Excel (Spreadsheet XML with formatting & CSV compatibility)
  const handleExportExcel = () => {
    if (!reportData) {
      addToast("لا توجد بيانات متاحة للتصدير حالياً", "error");
      return;
    }
    setExportDropdownOpen(false);

    try {
      const fileName = `Financial_${activeTab}_${startDate}_to_${endDate}`;
      
      if (activeTab === 'trial-balance') {
        const rows = (reportData as TrialBalanceRow[]).map(r => ({
          "رمز الحساب": r.code,
          "اسم الحساب": r.name,
          "النوع": r.type,
          "مدين منتهي": r.endingDebit,
          "دائن منتهي": r.endingCredit
        }));
        ExportService.exportToExcel(rows, fileName);
      } else if (activeTab === 'profit-loss') {
        const rows = [
          { "البند": "إجمالي الإيرادات (Revenue)", "المبلغ": reportData.revenue },
          { "البند": "تكلفة المبيعات (COGS)", "المبلغ": reportData.cogs },
          { "البند": "إجمالي الربح (Gross Profit)", "المبلغ": reportData.grossProfit },
          { "البند": "المصاريف التشغيلية (Expenses)", "المبلغ": reportData.expenses },
          { "البند": "صافي الربح الفعلي (Net Profit)", "المبلغ": reportData.netProfit },
          { "البند": "هامش الربح %", "المبلغ": `${reportData.margin?.toFixed(2)}%` }
        ];
        ExportService.exportToExcel(rows, fileName);
      } else if (activeTab === 'balance-sheet') {
        const rows = [
          ...reportData.assets.map((a: any) => ({ "القسم": "الأصول (Assets)", "رمز الحساب": a.code, "الاسم": a.name, "القيمة": a.amount })),
          ...reportData.liabilities.map((l: any) => ({ "القسم": "الالتزامات (Liabilities)", "رمز الحساب": l.code, "الاسم": l.name, "القيمة": l.amount })),
          ...reportData.equity.map((e: any) => ({ "القسم": "حقوق الملكية (Equity)", "رمز الحساب": e.code, "الاسم": e.name, "القيمة": e.amount }))
        ];
        ExportService.exportToExcel(rows, fileName);
      } else if (activeTab === 'inventory-valuation') {
        const rows = reportData.items.map((i: any) => ({
          "اسم المادة": i.name,
          "الباركود": i.code,
          "الفئة": i.category,
          "الكمية": i.quantity,
          "تكلفة الوحدة": i.unitCost,
          "سعر البيع": i.unitSell,
          "قيمة التكلفة": i.costValue,
          "القيمة السوقية": i.salesValue,
          "الربح المتوقع": i.profitPotential
        }));
        ExportService.exportToExcel(rows, fileName);
      } else if (activeTab === 'cash-flow') {
        const rows = reportData.flows.map((f: any) => ({
          "التاريخ": f.date,
          "الوصف": f.description,
          "النوع": f.type === 'INFLOW' ? 'وارد نقدي' : 'صادر نقدي',
          "المبلغ": f.amount,
          "المصدر": f.source
        }));
        ExportService.exportToExcel(rows, fileName);
      } else if (activeTab === 'remaining-stock') {
        const rows = reportData.map((r: any) => ({
          "اسم الصنف": r.name,
          "الباركود": r.code,
          "التصنيف": r.category,
          "الرصيد المتاح": r.stock,
          "الحد الأدنى": r.minStock,
          "سعر التكلفة": r.costPrice,
          "سعر البيع": r.salePrice,
          "الحالة": r.status
        }));
        ExportService.exportToExcel(rows, fileName);
      } else if (activeTab === 'expiry-items') {
        const rows = reportData.map((r: any) => ({
          "اسم الصنف": r.name,
          "الباركود": r.barcode,
          "تاريخ الصلاحية": r.expiryDate,
          "الأيام المتبقية": r.daysRemaining,
          "الكمية": r.stock,
          "التكلفة": r.cost,
          "الحالة": r.status
        }));
        ExportService.exportToExcel(rows, fileName);
      } else if (activeTab === 'item-sales-movement') {
        const rows = reportData.map((r: any) => ({
          "اسم الصنف": r.name,
          "الكمية المباعة": r.quantitySold,
          "إجمالي المبيعات": r.totalSales,
          "الربح المحقق": r.estimatedProfit,
          "هامش الربح %": `${r.marginPct.toFixed(1)}%`
        }));
        ExportService.exportToExcel(rows, fileName);
      } else if (activeTab === 'customer-balances' || activeTab === 'supplier-balances') {
        const rows = reportData.map((r: any) => ({
          "الاسم": r.name,
          "الهاتف": r.phone,
          "إجمالي التعاملات": r.totalSales || r.totalPurchases || 0,
          "المسدد": r.totalPaid,
          "الرصيد المتبقي": r.balance,
          "مستوى المخاطرة": r.riskLevel || '-'
        }));
        ExportService.exportToExcel(rows, fileName);
      } else if (activeTab === 'aging-reports-customer' || activeTab === 'aging-reports-supplier') {
        const rows = reportData.map((r: any) => ({
          "الشريك": r.partnerName,
          "المستند": r.docId,
          "التاريخ": r.date,
          "الأيام المتأخرة": r.days,
          "المبلغ": r.amount,
          "0-30 يوم": r.bucket1,
          "31-60 يوم": r.bucket2,
          "61-90 يوم": r.bucket3,
          "+90 يوم": r.bucket4
        }));
        ExportService.exportToExcel(rows, fileName);
      } else if (activeTab === 'tax-reports') {
        const rows = [
          { "البيان": "المبيعات الخاضعة للضريبة", "المبلغ الخاضع": reportData.totalSalesTaxable, "قيمة الضريبة المحصلة (VAT)": reportData.outputVat },
          { "البيان": "المشتريات الخاضعة للضريبة", "المبلغ الخاضع": reportData.totalPurchasesTaxable, "قيمة الضريبة المدفوعة (VAT)": reportData.inputVat },
          { "البيان": "صافي الضريبة الواجبة للسداد", "المبلغ الخاضع": "-", "قيمة الضريبة المحصلة (VAT)": reportData.netTaxPayable }
        ];
        ExportService.exportToExcel(rows, fileName);
      } else if (activeTab === 'audit-trail') {
        const rows = reportData.map((l: any) => ({
          "الوقت": l.timestamp,
          "المستخدم": l.user_id,
          "الإجراء": l.action,
          "النوع": l.target_type,
          "المعرف": l.target_id,
          "التفاصيل": l.details
        }));
        ExportService.exportToExcel(rows, fileName);
      } else {
        ExportService.exportToExcel(reportData, fileName);
      }

      addToast("تم تصدير ملف Excel (Spreadsheet) بنجاح", "success");
      auditLogService.log('REPORT_GENERATED', 'REPORT', activeTab, `Exported Excel for ${activeTab}`);
    } catch (e) {
      console.error(e);
      addToast("حدث خطأ أثناء تصدير ملف Excel", "error");
    }
  };

  // Unified Export to PDF with professional styled print template
  const handleExportPDF = async () => {
    setExportDropdownOpen(false);
    if (!reportData) {
      addToast("لا توجد بيانات متاحة لتصدير PDF", "error");
      return;
    }

    try {
      await ExportService.exportToPDF({
        reportName: activeTabConfig.label,
        date: new Date().toISOString(),
        summary: [
          { label: 'الفترة المحددة', value: `من ${startDate} إلى ${endDate}` },
          { label: 'تاريخ الإنشاء', value: new Date().toLocaleString('ar-SA') },
          { label: 'العملة الرسمية', value: currency }
        ],
        headers: ['البيان / الصنف / الحساب', 'القيمة / الرصيد'],
        rows: Array.isArray(reportData) 
          ? reportData.slice(0, 50).map((r: any) => ({
              'البيان / الصنف / الحساب': r.name || r.partnerName || r.description || r.code || 'بند',
              'القيمة / الرصيد': `${formatNum(r.balance || r.amount || r.endingDebit || r.totalSales || r.costValue || 0)} ${currency}`
            }))
          : []
      }, 'REPORT');

      addToast("تم فتح قالب الطباعة وتصدير PDF المهني بنجاح", "success");
      auditLogService.log('REPORT_GENERATED', 'REPORT', activeTab, `Exported PDF for ${activeTab}`);
    } catch (e) {
      console.error(e);
      addToast("تعذر إنشاء ملف PDF المنسق", "error");
    }
  };

  // Direct Browser Print
  const handlePrint = () => {
    setExportDropdownOpen(false);
    window.print();
    auditLogService.log('REPORT_GENERATED', 'REPORT', activeTab, `Printed report for ${activeTab}`);
  };

  // Filtered tabs for active category
  const currentCategoryTabs = useMemo(() => 
    REPORT_TABS.filter(t => t.category === activeCategory),
  [activeCategory]);

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFA] font-cairo text-slate-900 overflow-x-hidden w-full relative" dir="rtl">
      
      {/* 1. Header Panel - High Contrast, Mobile-Responsive without title truncation */}
      <header className="sticky top-0 z-[40] bg-white border-b border-slate-100 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Top Left/Right Branding & Navigation */}
          <div className="flex items-center gap-3.5 min-w-0">
            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={() => onNavigate('dashboard')}
              className="w-11 h-11 bg-slate-50 border border-slate-200 flex items-center justify-center rounded-2xl text-slate-600 hover:bg-white hover:text-[#1E4D4D] hover:border-[#1E4D4D] transition-all shadow-sm shrink-0"
              title="العودة إلى لوحة التحكم"
              aria-label="العودة إلى لوحة التحكم"
            >
              <ArrowRight size={20} strokeWidth={2.5} />
            </motion.button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg md:text-xl font-black text-[#1E4D4D] tracking-tight truncate">
                  مركز التقارير والتحليلات المالية الموحد
                </h1>
                <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black rounded-full whitespace-nowrap">
                  Enterprise Engine
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-bold truncate mt-0.5">
                {activeTabConfig.label} &bull; حسابات حقيقية مدققة ومطابقة للمعايير
              </p>
            </div>
          </div>

          {/* Action Buttons & Export Dropdown */}
          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            <button 
              onClick={fetchReportData}
              disabled={isLoading}
              className="h-11 px-4 bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl flex items-center gap-2 text-xs font-black transition-all shadow-sm disabled:opacity-50"
              title="تحديث البيانات"
            >
              <RefreshCw size={15} className={isLoading ? "animate-spin text-[#1E4D4D]" : ""} />
              <span className="hidden sm:inline">تحديث</span>
            </button>

            <button 
              onClick={handlePrint}
              className="h-11 px-4 bg-white border border-slate-200 text-slate-700 hover:border-[#1E4D4D] hover:text-[#1E4D4D] rounded-xl flex items-center gap-2 text-xs font-black transition-all shadow-sm"
              title="طباعة فورية"
            >
              <Printer size={16} />
              <span className="hidden sm:inline">طباعة</span>
            </button>

            {/* Export Dropdown Menu */}
            <div className="relative" ref={exportDropdownRef}>
              <motion.button 
                whileTap={{ scale: 0.98 }}
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                className="h-11 px-4 bg-[#1E4D4D] text-white hover:bg-teal-900 rounded-xl flex items-center gap-2.5 text-xs font-black transition-all shadow-md shadow-emerald-950/10"
              >
                <Download size={16} />
                <span>خيارات التصدير</span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${exportDropdownOpen ? 'rotate-180' : ''}`} />
              </motion.button>

              <AnimatePresence>
                {exportDropdownOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-50 flex flex-col gap-1"
                  >
                    <div className="px-3 py-2 border-b border-slate-100 mb-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase">تصدير التقرير الحالي</p>
                      <p className="text-xs font-black text-[#1E4D4D] truncate">{activeTabConfig.shortLabel}</p>
                    </div>

                    <button 
                      onClick={handleExportExcel}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right text-xs font-black text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <FileSpreadsheet size={16} />
                      </div>
                      <div>
                        <p className="leading-tight">تصدير كملف Excel (.xls)</p>
                        <p className="text-[9px] font-bold text-slate-400">جداول مهيأة بترميز XML رسمي</p>
                      </div>
                    </button>

                    <button 
                      onClick={handleExportPDF}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right text-xs font-black text-slate-700 hover:bg-red-50 hover:text-red-800 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                        <FileText size={16} />
                      </div>
                      <div>
                        <p className="leading-tight">تصدير كملف PDF رسمي</p>
                        <p className="text-[9px] font-bold text-slate-400">جاهز للأرشفة والطباعة والمشاركة</p>
                      </div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

        </div>
      </header>

      {/* 2. Top Category Navigator Bar */}
      <div className="bg-white border-b border-slate-100 px-4 sm:px-6 py-2.5 sticky top-[73px] z-30 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
          {CATEGORIES.map(cat => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  const firstTabOfCat = REPORT_TABS.find(t => t.category === cat.id);
                  if (firstTabOfCat) {
                    setActiveTab(firstTabOfCat.id);
                  }
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
                  isActive 
                    ? 'bg-[#1E4D4D] text-white shadow-md shadow-teal-900/10' 
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-[#1E4D4D]'
                }`}
              >
                <span className={isActive ? 'text-emerald-300' : 'text-slate-400'}>{cat.icon}</span>
                <span>{cat.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Main Body Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* SIDEBAR: Specific Report Tabs in Active Category + Filters */}
        <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4 print:hidden">
          
          {/* Sub-Reports Selector Card */}
          <div className="bg-white p-3 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-1">
            <div className="px-3 py-2 border-b border-slate-100 mb-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">تقارير هذا القسم</span>
            </div>
            
            {currentCategoryTabs.map((item) => {
              const active = item.id === activeTab;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (activeTab !== item.id) {
                      setReportData(null);
                      setIsLoading(true);
                      setActiveTab(item.id);
                      setSearchTerm("");
                    }
                  }}
                  className={`w-full flex items-start justify-between text-right p-3 rounded-2xl transition-all ${
                    active 
                      ? 'bg-[#1E4D4D] text-white shadow-lg shadow-teal-950/10' 
                      : 'text-slate-700 hover:bg-slate-50 hover:text-[#1E4D4D]'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className={`mt-0.5 shrink-0 ${active ? 'text-emerald-300' : 'text-slate-400'}`}>
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black leading-snug truncate">{item.label}</p>
                      <p className={`text-[10px] font-medium line-clamp-1 mt-0.5 ${active ? 'text-emerald-100/70' : 'text-slate-400'}`}>
                        {item.desc}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Filter & Controls Card */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-black text-[#1E4D4D] flex items-center gap-1.5">
                <Filter size={14} />
                <span>فلاتر وتخصيص التقرير</span>
              </h3>
              <span className="text-[10px] font-bold text-slate-400">تحديث فوري</span>
            </div>

            {/* Quick Date Presets */}
            <div>
              <label className="text-[10px] font-black text-slate-400 block mb-1.5">الفترات الزمنية السريعة</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'today', label: 'اليوم' },
                  { id: 'week', label: 'أسبوع' },
                  { id: 'month', label: 'شهر' },
                  { id: 'quarter', label: 'ربع سنة' },
                  { id: 'year', label: 'السنة' },
                  { id: 'all', label: 'الكل' }
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleDatePreset(p.id as any)}
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-black border transition-all ${
                      activePreset === p.id 
                        ? 'bg-[#1E4D4D] text-white border-[#1E4D4D]' 
                        : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Date Range */}
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">من تاريخ</label>
                <div className="relative">
                  <Calendar size={14} className="absolute right-3 top-3 text-slate-400" />
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setActivePreset('custom');
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 h-9 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#1E4D4D]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">حتى تاريخ</label>
                <div className="relative">
                  <Calendar size={14} className="absolute right-3 top-3 text-slate-400" />
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setActivePreset('custom');
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 h-9 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#1E4D4D]"
                  />
                </div>
              </div>
            </div>

            {/* Real-time search in results */}
            <div>
              <label className="text-[10px] font-black text-slate-400 block mb-1">البحث والفلترة في النتائج</label>
              <div className="relative">
                <Search size={14} className="absolute right-3 top-3 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="ابحث بالاسم، الكود، البيان..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 h-9 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#1E4D4D]"
                />
              </div>
            </div>

          </div>

        </div>

        {/* MAIN RESULTS DISPLAY AREA */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-6">
          
          {/* Print Only Header Banner */}
          <div className="hidden print:block mb-6 p-6 border-b-2 border-[#1E4D4D] text-center">
            <h2 className="text-2xl font-black text-[#1E4D4D]">{activeTabConfig.label}</h2>
            <p className="text-xs text-slate-500 font-bold mt-1">مركز التقارير والتحليلات المالية والتشغيلية</p>
            <p className="text-[11px] text-slate-400 font-bold mt-1">الفترة الزمنية: من {startDate} إلى {endDate} &bull; العملة: {currency}</p>
          </div>

          {/* Loading State */}
          {isLoading ? (
            <div className="bg-white p-16 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center gap-4">
              <div className="w-12 h-12 rounded-full border-4 border-slate-100 border-t-[#1E4D4D] animate-spin" />
              <div>
                <h3 className="text-base font-black text-[#1E4D4D]">جاري استخراج واحتساب البيانات المالية بدقة...</h3>
                <p className="text-xs text-slate-400 font-bold mt-1">يتم إجراء العمليات الرياضية ومطابقة القيود مع الدفاتر المحاسبية</p>
              </div>
            </div>
          ) : !reportData ? (
            <div className="bg-white p-16 rounded-3xl border border-slate-100 shadow-sm text-center flex flex-col items-center justify-center">
              <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mb-4">
                <AlertCircle size={32} />
              </div>
              <h3 className="text-base font-black text-slate-700">لا توجد بيانات مطابقة للفترة المحددة</h3>
              <p className="text-xs text-slate-400 font-medium mt-1 max-w-md">
                قم بتعديل نطاق التاريخ أو التحقق من وجود قيود يومية وحركات مسجلة في هذا النطاق.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">

              {/* ------------------------------------------------------------- */}
              {/* TAB 1: TRIAL BALANCE (ميزان المراجعة) */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'trial-balance' && (
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-6">
                  <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <h2 className="text-base font-black text-[#1E4D4D]">ميزان المراجعة بالأرصدة والحركات</h2>
                      <p className="text-[11px] text-slate-400 font-bold mt-0.5">مطابقة القيد المزدوج لجميع حسابات الأستاذ العام</p>
                    </div>
                    <div className="px-3.5 py-1.5 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-xs font-black">
                      قيد مزدوج متطابق GAAP
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-[11px] font-black border-b border-slate-200">
                          <th className="p-3">رمز الحساب</th>
                          <th className="p-3">اسم الحساب</th>
                          <th className="p-3 text-slate-700">النوع</th>
                          <th className="p-3 text-emerald-700">الرصيد المدين النهائي</th>
                          <th className="p-3 text-red-700">الرصيد الدائن النهائي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold">
                        {(reportData as TrialBalanceRow[])
                          .filter((item: any) => 
                            item.name.includes(searchTerm) || 
                            item.code.includes(searchTerm) || 
                            item.type.includes(searchTerm)
                          )
                          .map((item: any) => (
                            <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="p-3 font-mono text-slate-500">{item.code}</td>
                              <td className="p-3 text-slate-800">{item.name}</td>
                              <td className="p-3 text-slate-500">{item.type}</td>
                              <td className="p-3 text-emerald-700 font-black">
                                {item.endingDebit > 0 ? `${formatNum(item.endingDebit)} ${currency}` : '-'}
                              </td>
                              <td className="p-3 text-red-700 font-black">
                                {item.endingCredit > 0 ? `${formatNum(item.endingCredit)} ${currency}` : '-'}
                              </td>
                            </tr>
                          ))}
                        
                        {/* Summary Total Row */}
                        <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-[#1E4D4D]">
                          <td className="p-3.5" colSpan={3}>إجمالي ميزان المراجعة المتطابق</td>
                          <td className="p-3.5 text-emerald-800 text-sm">
                            {formatNum((reportData as TrialBalanceRow[])?.reduce((sum, i) => sum + (i.endingDebit || 0), 0))} {currency}
                          </td>
                          <td className="p-3.5 text-red-800 text-sm">
                            {formatNum((reportData as TrialBalanceRow[])?.reduce((sum, i) => sum + (i.endingCredit || 0), 0))} {currency}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 2: PROFIT & LOSS (قائمة الأرباح والخسائر) */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'profit-loss' && (
                <div className="flex flex-col gap-6">
                  {/* Summary Metric Bento */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
                      <span className="text-[11px] text-slate-400 font-black">إجمالي الإيرادات (Revenue)</span>
                      <h3 className="text-2xl font-black text-emerald-600 mt-2">
                        {formatNum(reportData?.revenue)} <span className="text-xs font-bold text-slate-400">{currency}</span>
                      </h3>
                    </div>

                    <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
                      <span className="text-[11px] text-slate-400 font-black">تكلفة البضاعة المباعة (COGS)</span>
                      <h3 className="text-2xl font-black text-amber-600 mt-2">
                        {formatNum(reportData?.cogs)} <span className="text-xs font-bold text-slate-400">{currency}</span>
                      </h3>
                    </div>

                    <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
                      <span className="text-[11px] text-slate-400 font-black">المصاريف التشغيلية</span>
                      <h3 className="text-2xl font-black text-red-500 mt-2">
                        {formatNum(reportData?.expenses)} <span className="text-xs font-bold text-slate-400">{currency}</span>
                      </h3>
                    </div>

                    <div className="bg-[#1E4D4D] text-white p-5 rounded-3xl shadow-sm flex flex-col justify-between">
                      <span className="text-[11px] text-emerald-200 font-black">صافي الأرباح الفعلية</span>
                      <h3 className="text-2xl font-black text-white mt-2">
                        {formatNum(reportData?.netProfit)} <span className="text-xs font-bold text-emerald-200">{currency}</span>
                      </h3>
                    </div>
                  </div>

                  {/* Detailed Statement Table */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
                    <h2 className="text-base font-black text-[#1E4D4D]">تفاصيل قائمة الدخل والأرباح التشغيلية</h2>
                    
                    <div className="flex flex-col divide-y divide-slate-100 text-xs font-bold">
                      <div className="flex justify-between p-3.5 bg-slate-50/50">
                        <span className="text-slate-800 font-black">إجمالي إيرادات المبيعات (Gross Sales Revenue)</span>
                        <span className="text-emerald-700 font-black text-sm">+{formatNum(reportData?.revenue)} {currency}</span>
                      </div>

                      <div className="flex justify-between p-3.5">
                        <span className="text-slate-700">تكلفة البضاعة المباعة (Cost of Goods Sold - COGS)</span>
                        <span className="text-red-600 font-black">-{formatNum(reportData?.cogs)} {currency}</span>
                      </div>

                      <div className="flex justify-between p-3.5 bg-emerald-50/30 text-emerald-950 font-black text-sm">
                        <span>إجمالي مجمل الربح (Gross Profit Margin)</span>
                        <span>{formatNum(reportData?.grossProfit)} {currency} ({reportData?.margin?.toFixed(1)}%)</span>
                      </div>

                      <div className="flex justify-between p-3.5">
                        <span className="text-slate-700">المصاريف الإدارية والتشغيلية العامة (Operating Expenses)</span>
                        <span className="text-red-600 font-black">-{formatNum(reportData?.expenses)} {currency}</span>
                      </div>

                      {(reportData?.expenseDetails || []).map((exp: any) => (
                        <div key={exp.id} className="flex justify-between pr-8 pl-3.5 py-2.5 text-slate-500 text-[11px] bg-slate-50/30">
                          <span>{exp.name} ({exp.code})</span>
                          <span>{formatNum(exp.amount)} {currency}</span>
                        </div>
                      ))}

                      <div className="flex justify-between p-4 bg-[#1E4D4D] text-white rounded-2xl font-black text-base mt-2">
                        <span>صافي الربح النهائي للفترة (Net Income)</span>
                        <span>{formatNum(reportData?.netProfit)} {currency}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 3: BALANCE SHEET (الميزانية العمومية) */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'balance-sheet' && (
                <div className="flex flex-col gap-6">
                  {/* Total Balance Status Banner */}
                  <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <h3 className="text-base font-black text-[#1E4D4D]">الميزانية العمومية والمركز المالي</h3>
                      <p className="text-[11px] text-slate-400 font-bold">تاريخ المركز المالي التراكمي: {reportData?.asOfDate}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 ${
                        reportData?.isBalanced ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        <ShieldCheck size={16} />
                        <span>{reportData?.isBalanced ? 'الميزانية متوازنة بدقة (الأصول = الخصوم + الملكية)' : 'الميزانية بحاجة لمطابقة قيود'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Assets Column */}
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                        <h3 className="text-sm font-black text-emerald-800">الأصول (Assets)</h3>
                        <span className="text-sm font-black text-emerald-700">{formatNum(reportData?.totalAssets)} {currency}</span>
                      </div>
                      <div className="divide-y divide-slate-100 text-xs font-bold">
                        {(reportData?.assets || []).map((a: any) => (
                          <div key={a.id} className="flex justify-between py-2.5">
                            <span className="text-slate-700">{a.name} ({a.code})</span>
                            <span className="text-slate-900">{formatNum(a.amount)} {currency}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Liabilities & Equity Column */}
                    <div className="space-y-6">
                      {/* Liabilities */}
                      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                          <h3 className="text-sm font-black text-red-800">الالتزامات (Liabilities)</h3>
                          <span className="text-sm font-black text-red-700">{formatNum(reportData?.totalLiabilities)} {currency}</span>
                        </div>
                        <div className="divide-y divide-slate-100 text-xs font-bold">
                          {(reportData?.liabilities || []).map((l: any) => (
                            <div key={l.id} className="flex justify-between py-2.5">
                              <span className="text-slate-700">{l.name} ({l.code})</span>
                              <span className="text-slate-900">{formatNum(l.amount)} {currency}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Equity */}
                      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                          <h3 className="text-sm font-black text-purple-800">حقوق الملكية (Equity)</h3>
                          <span className="text-sm font-black text-purple-700">{formatNum(reportData?.totalEquity)} {currency}</span>
                        </div>
                        <div className="divide-y divide-slate-100 text-xs font-bold">
                          {(reportData?.equity || []).map((e: any) => (
                            <div key={e.id} className="flex justify-between py-2.5">
                              <span className="text-slate-700">{e.name} ({e.code})</span>
                              <span className="text-slate-900">{formatNum(e.amount)} {currency}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 4: CASH FLOW (قائمة التدفقات النقدية) */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'cash-flow' && (
                <div className="flex flex-col gap-6">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                      <span className="text-[11px] text-slate-400 font-black">رصيد أول المدة للنقد</span>
                      <h3 className="text-2xl font-black text-slate-700 mt-2">{formatNum(reportData?.startingBalance)} <span className="text-xs text-slate-400">{currency}</span></h3>
                    </div>
                    <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                      <span className="text-[11px] text-slate-400 font-black">صافي التغير في النقد</span>
                      <h3 className={`text-2xl font-black mt-2 ${reportData?.netChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {reportData?.netChange >= 0 ? '+' : ''}{formatNum(reportData?.netChange)} <span className="text-xs text-slate-400">{currency}</span>
                      </h3>
                    </div>
                    <div className="bg-[#1E4D4D] text-white p-5 rounded-3xl shadow-sm">
                      <span className="text-[11px] text-emerald-200 font-black">رصيد النقدية الختامي</span>
                      <h3 className="text-2xl font-black text-white mt-2">{formatNum(reportData?.endingBalance)} <span className="text-xs text-emerald-200">{currency}</span></h3>
                    </div>
                  </div>

                  {/* Cash Inflow/Outflow Breakdown Table */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
                    <h2 className="text-base font-black text-[#1E4D4D]">حركات التدفق النقدي المسجلة للفترة</h2>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 text-[11px] font-black border-b border-slate-200">
                            <th className="p-3">التاريخ</th>
                            <th className="p-3">البيان / الوصف</th>
                            <th className="p-3">المصدر</th>
                            <th className="p-3">نوع الحركة</th>
                            <th className="p-3">المبلغ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-bold">
                          {(reportData?.flows || []).map((f: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50/70">
                              <td className="p-3 text-slate-500 font-mono">{f.date}</td>
                              <td className="p-3 text-slate-800">{f.description}</td>
                              <td className="p-3 text-slate-600">{f.source}</td>
                              <td className="p-3">
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                                  f.type === 'INFLOW' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                                }`}>
                                  {f.type === 'INFLOW' ? 'تدفق وارد +' : 'تدفق صادر -'}
                                </span>
                              </td>
                              <td className={`p-3 font-black ${f.type === 'INFLOW' ? 'text-emerald-700' : 'text-red-700'}`}>
                                {formatNum(f.amount)} {currency}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 5: ACCOUNT MOVEMENTS & GENERAL LEDGER */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'account-movement' && (
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3 flex-wrap gap-2">
                    <div>
                      <h2 className="text-base font-black text-[#1E4D4D]">كشف حركة الحسابات ودفتر الأستاذ التفصيلي</h2>
                      <p className="text-[11px] text-slate-400 font-bold">سجل قيود اليومية لجميع الحركات المالية المعتمدة</p>
                    </div>
                    <span className="text-xs font-black text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                      إجمالي الحركات: {reportData?.length || 0}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-[11px] font-black border-b border-slate-200">
                          <th className="p-3">التاريخ</th>
                          <th className="p-3">رقم القيد</th>
                          <th className="p-3">الحساب</th>
                          <th className="p-3">البيان</th>
                          <th className="p-3 text-emerald-700">مدين (Debit)</th>
                          <th className="p-3 text-red-700">دائن (Credit)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold">
                        {(reportData || [])
                          .filter((m: any) => 
                            m.accountName.includes(searchTerm) || 
                            m.description.includes(searchTerm) || 
                            m.entryNumber.includes(searchTerm)
                          )
                          .map((m: any) => (
                            <tr key={m.id} className="hover:bg-slate-50/70">
                              <td className="p-3 text-slate-500 font-mono">{m.date}</td>
                              <td className="p-3 text-slate-600 font-mono">{m.entryNumber}</td>
                              <td className="p-3 text-slate-800">{m.accountName}</td>
                              <td className="p-3 text-slate-600">{m.description}</td>
                              <td className="p-3 text-emerald-700 font-black">{m.debit > 0 ? `${formatNum(m.debit)} ${currency}` : '-'}</td>
                              <td className="p-3 text-red-700 font-black">{m.credit > 0 ? `${formatNum(m.credit)} ${currency}` : '-'}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 6: INVENTORY VALUATION */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'inventory-valuation' && (
                <div className="flex flex-col gap-6">
                  {/* Summary Metric Bento */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                      <span className="text-[11px] text-slate-400 font-black">إجمالي قيمة المخزون بالتكلفة</span>
                      <h3 className="text-2xl font-black text-[#1E4D4D] mt-2">
                        {formatNum(reportData?.totalCostValue)} <span className="text-xs text-slate-400">{currency}</span>
                      </h3>
                    </div>
                    <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                      <span className="text-[11px] text-slate-400 font-black">إجمالي القيمة السوقية البيعية</span>
                      <h3 className="text-2xl font-black text-emerald-600 mt-2">
                        {formatNum(reportData?.totalSalesValue)} <span className="text-xs text-slate-400">{currency}</span>
                      </h3>
                    </div>
                    <div className="bg-emerald-900 text-white p-5 rounded-3xl shadow-sm">
                      <span className="text-[11px] text-emerald-200 font-black">الأرباح المتوقعة المحتجزة بالمخزن</span>
                      <h3 className="text-2xl font-black text-white mt-2">
                        {formatNum(reportData?.totalProfitPotential)} <span className="text-xs text-emerald-200">{currency}</span>
                      </h3>
                    </div>
                  </div>

                  {/* Items Valuation Table */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
                    <h2 className="text-base font-black text-[#1E4D4D]">جدول تقييم أصناف المخزون والتكلفة</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 text-[11px] font-black border-b border-slate-200">
                            <th className="p-3">اسم الصنف</th>
                            <th className="p-3">الباركود</th>
                            <th className="p-3">الكمية</th>
                            <th className="p-3">سعر التكلفة</th>
                            <th className="p-3">سعر البيع</th>
                            <th className="p-3 text-[#1E4D4D]">قيمة التكلفة</th>
                            <th className="p-3 text-emerald-700">القيمة البيعية</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-bold">
                          {(reportData?.items || [])
                            .filter((item: any) => item.name.includes(searchTerm) || item.code.includes(searchTerm))
                            .map((item: any) => (
                              <tr key={item.id} className="hover:bg-slate-50/70">
                                <td className="p-3 text-slate-800">{item.name}</td>
                                <td className="p-3 font-mono text-slate-500">{item.code}</td>
                                <td className="p-3 text-slate-700">{item.quantity}</td>
                                <td className="p-3 text-slate-600">{formatNum(item.unitCost)}</td>
                                <td className="p-3 text-slate-600">{formatNum(item.unitSell)}</td>
                                <td className="p-3 text-[#1E4D4D] font-black">{formatNum(item.costValue)} {currency}</td>
                                <td className="p-3 text-emerald-700 font-black">{formatNum(item.salesValue)} {currency}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 7: REMAINING STOCK */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'remaining-stock' && (
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
                  <h2 className="text-base font-black text-[#1E4D4D]">تقرير المخزون المتبقي ومستويات الأمان</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-[11px] font-black border-b border-slate-200">
                          <th className="p-3">اسم الصنف</th>
                          <th className="p-3">الباركود</th>
                          <th className="p-3">الفئة</th>
                          <th className="p-3">الرصيد المتاح</th>
                          <th className="p-3">الحد الأدنى</th>
                          <th className="p-3">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold">
                        {(reportData || [])
                          .filter((p: any) => p.name.includes(searchTerm) || p.code.includes(searchTerm))
                          .map((p: any) => (
                            <tr key={p.id} className="hover:bg-slate-50/70">
                              <td className="p-3 text-slate-800">{p.name}</td>
                              <td className="p-3 font-mono text-slate-500">{p.code}</td>
                              <td className="p-3 text-slate-600">{p.category}</td>
                              <td className="p-3 font-black text-[#1E4D4D]">{p.stock}</td>
                              <td className="p-3 text-slate-500">{p.minStock}</td>
                              <td className="p-3">
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                                  p.stock <= 0 ? 'bg-red-50 text-red-700' : (p.stock <= p.minStock ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')
                                }`}>
                                  {p.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 8: EXPIRY TRACKING */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'expiry-items' && (
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
                  <h2 className="text-base font-black text-[#1E4D4D]">تقرير تواريخ الصلاحية والمنتجات المعرضة للتلف</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-[11px] font-black border-b border-slate-200">
                          <th className="p-3">اسم الصنف</th>
                          <th className="p-3">الباركود</th>
                          <th className="p-3">تاريخ الصلاحية</th>
                          <th className="p-3">الأيام المتبقية</th>
                          <th className="p-3">الكمية</th>
                          <th className="p-3">حالة الصلاحية</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold">
                        {(reportData || [])
                          .filter((p: any) => p.name.includes(searchTerm) || p.barcode.includes(searchTerm))
                          .map((p: any) => (
                            <tr key={p.id} className="hover:bg-slate-50/70">
                              <td className="p-3 text-slate-800">{p.name}</td>
                              <td className="p-3 font-mono text-slate-500">{p.barcode}</td>
                              <td className="p-3 font-mono text-slate-600">{p.expiryDate}</td>
                              <td className="p-3 text-slate-700 font-bold">{p.daysRemaining} يوم</td>
                              <td className="p-3 font-black text-[#1E4D4D]">{p.stock}</td>
                              <td className="p-3">
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                                  p.daysRemaining < 0 ? 'bg-red-50 text-red-700' : (p.daysRemaining <= 90 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')
                                }`}>
                                  {p.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 9: ITEM SALES & MOVEMENT */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'item-sales-movement' && (
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
                  <h2 className="text-base font-black text-[#1E4D4D]">حركة ومبيعات الأصناف التفصيلية</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-[11px] font-black border-b border-slate-200">
                          <th className="p-3">اسم الصنف</th>
                          <th className="p-3">الكمية المباعة</th>
                          <th className="p-3">إجمالي المبيعات</th>
                          <th className="p-3 text-emerald-700">الربح المحقق</th>
                          <th className="p-3">نسبة الهامش</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold">
                        {(reportData || [])
                          .filter((p: any) => p.name.includes(searchTerm))
                          .map((p: any) => (
                            <tr key={p.id} className="hover:bg-slate-50/70">
                              <td className="p-3 text-slate-800">{p.name}</td>
                              <td className="p-3 text-slate-700 font-black">{p.quantitySold}</td>
                              <td className="p-3 text-slate-900 font-black">{formatNum(p.totalSales)} {currency}</td>
                              <td className="p-3 text-emerald-700 font-black">{formatNum(p.estimatedProfit)} {currency}</td>
                              <td className="p-3 text-slate-600">{p.marginPct.toFixed(1)}%</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 10: CUSTOMER & SUPPLIER BALANCES */}
              {/* ------------------------------------------------------------- */}
              {(activeTab === 'customer-balances' || activeTab === 'supplier-balances') && (
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
                  <h2 className="text-base font-black text-[#1E4D4D]">
                    {activeTab === 'customer-balances' ? 'أرصدة وذمم العملاء (مدينون)' : 'أرصدة وذمم الموردين (دائنون)'}
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-[11px] font-black border-b border-slate-200">
                          <th className="p-3">الاسم</th>
                          <th className="p-3">الهاتف</th>
                          <th className="p-3">إجمالي التعاملات</th>
                          <th className="p-3">إجمالي المسدد</th>
                          <th className="p-3 text-red-700">الرصيد المتبقي</th>
                          {activeTab === 'customer-balances' && <th className="p-3">مستوى المخاطرة</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold">
                        {(reportData || [])
                          .filter((p: any) => p.name.includes(searchTerm) || p.phone.includes(searchTerm))
                          .map((p: any) => (
                            <tr key={p.id} className="hover:bg-slate-50/70">
                              <td className="p-3 text-slate-800">{p.name}</td>
                              <td className="p-3 font-mono text-slate-500">{p.phone}</td>
                              <td className="p-3 text-slate-700">{formatNum(p.totalSales || p.totalPurchases || 0)} {currency}</td>
                              <td className="p-3 text-emerald-700">{formatNum(p.totalPaid)} {currency}</td>
                              <td className="p-3 text-red-700 font-black">{formatNum(p.balance)} {currency}</td>
                              {activeTab === 'customer-balances' && (
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                    p.riskLevel === 'HIGH' ? 'bg-red-50 text-red-700' : (p.riskLevel === 'MEDIUM' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')
                                  }`}>
                                    {p.riskLevel || 'عادي'}
                                  </span>
                                </td>
                              )}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 11: DEBT AGING (تعمير الذمم) */}
              {/* ------------------------------------------------------------- */}
              {(activeTab === 'aging-reports-customer' || activeTab === 'aging-reports-supplier') && (
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
                  <h2 className="text-base font-black text-[#1E4D4D]">
                    {activeTab === 'aging-reports-customer' ? 'تقرير تعمير ذمم العملاء (فترات التأخير)' : 'تقرير تعمير ذمم الموردين (جدولة السداد)'}
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-[11px] font-black border-b border-slate-200">
                          <th className="p-3">الشريك</th>
                          <th className="p-3">رقم الفاتورة</th>
                          <th className="p-3">الأيام</th>
                          <th className="p-3 text-slate-900">المبلغ المستحق</th>
                          <th className="p-3 text-emerald-700">0-30 يوم</th>
                          <th className="p-3 text-amber-700">31-60 يوم</th>
                          <th className="p-3 text-orange-700">61-90 يوم</th>
                          <th className="p-3 text-red-700">+90 يوم</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold">
                        {(reportData || [])
                          .filter((p: any) => p.partnerName.includes(searchTerm) || p.docId.includes(searchTerm))
                          .map((p: any) => (
                            <tr key={p.id} className="hover:bg-slate-50/70">
                              <td className="p-3 text-slate-800">{p.partnerName}</td>
                              <td className="p-3 font-mono text-slate-500">{p.docId}</td>
                              <td className="p-3 text-slate-600">{p.days}</td>
                              <td className="p-3 font-black text-slate-900">{formatNum(p.amount)}</td>
                              <td className="p-3 text-emerald-700">{p.bucket1 > 0 ? formatNum(p.bucket1) : '-'}</td>
                              <td className="p-3 text-amber-700">{p.bucket2 > 0 ? formatNum(p.bucket2) : '-'}</td>
                              <td className="p-3 text-orange-700">{p.bucket3 > 0 ? formatNum(p.bucket3) : '-'}</td>
                              <td className="p-3 text-red-700 font-black">{p.bucket4 > 0 ? formatNum(p.bucket4) : '-'}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 12: TAX & VAT REPORT */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'tax-reports' && (
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-6">
                  <div>
                    <h2 className="text-base font-black text-[#1E4D4D]">الإقرار الضريبي المجمع - ضريبة القيمة المضافة (VAT)</h2>
                    <p className="text-[11px] text-slate-400 font-bold mt-1">
                      حساب ضريبة الـ VAT للمخرجات (المبيعات) والمدخلات (المشتريات) واحتساب التسوية والفرق الواجب للدفع لهيئة الزكاة والضريبة والجمارك.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="border border-slate-200 rounded-2xl p-4 bg-emerald-50/30">
                      <h3 className="text-xs font-black text-emerald-800 mb-2 border-b border-emerald-100 pb-2">الضريبة المخرجة (VAT Output) - مبيعات</h3>
                      <div className="flex flex-col gap-2.5 text-xs font-bold">
                        <div className="flex justify-between">
                          <span className="text-slate-500">إجمالي المبيعات الخاضعة للضريبة</span>
                          <span className="text-slate-800">{formatNum(reportData?.totalSalesTaxable)} {currency}</span>
                        </div>
                        <div className="flex justify-between text-emerald-700 font-black">
                          <span>مجموع ضريبة المبيعات المحصلة</span>
                          <span>+{formatNum(reportData?.outputVat)} {currency}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-2xl p-4 bg-red-50/30">
                      <h3 className="text-xs font-black text-red-800 mb-2 border-b border-red-100 pb-2">الضريبة المدخلة (VAT Input) - مشتريات</h3>
                      <div className="flex flex-col gap-2.5 text-xs font-bold">
                        <div className="flex justify-between">
                          <span className="text-slate-500">إجمالي المشتريات الخاضعة للضريبة</span>
                          <span className="text-slate-800">{formatNum(reportData?.totalPurchasesTaxable)} {currency}</span>
                        </div>
                        <div className="flex justify-between text-red-700 font-black">
                          <span>مجموع ضريبة المشتريات المدفوعة</span>
                          <span>-{formatNum(reportData?.inputVat)} {currency}</span>
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-2 bg-[#1E4D4D] text-white p-5 rounded-2xl flex items-center justify-between flex-wrap gap-4">
                      <div>
                        <h4 className="text-sm font-black text-emerald-200">صافي الضريبة المستحقة للتسوية (Net VAT Payable)</h4>
                        <p className="text-[11px] text-emerald-100/70 mt-0.5">فارق المطالبة المتبقي واجب دفعه للجهة الضريبية المعنية.</p>
                      </div>
                      <h3 className="text-2xl font-black text-white">{formatNum(reportData?.netTaxPayable)} {currency}</h3>
                    </div>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 13: AUDIT TRAIL & GOVERNANCE */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'audit-trail' && (
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3 flex-wrap gap-2">
                    <div>
                      <h2 className="text-base font-black text-[#1E4D4D]">سجل الرقابة الإدارية وتدقيق العمليات</h2>
                      <p className="text-[11px] text-slate-400 font-bold">تتبع غير قابل للتعديل لكافة الإجراءات الحساسة</p>
                    </div>
                    <span className="text-xs font-black text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                      السجلات المسجلة: {reportData?.length || 0}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-[11px] font-black border-b border-slate-200">
                          <th className="p-3">الوقت</th>
                          <th className="p-3">المستخدم</th>
                          <th className="p-3">الإجراء</th>
                          <th className="p-3">الهدف</th>
                          <th className="p-3">التفاصيل</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold">
                        {(reportData || [])
                          .filter((l: any) => 
                            (l.action || '').includes(searchTerm) || 
                            (l.details || '').includes(searchTerm) || 
                            (l.user_id || '').includes(searchTerm)
                          )
                          .map((l: any) => (
                            <tr key={l.id} className="hover:bg-slate-50/70">
                              <td className="p-3 font-mono text-slate-500">{new Date(l.timestamp).toLocaleString('ar-SA')}</td>
                              <td className="p-3 text-slate-700 font-black">{l.user_id}</td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-black">
                                  {l.action}
                                </span>
                              </td>
                              <td className="p-3 text-slate-600">{l.target_type} ({l.target_id || '-'})</td>
                              <td className="p-3 text-slate-800 max-w-xs truncate">{l.details}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

      </main>

    </div>
  );
}
