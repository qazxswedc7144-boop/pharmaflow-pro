// src/features/purchases/services/smartImport/performance/matchingIndex.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.6: High-Performance Product Matching Index & Fuzzy Memoization
 */

import { Product } from '@/types';
import { ColumnIntelligence } from '../columnIntelligence';
import { ProductMatchCandidate } from '../productMatchingEngine';
import { ExtractedImportRow } from '../types';
import { BoundedLRUCache } from './boundedCache';
import { ENTERPRISE_IMPORT_LIMITS } from './importLimits';

export interface PrecomputedProductEntry {
  product: Product;
  rawName: string;
  exactLowerName: string;
  normalizedName: string;
  barcode?: string;
  code?: string;
  bigrams: Set<string>;
}

export class ProductMatchingIndex {
  private barcodeMap: Map<string, Product> = new Map();
  private codeMap: Map<string, Product> = new Map();
  private exactNameMap: Map<string, Product> = new Map();
  private normalizedNameMap: Map<string, Product> = new Map();
  private precomputedProducts: PrecomputedProductEntry[] = [];
  private fuzzyCache: BoundedLRUCache<string, ProductMatchCandidate | null>;

  constructor(products: Product[], cacheCapacity: number = ENTERPRISE_IMPORT_LIMITS.FUZZY_CACHE_CAPACITY) {
    this.fuzzyCache = new BoundedLRUCache<string, ProductMatchCandidate | null>({
      maxEntries: cacheCapacity,
      defaultTtlMs: 15 * 60 * 1000 // 15 mins session cache
    });

    this.buildIndex(products);
  }

  /**
   * Builds O(1) indexed maps and precomputes bigrams for fast fuzzy matching
   */
  private buildIndex(products: Product[]): void {
    for (const p of products) {
      if (p.Is_Active === false) continue;

      const pName = (p.name || p.Name || '').trim();
      const lowerName = pName.toLowerCase();
      const normName = ColumnIntelligence.normalizeHeader(pName);
      const barcode = (p.barcode || '').trim();
      const code = (p.id || (p as any).code || '').trim();

      if (barcode && !this.barcodeMap.has(barcode)) {
        this.barcodeMap.set(barcode, p);
      }
      if (code && !this.codeMap.has(code)) {
        this.codeMap.set(code, p);
      }
      if (lowerName && !this.exactNameMap.has(lowerName)) {
        this.exactNameMap.set(lowerName, p);
      }
      if (normName && !this.normalizedNameMap.has(normName)) {
        this.normalizedNameMap.set(normName, p);
      }

      // Precompute bigrams for fuzzy comparisons
      const bigrams = this.extractBigrams(normName || lowerName);
      this.precomputedProducts.push({
        product: p,
        rawName: pName,
        exactLowerName: lowerName,
        normalizedName: normName,
        barcode,
        code,
        bigrams
      });
    }
  }

  /**
   * Helper to extract character bigrams
   */
  private extractBigrams(str: string): Set<string> {
    const bigrams = new Set<string>();
    if (!str || str.length < 2) return bigrams;
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  }

  /**
   * Computes Dice similarity using precomputed bigrams
   */
  private calculateSimilarityPrecomputed(inputBigrams: Set<string>, inputNorm: string, targetEntry: PrecomputedProductEntry): number {
    if (inputNorm === targetEntry.normalizedName) return 1.0;
    if (inputBigrams.size === 0 || targetEntry.bigrams.size === 0) return 0;

    let intersection = 0;
    inputBigrams.forEach(bg => {
      if (targetEntry.bigrams.has(bg)) intersection++;
    });

    return (2.0 * intersection) / (inputBigrams.size + targetEntry.bigrams.size);
  }

  /**
   * Matches a single row against the indexed product database using strict 8-tier hierarchy
   */
  matchRow(
    row: ExtractedImportRow,
    learnedAliases: Record<string, string> = {}
  ): ProductMatchCandidate | null {
    const rawName = (row.productName || '').trim();
    const barcode = (row.barcode || '').trim();
    const code = (row.productCode || '').trim();

    if (!rawName && !barcode && !code) return null;

    // Tier 1: Exact Barcode match - O(1)
    if (barcode) {
      const barcodeMatch = this.barcodeMap.get(barcode);
      if (barcodeMatch) {
        return { product: barcodeMatch, matchType: 'BARCODE', score: 1.0 };
      }
    }

    // Tier 2: Exact Product Code match - O(1)
    if (code) {
      const codeMatch = this.codeMap.get(code);
      if (codeMatch) {
        return { product: codeMatch, matchType: 'CODE', score: 0.98 };
      }
    }

    // Tier 3: Exact Name Match - O(1)
    const lowerRaw = rawName.toLowerCase();
    const exactNameMatch = this.exactNameMap.get(lowerRaw);
    if (exactNameMatch) {
      return { product: exactNameMatch, matchType: 'EXACT', score: 0.99 };
    }

    // Tier 4: Normalized Name Match - O(1)
    const normInput = ColumnIntelligence.normalizeHeader(rawName);
    const normNameMatch = this.normalizedNameMap.get(normInput);
    if (normNameMatch) {
      return { product: normNameMatch, matchType: 'NORMALIZED', score: 0.95 };
    }

    // Tier 5: Learned Alias Match
    if (learnedAliases) {
      const target = learnedAliases[rawName] || learnedAliases[normInput];
      if (target) {
        const targetLower = target.toLowerCase();
        const targetNorm = ColumnIntelligence.normalizeHeader(target);

        const aliasMatch = this.exactNameMap.get(targetLower) || 
                           this.codeMap.get(target) || 
                           this.normalizedNameMap.get(targetNorm);

        if (aliasMatch) {
          return { product: aliasMatch, matchType: 'ALIAS', score: 0.92 };
        }
      }
    }

    // Tier 6: Memoized Fuzzy Similarity Match (Threshold >= 0.70)
    // Check fuzzy cache first to prevent repeated bigram calculations across rows
    const cacheKey = `fz:${normInput}`;
    if (this.fuzzyCache.has(cacheKey)) {
      return this.fuzzyCache.get(cacheKey);
    }

    let bestFuzzy: Product | null = null;
    let bestScore = 0;
    const inputBigrams = this.extractBigrams(normInput || lowerRaw);

    for (const entry of this.precomputedProducts) {
      const score = this.calculateSimilarityPrecomputed(inputBigrams, normInput, entry);
      if (score > bestScore) {
        bestScore = score;
        bestFuzzy = entry.product;
        // Early exit on near-perfect similarity
        if (bestScore >= 0.98) break;
      }
    }

    let result: ProductMatchCandidate | null = null;
    if (bestFuzzy && bestScore >= 0.70) {
      result = { product: bestFuzzy, matchType: 'FUZZY', score: Math.round(bestScore * 100) / 100 };
    }

    this.fuzzyCache.set(cacheKey, result);
    return result;
  }

  /**
   * Clears internal caches
   */
  clearCache(): void {
    this.fuzzyCache.clear();
  }

  /**
   * Total indexed items
   */
  get size(): number {
    return this.precomputedProducts.length;
  }
}
