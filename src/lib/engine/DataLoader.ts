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
 *   In development (SvelteKit), we use `GET /rules` (a SvelteKit server endpoint in
 *   `src/routes/rules/+server.ts`) which scans `static/rules/` recursively and returns
 *   an array of URL paths. Falls back to `GET /rules/manifest.json` if the endpoint
 *   is unavailable.
 *
 * DUAL-SCOPE RESOLUTION CHAIN (Phase 21.1.3):
 *
 *   The complete resolution chain is (lowest → highest priority):
 *
 *     1. Files in `static/rules/`  — SRD content, loaded alphabetically by path
 *     2. Files in `storage/rules/` — Global homebrew, interleaved alphabetically
 *                                    by filename alongside static files
 *     3. Campaign homebrew JSON    — Virtual source "user_homebrew", always active,
 *                                    stored in campaigns.homebrew_rules_json
 *     4. GM global overrides       — campaigns.gmGlobalOverrides
 *     5. GM per-character overrides— character.gmOverrides (applied by GameEngine)
 *
 *   Files in layers 1 and 2 are sorted together by their "sort key" (static files
 *   use the path relative to `rules/`; global files use their bare filename). This
 *   ensures that `50_my_setting.json` in `storage/rules/` loads AFTER all `01_*`
 *   SRD psionic files but BEFORE any `90_*` campaign override files.
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
 * @see ARCHITECTURE.md §18 for data override engine specification.
 * @see ARCHITECTURE.md §21.5 for the dual-scope homebrew resolution chain.
 */

import type { Feature, MergeStrategy, LevelProgressionEntry, FeatureChoice } from '../types/feature';
import type { ID } from '../types/primitives';
import { SUPPORTED_UI_LANGUAGES } from '../i18n/ui-strings';

// =============================================================================
// RULE FILE FORMAT — Top-level wrapper for JSON rule files
// =============================================================================

/**
 * The required top-level wrapper for all JSON rule files.
 *
 * Every rule file must be a JSON object with this structure:
 *   ```json
 *   {
 *     "supportedLanguages": ["en", "fr"],
 *     "entities": [ { "id": "...", "category": "...", ... }, ... ]
 *   }
 *   ```
 *
 * The `supportedLanguages` array declares which language codes appear in the
 * `LocalizedString` values of this file's entities. The DataLoader collects all
 * declared languages across loaded files and exposes them via `getAvailableLanguages()`,
 * which drives the language selector dropdown in the sidebar.
 *
 * EXAMPLE — file providing English, French and Spanish:
 *   ```json
 *   {
 *     "supportedLanguages": ["en", "fr", "es"],
 *     "entities": [
 *       { "id": "weapon_espada", "label": { "en": "Sword", "fr": "Épée", "es": "Espada" }, ... }
 *     ]
 *   }
 *   ```
 *   When this file is loaded, "es" is added to the available-languages set, causing
 *   the language dropdown to offer Spanish. Strings without an `es` key fall back
 *   to their `en` key via `t()`.
 */
interface RuleFileWrapper {
  supportedLanguages?: string[];
  entities: RawEntity[];
}

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

// =============================================================================
// INTERNAL FILE ENTRY — unified record for static + global rule files
// =============================================================================

/**
 * Represents a single rule source file that the DataLoader will fetch.
 *
 * WHY A UNIFIED RECORD?
 *   Static and global files share the same lifecycle (discover → sort → fetch → process)
 *   but live in different locations and are served via different URLs. Unifying them into
 *   a single `FileEntry` type lets `loadRuleSources` process both categories through a
 *   single sorted loop without duplicating logic.
 *
 * - `sortKey`: The string used for alphabetical sorting against all other files.
 *   Static: relative path from `rules/`  (e.g., `"00_d20srd_core/races.json"`)
 *   Global: bare filename                (e.g., `"50_my_setting.json"`)
 *   These sort naturally together because the numeric prefix controls position.
 *
 * - `fetchUrl`: The browser URL used to actually retrieve the file content.
 *   Static: `/rules/...`              (SvelteKit static asset serving)
 *   Global: `/api/global-rules/...`   (PHP backend, files are outside the web root)
 *
 * - `isGlobal`: Whether this file lives in `storage/rules/` (vs `static/rules/`).
 *   Used to track which ruleSource IDs originate from global files, enabling
 *   `getHomebrewRules('global')`.
 */
interface FileEntry {
  sortKey: string;
  fetchUrl: string;
  isGlobal: boolean;
}

