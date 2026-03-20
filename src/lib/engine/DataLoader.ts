/**
 * @file DataLoader.ts
 * @description Rule source loader and Merge Engine for JSON feature data.
 *
 * Design philosophy:
 *   The DataLoader is the bridge between the JSON rule files in `static/rules/`
 *   and the GameEngine's feature cache. It has three responsibilities:
 *
 *   1. LOADING: Fetch JSON files from `static/rules/` (via SvelteKit's asset serving
 *      in development, or via a PHP API endpoint in production). Files are loaded
 *      in ALPHABETICAL ORDER by path — this determines override priority (last wins).
 *
 *   2. MERGING: Apply the Merge Engine to handle `merge: "partial"` entities.
 *      Full specification: ARCHITECTURE.md section 18.
 *
 *   3. FILTERING: After loading, filter entities by `CampaignSettings.enabledRuleSources`.
 *      Only features and config tables whose `ruleSource` matches an enabled source ID
 *      are retained in the cache.
 *
 * FILE DISCOVERY:
 *   In development (SvelteKit), we use a rules manifest file (`static/rules/manifest.json`)
 *   that lists all available rule files in sorted order. This manifest is generated at
 *   build time (or manually maintained during development).
 *
 *   Alternative: The PHP backend provides `GET /api/rules/list` in production.
 *   The DataLoader detects which mode to use based on the environment.
 *
 * MERGE ENGINE:
 *   When a Feature with the same `id` as an existing Feature is encountered:
 *   - `merge: "replace"` (or absent): Full overwrite. New entity replaces old.
 *   - `merge: "partial"`:
 *     - Arrays: appended. Items prefixed with "-" are removed from existing.
 *     - Scalars: overwritten only if defined in the new entity.
 *     - `levelProgression`: merged by level (same level replaces that entry).
 *     - `choices`: merged by choiceId (same choiceId replaces).
 *     - `prerequisitesNode`: fully replaced if present.
 *
 * CONFIG TABLE HANDLING:
 *   Entities with a `tableId` field (instead of `id` + `category`) are stored
 *   in the config table cache. They always use "replace" semantics (no partial merge).
 *
 * @see ARCHITECTURE.md section 18 for data override engine specification.
 */

import type { Feature, MergeStrategy, LevelProgressionEntry, FeatureChoice } from '../types/feature';
import type { ID } from '../types/primitives';

// =============================================================================
// CONFIG TABLE — Lookup table structure loaded from JSON
// =============================================================================

/**
 * A named lookup table from a JSON rules file.
 * Examples: XP thresholds per level, carrying capacity by STR score,
 *           point buy costs, size modifiers, skill synergy table.
 */
export interface ConfigTable {
  tableId: ID;
  ruleSource: ID;
  description?: string;
  data: Record<string, unknown>[];
}

// =============================================================================
// RAW JSON ENTITY — The raw parsed JSON before type narrowing
// =============================================================================

/**
 * Represents any entity parsed from a JSON rules file before being categorised.
 * The `tableId` field distinguishes config tables from feature entities.
 */
interface RawEntity {
  // Feature fields
  id?: ID;
  category?: string;
  ruleSource?: ID;
  merge?: MergeStrategy;
  tags?: string[];
  grantedFeatures?: ID[];
  grantedModifiers?: unknown[];
  levelProgression?: LevelProgressionEntry[];
  choices?: FeatureChoice[];
  forbiddenTags?: string[];
  recommendedAttributes?: ID[];
  classSkills?: ID[];
  // Config table fields
  tableId?: string;
  data?: Record<string, unknown>[];
  // Any other fields (spread for flexible merging)
  [key: string]: unknown;
}

// =============================================================================
// MERGE ENGINE — Implementation
// =============================================================================

