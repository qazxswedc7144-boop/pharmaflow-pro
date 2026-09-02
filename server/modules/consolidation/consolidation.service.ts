// server/modules/consolidation/consolidation.service.ts
// Production Financial Consolidation Service (Zero Fake Multipliers, Zero Plugs)

import { randomUUID } from "crypto";
const uuidv4 = () => randomUUID();

import { ConsolidationRepository } from "./consolidation.repository";
import { CONSOLIDATION_DEFAULTS } from "./consolidation.constants";
import { RedisConnectionManager } from "../../database/redis";
import { getCurrentTenantId } from "../../context/tenantContext";
import {
  ConsolidatedBalanceSheet,
  ConsolidatedIncomeStatement,
  ConsolidatedCashFlow,
  ConsolidatedTrialBalance,
  ConsolidatedInventoryValuation,
  AIConsolidationInsights,
  ConsolidationSummary,
} from "./consolidation.types";

import { LedgerBalanceCalculator } from "./calculators/ledger-balance.calculator";
import { InventoryValuationCalculator } from "./calculators/inventory-valuation.calculator";
import { FinancialStatementCalculator } from "./calculators/financial-statement.calculator";
import { CashFlowCalculator } from "./calculators/cash-flow.calculator";
import { TrialBalanceCalculator } from "./calculators/trial-balance.calculator";

