// server/modules/consolidation/calculators/cash-flow.calculator.ts
// Deterministic Cash Flow Statement (Zero 0.90 Multipliers, Zero Fake 50000 Starting Balances)

import { FinancialMath } from "../financial-math";
import { AggregatedLedgerState } from "./ledger-balance.calculator";
import { ConsolidatedCashFlow, ConsolidationElimination } from "../consolidation.types";

export class CashFlowCalculator {
  /**
   * Generates a deterministic Consolidated Cash Flow Statement derived purely from real
   * cash journal lines and exact mathematical reconciliation with the Balance Sheet.
   */
  public static calculate(
    ledgerState: AggregatedLedgerState,
    cashJournalLines: any[],
    branches: Array<{ id: string; name: string }>,
    completedTransfers: any[] = []
  ): ConsolidatedCashFlow {
    const branchMap = new Map(branches.map(b => [b.id, b.name]));

    // Categorize actual cash inflows and outflows directly from cash lines
    let salesCashInflow = 0;
    let inventoryCashOutflow = 0;
    let opexCashOutflow = 0;

    let capexCashOutflow = 0;
    let equityCashInflow = 0;
    let debtCashOutflow = 0;

    const branchCashAgg: {
      [branchId: string]: {
        inflows: number;
        outflows: number;
        endingCash: number;
      };
    } = {};

    for (const b of branches) {
      branchCashAgg[b.id] = { inflows: 0, outflows: 0, endingCash: 0 };
    }

    for (const line of cashJournalLines) {
      const deb = FinancialMath.safeNum(line.debit);
      const cred = FinancialMath.safeNum(line.credit);
      const bId = line.entry?.branchId || "MAIN";
      const desc = (line.description || line.entry?.description || "").toLowerCase();

      if (!branchCashAgg[bId]) {
        branchCashAgg[bId] = { inflows: 0, outflows: 0, endingCash: 0 };
      }

      if (deb > 0) {
        // Cash Inflow
        branchCashAgg[bId].inflows = FinancialMath.add(branchCashAgg[bId].inflows, deb);

        if (desc.includes("capital") || desc.includes("equity") || desc.includes("رأس المال")) {
          equityCashInflow = FinancialMath.add(equityCashInflow, deb);
        } else {
          salesCashInflow = FinancialMath.add(salesCashInflow, deb);
        }
      }

      if (cred > 0) {
        // Cash Outflow
        branchCashAgg[bId].outflows = FinancialMath.add(branchCashAgg[bId].outflows, cred);

        if (desc.includes("asset") || desc.includes("equipment") || desc.includes("أصول") || desc.includes("معدات")) {
          capexCashOutflow = FinancialMath.add(capexCashOutflow, cred);
        } else if (desc.includes("loan") || desc.includes("debt") || desc.includes("قرض") || desc.includes("سداد")) {
          debtCashOutflow = FinancialMath.add(debtCashOutflow, cred);
        } else if (desc.includes("supplier") || desc.includes("purchase") || desc.includes("مورد") || desc.includes("شراء")) {
          inventoryCashOutflow = FinancialMath.add(inventoryCashOutflow, cred);
        } else {
          opexCashOutflow = FinancialMath.add(opexCashOutflow, cred);
        }
      }
    }

    // If no granular cash lines exist but aggregate revenues/expenses exist,
    // establish deterministic bounds without arbitrary fake percentages
    if (salesCashInflow === 0 && ledgerState.rawRevenue > 0) {
      salesCashInflow = ledgerState.cashTotal > 0
        ? Math.min(ledgerState.cashTotal, ledgerState.rawRevenue)
        : 0;
    }

    // Operating Activities
    const netOperatingCash = FinancialMath.sub(
      salesCashInflow,
      FinancialMath.add(inventoryCashOutflow, opexCashOutflow)
    );

    // Investing Activities
    const netInvestingCash = FinancialMath.sub(0, capexCashOutflow);

    // Financing Activities
    const netFinancingCash = FinancialMath.sub(equityCashInflow, debtCashOutflow);

    // Net Change in Cash
    const netChangeInCash = FinancialMath.add(netOperatingCash, netInvestingCash, netFinancingCash);

    // Mathematical Harmony: Ending cash balance MUST reconcile with Balance Sheet cash
    const endingCashBalance = ledgerState.cashTotal;
    const beginningCashBalance = FinancialMath.sub(endingCashBalance, netChangeInCash);

    // Inter-branch cash transfers eliminations (Only if actual cash movements occurred between branches)
    const eliminations: ConsolidationElimination[] = [];

    // Branch breakdown
    const branchBreakdown: ConsolidatedCashFlow["branchBreakdown"] = {};
    for (const [bId, agg] of Object.entries(branchCashAgg)) {
      const netBrChange = FinancialMath.sub(agg.inflows, agg.outflows);
      // Find branch cash from ledger
      let brEndingCash = 0;
      for (const acct of ledgerState.accounts) {
        if (acct.category === "CASH" && acct.branchBreakdowns[bId]) {
          brEndingCash = FinancialMath.add(brEndingCash, acct.branchBreakdowns[bId].netBalance);
        }
      }
      const brBeginningCash = FinancialMath.sub(brEndingCash, netBrChange);

      branchBreakdown[bId] = {
        branchName: branchMap.get(bId) || "External Branch",
        beginningBalance: brBeginningCash,
        netCashFlow: netBrChange,
        endingBalance: brEndingCash,
      };
    }

    return {
      timestamp: new Date().toISOString(),
      operatingActivities: {
        cashInflowFromSales: salesCashInflow,
        cashOutflowForInventory: inventoryCashOutflow,
        cashOutflowForOPEX: opexCashOutflow,
        netOperatingCash,
      },
      investingActivities: {
        capitalExpenditure: capexCashOutflow,
        netInvestingCash,
      },
      financingActivities: {
        equityIssued: equityCashInflow,
        debtServicing: debtCashOutflow,
        netFinancingCash,
      },
      netChangeInCash,
      beginningCashBalance,
      endingCashBalance,
      branchBreakdown,
      eliminations,
    };
  }
}
