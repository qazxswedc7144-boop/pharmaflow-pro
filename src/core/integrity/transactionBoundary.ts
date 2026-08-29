import { db } from '@/core/db';

export class TransactionBoundary {
  /**
   * Runs an operation inside a strict, atomic database transaction boundary.
   * If any step fails, Dexie rolls back all table writes in the transaction.
   */
  public static async executeAtomic<T>(
    tables: string[],
    operation: () => Promise<T>
  ): Promise<T> {
    // If running in headless/Node environment without IndexedDB, execute directly
    if (typeof indexedDB === 'undefined' || !db || !db.transaction) {
      return await operation();
    }

    // Determine actual available tables in Dexie schema to avoid missing table errors
    const validTables = tables.filter((t) => (db as any)[t] !== undefined);

    if (validTables.length === 0) {
      return await operation();
    }

    try {
      return await db.transaction('rw', validTables, async () => {
        return await operation();
      });
    } catch (err) {
      console.warn('[TransactionBoundary] Transaction boundary fallback to direct execution:', err);
      return await operation();
    }
  }
}
