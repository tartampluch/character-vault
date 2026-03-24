/**
 * @file HomebrewStore.svelte.ts
 * @description Reactive store for GM-authored homebrew entities (Phase 21.1.4).
 *
 * WHAT IS THIS STORE?
 *   The HomebrewStore holds the set of Feature-like objects that a GM authors
 *   via the Content Editor (Phase 21).  It provides:
 *     - In-memory CRUD (add / update / remove / getById).
 *     - Reactive `isDirty` / `isSaving` flags so the UI can show save state.
 *     - Debounced auto-save (1 s) to the correct backend endpoint based on `scope`.
 *     - A `toJSON()` helper that serialises the entity list to a clean JSON string.
 *
 * DUAL-SCOPE PERSISTENCE (ARCHITECTURE.md §21.5):
 *
 *   ┌──────────────┬──────────────────────────────────────────────────────────┐
 *   │ scope        │ Backend endpoint                                          │
 *   ├──────────────┼──────────────────────────────────────────────────────────┤
 *   │ 'campaign'   │ PUT /api/campaigns/{activeCampaignId}/homebrew-rules      │
 *   │              │   Stores campaign-scoped homebrew in the DB.              │
 *   │              │   Readable by all campaign members (GM + players).        │
 *   │              │   `ruleSource` stamped as "user_homebrew" by DataLoader.  │
 *   ├──────────────┼──────────────────────────────────────────────────────────┤
 *   │ 'global'     │ PUT /api/global-rules/{filename}                          │
 *   │              │   Writes a file to storage/rules/ (outside web root).     │
 *   │              │   Available to any campaign that adds it to              │
 *   │              │   CampaignSettings.enabledRuleSources.                    │
 *   └──────────────┴──────────────────────────────────────────────────────────┘
 *
 * FILENAME VALIDATION:
 *   The `filename` field is only used when `scope === 'global'`.  It must match
 *   `[0-9a-z_-]+\.json` — the same pattern enforced by the PHP backend (422 on
 *   violation).  The store validates client-side before attempting a save, which
 *   avoids a round-trip for an obviously invalid name.
 *
 * isDirty / isSaving LIFECYCLE:
 *   - Any mutation (add / update / remove) sets `isDirty = true` immediately.
 *   - The `$effect.root` auto-save watch schedules a 1 s debounced save.
 *   - When the save starts, `isSaving = true`.
 *   - On success or failure, `isSaving = false`.
 *   - On success, `isDirty = false`.
 *   - On failure, `isDirty` remains `true` so the UI can show a retry option.
 *
 * CSRF PROTECTION:
 *   Imports `apiHeaders()` from StorageManager — this function injects the
 *   in-memory CSRF token into every mutating request.  The token is populated
 *   at login time via `setCsrfToken()`.
 *
 * LOADING FROM THE BACKEND:
 *   `load()` is a one-shot async method.  Call it after setting `scope`
 *   and (for global) `filename`.  It replaces the current entity list and
 *   resets `isDirty = false`.
 *
 * @see api/controllers/CampaignController.php (getHomebrewRules / setHomebrewRules)
 * @see api/controllers/GlobalRulesController.php (getFileContent / put)
 * @see src/lib/engine/DataLoader.ts (#applyCampaignHomebrew / getHomebrewRules)
 * @see ARCHITECTURE.md §21.1.4 for the full specification.
 */

import type { Feature } from '../types/feature';
import type { ID } from '../types/primitives';
import { sessionContext } from './SessionContext.svelte';
import { apiHeaders, debounce } from './StorageManager';

// =============================================================================
// FILENAME VALIDATION
// =============================================================================

/**
 * Regex that a global rule file filename must fully satisfy.
 * Mirrors the pattern in GlobalRulesController::VALID_FILENAME_PATTERN.
 *
 * Valid examples : "50_homebrew.json", "99_setting.json", "05-variant-races.json"
 * Invalid examples: "../escape.json", "MY FILE.json", "SomeThing.json"
 */
const VALID_FILENAME_RE = /^[0-9a-z_-]+\.json$/;