/**
 * Shape of each entry returned by `GET /api/global-rules`.
 */
interface GlobalRuleFileInfo {
  filename: string;
  bytes: number;
}

/**
 * The DataLoader is responsible for:
 *   1. Loading JSON rule source files (from static/rules/ and storage/rules/).
 *   2. Merging features according to the Merge Engine rules (replace/partial).
 *   3. Filtering features by CampaignSettings.enabledRuleSources.
 *   4. Caching features and config tables in memory for fast access.
 *   5. Providing a lookup API for the GameEngine (getFeature, getConfigTable, etc.).
 *
 * LOADING ORDER:
 *   Files from `static/rules/` and `storage/rules/` are sorted together
 *   alphabetically by sort key (path / filename), giving numeric-prefix control.
 *   Campaign homebrew JSON is applied after all files.
 *   GM overrides are applied last.
 *
 *   Full chain: static + global files (alphabetical) → campaign homebrew
 *               → GM overrides → filter by enabledRuleSources.
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
   * Monotonically incremented each time `loadRuleSources()` completes.
   *
   * PURPOSE — REACTIVE INVALIDATION:
   *   The DataLoader's caches are plain `Map<>` objects (not Svelte `$state`).
   *   Svelte 5 `$derived` blocks that call `dataLoader.getFeature()` or
   *   `dataLoader.getConfigTable()` have NO tracked reactive dependency on the
   *   caches and would NOT re-run when `loadRuleSources` refills them.
   *
   *   This counter is the deliberate reactive "pin" that bridges the gap:
   *   - `GameEngine.svelte.ts` declares a `$state` counter that mirrors this value.
   *   - All `$derived` blocks that read from the DataLoader also read
   *     `engine.dataLoaderVersion`, creating a tracked dependency.
   *   - When `loadVersion` is incremented here, the engine's `$state` is bumped
   *     via `engine.bumpDataLoaderVersion()`, which invalidates all dependent derivations.
   */
  loadVersion = 0;

  /**
   * Set of enabled file paths (relative, e.g. "00_d20srd_core/01_d20srd_core_races.json").
   * When non-empty, only files whose sortKey matches an entry here are loaded.
   * When empty, ALL discovered files are loaded (permissive default — useful in tests).
   *
   * This is the new file-path based filtering model. Previously, filtering was done
   * AFTER loading by matching `entity.ruleSource` against a list of source IDs.
   * File-path filtering is more deterministic: the GM enables exactly the files they
   * want, and those are the only files fetched and parsed.
   */
  private enabledFilePaths = new Set<string>();

  /**
   * Set of ruleSource IDs that were found in global rule files (storage/rules/).
   *
   * WHY TRACK THIS?
   *   `getHomebrewRules('global')` must return features whose ruleSource originated
   *   from a GM-authored file in `storage/rules/`. Since ruleSource is an arbitrary
   *   string set by the GM in the JSON, we can't recognise global sources by name
   *   alone. We record which ruleSource values appear in each global file as we
   *   process them, building this set progressively during loading.
   *
   *   This set is cleared in `clearCache()` so it stays in sync with the cache.
   */
  private _globalRuleSourceIds = new Set<string>();

  /**
   * Set of language codes available to the user in the language selector dropdown.
   *
   * SEED: Initialized from `SUPPORTED_UI_LANGUAGES` (defined in `ui-strings.ts`).
   * These are the languages that have full built-in UI chrome translations, and they
   * are always available regardless of which JSON rule files are loaded.
   *
   * Additional language codes (e.g., `"es"`, `"de"`) are merged in when a loaded JSON
   * file declares them in its `supportedLanguages` array. Community files providing
   * Spanish data will cause `"es"` to appear in the dropdown even if `ui-strings.ts`
   * has no Spanish chrome translations (those fall back to English).
   *
   * This set is exposed via `getAvailableLanguages()` and drives the language selector
   * dropdown in the sidebar. It is reset to the built-in seed in `clearCache()` so it
   * always reflects the currently loaded file set plus the built-in languages.
   *
   * WHY NOT HARDCODE ['en', 'fr'] HERE?
   *   `ui-strings.ts` is the single source of truth for which languages have full
   *   UI chrome coverage. Deriving the seed from there means adding a new built-in
   *   language (e.g., 'de') only requires a change in `ui-strings.ts`.
   */
  private _availableLanguages = new Set<string>(
    SUPPORTED_UI_LANGUAGES.map(l => l.code)
  );

  // ---------------------------------------------------------------------------
  // LOADING API
  // ---------------------------------------------------------------------------

  /**
   * Loads all rule source files and populates the caches.
   *
   * FULL RESOLUTION CHAIN (in order, lowest → highest priority):
   *
   *   1. Static + global rule files — sorted together alphabetically by sort key.
   *      static/rules/ files are discovered via GET /rules (SvelteKit endpoint) or
   *      manifest.json fallback.
   *      storage/rules/ files are discovered via GET /api/global-rules (PHP API).
   *      Sort keys are compared together: `"00_srd_core/races.json"` sorts
   *      before `"50_my_setting.json"` because `"00"` < `"50"`.
   *
   *   2. Campaign homebrew JSON (`campaignHomebrewRulesJson`).
   *      Injected as the virtual source `"user_homebrew"` — always active,
   *      not subject to the `enabledRuleSources` filter.  Stores the campaign-scoped
   *      entities authored via the Content Editor (Phase 21).
   *
   *   3. GM global overrides (`gmGlobalOverrides`).
   *      Highest priority among file-like sources; applied after campaign homebrew.
   *
   *   4. Filter: remove features whose ruleSource is not in `enabledSources`
   *      (exempting `"user_homebrew"` and `"gm_*"` sources).
   *
   * FILE DISCOVERY — static files (two-tier fallback):
   *   PRIMARY:  GET /rules — SvelteKit server endpoint that scans static/rules/
   *             recursively and returns URL paths.
   *   FALLBACK: GET /rules/manifest.json — static manifest for builds/edge.
   *
   * FILE DISCOVERY — global files:
   *   GET /api/global-rules — PHP endpoint listing filenames in storage/rules/.
   *   Skipped gracefully if unavailable (e.g. in Vitest unit tests where no server
   *   is running).
   *
   * @param enabledSources            - IDs from CampaignSettings.enabledRuleSources.
   * @param gmGlobalOverrides         - Optional. Raw JSON string for Layer 3.
   * @param campaignHomebrewRulesJson - Optional. Raw JSON string stored in
   *                                    campaigns.homebrew_rules_json.  All entities
   *                                    are stamped with ruleSource:"user_homebrew".
   */
  async loadRuleSources(
    enabledSources: ID[],
    gmGlobalOverrides?: string,
    campaignHomebrewRulesJson?: string
  ): Promise<void> {
    this.clearCache();
    // Store enabled file paths as a Set for O(1) lookup during file filtering.
    // An empty set means "load everything" (permissive — used when no campaign
    // is active, e.g. during first-load or in Vitest unit tests).
    this.enabledFilePaths = enabledSources.length > 0
      ? new Set(enabledSources)
      : new Set<string>();

    // -----------------------------------------------------------------------
    // Step 1a: Discover static rule files via GET /rules or manifest.json
    // -----------------------------------------------------------------------
    let staticFilePaths: string[] = [];
    try {
      // PRIMARY: SvelteKit endpoint scans static/rules/ recursively.
      // Returns a JSON array of URL paths like ["/rules/00_srd_core/races.json", ...]
      const discoveryResponse = await fetch('/rules');
      if (discoveryResponse.ok) {
        const contentType = discoveryResponse.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          staticFilePaths = await discoveryResponse.json() as string[];
        } else {
          // SvelteKit returned HTML (e.g., dev server not running) — fall through
          throw new Error('Discovery endpoint returned non-JSON');
        }
      } else {
        throw new Error(`Discovery endpoint returned HTTP ${discoveryResponse.status}`);
      }
    } catch (discoveryErr) {
      // FALLBACK: static manifest.json
      console.info('[DataLoader] Auto-discovery endpoint unavailable, using manifest.json:', discoveryErr);
      try {
        const manifestResponse = await fetch('/rules/manifest.json');
        if (manifestResponse.ok) {
          staticFilePaths = await manifestResponse.json() as string[];
        } else {
          console.warn('[DataLoader] manifest.json not available either. No static rule sources loaded.');
        }
      } catch (manifestErr) {
        console.warn('[DataLoader] Failed to load manifest.json:', manifestErr);
      }
    }

    // -----------------------------------------------------------------------
    // Step 1b: Discover global rule files via GET /api/global-rules
    // -----------------------------------------------------------------------
    // This endpoint is served by GlobalRulesController::list() and returns
    // [{ filename: "50_my_setting.json", bytes: 4096 }, ...].
    // It is accessible to all authenticated users so DataLoader can call it
    // for all players, not just GMs.
    //
    // Failure is non-fatal: if the PHP server is not available (e.g. in
    // unit tests or SvelteKit-only dev mode), we simply skip global files.
    let globalFileInfos: GlobalRuleFileInfo[] = [];
    try {
      const globalListResponse = await fetch('/api/global-rules');
      if (globalListResponse.ok) {
        const raw = await globalListResponse.json() as unknown;
        // Guard against malformed responses: the endpoint must return an array.
        // A non-array response (e.g. an error object) would make `for...of` below
        // throw a TypeError since plain objects are not iterable.
        if (Array.isArray(raw)) {
          globalFileInfos = raw as GlobalRuleFileInfo[];
        } else {
          console.warn('[DataLoader] GET /api/global-rules did not return a JSON array. Skipping global rule files.');
        }
      } else if (globalListResponse.status !== 404) {
        // 404 = storage/rules/ is empty or endpoint not yet wired — expected. Anything
        // else (401, 500) is worth logging.
        console.warn('[DataLoader] GET /api/global-rules returned HTTP', globalListResponse.status);
      }
    } catch (globalErr) {
      // No PHP server in this environment (e.g., unit tests via Vitest).
      // Log at debug level — this is an expected condition during testing.
      console.debug('[DataLoader] GET /api/global-rules unavailable (no backend?). Skipping global rule files.');
    }

    // -----------------------------------------------------------------------
    // Step 1c: Build unified FileEntry[] and sort together alphabetically
    // -----------------------------------------------------------------------
    // Static files:
    //   fetchUrl: "/rules/00_srd_core/races.json"
    //   sortKey:  "00_srd_core/races.json"  (strip the leading "/rules/")
    //
    // Global files:
    //   fetchUrl: "/api/global-rules/50_my_setting.json"
    //   sortKey:  "50_my_setting.json"       (bare filename)
    //
    // Comparing "00_srd_core/races.json" vs "50_my_setting.json" naturally
    // places the global file after all 00_* and 01_* SRD content — exactly
    // the intended load-order behaviour described in ARCHITECTURE.md §21.5.
    const fileEntries: FileEntry[] = [];

    for (const fetchUrl of staticFilePaths) {
      // Strip the "/rules/" URL prefix to derive the sort key.
      // The sort key doubles as the file path used in enabledFilePaths matching:
      //   fetchUrl  → "/rules/00_d20srd_core/01_d20srd_core_races.json"
      //   sortKey   → "00_d20srd_core/01_d20srd_core_races.json"
      const sortKey = fetchUrl.startsWith('/rules/')
        ? fetchUrl.slice('/rules/'.length)
        : fetchUrl;

      // File-path filtering: when enabledFilePaths is non-empty, skip files
      // not explicitly selected by the campaign settings.
      if (this.enabledFilePaths.size > 0 && !this.enabledFilePaths.has(sortKey)) {
        continue;
      }

      fileEntries.push({ sortKey, fetchUrl, isGlobal: false });
    }

    for (const info of globalFileInfos) {
      fileEntries.push({
        sortKey:  info.filename,                               // e.g. "50_my_setting.json"
        fetchUrl: `/api/global-rules/${info.filename}`,        // served by GlobalRulesController
        isGlobal: true,
      });
    }

    // Defensive sort: alphabetical by sortKey (case-insensitive).
    // Architecture §21.5 requires the combined list to be sorted by filename/path.
    fileEntries.sort((a, b) =>
      a.sortKey.localeCompare(b.sortKey, undefined, { sensitivity: 'base' })
    );

    // -----------------------------------------------------------------------
    // Steps 2–4: Load and process each file in sorted order
    // -----------------------------------------------------------------------
    for (const entry of fileEntries) {
      await this.#loadRuleFile(entry.fetchUrl, entry.isGlobal);
    }

    // -----------------------------------------------------------------------
    // Step 5: Inject campaign-scoped homebrew as virtual source "user_homebrew"
    // -----------------------------------------------------------------------
    // WHY THIS POSITION?
    //   Campaign homebrew ranks ABOVE all file sources (static + global) but
    //   BELOW gmGlobalOverrides. This matches ARCHITECTURE.md §21.5:
    //     "Injected after all files in CampaignSettings.enabledRuleSources,
    //      before gmGlobalOverrides."
    //
    // WHY STAMP ruleSource = "user_homebrew"?
    //   Makes getHomebrewRules('campaign') trivially accurate without extra bookkeeping,
    //   and ensures the homebrew is always loaded (not filtered by enabledFilePaths).
    if (campaignHomebrewRulesJson) {
      this.#applyCampaignHomebrew(campaignHomebrewRulesJson);
    }

    // -----------------------------------------------------------------------
    // Step 6: Apply GM global overrides (Layer 3: highest file-like priority)
    // -----------------------------------------------------------------------
    if (gmGlobalOverrides) {
      this.#applyGmOverrides(gmGlobalOverrides);
    }

    this.isLoaded = true;
    // Increment the reactive version counter so Svelte $derived blocks that
    // depend on engine.dataLoaderVersion are invalidated and re-run.
    this.loadVersion++;
  }

  /**
   * Fetches and processes a single rules JSON file.
   *
   * @param filePath - The fetch URL for the file (e.g., "/rules/00_srd_core/races.json"
   *                   for static files, or "/api/global-rules/50_my_setting.json" for
   *                   global files stored in storage/rules/).
   * @param isGlobal - When `true`, the ruleSource IDs found in this file are recorded
   *                   in `_globalRuleSourceIds` so `getHomebrewRules('global')` can
   *                   identify them later.  Defaults to `false`.
   */
  async #loadRuleFile(filePath: string, isGlobal = false): Promise<void> {
    try {
      const response = await fetch(filePath);
      if (!response.ok) {
        console.warn(`[DataLoader] Failed to fetch rule file: ${filePath} (${response.status})`);
        return;
      }

      const raw = await response.json() as RuleFileWrapper;

      if (typeof raw !== 'object' || raw === null || !Array.isArray(raw.entities)) {
        console.warn(`[DataLoader] Rule file ${filePath} is not a valid rule-file wrapper object ({ supportedLanguages?, entities: [] }). Skipping.`);
        return;
      }

      const entities: RawEntity[] = raw.entities;

      // Register any declared languages so the UI dropdown can include them.
      if (Array.isArray(raw.supportedLanguages)) {
        for (const lang of raw.supportedLanguages) {
          if (typeof lang === 'string' && lang.trim()) {
            this._availableLanguages.add(lang.trim());
          }
        }
      }

      // If this file comes from storage/rules/ (global scope), record every ruleSource
      // value it contains so getHomebrewRules('global') can identify them.
      if (isGlobal) {
        for (const entity of entities) {
          if (entity.ruleSource && typeof entity.ruleSource === 'string') {
            this._globalRuleSourceIds.add(entity.ruleSource);
          }
        }
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
    // --- Silently skip documentation / comment-header objects ---
    // Rule JSON files may contain header objects whose keys are entirely
    // underscore-prefixed metadata (e.g. `_comment`, `_comment2`) plus an
    // optional `ruleSource` field.  They carry no entity data and should be
    // discarded without a console warning.
    if (!entity.id && !entity.tableId) {
      const nonMeta = Object.keys(entity).filter(k => !k.startsWith('_') && k !== 'ruleSource');
      if (nonMeta.length === 0) return;
    }

    // --- Config Table (identified by tableId) ---
    if (entity.tableId) {
      const ruleSource = entity.ruleSource ?? 'unknown';

      // Normalize `data` to an array.
      // Some config table JSON files use an object keyed by ID (e.g.
      // config_skill_definitions in 04_d20srd_core_skills_config.json) while others
      // use a plain array (e.g. 00_d20srd_core_config_tables.json).
      // The engine always iterates `table.data` as an array, so we normalise here.
      let rawData = entity.data ?? [];
      if (!Array.isArray(rawData) && typeof rawData === 'object' && rawData !== null) {
        rawData = Object.values(rawData as Record<string, unknown>) as Record<string, unknown>[];
      }

      const configTable: ConfigTable = {
        tableId: entity.tableId,
        ruleSource,
        description: entity.description as string | undefined,
        data: rawData as Record<string, unknown>[],
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
   * Injects campaign-scoped homebrew entities as the virtual source "user_homebrew".
   * Applied AFTER all file sources (static + global) but BEFORE gmGlobalOverrides,
   * per ARCHITECTURE.md §21.5.
   *
   * RULESOUCE STAMPING:
   *   Every entity loaded from the campaign homebrew JSON has its `ruleSource`
   *   forced to `"user_homebrew"`, regardless of what the GM may have set.
   *   This ensures two invariants:
   *     1. The entity is always loaded (file-path filtering only applies to static files,
   *        not to campaign homebrew which is injected directly).
   *     2. `getHomebrewRules('campaign')` can reliably identify these features
   *        by checking `ruleSource === "user_homebrew"`.
   *
   * WHY FORCE, NOT DEFAULT?
   *   Campaign homebrew is always scoped to this campaign and always active.
   *   Using a fixed ruleSource value makes identification unambiguous.
   *
   * @param homebrewJson - Raw JSON string from campaigns.homebrew_rules_json.
   */
  #applyCampaignHomebrew(homebrewJson: string): void {
    let entities: RawEntity[];
    try {
      entities = JSON.parse(homebrewJson) as RawEntity[];
      if (!Array.isArray(entities)) {
        console.warn('[DataLoader] Campaign homebrew rules is not a JSON array. Ignoring.');
        return;
      }
    } catch (err) {
      console.warn('[DataLoader] Failed to parse campaign homebrew rules JSON:', err);
      return;
    }

    for (const entity of entities) {
      // Stamp ruleSource unconditionally — see method JSDoc for the rationale.
      entity.ruleSource = 'user_homebrew';
      this.#processEntity(entity);
    }
  }

  /**
   * Applies GM global override text (Layer 3 of the resolution chain).
   * Parses the JSON string and processes each entity through the merge engine.
   * Applied AFTER campaign homebrew, giving overrides the highest file-like priority.
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
   * Returns all homebrew features for the specified scope.
   *
   * WHY TWO SCOPES?
   *   Phase 21 introduces two homebrew persistence scopes:
   *     - `'campaign'`: entities stored in `campaigns.homebrew_rules_json`, injected
   *       as the virtual source `"user_homebrew"`.  These belong to a single campaign.
   *     - `'global'`: entities loaded from `.json` files in `storage/rules/`,
   *       published via `PUT /api/global-rules/{filename}`.  These can be shared
   *       across multiple campaigns by listing the file in `enabledRuleSources`.
   *
   * `getHomebrewRules('campaign')`:
   *   Returns all features whose `ruleSource === "user_homebrew"`.
   *   This is accurate because `#applyCampaignHomebrew` stamps every entity
   *   with that exact ruleSource value.
   *
   * `getHomebrewRules('global')`:
   *   Returns features whose ruleSource appeared in any file loaded from
   *   `storage/rules/`.  Tracked via `_globalRuleSourceIds` during
   *   `#loadRuleFile(path, isGlobal=true)`.
   *
   * NOTE: Both methods query the CURRENT cache state — call after loadRuleSources().
   *
   * @param scope - `'campaign'` or `'global'`.
   * @returns Array of Features from that scope, or `[]` if none are loaded.
   */
  getHomebrewRules(scope: 'campaign' | 'global'): Feature[] {
    if (scope === 'campaign') {
      return Array.from(this.featureCache.values()).filter(
        f => f.ruleSource === 'user_homebrew'
      );
    }

    // scope === 'global'
    // Return features whose ruleSource was seen in at least one global file.
    return Array.from(this.featureCache.values()).filter(
      f => this._globalRuleSourceIds.has(f.ruleSource)
    );
  }

  /**
   * Clears all cached data. Used for testing and when changing campaigns.
   */
  clearCache(): void {
    this.featureCache.clear();
    this.configTableCache.clear();
    this._globalRuleSourceIds.clear();
    // Reset available languages to the built-in seed from ui-strings.ts.
    // SUPPORTED_UI_LANGUAGES is the single source of truth for built-in UI languages.
    this._availableLanguages = new Set<string>(SUPPORTED_UI_LANGUAGES.map(l => l.code));
    this.isLoaded = false;
  }

  /**
   * Returns the set of language codes available across all currently loaded rule files.
   *
   * ALWAYS contains `"en"` (English is the universal fallback and base language).
   * Additional codes are added from `supportedLanguages` arrays in loaded files that
   * use the metadata wrapper format (e.g., `{ "supportedLanguages": ["en", "fr"], "entities": [...] }`).
   *
   * UI usage:
   *   The language dropdown in the sidebar reads this list to populate its options.
   *   Any code returned here has at least one loaded file that declared it.
   *   Strings not available in the selected language will gracefully fall back to
   *   English via `t()`.
   *
   * @returns Sorted array of language code strings (e.g., `["en", "fr"]`).
   */
  getAvailableLanguages(): string[] {
    return Array.from(this._availableLanguages).sort();
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
