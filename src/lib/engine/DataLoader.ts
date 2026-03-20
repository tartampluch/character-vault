/**
 * @file DataLoader.ts
 * @description Rule source loader and Merge Engine for JSON feature data.
 *
 * STUB (Phase 3.2 use): This file provides the DataLoader interface and a minimal
 * in-memory cache so that the GameEngine can compile and reference it.
 * The full implementation (fetch from static/rules/, merge engine, config tables)
 * is built in Phase 4.2. This stub returns empty/null results so the engine
 * compiles and runs without crashing, with the DAG gracefully handling missing data.
 *
 * Full implementation details: @see ARCHITECTURE.md sections 18 (Data Override Engine).
 *
 * @see Phase 4.2 for the complete implementation including:
 *   - Alphabetical file loading from static/rules/
 *   - Merge Engine (replace/partial merge with -prefix deletion)
 *   - Config table loading (XP thresholds, carrying capacity, skill definitions)
 *   - enabledRuleSources filtering
 */

import type { Feature } from '../types/feature';
import type { ID } from '../types/primitives';

// =============================================================================
// CONFIG TABLE — Lookup table structure loaded from JSON
// =============================================================================

/**
 * A named lookup table from a JSON rules file.
 * Examples: XP thresholds per level, carrying capacity by STR score,
 *           point buy costs, size modifiers, skill synergy table.
 *
 * `tableId` is the unique identifier referenced by the engine.
 * `data` is an array of arbitrary data rows (typed by the consuming code).
 *
 * @example XP threshold table:
 * ```json
 * { "tableId": "config_xp_thresholds", "ruleSource": "srd_core",
 *   "data": [{"level": 1, "xpRequired": 0}, {"level": 2, "xpRequired": 1000}, ...] }
 * ```
 */
export interface ConfigTable {
  tableId: ID;
  ruleSource: ID;
  description?: string;
  data: Record<string, unknown>[];
}

// =============================================================================
// DATA LOADER CLASS
// =============================================================================

/**
 * The DataLoader is responsible for:
 *   1. Loading JSON rule source files (from static/rules/ or the PHP API).
 *   2. Merging features according to the Merge Engine rules (replace/partial).
 *   3. Filtering features by CampaignSettings.enabledRuleSources.
 *   4. Caching features and config tables in memory for fast access.
 *   5. Providing a lookup API for the GameEngine (getFeature, getConfigTable, etc.).
 *
 * PHASE 3.2 STUB:
 *   This stub has an empty in-memory cache and no loading logic.
 *   The GameEngine's DAG phases call getFeature() and receive `undefined`,
 *   which the engine handles gracefully (skipping unavailable features).
 *   Once Phase 4.2 fills in the loading logic, everything starts working.
 */
export class DataLoader {
  /**
   * In-memory feature cache. Key: feature ID, Value: merged Feature object.
   * Populated by `loadRuleSources()` in Phase 4.2.
   */
  private featureCache = new Map<ID, Feature>();

  /**
   * In-memory config table cache. Key: tableId, Value: ConfigTable object.
   * Populated by `loadRuleSources()` in Phase 4.2.
   */
  private configTableCache = new Map<string, ConfigTable>();

  /**
   * Whether the DataLoader has completed its initial load.
   * `false` during startup; `true` once all rule sources are loaded.
   */
  isLoaded = false;

  /**
   * Retrieves a Feature by its ID from the in-memory cache.
   *
   * Returns `undefined` if the feature is not in the cache (not yet loaded,
   * or from a disabled rule source). The GameEngine handles `undefined` gracefully
   * by skipping that feature during DAG evaluation.
   *
   * @param id - The feature ID to look up (e.g., "race_elf", "feat_power_attack").
   * @returns The merged Feature object, or `undefined` if not found.
   */
  getFeature(id: ID): Feature | undefined {
    return this.featureCache.get(id);
  }

  /**
   * Retrieves all features in the cache (for catalog views, feat lists, etc.).
   * Returns the values of the entire feature cache as an array.
   *
   * @returns Array of all loaded Feature objects.
   */
  getAllFeatures(): Feature[] {
    return Array.from(this.featureCache.values());
  }

  /**
   * Retrieves features matching a simple tag or category query.
   * Used by the FeatureChoice `optionsQuery` resolver.
   *
   * Supported query formats:
   *   - "tag:<tag_name>"            : Features with this tag.
   *   - "category:<category_name>"  : Features of this category.
   *   - "tag:<t1>+tag:<t2>"         : Features with ALL listed tags.
   *
   * @param query - The optionsQuery string from FeatureChoice.
   * @returns Array of matching Feature objects.
   */
  queryFeatures(query: string): Feature[] {
    const allFeatures = this.getAllFeatures();
    const conditions = query.split('+').map(s => s.trim());

    return allFeatures.filter(feature => {
      return conditions.every(condition => {
        if (condition.startsWith('tag:')) {
          const tag = condition.slice(4);
          return feature.tags.includes(tag);
        }
        if (condition.startsWith('category:')) {
          const category = condition.slice(9);
          return feature.category === category;
        }
        // Unknown query format: fail silently
        console.warn(`[DataLoader] Unknown query format: "${condition}"`);
        return false;
      });
    });
  }

  /**
   * Retrieves a configuration lookup table by its tableId.
   * Returns `undefined` if the table is not loaded.
   *
   * @param tableId - The config table identifier (e.g., "config_xp_thresholds").
   * @returns The ConfigTable, or `undefined` if not found.
   */
  getConfigTable(tableId: string): ConfigTable | undefined {
    return this.configTableCache.get(tableId);
  }

  /**
   * Directly adds a feature to the cache.
   * Used by tests (Phase 17) and by the full Phase 4.2 loader implementation.
   *
   * @param feature - The Feature to add/update in the cache.
   */
  cacheFeature(feature: Feature): void {
    this.featureCache.set(feature.id, feature);
  }

  /**
   * Directly adds a config table to the cache.
   * Used by tests (Phase 17) and by the full Phase 4.2 loader implementation.
   *
   * @param table - The ConfigTable to add/update in the cache.
   */
  cacheConfigTable(table: ConfigTable): void {
    this.configTableCache.set(table.tableId, table);
  }

  /**
   * Clears all cached data. Used for testing and when changing campaigns.
   */
  clearCache(): void {
    this.featureCache.clear();
    this.configTableCache.clear();
    this.isLoaded = false;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

/**
 * The single shared DataLoader instance.
 * The GameEngine and all UI components use this to look up feature data.
 *
 * In tests, create a fresh instance instead of using this singleton to avoid
 * cross-test pollution: `const loader = new DataLoader();`
 */
export const dataLoader = new DataLoader();
