/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.5 / 2.6: Tenant-Scoped Extraction Cache
 *
 * Safe in-memory cache for Smart Import extraction results.
 *
 * Architecture guarantees:
 * - Tenant isolation
 * - Branch isolation
 * - Document fingerprinting
 * - TTL expiration
 * - Bounded LRU eviction
 * - Defensive cloning
 * - No database writes
 * - No UI dependencies
 */

import type { CanonicalImportDocument } from '../types';

/**
 * Options used when reading from the extraction cache.
 */
export interface ExtractionCacheLookupOptions {
  tenantId: string;
  branchId: string;
  forceReprocess?: boolean;
}

/**
 * Options used when saving an extraction result.
 */
export interface ExtractionCacheSaveOptions {
  tenantId: string;
  branchId: string;
  providerName: string;
  confidence?: number;
}

/**
 * Public cached extraction result.
 */
export interface CachedExtractionDocument {
  document: CanonicalImportDocument;
  providerName: string;
  confidence?: number;
  createdAt: number;
  cacheKey: string;
}

/**
 * Internal cache entry.
 */
interface InternalCacheEntry extends CachedExtractionDocument {
  lastAccessedAt: number;
  sizeBytes: number;
}

/**
 * Central extraction cache service.
 *
 * This service intentionally keeps extracted Smart Import documents
 * isolated by tenant and branch.
 *
 * It is a cache only and must never become a source of truth.
 */
export class ExtractionCacheService {
  /**
   * Maximum number of cached documents.
   */
  private static readonly MAX_ENTRIES = 50;

  /**
   * Maximum memory used by the cache.
   */
  private static readonly MAX_SIZE_BYTES = 25 * 1024 * 1024;

  /**
   * Cache entry lifetime: 30 minutes.
   */
  private static readonly TTL_MS = 30 * 60 * 1000;

  /**
   * In-memory LRU cache.
   */
  private static cache = new Map<string, InternalCacheEntry>();

  /**
   * Current estimated cache memory usage.
   */
  private static currentSizeBytes = 0;

  /**
   * Retrieves a cached extraction result.
   *
   * Returns null when:
   * - forceReprocess is enabled
   * - no matching cache entry exists
   * - cache entry has expired
   */
  public static async getCachedDocument(
    file: File | string,
    options: ExtractionCacheLookupOptions
  ): Promise<CachedExtractionDocument | null> {
    if (options.forceReprocess) {
      return null;
    }

    const cacheKey = await this.createCacheKey(
      file,
      options.tenantId,
      options.branchId
    );

    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return null;
    }

    if (this.isExpired(entry)) {
      this.deleteByKey(cacheKey);
      return null;
    }

    /**
     * Refresh LRU position.
     */
    entry.lastAccessedAt = Date.now();

    this.cache.delete(cacheKey);
    this.cache.set(cacheKey, entry);

