// src/services/saas/subscriptionService.ts
import { UsageMeterService } from "./usageMeterService";
import { 
  SubscriptionEntitlementService, 
  SubscriptionEntitlement, 
  SubscriptionPlanCode,
  SubscriptionStatusCode 
} from "./subscriptionEntitlementService";

export interface SubscriptionStatus {
  isActive: boolean;
  isTrial: boolean;
  planCode: SubscriptionPlanCode;
  planName: string;
  currentUsage: number;
  maxLimit: number;
  remaining: number;
  isBlocked: boolean;
  isWarning: boolean;
  expiresAt: string;
  allowedBranches: number;
  allowedUsers: number;
}

export { SubscriptionEntitlementService, UsageMeterService };
export type { SubscriptionEntitlement, SubscriptionPlanCode, SubscriptionStatusCode };

export class SubscriptionService {
  /**
   * Calculates structural operations performed by active tenant.
   * Scans local IndexedDB tables for high-integrity audit.
   */
  static async getLocalUsageCount(tenantId?: string): Promise<number> {
    return UsageMeterService.getAuthoritativeUsageCount(tenantId);
  }

  /**
   * Retrieves full subscription metadata context and evaluates blockade states.
   */
  static async getSubscriptionStatus(tenantId?: string): Promise<SubscriptionStatus> {
    const ent = await SubscriptionEntitlementService.getAuthoritativeEntitlement(tenantId);

    return {
      isActive: !ent.isBlocked || ent.subscriptionStatus !== 'EXPIRED',
      isTrial: ent.isTrial,
      planCode: ent.plan,
      planName: ent.planName,
      currentUsage: ent.currentUsage,
      maxLimit: ent.trialLimit,
      remaining: ent.remaining,
      isBlocked: ent.isBlocked,
      isWarning: ent.isWarning,
      expiresAt: ent.expiresAt,
      allowedBranches: ent.allowedBranches,
      allowedUsers: ent.allowedUsers
    };
  }

  /**
   * Safe set for QA sim testing only
   */
  static setDemoUsageOffset(offset: number) {
    UsageMeterService.setQaSimulationOffset(offset);
  }

  /**
   * Verified Set Active Plan (restricted/QA use)
   */
  static async setPlan(planCode: SubscriptionPlanCode, tenantId?: string) {
    await SubscriptionEntitlementService.applyVerifiedLicense({
      tenantId: tenantId || 'default-tenant',
      plan: planCode
    });
  }
}