/**
 * Merges a partial Feature update into an existing Feature.
 *
 * PARTIAL MERGE RULES (D&D 3.5 Data Override System):
 *   Arrays (tags, grantedFeatures, grantedModifiers, forbiddenTags, etc.):
 *     - New items are APPENDED.
 *     - Items prefixed with "-" are REMOVED.
 *     Example: tags: ["race_dragon", "-race_humanoid"] → appends race_dragon, removes race_humanoid.
 *
 *   `levelProgression`:
 *     - Merged by level. Same level number → entry is REPLACED. New levels are ADDED.
 *
 *   `choices`:
 *     - Merged by choiceId. Same choiceId → choice is REPLACED. New choiceIds are ADDED.
 *     - Choices prefixed with "-" in the choiceId are REMOVED.
 *
 *   Scalars (label, description, school, range, etc.):
 *     - Only overwritten if defined in the partial entity.
 *
 *   `id`, `category`:
 *     - NOT modifiable. Ignored if present in a partial override.
 *
 *   `prerequisitesNode`:
 *     - Fully replaced if present in the partial (too complex to merge).
 *
 * @param existing - The base entity already in the cache.
 * @param partial  - The new partial entity to merge into the existing one.
 * @returns The merged entity.
 */
function mergePartial(existing: RawEntity, partial: RawEntity): RawEntity {
  // Start with a shallow copy of the existing entity
  const result: RawEntity = { ...existing };

  for (const [key, partialValue] of Object.entries(partial)) {
    // Skip non-modifiable fields
    if (key === 'id' || key === 'category') continue;

    // Skip undefined/null values in the partial
    if (partialValue === undefined || partialValue === null) continue;

    // --- Special handling for levelProgression ---
    if (key === 'levelProgression' && Array.isArray(partialValue) && Array.isArray(existing.levelProgression)) {
      result.levelProgression = mergeLevelProgression(existing.levelProgression, partialValue);
      continue;
    }

    // --- Special handling for choices ---
    if (key === 'choices' && Array.isArray(partialValue) && Array.isArray(existing.choices)) {
      result.choices = mergeChoices(existing.choices as FeatureChoice[], partialValue as FeatureChoice[]);
      continue;
    }

    // --- Special handling for arrays with -prefix deletion ---
    if (Array.isArray(partialValue) && Array.isArray(existing[key])) {
      const existingArray = existing[key] as unknown[];
      result[key] = mergeArray(existingArray, partialValue);
      continue;
    }

    // --- Scalar fields: overwrite with partial value ---
    result[key] = partialValue;
  }

  return result;
}

/**
 * Merges two arrays with the -prefix deletion convention.
 * Items prefixed with "-" are removed from the existing array.
 * New items (not prefixed with "-") are appended.
 *
 * @param existing   - The existing array in the base entity.
 * @param partialArr - The new array from the partial entity.
 * @returns The merged array.
 */
function mergeArray(existing: unknown[], partialArr: unknown[]): unknown[] {
  // Start with existing items
  let result = [...existing];

  for (const item of partialArr) {
    if (typeof item === 'string' && item.startsWith('-')) {
      // Remove the item (strip the "-" prefix to get the actual value)
      const targetValue = item.slice(1);
      result = result.filter(existingItem => existingItem !== targetValue);
    } else {
      // Append the new item (only if not already present)
      if (!result.includes(item)) {
        result.push(item);
      }
    }
  }

  return result;
}

/**
 * Merges level progression tables by level number.
 * Entries with the same level number from the partial REPLACE the existing entry.
 * New levels are ADDED.
 *
 * @param existing      - Existing levelProgression entries.
 * @param partialLevels - New levelProgression entries from the partial.
 * @returns Merged levelProgression array.
 */
function mergeLevelProgression(
  existing: LevelProgressionEntry[],
  partialLevels: LevelProgressionEntry[]
): LevelProgressionEntry[] {
  // Build a map from level → entry for fast lookup
  const levelMap = new Map<number, LevelProgressionEntry>(
    existing.map(entry => [entry.level, entry])
  );

  // Apply partial levels (same level = replace, new level = add)
  for (const partialEntry of partialLevels) {
    levelMap.set(partialEntry.level, partialEntry);
  }

  // Convert map back to sorted array
  return Array.from(levelMap.values()).sort((a, b) => a.level - b.level);
}