// =============================================================================
// HOME BREW STORE CLASS
// =============================================================================

/**
 * Svelte 5 reactive store for GM-authored homebrew entities.
 *
 * SINGLETON USAGE:
 *   Import `homebrewStore` (the pre-instantiated singleton) in components and
 *   the GameEngine.  Instantiate `new HomebrewStore()` only in tests.
 *
 * REACTIVE STATE:
 *   All `$state` fields are reactive: Svelte components that read them will
 *   automatically re-render when they change.
 */
export class HomebrewStore {
  // ---------------------------------------------------------------------------
  // $state — reactive fields
  // ---------------------------------------------------------------------------

  /**
   * The list of homebrew Feature entities currently managed by this store.
   * Mutated by add() / update() / remove() and replaced wholesale by load().
   */
  private _entities = $state<Feature[]>([]);

  /**
   * Where homebrew entities are persisted.
   *   'campaign' → PUT /api/campaigns/{id}/homebrew-rules
   *   'global'   → PUT /api/global-rules/{filename}
   */
  scope = $state<'campaign' | 'global'>('campaign');

  /**
   * The filename used when scope === 'global'.
   * Must match `[0-9a-z_-]+\.json`.  Changing this does NOT rename an existing
   * file on the server — it simply directs future saves to a different file.
   * Default value `"50_homebrew.json"` places the file between the SRD psionics
   * (`01_*`) and any high-priority campaign overrides (`90_*`).
   */
  filename = $state<string>('50_homebrew.json');

  /**
   * True when the in-memory entity list has been mutated since the last
   * successful save.  Used by the UI to show an unsaved-changes indicator.
   */
  isDirty = $state<boolean>(false);

  /**
   * True while a save request is in flight.  Used by the UI to show a spinner
   * on the save button and to disable concurrent save attempts.
   */
  isSaving = $state<boolean>(false);

  // ---------------------------------------------------------------------------
  // PRIVATE — debounced save function
  // ---------------------------------------------------------------------------

