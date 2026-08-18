// server/modules/sync/sync-changelog.service.ts
// Change Log and Cursor-Based Delta Engine for Phase 8.3 Enterprise Synchronization

import { SyncChange } from "./sync.types";
import { prisma } from "../../database/prisma";

export class SyncChangelogService {
  // In-memory change log ring buffer for high performance with durable storage
  private static changes: SyncChange[] = [];
  private static cursorCounter: number = Date.now();
  private static MAX_IN_MEMORY_LOGS = 5000;

  /**
   * Generates next monotonic sequence cursor
   */
  private static getNextCursor(): number {
    this.cursorCounter++;
    return this.cursorCounter;
  }

  /**
   * Appends a new change record to the sync change log
   */
  static async recordChange(change: Omit<SyncChange, "id" | "cursor" | "createdAt">): Promise<SyncChange> {
    const cursor = this.getNextCursor();
    const id = `CHG-${cursor}-${Math.random().toString(36).substring(2, 7)}`;
    const createdAt = new Date().toISOString();

    const fullChange: SyncChange = {
      ...change,
      id,
      cursor,
      createdAt
    };

    this.changes.push(fullChange);

    // Keep memory footprint controlled
    if (this.changes.length > this.MAX_IN_MEMORY_LOGS) {
      this.changes.splice(0, this.changes.length - this.MAX_IN_MEMORY_LOGS);
    }

    // Persist to Prisma SyncEvent log if database is active
    if (prisma.isConnected && prisma.isConnected()) {
      try {
        await prisma.syncEvent.create({
          data: {
            eventId: id,
            clientTime: new Date(createdAt),
            userId: change.actorId,
            deviceId: change.deviceId,
            eventType: change.operation,
            entityType: change.entity,
            entityId: change.entityId,
            payload: change.payload as any,
            branchId: change.branchId || null
          }
        }).catch((err) => {
          console.warn("[SyncChangelog] Prisma sync event logging warning:", err.message);
        });
      } catch (err: any) {
        console.warn("[SyncChangelog] Event storage warning:", err.message);
      }
    }

    return fullChange;
  }

  /**
   * Pulls delta changes strictly filtered by tenantId, branchId, and cursor
   */
  static async getChangesSince(params: {
    tenantId: string;
    branchId?: string | null;
    cursor?: number | string;
    batchSize?: number;
    entities?: string[];
    userAllowedBranches?: string[];
  }): Promise<{
    changes: SyncChange[];
    cursor: number;
    nextCursor: number;
    hasMore: boolean;
  }> {
    const minCursor = typeof params.cursor === "number" 
      ? params.cursor 
      : (params.cursor ? parseInt(params.cursor, 10) : 0);
    const limit = Math.min(params.batchSize || 100, 500);

    // Filter in-memory changes strictly by tenant and branch isolation
    const matchedChanges = this.changes.filter((c) => {
      // 1. Strict Tenant Isolation
      if (c.tenantId !== params.tenantId) {
        return false;
      }

      // 2. Cursor filtering
      if (c.cursor <= minCursor) {
        return false;
      }

      // 3. Entity filter if requested
      if (params.entities && params.entities.length > 0 && !params.entities.includes(c.entity)) {
        return false;
      }

      // 4. Strict Branch Segregation:
      // - If change is branch-specific, check if device or user is authorized for that branch
      // - If change is tenant-wide (e.g. global product catalog or settings), allow
      if (c.branchId) {
        if (params.branchId && c.branchId !== params.branchId) {
          // If user has multi-branch access list, verify
          if (params.userAllowedBranches && params.userAllowedBranches.length > 0) {
            return params.userAllowedBranches.includes(c.branchId);
          }
          return false;
        }
      }

      return true;
    });

    // Sort by cursor ascending
    matchedChanges.sort((a, b) => a.cursor - b.cursor);

    const paginated = matchedChanges.slice(0, limit);
    const hasMore = matchedChanges.length > limit;
    const lastItem = paginated.length > 0 ? paginated[paginated.length - 1] : undefined;
    const nextCursor = lastItem ? lastItem.cursor : minCursor;

    return {
      changes: paginated,
      cursor: minCursor,
      nextCursor,
      hasMore
    };
  }

  /**
   * Retrieves the current highest cursor
   */
  static getCurrentCursor(): number {
    return this.cursorCounter;
  }
}