/**
 * Merges feature choices by choiceId.
 * Choices with the same choiceId from the partial REPLACE the existing choice.
 * Choices with a "-" prefix in choiceId are REMOVED.
 * New choiceIds are ADDED.
 *
 * @param existing       - Existing FeatureChoice entries.
 * @param partialChoices - New FeatureChoice entries from the partial.
 * @returns Merged choices array.
 */
function mergeChoices(existing: FeatureChoice[], partialChoices: FeatureChoice[]): FeatureChoice[] {
  // Build a map from choiceId → choice for fast lookup
  const choiceMap = new Map<string, FeatureChoice>(
    existing.map(choice => [choice.choiceId, choice])
  );

  for (const partialChoice of partialChoices) {
    if (partialChoice.choiceId.startsWith('-')) {
      // Remove the choice with the matching ID
      const targetId = partialChoice.choiceId.slice(1);
      choiceMap.delete(targetId);
    } else {
      // Replace or add the choice
      choiceMap.set(partialChoice.choiceId, partialChoice);
    }
  }

  return Array.from(choiceMap.values());
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
 * LOADING ORDER:
 *   Files are loaded in ALPHABETICAL ORDER of their path (case-insensitive).
 *   The manifest file (`static/rules/manifest.json`) lists files in this order.
 *   Within a file, entities are processed in array order.
 *   Later entities (from later files) override earlier ones (for `merge: "replace"`).
 *
 * GM OVERRIDES INTEGRATION:
 *   After all files are loaded, `applyGmOverrides()` processes the campaign's
 *   GM global override text (a JSON array of Feature/ConfigTable objects).
 *   These are applied last (highest priority in the resolution chain).
 */
export class DataLoader {
  /**
   * In-memory feature cache. Key: feature ID, Value: merged Feature object.
   */
  private featureCache = new Map<ID, Feature>();

  /**
   * In-memory config table cache. Key: tableId, Value: ConfigTable object.
   */
  private configTableCache = new Map<string, ConfigTable>();

  /**
   * Whether the DataLoader has completed its initial load.
   */
  isLoaded = false;

  /**
   * List of enabled rule source IDs (set during loadRuleSources()).
   * Used for filtering after loading.
   */
  private enabledRuleSources: ID[] = [];

  // ---------------------------------------------------------------------------
  // LOADING API
  // ---------------------------------------------------------------------------

  /**
   * Loads all rule source files from static/rules/ and populates the caches.
   *
   * FILE DISCOVERY STRATEGY (two-tier fallback):
   *   1. PRIMARY: GET /rules — SvelteKit server endpoint that recursively scans
   *      `static/rules/` in alphabetical order. Implements the "drop a JSON file =
   *      auto-discovered" Open Content Ecosystem promise (ARCHITECTURE.md section 18.1).
   *   2. FALLBACK: GET /rules/manifest.json — Manually maintained manifest.
   *      Used for static builds, edge deployments, or PHP production (Phase 14).
   *
   * PROCESS:
   *   1. Discover file paths via the server endpoint or manifest fallback.
   *   2. Fetch each file in discovered order (alphabetical = loading priority).
   *   3. Parse each file as a JSON array of entities.
   *   4. Process each entity through the Merge Engine (replace/partial).
   *   5. Apply GM global overrides (Layer 2: higher priority than all source files).
   *   6. Filter out features from non-enabled sources.
   *
   * @param enabledSources - The list of source IDs to enable (from CampaignSettings).
   * @param gmGlobalOverrides - Optional GM global override JSON string (Layer 2 of chain).
   */
  async loadRuleSources(
    enabledSources: ID[],
    gmGlobalOverrides?: string
  ): Promise<void> {
    this.clearCache();
    this.enabledRuleSources = enabledSources;

    // Step 1: Discover rule source files (two-tier: server API → manifest fallback)
    let filePaths: string[] = [];
    try {
      // PRIMARY: SvelteKit server endpoint (GET /rules) scans static/rules/ recursively.
      // Returns a JSON array of sorted URL paths.
      const discoveryResponse = await fetch('/rules');
      if (discoveryResponse.ok) {
        const contentType = discoveryResponse.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          filePaths = await discoveryResponse.json() as string[];
        } else {
          // SvelteKit returned an HTML page (not our API) — fall through to manifest
          throw new Error('Discovery endpoint returned non-JSON');
        }
      } else {
        throw new Error(`Discovery endpoint returned HTTP ${discoveryResponse.status}`);
      }
    } catch (discoveryErr) {
      // FALLBACK: static manifest.json file
      console.info('[DataLoader] Auto-discovery endpoint unavailable, using manifest.json:', discoveryErr);
      try {
        const manifestResponse = await fetch('/rules/manifest.json');
        if (manifestResponse.ok) {
          filePaths = await manifestResponse.json() as string[];
        } else {
          console.warn('[DataLoader] manifest.json not available either. No rule sources loaded.');
        }
      } catch (manifestErr) {
        console.warn('[DataLoader] Failed to load manifest.json:', manifestErr);
      }
    }

    // Step 2-4: Load and process each file in order
    for (const filePath of filePaths) {
      await this.#loadRuleFile(filePath);
    }

    // Step 5: Apply GM global overrides (Layer 2: after all source files)
    if (gmGlobalOverrides) {
      this.#applyGmOverrides(gmGlobalOverrides);
    }

    // Step 6: Filter out features from non-enabled sources
    this.#filterByEnabledSources();

    this.isLoaded = true;
  }

  /**
   * Fetches and processes a single rules JSON file.
   *
   * @param filePath - The path relative to the static/public directory (e.g., "/rules/00_srd_core/races.json").
   */
  async #loadRuleFile(filePath: string): Promise<void> {
    try {
      const response = await fetch(filePath);
      if (!response.ok) {
        console.warn(`[DataLoader] Failed to fetch rule file: ${filePath} (${response.status})`);
        return;
      }

      const entities = await response.json() as RawEntity[];

      if (!Array.isArray(entities)) {
        console.warn(`[DataLoader] Rule file ${filePath} does not contain a JSON array. Skipping.`);
        return;
      }

      for (const entity of entities) {
        this.#processEntity(entity);
      }
    } catch (err) {
      console.warn(`[DataLoader] Error loading rule file ${filePath}:`, err);
    }
  }

  /**
   * Processes a single raw entity into the appropriate cache.
   * Determines whether it's a Feature or a ConfigTable, then applies merge rules.
   *
   * RUNTIME VALIDATION (MAJOR fix #5):
   *   Instead of blindly casting `entity as unknown as Feature`, we perform a minimal
   *   structural check to ensure the entity has the required fields before caching.
   *   This prevents silently corrupt entries in the feature cache from malformed JSON.
   *
   *   WHY MINIMAL (not full Zod schema validation)?
   *   Full schema validation would be very expensive at load time (thousands of entities).
   *   Instead, we validate only the fields the engine CRITICALLY depends on:
   *     - `id` and `category` to route to the correct cache bucket.
   *     - `ruleSource` to apply the enabledRuleSources filter correctly.
   *     - `grantedModifiers` and `grantedFeatures` to be arrays (DAG processing depends on this).
   *   Unknown extra fields are tolerated (future-proofing for new features).
   *   Missing optional fields (label, description, tags, etc.) are gracefully defaulted.
   */
  #processEntity(entity: RawEntity): void {
    // --- Config Table (identified by tableId) ---
    if (entity.tableId) {
      const configTable: ConfigTable = {
        tableId: entity.tableId,
        ruleSource: entity.ruleSource ?? 'unknown',
        description: entity.description as string | undefined,
        data: (entity.data ?? []) as Record<string, unknown>[],
      };
      // Config tables always use "replace" semantics
      this.configTableCache.set(entity.tableId, configTable);
      return;
    }

    // --- Feature (identified by id + category) ---
    if (!entity.id || typeof entity.id !== 'string') {
      console.warn('[DataLoader] Entity missing or invalid `id` field (must be a string). Skipping:', entity);
      return;
    }
    if (!entity.category || typeof entity.category !== 'string') {
      console.warn(`[DataLoader] Entity "${entity.id}" missing or invalid \`category\` field. Skipping.`);
      return;
    }
    if (!entity.ruleSource || typeof entity.ruleSource !== 'string') {
      console.warn(`[DataLoader] Entity "${entity.id}" missing \`ruleSource\` field. Defaulting to "unknown". This entity will be excluded if enabledRuleSources is set.`);
      entity.ruleSource = 'unknown';
    }

    // Ensure required array fields are arrays (engine iterates over these without null checks)
    if (!Array.isArray(entity.grantedModifiers)) {
      if (entity.grantedModifiers !== undefined) {
        console.warn(`[DataLoader] Entity "${entity.id}" has non-array \`grantedModifiers\`. Resetting to [].`);
      }
      entity.grantedModifiers = [];
    }
    if (!Array.isArray(entity.grantedFeatures)) {
      if (entity.grantedFeatures !== undefined) {
        console.warn(`[DataLoader] Entity "${entity.id}" has non-array \`grantedFeatures\`. Resetting to [].`);
      }
      entity.grantedFeatures = [];
    }
    if (!Array.isArray(entity.tags)) {
      entity.tags = [];
    }

    // The entity has passed structural validation — safe to store in the feature cache.
    // We use `as unknown as Feature` here as a deliberate bridge between the loosely-typed
    // JSON `RawEntity` and the strict `Feature` TypeScript interface. The structural validation
    // above ensures all engine-critical fields are present and correctly typed.
    // Full type safety is enforced at the engine consumption points (GameEngine DAG phases).
    const existing = this.featureCache.get(entity.id);

    if (!existing || !entity.merge || entity.merge === 'replace') {
      // REPLACE (default): new entity completely replaces existing
      this.featureCache.set(entity.id, entity as unknown as Feature);
    } else if (entity.merge === 'partial') {
      // PARTIAL: merge with existing entity
      const merged = mergePartial(existing as unknown as RawEntity, entity);
      this.featureCache.set(entity.id, merged as unknown as Feature);
    }
  }

  /**
   * Applies GM global override text (Layer 2 of the resolution chain).
   * Parses the JSON string and processes each entity through the merge engine.
   * Applied AFTER all source files, giving overrides the highest priority.
   *
   * @param gmOverridesJson - Raw JSON string from Campaign.gmGlobalOverrides.
   */
  #applyGmOverrides(gmOverridesJson: string): void {
    let entities: RawEntity[];
    try {
      entities = JSON.parse(gmOverridesJson) as RawEntity[];
      if (!Array.isArray(entities)) {
        console.warn('[DataLoader] GM global overrides is not a JSON array. Ignoring.');
        return;
      }
    } catch (err) {
      console.warn('[DataLoader] Failed to parse GM global overrides JSON:', err);
      return;
    }

    // Process each override entity through the same pipeline as regular entities
    for (const entity of entities) {
      this.#processEntity(entity);
    }
  }

  /**
   * Filters the feature cache to remove features from non-enabled rule sources.
   * Called after all files and GM overrides are loaded.
   *
   * LOGIC:
   *   A feature is retained if its `ruleSource` is in `enabledRuleSources`.
   *   If `enabledRuleSources` is empty, ALL features are retained (permissive default).
   *
   * IMPORTANT — GM OVERRIDE EXEMPTION (MAJOR fix #3):
   *   Features with `ruleSource: "gm_override"` (or any value starting with "gm_")
   *   are ALWAYS retained regardless of `enabledRuleSources`. This is required because:
   *     1. GM Global Overrides (Layer 2) and GM Per-Character Overrides (Layer 3) reference
   *        custom Feature definitions that the GM creates directly in the text area.
   *     2. These features cannot and should not be "disabled" by the source filter —
   *        they are the GM's direct runtime modifications, not rule sources to be toggled.
   *     3. Without this exemption, saving GM overrides with `ruleSource: "gm_override"`
   *        would have their features silently discarded by the filter after loading.
   *
   *   The GM ruleSource convention is: `"gm_override"` (for globally defined overrides)
   *   or any string beginning with `"gm_"` for custom per-campaign override blocks.
   *
   * NOTE: Config tables from GM overrides are also exempt from filtering.
   *
   * @see ARCHITECTURE.md section 18.5 and 18.6 for GM override specifications.
   */
  #filterByEnabledSources(): void {
    if (this.enabledRuleSources.length === 0) return; // Empty = no filtering

    // Filter features (exempt GM override sources)
    for (const [id, feature] of this.featureCache) {
      const isGmSource = feature.ruleSource === 'gm_override' || feature.ruleSource.startsWith('gm_');
      if (!isGmSource && !this.enabledRuleSources.includes(feature.ruleSource)) {
        this.featureCache.delete(id);
      }
    }

    // Filter config tables (exempt GM override sources)
    for (const [tableId, table] of this.configTableCache) {
      const isGmSource = table.ruleSource === 'gm_override' || table.ruleSource.startsWith('gm_');
      if (!isGmSource && !this.enabledRuleSources.includes(table.ruleSource)) {
        this.configTableCache.delete(tableId);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // READ API
  // ---------------------------------------------------------------------------

  /**
   * Retrieves a Feature by its ID from the in-memory cache.
   *
   * @param id - The feature ID (e.g., "race_elf", "feat_power_attack").
   * @returns The Feature object, or `undefined` if not found.
   */
  getFeature(id: ID): Feature | undefined {
    return this.featureCache.get(id);
  }

  /**
   * Retrieves all features in the cache.
   *
   * @returns Array of all loaded Feature objects.
   */
  getAllFeatures(): Feature[] {
    return Array.from(this.featureCache.values());
  }

  /**
   * Retrieves features matching a simple declarative query.
   *
   * Supported query formats:
   *   - `"tag:<tag_name>"`            : Features with this tag in their `tags` array.
   *   - `"category:<category_name>"` : Features of this category.
   *   - `"tag:<t1>+tag:<t2>"`         : Intersection (must have ALL listed tags).
   *   - `"category:<cat>+tag:<tag>"` : Features of category AND with tag.
   *
   * @param query - The query string from `FeatureChoice.optionsQuery`.
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
        console.warn(`[DataLoader] Unknown query format: "${condition}"`);
        return false;
      });
    });
  }

  /**
   * Retrieves a configuration lookup table by its tableId.
   *
   * @param tableId - The config table identifier (e.g., "config_xp_thresholds").
   * @returns The ConfigTable, or `undefined` if not found.
   */
  getConfigTable(tableId: string): ConfigTable | undefined {
    return this.configTableCache.get(tableId);
  }

  /**
   * Looks up a specific value from a config table using a key field.
   *
   * Convenience method for common lookups like XP thresholds:
   *   getConfigValue("config_xp_thresholds", "level", 5, "xpRequired") → 10000
   *
   * @param tableId    - The config table ID.
   * @param keyField   - The field to match against (e.g., "level").
   * @param keyValue   - The value to match (e.g., 5).
   * @param valueField - The field to return from the matching row.
   * @returns The matching value, or `undefined` if not found.
   */
  getConfigValue(
    tableId: string,
    keyField: string,
    keyValue: unknown,
    valueField: string
  ): unknown {
    const table = this.configTableCache.get(tableId);
    if (!table) return undefined;
    const row = table.data.find(r => r[keyField] === keyValue);
    return row?.[valueField];
  }

  // ---------------------------------------------------------------------------
  // DIRECT CACHE ACCESS (for tests and the GM override integration)
  // ---------------------------------------------------------------------------

  /**
   * Directly adds a feature to the cache.
   * Used by tests (Phase 17) and by GM per-character override integration.
   *
   * @param feature - The Feature to add/update in the cache.
   */
  cacheFeature(feature: Feature): void {
    this.featureCache.set(feature.id, feature);
  }

  /**
   * Directly adds a config table to the cache.
   * Used by tests (Phase 17).
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
 * The single shared DataLoader instance used by the GameEngine and all UI components.
 *
 * In tests, create a fresh instance: `const loader = new DataLoader();`
 */
export const dataLoader = new DataLoader();
