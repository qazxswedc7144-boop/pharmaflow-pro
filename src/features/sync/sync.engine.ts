// ==========================================
// FILE: src/modules/sync/sync.engine.ts
// ==========================================

import Dexie from 'dexie';
import { LocalSyncQueueItem } from './sync.types';
import { SYNC_CONFIG } from './sync.constants';
import { PharmaFlowDexieExtension } from './sync.queue';
import { getSyncActions } from './sync.events';
import { getCurrentUserSession } from '@/core/db';

export class DistributedSyncEngine {
  private db: Dexie & PharmaFlowDexieExtension;
  private isProcessing = false;
  private timerId: any = null;
  private lastSyncTime: number = 0;

  constructor(dexieInstance: unknown) {
    this.db = dexieInstance as Dexie & PharmaFlowDexieExtension;
  }

  public start(): void {
    if (this.timerId) return;
    
    window.addEventListener('online', this.handleNetworkChange);
    window.addEventListener('offline', this.handleNetworkChange);
    
    this.timerId = setInterval(() => {
      this.drainQueue();
      this.pullSync();
    }, SYNC_CONFIG.POLLING_INTERVAL_MS);

    // Initial sync run on boot
    this.drainQueue();
    this.pullSync();
  }

  public stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    window.removeEventListener('online', this.handleNetworkChange);
    window.removeEventListener('offline', this.handleNetworkChange);
  }

  private handleNetworkChange = (): void => {
    const actions = getSyncActions();
    if (navigator.onLine) {
      actions.setNetworkStatus('ONLINE');
      this.drainQueue();
      this.pullSync();
    } else {
      actions.setNetworkStatus('OFFLINE');
    }
  };

  /**
   * Pull server updates (sales/invoices & inventory/products) to keep local Dexie DB updated for offline browsing.
   */
  public async pullSync(): Promise<void> {
    if (!navigator.onLine) return;

    try {
      const session = getCurrentUserSession();
      const response = await fetch('/api/v1/sync/pull', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Tenant-ID': session.tenantId,
          'X-Branch-ID': session.branchId || '',
          'X-User-ID': session.userId
        },
        body: JSON.stringify({ 
          tenantId: session.tenantId,
          branchId: session.branchId,
          userId: session.userId,
          lastSyncTimestamp: this.lastSyncTime 
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.delta) {
          const { products, invoices } = data.delta;
          
          if (Array.isArray(products) && products.length > 0 && (this.db as any).products) {
            await (this.db as any).products.bulkPut(products.map((p: any) => ({
              ...p,
              tenantId: p.tenantId || session.tenantId,
              is_synced: 1,
              isSynced: true,
              syncStatus: 'SYNCED',
              updatedAt: p.updatedAt || new Date().toISOString()
            }))).catch((err: any) => console.warn('[SyncEngine] Product pull update warning:', err));
          }

          if (Array.isArray(invoices) && invoices.length > 0 && (this.db as any).invoices) {
            await (this.db as any).invoices.bulkPut(invoices.map((inv: any) => ({
              ...inv,
              tenantId: inv.tenantId || session.tenantId,
              branchId: inv.branchId || session.branchId,
              is_synced: 1,
              isSynced: true,
              syncStatus: 'SYNCED',
              updatedAt: inv.updatedAt || new Date().toISOString()
            }))).catch((err: any) => console.warn('[SyncEngine] Invoice pull update warning:', err));
          }

          if (data.serverTime) {
            this.lastSyncTime = data.serverTime;
          }
        }
      }
    } catch (error) {
      console.warn('[SyncEngine] Downstream pull sync skipped:', (error as Error).message);
    }
  }

  public async drainQueue(): Promise<void> {
    if (this.isProcessing || !navigator.onLine) return;
    this.isProcessing = true;
    const actions = getSyncActions();
    actions.setQueueDraining(true);

    try {
      // 1. Drain syncQueue table
      if (this.db.syncQueue) {
        let hasMore = true;
        while (hasMore) {
          const batch = await this.db.syncQueue
            .where('[syncStatus+createdAt]')
            .between(['PENDING', Dexie.minKey], ['PENDING', Dexie.maxKey])
            .limit(SYNC_CONFIG.BATCH_CHUNK_SIZE)
            .toArray()
            .catch(() => []);

          if (batch.length === 0) {
            hasMore = false;
            break;
          }

          for (const mutation of batch) {
            await this.processMutationWithRetry(mutation);
          }
        }
      }

      // 2. Drain outbox table for compatible events
      if ((this.db as any).outbox) {
        const outboxEvents = await (this.db as any).outbox
          .where('status')
          .anyOf('PENDING', 'pending', 'RETRYING')
          .toArray()
          .catch(() => []);

        for (const event of outboxEvents) {
          await this.processOutboxEvent(event);
        }
      }

    } finally {
      this.isProcessing = false;
      actions.setQueueDraining(false);
    }
  }

  private async processOutboxEvent(event: any): Promise<void> {
    try {
      const session = getCurrentUserSession();
      await (this.db as any).outbox.update(event.id, { status: 'SENDING', updatedAt: new Date().toISOString() });
      
      const response = await fetch('/api/v1/sync/push', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Tenant-ID': session.tenantId,
          'X-Branch-ID': session.branchId || '',
          'X-User-ID': session.userId
        },
        body: JSON.stringify({
          tenantId: session.tenantId,
          branchId: session.branchId,
          userId: session.userId,
          mutations: [{
            id: event.mutationId || String(event.id),
            type: event.type || 'MUTATION',
            payload: event.payload || {},
            idempotencyKey: event.idempotencyKey || event.mutationId || String(event.id)
          }]
        })
      });

      if (response.ok) {
        await (this.db as any).outbox.update(event.id, { status: 'CONFIRMED', updatedAt: new Date().toISOString() });
      } else {
        await (this.db as any).outbox.update(event.id, { status: 'FAILED', updatedAt: new Date().toISOString() });
      }
    } catch (err) {
      await (this.db as any).outbox.update(event.id, { status: 'RETRYING', updatedAt: new Date().toISOString() });
    }
  }

  private async processMutationWithRetry(mutation: LocalSyncQueueItem): Promise<void> {
    await this.db.syncQueue.update(mutation.id!, { syncStatus: 'PROCESSING', updatedAt: new Date() });

    let delay: number = SYNC_CONFIG.BACKOFF_INITIAL_DELAY_MS;
    const session = getCurrentUserSession();
    
    while (mutation.retryCount <= SYNC_CONFIG.MAX_RETRY_ATTEMPTS) {
      try {
        const response = await fetch('/api/v1/sync/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': session.tenantId,
            'X-Branch-ID': session.branchId || '',
            'X-User-ID': session.userId,
            'X-Device-ID': mutation.deviceId || 'local-device',
            'X-Session-ID': mutation.sessionId || 'local-session',
            'X-Correlation-ID': mutation.correlationId || 'local-correlation',
          },
          body: JSON.stringify({
            tenantId: session.tenantId,
            branchId: session.branchId,
            userId: session.userId,
            mutations: [{
              id: mutation.mutationId,
              type: mutation.operationType || mutation.entityType || 'SAVE',
              payload: mutation.payload,
              idempotencyKey: mutation.idempotencyKey || mutation.mutationId
            }]
          }),
        });

        if (response.ok) {
          await this.db.syncQueue.delete(mutation.id!);

          // Mark local record as synced
          if (mutation.payload && (mutation.payload as any).id) {
            const entityId = (mutation.payload as any).id;
            const eType = String(mutation.entityType);
            if (eType === 'SALE' || eType === 'INVOICE' || eType === 'invoice') {
              if ((this.db as any).invoices) {
                await (this.db as any).invoices.update(entityId, {
                  is_synced: 1,
                  isSynced: true,
                  syncStatus: 'SYNCED',
                  updatedAt: new Date().toISOString()
                }).catch(() => null);
              }
            } else if (eType === 'PRODUCT' || eType === 'product') {
              if ((this.db as any).products) {
                await (this.db as any).products.update(entityId, {
                  is_synced: 1,
                  isSynced: true,
                  syncStatus: 'SYNCED',
                  updatedAt: new Date().toISOString()
                }).catch(() => null);
              }
            }
          }
          return;
        }

        const errPayload = await response.json().catch(() => ({}));
        
        if (response.status === 409 || errPayload.errorType === 'CONFLICT') {
          await this.handleConflict(mutation, errPayload.reason || 'Sovereign cloud ledger conflict detected');
          return;
        }

        throw new Error(`Server returned status: ${response.status}`);

      } catch (error) {
        mutation.retryCount++;
        await this.db.syncQueue.update(mutation.id!, { retryCount: mutation.retryCount, updatedAt: new Date() });

        if (mutation.retryCount > SYNC_CONFIG.MAX_RETRY_ATTEMPTS) {
          await this.db.syncQueue.update(mutation.id!, { syncStatus: 'FAILED', updatedAt: new Date() });
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, SYNC_CONFIG.BACKOFF_MAX_DELAY_MS);
      }
    }
  }

  private async handleConflict(mutation: LocalSyncQueueItem, reason: string): Promise<void> {
    await this.db.transaction('rw', [this.db.syncQueue, this.db.failedMutations], async () => {
      await this.db.failedMutations.add({
        mutationId: mutation.mutationId,
        reason: reason,
        payload: mutation.payload,
        createdAt: new Date(),
      });
      await this.db.syncQueue.update(mutation.id!, {
        syncStatus: 'CONFLICT',
        updatedAt: new Date(),
      });
    });
  }
}