  /**
   * Debounced version of `#persist()`.
   * Re-created whenever the class is instantiated so each store instance has
   * its own independent timer (important for tests that create multiple stores).
   *
   * WHY 1 000 ms?
   *   Fast enough to feel responsive (users see a save within a second of
   *   stopping edits), slow enough to batch rapid successive changes into
   *   a single network request.
   */
  readonly #debouncedPersist = debounce(() => {
    this.#persist().catch(err => {
      console.error('[HomebrewStore] Auto-save failed:', err);
    });
  }, 1_000);

  // ---------------------------------------------------------------------------
  // AUTO-SAVE $effect (debounced 1 s)
  // ---------------------------------------------------------------------------

  /**
   * Watches the reactive entity list and triggers a debounced save whenever
   * `isDirty` becomes true.
   *
   * WHY $effect.root?
   *   The store may be instantiated once at module load time (as a singleton),
   *   outside any Svelte component lifecycle.  `$effect.root()` creates a
   *   standalone effect scope that is not tied to a component's lifetime, which
   *   is exactly what module-level Svelte 5 stores use (see GameEngine.svelte.ts
   *   for the identical `#autoSaveCharacterEffect = $effect.root(...)` pattern).
   *
   * DEPENDENCY TRACKING:
   *   Inside the root, we create a regular `$effect` that reads `this.isDirty`,
   *   `this.scope`, and `this.filename`.  Svelte 5 tracks all reactive reads
   *   automatically — any change to these fields re-runs the effect body.
   *
   *   We explicitly do NOT track `this._entities` here because the mutations
   *   (add / update / remove) already set `isDirty = true`, which is sufficient
   *   to trigger the watch.  Tracking the full entity list would re-run the
   *   effect on every single entity field change, which is unnecessarily noisy.
   */
  readonly #autoSaveEffect = $effect.root(() => {
    $effect(() => {
      // Reading these reactive values registers them as dependencies.
      const dirty    = this.isDirty;
      const _scope   = this.scope;       // re-save if scope changes while dirty
      const _file    = this.filename;    // re-save if filename changes while dirty

      if (!dirty) return; // Nothing to save yet.

      // Schedule a debounced save.  If this effect fires multiple times within
      // 1 s (e.g., three rapid add() calls), the debounce collapses them into
      // a single persist() call.
      this.#debouncedPersist();
    });
  });

  // ---------------------------------------------------------------------------
  // PUBLIC READ API
  // ---------------------------------------------------------------------------

  /**
   * Returns a shallow copy of the current entity list.
   * Callers receive a snapshot — mutating the returned array does NOT affect
   * the store.  Use add() / update() / remove() for mutations.
   */
  get entities(): Feature[] {
    return this._entities;
  }

  /**
   * Retrieves a single entity by its ID.
   *
   * @param id - The feature ID (e.g., "race_elf_homebrew").
   * @returns The Feature, or `undefined` if not found.
   */
  getById(id: ID): Feature | undefined {
    return this._entities.find(e => e.id === id);
  }

  /**
   * Serialises the current entity list to a JSON string.
   *
   * FORMAT:
   *   A pretty-printed JSON array matching the format expected by the PHP
   *   backend and by DataLoader.  This is the canonical "what will be saved"
   *   representation — it is also what the RawJsonPanel (Phase 21.5.5) displays
   *   when showing the bulk export of all homebrew entities.
   *
   * @returns Prettified JSON string of the entity array.
   */
  toJSON(): string {
    return JSON.stringify(this._entities, null, 2);
  }

  // ---------------------------------------------------------------------------
  // PUBLIC MUTATION API
  // ---------------------------------------------------------------------------

  /**
   * Adds a new entity to the store.
   *
   * RULESOUCE ENFORCEMENT:
   *   If the entity does not have a `ruleSource` set, it defaults to
   *   `"user_homebrew"`.  This matches DataLoader's stamping behaviour for
   *   campaign-scope entities and ensures the entity is never silently filtered
   *   out by `#filterByEnabledSources`.
   *
   * DUPLICATE ID:
   *   If an entity with the same `id` already exists, it is replaced (same
   *   semantics as DataLoader's `merge: "replace"` default).  A warning is
   *   logged because this likely indicates a programming error in the editor UI.
   *
   * @param entity - The Feature to add.  All required Feature fields must be set.
   */
  add(entity: Feature): void {
    const stamped: Feature = {
      ...entity,
      ruleSource: entity.ruleSource || 'user_homebrew',
    };

    const existingIndex = this._entities.findIndex(e => e.id === stamped.id);
    if (existingIndex !== -1) {
      console.warn(
        `[HomebrewStore] add() called with duplicate id "${stamped.id}". ` +
        'Replacing the existing entity. Use update() to intentionally replace.'
      );
      this._entities = [
        ...this._entities.slice(0, existingIndex),
        stamped,
        ...this._entities.slice(existingIndex + 1),
      ];
    } else {
      this._entities = [...this._entities, stamped];
    }

    this.isDirty = true;
  }

  /**
   * Applies a partial patch to an existing entity.
   *
   * PATCH SEMANTICS:
   *   A shallow merge (like `Object.assign`) — top-level fields in `patch`
   *   overwrite the corresponding fields on the stored entity.  Nested objects
   *   are replaced wholesale, not deeply merged.  This matches the behaviour
   *   of how the React/Svelte form fields mutate individual top-level fields.
   *
   *   For deep-merge scenarios (e.g., changing a single modifier inside a
   *   `grantedModifiers` array), callers should read the entity via `getById()`,
   *   construct the full updated object, and pass it as the patch.
   *
   * @param id    - ID of the entity to update.
   * @param patch - Partial Feature fields to overwrite.
   * @returns `true` if the entity was found and updated; `false` if not found.
   */
  update(id: ID, patch: Partial<Feature>): boolean {
    const index = this._entities.findIndex(e => e.id === id);
    if (index === -1) {
      console.warn(`[HomebrewStore] update() called with unknown id "${id}". No-op.`);
      return false;
    }

    this._entities = [
      ...this._entities.slice(0, index),
      { ...this._entities[index], ...patch },
      ...this._entities.slice(index + 1),
    ];

    this.isDirty = true;
    return true;
  }

  /**
   * Removes an entity from the store.
   *
   * @param id - ID of the entity to remove.
   * @returns `true` if the entity was found and removed; `false` if not found.
   */
  remove(id: ID): boolean {
    const originalLength = this._entities.length;
    this._entities = this._entities.filter(e => e.id !== id);

    if (this._entities.length === originalLength) {
      console.warn(`[HomebrewStore] remove() called with unknown id "${id}". No-op.`);
      return false;
    }

    this.isDirty = true;
    return true;
  }

  /**
   * Merges a parsed JSON array of Feature objects into the current entity list.
   * Used by the "Import JSON" feature in ContentLibraryPage (Phase 21.5.1).
   * Sets `isDirty = true` so the imported content is persisted.
   *
   * MERGE SEMANTICS (upsert-by-id, also called "import-merge"):
   *   For each entity in the imported array:
   *     • If an entity with the same `id` already exists in the store → it is
   *       replaced with the imported version (same semantics as `add()` duplicate
   *       handling: the imported file wins, acting as an update).
   *     • If no entity with that `id` exists → it is appended to the list.
   *   Entities already in the store whose `id` does NOT appear in the imported
   *   array are LEFT UNTOUCHED.
   *
   * WHY MERGE INSTEAD OF REPLACE?
   *   A replace-all import would silently destroy entities the GM had already
   *   authored whenever they imported a partial file (e.g., importing only
   *   the race entities while also having feats in the store).  Merge lets the
   *   GM safely import additions and updates without losing unrelated content.
   *
   *   If a complete replacement is intentional (e.g., restoring a full backup),
   *   the GM should first use the "Delete All" flow or clear the store manually
   *   before importing.
   *
   * @param jsonString - A JSON array of Feature objects.
   * @throws {SyntaxError} if `jsonString` is not valid JSON.
   * @throws {TypeError}  if the parsed value is not an array.
   */
  importJSON(jsonString: string): void {
    const parsed = JSON.parse(jsonString) as unknown;
    if (!Array.isArray(parsed)) {
      throw new TypeError('[HomebrewStore] importJSON: root value must be a JSON array.');
    }

    const incoming = parsed as Feature[];

    // Build a mutable copy of the existing entity list so we can upsert in-place.
    const merged = [...this._entities];

    for (const entity of incoming) {
      const existingIdx = merged.findIndex(e => e.id === entity.id);
      if (existingIdx !== -1) {
        // Replace: imported version takes precedence over the stored version.
        merged[existingIdx] = entity;
      } else {
        // Append: new entity not yet in the store.
        merged.push(entity);
      }
    }

    this._entities = merged;
    this.isDirty   = true;
  }

  // ---------------------------------------------------------------------------
  // BACKEND I/O
  // ---------------------------------------------------------------------------

  /**
   * Loads homebrew entities from the backend for the current scope.
   *
   * CAMPAIGN SCOPE:
   *   GET /api/campaigns/{activeCampaignId}/homebrew-rules
   *   Returns the array stored in `campaigns.homebrew_rules_json`.
   *
   * GLOBAL SCOPE:
   *   GET /api/global-rules/{filename}
   *   Returns the array stored in `storage/rules/{filename}`.
   *   Returns an empty array (not an error) when the file does not yet exist
   *   (HTTP 404 is treated as "no entities yet").
   *
   * On success: replaces `_entities` and resets `isDirty = false`.
   * On failure: logs a warning and leaves the current entity list intact.
   *
   * @returns A Promise resolving when loading completes (or silently fails).
   */
  async load(): Promise<void> {
    const url = this.#buildUrl();
    if (!url) return;

    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });

      // 404 for the global scope means the file doesn't exist yet — that's fine.
      if (response.status === 404 && this.scope === 'global') {
        this._entities = [];
        this.isDirty = false;
        return;
      }

      if (!response.ok) {
        console.warn(`[HomebrewStore] load() failed: HTTP ${response.status} from ${url}`);
        return;
      }

      const data = await response.json() as Feature[];
      if (!Array.isArray(data)) {
        console.warn('[HomebrewStore] load(): backend returned non-array JSON. Ignoring.');
        return;
      }

      this._entities = data;
      this.isDirty = false;
    } catch (err) {
      console.warn('[HomebrewStore] load() network error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // PRIVATE — persistence
  // ---------------------------------------------------------------------------

  /**
   * Sends the current entity list to the backend via PUT.
   * Sets `isSaving` during the request and clears `isDirty` on success.
   *
   * FILENAME VALIDATION:
   *   Before sending, validates the filename when scope === 'global'.
   *   An invalid filename logs an error and aborts (no request is sent).
   *   This prevents a wasted round-trip that would result in a 422 from the PHP API.
   *
   * ATOMIC SAVE:
   *   The body is the ENTIRE entity array (replace-all semantics, not patch).
   *   This matches the backend contract for both endpoints.
   */
  async #persist(): Promise<void> {
    const url = this.#buildUrl();
    if (!url) return;

    // Validate filename before attempting to save to storage/rules/.
    if (this.scope === 'global' && !VALID_FILENAME_RE.test(this.filename)) {
      console.error(
        `[HomebrewStore] Cannot save: invalid filename "${this.filename}". ` +
        'Filename must match [0-9a-z_-]+\\.json (e.g. "50_homebrew.json").'
      );
      return;
    }

    this.isSaving = true;

    try {
      const response = await fetch(url, {
        method:  'PUT',
        headers: apiHeaders(),
        body:    JSON.stringify(this._entities),
      });

      if (!response.ok) {
        // Log the server's error message if available.
        let serverMsg = '';
        try {
          const errBody = await response.json() as { message?: string };
          serverMsg = errBody.message ? ` — ${errBody.message}` : '';
        } catch {
          /* response body not JSON — ignore */
        }
        console.error(
          `[HomebrewStore] Save failed: HTTP ${response.status} from ${url}${serverMsg}`
        );
        // isDirty stays true — the UI can show a retry indicator.
        return;
      }

      // Save succeeded.
      this.isDirty = false;
    } catch (err) {
      console.error('[HomebrewStore] Save network error:', err);
      // isDirty stays true.
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Builds the PUT/GET URL for the current scope.
   *
   * CAMPAIGN SCOPE:
   *   Requires `sessionContext.activeCampaignId` to be set (non-null).
   *   Returns null and logs a warning if it is not, because we cannot save
   *   to a campaign endpoint without knowing which campaign we are in.
   *
   * GLOBAL SCOPE:
   *   Uses `this.filename`.  The filename will be validated in `#persist()`
   *   before the actual PUT request is sent.
   *
   * @returns The full URL string, or `null` if the URL cannot be constructed.
   */
  #buildUrl(): string | null {
    if (this.scope === 'campaign') {
      const campaignId = sessionContext.activeCampaignId;
      if (!campaignId) {
        console.warn(
          '[HomebrewStore] #buildUrl: scope is "campaign" but sessionContext.activeCampaignId is null. ' +
          'Cannot build URL. Set activeCampaignId before loading/saving campaign homebrew.'
        );
        return null;
      }
      return `/api/campaigns/${campaignId}/homebrew-rules`;
    }

    // scope === 'global'
    return `/api/global-rules/${this.filename}`;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

/**
 * The single shared HomebrewStore instance used by the Content Editor and
 * the GameEngine's DataLoader integration.
 *
 * USAGE IN COMPONENTS:
 * ```svelte
 * <script>
 *   import { homebrewStore } from '$lib/engine/HomebrewStore.svelte';
 *   // Read: homebrewStore.entities, homebrewStore.isDirty
 *   // Mutate: homebrewStore.add(entity), homebrewStore.update(id, patch)
 * </script>
 * ```
 *
 * USAGE IN TESTS:
 *   Create an isolated instance: `const store = new HomebrewStore();`
 *   This avoids polluting the singleton and gives each test a clean state.
 */
export const homebrewStore = new HomebrewStore();