    return this.toPublicEntry(entry);
  }

  /**
   * Saves a successful extraction result into the cache.
   *
   * Cache is isolated by:
   * tenantId + branchId + document fingerprint
   */
  public static async saveCachedDocument(
    file: File | string,
    document: CanonicalImportDocument,
    options: ExtractionCacheSaveOptions
  ): Promise<void> {
    const cacheKey = await this.createCacheKey(
      file,
      options.tenantId,
      options.branchId
    );

    /**
     * Defensive clone prevents future mutations of the original
     * extraction result from mutating the cached version.
     */
    const clonedDocument = this.cloneDocument(document);

    const sizeBytes = this.estimateSizeBytes(clonedDocument);

    /**
     * Never cache a single document larger than the entire cache budget.
     */
    if (sizeBytes > this.MAX_SIZE_BYTES) {
      return;
    }

    /**
     * Replace existing entry if present.
     */
    this.deleteByKey(cacheKey);

    /**
     * Evict least recently used entries until enough space exists.
     */
    while (
      this.cache.size >= this.MAX_ENTRIES ||
      this.currentSizeBytes + sizeBytes > this.MAX_SIZE_BYTES
    ) {
      const evicted = this.evictLeastRecentlyUsed();

      if (!evicted) {
        break;
      }
    }

    /**
     * Final memory safety guard.
     */
    if (this.currentSizeBytes + sizeBytes > this.MAX_SIZE_BYTES) {
      return;
    }

    const now = Date.now();

    const entry: InternalCacheEntry = {
      document: clonedDocument,
      providerName: options.providerName,
      ...(options.confidence !== undefined
        ? { confidence: options.confidence }
        : {}),
      createdAt: now,
      cacheKey,
      lastAccessedAt: now,
      sizeBytes
    };

    this.cache.set(cacheKey, entry);
    this.currentSizeBytes += sizeBytes;
  }

  /**
   * Invalidates one specific document cache entry.
   */
  public static async invalidateDocument(
    file: File | string,
    scope: {
      tenantId: string;
      branchId: string;
    }
  ): Promise<boolean> {
    const cacheKey = await this.createCacheKey(
      file,
      scope.tenantId,
      scope.branchId
    );

    return this.deleteByKey(cacheKey);
  }

  /**
   * Removes all cached documents for a tenant.
   *
   * Optionally restricts removal to a single branch.
   */
  public static clearTenantCache(
    tenantId: string,
    branchId?: string
  ): number {
    let removed = 0;

    const normalizedTenantId = this.normalizeScope(tenantId);
    const normalizedBranchId = branchId
      ? this.normalizeScope(branchId)
      : undefined;

    for (const [key] of this.cache.entries()) {
      const isTenantMatch = key.startsWith(
        `tenant:${normalizedTenantId}|`
      );

      const isBranchMatch =
        normalizedBranchId === undefined ||
        key.includes(`|branch:${normalizedBranchId}|`);

      if (isTenantMatch && isBranchMatch) {
        if (this.deleteByKey(key)) {
          removed += 1;
        }
      }
    }

    return removed;
  }

  /**
   * Clears the complete in-memory cache.
   *
   * Intended for:
   * - explicit session reset
   * - test cleanup
   * - controlled maintenance
   */
  public static clearAll(): void {
    this.cache.clear();
    this.currentSizeBytes = 0;
  }

  /**
   * Returns cache diagnostics without exposing cached documents.
   */
  public static getStats(): {
    count: number;
    sizeBytes: number;
    maxEntries: number;
    maxSizeBytes: number;
    ttlMs: number;
  } {
    this.pruneExpiredEntries();

    return {
      count: this.cache.size,
      sizeBytes: this.currentSizeBytes,
      maxEntries: this.MAX_ENTRIES,
      maxSizeBytes: this.MAX_SIZE_BYTES,
      ttlMs: this.TTL_MS
    };
  }

  /**
   * Creates a tenant-scoped and branch-scoped cache key.
   */
  private static async createCacheKey(
    file: File | string,
    tenantId: string,
    branchId: string
  ): Promise<string> {
    const fingerprint = await this.createDocumentFingerprint(file);

    return [
      `tenant:${this.normalizeScope(tenantId)}`,
      `branch:${this.normalizeScope(branchId)}`,
      `document:${fingerprint}`
    ].join('|');
  }

  /**
   * Creates a stable document fingerprint.
   *
   * File:
   * metadata hash + content hash
   *
   * String:
   * content hash
   */
  private static async createDocumentFingerprint(
    file: File | string
  ): Promise<string> {
    if (typeof file === 'string') {
      return this.hashText(file);
    }

    const buffer = await file.arrayBuffer();

    const contentHash = await this.hashBytes(
      new Uint8Array(buffer)
    );

    const metadata = [
      file.name,
      file.type,
      file.size,
      file.lastModified
    ].join('|');

    const metadataHash = await this.hashText(metadata);

    return `${metadataHash}:${contentHash}`;
  }

  /**
   * Hashes text using SHA-256 when available.
   */
  private static async hashText(value: string): Promise<string> {
    const bytes = new TextEncoder().encode(value);

    return this.hashBytes(bytes);
  }

  /**
   * Hashes bytes.
   *
   * Primary:
   * Web Crypto SHA-256
   *
   * Fallback:
   * Deterministic FNV-style hash
   */
  private static async hashBytes(
    data: Uint8Array
  ): Promise<string> {
    if (
      typeof globalThis.crypto !== 'undefined' &&
      globalThis.crypto.subtle
    ) {
      /**
       * Create a clean ArrayBuffer copy for maximum
       * TypeScript / WebCrypto compatibility.
       */
      const copy = new Uint8Array(data.byteLength);
      copy.set(data);

      const digest = await globalThis.crypto.subtle.digest(
        'SHA-256',
        copy.buffer
      );

      return Array.from(new Uint8Array(digest))
        .map((byte) =>
          byte.toString(16).padStart(2, '0')
        )
        .join('');
    }

    /**
     * Safe deterministic fallback.
     */
    let hash = 2166136261;

    for (const byte of data) {
      hash ^= byte;
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0)
      .toString(16)
      .padStart(8, '0');
  }

  /**
   * Checks TTL expiration.
   */
  private static isExpired(
    entry: InternalCacheEntry
  ): boolean {
    return Date.now() - entry.createdAt > this.TTL_MS;
  }

  /**
   * Removes expired entries.
   */
  private static pruneExpiredEntries(): void {
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.deleteByKey(key);
      }
    }
  }

  /**
   * Evicts the least recently used cache entry.
   *
   * Map insertion order is maintained by re-inserting
   * entries whenever they are accessed.
   */
  private static evictLeastRecentlyUsed(): boolean {
    const oldestKey = this.cache.keys().next().value as
      | string
      | undefined;

    if (!oldestKey) {
      return false;
    }

    return this.deleteByKey(oldestKey);
  }

  /**
   * Deletes an entry and updates memory accounting.
   */
  private static deleteByKey(
    cacheKey: string
  ): boolean {
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return false;
    }

    this.currentSizeBytes = Math.max(
      0,
      this.currentSizeBytes - entry.sizeBytes
    );

    return this.cache.delete(cacheKey);
  }

  /**
   * Estimates object memory size.
   */
  private static estimateSizeBytes(
    value: unknown
  ): number {
    try {
      return new TextEncoder()
        .encode(JSON.stringify(value))
        .byteLength;
    } catch {
      /**
       * Conservative fallback.
       */
      return 1024;
    }
  }

  /**
   * Defensive deep clone.
   */
  private static cloneDocument(
    document: CanonicalImportDocument
  ): CanonicalImportDocument {
    if (typeof globalThis.structuredClone === 'function') {
      return globalThis.structuredClone(document);
    }

    return JSON.parse(
      JSON.stringify(document)
    ) as CanonicalImportDocument;
  }

  /**
   * Returns a cloned public result.
   *
   * Never expose the internal cached object directly.
   */
  private static toPublicEntry(
    entry: InternalCacheEntry
  ): CachedExtractionDocument {
    return {
      document: this.cloneDocument(entry.document),
      providerName: entry.providerName,
      ...(entry.confidence !== undefined
        ? { confidence: entry.confidence }
        : {}),
      createdAt: entry.createdAt,
      cacheKey: entry.cacheKey
    };
  }

  /**
   * Normalizes tenant and branch identifiers.
   */
  private static normalizeScope(
    value: string
  ): string {
    return value.trim();
  }
}