export class ConsolidationService {
  private static async getGeminiClient(): Promise<any> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("[GEMINI WORKER] No GEMINI_API_KEY available in environment. Fallback simulation active.");
      return null;
    }
    try {
      const mod = await Function("return import('@google/genai')")();
      const GoogleGenAIClass = mod.GoogleGenAI;
      return new GoogleGenAIClass({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    } catch (e) {
      console.error("[GEMINI CLIENT] Fails to initialize:", e);
      return null;
    }
  }

  private static tryParse<T>(value: string | null): T | null {
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  /**
   * Generates Consolidated Balance Sheet
   * Source of Truth: General Ledger & Physical Inventory Valuation
   * Zero Fake Multipliers (No * 15, no * 0.85)
   * Zero Balancing Plugs (Retained Earnings is derived from actual accounts, not Assets - Liab - Capital)
   */
  static async generateBalanceSheet(
    tenantId: string = getCurrentTenantId(),
    _userId = "SYSTEM",
    forceRefresh = false
  ): Promise<ConsolidatedBalanceSheet> {
    const cacheKey = `${CONSOLIDATION_DEFAULTS.BALANCE_SHEET_CACHE_KEY}:${tenantId}`;
    if (!forceRefresh) {
      const cached = await RedisConnectionManager.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as ConsolidatedBalanceSheet;
      }
    }

    const [branches, journalLines, inventoryValuation, completedTransfers, products] = await Promise.all([
      ConsolidationRepository.getBranches(tenantId),
      ConsolidationRepository.getAllPostedJournalLines(tenantId),
      this.generateInventoryValuation(tenantId, forceRefresh),
      ConsolidationRepository.getCompletedBranchTransfers(tenantId),
      ConsolidationRepository.getProductCatalog(tenantId),
    ]);

    const ledgerState = LedgerBalanceCalculator.calculateAggregatedLedger(journalLines, branches);

    // Compute current period net income from income statement for unclosed period equity reconciliation
    const incomeStatement = await this.generateIncomeStatement(tenantId, _userId, forceRefresh);

    const result = FinancialStatementCalculator.calculateBalanceSheet(
      ledgerState,
      inventoryValuation.totalInventoryValue,
      branches,
      completedTransfers,
      products,
      incomeStatement.netIncome
    );

    // Cache with tenant-scoped key
    await RedisConnectionManager.set(
      cacheKey,
      JSON.stringify(result),
      "EX",
      CONSOLIDATION_DEFAULTS.CACHE_TTL_SECONDS
    );

    return result;
  }

  /**
   * Generates Consolidated Income Statement
   * Source of Truth: General Ledger & Actual Inter-Branch Internal Invoices
   * Zero Fake Multipliers (No * 0.1, no * 0.90)
   */
  static async generateIncomeStatement(
    tenantId: string = getCurrentTenantId(),
    _userId = "SYSTEM",
    forceRefresh = false
  ): Promise<ConsolidatedIncomeStatement> {
    const cacheKey = `${CONSOLIDATION_DEFAULTS.INCOME_STATEMENT_CACHE_KEY}:${tenantId}`;
    if (!forceRefresh) {
      const cached = await RedisConnectionManager.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as ConsolidatedIncomeStatement;
      }
    }

    const [branches, journalLines, invoices, products] = await Promise.all([
      ConsolidationRepository.getBranches(tenantId),
      ConsolidationRepository.getAllPostedJournalLines(tenantId),
      ConsolidationRepository.getInvoices(tenantId, 1, 1000, { type: "SALE" }),
      ConsolidationRepository.getProductCatalog(tenantId),
    ]);

    const ledgerState = LedgerBalanceCalculator.calculateAggregatedLedger(journalLines, branches);

    const result = FinancialStatementCalculator.calculateIncomeStatement(
      ledgerState,
      branches,
      invoices,
      products
    );

    // Cache with tenant-scoped key
    await RedisConnectionManager.set(
      cacheKey,
      JSON.stringify(result),
      "EX",
      CONSOLIDATION_DEFAULTS.CACHE_TTL_SECONDS
    );

    return result;
  }

  /**
   * Generates Consolidated Cash Flow Statement
   * Source of Truth: Real Cash Journal Lines & Exact Reconciliation with Balance Sheet
   * Zero Fake Multipliers (No * 0.90, no * 10, no fake 50000 baseline)
   */
  static async generateCashFlow(
    tenantId: string = getCurrentTenantId(),
    _userId = "SYSTEM",
    forceRefresh = false
  ): Promise<ConsolidatedCashFlow> {
    const cacheKey = `${CONSOLIDATION_DEFAULTS.CASH_FLOW_CACHE_KEY}:${tenantId}`;
    if (!forceRefresh) {
      const cached = await RedisConnectionManager.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as ConsolidatedCashFlow;
      }
    }

    const [branches, journalLines, completedTransfers] = await Promise.all([
      ConsolidationRepository.getBranches(tenantId),
      ConsolidationRepository.getAllPostedJournalLines(tenantId),
      ConsolidationRepository.getCompletedBranchTransfers(tenantId),
    ]);

    const ledgerState = LedgerBalanceCalculator.calculateAggregatedLedger(journalLines, branches);

    // Filter cash journal lines directly
    const cashJournalLines = journalLines.filter(line => {
      const category = LedgerBalanceCalculator.classifyAccount(
        line.account.type,
        line.account.code,
        line.account.name
      );
      return category === "CASH";
    });

    const result = CashFlowCalculator.calculate(
      ledgerState,
      cashJournalLines,
      branches,
      completedTransfers
    );

    // Cache with tenant-scoped key
    await RedisConnectionManager.set(
      cacheKey,
      JSON.stringify(result),
      "EX",
      CONSOLIDATION_DEFAULTS.CACHE_TTL_SECONDS
    );

    return result;
  }

  /**
   * Generates Consolidated Trial Balance
   * Source of Truth: Complete Account Ledger with Debit == Credit Invariant Verification
   * Zero Fake Multipliers (No clearingRow.debit * 0.15)
   */
  static async generateTrialBalance(
    tenantId: string = getCurrentTenantId(),
    _userId = "SYSTEM",
    forceRefresh = false
  ): Promise<ConsolidatedTrialBalance> {
    const cacheKey = `${CONSOLIDATION_DEFAULTS.TRIAL_BALANCE_CACHE_KEY}:${tenantId}`;
    if (!forceRefresh) {
      const cached = await RedisConnectionManager.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as ConsolidatedTrialBalance;
      }
    }

    const [branches, journalLines, completedTransfers] = await Promise.all([
      ConsolidationRepository.getBranches(tenantId),
      ConsolidationRepository.getAllPostedJournalLines(tenantId),
      ConsolidationRepository.getCompletedBranchTransfers(tenantId),
    ]);

    const ledgerState = LedgerBalanceCalculator.calculateAggregatedLedger(journalLines, branches);

    const result = TrialBalanceCalculator.calculate(
      ledgerState,
      branches,
      completedTransfers
    );

    // Cache with tenant-scoped key
    await RedisConnectionManager.set(
      cacheKey,
      JSON.stringify(result),
      "EX",
      CONSOLIDATION_DEFAULTS.CACHE_TTL_SECONDS
    );

    return result;
  }

  /**
   * Generates Consolidated Inventory Valuation & Velocity Analytics
   * Source of Truth: Real physical branch levels, actual batch FIFO costs, real catalog pricing, real sales
   * Zero Fallback Multipliers (No || 12, no || 15, no Math.random())
   */
  static async generateInventoryValuation(
    tenantId: string = getCurrentTenantId(),
    forceRefresh = false
  ): Promise<ConsolidatedInventoryValuation> {
    const cacheKey = `${CONSOLIDATION_DEFAULTS.INVENTORY_CACHE_KEY}:${tenantId}`;
    if (!forceRefresh) {
      const cached = await RedisConnectionManager.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as ConsolidatedInventoryValuation;
      }
    }

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [branches, products, batches, inventoryLevels, recentSaleInvoices] = await Promise.all([
      ConsolidationRepository.getBranches(tenantId),
      ConsolidationRepository.getProductCatalog(tenantId),
      ConsolidationRepository.getInventoryBatches(tenantId),
      ConsolidationRepository.getBranchInventoryLevels(tenantId),
      ConsolidationRepository.getInvoices(tenantId, 1, 1000, {
        startDate: ninetyDaysAgo,
        type: "SALE",
      }),
    ]);

    const result = InventoryValuationCalculator.calculate(
      inventoryLevels,
      products,
      batches,
      branches,
      recentSaleInvoices
    );

    // Cache with tenant-scoped key
    await RedisConnectionManager.set(
      cacheKey,
      JSON.stringify(result),
      "EX",
      CONSOLIDATION_DEFAULTS.CACHE_TTL_SECONDS
    );

    return result;
  }

  /**
   * AI Financial Insight Generational Pipeline with Gemini Fallbacks
   * Interprets statistical output without modifying financial figures
   */
  static async generateAIInsights(
    balanceSheet: ConsolidatedBalanceSheet,
    incomeStatement: ConsolidatedIncomeStatement,
    inventory: ConsolidatedInventoryValuation
  ): Promise<AIConsolidationInsights> {
    const ai = await this.getGeminiClient();

    const summaryContext = {
      activeBranches: Object.keys(balanceSheet.branchBreakdown).length,
      totalAssets: balanceSheet.assets.totalAssets,
      totalLiabilities: balanceSheet.liabilities.totalLiabilities,
      retainedEarnings: balanceSheet.equity.retainedEarnings,
      totalRevenue: incomeStatement.revenue,
      grossProfit: incomeStatement.grossProfit,
      opex: incomeStatement.operatingExpenses.totalOPEX,
      netIncome: incomeStatement.netIncome,
      totalInventoryQuantity: inventory.totalInventoryQuantity,
      totalInventoryValue: inventory.totalInventoryValue,
      branchInventorySplit: Object.entries(inventory.branchBreakdown).map(
        ([, d]) => `${d.branchName}: ${d.quantity} units, $${d.value}`
      ),
      slowMovingCount: inventory.slowMovingProducts.length,
      deadStockCount: inventory.deadStock.length,
      topSlowProducts: inventory.slowMovingProducts
        .slice(0, 3)
        .map(p => `${p.productName} (SKU: ${p.sku}) Units: ${p.totalStock}`),
      warnings: inventory.deadStock
        .slice(0, 3)
        .map(d => `${d.productName} has ${d.stockQuantity} dead units valued at $${d.tiedCapital}`),
    };

    let generatedText = "";
    if (ai) {
      try {
        const prompt = `
          Translate statistical metrics from a multi-branch pharmacy ERP system into highly professional, analytical, direct financial insights for the Board.
          
          Metrics Summary:
          - Active Branches: ${summaryContext.activeBranches}
          - Total Assets: $${summaryContext.totalAssets.toFixed(2)}
          - Total Liabilities: $${summaryContext.totalLiabilities.toFixed(2)}
          - Group Retained Earnings: $${summaryContext.retainedEarnings.toFixed(2)}
          - Consolidated Group Revenue: $${summaryContext.totalRevenue.toFixed(2)}
          - Gross profit: $${summaryContext.grossProfit.toFixed(2)}
          - OPEX: $${summaryContext.opex.toFixed(2)}
          - Consolidated Net Income: $${summaryContext.netIncome.toFixed(2)}
          - Inventory Stock quantity: ${summaryContext.totalInventoryQuantity} units
          - Group Inventory Value: $${summaryContext.totalInventoryValue.toFixed(2)}
          - Inventory Branch distribution: ${summaryContext.branchInventorySplit.join("; ")}
          - Slow moving indicators: ${summaryContext.warnings.join("; ")}

          Generate an objective financial analysis with exactly the following JSON structure model:
          {
            "revenueGrowthTrends": "Short professional explanation describing the current group revenue and sales potential...",
            "profitabilityAnalysis": "Analysis on gross profit margins and opex structures of the consolidated organization...",
            "inventoryTurnoverAnalysis": "Turnover metrics and deadstock reduction actions...",
            "stockRiskWarnings": ["Warning about overstocking in specific branches", "Dead stock alerts..."],
            "reorderRecommendations": [
              {
                "productId": "PID-01",
                "sku": "SKU-990",
                "productName": "Example Amoxicillin 500mg",
                "currentStock": 5,
                "reorderQuantity": 50,
                "percentageGap": 90
              }
            ]
          }

          RULES:
          - RETURN ONLY VALID PARSABLE JSON. No markdown code blocks like \`\`\`json.
          - Make recommendations mathematically accurate.
          - Do not praise or use sales hype. Keep it analytical and Swiss-school objective.
        `;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          },
        });

        generatedText = response.text || "";
      } catch (err) {
        console.error("[GEMINI ERROR] Content generation failed, executing analytical rules pipeline:", err);
      }
    }

    const parsed = this.tryParse<AIConsolidationInsights>(generatedText);
    if (parsed) {
      return parsed;
    }

    // Deterministic Rule-Based Fallback
    const fallbackReorders = inventory.slowMovingProducts.slice(0, 3).map(p => ({
      productId: p.productId,
      sku: p.sku,
      productName: p.productName,
      currentStock: p.totalStock,
      reorderQuantity: Math.max(10, Math.round(p.totalStock * 0.5)),
      percentageGap: p.totalStock < 10 ? 90 : 25,
    }));

    return {
      revenueGrowthTrends: `Consolidated revenue stands at $${summaryContext.totalRevenue.toLocaleString()} spread across ${summaryContext.activeBranches} branches.`,
      profitabilityAnalysis: `Gross profitability margin sits at ${
        summaryContext.totalRevenue > 0
          ? ((summaryContext.grossProfit / summaryContext.totalRevenue) * 100).toFixed(1)
          : 0
      }%. Operating expenses of $${summaryContext.opex.toLocaleString()} represent ${
        summaryContext.totalRevenue > 0
          ? ((summaryContext.opex / summaryContext.totalRevenue) * 100).toFixed(1)
          : 0
      }% of group revenue.`,
      inventoryTurnoverAnalysis: `Consolidated pharmacy inventory totals $${summaryContext.totalInventoryValue.toLocaleString()} representing ${summaryContext.totalInventoryQuantity.toLocaleString()} physical units across ${summaryContext.activeBranches} active branches.`,
      stockRiskWarnings: [
        summaryContext.deadStockCount > 0
          ? `${summaryContext.deadStockCount} inventory batches identified as expired or near expiry.`
          : `No critical batch expirations detected within the current 60-day audit horizon.`,
        summaryContext.slowMovingCount > 0
          ? `${summaryContext.slowMovingCount} product lines identified with low inventory turnover in the past 90 days.`
          : `Inventory movement rates across product catalog remain active.`,
      ],
      reorderRecommendations: fallbackReorders,
    };
  }

  /**
   * Generates Master Consolidated Summary containing all dashboards widgets and metrics
   * Read-only pure operation
   */
  static async generateMasterConsolidationSummary(
    tenantId: string = getCurrentTenantId(),
    userId = "SYSTEM",
    forceRefresh = false
  ): Promise<ConsolidationSummary> {
    const cacheKey = `${CONSOLIDATION_DEFAULTS.DASHBOARD_CACHE_KEY}:${tenantId}`;
    if (!forceRefresh) {
      const cached = await RedisConnectionManager.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as ConsolidationSummary;
      }
    }

    const [balanceSheet, incomeStatement, inventory] = await Promise.all([
      this.generateBalanceSheet(tenantId, userId, forceRefresh),
      this.generateIncomeStatement(tenantId, userId, forceRefresh),
      this.generateInventoryValuation(tenantId, forceRefresh),
    ]);

    const insights = await this.generateAIInsights(balanceSheet, incomeStatement, inventory);

    const result: ConsolidationSummary = {
      runId: uuidv4(),
      timestamp: new Date().toISOString(),
      aggregateRevenue: incomeStatement.revenue,
      aggregateNetIncome: incomeStatement.netIncome,
      aggregateAssets: balanceSheet.assets.totalAssets,
      aggregateLiabilities: balanceSheet.liabilities.totalLiabilities,
      aggregateEquity: balanceSheet.equity.totalEquity,
      aggregateInventoryValue: inventory.totalInventoryValue,
      totalEliminationsDone: balanceSheet.eliminations.length + incomeStatement.eliminations.length,
      activeBranchesCount: Object.keys(balanceSheet.branchBreakdown).length,
      insights,
    };

    await RedisConnectionManager.set(
      cacheKey,
      JSON.stringify(result),
      "EX",
      CONSOLIDATION_DEFAULTS.CACHE_TTL_SECONDS
    );

    return result;
  }
}
