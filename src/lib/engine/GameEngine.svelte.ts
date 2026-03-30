/**
 * @file GameEngine.svelte.ts
 * @description The central reactive engine — the "brain" of the VTT application.
 *
 * Design philosophy:
 *   The GameEngine is a SVELTE 5 CLASS using the Runes API ($state, $derived).
 *   It is the single source of truth for the entire application state:
 *     - The active character being displayed/edited
 *     - The campaign settings (house rules, enabled sources, language)
 *     - All derived statistics (computed from character data via the DAG)
 *
  *   THE DAG (Directed Acyclic Graph) PHASES in this file:
 *     Phase 0 (3.2): Feature Flattening  → flatModifiers[] (from activeFeatures + gmOverrides)
 *     Phase 0 (3.2): Active Tags         → activeTags[] (flat tag array for logic evaluation)
 *     Phase 1 (3.2): Size & Encumbrance  → phase1_sizePipeline (size modifier resolution)
 *
 *   SUBSEQUENT PHASES (3.3, 3.4) compute attributes, saves, combat stats, and skills.
 *
 * CIRCULAR DEPENDENCY PREVENTION:
 *   Each $derived only reads from $state variables or from $derived values computed
 *   in a PREVIOUS phase. Reading a $derived from a LATER phase would create a cycle.
 *   The strict phase numbering enforces this ordering.
 *
 *   INFINITE LOOP PROTECTION (Phase 9.1):
 *   A depth counter prevents any pipeline from being re-evaluated more than 3 times
 *   in a single resolution cycle. This catches malicious features (e.g., CON based on MaxHP
 *   based on CON). See the `MAX_RESOLUTION_DEPTH` constant and usage in Phase 3.3.
 *
 * @see src/lib/types/character.ts  for Character, ActiveFeatureInstance
 * @see src/lib/types/settings.ts   for CampaignSettings
 * @see src/lib/utils/formatters.ts for t(), formatDistance(), formatWeight()
 * @see src/lib/engine/DataLoader.ts for feature data loading
 * @see ARCHITECTURE.md section 9 for the full DAG specification
 */

import { createDefaultCampaignSettings } from '../types/settings';
import { t as translateString, formatDistance as fmtDistance, formatWeight as fmtWeight, computeCoinWeight, computeWealthInGP, computeAbilityModifier, formatModifier } from '../utils/formatters';
import type { Character, ActiveFeatureInstance } from '../types/character';
import type { CampaignSettings } from '../types/settings';
import type { LocalizedString } from '../types/i18n';
import type { StatisticPipeline, SkillPipeline, ResourcePool, Modifier } from '../types/pipeline';
import type { Feature, ItemFeature, ResourcePoolTemplate, ActivationTier } from '../types/feature';
import type { ID } from '../types/primitives';
import { dataLoader } from './DataLoader';
import { checkCondition, evaluateLogicNode } from '../utils/logicEvaluator';
import type { EvaluationResult } from '../utils/logicEvaluator';
import { evaluateFormula } from '../utils/mathParser';
import type { CharacterContext } from '../utils/mathParser';
import { applyStackingRules, computeDerivedModifier } from '../utils/stackingRules';
import { computeGestaltBase, isGestaltAffectedPipeline } from '../utils/gestaltRules';
import { SYNERGY_SOURCE_LABEL_KEY, ALIGNMENTS, MAX_CLASS_LEVEL, MAIN_ABILITY_IDS, getAbilityAbbr, ATTRIBUTE_PIPELINE_NAMESPACE, CONDITION_ENCUMBERED_FEATURE_ID, CONDITION_ENCUMBERED_INSTANCE_ID, WEAPON_CATEGORY_TAG, RANGED_CATEGORY_TAG } from '../utils/constants';
import { buildLocalizedString, ui, UI_STRINGS } from '../i18n/ui-strings';
import { storageManager, debounce } from './StorageManager';
import { sessionContext } from './SessionContext.svelte';
import { MAX_RESOLUTION_DEPTH } from '../types/engine';
export type { ClassSkillPointsEntry, LevelingJournalClassEntry, LevelingJournal, SkillPointsBudget, SaveConfigEntry, WeaponDefaults, FlatModifierEntry } from '../types/engine';
import type { ClassSkillPointsEntry, LevelingJournalClassEntry, LevelingJournal, SkillPointsBudget, SaveConfigEntry, WeaponDefaults, FlatModifierEntry } from '../types/engine';
export { makeSkillPipeline, createEmptyCharacter } from './CharacterFactory';
import { makeSkillPipeline, createEmptyCharacter } from './CharacterFactory';
import { computeActiveTags, computePhase0Result } from './phases/phase0Modifiers';
import { buildSizePipeline } from './phases/phase1Size';
import { buildAttributePipelines, buildPhase2Context } from './phases/phase2Attributes';
import { buildCombatStatPipelines, buildPhase3Context } from './phases/phase3CombatStats';
import { buildClassSkillSet, buildSkillPointsBudget, buildLevelingJournal, computeMulticlassXpPenaltyRisk, buildSkillPipelines } from './phases/phase4Skills';
import { buildSavingThrowConfig } from './phases/phaseSavingThrows';
import { buildEquipmentSlots, buildEquippedSlotCounts } from './phases/phaseEquipmentSlots';
import { computeFeatSlots, computeGrantedFeatIds, computeManualFeatCount } from './phases/phaseFeatSlots';
import { computeEffectiveActionBudget, computeActionBudgetHasXOR, computeActionBudgetBlockers } from './phases/phaseActionBudget';

/**
 * Bootstrap-phase fallback for `savingThrowConfig`.
 * Used ONLY during the brief window before `config_save_definitions` loads from the
 * DataLoader (i.e., before `loadRuleSources()` resolves and `dataLoaderVersion` bumps).
 *
 * ZERO-HARDCODING COMPLIANCE:
 *   Per PROGRESS.md Guideline 6, D&D-specific terms ("Fortitude", "Reflex", "Will",
 *   "CON", "DEX", "WIS") must NOT appear as literals in TypeScript logic.
 *   This fallback therefore uses the pipeline IDs as display labels. The human-readable
 *   save names are loaded from `config_save_definitions` in `static/rules/` and replace
 *   these placeholders as soon as the DataLoader finishes loading (within milliseconds
 *   of app startup). Players will never see these fallback labels in practice.
 *
 * Colors are oklch perceptual-uniform values matching the app's Tailwind theme palette:
 *   saves.fortitude → red-400 equivalent
 *   saves.reflex    → sky-300 equivalent
 *   saves.will      → indigo-300 equivalent
 */
const DEFAULT_SAVE_CONFIG: readonly SaveConfigEntry[] = [
  {
    pipelineId:     'saves.fortitude',
    label:          { en: 'saves.fortitude' },
    keyAbilityId:   'stat_constitution',
    // keyAbilityAbbr uses the pipeline ID as a fallback to comply with PROGRESS.md Guideline 6
    // (no D&D-specific abbreviations hardcoded in TypeScript). The human-readable abbreviations
    // ("CON", "DEX", "WIS") are loaded from config_save_definitions and replace these placeholders
    // within milliseconds of app startup. Players will never see these fallback values.
    keyAbilityAbbr: { en: 'stat_constitution' },
    accentColor:    'var(--color-save-fort)',
  },
  {
    pipelineId:     'saves.reflex',
    label:          { en: 'saves.reflex' },
    keyAbilityId:   'stat_dexterity',
    keyAbilityAbbr: { en: 'stat_dexterity' },
    accentColor:    'var(--color-save-ref)',
  },
  {
    pipelineId:     'saves.will',
    label:          { en: 'saves.will' },
    keyAbilityId:   'stat_wisdom',
    keyAbilityAbbr: { en: 'stat_wisdom' },
    accentColor:    'var(--color-save-will)',
  },
];

/**
 * Hardcoded D&D 3.5 SRD fallback for weapon ability defaults.
 * Active during bootstrap or when `config_weapon_defaults` is not loaded.
 */
const DEFAULT_WEAPON_CONFIG: WeaponDefaults = {
  meleeAttackAbility:        'stat_strength',
  rangedAttackAbility:       'stat_dexterity',
  meleeDamageAbility:        'stat_strength',
  twoHandedDamageMultiplier: 1.5,
};




// =============================================================================
// GAME ENGINE CLASS
// =============================================================================

/**
 * The central reactive engine for the VTT application.
 *
 * Uses Svelte 5 Runes ($state, $derived) for fine-grained reactivity.
 * The DAG is built as a chain of $derived properties, each phase only reading
 * from $state or from $derived values from earlier phases.
 */
export class GameEngine {
  // ---------------------------------------------------------------------------
  // MUTABLE STATE ($state)
  // ---------------------------------------------------------------------------

  /**
   * The active campaign settings (language, house rules, enabled sources).
   *
   * NOTE ON LANGUAGE INITIALIZATION:
   *   `settings.language` always starts as `'en'`. The user's language preference
   *   is persisted in the `cv_language` browser cookie and restored asynchronously
   *   by `ThemeLanguagePicker` after the locale file has been fetched. Starting
   *   with `'en'` guarantees that the very first render is in a consistent state
   *   (English, locale always available) and that the transition to the preferred
   *   language happens exactly once, cleanly, after the locale data is ready.
   *
   *   Previously the language was read from localStorage (`loadUserLanguage()`),
   *   which caused a race: the engine started with e.g. `'fr'` before `fr.json`
   *   was fetched, producing an English render followed by a re-render flash.
   */
  settings = $state<CampaignSettings>({
    ...createDefaultCampaignSettings(),
    language: 'en', // ThemeLanguagePicker restores the real preference after locale load
  });

  /** The currently active character. Replacing this triggers full DAG re-evaluation. */
  character = $state<Character>(createEmptyCharacter('default', UI_STRINGS['vault.default_char_name'] as string));

  /** The URL-based character ID (may differ from character.id during load). */
  activeCharacterId = $state<ID | null>(null);

  /** True while loading character data from storage/API. */
  isLoading = $state<boolean>(false);

  /** Set when a storage error occurs. Displayed as a UI notification. */
  lastError = $state<string | null>(null);

  /**
   * Mirrors `dataLoader.loadVersion`. Incremented by `bumpDataLoaderVersion()`
   * after every `loadRuleSources()` call.
   *
   * WHY NEEDED:
   *   The DataLoader's feature/config caches are plain `Map<>` objects that Svelte
   *   cannot track. Any `$derived` that reads from the DataLoader must also read
   *   this counter to become properly invalidated when new rule sources are loaded.
   *   Without this, skills, saving throws, phases etc. would show stale data (or
   *   "No skills loaded") until an unrelated $state change happened to retrigger them.
   *
   * USAGE IN $derived:
   *   Read `engine.dataLoaderVersion` at the start of any $derived that calls
   *   `dataLoader.getFeature()`, `dataLoader.getConfigTable()` etc.
   *   The value itself is ignored; the read is the reactive dependency.
   */
  dataLoaderVersion = $state(0);

  /** Called by the vault page after loadRuleSources() resolves. */
  bumpDataLoaderVersion(): void {
    this.dataLoaderVersion = dataLoader.loadVersion;
  }

  /**
   * Mirrors `dataLoader.localesVersion`. Incremented by `bumpLocalesVersion()`
   * after every `loadExternalLocales()` call.
   *
   * Kept separate from `dataLoaderVersion` so that locale discovery does NOT
   * cause the heavy game-mechanics $derived (combat stats, saves, skills, etc.)
   * to recompute — those only need to re-run when rule files change.
   *
   * Only `availableLanguages` reads this counter so the reactive invalidation
   * is surgical: exactly the dropdown, nothing else.
   */
  localesVersion = $state(0);

  /**
   * Called by AppShell.onMount and the login page after loadExternalLocales()
   * resolves. Syncing the $state value triggers availableLanguages to recompute,
   * which in turn re-renders the language dropdown everywhere in the app.
   */
  bumpLocalesVersion(): void {
    this.localesVersion = dataLoader.localesVersion;
  }

  /**
   * The set of language codes available across all currently loaded rule files
   * and campaign homebrew entities.
   *
   * Derived reactively from `dataLoader.getAvailableLanguages()`. Re-evaluated
   * whenever `bumpDataLoaderVersion()` is called (i.e., after every load cycle).
   *
   * Always contains at least `["en"]`. Additional codes appear from three sources:
   *   1. `supportedLanguages[]` in rule files (fast-path declaration).
   *   2. Per-entity scanning via `scanEntityForLanguages()` — any language key
   *      found in any `LocalizedString` field of any processed entity is included.
   *      This covers rule files, campaign homebrew, and GM overrides.
   *   3. `loadExternalLocales()` → GET /api/locales (UI chrome locale files).
   *
   * The vault page passes `homebrewStore.toJSON()` as the 3rd argument to
   * `loadRuleSources()` so that campaign-editor languages (e.g. a Japanese
   * translation added to a homebrew weapon's `label`) are discovered and
   * cause Japanese to appear in the sidebar dropdown.
   *
   * UI usage:
   *   The language dropdown in the sidebar reads this array to populate its options.
   *   Selecting a language code updates `engine.settings.language`, which propagates
   *   reactively to all `engine.t()` and `ui()` calls across the UI.
   */
  availableLanguages: string[] = $derived.by(() => {
    // Reading both version counters creates reactive dependencies so this $derived
    // re-runs when EITHER:
    //   • loadRuleSources() completes and bumpDataLoaderVersion() is called
    //     (adds languages declared in rule file supportedLanguages arrays), OR
    //   • loadExternalLocales() completes and bumpLocalesVersion() is called
    //     (adds languages from server-dropped static/locales/*.json files).
    // The two counters are intentionally separate so locale discovery does NOT
    // invalidate the heavy game-mechanics $derived (combat stats, saves, etc.).
    void this.dataLoaderVersion;
    void this.localesVersion;
    return dataLoader.getAvailableLanguages();
  });

  // ---------------------------------------------------------------------------
  // VAULT STATE & VISIBILITY
  // ---------------------------------------------------------------------------

  /**
   * All characters loaded for the current campaign vault.
   *
   * ARCHITECTURE: In Phase 4.1 scope, this is populated from localStorage via
   * `storageManager.loadAllCharacters()` and filtered by `activeCampaignId`.
   * In Phase 14.6, replaced by API calls.
   *
   * The Vault page (Phase 7.3) reads `visibleCharacters` (the filtered $derived),
   * not this raw array directly.
   */
  allVaultCharacters = $state<Character[]>([]);

  // ---------------------------------------------------------------------------
  // SCENE STATE — Global environmental features injected into all characters
  // ---------------------------------------------------------------------------

  /**
   * The GM-controlled global scene state.
   *
   * WHY THIS EXISTS (ARCHITECTURE.md section 13):
   *   Environmental conditions (Extreme Heat, Underwater, Darkness) affect ALL
   *   characters in the current scene simultaneously. Rather than manually adding
   *   `ActiveFeatureInstance` entries to every character, the GM activates a global
   *   Feature in the Scene State. The GameEngine Phase 0 then virtually injects these
   *   features into every character's `activeFeatures` during DAG flattening.
   *
   * HOW IT WORKS:
   *   1. GM activates `environment_extreme_heat` via the Scene State.
   *   2. The `phase0_flatModifiers` computation includes the modifiers of these
   *      environment features as if they were on EVERY character.
   *   3. Characters with protections (Endure Elements tag) block them via conditionNode.
   *   4. When the GM deactivates the scene feature, all characters instantly recover.
   *
   * @see ARCHITECTURE.md section 13 for the full Global Aura specification.
   * @see ANNEXES.md section A.11 for Extreme Heat and Underwater environment examples.
   * @see src/lib/types/campaign.ts for the SceneState interface.
   */
  sceneState = $state<{ activeGlobalFeatures: string[] }>({ activeGlobalFeatures: [] });

  /**
   * Activates a global environment feature for the current scene.
   * Idempotent: calling twice with the same ID has no effect.
   *
   * @param featureId - The Feature ID to activate globally (e.g., "environment_extreme_heat").
   */
  activateSceneFeature(featureId: string): void {
    if (!this.sceneState.activeGlobalFeatures.includes(featureId)) {
      this.sceneState.activeGlobalFeatures.push(featureId);
    }
  }

  /**
   * Deactivates a global environment feature. All characters instantly recover.
   *
   * @param featureId - The Feature ID to deactivate.
   */
  deactivateSceneFeature(featureId: string): void {
    const index = this.sceneState.activeGlobalFeatures.indexOf(featureId);
    if (index !== -1) {
      this.sceneState.activeGlobalFeatures.splice(index, 1);
    }
  }

  /**
   * DAG: Filtered character list based on session visibility rules.
   *
   * VISIBILITY RULES (ARCHITECTURE.md Phase 7.1):
   *   1. Filter by `activeCampaignId` — only show characters from the active campaign.
   *   2. If `isGameMaster === true` → return ALL characters (players, NPCs, monsters).
   *   3. If `isGameMaster === false` → return ONLY:
   *      a. Characters where `ownerId === currentUserId`
   *      b. Any LinkedEntity characters belonging to those characters.
   *
   * Why $derived (not $state)?
   *   Because the result re-computes automatically when `allVaultCharacters`,
   *   `sessionContext.activeCampaignId`, `sessionContext.isGameMaster`, or
   *   `sessionContext.currentUserId` changes. The Vault page never needs to
   *   manually re-filter — it just reads `engine.visibleCharacters`.
   */
  visibleCharacters: Character[] = $derived.by(() => {
    const campaignId = sessionContext.activeCampaignId;
    const isGM = sessionContext.isGameMaster;
    const userId = sessionContext.currentUserId;

    // Step 1: Filter by campaign.
    // Characters with no campaignId (legacy data) are excluded from campaign views.
    const inCampaign = campaignId
      ? this.allVaultCharacters.filter(c => c.campaignId === campaignId)
      : this.allVaultCharacters;

    // Step 2: Apply role-based visibility.
    if (isGM) {
      // GM sees ALL characters in the campaign (players, NPCs, summons, etc.)
      return inCampaign;
    }

    // Player: sees only their own characters + their LinkedEntities
    const ownCharacters = inCampaign.filter(c => c.ownerId === userId);

    // Collect LinkedEntity character IDs from own characters
    // A player can also see the characters linked to THEIR characters
    // (e.g., their own Animal Companion, Familiar).
    // NOTE: LinkedEntity characters within ANOTHER player's character are NOT visible.
    const linkedEntityIds = new Set<string>();
    for (const char of ownCharacters) {
      for (const linked of char.linkedEntities) {
        linkedEntityIds.add(linked.characterData.id);
      }
    }

    // Include own characters + their linked entities (not other players' linked entities)
    return inCampaign.filter(
      c => c.ownerId === userId || linkedEntityIds.has(c.id)
    );
  });

  /**
   * Loads characters for the given campaign into the vault.
   * Called when entering a campaign-scoped vault (`/campaigns/[id]/vault`).
   *
   * LOADING STRATEGY:
   *   When a `campaignId` is provided, this method fetches characters from the
   *   PHP API (`GET /api/characters?campaignId=X`). The API enforces the correct
   *   visibility rules server-side:
   *     - GMs receive ALL characters in the campaign (including other players').
   *     - Players receive only their own characters (with GM overrides merged in).
   *
   *   The API response is also written to localStorage as a cache by
   *   `storageManager.loadAllCharactersFromApi()`, so offline fallback works.
   *
   *   When no `campaignId` is provided (edge case), falls back to localStorage.
   *
   * WHY FIRE-AND-FORGET (not async/await)?
   *   The vault page's `$effect` cannot `await` — it runs synchronously.
   *   The Promise resolves in the background; the `$state` assignment triggers
   *   a reactive re-render automatically when data arrives.
   *
   * @param campaignId - The campaign to load characters for.
   */
  loadVaultCharacters(campaignId?: string): void {
    if (campaignId) {
      storageManager.loadAllCharactersFromApi(campaignId)
        .then(chars => { this.allVaultCharacters = chars; })
        .catch(err => {
          console.warn('[GameEngine] loadVaultCharacters: API unavailable, falling back to localStorage.', err);
          this.allVaultCharacters = storageManager.loadAllCharacters();
        });
    } else {
      this.allVaultCharacters = storageManager.loadAllCharacters();
    }
  }

  /**
   * Loads all characters across all campaigns into the vault.
   * Called when entering the global vault (`/vault`).
   *
   * LOADING STRATEGY:
   *   Calls `GET /api/characters` (no campaignId).
   *   - GMs receive ALL characters across all campaigns (with raw gmOverrides).
   *   - Players receive all their own characters across all campaigns.
   *   Falls back to localStorage on API failure.
   *
   * WHY FIRE-AND-FORGET: same reason as loadVaultCharacters().
   */
  loadAllVaultCharacters(): void {
    storageManager.loadAllCharactersFromApi()
      .then(chars => { this.allVaultCharacters = chars; })
      .catch(err => {
        console.warn('[GameEngine] loadAllVaultCharacters: API unavailable, falling back to localStorage.', err);
        this.allVaultCharacters = storageManager.loadAllCharacters();
      });
  }

  /**
   * Adds a character to the vault's in-memory list and persists it.
   * Called when creating a new character from the Vault page (Phase 7.4).
   *
   * PERSISTENCE STRATEGY:
   *   Uses POST /api/characters (via storageManager.createCharacterOnApi) so the
   *   new character is immediately visible to the GM and other campaign members
   *   without waiting for a full vault reload.
   *
   *   The subsequent auto-save $effect (debounced PUT) picks up from here; using
   *   PUT for the very first write would fail with 404 because the record does not
   *   exist yet in the DB.
   *
   * @param char - The character to add.
   */
  addCharacterToVault(char: Character): void {
    // Fire-and-forget: POST creates the record in the DB. Errors fall back to
    // localStorage (storageManager.createCharacterOnApi always saves locally first).
    storageManager.createCharacterOnApi(char);
    this.allVaultCharacters.push(char);
  }

  /**
   * Registers an already-persisted character in the vault's in-memory list
   * WITHOUT saving it again to storage.
   *
   * WHY A SEPARATE METHOD:
   *   When navigating directly to `/character/[id]`, the character is loaded from
   *   `storageManager.loadCharacter()` (already on disk) and added to the in-memory
   *   vault list for vault-page rendering. Using `addCharacterToVault()` would
   *   trigger a redundant write; this method is write-free.
   *
   *   Using an engine method (rather than direct `push` in the route) satisfies
   *   the zero-game-logic-in-Svelte rule — vault list management is character state.
   *
   * @param char - The character to register.
   */
  registerCharacterInVault(char: Character): void {
    if (!this.allVaultCharacters.some(c => c.id === char.id)) {
      this.allVaultCharacters.push(char);
    }
  }

  /**
   * Updates the `gmOverrides` field for a specific character in the vault.
   *
   * WHY AN ENGINE METHOD (not a direct mutation in gm-dashboard/+page.svelte):
   *   Direct property assignment on objects inside `allVaultCharacters` from a
   *   route component violates the zero-game-logic-in-Svelte rule (ARCHITECTURE.md §3):
   *   all character state mutations must go through the GameEngine. Using a dedicated
   *   method keeps all write paths in one auditable place and ensures the update is
   *   visible via Svelte's reactive system.
   *
   * @param characterId - The ID of the character to update.
   * @param overrides   - The new GM overrides array (validated JSON before calling).
   */
  setCharacterGmOverrides(characterId: ID, overrides: ActiveFeatureInstance[]): void {
    const char = this.allVaultCharacters.find(c => c.id === characterId);
    if (char) char.gmOverrides = overrides;
  }

  /**
   * Removes a character from the vault (used for deletion, Phase 7.4).
   *
   * @param characterId - The character ID to remove.
   */
  removeCharacterFromVault(characterId: ID): void {
    // Remove from the in-memory vault list immediately (reactive UI update).
    const index = this.allVaultCharacters.findIndex(c => c.id === characterId);
    if (index !== -1) {
      this.allVaultCharacters.splice(index, 1);
    }
    // Delete from localStorage + PHP API (fire-and-forget; localStorage is
    // synchronous so the local removal is guaranteed even if the API is down).
    storageManager.deleteCharacterFromApi(characterId);
  }

  // ---------------------------------------------------------------------------
  // AUTO-SAVE $effect — Connect character and settings changes to StorageManager
  // ---------------------------------------------------------------------------

  /**
   * Debounced save to localStorage (500ms — fast local I/O).
   * Saves immediately to local storage for low-latency offline access.
   */
  readonly #debouncedSaveLocalCharacter = debounce((char: Character) => {
    storageManager.saveCharacter(char);
  }, 500);

  /**
   * Debounced save to PHP API (2000ms — avoids spamming the server).
   * Phase 14.6: fires a PUT /api/characters/{id} request after the user stops typing.
   * The API call itself is async (fire-and-forget from the component's perspective).
   * On API failure, the localStorage save (above) ensures data is not lost.
   */
  readonly #debouncedSaveApiCharacter = debounce((char: Character) => {
    // Fire-and-forget: the async method handles its own error handling + localStorage fallback
    storageManager.saveCharacterToApi(char).catch(() => {
      // Already handled inside saveCharacterToApi — silently ignore here
    });
  }, 2000);

  /**
   * Auto-save $effect: saves the character whenever it changes.
   *
   * Svelte 5's `$effect` tracks all reactive dependencies read inside it.
   * Reading `this.character` makes the effect reactive to ANY change in the character,
   * including nested mutations (attribute baseValue, skill ranks, activeFeatures, etc.).
   *
   * Uses the debounced save to avoid overwhelming localStorage.
   */
  readonly #autoSaveCharacterEffect = $effect.root(() => {
    $effect(() => {
      // Reading this.character makes this effect reactive to all character changes
      const char = this.character;
      // Tracking activeCharacterId prevents saving the default blank character on init
      if (char.id !== 'default' && this.activeCharacterId) {
        // Dual-backend auto-save (Phase 14.6):
        //   1. localStorage (500ms debounce) — fast, always-available local cache
        //   2. PHP API (2000ms debounce) — server sync, fails gracefully if unreachable
        this.#debouncedSaveLocalCharacter(char);
        this.#debouncedSaveApiCharacter(char);
      }
    });
  });

  /**
   * Auto-save $effect: saves settings whenever they change.
   * Settings changes are rare (language toggle, house rule toggle, etc.) —
   * no debounce needed, save immediately.
   */
  readonly #autoSaveSettingsEffect = $effect.root(() => {
    $effect(() => {
      storageManager.saveSettings(this.settings);
    });
  });

  // NOTE: Language is no longer persisted via localStorage.
  //   The `cv_language` cookie (written by `ThemeLanguagePicker` on every
  //   explicit user selection) is now the sole persistence mechanism. This
  //   avoids the startup race where `loadUserLanguage()` would seed
  //   `settings.language = 'fr'` before the locale file was fetched, causing
  //   an English flash followed by a re-render.

  /**
   * Language validation $effect: ensures the selected language is supported by
   * at least one loaded rule file (or by the built-in UI chrome languages).
   *
   * TIMING GUARD:
   *   Only runs after the DataLoader has completed at least one full load
   *   (checked via `dataLoader.isLoaded`). This prevents premature resets
   *   during progressive file loading — files load one by one and the
   *   _availableLanguages set grows as they load, but we should not fall back
   *   to English just because a file hasn't arrived yet.
   *
   *   The `this.availableLanguages` read creates a reactive dependency on
   *   `this.dataLoaderVersion`, so this effect re-runs after every load cycle.
   *
   * BEHAVIOUR:
   *   - If the current language is in `availableLanguages` → keep it.
   *   - If NOT in `availableLanguages` AND load is complete → reset to `"en"`.
   *   - Before first load completes → never reset (preserves the saved pref).
   */
  readonly #languageValidationEffect = $effect.root(() => {
    $effect(() => {
      const langs = this.availableLanguages; // reactive dep via dataLoaderVersion
      // Only validate after the DataLoader has completed its first full load.
      // dataLoader.isLoaded is set to true inside loadRuleSources() right before
      // loadVersion is incremented, so it is always true here.
      if (!dataLoader.isLoaded) return;
      const currentLang = this.settings.language;
      if (!langs.includes(currentLang)) {
        this.settings.language = 'en';
      }
    });
  });

  /**
   * Auto-save $effect: persists the active character ID for session restore.
   */
  readonly #autoSaveActiveIdEffect = $effect.root(() => {
    $effect(() => {
      storageManager.saveActiveCharacterId(this.activeCharacterId);
    });
  });

  // ---------------------------------------------------------------------------
  // CLASS RESOURCE POOL SYNC — Phase 0.5 (GAP-02 fix)
  // ---------------------------------------------------------------------------
  //
  // Problem: Class features (Rage, Turn Undead, Spell Slots, etc.) declare their
  // resource pools via `activation.resourceCost.targetId` but do NOT use
  // `resourcePoolTemplates` like item pools do. This means `character.resources`
  // never has a `ResourcePool` entry for "resources.barbarian_rage_uses", and the
  // engine cannot track current uses, max uses, or reset them.
  //
  // Fix: This effect scans all active feature definitions for `resourcePoolTemplates`
  // entries whose `poolId` starts with "resources." (class resource convention).
  // For each such pool, if `character.resources[poolId]` does not yet exist,
  // the pool is created with `defaultCurrent` from the template and the pool is
  // registered in `character.resources`. This is idempotent — already-initialised
  // pools (with a potentially depleted currentValue) are never overwritten.
  //
  // NOTE: Item pools (instance-scoped, stored in ActiveFeatureInstance.itemResourcePools)
  // are NOT affected here. Only `character.resources` (character-scoped) pools are synced.
  //
  // resetCondition: GAP-03 fix — class ability pools use "long_rest" (requires sleep),
  // NOT "per_day" (resets at dawn without sleep). Per the SRD and ARCHITECTURE.md:
  //   - Spell slots, Rage, Turn Undead, Bardic Music, etc.: "long_rest"
  //   - Dawn-reset magic item abilities: "per_day"
  // JSON files must declare the correct resetCondition on each template.
  // This sync effect respects whatever `resetCondition` the template declares.

  readonly #classResourcePoolSyncEffect = $effect.root(() => {
    $effect(() => {
      // React to changes in active features
      const activeFeatures = this.character.activeFeatures;

      for (const instance of activeFeatures) {
        if (!instance.isActive) continue;
        const feature = dataLoader.getFeature(instance.featureId);
        if (!feature?.resourcePoolTemplates) continue;

        for (const template of feature.resourcePoolTemplates) {
          const fullPoolId = `resources.${template.poolId}`;

          // Skip item-scoped pools (handled by initItemResourcePools)
          // Class resource pools have poolId that matches their resource key
          if (Object.prototype.hasOwnProperty.call(this.character.resources, fullPoolId)) {
            continue; // Already initialised — never overwrite (preserve depleted counts)
          }

          // Create the pool entry in character.resources
          const label: import('../types/i18n').LocalizedString = template.label;
          const maxPipelineId = template.maxPipelineId;
          const newPool: ResourcePool = {
            id: fullPoolId,
            label,
            maxPipelineId,
            currentValue: template.defaultCurrent,
            temporaryValue: 0,
            resetCondition: template.resetCondition,
            rechargeAmount: template.rechargeAmount,
          };
          this.character.resources[fullPoolId] = newPool;
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // SKILL SEEDING EFFECT — Phase 4.2
  // ---------------------------------------------------------------------------
  //
  // WHAT HAPPENS HERE:
  //   When the DataLoader finishes loading (bumpDataLoaderVersion fires), read
  //   config_skill_definitions and add any skill entries that don't already exist
  //   in character.skills.  Existing entries (with player-invested ranks) are
  //   NEVER overwritten — only genuinely absent skills are created.
  //
  // WHY AN EFFECT AND NOT A $derived?
  //   `character.skills` is `$state` (mutable character data that must be persisted).
  //   A $derived cannot mutate $state.  An $effect.root() is the correct Svelte 5
  //   pattern for "side-effect that writes to $state in response to a dependency change."
  //
  // DATA FORMAT:
  //   config_skill_definitions.data is an array of objects:
  //   { id, label, keyAbility, appliesArmorCheckPenalty, canBeUsedUntrained }
  //   After the DataLoader normalisation fix, dict-format data is also supported.

  readonly #skillSeedingEffect = $effect.root(() => {
    $effect(() => {
      // React to DataLoader reloads (bumpDataLoaderVersion triggers re-run).
      void this.dataLoaderVersion;

      const table = dataLoader.getConfigTable('config_skill_definitions');
      if (!table?.data?.length) return;

      let changed = false;
      for (const row of table.data as Array<Record<string, unknown>>) {
        const skillId = row['id'] as string | undefined;
        if (!skillId || typeof skillId !== 'string') continue;

        // Skill pipeline key matches the id from the config table directly
        // (e.g. "skill_climb", "skill_bluff") — no prefix added here.
        //
        // GUARD: skip only when the pipeline is FULLY initialised (has a label).
        //
        // WHY NOT `if (skills[id]) continue`?
        //   Characters loaded from the PHP API store only `{ranks: N}` for each
        //   skill (ARCHITECTURE.md: "STORED: ranks"). When loadCharacter() sets
        //   character.skills from that API response, every entry is a bare
        //   SkillPipeline with `label: undefined`, `keyAbility: undefined`, etc.
        //   The old guard (`if (skills[id])`) treated these truthy-but-incomplete
        //   objects as "already seeded" and skipped them, leaving `label: undefined`
        //   for the lifetime of the session — causing crashes in skill-label UI.
        //
        //   By checking `?.label` we only skip entries that already carry the full
        //   pipeline structure. Minimal stored entries are completed here, with their
        //   stored `ranks` value preserved below.
        if (this.character.skills[skillId]?.label) continue;

        const label = (row['label'] ?? { en: skillId }) as import('../types/i18n').LocalizedString;
        const keyAbility = (row['keyAbility'] as string | undefined) ?? 'stat_intelligence';
        const acp  = Boolean(row['appliesArmorCheckPenalty']);
        const uTrained = row['canBeUsedUntrained'] !== false;

        // Preserve any ranks that were already stored in the minimal entry.
        const existingRanks = this.character.skills[skillId]?.ranks ?? 0;

        this.character.skills[skillId] = makeSkillPipeline(
          skillId, label, keyAbility, acp, uTrained
        );

        // Re-apply stored ranks so player-invested points are not lost.
        if (existingRanks > 0) {
          this.character.skills[skillId].ranks = existingRanks;
        }

        changed = true;
      }

      if (changed) {
        // Trigger Svelte to detect the new skills object entries.
        // Direct property assignment on $state objects is reactive in Svelte 5,
        // but reassignment ensures any derived depending on character.skills fires.
        this.character.skills = { ...this.character.skills };
      }
    });
  });

  // ---------------------------------------------------------------------------
  // DAG PHASE 0 — Feature Flattening & Modifier Extraction
  // ---------------------------------------------------------------------------
  //
  // WHAT HAPPENS HERE:
  //   1. Combine character.activeFeatures with character.gmOverrides (all instances).
  //   2. For each instance where isActive === true:
  //      a. Look up the Feature definition from the DataLoader cache.
  //      b. Check Feature.forbiddenTags against the character's current active tags
  //         (NOTE: active tags are computed in the same phase for initial pass;
  //          see the note on two-pass tagging below).
  //      c. For class features: apply levelProgression gating — only include
  //         grantedModifiers from entries where entry.level <= classLevels[featureId].
  //      d. For each modifier in grantedModifiers and levelProgression.grantedModifiers:
  //         - Evaluate conditionNode (if present) using a preliminary context.
  //         - If conditionNode passes (or absent), include the modifier.
  //         - If modifier has situationalContext, it goes to situational list.
  //         - Otherwise, it goes to active list.
  //      e. For each entry in grantedFeatures: recursively load that feature
  //         and process its modifiers too (up to depth limit to prevent infinite loops).
  //
  // TWO-PASS TAGGING NOTE:
  //   Some modifiers have conditionNodes that reference @activeTags (e.g., Monk AC bonus).
  //   However, the full activeTags list depends on which features are active.
  //   This is NOT circular because:
  //     - Pass 1: Collect tags from ALL isActive features (no condition checks).
  //     - Pass 2: Evaluate conditions using the Pass 1 tags.
  //   The $derived below implements this two-pass approach.

  /**
   * DAG Phase 0: Flat list of all valid active modifiers.
   *
   * This is the foundational computation. Every subsequent DAG phase reads
   * exclusively from this list (and from character base values).
   *
   * SEPARATION OF ACTIVE VS SITUATIONAL:
   *   Modifiers with `situationalContext` go into `situationalModifiers`.
   *   All others (including conditional ones that currently pass) go into `activeModifiers`.
   *
   * RESOLUTION ORDER for modifier values:
   *   1. String `value` fields are resolved via evaluateFormula() using a PRELIMINARY
   *      context (Phase 0 context — without Phase 2+ derived stats, to avoid cycles).
   *   2. After Phase 2 resolves attributes, a second pass may be needed for formulas
   *      that depend on derived modifier values. This is handled in Phase 3.3.
   *
   * GM OVERRIDE INTEGRATION:
   *   character.gmOverrides are merged into the feature list LAST, giving them
   *   the highest priority in conflict resolution (they are processed after regular
   *   activeFeatures, so their modifiers are added after — and for setAbsolute,
   *   the last one wins).
   *
   * WHY $derived.by() WITH EXPLICIT DEPENDENCY READS?
   *   Svelte 5 tracks reactive dependencies by recording which $state/$derived values
   *   are READ during the execution of a $derived computation. When a private method
   *   (like #computeFlatModifiers) is called from a $derived property and the method
   *   internally reads `this.phase0_context` (another $derived), Svelte 5 may not
   *   correctly register the dependency chain if the method is called from a simple
   *   `$derived(this.#method())` expression.
   *
   *   By using `$derived.by(() => { ... })` and EXPLICITLY reading `this.phase0_activeTags`
   *   and `this.phase0_context` BEFORE calling the helper, we guarantee that Svelte 5's
   *   reactivity system correctly registers both as dependencies of this derived value.
   *   This prevents stale data bugs where `phase0_flatModifiers` fails to re-evaluate
   *   when `phase0_activeTags` or `phase0_context` changes.
   */
  /**
   * Internal combined result from Phase 0 flattening.
   * Contains both the resolved modifier list and the set of disabled instance IDs.
   */
   #phase0_result: { modifiers: FlatModifierEntry[]; disabledInstanceIds: Set<ID> } = $derived.by(() => {
    const activeTags = this.phase0_activeTags;
    const context = this.phase0_context;
    return computePhase0Result(
      this.character.activeFeatures,
      this.character.gmOverrides,
      this.sceneState.activeGlobalFeatures,
      this.character.classLevels,
      this.settings.language,
      activeTags,
      context
    );
  });

  /**
   * DAG Phase 0a: Flat list of all valid modifiers from all active features.
   */
  phase0_flatModifiers: FlatModifierEntry[] = $derived(this.#phase0_result.modifiers);

  /**
   * DAG Phase 0e: Set of feature instance IDs whose `prerequisitesNode` is no longer
   * satisfied at runtime. These features are still "owned" by the character (they remain
   * in `activeFeatures`) but their modifiers are suspended — they do NOT contribute
   * to any pipeline calculation.
   *
   * USE CASE (D&D 3.5):
   *   A character with Two-Weapon Fighting (requires DEX 15) loses Dexterity to a
   *   curse, dropping below 15. The feat is still displayed on the character sheet
   *   (grayed out with a warning) but its bonuses are no longer applied. If the
   *   Dexterity is restored (curse removed), the feat automatically reactivates.
   *
   * The UI checks this set to render disabled features with appropriate visual treatment.
   */
  phase0_disabledFeatureInstanceIds: ReadonlySet<ID> = $derived(this.#phase0_result.disabledInstanceIds);

  /**
   * DAG Phase 0b: All active tags from all active features (flat string array).
   *
   * Built from ALL isActive features (regardless of conditionNode) to provide
   * a complete tag picture for condition evaluation.
   *
   * Used by:
   *   - LogicEvaluator for prerequisite checks (@activeTags has_tag X)
   *   - Phase 0 conditionNode evaluation for modifier filtering
   *   - Feature catalog UI for prerequisite display (Phase 11.4)
   *
   * Includes ALL tags from ALL ACTIVE features' tag arrays, deduplicated.
   */
   phase0_activeTags: string[] = $derived.by(() => {
    // Reading dataLoaderVersion creates a reactive dependency so the entire
    // DAG re-runs when loadRuleSources() completes and new feature data is available.
    void this.dataLoaderVersion;
    return computeActiveTags(
      this.character.activeFeatures,
      this.character.gmOverrides,
      this.sceneState.activeGlobalFeatures
    );
  });

  /**
   * DAG Phase 0c: Character level (sum of all class levels).
   *
   * Formula: Object.values(character.classLevels).reduce((a, b) => a + b, 0)
   *
   * Used by: Phase 3 HP calculation, feat slot calculation (Phase 11.1),
   *          class progression gating, skill max ranks, feat/ASI acquisition.
   *
   * IMPORTANT — This value does NOT include levelAdjustment.
   * For monster PCs, use `eclForXp` when looking up XP thresholds.
   * Feat slots and ability score increases use THIS value (total HD only).
   *
   * @see phase0_eclForXp — for XP-table lookups including Level Adjustment
   */
  phase0_characterLevel: number = $derived(
    Object.values(this.character.classLevels).reduce((sum, lvl) => sum + lvl, 0)
  );

  /**
   * DAG Phase 0c2: Effective Character Level (ECL) for XP table lookups.
   *
   * D&D 3.5 FORMULA:
   *   ECL = sum(classLevels values) + levelAdjustment
   *
   * WHY SEPARATE FROM characterLevel:
   *   Monster PCs (e.g., Gnolls, Drow, Half-Dragons) have racial power that makes
   *   them equivalent to a higher-level character for balance purposes, even though
   *   they may have fewer actual class levels. Their XP requirements are based on ECL,
   *   but feat and ability score increase (ASI) acquisition is governed by total HD
   *   (= classLevels sum only, NOT including levelAdjustment).
   *
   * Math Parser path: `@eclForXp` — used in XP-threshold formulas in config tables
   *                                  and in the Level Up UI (Phase 10.1).
   *
   * EXAMPLES:
   *   - Standard human Fighter 5:       ECL = 5 + 0 = 5
   *   - Drow Rogue 3 (LA +2):           ECL = 3 + 2 = 5 (same effective power)
   *   - Half-Dragon Fighter 4 (LA +3):  ECL = 4 + 3 = 7
   *
   * REDUCING LA VARIANT:
   *   Over time, a character can pay XP to reduce their LA by 1 (after accumulating
   *   3× LA in class levels). This mutates `character.levelAdjustment` in-place,
   *   which automatically cascades to recalculate ECL here via Svelte reactivity.
   *
   * @see character.levelAdjustment — the mutable LA value
   * @see config_xp_table — looked up with eclForXp to find next XP threshold
   * @see SRD: monstersAsRaces.html, variant/races/reducingLevelAdjustments.html
   */
  phase0_eclForXp: number = $derived(
    this.phase0_characterLevel + (this.character.levelAdjustment ?? 0)
  );

  /**
   * DAG Phase 0d: Builds the CharacterContext for formula/logic evaluation.
   *
   * This is the PRELIMINARY context used in Phase 0 formula evaluation.
   * It reads from character base values (not derived stats — those come in Phase 3.3).
   * String formula modifiers that reference derived stats are re-evaluated in Phase 3.3.
   *
   * The context is a SNAPSHOT: reading it multiple times during a single $derived
   * evaluation always returns the same values (no reactive tracking of sub-fields).
   */
  phase0_context: CharacterContext = $derived.by(() => {
    const char = this.character;
    const tags = this.phase0_activeTags;

    // Build attribute snapshot from current base values
    const attributes: CharacterContext['attributes'] = {};
    for (const [id, pipeline] of Object.entries(char.attributes)) {
      attributes[id] = {
        baseValue: pipeline.baseValue,
        totalValue: pipeline.totalValue,
        derivedModifier: pipeline.derivedModifier,
      };
    }

    // Build skill snapshot
    const skills: CharacterContext['skills'] = {};
    for (const [id, skill] of Object.entries(char.skills)) {
      skills[id] = {
        ranks: skill.ranks,
        totalValue: skill.totalValue,
      };
    }

    // Build combatStats snapshot — strip "combatStats." prefix so path resolution works.
    // CharacterContext.combatStats uses FLAT keys (e.g., "base_attack_bonus", not "combatStats.base_attack_bonus").
    // The path @combatStats.base_attack_bonus.totalValue splits into ["combatStats","base_attack_bonus","totalValue"]
    // and indexes context.combatStats["base_attack_bonus"] — which requires the flat key.
    // @see ARCHITECTURE.md section 9.10 — CharacterContext key conventions
    //
    // DEFENSIVE GUARD: `combatStats` and `saves` are NOT stored in save files (they are
    // recomputed by Phase 3 at runtime). Characters loaded from the API/localStorage may
    // lack these fields entirely. Using `?? {}` prevents `Object.entries(undefined)` from
    // throwing a TypeError if `loadCharacter()` is called with a raw API response directly.
    const combatStats: CharacterContext['combatStats'] = {};
    for (const [id, stat] of Object.entries(char.combatStats ?? {})) {
      const flatKey = id.startsWith('combatStats.') ? id.slice('combatStats.'.length) : id;
      combatStats[flatKey] = { totalValue: stat.totalValue };
    }

    // Build saves snapshot — strip "saves." prefix for the same reason.
    // @saves.fortitude.totalValue requires context.saves["fortitude"], not context.saves["saves.fortitude"].
    const saves: CharacterContext['saves'] = {};
    for (const [id, save] of Object.entries(char.saves ?? {})) {
      const flatKey = id.startsWith('saves.') ? id.slice('saves.'.length) : id;
      saves[flatKey] = { totalValue: save.totalValue };
    }

    return {
      attributes,
      skills,
      combatStats,
      saves,
      characterLevel: this.phase0_characterLevel,
      // ECL for XP lookups: classLevels sum + levelAdjustment (for monster PCs).
      // Accessible in formulas as `@eclForXp`.
      // @see ARCHITECTURE.md section 6 — levelAdjustment / eclForXp
      eclForXp: this.phase0_eclForXp,
      classLevels: { ...char.classLevels },
      activeTags: tags,
      // KNOWN LIMITATION: equippedWeaponTags is empty in Phase 0 context.
      // Conditional modifiers referencing @equippedWeaponTags (e.g., Weapon Focus)
      // will see an empty array during Phase 0 formula resolution. These modifiers
      // are correctly evaluated at ROLL TIME by the Dice Engine (which provides the
      // weapon tags via RollContext). Content creators should use conditionNode with
      // @equippedWeaponTags only for roll-time checks, not for sheet-time modifiers.
      equippedWeaponTags: [],
      selection: {}, // Populated per-instance by the conditionNode evaluator
      constants: {},  // Populated by DataLoader config tables (Phase 4.2)
    };
  });

  // ---------------------------------------------------------------------------
  // DAG PHASE 1 — Base & Size Modifiers
  // ---------------------------------------------------------------------------
  //
  // Phase 1 computes size modifiers from the flat modifier list (Phase 0).
  // Size affects AC (to-hit and AC), Grapple, and various other derived stats.
  // This phase is kept separate from Phase 2 so that size modifiers are "frozen"
  // before the main attribute computation reads them.
  //
  // Currently: computes the net size modifier for AC and attack rolls from
  // modifiers targeting "stat_size" pipeline.

  /**
   * DAG Phase 1: Resolved size pipeline.
   *
   * Reads all modifiers targeting "stat_size" from phase0_flatModifiers,
   * applies stacking rules, and returns the resolved pipeline.
   *
   * Size values in D&D 3.5 (applied as modifiers to the base 0):
   *   Fine: +8, Diminutive: +4, Tiny: +2, Small: +1, Medium: 0,
   *   Large: -1, Huge: -2, Gargantuan: -4, Colossal: -8
   *
   * The engine stores these as literal numeric modifiers from Race features.
   * (Zero hardcoding: there's no enum for size — just modifier values in JSON.)
   */
   phase1_sizePipeline: StatisticPipeline = $derived.by(() =>
    buildSizePipeline(this.character.attributes['stat_size'], this.phase0_flatModifiers)
  );

  // ---------------------------------------------------------------------------
  // DAG PHASE 2 — Main Attributes (6 Ability Scores)
  // ---------------------------------------------------------------------------
  //
  // This is the most critical DAG phase. The 6 main ability scores are computed
  // here using the flat modifier list from Phase 0. Their `derivedModifier` values
  // (the "+4" for STR 18) are computed and stored here for use by Phase 3 (combat
  // stats that depend on CON for HP, DEX for AC, etc.).
  //
  // DESIGN: We compute a computed attributes record indexed by pipelineId.
  // Each attribute's pipeline is resolved independently in a loop.
  //
  // INFINITE LOOP PROTECTION:
  //   If a modifier's value is a formula referencing another attribute's derivedModifier
  //   (e.g., Monk WIS-to-AC), this is handled by Phase 0 using the PRELIMINARY context.
  //   The Monk AC bonus is a combatStats modifier, not an attribute modifier, so it
  //   doesn't create a Phase 2 dependency cycle. True attribute→attribute cycles are
  //   detected by the MAX_RESOLUTION_DEPTH guard in #collectModifiersFromInstance.

  /**
   * DAG Phase 2: Resolved attribute pipelines for ALL character attributes.
   *
   * Returns a Record mapping attribute pipelineId → resolved StatisticPipeline.
   *
   * KEY OUTPUT: Each pipeline has a computed `derivedModifier` (the D&D 3.5 mod).
   *   These values are frozen after Phase 2 and read by Phase 3 for:
   *     - DEX modifier → Initiative and AC
   *     - CON modifier → Max HP (per level) and Fortitude save
   *     - STR modifier → Grapple check
   *     - WIS modifier → Will save and (for Monk) AC bonus
   *     - INT modifier → Skill points available
   *
   * MAIN ABILITY SCORE IDs: stat_strength, stat_dexterity, stat_constitution, stat_intelligence, stat_wisdom, stat_charisma
   * Also processes any other attribute pipelines (stat_size, custom homebrew stats).
   */
   phase2_attributes: Record<ID, StatisticPipeline> = $derived.by(() =>
    buildAttributePipelines(this.character.attributes, this.phase0_flatModifiers)
  );

  /**
   * DAG Phase 2b: Updated CharacterContext with Phase 2 attribute values.
   *
   * This "upgraded" context includes the fully resolved attribute totalValues and
   * derivedModifiers from Phase 2. It is used by Phase 3 formulas that reference
   * ability scores (e.g., "CON derivedModifier × characterLevel" for Max HP,
   * "WIS derivedModifier" for Will save base, etc.).
   *
   * WHY A SECOND CONTEXT?
   *   The Phase 0 context used BASE values (pre-modifier) for formula resolution.
   *   Now that attributes are fully resolved, Phase 3 formulas can read accurate values.
   *   Without this upgrade, CON-based formulas in HP modifiers would use stale base values.
   */
   phase2_context: CharacterContext = $derived.by(() =>
    buildPhase2Context(this.phase0_context, this.phase2_attributes)
  );

  // ---------------------------------------------------------------------------
  // DAG PHASE 3 — Combat Statistics & Saving Throws
  // ---------------------------------------------------------------------------
  //
  // This phase computes all combat-related derived values. It is CRITICAL that
  // this phase ONLY reads from phase2_attributes (never directly from character.attributes),
  // because Phase 2 may have modified attribute values (e.g., from a Belt of Constitution).
  //
  // COMBAT STATISTICS COMPUTED HERE:
  //   - AC (normal, touch, flat-footed): DEX modifier applied to AC, armor/shield type routing
  //   - BAB (Base Attack Bonus): accumulated from class levelProgression "base" type modifiers
  //   - Initiative: DEX modifier + any feat modifiers
  //   - Grapple: BAB + STR modifier + size modifier
  //   - Saving Throws (Fort/Ref/Will): class base + ability modifier + misc bonuses
  //   - Max HP: sum of hit dice results + CON modifier × character level
  //   - Movement speeds: land, burrow, climb, fly, swim
  //   - Armor Check Penalty: from equipped armor
  //   - Resistances: SR, PR, Energy Resistances (targetId convention: "combatStats.*")
  //
  // AC TYPE ROUTING:
  //   D&D 3.5 Touch AC ignores armor, shield, and natural_armor bonuses.
  //   Flat-footed AC ignores bonus types that require conscious reaction (DEX, dodge).
  //   The engine handles this by filtering modifier types per AC pipeline:
  //     combatStats.ac_normal:      all active modifier types
  //     combatStats.ac_touch:       exclude armor, shield, natural_armor
  //     combatStats.ac_flat_footed: exclude dodge, dex (DEX modifier is a separate untyped mod)
  //   The DEX modifier to AC is injected as a modifier from the SRD core rules JSON
  //   (with type "untyped" or filtered by conditionNode). For this computation phase,
  //   we apply the GENERAL rule: filter by targetId as declared in the modifier itself.

  /**
   * DAG Phase 3: Resolved combat stat and saving throw pipelines.
    *
    * Returns a Record mapping combatStats and saves pipelineId → resolved StatisticPipeline.
    *
    * READS FROM:
    *   - phase0_flatModifiers (modifier data)
    *   - phase2_attributes (ability derivedModifiers — CON for Fort save, DEX for AC, etc.)
    *   - phase0_characterLevel (for HP formula: CON mod × character level)
    *   - settings.variantRules.gestalt (Phase 3.7 — gestalt mode flag)
    *
    * WRITES TO:
    *   This $derived updates the character sheet data used by the combat UI components.
    *   The character.$state pipelines are NOT mutated; this returns a computed snapshot.
    *   Phase 4 (skills) reads the armor_check_penalty from the output of this phase.
    *
    * GESTALT MODE (Phase 3.7 — `settings.variantRules.gestalt`):
    *   When gestalt is enabled, BAB and save pipelines replace the standard "sum all
    *   base modifiers" path with `computeGestaltBase()` which applies max-per-level
    *   across all active class features before summing.
    *   @see src/lib/utils/gestaltRules.ts — computeGestaltBase() implementation
    *   @see ARCHITECTURE.md section 8.2 — Gestalt variant documentation
    */
    phase3_combatStats: Record<ID, StatisticPipeline> = $derived.by(() =>
     buildCombatStatPipelines(
       this.character.combatStats,
       this.character.saves,
       this.character.hitDieResults,
       this.character.classLevels,
       this.phase0_flatModifiers,
       this.phase2_attributes,
       this.phase0_characterLevel,
       this.settings.variantRules?.gestalt ?? false
     )
   );

  /**
   * DAG Phase 3b: Max HP from the resolved max_hp combat stat pipeline.
   *
   * Convenience accessor. The HP resource pool reads this for the effective max.
   */
  phase3_maxHp: number = $derived(
    this.phase3_combatStats['combatStats.max_hp']?.totalValue ?? 0
  );

  /**
   * DAG Phase 3c: Updated CharacterContext with Phase 3 combat stat values.
   * Used by Phase 4 (skills) formulas that reference combat stats (e.g., synergy bonuses).
   */
   phase3_context: CharacterContext = $derived.by(() =>
    buildPhase3Context(this.phase2_context, this.phase3_combatStats)
  );

  // ---------------------------------------------------------------------------
  // DAG PHASE 4 — Skills & Abilities
  // ---------------------------------------------------------------------------
  //
  // Skills depend on:
  //   - Phase 2 attributes (ability score derivedModifiers as skill key ability)
  //   - Phase 3 armor check penalty (negative modifier for physical skills)
  //   - phase0_activeTags (for isClassSkill determination — active class features' classSkills)
  //   - character.skills[*].ranks (player-invested skill points)
  //
  // SKILL TOTAL FORMULA (D&D 3.5):
  //   Total = ranks + keyAbilityModifier + miscBonuses + armorCheckPenalty (if applicable)
  //
  // CLASS SKILL DETERMINATION:
  //   Collect classSkills arrays from ALL active Features (not just class features —
  //   domains and racial features can also grant class skills).
  //   Union all classSkills arrays. A skill is a class skill if its ID appears in this union.
  //
  // RANK COSTS & MAX RANKS (used by the SkillsMatrix UI in Phase 9.6):
  //   Class skill:       1 sp/rank, max = (characterLevel + 3) ranks
  //   Cross-class skill: 2 sp/rank, max = floor((characterLevel + 3) / 2) ranks
  //
  // NOTE: Skills are populated in character.skills from config tables (Phase 4.2).
  //   Until Phase 4.2, character.skills is empty and this phase produces an empty record.

  /**
   * DAG Phase 4: Set of all skill IDs that are class skills for this character.
   *
   * Built by unioning classSkills arrays from ALL active features (not just classes).
   * The engine reads Feature.classSkills from the DataLoader for each active feature instance.
   * A missing feature (DataLoader stub) contributes nothing (graceful empty skip).
   */
    phase4_classSkillSet: ReadonlySet<ID> = $derived.by(() => {
    void this.dataLoaderVersion;
    return buildClassSkillSet(this.character.activeFeatures, this.character.gmOverrides, this.character.classLevels);
  });

  /**
   * DAG Phase 4: Per-class skill point budget breakdown.
   *
   * D&D 3.5 MULTICLASS SKILL POINT RULES (SRD, "Skills" section):
   *   At EACH CHARACTER LEVEL, the character gains skill points equal to:
   *     max(1, Class_SP_Per_Level + INT_modifier)
   *   ...where "Class_SP_Per_Level" is the base SP/level for the CLASS whose level
   *   was gained at that character level.
   *
   *   INT RETROACTIVITY (SRD, "Intelligence and Skill Points" sidebar):
   *     "If your Intelligence modifier increases … you gain retroactive skill points."
   *     This implementation uses the CURRENT INT modifier for ALL levels — both past
   *     and future. This is the correct SRD interpretation: a permanent INT increase
   *     (from a level-up ASI, a tome, a wish) immediately raises the character's total
   *     SP budget for every level they have already taken, granting the back-pay in full.
   *     Conversely, a permanent INT decrease reduces the budget retroactively.
   *     Temporary INT modifiers (buff spells, conditions) do NOT affect retroactive SP
   *     because they come from situational modifiers, not from the base ability score.
   *
   *   For MULTICLASS characters, each class contributes INDEPENDENTLY:
   *     Fighter 2 SP/level + Rogue 8 SP/level does NOT average to 5 SP/level × total level.
   *     Instead: Fighter contributes (max(1, 2+INT) × fighterLevels) and
   *              Rogue contributes  (max(1, 8+INT) × rogueLevels).
   *
   * BONUS SP/LEVEL SOURCES:
   *   Some sources (e.g., Human racial trait) add a flat bonus to SP/level for ALL levels.
   *   These target `attributes.bonus_skill_points_per_level` instead of
   *   `attributes.skill_points_per_level` — they are applied uniformly per total character level.
   *
   * FIRST LEVEL BONUS:
   *   RAW D&D 3.5 grants 4× SP at character level 1. Since the current data model does not
   *   track class level-up ORDER (only final classLevels counts), the first-level quadrupling
   *   must be acknowledged but cannot be precisely attributed without a level history.
    *   This implementation DOES apply the 4× multiplier automatically for the class
    *   identified as the first class (Object.keys(classLevels)[0]).
    *   `firstLevelBonus = 3 × pointsPerLevel` is added to that class's total points.
    *   The Leveling Journal displays this as a separate "First Level Bonus" line item.
   *
   * HOW CLASS SP ARE IDENTIFIED:
   *   Class features grant a modifier to `attributes.skill_points_per_level`.
   *   The `modifier.sourceId` identifies WHICH class the SP/level comes from.
   *   Matching against `character.classLevels[sourceId]` gives the level count.
   *   Non-class sources (racial, racial features) targeting the same pipeline are
   *   treated as bonus-per-level (since they don't have a matching classLevels entry).
   */
   phase4_skillPointsBudget: SkillPointsBudget = $derived.by(() =>
    buildSkillPointsBudget(
      this.phase0_flatModifiers,
      this.character.classLevels,
      this.phase2_attributes['stat_intelligence']?.derivedModifier ?? 0,
      this.phase0_characterLevel
    )
  );

  /**
   * DAG Phase 4: Leveling journal — per-class contribution breakdown.
   *
   * Used by LevelingJournalModal.svelte to explain which class contributed which
   * bonuses to BAB, saves, and skill points.
   *
   * MULTICLASS ACCOUNTING:
   *   For each class in `character.classLevels`, this phase collects:
   *   1. BAB contribution: sum of "base" type modifiers targeting "combatStats.base_attack_bonus"
   *      from this class's level-gated levelProgression entries.
   *   2. Save contributions: same logic for "saves.fortitude", "saves.reflex", "saves.will".
   *   3. Skill points: taken directly from phase4_skillPointsBudget.
   *   4. Class skills: from the class Feature's `classSkills` array.
   *   5. Granted features: from levelProgression entries up to classLevel.
   *
   * READS FROM:
   *   - phase0_flatModifiers (source BAB and save increments per class)
   *   - phase4_skillPointsBudget (correct per-class SP)
   *   - DataLoader (feature labels and classSkills arrays)
   */
   phase4_levelingJournal: LevelingJournal = $derived.by(() =>
    buildLevelingJournal(
      this.character.classLevels,
      this.phase0_flatModifiers,
      this.phase4_skillPointsBudget,
      this.phase0_characterLevel
    )
  );

  /**
   * Whether the character is at risk of a multiclass XP penalty.
   *
   * D&D 3.5 SRD RULE:
   *   A multiclassed character who has any class more than 1 level behind the
   *   highest class level suffers a 20% XP penalty (for each such class).
   *   Exception: a character's favoured class (or a class with the "any" favoured
   *   class — usually human) is exempt from the penalty.
   *
   * This derivation lives in the engine (not in the Svelte component) to comply
   * with the zero-game-logic-in-Svelte rule (ARCHITECTURE.md §3).
   *
   * CURRENT BEHAVIOUR: returns `true` if ANY class level is more than 1 below
   * the highest class level. Favoured-class exemption is informational only —
   * the GM decides whether to apply the actual penalty.
   *
   * Used by: `LevelingJournalModal.svelte` to show an informational warning.
   */
   phase_multiclassXpPenaltyRisk: boolean = $derived.by(() =>
    computeMulticlassXpPenaltyRisk(this.character.classLevels, this.character.favoredClass)
  );

  /**
   * DAG Phase 4: Resolved skill pipelines.
   *
   * Computes the total value for every skill in character.skills.
   *
   * TOTAL FORMULA:
   *   totalValue = ranks + phase2_attributes[keyAbility].derivedModifier
   *              + sum(active non-situational modifiers)
   *              + (armorCheckPenalty if appliesArmorCheckPenalty)
   *
   * The armor check penalty from phase3_combatStats is read here and injected
   * as a bonus (negative value) for skills with appliesArmorCheckPenalty === true.
   */
    phase4_skills: Record<ID, import('../types/pipeline').SkillPipeline> = $derived.by(() => {
    void this.dataLoaderVersion;
    return buildSkillPipelines(
      this.character.skills,
      this.phase0_flatModifiers,
      this.phase2_attributes,
      this.phase4_classSkillSet,
      this.phase3_combatStats['combatStats.armor_check_penalty']?.totalValue ?? 0
    );
  });

  // ---------------------------------------------------------------------------
  // SAVING THROW CONFIG — Phase 9.5
  // ---------------------------------------------------------------------------
  //
  // Maps each save pipeline ID to its governing ability score.
  // This relationship is defined in the SRD rules data (via the save Feature's
  // grantedModifiers) but for UI display, the component needs the mapping to
  // show which ability score contributes to which save.
  //
  // ARCHITECTURE NOTE:
  //   Moving this out of the Svelte component avoids hardcoded D&D knowledge
  //   in the UI layer. The component reads from engine.savingThrowConfig.

  /**
   * Save pipeline → key ability ID, label, and display config mapping.
   * Consumed by SavingThrowsSummary.svelte and SavingThrows.svelte.
   *
   * DATA-DRIVEN IMPLEMENTATION:
   *   Reads from the `config_save_definitions` JSON config table loaded by the DataLoader.
   *   This allows homebrew systems to define entirely different saves (e.g., an alternate
   *   game with Brawn/Finesse/Focus saves instead of Fort/Ref/Will) by overriding the
   *   table in their rule source JSON — with zero engine code changes.
   *
   *   Reactive via `$derived`: re-evaluates when `dataLoaderVersion` increments
   *   (i.e., after `loadRuleSources()` completes). Components should bind to this
   *   property inside `$derived` (e.g., `const SAVES = $derived(engine.savingThrowConfig)`)
   *   to receive the update from the bootstrap fallback to the JSON-driven values.
   *
   *   FALLBACK: `DEFAULT_SAVE_CONFIG` (D&D 3.5 SRD values) is used when the
   *   `config_save_definitions` table has not yet loaded (bootstrap state).
   *
   * @see DEFAULT_SAVE_CONFIG — hardcoded bootstrap fallback
   * @see SaveConfigEntry — entry type (exported for component prop types)
   * @see static/rules/00_d20srd_core/00_d20srd_core_config_tables.json — authoritative source
   */
   savingThrowConfig: readonly SaveConfigEntry[] = $derived.by(() => {
    void this.dataLoaderVersion;
    return buildSavingThrowConfig();
  });

  // ---------------------------------------------------------------------------
  // MAGIC HELPERS — Phase 12 (Spell Save DC)
  // ---------------------------------------------------------------------------

  /**
   * Computes the Spell Save DC for a given spell level.
   *
   * D&D 3.5 FORMULA: DC = 10 + Spell Level + Key Ability Modifier
   *   (ARCHITECTURE.md section 12.3 and section 5.2)
   *
   * IMPROVED IMPLEMENTATION (MINOR fix #5):
   *   The original implementation blindly took max(WIS, INT, CHA), ignoring the actual
   *   class casting stat. The corrected implementation:
   *
   *   1. If a `spellListId` is provided, look up the `MagicFeature.spellLists[spellListId]`
   *      to find the casting class, then read that class Feature's `castingAbility` tag.
   *      This is future-proof for when class JSON defines its casting stat explicitly.
   *
   *   2. If `keyAbilityId` is explicitly provided (caller knows the stat), use it directly.
   *      This is the most precise call pattern for Grimoire/CastingPanel components.
   *
   *   3. FALLBACK: If neither is provided or the class has no `castingAbility` tag,
   *      default to max(WIS, INT, CHA) — the conservative approach that always produces
   *      the highest possible DC (benefits the caster, never harmful).
   *
   *   WHY TAGS FOR CASTING ABILITY?
   *     Class JSON features include a tag like `"arcane_caster_int"` or `"divine_caster_wis"`
    *     (see test/test_mock.json: class_fighter has tags ["class_fighter", "martial", ...]).
   *     The engine reads the first tag starting with "caster_ability_" to get the stat ID.
   *
   * @param spellLevel   - The level of the spell (0 for cantrips).
   * @param keyAbilityId - Optional: the explicit key ability pipeline ID (e.g., "stat_intelligence").
   *                       If provided, skips tag-based lookup and uses this directly.
   * @returns The computed Spell Save DC.
   */
  getSpellSaveDC(spellLevel: number, keyAbilityId?: ID): number {
    let castingAbilityMod = 0;

    if (keyAbilityId) {
      // Explicit ability provided (most precise — called by CastingPanel per-spell)
      castingAbilityMod = this.phase2_attributes[keyAbilityId]?.derivedModifier ?? 0;
    } else {
      // Attempt to infer casting ability from active class features.
      // Convention: class features have a tag "caster_ability_stat_intelligence" (or _wis, _cha).
      // This follows the zero-hardcoding principle: the casting ability is declared in JSON.
      let foundAbilityId: ID | null = null;
      for (const tag of this.phase0_activeTags) {
        if (tag.startsWith('caster_ability_')) {
          foundAbilityId = tag.slice('caster_ability_'.length); // "stat_intelligence", "stat_wisdom", etc.
          break;
        }
      }

      if (foundAbilityId && this.phase2_attributes[foundAbilityId]) {
        // Found a declared casting ability in the active tags
        castingAbilityMod = this.phase2_attributes[foundAbilityId].derivedModifier;
      } else {
        // FALLBACK: no declared casting ability tag found in active Features.
        // Use max(WIS, INT, CHA) — the three D&D 3.5 casting ability scores.
        //
        // WHY THIS FALLBACK EXISTS:
        //   Class Features SHOULD declare their casting ability via a tag like
        //   "caster_ability_stat_intelligence" (Wizard), "caster_ability_stat_wisdom" (Cleric),
        //   or "caster_ability_stat_charisma" (Sorcerer). When this tag is present, the
        //   primary code path above resolves the correct ability automatically.
        //
        //   This fallback only triggers when NONE of the active Features have a
        //   "caster_ability_*" tag. Using max(WIS, INT, CHA) is a safe conservative
        //   approach: it always produces the highest possible DC (benefits the caster).
        //   It is never harmful (no player would want a LOWER DC).
        //
        // TO ELIMINATE THIS FALLBACK:
        //   Ensure all spellcaster class Features include a tag like:
        //     "caster_ability_stat_wisdom" (divine), "caster_ability_stat_intelligence" (arcane),
        //     or "caster_ability_stat_charisma" (spontaneous arcane/psionic).
        //   See the FeatureChoice documentation in ARCHITECTURE.md section 5.
        //
        // DATA-DRIVEN CASTING ABILITY IDS:
        //   Read from `config_attribute_definitions` using the `isCastingAbility: true` flag.
        //   This replaces the old hardcoded ID check (== 'stat_wisdom' || == 'stat_intelligence'
        //   || == 'stat_charisma'), making the fallback work for any homebrew stat system that
        //   marks its casting abilities with `isCastingAbility: true` in the config table.
        const castingAbilityTable = dataLoader.getConfigTable('config_attribute_definitions');
        const castingAbilityIds: string[] = [];
        if (castingAbilityTable?.data && Array.isArray(castingAbilityTable.data)) {
          for (const row of castingAbilityTable.data as Array<Record<string, unknown>>) {
            const id = row['id'] as string | undefined;
            // Only include rows explicitly flagged as casting ability scores
            if (id && row['isCastingAbility'] === true) {
              castingAbilityIds.push(id);
            }
          }
        }
        // Bootstrap fallback: config table not yet loaded (before first loadRuleSources()).
        // Uses D&D 3.5 SRD mental stats. This only fires during the brief initialization
        // window before the DataLoader completes — not in steady-state operation.
        if (castingAbilityIds.length === 0) {
          castingAbilityIds.push('stat_wisdom', 'stat_intelligence', 'stat_charisma');
        }
        castingAbilityMod = Math.max(
          ...castingAbilityIds.map(id => this.phase2_attributes[id]?.derivedModifier ?? 0)
        );
      }
    }

    return 10 + spellLevel + castingAbilityMod;
  }

  // ---------------------------------------------------------------------------
  // SPELL DICE HELPERS — Phase 12.3 support
  // ---------------------------------------------------------------------------

  /**
   * Returns true if the spell has at least one modifier that targets a damage pipeline.
   *
   * WHY IN THE ENGINE (ARCHITECTURE.md §3 — zero game logic in .svelte files):
   *   "Does this spell deal damage?" is a D&D game rule — it controls whether a dice
   *   roll button appears in CastingPanel.svelte. Moving the check here prevents a
   *   heuristic (`targetId.includes('damage')`) from leaking into the UI layer.
   *
   * @param spell - The MagicFeature to inspect.
   * @returns true when at least one grantedModifier targets a damage pipeline.
   */
  spellHasDamageRoll(spell: import('../types/feature').MagicFeature): boolean {
    return spell.grantedModifiers?.some(m => m.targetId.includes('damage')) ?? false;
  }

  /**
   * Returns the dice formula for the primary damage roll of a spell.
   *
   * Resolution order:
   *   1. The first grantedModifier whose targetId includes "damage" and whose
   *      value is a non-empty string (e.g. "5d6" for Fireball at CL 5).
   *   2. "1d6" as a fallback (content authoring error guard — avoids a broken
   *      roll modal for spells that claim to deal damage but have no dice formula).
   *
   * WHY IN THE ENGINE:
   *   Extracting a formula from Feature modifier data is rule-adjacent logic that
   *   belongs here, not in CastingPanel.svelte (ARCHITECTURE.md §3).
   *
   * @param spell - The MagicFeature whose damage dice to resolve.
   * @returns A valid dice formula string (e.g. "5d6", "2d4", "1d6").
   */
  getSpellDiceFormula(spell: import('../types/feature').MagicFeature): string {
    const damageMod = spell.grantedModifiers?.find(m => m.targetId.includes('damage'));
    if (damageMod && typeof damageMod.value === 'string' && damageMod.value.length > 0) {
      return damageMod.value;
    }
    // Fallback: content authoring error — damage modifier exists but value is not a dice string.
    return '1d6';
  }

  // ---------------------------------------------------------------------------
  // WEAPON ATTACK & DAMAGE HELPERS — Phase 10.4
  // ---------------------------------------------------------------------------
  //
  // These helpers compute the total attack and damage bonuses for a given weapon.
  // They must live in the GameEngine (not in Svelte components) to avoid placing
  // D&D rule logic in the UI layer (ARCHITECTURE.md Critical Coding Guidelines #5).
  //
  // Called by Attacks.svelte when the player selects a weapon.

  /**
   * Reads weapon ability-score defaults from the `config_weapon_defaults` config table.
   *
   * DATA-DRIVEN FALLBACK PATTERN:
   *   1. If the DataLoader has the table loaded, return its values.
   *   2. Otherwise fall back to `DEFAULT_WEAPON_CONFIG` (D&D 3.5 SRD hardcoded defaults).
   *
   * WHY A METHOD AND NOT `$derived`:
   *   `getWeaponAttackBonus()` and `getWeaponDamageBonus()` are called at roll time
   *   (on-demand, not in reactive contexts), so a lightweight synchronous getter is
   *   more appropriate than a Svelte `$derived` subscription.
   *
   * @returns The resolved `WeaponDefaults` — either from the config table or the fallback.
   * @see WeaponDefaults — the return type (exported)
   * @see DEFAULT_WEAPON_CONFIG — the hardcoded SRD fallback
   * @see static/rules/00_d20srd_core/00_d20srd_core_config_tables.json — JSON source
   */
  getWeaponDefaults(): WeaponDefaults {
    const table = dataLoader.getConfigTable('config_weapon_defaults');
    if (table?.data && Array.isArray(table.data) && table.data.length > 0) {
      const rows = table.data as Array<Record<string, unknown>>;
      // Build a lookup map from "key" to row for O(1) access per field
      const byKey = new Map(rows.map(r => [r['key'] as string, r]));

      const meleeAtk  = byKey.get('meleeAttackAbility')?.['abilityId']         as string | undefined;
      const rangedAtk = byKey.get('rangedAttackAbility')?.['abilityId']         as string | undefined;
      const meleeDmg  = byKey.get('meleeDamageAbility')?.['abilityId']          as string | undefined;
      const twoHanded = byKey.get('twoHandedDamageMultiplier')?.['value']        as number | undefined;

      // Only override if at least one key was found (partial config tables are valid)
      if (meleeAtk || rangedAtk || meleeDmg || twoHanded !== undefined) {
        return {
          meleeAttackAbility:        meleeAtk  ?? DEFAULT_WEAPON_CONFIG.meleeAttackAbility,
          rangedAttackAbility:       rangedAtk ?? DEFAULT_WEAPON_CONFIG.rangedAttackAbility,
          meleeDamageAbility:        meleeDmg  ?? DEFAULT_WEAPON_CONFIG.meleeDamageAbility,
          twoHandedDamageMultiplier: twoHanded ?? DEFAULT_WEAPON_CONFIG.twoHandedDamageMultiplier,
        };
      }
    }
    return DEFAULT_WEAPON_CONFIG;
  }

  /**
   * Extracts the numerical enhancement bonus from an ItemFeature's granted modifiers.
   *
   * D&D 3.5 RULE:
   *   A weapon's enhancement bonus is stored as an `enhancement`-type modifier
   *   targeting `base_attack_bonus`. This function sums all such modifiers to
   *   produce the weapon's effective enhancement bonus (e.g. +1, +2, +5).
   *
   * WHY IN THE ENGINE:
   *   Filtering `grantedModifiers` by `type === 'enhancement'` is D&D game logic
   *   and must not appear in Attacks.svelte
   *   (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *
   * @param feature - The ItemFeature to inspect.
   * @returns The total enhancement bonus (0 when no matching modifiers exist).
   * @see src/lib/components/combat/Attacks.svelte — display consumer
   */
  getWeaponEnhancementBonus(feature: { grantedModifiers?: Array<{ type: string; value: unknown; targetId: string }> }): number {
    return (feature.grantedModifiers ?? [])
      .filter(m => m.type === 'enhancement' && m.targetId.includes('base_attack_bonus'))
      .reduce((sum, m) => sum + (typeof m.value === 'number' ? m.value : 0), 0);
  }

  /**
   * Determines whether a weapon item is a ranged weapon.
   *
   * D&D 3.5 SRD RULE:
   *   A weapon is considered ranged when it either:
   *     1. Carries the "ranged" category tag (explicit ranged categorisation in the rule JSON), OR
   *     2. Has a `rangeIncrementFt` value greater than 0 (thrown/projectile weapon with a
   *        range increment defined by its data, even without an explicit tag).
   *
   * WHY IN THE ENGINE:
   *   This classification drives real game decisions (which ability score applies to attack,
   *   whether point-blank shot and other ranged feats apply, etc.). Per ARCHITECTURE.md §3,
   *   all game logic must reside in `GameEngine.svelte.ts` or utility functions rather than
   *   being inlined in Svelte components. Components call this method and receive a boolean.
   *
   * @param feature - The ItemFeature to classify. Must have `tags` and `weaponData` defined.
   * @returns `true` if the weapon is ranged; `false` for melee.
   * @see src/lib/components/combat/Attacks.svelte — display consumer
   * @see src/lib/utils/constants.ts — RANGED_CATEGORY_TAG
   */
  isWeaponRanged(feature: { tags?: string[]; weaponData?: { rangeIncrementFt?: number } }): boolean {
    // Check 1: explicit "ranged" tag (most common — ranged weapons carry this tag in JSON data).
    if ((feature.tags ?? []).includes('ranged')) return true;
    // Check 2: non-zero range increment (handles thrown weapons like javelins and daggers that
    // may not always carry the "ranged" tag but DO have a rangeIncrementFt value in weaponData).
    if ((feature.weaponData?.rangeIncrementFt ?? 0) > 0) return true;
    return false;
  }

  /**
   * Determines whether an ItemFeature is a weapon that should appear in the
   * attack panel.
   *
   * D&D 3.5 RULE:
   *   An item is a weapon when it has both `weaponData` (attack/damage statistics)
   *   AND carries either the 'weapon' (melee) or 'ranged' category tag.
   *
   * WHY IN THE ENGINE:
   *   Tag-based weapon classification is game-domain logic that must not appear
   *   in Attacks.svelte (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *   Previously Attacks.svelte called `feature.tags.some(t => t === WEAPON_CATEGORY_TAG
   *   || t === RANGED_CATEGORY_TAG)` directly, which embedded tag-based classification
   *   in the component. This method centralises it in the engine layer.
   *
   * @param feature - The ItemFeature to classify.
   * @returns `true` if the item is a weapon; `false` otherwise.
   * @see src/lib/components/combat/Attacks.svelte — display consumer
   */
  isItemWeapon(feature: ItemFeature): boolean {
    if (!feature.weaponData) return false;
    return feature.tags.some(t => t === WEAPON_CATEGORY_TAG || t === RANGED_CATEGORY_TAG);
  }

  /**
   * Computes the total attack bonus for a weapon.
   * Formula: BAB + ability modifier (melee or ranged per `config_weapon_defaults`) + enhancement.
   *
   * DATA-DRIVEN:
   *   The governing ability for melee and ranged attacks is read from the
   *   `config_weapon_defaults` config table. In standard D&D 3.5, melee uses STR
   *   and ranged uses DEX, but homebrew rule sources can remap these to any stat
   *   by overriding `config_weapon_defaults` in their JSON without any code changes.
   *
   * @param enhancement  - Weapon's enhancement bonus (integer).
   * @param isRanged     - If true, uses the ranged attack ability; else melee attack ability.
   * @returns The total attack bonus as a number.
   * @see getWeaponDefaults — reads `config_weapon_defaults` with SRD fallback
   */
  getWeaponAttackBonus(enhancement: number, isRanged: boolean): number {
    const bab = this.phase3_combatStats['combatStats.base_attack_bonus']?.totalValue ?? 0;
    const defaults = this.getWeaponDefaults();
    const attackAbilityId = isRanged
      ? defaults.rangedAttackAbility
      : defaults.meleeAttackAbility;
    const abilityMod = this.phase2_attributes[attackAbilityId]?.derivedModifier ?? 0;
    return bab + abilityMod + enhancement;
  }

  /**
   * Computes the damage bonus for a weapon.
   * Formula: melee damage ability modifier (×multiplier for two-handed grip) + enhancement.
   *
   * DATA-DRIVEN:
   *   The damage ability and two-handed multiplier are read from `config_weapon_defaults`.
   *   D&D 3.5 defaults: STR for damage, ×1.5 for two-handed (rounded down).
   *   Ranged weapons deal 0 from ability (handled via weapon modifiers if needed,
   *   e.g. the Mighty bow quality granting a STR-based bonus modifier).
   *
   * D&D 3.5 RULES IMPLEMENTED:
   *   - One-handed / light:   full damage ability modifier
   *   - Two-handed:           damage ability modifier × `twoHandedDamageMultiplier` (floor)
   *   - Ranged (pass isTwoHanded=false, enhancement only): caller should pass STR bonus
   *     separately if applicable (e.g., Mighty bow)
   *
   * @param enhancement   - Weapon's enhancement bonus (integer).
   * @param isTwoHanded   - If true, applies the two-handed damage multiplier.
   * @returns The total damage bonus as a number.
   * @see getWeaponDefaults — reads `config_weapon_defaults` with SRD fallback
   */
  getWeaponDamageBonus(enhancement: number, isTwoHanded: boolean): number {
    const defaults = this.getWeaponDefaults();
    const damageAbilityId = defaults.meleeDamageAbility;
    const abilityMod = this.phase2_attributes[damageAbilityId]?.derivedModifier ?? 0;
    const baseDamageMod = isTwoHanded
      ? Math.floor(abilityMod * defaults.twoHandedDamageMultiplier)
      : abilityMod;
    return baseDamageMod + enhancement;
  }

  /**
   * The effective unarmed strike statistics for the active character.
   *
   * D&D 3.5 RULE (ARCHITECTURE.md §10, SRD p. 139):
   *   A Medium character deals 1d3 damage on an unarmed strike (×2 crit, threat 20).
   *   Class features (Monk improved unarmed strike) can override the damage die via a
   *   `setAbsolute` modifier targeting `combatStats.unarmed_damage_dice`. This property
   *   reads that pipeline and falls back to the `item_unarmed_strike` feature data, then
   *   to SRD defaults.
   *
   * WHY A $DERIVED (not a method):
   *   The unarmed damage die depends on character level and active class features, so it
   *   must re-evaluate reactively as the character changes.
   *
   * WHY IN THE ENGINE (not Attacks.svelte):
   *   Hardcoding `damageDice: '1d3'` in a .svelte component violates the
   *   zero-hardcoding rule (ARCHITECTURE.md §6). The SRD data defines
   *   `item_unarmed_strike` in the rule JSON files; reading from it ensures GMs can
   *   override unarmed stats without touching TypeScript.
   *
   * @see static/rules/00_d20srd_core/07_d20srd_core_equipment_weapons.json — item_unarmed_strike
   * @see Attacks.svelte — display consumer
   */
  phase_unarmedStrike: { damageDice: string; critRange: string; critMultiplier: number } = $derived.by(() => {
    // 1. Check for class-feature override on the `combatStats.unarmed_damage_dice` pipeline.
    //    A Monk's Improved Unarmed Strike grants a setAbsolute modifier with the scaling die.
    const overridePipeline = this.phase3_combatStats['combatStats.unarmed_damage_dice'];
    if (overridePipeline && typeof overridePipeline.totalValue === 'string' && overridePipeline.totalValue !== '') {
      return {
        damageDice: overridePipeline.totalValue as string,
        critRange: '20',
        critMultiplier: 2,
      };
    }

    // 2. Read from `item_unarmed_strike` feature loaded from rule files.
    const unarmedFeature = dataLoader.getFeature('item_unarmed_strike') as (import('../types/feature').ItemFeature) | undefined;
    const wd = unarmedFeature?.weaponData;
    if (wd) {
      return {
        damageDice: wd.damageDice,
        critRange: wd.critRange,
        critMultiplier: wd.critMultiplier,
      };
    }

    // 3. Absolute fallback: SRD defaults for a Medium character (ARCHITECTURE.md §10).
    //    This only fires during the brief init window before DataLoader completes.
    return { damageDice: '1d3', critRange: '20', critMultiplier: 2 };
  });

  // ---------------------------------------------------------------------------
  // EQUIPMENT SLOTS — Phase 13.1 / Phase 3.1
  // ---------------------------------------------------------------------------
  //
  // Equipment slots define how many items of each type the character can equip.
  // The slot counts are proper StatisticPipeline entries in `character.combatStats`
  // (initialised in `createEmptyCharacter()` with D&D 3.5 SRD defaults) and are
  // processed through the standard Phase 3 DAG. This means:
  //   1. Slot counts are accessible via the ModifierBreakdownModal.
  //   2. Features can grant extra slots via standard grantedModifiers targeting
  //      "slots.<name>" (e.g., an exotic race granting extra ring slots).
  //   3. The Phase 3 stacking rules handle the accumulation uniformly.
  //
  // Default values (from Phase 3 baseValue in createEmptyCharacter):
  //   head: 1, eyes: 1, neck: 1, torso: 1, body: 1, waist: 1, shoulders: 1
  //   arms: 1, hands: 1, ring: 2 (two ring fingers), feet: 1, main_hand: 1, off_hand: 1
  //
  // @see ARCHITECTURE.md §3.1 — "Initialize all default pipeline maps: ... equipment slot pipelines"

  /**
   * Resolved equipment slot maximums, read from the Phase 3 StatisticPipeline outputs.
   *
   * These are proper pipeline entries in `character.combatStats` (not a plain Record),
   * so modifier breakdowns are available via the standard pipeline machinery.
   *
   * Used by the Inventory tab (Phase 13.3) to enforce item slot limits.
   */
   phase_equipmentSlots: Record<string, number> = $derived.by(() =>
    buildEquipmentSlots(this.phase3_combatStats)
  );

  /**
   * The current count of equipped items per slot.
   * Used by Phase 13.3 to check if a slot is full before equipping.
   */
   phase_equippedSlotCounts: Record<string, number> = $derived.by(() =>
    buildEquippedSlotCounts(this.character.activeFeatures)
  );

  /**
   * Checks whether an item can be equipped given the current slot availability.
   *
   * D&D 3.5 RULES:
   *   - A two-handed weapon requires BOTH `main_hand` AND `off_hand` slots to be free.
   *   - Other items require the appropriate slot to have at least one free space.
   *   - Psionic tattoos are limited to 20 simultaneously worn (ARCHITECTURE.md §15.3).
   *
   * WHY IN THE ENGINE:
   *   Slot availability arithmetic (comparing equipped counts vs max slots) is D&D
   *   game logic that must not appear in InventoryTab.svelte
   *   (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *
   * @param itemFeat - The ItemFeature to check.
   * @returns `{ ok: true, blocker: null }` if the item can be equipped, or
   *          `{ ok: false, blocker, slotName? }` with a blocker key that the
   *          component translates via `ui()`.
   *
   * Blocker values:
   *   `'tattoo_limit'`   — psionic tattoo limit (20) already reached
   *   `'two_hands_full'` — two-handed item: main_hand or off_hand slot is full
   *   `'slot_full'`      — target equipment slot is full (slotName = slot name)
   *
   * @see src/lib/components/inventory/InventoryTab.svelte — display consumer
   * @see ARCHITECTURE.md §15.3 — psionic tattoo limit
   */
  getEquipCheckResult(itemFeat: ItemFeature): {
    ok: boolean;
    blocker: 'tattoo_limit' | 'two_hands_full' | 'slot_full' | null;
    slotName?: string;
  } {
    const slot = itemFeat.equipmentSlot;
    if (!slot || slot === 'none') return { ok: true, blocker: null };

    // Psionic tattoo: max 20 simultaneously worn (D&D 3.5 rule, ARCHITECTURE.md §15.3)
    const MAX_PSIONIC_TATTOOS = 20;
    if (itemFeat.psionicItemData?.psionicItemType === 'psionic_tattoo') {
      const tattooCount = this.character.activeFeatures.filter(afi =>
        afi.isActive &&
        (dataLoader.getFeature(afi.featureId) as ItemFeature | undefined)
          ?.psionicItemData?.psionicItemType === 'psionic_tattoo'
      ).length;
      if (tattooCount >= MAX_PSIONIC_TATTOOS) {
        return { ok: false, blocker: 'tattoo_limit' };
      }
    }

    // Two-handed items require BOTH main_hand AND off_hand slots to be free
    if (slot === 'two_hands') {
      const mainFull = (this.phase_equippedSlotCounts['slots.main_hand'] ?? 0) >=
                       (this.phase_equipmentSlots['slots.main_hand'] ?? 1);
      const offFull  = (this.phase_equippedSlotCounts['slots.off_hand'] ?? 0) >=
                       (this.phase_equipmentSlots['slots.off_hand'] ?? 1);
      if (mainFull || offFull) return { ok: false, blocker: 'two_hands_full' };
      return { ok: true, blocker: null };
    }

    // Standard slot: check if the target slot has space
    const slotKey = `slots.${slot}`;
    const current = this.phase_equippedSlotCounts[slotKey] ?? 0;
    const max     = this.phase_equipmentSlots[slotKey] ?? 1;
    if (current >= max) return { ok: false, blocker: 'slot_full', slotName: slot };
    return { ok: true, blocker: null };
  }

  // ---------------------------------------------------------------------------
  // ENCUMBRANCE AUTO-DISPATCH — Architecture §9 Phase 1 / §13
  // ---------------------------------------------------------------------------
  //
  // D&D 3.5 encumbrance: characters carrying too much weight suffer penalties.
  // The engine computes total carried weight, looks up the carrying capacity
  // config table using the resolved STR score, and determines the load tier.
  //
  // If Medium or Heavy load is detected, synthetic condition features
  // ("condition_medium_load" or "condition_heavy_load") are auto-managed in
  // the character's activeFeatures. These condition features provide tags
  // (medium_load, heavy_load) that other features' conditionNodes can check
  // (e.g., Monk AC bonus suppressed when heavy_load, Barbarian Fast Movement
  // suppressed when heavy_load).
  //
  // NOTE ON DAG ORDERING:
  //   Encumbrance depends on STR (Phase 2) for the carrying capacity lookup.
  //   Architecture §9 places it in Phase 1, but STR isn't available until Phase 2.
  //   This implementation computes it after Phase 2 as a reactive $effect that
  //   adds/removes condition features. The $effect mutation triggers a full
  //   re-derivation of Phase 0+, so conditionNode checks in Phase 0 will see
  //   the encumbrance tags on the SECOND pass. Infinite loop protection
  //   (MAX_RESOLUTION_DEPTH = 3) ensures this stabilizes.
  //
  // @see ARCHITECTURE.md section 9, Phase 1: Encumbrance
  // @see ARCHITECTURE.md section 13: "automatically dispatch a situational
  //   condition_encumbered feature to the engine"

  /**
   * Total carried weight in lbs.
   * Sums `weightLbs` of all active non-stashed ItemFeature instances.
   * Items in Storage/Stashed (isStashed = true) do NOT count.
   *
   * @see ARCHITECTURE.md section 13.2: "Storage/Stashed — does not contribute to weight"
   */
  phase2b_totalCarriedWeight: number = $derived.by(() => {
    let total = 0;
    for (const afi of this.character.activeFeatures) {
      // Stashed items (in storage) do NOT contribute to carried weight
      if (afi.isStashed) continue;
      const feat = dataLoader.getFeature(afi.featureId);
      if (!feat || feat.category !== 'item') continue;
      total += (feat as import('../types/feature').ItemFeature).weightLbs ?? 0;
    }
    // D&D 3.5 RULE: Coins count toward encumbrance at 50 coins = 1 lb (PHB p.149).
    // This ensures `phase2b_encumbranceTier` and `phase_isEncumbered` correctly
    // reflect carried coin weight (ARCHITECTURE.md §3 — no game logic in .svelte files).
    const w = this.character.wealth;
    if (w) {
      total += computeCoinWeight(w.cp, w.sp, w.gp, w.pp);
    }
    return total;
  });

  /**
   * Weight of all coins the character is carrying, in lbs.
   *
   * D&D 3.5 RULE: 50 coins = 1 lb, regardless of denomination (PHB p.149).
   * This is intentionally surfaced as an engine $derived so that Encumbrance.svelte
   * does not need to call `computeCoinWeight()` directly (zero-game-logic-in-Svelte
   * rule, ARCHITECTURE.md §3).
   *
   * Returns 0 when the character has no wealth data.
   */
  phase_coinWeightLbs: number = $derived.by(() => {
    const w = this.character.wealth;
    if (!w) return 0;
    return computeCoinWeight(w.cp, w.sp, w.gp, w.pp);
  });

  /**
   * Total wealth value in gold pieces (GP), converted from all denominations.
   *
   * D&D 3.5 exchange: 1 PP = 10 GP, 1 SP = 0.1 GP, 1 CP = 0.01 GP (PHB p.112).
   * Surfaced as an engine $derived so Encumbrance.svelte does not call
   * `computeWealthInGP()` directly (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *
   * Returns 0 when the character has no wealth data.
   */
  phase_totalWealthGP: number = $derived.by(() => {
    const w = this.character.wealth;
    if (!w) return 0;
    return computeWealthInGP(w.cp, w.sp, w.gp, w.pp);
  });

  /**
   * Current encumbrance tier based on carried weight vs STR-derived carrying capacity.
   *
   * Returns 0 (light), 1 (medium), 2 (heavy), or 3 (overloaded).
   * Returns -1 if the carrying capacity config table is not loaded.
   *
   * Uses `config_carrying_capacity` config table (Annex B.2) to look up thresholds
   * by the character's resolved STR totalValue from Phase 2.
   */
  phase2b_encumbranceTier: number = $derived.by(() => {
    const strTotal = this.phase2_attributes['stat_strength']?.totalValue ?? 10;
    const table = dataLoader.getConfigTable('config_carrying_capacity');
    if (!table?.data) return -1;

    const rows = table.data as Array<Record<string, unknown>>;
    const row = rows.find(r => r['strength'] === strTotal);
    if (!row) return -1;

    const light  = (row['lightLoad']  as number) ?? 0;
    const medium = (row['mediumLoad'] as number) ?? 0;
    const heavy  = (row['heavyLoad']  as number) ?? 0;

    const w = this.phase2b_totalCarriedWeight;
    if (w > heavy)  return 3; // overloaded
    if (w > medium) return 2; // heavy
    if (w > light)  return 1; // medium
    return 0; // light
  });

  /**
   * Whether the character is encumbered (Medium load or heavier).
   *
   * D&D 3.5 RULE: A Medium load (tier ≥ 1) imposes the Encumbered condition,
   * applying armor check penalties and reducing movement speed (PHB p.162).
   *
   * Exposed here so Encumbrance.svelte does not embed the threshold comparison
   * (a game rule) directly in the component (zero-game-logic-in-Svelte rule,
   * ARCHITECTURE.md §3).
   */
  phase_isEncumbered: boolean = $derived(this.phase2b_encumbranceTier >= 1);

  /**
   * Carrying capacity thresholds (in lbs) for the character's current STR score.
   *
   * Returns `{ light, medium, heavy }` from the `config_carrying_capacity` table.
   * Returns `{ light: 0, medium: 0, heavy: 0 }` when the table is not loaded.
   *
   * WHY IN THE ENGINE:
   *   Looking up a config table using a resolved stat value (STR) is D&D game logic.
   *   The zero-game-logic-in-Svelte rule (ARCHITECTURE.md §3) requires this to be
   *   computed here, not in `Encumbrance.svelte`.
   *
   * @see phase2b_totalCarriedWeight — the weight to compare against these thresholds
   * @see phase2b_encumbranceTier   — the resulting tier (0=Light, 1=Medium, 2=Heavy, 3=Overloaded)
   * @see src/lib/components/inventory/Encumbrance.svelte — display consumer
   */
  phase_carryingCapacity: { light: number; medium: number; heavy: number } = $derived.by(() => {
    const strTotal = this.phase2_attributes['stat_strength']?.totalValue ?? 10;
    const table    = dataLoader.getConfigTable('config_carrying_capacity');
    if (!table?.data) return { light: 0, medium: 0, heavy: 0 };

    const rows = table.data as Array<Record<string, unknown>>;
    const row  = rows.find(r => r['strength'] === strTotal);
    if (!row) return { light: 0, medium: 0, heavy: 0 };

    return {
      light:  (row['lightLoad']  as number) ?? 0,
      medium: (row['mediumLoad'] as number) ?? 0,
      heavy:  (row['heavyLoad']  as number) ?? 0,
    };
  });

  /**
   * Reactive encumbrance condition manager.
   *
   * Watches `phase2b_encumbranceTier` and auto-adds/removes synthetic
   * condition features in `character.activeFeatures`:
   *   - tier >= 1: adds "condition_medium_load" (tags: ["medium_load"])
   *   - tier >= 2: adds "condition_heavy_load"  (tags: ["heavy_load"])
   *   - tier >= 1: adds "condition_encumbered"  (grants armor-check penalty, speed reduction)
   *   - tier < 1:  removes all three conditions
   *
   * These synthetic features are identified by well-known instanceIds so they
   * can be managed without affecting player-added features.
   *
   * WHY condition_encumbered IS MANAGED HERE (not in Encumbrance.svelte):
   *   Per ARCHITECTURE.md §3 and §13, reactive condition dispatch is game
   *   logic that belongs in the engine. Encumbrance.svelte previously managed
   *   this as a $effect, which violated the zero-game-logic-in-Svelte rule.
   *   Moving it here is the correct placement alongside the other encumbrance
   *   conditions. The condition_encumbered feature grants the actual penalty
   *   modifiers (movement speed reduction, skill/attack check penalties) via
   *   its grantedModifiers in the rule JSON — no values are hardcoded here.
   *
   * IMPORTANT: Mutating character.activeFeatures triggers a full DAG
   * re-derivation. The infinite loop protection (MAX_RESOLUTION_DEPTH = 3)
   * ensures this converges because encumbrance conditions don't change STR,
   * so the second pass produces the same tier.
   */
  readonly #encumbranceEffect = $effect.root(() => {
    $effect(() => {
      const tier = this.phase2b_encumbranceTier;
      if (tier < 0) return; // config table not loaded, don't touch features

      const features = this.character.activeFeatures;
      const hasMedium     = features.some(f => f.instanceId === 'enc_auto_medium_load');
      const hasHeavy      = features.some(f => f.instanceId === 'enc_auto_heavy_load');
      const hasEncumbered = features.some(f => f.instanceId === CONDITION_ENCUMBERED_INSTANCE_ID && f.isActive);

      const needMedium     = tier >= 1;
      const needHeavy      = tier >= 2;
      // condition_encumbered is active whenever tier >= 1 (Medium or heavier load).
      // Only add it when the rule file is loaded so phantom instances are avoided.
      const needEncumbered = tier >= 1 && !!dataLoader.getFeature(CONDITION_ENCUMBERED_FEATURE_ID);

      // Only mutate if the current state doesn't match the desired state
      if (hasMedium === needMedium && hasHeavy === needHeavy && hasEncumbered === needEncumbered) return;

      // Build the new feature list
      // Remove any existing auto-encumbrance entries first
      const filtered = features.filter(f =>
        f.instanceId !== 'enc_auto_medium_load' &&
        f.instanceId !== 'enc_auto_heavy_load' &&
        f.instanceId !== CONDITION_ENCUMBERED_INSTANCE_ID
      );

      if (needMedium) {
        filtered.push({
          instanceId: 'enc_auto_medium_load',
          featureId:  'condition_medium_load',
          isActive:   true,
        });
      }
      if (needHeavy) {
        filtered.push({
          instanceId: 'enc_auto_heavy_load',
          featureId:  'condition_heavy_load',
          isActive:   true,
        });
      }
      if (needEncumbered) {
        filtered.push({
          instanceId: CONDITION_ENCUMBERED_INSTANCE_ID,
          featureId:  CONDITION_ENCUMBERED_FEATURE_ID,
          isActive:   true,
        });
      }

      // Replace the array to trigger reactivity
      this.character.activeFeatures = filtered;
    });
  });

  // ---------------------------------------------------------------------------
  // MAGIC RESOURCES — Phase 12.1
  // ---------------------------------------------------------------------------
  //
  // Caster Level and Manifester Level are derived from class levelProgression modifiers
  // that target "stat_caster_level" and "stat_manifester_level" pipelines.
  //
  // These pipelines are automatically resolved by phase2_attributes because those
  // pipeline IDs are initialized in createEmptyCharacter().

  /**
   * Caster Level: reads from phase2_attributes["stat_caster_level"].totalValue.
   * Governed by class-granted "base" modifiers on the caster_level pipeline.
   */
  phase_casterLevel: number = $derived(
    this.phase2_attributes['stat_caster_level']?.totalValue ?? 0
  );

  /**
   * Manifester Level: reads from phase2_attributes["stat_manifester_level"].totalValue.
   * Used for psionic power point calculations and augmentation caps.
   */
  phase_manifesterLevel: number = $derived(
    this.phase2_attributes['stat_manifester_level']?.totalValue ?? 0
  );

  /**
   * Maximum spell level the character can cast, derived from Caster Level.
   *
   * D&D 3.5 FORMULA: max spell level = floor(casterLevel / 2)
   *   - CL 1–2 → Spell Level 0 (only cantrips)
   *   - CL 3–4 → Spell Level 1
   *   - CL 9    → Spell Level 4
   *   - CL 18+  → Spell Level 9
   *
   * This is computed here (not in Grimoire.svelte) to uphold the zero-game-logic-
   * in-Svelte rule from ARCHITECTURE.md §1 and §21. The Grimoire reads this
   * derived value directly rather than re-implementing the formula.
   *
   * IMPORTANT: "0" here means the character can still cast cantrips (level 0 spells).
   * A character with CL 0 (non-caster) would also return 0, so the Grimoire must
   * distinguish the two cases using the presence of known magic features.
   *
   * @see src/lib/components/magic/Grimoire.svelte — Grimoire component consumer
   */
  phase_maxSpellLevel: number = $derived(
    Math.max(0, Math.floor(this.phase_casterLevel / 2))
  );

  /**
   * Set of spell list IDs that the character has access to through their active classes.
   *
   * A spell list ID follows the convention `"list_<classId>"` where `<classId>` is
   * derived from the class feature's ID by stripping the `"class_"` prefix.
   * Example: class "class_wizard" → spell list "list_wizard".
   *
   * A class is considered a spellcasting class when it has modifiers targeting
   * any pipeline starting with `"resources.spell_slots_"` in either its
   * `grantedModifiers` array OR in any `levelProgression` entry's `grantedModifiers`.
   *
   * WHY IN THE ENGINE:
   *   The logic of identifying which classes grant which spell lists is D&D game
   *   knowledge. It must not appear in Grimoire.svelte (zero-game-logic-in-Svelte
   *   rule, ARCHITECTURE.md §3). Grimoire.svelte reads this Set and filters the
   *   spell catalog against it.
   *
   * EXAMPLE:
   *   Active class "class_wizard" has spell slot modifiers → "list_wizard" is added.
   *   Active class "class_fighter" has no spell slot modifiers → not included.
   *
   * @see src/lib/components/magic/Grimoire.svelte — display consumer
   */
  phase_activeSpellListIds: Set<string> = $derived.by(() => {
    const listIds = new Set<string>();
    for (const afi of this.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feat = dataLoader.getFeature(afi.featureId);
      if (!feat || feat.category !== 'class') continue;
      // Check both top-level grantedModifiers and levelProgression entries.
      const allModifiers = [
        ...(feat.grantedModifiers ?? []),
        ...(feat.levelProgression ?? []).flatMap(e => e.grantedModifiers),
      ];
      const hasSpellSlots = allModifiers.some(m =>
        m.targetId.startsWith('resources.spell_slots_')
      );
      if (hasSpellSlots) {
        // Strip the "class_" prefix to derive the spell list ID.
        listIds.add(`list_${feat.id.replace('class_', '')}`);
      }
    }
    return listIds;
  });

  /**
   * Effective DEX bonus to AC, respecting the max_dexterity_bonus cap.
   *
   * D&D 3.5 FORMULA: min(DEX_modifier, combatStats.max_dexterity_bonus.totalValue)
   *
   * - No armor equipped: max_dex_bonus.totalValue = 99 (uncapped) → returns full DEX modifier.
   * - Chain mail (cap +2): min(DEX_mod, 2) → DEX is capped at +2.
   * - DEX mod 0 or negative: already below cap → result is the DEX modifier itself.
   *
   * WHY HERE AND NOT IN ArmorClass.svelte?
   *   The checkpoint (CHECKPOINTS.md §2, Section 7) requires the UI to display the
   *   effective DEX to AC. Computing `Math.min()` of two engine values in a Svelte
   *   template would violate the zero-game-logic-in-Svelte rule. This derived property
   *   encapsulates the cap logic in the engine where it belongs.
   *
   * @see src/lib/components/combat/ArmorClass.svelte — display consumer
   * @see ARCHITECTURE.md §4.17 — max_dexterity_bonus pipeline specification
   */
  phase_effectiveDexToAC: number = $derived.by(() => {
    const dexMod = this.phase2_attributes['stat_dexterity']?.derivedModifier ?? 0;
    const maxDex = this.phase3_combatStats['combatStats.max_dexterity_bonus']?.totalValue ?? 99;
    return Math.min(dexMod, maxDex);
  });

  /**
   * CON modifier contribution to Maximum HP.
   *
   * D&D 3.5 FORMULA: CON_derivedModifier × character_level (class levels only, not ECL).
   *
   * This is the portion of Max HP that comes purely from the Constitution modifier.
   * The value changes reactively when CON is modified (magic item, ability damage, etc.)
   * or when the character gains a new class level.
   *
   * WHY HERE AND NOT IN HealthAndXP.svelte?
   *   Computing `conMod * engine.phase0_characterLevel` in a Svelte component violates
   *   the zero-game-logic-in-Svelte rule (ARCHITECTURE.md §1). All D&D formulae that
   *   combine engine values must live in the engine layer.
   *
   * DISPLAY USE:
   *   HealthAndXP.svelte shows this as a tooltip label (e.g., "CON contrib: +12")
   *   so the player understands how much of their Max HP comes from Constitution.
   *
   * @see src/lib/components/combat/HealthAndXP.svelte — display consumer
   */
  phase3_conHpContrib: number = $derived(
    (this.phase2_attributes['stat_constitution']?.derivedModifier ?? 0) *
    this.phase0_characterLevel
  );

  /**
   * Maximum Wound Points for the character when using the Vitality/Wound-Points
   * optional rule (ARCHITECTURE.md §10, Extension H).
   *
   * D&D 3.5 V/WP RULE:
   *   Max Wound Points = Constitution score (not modifier — the score itself).
   *   A character with CON 14 has 14 Wound Points maximum.
   *
   * Used by `HealthAndXP.svelte` to cap the Wound Points bar. Centralised here
   * so the Svelte component never needs to hard-code `'stat_constitution'` or
   * read the pipeline directly (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *
   * Note: when V/WP mode is disabled this value is still computed but unused.
   *
   * @see phase2_attributes — source of the CON pipeline
   * @see src/lib/components/combat/HealthAndXP.svelte — primary consumer
   */
  phase_maxWoundPoints: number = $derived(
    this.phase2_attributes['stat_constitution']?.totalValue ?? 10
  );

  /**
   * Maximum skill ranks for a class skill at the current character level.
   *
   * D&D 3.5 FORMULA: characterLevel + 3
   *   At level 5: max ranks = 8.
   *   At level 10: max ranks = 13.
   *
   * Used by SkillsMatrix.svelte to clamp rank inputs. Centralised here so the
   * D&D formula is never duplicated in Svelte components.
   *
   * @see phase_maxCrossClassSkillRanks — cross-class equivalent
   * @see src/lib/components/abilities/SkillsMatrix.svelte — primary consumer
   */
  phase_maxClassSkillRanks: number = $derived(
    this.phase0_characterLevel + 3
  );

  /**
   * Maximum skill ranks for a cross-class skill at the current character level.
   *
   * D&D 3.5 FORMULA: floor((characterLevel + 3) / 2)
   *   At level 5: max cross-class ranks = 4.
   *   At level 10: max cross-class ranks = 6 (with floor rounding).
   *
   * Half of the class-skill cap, floored. A cross-class skill costs 2 SP per rank
   * and is capped at half the class-skill max.
   *
   * @see phase_maxClassSkillRanks — class-skill equivalent
   */
  phase_maxCrossClassSkillRanks: number = $derived(
    Math.floor((this.phase0_characterLevel + 3) / 2)
  );

  // ---------------------------------------------------------------------------
  // HP STATUS — Character vitality state (ARCHITECTURE.md Phase 10.1)
  // ---------------------------------------------------------------------------

  /**
   * The character's HP status key, derived from current HP relative to max HP
   * and Constitution score (D&D 3.5 SRD death/dying/unconscious thresholds).
   *
   * STATUS THRESHOLDS (D&D 3.5 SRD):
   *   "dead"        — currentHp ≤ −CON (permanently dead without resurrection)
   *   "dying"       — currentHp < 0 and > −CON (unconscious, losing 1 hp/round)
   *   "unconscious" — currentHp = 0 (stable but unconscious)
   *   "bloodied"    — currentHp ≤ 25% of max (heavily wounded)
   *   "injured"     — currentHp ≤ 50% of max (significantly wounded)
   *   "healthy"     — currentHp > 50% of max (fit for combat)
   *   "unknown"     — HP pool does not exist (character not fully initialised)
   *
   * WHY IN THE ENGINE:
   *   The dead threshold (−CON) is a D&D rule, not a display concern.
   *   Moving it here upholds the zero-game-logic-in-Svelte architectural rule.
   *
   * @see HealthAndXP.svelte — display consumer; maps status key to color + ui() label
   */
  phase_hpStatusKey: 'dead' | 'dying' | 'unconscious' | 'bloodied' | 'injured' | 'healthy' | 'unknown'
    = $derived.by(() => {
      const hp = this.character.resources['resources.hp'];
      const maxHp = this.phase3_maxHp;
      if (!hp || maxHp <= 0) return 'unknown';
      const currentHp = hp.currentValue;
      const conScore = this.phase2_attributes['stat_constitution']?.totalValue ?? 10;
      if (currentHp <= -conScore) return 'dead';
      if (currentHp  <  0)        return 'dying';
      if (currentHp === 0)        return 'unconscious';
      const frac = currentHp / maxHp;
      if (frac <= 0.25) return 'bloodied';
      if (frac <= 0.50) return 'injured';
      return 'healthy';
    });

  // ---------------------------------------------------------------------------
  // HP / VP / WP PERCENTAGE PROPERTIES — Phase 10.1
  // ---------------------------------------------------------------------------
  //
  // These mirror the XP percentage pattern (phase_xpPercent): mathematical
  // calculations (division, Math.max / Math.min) are forbidden in .svelte files
  // by the zero-game-logic-in-Svelte rule (ARCHITECTURE.md §3). Moving them here
  // keeps HealthAndXP.svelte purely declarative.
  //
  // @see phase_xpPercent — XP bar percentage (same architectural pattern)
  // @see src/lib/components/combat/HealthAndXP.svelte — display consumer

  /**
   * Standard HP bar fill percentage (0–100), clamped.
   * Used to set `--hp-pct` CSS custom property on the `.hp-bar__fill` element.
   */
  phase_hpPercent: number = $derived.by(() => {
    const hp  = this.character.resources['resources.hp'];
    const max = this.phase3_maxHp;
    if (!hp || max <= 0) return 0;
    return Math.max(0, Math.min(100, (hp.currentValue / max) * 100));
  });

  /**
   * Temporary HP overlay percentage relative to effective max HP (maxHp + tempHp).
   * Used to set `--temp-pct` CSS custom property for the temp-HP visual overlay.
   */
  phase_tempHpPercent: number = $derived.by(() => {
    const hp  = this.character.resources['resources.hp'];
    const max = this.phase3_maxHp;
    if (!hp || max <= 0) return 0;
    const temp        = hp.temporaryValue ?? 0;
    const effectiveMax = max + temp;
    return effectiveMax > 0 ? (temp / effectiveMax) * 100 : 0;
  });

  /**
   * Vitality Points bar fill percentage (0–100), clamped.
   * Only meaningful when the Vitality/Wound Points variant rule is active.
   * Used to set `--vp-pct` CSS custom property on the vitality bar.
   */
  phase_vpPercent: number = $derived.by(() => {
    const pool = this.character.resources['resources.vitality_points'];
    const max  = this.phase3_combatStats['combatStats.max_vitality']?.totalValue ?? 0;
    if (!pool || max <= 0) return 0;
    return Math.max(0, Math.min(100, (pool.currentValue / max) * 100));
  });

  /**
   * Wound Points bar fill percentage (0–100), clamped.
   * Max WP = CON score. Only meaningful when V/WP variant rule is active.
   * Used to set `--wp-pct` CSS custom property on the wound-points bar.
   */
  phase_wpPercent: number = $derived.by(() => {
    const pool = this.character.resources['resources.wound_points'];
    const max  = this.phase_maxWoundPoints;
    if (!pool || max <= 0) return 0;
    return Math.max(0, Math.min(100, (pool.currentValue / max) * 100));
  });

  // ---------------------------------------------------------------------------
  // LEVEL ADJUSTMENT — ECL management helpers
  // ---------------------------------------------------------------------------

  /**
   * Whether the character is eligible to pay XP to reduce their Level Adjustment.
   *
   * D&D 3.5 SRD VARIANT RULE (Unearthed Arcana):
   *   A character may buy off 1 LA if they have accumulated at least
   *   3 × current_LA class levels. The cost is a quantity of XP equal to the
   *   XP required to advance one level at their current ECL.
   *
   * WHY IN THE ENGINE:
   *   The "3×LA class levels" threshold is a D&D rule. Moving it here
   *   upholds the zero-game-logic-in-Svelte architectural rule so that the
   *   HealthAndXP component only reads a boolean from the engine.
   *
   * @see HealthAndXP.svelte — display consumer (shows the Reduce LA button)
   */
  phase_canReduceLA: boolean = $derived(
    (this.character.levelAdjustment ?? 0) > 0 &&
    this.phase0_characterLevel >= (this.character.levelAdjustment ?? 0) * 3
  );

  // ---------------------------------------------------------------------------
  // XP THRESHOLD PROPERTIES — Phase 10.1
  // ---------------------------------------------------------------------------
  //
  // All XP threshold lookups live here so that HealthAndXP.svelte contains zero
  // game logic (ARCHITECTURE.md §3, zero-game-logic-in-Svelte rule). The component
  // reads these $derived values directly instead of querying config tables or
  // performing arithmetic on game data.
  //
  // The lookup key is `phase0_eclForXp` (not characterLevel) because monster PCs
  // with LA > 0 need more XP to level than standard PCs at the same class-level.
  // @see phase0_eclForXp  — ECL = classLevels sum + levelAdjustment

  /**
   * XP required to have reached the START of the character's current ECL level.
   * Used as the left edge of the XP progress bar ("floor" of the current level).
   *
   * Looks up `config_xp_thresholds[eclForXp].xpRequired`.
   * Returns 0 when no config table is loaded (graceful degradation).
   *
   * @see HealthAndXP.svelte — display consumer
   */
  phase_currentLevelXp: number = $derived.by(() => {
    const level = this.phase0_eclForXp;
    const table = dataLoader.getConfigTable('config_xp_thresholds');
    if (!table?.data) return 0;
    const rows = table.data as Array<Record<string, unknown>>;
    const row = rows.find(r => r['level'] === level);
    return typeof row?.['xpRequired'] === 'number' ? row['xpRequired'] : 0;
  });

  /**
   * XP required to reach the NEXT ECL level (current ECL + 1).
   * Used as the right edge of the XP progress bar and the level-up threshold.
   *
   * Returns 999999 when no config table is loaded or the character is at the
   * maximum tabulated level. This sentinel value is intentionally finite (not
   * Infinity) so the UI can display it numerically.
   *
   * @see HealthAndXP.svelte — display consumer (shows "X / Y XP" text)
   */
  phase_nextLevelXp: number = $derived.by(() => {
    const level = this.phase0_eclForXp;
    const table = dataLoader.getConfigTable('config_xp_thresholds');
    if (!table?.data) return 999999;
    const rows = table.data as Array<Record<string, unknown>>;
    const row = rows.find(r => r['level'] === level + 1);
    return typeof row?.['xpRequired'] === 'number' ? row['xpRequired'] : 999999;
  });

  /**
   * XP earned within the current ECL level.
   * = character.xp − phase_currentLevelXp (the level's XP floor).
   * Used as the numerator of the XP progress bar.
   *
   * @see HealthAndXP.svelte — display consumer (progress bar aria-valuenow)
   */
  phase_xpIntoLevel: number = $derived(
    (this.character.xp ?? 0) - this.phase_currentLevelXp
  );

  /**
   * Total XP span of the current ECL level (from floor to ceiling).
   * = phase_nextLevelXp − phase_currentLevelXp.
   * Used as the denominator of the XP progress bar (aria-valuemax).
   *
   * @see HealthAndXP.svelte — display consumer
   */
  phase_xpNeeded: number = $derived(
    this.phase_nextLevelXp - this.phase_currentLevelXp
  );

  /**
   * Progress percentage through the current ECL level (clamped 0–100).
   * Used to set the CSS custom property `--progress-pct` on the XP progress bar.
   *
   * WHY IN THE ENGINE:
   *   `Math.max / Math.min` are mathematical calculations that the checkpoint
   *   explicitly forbids in `.svelte` files. Moving the percentage here keeps
   *   HealthAndXP.svelte purely declarative.
   *
   * @see HealthAndXP.svelte — display consumer (--progress-pct CSS property)
   */
  phase_xpPercent: number = $derived(
    this.phase_xpNeeded > 0
      ? Math.max(0, Math.min(100, (this.phase_xpIntoLevel / this.phase_xpNeeded) * 100))
      : 0
  );

  /**
   * Whether the character has accumulated enough XP to level up.
   * True when character.xp ≥ phase_nextLevelXp.
   *
   * @see HealthAndXP.svelte — display consumer (shows Level Up button)
   */
  phase_canLevelUp: boolean = $derived(
    (this.character.xp ?? 0) >= this.phase_nextLevelXp
  );

  /**
   * Whether the `config_xp_thresholds` config table has been loaded.
   * Exposed so HealthAndXP.svelte can show a config hint without accessing
   * the DataLoader directly from the template.
   *
   * @see HealthAndXP.svelte — display consumer (config hint paragraph)
   */
  phase_xpTableLoaded: boolean = $derived(
    dataLoader.getConfigTable('config_xp_thresholds') !== undefined
  );

  /**
   * Total skill points spent on the current skill rank allocation.
   *
   * D&D 3.5 COSTS:
   *   - Class skill:       1 SP per rank
   *   - Cross-class skill: 2 SP per rank
   *
   * This is computed here (not in SkillsMatrix.svelte) because the SP cost rule
   * is D&D game logic. Keeping it in the engine upholds zero-game-logic-in-Svelte.
   *
   * @see phase4_skillPointsBudget.totalAvailable — the budget to compare against
   * @see src/lib/components/abilities/SkillsMatrix.svelte — display consumer
   */
  phase4_skillPointsSpent: number = $derived.by(() => {
    let total = 0;
    for (const skill of Object.values(this.phase4_skills)) {
      total += skill.ranks * (skill.isClassSkill ? 1 : 2);
    }
    return total;
  });

  /**
   * Skill points remaining (budget − spent).
   *
   * Exposed as an engine-derived property so Svelte components do not need
   * to perform arithmetic on engine-provided values (zero-game-logic-in-Svelte
   * rule, ARCHITECTURE.md §3).
   */
  phase4_skillPointsRemaining: number = $derived(
    this.phase4_skillPointsBudget.totalAvailable - this.phase4_skillPointsSpent
  );

  /**
   * Whether the character has exceeded their skill point budget.
   * Drives the "over budget" warning styling in SkillsMatrix.
   */
  phase4_skillPointsBudgetExceeded: boolean = $derived(this.phase4_skillPointsRemaining < 0);

  /**
   * Set of skill IDs where the current ranks are at or below the locked minimum
   * floor (i.e., the player cannot reduce the ranks further).
   *
   * WHY IN THE ENGINE:
   *   Computing `skill.ranks <= minimumRanks && minimumRanks > 0` for each skill
   *   is game-domain logic involving character model fields. Per ARCHITECTURE.md §3,
   *   this comparison must not appear as an inline `@const` expression in Svelte
   *   templates. SkillsMatrix.svelte reads this set to toggle the "Locked" badge
   *   and the amber border on the rank input.
   *
   * @see src/lib/components/abilities/SkillsMatrix.svelte — display consumer
   */
  phase4_skillsAtMinimum: ReadonlySet<ID> = $derived.by(() => {
    const result = new Set<ID>();
    for (const [skillId, skillData] of Object.entries(this.character.skills)) {
      const minRanks = this.character.minimumSkillRanks?.[skillId] ?? 0;
      if (minRanks > 0 && skillData.ranks <= minRanks) {
        result.add(skillId);
      }
    }
    return result;
  });

  /**
   * All resource pools related to spell slots and power points.
   * Filtered from character.resources by key prefix "resources.spell_slots_" or "resources.power_points".
   * Used by the Spells/Powers tab to render casting resources.
   */
  phase_magicResources = $derived.by(() => {
    return Object.entries(this.character.resources)
      .filter(([key]) =>
        key.startsWith('resources.spell_slots') ||
        key.startsWith('resources.power_points')
      )
      .map(([, pool]) => pool);
  });

  // ---------------------------------------------------------------------------
  // FEAT SLOTS — Phase 11.1
  // ---------------------------------------------------------------------------
  //
  // D&D 3.5 FEAT SLOT FORMULA:
  //   Base:  1 + floor(characterLevel / 3)   (1 at level 1, 2 at level 3, etc.)
  //   Bonus: Sum of modifiers targeting "attributes.bonus_feat_slots"
  //          (Human +1, Fighter bonus feats, etc.)
  //
  // FEAT SLOTS CONSUMED:
  //   = number of activeFeatures with category "feat" that are NOT in
  //     phase4_grantedFeatIds (i.e., manually selected, not auto-granted).

  /**
   * Total available feat slots.
   * Formula: 1 + floor(characterLevel / 3) + bonus slots from features.
   */
   phase4_featSlots: number = $derived.by(() =>
    computeFeatSlots(this.phase0_characterLevel, this.phase0_flatModifiers)
  );

  /**
   * Set of feat Feature IDs that were GRANTED automatically by Race/Class.
   * These feats do NOT consume a player feat slot.
   */
   phase4_grantedFeatIds: ReadonlySet<string> = $derived.by(() =>
    computeGrantedFeatIds(this.character.activeFeatures, this.character.classLevels)
  );

  /**
   * Number of manually selected feats (consume a slot).
   * Feats in phase4_grantedFeatIds are excluded.
   */
   phase4_manualFeatCount: number = $derived.by(() =>
    computeManualFeatCount(this.character.activeFeatures, this.phase4_grantedFeatIds)
  );

  /** Remaining feat slots (total − manual count). */
  phase4_featSlotsRemaining: number = $derived(
    this.phase4_featSlots - this.phase4_manualFeatCount
  );

  // ---------------------------------------------------------------------------
  // ACTION BUDGET — Engine-side computation (ARCHITECTURE.md §5.6)
  // ---------------------------------------------------------------------------

  /**
   * Effective action budget: min-wins across all active action-restricting conditions.
   *
   * D&D 3.5 conditions like Staggered, Disabled, Paralysed restrict the number of
   * standard, move, swift, etc. actions available each round. Each condition feature
   * carries an `actionBudget` block specifying limits per category. When multiple
   * conditions apply, the most restrictive (minimum) limit wins.
   *
   * `Infinity` means no restriction for that action category.
   *
   * WHY IN THE ENGINE:
   *   Computing `Math.min()` across game-feature values is game logic. It must not
   *   live in Svelte components (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3,
   *   CHECKPOINTS.md §2 §1). ActionBudgetBar.svelte reads this derived value directly.
   *
   * @see src/lib/components/combat/ActionBudgetBar.svelte — display consumer
   * @see ARCHITECTURE.md §5.6 — action budget min-wins rule
   */
   phase_effectiveActionBudget: Record<string, number> = $derived.by(() =>
    computeEffectiveActionBudget(this.character.activeFeatures)
  );

  /**
   * Whether any active feature has the `action_budget_xor` tag.
   *
   * When true, ActionBudgetBar applies XOR mutual exclusion: spending a standard
   * action blocks move actions (and vice versa) for the rest of the turn. This
   * models the Staggered / Disabled condition where the character may use EITHER
   * a standard OR a move action — not both.
   *
   * @see src/lib/components/combat/ActionBudgetBar.svelte — display consumer
   * @see ARCHITECTURE.md §5.6 — XOR rule specification
   */
   phase_actionBudgetHasXOR: boolean = $derived.by(() =>
    computeActionBudgetHasXOR(this.character.activeFeatures)
  );

  /**
   * Localized names of the condition features that hard-block each action category.
   *
   * A category is hard-blocked when its effective budget is 0.
   * Returns a comma-separated list of the blocking condition names (translated),
   * or an empty string when the category is not blocked.
   *
   * WHY IN THE ENGINE:
   *   Resolving feature IDs → localized names via `this.t()` is an engine operation.
   *   Doing it inside a Svelte component would violate the zero-game-logic rule.
   *
   * @see src/lib/components/combat/ActionBudgetBar.svelte — display consumer
   */
   phase_actionBudgetBlockers: Record<string, string> = $derived.by(() =>
    computeActionBudgetBlockers(this.character.activeFeatures, this.settings.language)
  );

  // ---------------------------------------------------------------------------
  // DISPLAY HELPERS — Pure display computations kept in the engine layer
  // ---------------------------------------------------------------------------

  /**
   * Computes the displayed AC value for a given pipeline plus an optional
   * temporary display modifier.
   *
   * WHY IN THE ENGINE:
   *   The UI "Quick temp modifier" input in ArmorClass.svelte lets the player
   *   preview AC with a temporary buff/condition applied. Adding a modifier to
   *   a pipeline value — even for display-only purposes — is arithmetic on game
   *   statistics and must not appear in Svelte templates
   *   (zero-game-logic rule, ARCHITECTURE.md §3).
   *
   * NOTE: `tempMod` is a local UI state value (not persisted, not affecting
   *   character data). The engine method is used solely to keep the arithmetic
   *   out of the Svelte template.
   *
   * @param pipelineId - The combatStats pipeline ID (e.g., 'combatStats.ac_normal').
   * @param tempMod    - A quick temporary display modifier from the AC panel input (default 0).
   * @returns The total AC value to display, including the temporary modifier.
   *
   * @see src/lib/components/combat/ArmorClass.svelte — display consumer
   * @see ARCHITECTURE.md §4.14 — AC pipeline specification
   */
  getDisplayAc(pipelineId: string, tempMod: number = 0): number {
    const pipeline = this.phase3_combatStats[pipelineId];
    return (pipeline?.totalValue ?? 0) + tempMod;
  }

  /**
   * Returns the display value for any `combatStats` pipeline, adding an optional
   * temporary modifier (e.g., a quick "misc" input typed by the player).
   *
   * This is the generic equivalent of `getDisplayAc()` for pipelines outside the
   * three AC variants — energy resistances, spell resistance, fortification, etc.
   *
   * WHY IN THE ENGINE:
   *   Adding a temporary modifier to a pipeline value is arithmetic on game data.
   *   Keeping this in the engine upholds the zero-game-logic-in-Svelte rule
   *   (ARCHITECTURE.md §3) so Resistances.svelte does not perform arithmetic.
   *
   * @param pipelineId - Any `phase3_combatStats` pipeline ID.
   * @param tempMod    - Optional flat temporary modifier to add (default 0).
   * @returns The pipeline's `totalValue` plus `tempMod`.
   *
   * @see src/lib/components/combat/Resistances.svelte — display consumer
   */
  getPipelineDisplayValue(pipelineId: string, tempMod: number = 0): number {
    const pipeline = this.phase3_combatStats[pipelineId];
    return (pipeline?.totalValue ?? 0) + tempMod;
  }

  /**
   * Returns the effective (display) level of a magic feature (spell or power)
   * on the character's active spell lists.
   *
   * D&D 3.5 RULE: A spell may appear on multiple spell lists at different levels
   * (e.g., Fireball is a Wizard/Sorcerer 3rd-level spell and a Fire Domain 3rd-level
   * spell). The "effective level" is the level at which the character can cast it
   * based on their active spell list. When on multiple active lists, the minimum
   * level (i.e., the easiest access path) is returned.
   *
   * WHY IN THE ENGINE:
   *   Computing `Math.min()` across game data values is game logic. Grimoire.svelte
   *   must not contain this arithmetic (zero-game-logic-in-Svelte rule,
   *   ARCHITECTURE.md §3). The Grimoire filter and display both delegate here.
   *
   * @param spellLists - The spell's `spellLists` map (list ID → level).
   * @returns The minimum level for this spell across all lists; 0 if the map is empty.
   *
   * @see src/lib/components/magic/Grimoire.svelte — display consumer
   * @see src/lib/components/magic/CastingPanel.svelte — display consumer
   * @see ARCHITECTURE.md §12 — spell system
   */
  getSpellEffectiveLevel(spellLists: Record<string, number> | undefined): number {
    if (!spellLists) return 0;
    const values = Object.values(spellLists);
    if (values.length === 0) return 0;
    return Math.min(...values);
  }

  /**
   * Returns the Concentration check DC required to suppress a psionic power's
   * physical or mental displays while manifesting it.
   *
   * D&D 3.5 SRD RULE (Expanded Psionics Handbook §7):
   *   Suppress display DC = 15 + power level.
   *   This DC applies when a manifester wants to mask the sights, sounds, or smells
   *   produced while manifesting a psionic power (auditory, material, mental,
   *   olfactory, or visual displays).
   *
   * WHY IN THE ENGINE:
   *   The formula `15 + power level` is a D&D game rule. CastingPanel.svelte must
   *   not embed D&D formulas (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *
   * @param spellLists - The power's `spellLists` map (list ID → level).
   * @returns The DC to suppress the power's displays.
   *
   * @see src/lib/components/magic/CastingPanel.svelte — display consumer
   * @see ARCHITECTURE.md §12.3 — psionic display suppression
   */
  getPsionicSuppressDC(spellLists: Record<string, number> | undefined): number {
    const level = this.getSpellEffectiveLevel(spellLists);
    // D&D 3.5 SRD: suppress DC = 15 + power level
    return 15 + (isFinite(level) ? level : 0);
  }

  /**
   * Computes the total extra PP cost for augmenting a psionic power by `steps`
   * augmentation increments.
   *
   * D&D 3.5 RULE (Expanded Psionics Handbook §7):
   *   Each augmentation entry has a `costIncrement` (the PP cost per increment).
   *   When a manifester spends `steps` increments on an augmentation, the total
   *   extra PP = sum of (costIncrement × steps) across all augmentation entries.
   *
   * WHY IN THE ENGINE:
   *   This arithmetic involves game values (PP costs from feature data) and must
   *   not appear in a Svelte component (zero-game-logic-in-Svelte, ARCHITECTURE.md §3).
   *   CastingPanel.svelte delegates here and only manages the `steps` UI state.
   *
   * @param augmentations - The power's augmentation entries.
   * @param steps         - How many augmentation increments the player has selected.
   * @returns Total extra PP cost for the selected number of steps.
   *
   * @see src/lib/components/magic/CastingPanel.svelte — display consumer (augSteps local state)
   */
  getPsionicAugmentCost(
    augmentations: Array<{ costIncrement: number }> | undefined,
    steps: number
  ): number {
    if (!augmentations?.length || steps <= 0) return 0;
    return augmentations.reduce((sum, aug) => sum + (aug.costIncrement * steps), 0);
  }

  /**
   * Maximum number of augmentation steps available for a psionic power.
   *
   * D&D 3.5 FORMULA: floor(manifesterLevel − basePpCost) steps, minimum 0.
   *   A psion with ML 5 manifesting a 3-PP power can augment at most 2 extra steps.
   *
   * WHY IN THE ENGINE:
   *   The subtraction `manifesterLevel − basePpCost` is D&D arithmetic and must not
   *   appear in CastingPanel.svelte (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *   Math.max(0, …) is also forbidden in .svelte files per the same rule.
   *
   * @param basePpCost - The power's base PP cost before augmentation.
   * @returns Maximum augmentation steps (≥ 0).
   */
  getMaxAugmentSteps(basePpCost: number): number {
    return Math.max(0, this.phase_manifesterLevel - basePpCost);
  }

  /**
   * Returns the total PP cost to manifest a psionic power with the selected
   * number of augmentation increments.
   *
   * FORMULA: basePpCost + augmentCost(steps)
   *
   * WHY IN THE ENGINE:
   *   The addition of base PP cost and augmentation cost is D&D game arithmetic
   *   that must not appear in CastingPanel.svelte
   *   (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *
   * @param basePpCost   - The power's minimum PP cost (before augmentation).
   * @param augmentations - The power's augmentation entries.
   * @param steps         - How many augmentation increments the player selected.
   * @returns Total PP cost for this manifestation.
   */
  getTotalManifestCost(
    basePpCost: number,
    augmentations: Array<{ costIncrement: number }> | undefined,
    steps: number
  ): number {
    return basePpCost + this.getPsionicAugmentCost(augmentations, steps);
  }

  /**
   * Returns true if the player can add one more augmentation increment.
   *
   * D&D 3.5 RULES:
   *   1. The new total PP cost must not exceed the manifester level (you cannot
   *      spend more PP than your manifester level in a single manifestation).
   *   2. The current step count must not exceed the maximum step limit
   *      (floor(manifesterLevel − basePpCost) steps, computed by getMaxAugmentSteps).
   *
   * WHY IN THE ENGINE:
   *   Both comparisons involve D&D game values and must not appear in
   *   CastingPanel.svelte (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *
   * @param basePpCost    - The power's minimum PP cost.
   * @param currentSteps  - Number of augmentation increments currently selected.
   * @param currentTotal  - Total PP cost at the current step count.
   * @returns true when another increment can be added.
   */
  canAddAugmentStep(
    basePpCost: number,
    currentSteps: number,
    currentTotal: number
  ): boolean {
    if (currentTotal >= this.phase_manifesterLevel) return false;
    if (currentSteps >= this.getMaxAugmentSteps(basePpCost)) return false;
    return true;
  }

  /**
   * Determines whether a scroll entry can be cast by this character.
   *
   * D&D 3.5 RULES (ARCHITECTURE.md §12.3):
   *   1. The character must have the appropriate spell type (arcane or divine),
   *      signalled by the `arcane_caster` or `divine_caster` active tag.
   *   2. If the character's caster level is lower than the scroll's CL, a caster
   *      level check is required (DC = scroll.casterLevel + 1).
   *
   * WHY IN THE ENGINE:
   *   The CL comparison, DC formula, and caster-type tag lookup are D&D game logic
   *   that must not appear in CastingPanel.svelte
   *   (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *
   * @param spellType - `'arcane'` or `'divine'`
   * @param scrollCL  - The scroll's caster level.
   * @returns `{
   *   canUse:       true if the character can attempt to use the scroll;
   *   needsClCheck: true if a d20 caster level check is required;
   *   checkDC:      caster level check DC (scrollCL + 1);
   *   wrongType:    true if the character lacks the required spell type.
   * }`
   *
   * @see src/lib/components/magic/CastingPanel.svelte — display consumer
   * @see ARCHITECTURE.md §12.3 — scroll use rules
   */
  getScrollUseInfo(spellType: 'arcane' | 'divine', scrollCL: number): {
    canUse: boolean;
    needsClCheck: boolean;
    checkDC: number;
    wrongType: boolean;
  } {
    const charCL    = this.phase_casterLevel;
    const hasArcane = this.phase0_activeTags.includes('arcane_caster');
    const hasDivine = this.phase0_activeTags.includes('divine_caster');
    const hasType   = spellType === 'arcane' ? hasArcane : hasDivine;

    if (!hasType) {
      return { canUse: false, needsClCheck: false, checkDC: scrollCL + 1, wrongType: true };
    }

    // CL check required when wielder CL < scroll CL (D&D 3.5 rule)
    const needsCheck = charCL < scrollCL;
    return { canUse: true, needsClCheck: needsCheck, checkDC: scrollCL + 1, wrongType: false };
  }

  // ---------------------------------------------------------------------------
  // PREREQUISITE EVALUATION — Engine-level delegation (ARCHITECTURE.md §3)
  // ---------------------------------------------------------------------------

  /**
   * Evaluates the prerequisite tree of any feature against the current character
   * context.
   *
   * WHY IN THE ENGINE:
   *   Prerequisite evaluation is game logic (ARCHITECTURE.md §3). Svelte files
   *   must not call `evaluateLogicNode()` from the logicEvaluator utility directly.
   *   Instead, they call this engine method which returns the full result
   *   (passed/fail + met/error messages) without leaking game logic into the
   *   component layer.
   *
   * @param feature - The Feature object to evaluate prerequisites for.
   *                  If `undefined` or has no `prerequisitesNode`, returns `passed: true`.
   * @returns An `EvaluationResult` with `passed`, `metMessages`, and `errorMessages`.
   */
  evaluateFeaturePrerequisites(feature: Feature | undefined): EvaluationResult {
    return evaluateLogicNode(feature?.prerequisitesNode, this.phase2_context, this.lang);
  }

  // ---------------------------------------------------------------------------
  // CUSTOM DR — Engine factory for dynamically-created DR features
  // ---------------------------------------------------------------------------

  /**
   * Creates and activates a custom Damage Reduction feature.
   *
   * WHY IN THE ENGINE:
   *   DamageReduction.svelte previously built the Feature object inline, which
   *   embedded D&D modifier types and hardcoded label strings in a Svelte file.
   *   Delegating to this method keeps both the feature construction and the
   *   LocalizedString labels out of the component (ARCHITECTURE.md §3, §6).
   *
   * @param value     - DR value (e.g. 5 for "DR 5/magic").
   * @param bypassTag - Bypass material/tag string (e.g. "magic", "—").
   * @param type      - 'damage_reduction' (best-wins) or 'base' (class additive).
   */
  addCustomDR(value: number, bypassTag: string, type: 'damage_reduction' | 'base' = 'damage_reduction'): void {
    if (value <= 0) return;
    const bypass   = bypassTag === '—' ? '—' : bypassTag;
    const drId     = `dr_custom_${value}_${bypass}_${Date.now()}`;
    // Build fully-localized labels from UI_STRINGS templates so any loaded
    // locale (fr, de, …) is reflected without hardcoding per-language strings.
    const applyVars = (tmpl: string) =>
      tmpl.replace('{value}', String(value)).replace('{bypass}', bypass);
    const drLabel: import('../types/i18n').LocalizedString = Object.fromEntries(
      Object.entries(buildLocalizedString('dr.label_template')).map(([l, t]) => [l, applyVars(t)])
    );
    const drDescription: import('../types/i18n').LocalizedString = Object.fromEntries(
      Object.entries(buildLocalizedString('dr.description_template')).map(([l, t]) => [l, applyVars(t)])
    );
    dataLoader.cacheFeature({
      id:       drId,
      category: 'condition',
      label:    drLabel,
      description: drDescription,
      tags:     ['condition', 'damage_reduction', drId],
      grantedModifiers: [{
        id:         `${drId}_mod`,
        sourceId:   drId,
        sourceName: drLabel,
        targetId:   'combatStats.damage_reduction',
        value,
        type,
        drBypassTags: type === 'damage_reduction' ? (bypass === '—' ? [] : [bypass]) : undefined,
      }],
      grantedFeatures: [],
      ruleSource: 'gm_override',
    });
    this.addFeature({ instanceId: `afi_${drId}`, featureId: drId, isActive: true });
  }

  // ---------------------------------------------------------------------------
  // LANGUAGE SLOTS — For LoreAndLanguages.svelte (zero-hardcoding compliance)
  // ---------------------------------------------------------------------------

  /**
   * Bonus language slots available to the character.
   *
   * D&D 3.5 RULE:
   *   A character knows one additional language per point of Intelligence
   *   modifier above 0. Additional ranks in the Speak Language skill
   *   (skill_speak_language) each grant one more language slot.
   *
   *   Total bonus slots = max(0, INT_derivedModifier) + speak_language_ranks
   *
   * WHY IN THE ENGINE:
   *   This computation references a specific ability score pipeline ID
   *   ('stat_intelligence') and a specific skill ID ('skill_speak_language').
   *   Hardcoding these IDs in LoreAndLanguages.svelte would violate the
   *   zero-hardcoding rule (ARCHITECTURE.md §6). Both IDs are internal
   *   system identifiers defined by the architecture, but .svelte files
   *   must not embed them directly.
   *
   * @see src/lib/components/core/LoreAndLanguages.svelte — display consumer
   * @see ARCHITECTURE.md §6 — zero-hardcoding rule
   */
  phase_bonusLanguageSlots: number = $derived.by(() => {
    const intMod    = this.phase2_attributes['stat_intelligence']?.derivedModifier ?? 0;
    const speakRanks = this.character.skills['skill_speak_language']?.ranks ?? 0;
    return Math.max(0, intMod) + speakRanks;
  });

  /**
   * Manually-added language features: ActiveFeatureInstances tagged 'language'
   * that the player explicitly selected (as opposed to those granted automatically
   * by race/class features).
   *
   * WHY IN THE ENGINE:
   *   Iterating activeFeatures and checking feature.tags.includes('language') is
   *   game-domain logic that must not appear in LoreAndLanguages.svelte
   *   (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3). Previously this
   *   classification was implemented directly inside the Svelte component's
   *   $derived.by() block, which violated the rule.
   *
   * @see src/lib/components/core/LoreAndLanguages.svelte — display consumer
   */
  phase_manualLanguages: Array<{ id: ID; name: string; instanceId: ID }> = $derived.by(() => {
    const result: Array<{ id: ID; name: string; instanceId: ID }> = [];
    for (const afi of this.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feature = dataLoader.getFeature(afi.featureId);
      if (feature?.tags.includes('language')) {
        result.push({ id: feature.id, name: this.t(feature.label), instanceId: afi.instanceId });
      }
    }
    return result;
  });

  /**
   * Automatically-granted language features: languages that appear in the
   * `grantedFeatures` array of any active feature (e.g. race grants Common/Elvish),
   * excluding any that are already counted as manually-added.
   *
   * WHY IN THE ENGINE:
   *   Iterating activeFeatures' grantedFeatures arrays and filtering by the
   *   'language' tag is game-domain logic that must not appear in
   *   LoreAndLanguages.svelte (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *   Previously this classification block was implemented inside the Svelte
   *   component's $derived.by(), violating the rule.
   *
   * @see src/lib/components/core/LoreAndLanguages.svelte — display consumer
   */
  phase_automaticLanguages: Array<{ id: ID; name: string }> = $derived.by(() => {
    const manualIds = new Set(this.phase_manualLanguages.map(l => l.id));
    const seen = new Set<string>();
    const result: Array<{ id: ID; name: string }> = [];
    for (const afi of this.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feature = dataLoader.getFeature(afi.featureId);
      if (!feature) continue;
      for (const grantedId of (feature.grantedFeatures ?? [])) {
        if (grantedId.startsWith('-') || seen.has(grantedId) || manualIds.has(grantedId)) continue;
        const grantedFeature = dataLoader.getFeature(grantedId);
        if (grantedFeature?.tags.includes('language')) {
          seen.add(grantedId);
          result.push({ id: grantedId, name: this.t(grantedFeature.label) });
        }
      }
    }
    return result;
  });

  /**
   * Count of manually-selected language features. Derived from phase_manualLanguages
   * to avoid duplicating the iteration logic.
   */
  private phase_manualLanguageCount: number = $derived(this.phase_manualLanguages.length);

  /**
   * Remaining language slots available for the player to add more languages.
   *
   * D&D 3.5 FORMULA: max(0, phase_bonusLanguageSlots − manually_added_language_count)
   *
   * WHY IN THE ENGINE:
   *   The subtraction `bonusSlots − manualCount` and the `Math.max(0, …)` clamp are
   *   D&D arithmetic that must not appear in LoreAndLanguages.svelte
   *   (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *
   * @see src/lib/components/core/LoreAndLanguages.svelte — display consumer
   */
  phase_remainingLanguageSlots: number = $derived(
    Math.max(0, this.phase_bonusLanguageSlots - this.phase_manualLanguageCount)
  );

  // ---------------------------------------------------------------------------
  // FEAT GRANT SOURCE — For FeatsTab.svelte (zero-game-logic compliance)
  // ---------------------------------------------------------------------------

  /**
   * Returns the display name of the feature that grants a given feat.
   *
   * D&D 3.5 RULE:
   *   Feats can be granted by:
   *   - Race/deity/monster-type features (via `grantedFeatures` array).
   *   - Class features at specific levels (via `levelProgression[].grantedFeatures`).
   *
   * WHY IN THE ENGINE:
   *   The search iterates through `activeFeatures`, reads `levelProgression`,
   *   and queries `character.classLevels` — all D&D game state access that must
   *   not appear in FeatsTab.svelte (zero-game-logic-in-Svelte rule,
   *   ARCHITECTURE.md §3). The method uses `this.t()` to return a localized string.
   *
   * @param featId - The ID of the feat whose grant source to look up.
   * @returns A localized source label (e.g. "Fighter 1") or an empty string
   *          if no grant source is found. Callers should display a fallback
   *          like `ui('common.unknown')` when the return value is empty.
   *
   * @see src/lib/components/feats/FeatsTab.svelte — display consumer
   */
  getFeatGrantSource(featId: ID): string {
    for (const afi of this.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feature = dataLoader.getFeature(afi.featureId);
      if (!feature) continue;
      if ((feature.grantedFeatures ?? []).includes(featId)) {
        return this.t(feature.label);
      }
      if (feature.category === 'class' && feature.levelProgression) {
        const classLevel = this.character.classLevels[feature.id] ?? 0;
        for (const entry of feature.levelProgression) {
          if (entry.level <= classLevel && entry.grantedFeatures.includes(featId)) {
            return `${this.t(feature.label)} ${entry.level}`;
          }
        }
      }
    }
    return ''; // Callers should display ui('common.unknown') as fallback
  }

  // ---------------------------------------------------------------------------
  // POINT BUY HELPERS — For PointBuyModal.svelte (zero-game-logic compliance)
  // ---------------------------------------------------------------------------

  /**
   * D&D 3.5 standard point-buy cost fallback table (scores 7–18).
   * Used when the `config_point_buy_costs` config table is not loaded.
   */
  private static readonly POINT_BUY_FALLBACK_COSTS: Readonly<Record<number, number>> = {
    7: -4, 8: 0, 9: 1, 10: 2, 11: 3, 12: 4,
    13: 5, 14: 6, 15: 8, 16: 10, 17: 13, 18: 16,
  };

  /** Minimum ability score allowed in point-buy (D&D 3.5 default). */
  static readonly POINT_BUY_MIN_SCORE = 7;

  /** Maximum ability score allowed in point-buy (D&D 3.5 default). */
  static readonly POINT_BUY_MAX_SCORE = 18;

  /**
   * Returns the cumulative point-buy cost of an ability score.
   *
   * Uses the `config_point_buy_costs` config table when loaded;
   * falls back to the D&D 3.5 standard cost table (scores 7–18).
   *
   * WHY IN THE ENGINE:
   *   Config-table lookups and game-rule arithmetic belong in the engine, not
   *   in PointBuyModal.svelte (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *
   * @param score - Ability score value (typically 7–18).
   * @returns Cumulative point cost for that score (e.g., STR 16 → 10).
   */
  getPointBuyCumulativeCost(score: number): number {
    const table = dataLoader.getConfigTable('config_point_buy_costs');
    if (table?.data) {
      const row = (table.data as Array<Record<string, unknown>>).find(r => r['score'] === score);
      if (row && typeof row['cost'] === 'number') return row['cost'];
    }
    return GameEngine.POINT_BUY_FALLBACK_COSTS[score] ?? 0;
  }

  /**
   * Returns the marginal point-buy cost of raising a score by 1 step.
   * Derived as: cumulative_cost(score) − cumulative_cost(score − 1).
   *
   * WHY IN THE ENGINE:
   *   Arithmetic on game values is game logic forbidden in .svelte files
   *   (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *
   * @param score - The target ability score.
   * @returns Additional points needed to raise from (score − 1) to score.
   */
  getPointBuyMarginalCost(score: number): number {
    return this.getPointBuyCumulativeCost(score) - this.getPointBuyCumulativeCost(score - 1);
  }

  /**
   * Returns the total point-buy cost for a set of ability scores.
   *
   * WHY IN THE ENGINE:
   *   Array.reduce() with game-cost lookups is game arithmetic forbidden
   *   in .svelte files (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *
   * @param scores - Map of ability pipeline ID → score value.
   * @returns Total cumulative cost across all provided scores.
   */
  getPointBuyTotalSpent(scores: Record<string, number>): number {
    return Object.values(scores).reduce((t, s) => t + this.getPointBuyCumulativeCost(s), 0);
  }

  /**
   * Returns how many point-buy points remain in the working score set.
   *
   * WHY IN THE ENGINE:
   *   `budget - spent` is subtraction on a D&D game value (the point-buy budget
   *   from campaign settings). Arithmetic on game values is forbidden in .svelte
   *   files (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3). PointBuyModal
   *   calls this to avoid performing the subtraction itself.
   *
   * @param scores - Map of ability pipeline ID → working score value.
   * @returns Remaining points (negative means over budget).
   */
  getPointBuyRemaining(scores: Record<string, number>): number {
    return (this.settings.statGeneration.pointBuyBudget ?? 0) - this.getPointBuyTotalSpent(scores);
  }

  /**
   * Returns whether the working score set has exceeded the point-buy budget.
   *
   * WHY IN THE ENGINE:
   *   `remaining < 0` on a derived game value belongs in the engine, consistent
   *   with how `phase4_skillPointsBudgetExceeded` works for skill points.
   *
   * @param scores - Map of ability pipeline ID → working score value.
   * @returns `true` when the total spent exceeds the available budget.
   */
  getPointBuyBudgetExceeded(scores: Record<string, number>): boolean {
    return this.getPointBuyRemaining(scores) < 0;
  }

  /**
   * Clamps an ability score to the valid point-buy range.
   *
   * WHY IN THE ENGINE:
   *   `Math.min(max, Math.max(min, value))` with D&D-specific bounds is game
   *   logic forbidden in .svelte files (zero-game-logic-in-Svelte, ARCHITECTURE.md §3).
   *
   * @param score - Raw score value to clamp.
   * @param min   - Minimum allowed score (defaults to D&D 3.5 point-buy minimum of 7).
   * @param max   - Maximum allowed score (defaults to D&D 3.5 point-buy maximum of 18).
   * @returns Score clamped within [min, max].
   */
  clampPointBuyScore(score: number, min = GameEngine.POINT_BUY_MIN_SCORE, max = GameEngine.POINT_BUY_MAX_SCORE): number {
    return Math.min(max, Math.max(min, score));
  }

  /**
   * Returns the D&D ability modifier for a preview (not-yet-applied) score.
   *
   * Formula: floor((score − 10) / 2)  (Player's Handbook, Chapter 1).
   *
   * WHY IN THE ENGINE:
   *   `Math.floor((score − 10) / 2)` is the canonical D&D ability-modifier
   *   formula. Calling it directly in a .svelte component violates the
   *   zero-game-logic-in-Svelte rule (ARCHITECTURE.md §3) because it is
   *   a mathematical game calculation, not a formatting helper.
   *
   *   This method is needed by `PointBuyModal.svelte` to display the modifier
   *   preview for WORKING scores (not-yet-committed to the character), which is
   *   why `engine.phase2_attributes[id].derivedModifier` cannot be used here
   *   (it reflects the currently committed score, not the modal's working score).
   *
   * @param score - Raw ability score (e.g., 8–18 in the point-buy modal).
   * @returns The derived modifier (e.g., 18 → +4, 10 → 0, 8 → -1).
   */
  previewAbilityModifier(score: number): number {
    return computeAbilityModifier(score);
  }

  /**
   * Returns up to 4 ability-score modifier "pills" for display on a Feature card
   * (e.g., the race panel in BasicInfo.svelte).
   *
   * A "pill" is a small badge showing the sign-prefixed value and abbreviated stat
   * name (e.g., "+2 STR", "−2 INT"). Only numeric modifiers targeting one of the
   * 6 core ability-score pipelines are included; zero values are excluded.
   *
   * WHY IN THE ENGINE (not inline in BasicInfo.svelte):
   *   This function filters and processes `feature.grantedModifiers`, which is game-
   *   domain modifier data. "Which modifiers are ability-score modifiers?" is a game
   *   question that depends on MAIN_ABILITY_IDS (a D&D concept). The function also
   *   strips the `ATTRIBUTE_PIPELINE_NAMESPACE` prefix and applies locale-aware
   *   abbreviation — all of which constitute "direct manipulation of pipeline values"
   *   forbidden in .svelte files (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *
   * @param feature  - Any Feature (typically a race or magic item feature).
   * @param language - Active UI locale passed from `engine.settings.language`.
   * @returns Up to 4 pill descriptors, each with a `label`, `positive`, and `zero` flag.
   */
  getFeatureAbilityModifierPills(
    feature: { grantedModifiers?: Array<{ value: unknown; targetId: string }> },
    language: string,
  ): Array<{ label: string; positive: boolean; zero: boolean }> {
    if (!feature.grantedModifiers?.length) return [];
    return feature.grantedModifiers
      .filter(mod =>
        typeof mod.value === 'number' &&
        (mod.value as number) !== 0 &&
        MAIN_ABILITY_IDS.some(id => mod.targetId.includes(id)),
      )
      .slice(0, 4)
      .map(mod => {
        const val = mod.value as number;
        // Strip the "attributes." namespace prefix to obtain the bare stat ID
        // (e.g., "attributes.stat_strength" → "stat_strength"), then localise it.
        const statKey = mod.targetId.replace(ATTRIBUTE_PIPELINE_NAMESPACE, '');
        const abbr    = getAbilityAbbr(statKey, language);
        return {
          label:    `${formatModifier(val)} ${abbr}`,
          positive: val > 0,
          zero:     false, // zero values are already filtered out above
        };
      });
  }

  /**
   * Computes the Brainburn saving throw DC for a Power Stone entry.
   *
   * D&D 3.5 SRD (Expanded Psionics Handbook, p. 43):
   *   "Using a power from a power stone that has a higher manifester level than
   *   your own manifester level requires you to make a DC (power's manifester
   *   level + 1) manifester level check."
   *
   * WHY IN THE ENGINE (not inline `manifesterLevel + 1` in PsionicItemCard.svelte):
   *   Mathematical calculations must not appear in Svelte templates or script
   *   blocks (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3). This method
   *   encapsulates the +1 offset so .svelte files only call a named engine method.
   *
   * @param manifesterLevel - The manifester level imprinted on the power stone entry.
   * @returns The DC for the manifester level check.
   */
  getBrainburnDC(manifesterLevel: number): number {
    return manifesterLevel + 1;
  }

  /**
   * Returns whether a Power Stone entry poses a Brainburn risk to this character.
   *
   * D&D 3.5 SRD (Expanded Psionics Handbook, p. 43):
   *   "Using a power from a power stone that has a higher manifester level than
   *   your own manifester level requires you to make a DC (power's manifester
   *   level + 1) manifester level check."
   *   A Brainburn risk exists whenever the entry is not yet used AND the stone's
   *   imprinted manifester level exceeds the character's current manifester level.
   *
   * WHY IN THE ENGINE (not inline `charML < entry.manifesterLevel` in PsionicItemCard.svelte):
   *   Comparisons between game values (manifester level vs. stone ML) are game-domain
   *   prerequisite evaluations and must not appear in .svelte script blocks or templates
   *   (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3). This method encapsulates
   *   the comparison so `PsionicItemCard.svelte` delegates entirely to the engine.
   *
   * @param entry - The PowerStoneEntry to evaluate (`usedUp`, `manifesterLevel`).
   * @returns `true` if the entry is available and its ML exceeds the character's ML.
   */
  getBrainburnRisk(entry: { usedUp: boolean; manifesterLevel: number }): boolean {
    return !entry.usedUp && (this.phase_manifesterLevel ?? 0) < entry.manifesterLevel;
  }

  /**
   * Returns the base save bonus for a saving throw pipeline, factoring out the
   * key ability modifier.
   *
   * D&D 3.5 RULE:
   *   Total Save = Base Save (class progression + racial) + Key Ability Modifier
   *   + Misc Modifiers. This method isolates the "Base Save" chip displayed in
   *   the SavingThrows component: totalBonus − abilityMod.
   *
   * WHY IN THE ENGINE (not inline subtraction in SavingThrows.svelte):
   *   Even trivial arithmetic on game modifier values must not appear in Svelte
   *   files (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *
   * @param pipelineId   - e.g. "saves.fortitude"
   * @param keyAbilityId - e.g. "stat_constitution"
   * @returns Base save bonus, or 0 when pipelines are not yet resolved.
   */
  getBaseSaveBonus(pipelineId: string, keyAbilityId: string): number {
    const pipeline   = this.phase3_combatStats[pipelineId];
    const abilityMod = this.phase2_attributes[keyAbilityId]?.derivedModifier ?? 0;
    return (pipeline?.totalBonus ?? 0) - abilityMod;
  }

  /**
   * Unlocks all skill rank minimums, allowing ranks to be freely lowered.
   *
   * This is the complement of `lockAllSkillRanks()` — it clears the
   * `character.minimumSkillRanks` map entirely, removing all previously
   * committed level-up floors.
   *
   * WHY IN THE ENGINE (not `engine.character.minimumSkillRanks = {}` inline):
   *   Direct character state mutations from .svelte files bypass the engine's
   *   ownership of character data and violate the zero-game-logic-in-Svelte
   *   rule (ARCHITECTURE.md §3). Methods on the engine are the single
   *   sanctioned mutation point.
   */
  unlockAllSkillRanks(): void {
    this.character.minimumSkillRanks = {};
  }

  /**
   * Clamps a coin input value to zero or above and persists it to the character.
   *
   * WHY IN THE ENGINE (not `Math.max(0, val)` inline in Encumbrance.svelte):
   *   The "cannot have negative coins" constraint is a game/data integrity rule.
   *   Moving it here upholds the zero-game-logic-in-Svelte architectural rule
   *   (ARCHITECTURE.md §3) and ensures coin weight (phase2b_totalCarriedWeight)
   *   recalculates automatically via Svelte reactivity.
   *
   * @param key - One of 'cp', 'sp', 'gp', 'pp'.
   * @param val - Raw value from the input element (may be negative or NaN).
   */
  setCoinValue(key: 'cp' | 'sp' | 'gp' | 'pp', val: number): void {
    if (!this.character.wealth) {
      this.character.wealth = { cp: 0, sp: 0, gp: 0, pp: 0 };
    }
    const clamped = Math.max(0, isNaN(val) ? 0 : val);
    this.character.wealth[key] = clamped;
  }

  // ---------------------------------------------------------------------------
  // LANGUAGE SHORTCUT & HELPERS
  // ---------------------------------------------------------------------------

  /** Active display language shortcut. */
  get lang(): string {
    return this.settings.language;
  }

  /**
   * Translates a LocalizedString to the active language.
   * Falls back: requested lang → English → first available → "??".
   */
  t(textObj: LocalizedString | string): string {
    return translateString(textObj, this.settings.language);
  }

  /** Converts feet to the locale-appropriate distance string ("30 ft." or "9 m"). */
  formatDistance(feet: number): string {
    return fmtDistance(feet, this.settings.language);
  }

  /** Converts pounds to the locale-appropriate weight string ("10 lb." or "5 kg"). */
  formatWeight(lbs: number): string {
    return fmtWeight(lbs, this.settings.language);
  }

  /**
   * Returns the display name for a language code as it should appear in the
   * language selector dropdown — always in that language's own script.
   *
   * Resolution order (highest priority first):
   *   1. `dataLoader.getLocaleDisplayName(code)` — the `$meta.language` value
   *      from the locale JSON file, returned by `GET /api/locales`.
   *      This is the canonical self-name set by the file's translator
   *      (e.g. "Français" for fr, "Deutsch" for de, "Kiswahili" for sw).
   *      Reliable for every server-dropped locale file.
   *   2. `ui('lang.<code>', code)` — looks up the self-naming key in the
   *      language's OWN locale (NOT the active UI language). This covers
   *      English, which is excluded from the API response and bundled as the
   *      baseline (`UI_STRINGS['lang.en'] = 'English'`). Other locales may
   *      also declare this key as a redundant fallback.
   *   3. `Intl.DisplayNames` — browser-native self-naming. Returns the
   *      language's own name in its own script without any locale file:
   *        'ja' → '日本語', 'ko' → '한국어', 'zh-hans' → '中文(简体)'
   *      Works for any valid BCP-47 code. Used for languages that are used
   *      in content (e.g. a campaign title or homebrew entity translated by
   *      the GM) but have no corresponding server locale file.
   *   4. `code.toUpperCase()` — absolute last resort (Intl API unavailable
   *      or code not recognised).
   *
   * WHY SELF-NAMED (not translated into the active language):
   *   A speaker looking for their language in the dropdown must be able to
   *   recognise it without understanding the currently active language.
   *   "Français" is recognisable to a French speaker; "French" or "Chinois" is not.
   *
   * @param code - BCP-47 language code (e.g. 'en', 'fr', 'de', 'ja').
   * @returns Self-name of the language (e.g. 'English', 'Français', '日本語').
   */
  getLanguageDisplayName(code: string): string {
    // 1. Native name from the server's /api/locales response ($meta.language in the
    //    locale JSON). This is the most reliable source: it comes from the file
    //    itself and is always the language's own name (e.g. "Français", "Deutsch").
    const native = dataLoader.getLocaleDisplayName(code);
    if (native) return native;

    // 2. ui('lang.{code}', code) — looks up the key in the language's OWN locale,
    //    not in the currently active UI language. Falls back to UI_STRINGS which
    //    only registers 'lang.en = "English"' (English has no separate locale file
    //    and is excluded from the /api/locales response).
    const uiKey  = `lang.${code}`;
    const fromUi = ui(uiKey, code);
    if (fromUi !== uiKey) return fromUi;

    // 3. Intl.DisplayNames — browser-native self-naming, no locale file needed.
    //    Uses the language itself as the display locale so the name is always in
    //    the language's own script (self-naming), matching the dropdown convention.
    try {
      const intlName = new Intl.DisplayNames([code], { type: 'language' }).of(code);
      if (intlName && intlName !== code) return intlName;
    } catch {
      // Intl.DisplayNames unavailable or code not supported — fall through.
    }

    // 4. Last resort: uppercase code. Better than an empty string or raw key.
    return code.toUpperCase();
  }

  /**
   * Returns the ISO 3166-1 alpha-2 country code for a language, used to render
   * a country flag in the language picker (flag-icons CSS library).
   *
   * Source: `$meta.countryCode` in the locale JSON, returned by `GET /api/locales`
   * and stored in `DataLoader._externalLocales`. This field is MANDATORY in all
   * locale files.
   *
   * Returns `undefined` for the built-in English locale ('en'), which has no
   * locale file. The `ThemeLanguagePicker` component handles this with a hardcoded
   * fallback (`'gb'`).
   *
   * @param code - BCP-47 language code (e.g. 'fr', 'de').
   * @returns ISO 3166-1 alpha-2 country code (e.g. 'fr', 'de'), or `undefined`.
   */
  getLanguageCountryCode(code: string): string | undefined {
    return dataLoader.getLocaleCountryCode(code);
  }

  // ---------------------------------------------------------------------------
  // CHARACTER MANAGEMENT
  // ---------------------------------------------------------------------------

  /**
   * Loads a character as the active character (triggers full DAG re-evaluation).
   *
   * NORMALIZATION — WHY REQUIRED:
   *   Characters persisted to the PHP API or localStorage only store the
   *   "source of truth" fields (ARCHITECTURE.md):
   *     STORED   : classLevels, activeFeatures, attributes.*.baseValue,
   *                skills.*.ranks, resources.*.currentValue, linkedEntities, …
   *     NOT STORED: combatStats.*, saves.* — derived at runtime by the DAG
   *
   *   Additionally, the per-pipeline metadata (label, id, keyAbility, …) for
   *   attributes is NOT stored — only `baseValue` is. These metadata fields
   *   come from the DataLoader's config tables at runtime.
   *
   *   If we assign a bare `{baseValue: 16}` attribute object directly into
   *   `character.attributes`, downstream `$derived` values that read
   *   `pipeline.label` (e.g. AbilityScoresSummary) receive `undefined` and crash.
   *
   * STRATEGY:
   *   Build a fresh template via `createEmptyCharacter()`.  By call-time the
   *   DataLoader has already loaded rule sources (the vault page ensures this),
   *   so the template's attribute pipelines carry the correct DataLoader labels.
   *   We then overlay the stored `baseValue` onto the template entries, giving
   *   every attribute a fully-formed pipeline with the correct runtime label.
   *
   *   Skills are handled separately: the engine's `$effect` at line ~1325
   *   seeds skill pipelines from `config_skill_definitions` whenever
   *   `dataLoaderVersion` bumps. That effect guards with `?.label` so it
   *   will now complete any minimal `{ranks: N}` entries left by storage.
   */
  loadCharacter(char: Character): void {
    // --- Step 1: attribute pipelines ---
    // Start from the template (provides label, id, keyAbility, defaults).
    // Apply the stored baseValue on top so the DAG uses the saved score.
    const template = createEmptyCharacter(char.id, char.name);

    const attributes: Record<ID, StatisticPipeline> = {};

    // Standard attributes: template provides structure, stored provides baseValue.
    for (const [id, tpl] of Object.entries(template.attributes)) {
      const stored = char.attributes?.[id];
      attributes[id] = {
        ...tpl,
        baseValue: stored?.baseValue ?? tpl.baseValue,
      };
    }

    // Custom / homebrew attributes not in the template (e.g. from prestige classes).
    for (const [id, stored] of Object.entries(char.attributes ?? {})) {
      if (attributes[id]) continue; // already handled above
      attributes[id] = {
        id:                    stored.id    ?? id,
        label:                 stored.label ?? { en: id },
        baseValue:             stored.baseValue             ?? 0,
        totalValue:            stored.baseValue             ?? 0,
        derivedModifier:       0,
        totalBonus:            0,
        activeModifiers:       [],
        situationalModifiers:  [],
      };
    }

    // --- Step 2: combat stat and save pipelines ---
    //
    // These pipelines are "fully derived" — Phase 3 adds all the modifiers from
    // features, class levels, and ability scores. However, Phase 3 only creates
    // result entries for pipelines that ALREADY EXIST in `character.combatStats`
    // and `character.saves` (it iterates over Object.entries of each map).
    //
    // The template guarantees that all standard pipeline keys are present
    // (e.g., "combatStats.ac_normal", "saves.fortitude"). Without this merge,
    // characters loaded from the DB or seed.php (which omit these maps entirely)
    // would have an empty `phase3_combatStats` — causing AC, BAB, and saving
    // throws to show nothing in the UI.
    //
    // STRATEGY (mirrors the attributes approach above):
    //   1. Start from the template (all standard pipeline keys present, baseValue
    //      already set to the correct defaults: 10 for AC, 0 for saves, 99 for
    //      max_dex_bonus, etc.).
    //   2. Overlay any stored baseValues from the persisted character data
    //      (preserves custom homebrew pipelines and any explicitly stored baseValues).
    //   3. Include any extra pipelines from the stored data that the template
    //      doesn't know about (homebrew/prestige-class combat stats).
    const combatStats: Record<ID, StatisticPipeline> = {};
    for (const [id, tpl] of Object.entries(template.combatStats)) {
      const stored = (char.combatStats ?? {})[id];
      combatStats[id] = { ...tpl, baseValue: stored?.baseValue ?? tpl.baseValue };
    }
    for (const [id, stored] of Object.entries(char.combatStats ?? {})) {
      if (!combatStats[id]) combatStats[id] = stored;
    }

    const saves: Record<ID, StatisticPipeline> = {};
    for (const [id, tpl] of Object.entries(template.saves)) {
      // Saves always have baseValue 0 (class progression is applied via flat modifiers
      // in Phase 3, not stored as baseValue). Template values are authoritative.
      saves[id] = { ...tpl };
    }
    for (const [id, stored] of Object.entries(char.saves ?? {})) {
      if (!saves[id]) saves[id] = stored;
    }

    this.character = {
      ...char,
      attributes,
      combatStats,
      saves,
      // Skills: keep stored entries as-is; the DataLoader $effect at line ~1325
      // will complete any minimal {ranks: N} entry that is missing a label.
      skills:         char.skills         ?? {},
      linkedEntities: char.linkedEntities ?? [],
    };
    this.activeCharacterId = char.id;
  }

  /** Creates and activates a new blank character. */
  createNewCharacter(id: ID, name: string): void {
    this.character = createEmptyCharacter(id, name);
    this.activeCharacterId = id;
  }

  /** Sets the character's in-game name. */
  setCharacterName(name: string): void {
    this.character.name = name;
  }

  /**
   * Sets the player name associated with this character.
   *
   * Pass `undefined` (or an empty string, which is normalised to `undefined`)
   * to clear the field. The player name is shown as the Character Card subtitle
   * for PCs when no `customSubtitle` is set, helping the GM identify which real
   * person or nickname is associated with each character at the table.
   *
   * @param name - The player's name, nickname, or any other identifier. Pass
   *               `undefined` or an empty string to clear.
   */
  setPlayerName(name: string | undefined): void {
    this.character.playerName = name || undefined;
  }

  /** Sets the base value of an attribute pipeline (e.g., STR base score). */
  setAttributeBase(pipelineId: ID, baseValue: number): void {
    if (this.character.attributes[pipelineId]) {
      this.character.attributes[pipelineId].baseValue = baseValue;
    } else {
      console.warn(`[GameEngine] setAttributeBase: pipeline "${pipelineId}" not found.`);
    }
  }

  /**
   * Sets the invested skill ranks for a skill pipeline.
   *
   * D&D 3.5 RULE — RANK FLOORS:
   *   Skill ranks received at a given level are permanently spent — they cannot be
   *   refunded and reallocated to a different skill after that level is committed.
   *   The engine enforces this by refusing to set ranks below `character.minimumSkillRanks[skillId]`,
   *   which is updated by `lockSkillRanksMin()` when a level-up is committed.
   *
   *   During CHARACTER CREATION (before any level-up is committed) the minimum is 0,
   *   so ranks can be freely changed to help the player explore builds.
   *
   * @param skillId - The skill pipeline ID.
   * @param ranks   - The desired rank count (clamped to [minimumRanks, maxRanks]).
   */
  setSkillRanks(skillId: ID, ranks: number): void {
    if (this.character.skills[skillId]) {
      // Enforce the minimum rank floor set by committed level-ups.
      // `minimumSkillRanks` is optional (absent = all zeros = free reassignment).
      const minimum = this.character.minimumSkillRanks?.[skillId] ?? 0;
      // Enforce the maximum rank ceiling based on class-skill status.
      // D&D 3.5: class skills cap at (characterLevel + 3), cross-class at half that.
      // This clamp is performed here so SkillsMatrix.svelte contains zero arithmetic
      // (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
      const isClassSkill = this.phase4_classSkillSet.has(skillId);
      const maximum  = isClassSkill ? this.phase_maxClassSkillRanks : this.phase_maxCrossClassSkillRanks;
      const clamped  = Math.max(minimum, Math.min(Math.max(0, ranks), maximum));
      this.character.skills[skillId].ranks = clamped;
    } else {
      console.warn(`[GameEngine] setSkillRanks: skill "${skillId}" not found.`);
    }
  }

  /**
   * Locks in the current skill ranks as the minimum floor for a given skill.
   *
   * WHEN TO CALL:
   *   Call this on each skill whose ranks were modified during a level-up commit.
   *   Once called for a skill, the player can never lower those ranks again (they
   *   represent permanently spent skill points from that level).
   *
   * D&D 3.5 CONTEXT:
   *   In core D&D 3.5, once a character has gained XP and leveled up, the skill
   *   point allocation from past levels is considered "used". This method formalises
   *   that constraint in the engine. For characters still in creation mode (no levels
   *   committed), the minimum remains 0 and ranks can be freely changed.
   *
   * @param skillId - The skill pipeline ID whose current ranks become the new floor.
   */
  lockSkillRanksMin(skillId: ID): void {
    if (!this.character.skills[skillId]) {
      console.warn(`[GameEngine] lockSkillRanksMin: skill "${skillId}" not found.`);
      return;
    }
    // Initialize the minimumSkillRanks record if absent.
    if (!this.character.minimumSkillRanks) {
      this.character.minimumSkillRanks = {};
    }
    const currentRanks = this.character.skills[skillId].ranks;
    const existingMin = this.character.minimumSkillRanks[skillId] ?? 0;
    // The minimum is the HIGHER of the current minimum and the current ranks.
    // This prevents accidentally raising the minimum above the actual ranks.
    this.character.minimumSkillRanks[skillId] = Math.max(existingMin, currentRanks);
  }

  /**
   * Locks the minimum skill rank floor for ALL skills simultaneously.
   *
   * Convenience method for committing a full level-up that reallocated any
   * number of skills. Call once at the end of a level-up flow after all
   * skill rank adjustments have been finalised by the player.
   */
  lockAllSkillRanks(): void {
    for (const skillId of Object.keys(this.character.skills)) {
      this.lockSkillRanksMin(skillId);
    }
  }

  /**
   * Applies damage or healing to the HP resource pool.
   * Damage depletes temporary HP first (D&D 3.5 rule).
   * @param delta - Positive = healing, Negative = damage.
   */
  adjustHP(delta: number): void {
    const hp = this.character.resources['resources.hp'];
    if (!hp) return;
    if (delta < 0) {
      const damage = Math.abs(delta);
      const tempAbsorbed = Math.min(hp.temporaryValue, damage);
      hp.temporaryValue -= tempAbsorbed;
      hp.currentValue -= (damage - tempAbsorbed);
    } else {
      hp.currentValue += delta;
    }
  }

  /**
   * Sets the character's current HP to an absolute value, capping at maxHP.
   *
   * D&D 3.5 RULE: Current HP cannot exceed maximum HP through normal healing
   * (see SRD Healing rules). This cap is enforced here so the Svelte component
   * (HealthAndXP.svelte) only needs to call this method without knowing the
   * cap rule.
   *
   * WHY IN THE ENGINE:
   *   The "cannot exceed maxHP" constraint is a game rule. Moving it here
   *   upholds the zero-game-logic-in-Svelte architectural rule.
   *
   * @param value - The absolute HP value to set (will be clamped to [0, maxHP]).
   */
  setCurrentHP(value: number): void {
    const hp = this.character.resources['resources.hp'];
    if (!hp) return;
    hp.currentValue = Math.min(value, this.phase3_maxHp);
  }

  /**
   * Awards XP to the character.
   *
   * WHY IN THE ENGINE:
   *   Direct mutation of `character.xp` from a Svelte component would violate the
   *   zero-game-logic-in-Svelte rule (ARCHITECTURE.md §3). This method provides a
   *   controlled mutation point with clear intent.
   *
   * @param amount - The XP to add (positive to award, negative to remove).
   */
  addXp(amount: number): void {
    this.character.xp = (this.character.xp ?? 0) + amount;
  }

  /**
   * Reduces the character's Level Adjustment by 1.
   *
   * D&D 3.5 VARIANT RULE (Unearthed Arcana):
   *   A character may buy off 1 LA by spending XP equal to the XP required to
   *   advance from their current ECL. This method applies the LA reduction; the
   *   calling UI is responsible for confirming the action and deducting XP.
   *
   * WHY IN THE ENGINE:
   *   Mutating `character.levelAdjustment` is character state management. The
   *   zero-game-logic-in-Svelte rule requires such mutations to go through the engine.
   *
   * @see phase_canReduceLA — eligibility check
   * @see HealthAndXP.svelte — UI trigger (Reduce LA button)
   */
  reduceLA(): void {
    if (!this.phase_canReduceLA) return; // safety guard: only reduce if eligible
    this.character.levelAdjustment = Math.max(0, (this.character.levelAdjustment ?? 1) - 1);
  }

  /**
   * Sets temporary HP (takes the higher value per SRD non-stacking rule).
   * @param amount - The temporary HP to set.
   */
  setTemporaryHP(amount: number): void {
    const hp = this.character.resources['resources.hp'];
    if (!hp) return;
    hp.temporaryValue = Math.max(hp.temporaryValue, amount);
  }

  // ---------------------------------------------------------------------------
  // SPELL SLOT & POWER POINT SPENDING
  // ---------------------------------------------------------------------------

  /**
   * Spends one spell slot of the given level.
   *
   * D&D 3.5 RULE:
   *   A caster expends one slot of the spell's level when they cast a spell.
   *   Slot pools are stored in `character.resources` as
   *   `"resources.spell_slots_{level}"` (e.g. `"resources.spell_slots_3"`
   *   for a 3rd-level slot). The current value represents slots remaining.
   *
   * WHY IN THE ENGINE:
   *   Direct mutation of `character.resources` from a Svelte component would
   *   violate the zero-game-logic-in-Svelte rule (ARCHITECTURE.md §3). This
   *   method provides the single controlled mutation point.
   *
   * RETURN VALUE:
   *   `true`  — a slot was successfully spent.
   *   `false` — no slots available at this level (pool absent or already 0).
   *
   * @param level - Spell level (0–9). Level 0 = cantrips.
   */
  useSpellSlot(level: number): boolean {
    const poolId = `resources.spell_slots_${level}`;
    const pool = this.character.resources[poolId];
    if (!pool || pool.currentValue <= 0) return false;
    pool.currentValue = Math.max(0, pool.currentValue - 1);
    return true;
  }

  /**
   * Spends power points from the character's PP pool.
   *
   * D&D 3.5 PSIONICS RULE:
   *   A manifester expends PP equal to a power's base cost plus any chosen
   *   augmentation. PP are stored in `character.resources['resources.power_points']`.
   *   The current value falls to 0 at minimum (never negative).
   *
   * WHY IN THE ENGINE:
   *   Direct mutation of `character.resources` from a Svelte component would
   *   violate the zero-game-logic-in-Svelte rule (ARCHITECTURE.md §3).
   *
   * RETURN VALUE:
   *   `true`  — PP were successfully spent.
   *   `false` — insufficient PP or pool absent.
   *
   * @param amount - Number of PP to spend. Must be > 0.
   */
  spendPowerPoints(amount: number): boolean {
    if (amount <= 0) return false;
    const pool = this.character.resources['resources.power_points'];
    if (!pool || pool.currentValue < amount) return false;
    pool.currentValue = Math.max(0, pool.currentValue - amount);
    return true;
  }

  // ---------------------------------------------------------------------------
  // INCREMENTAL RESOURCE TICK METHODS
  // (Fast Healing, Regeneration, per-round hazard pools, etc.)
  // ---------------------------------------------------------------------------

  /**
   * Applies one incremental recharge tick to all `"per_turn"` resource pools.
   *
   * D&D 3.5 USAGE — FAST HEALING / REGENERATION:
   *   Call this at the START OF THE CHARACTER'S OWN TURN in initiative order.
   *   The UI / combat tracker is responsible for calling this at the correct moment.
   *   The engine itself is stateless with respect to the round clock.
   *
   *   Example JSON pool for Fast Healing 3:
   *   ```json
   *   {
   *     "id": "resources.hp",
   *     "resetCondition": "per_turn",
   *     "rechargeAmount": 3
   *   }
   *   ```
   *
   * ALGORITHM (per matching pool):
   *   1. Resolve `rechargeAmount` as a number (or evaluate the formula string).
   *   2. Clamp the pool: `currentValue = min(currentValue + amount, effectiveMax)`.
   *      `effectiveMax` is read from the pipeline pointed to by `maxPipelineId`.
   *   3. `temporaryValue` is NOT modified — temporary HP is never healed by ticking.
   *
   * REGENERATION NOTE:
   *   Regeneration (SRD specialAbilities.html) uses the same `"per_turn"` tick
   *   as Fast Healing. The distinction (lethal ↔ nonlethal conversion, bypass damage
   *   types) is modelled via separate DR/bypass tags on the creature Feature, NOT by
   *   a different `resetCondition`. Both Fast Healing and Regeneration share this method.
   *
   * FAST HEALING LIMITS (SRD rule):
   *   Fast Healing stops recovering HP once the creature has 0 HP (it cannot pull a
   *   creature out of "dying" on its own without Regeneration). This check is NOT
   *   enforced here — the calling UI should skip `triggerTurnTick()` if `currentValue ≤ 0`
   *   and the creature only has Fast Healing (not Regeneration). With Regeneration,
   *   it DOES apply even at 0 or negative HP.
   *
   * @see ResourcePool.resetCondition — `"per_turn"` documentation
   * @see ResourcePool.rechargeAmount — amount to restore per tick
   * @see ARCHITECTURE.md section 4 (ResourcePool) — per_turn/per_round design
   * @see ARCHITECTURE.md Phase 1.6
   */
  triggerTurnTick(): void {
    this.#applyIncrementalTick('per_turn');
  }

  /**
   * Applies one incremental recharge tick to all `"per_round"` resource pools.
   *
   * D&D 3.5 USAGE:
   *   Call this ONCE PER COMBAT ROUND at a fixed point in the initiative order
   *   (e.g., at the top of the round, before the highest-initiative combatant acts).
   *   Distinct from `triggerTurnTick()` which is per-character-initiative.
   *
   *   Use cases: area hazard damage pools, accumulating aura charges, sustained
   *   environmental effects that tick globally rather than per character.
   *
   * ALGORITHM: identical to `triggerTurnTick()` but targets `"per_round"` pools.
   *
   * @see ResourcePool.resetCondition — `"per_round"` documentation
   * @see ARCHITECTURE.md section 4 (ResourcePool) — per_turn/per_round design
   * @see ARCHITECTURE.md Phase 1.6
   */
  triggerRoundTick(): void {
    this.#applyIncrementalTick('per_round');
  }

  /**
   * Resets all `"encounter"` resource pools to their computed maximum.
   *
   * D&D 3.5 USAGE:
   *   Call at the START OF A NEW COMBAT ENCOUNTER (before the first initiative roll).
   *   Restores once-per-encounter class abilities (e.g., Smite Evil uses, Stunning Fist
   *   if the GM rules it as encounter-reset).
   *
   *   `"long_rest"` and `"short_rest"` pools are NOT affected by this method.
   *
   * @see ResourcePool.resetCondition — `"encounter"` documentation
   * @see ARCHITECTURE.md Phase 1.6
   */
  triggerEncounterReset(): void {
    for (const pool of Object.values(this.character.resources)) {
      if (pool.resetCondition !== 'encounter') continue;
      const max = this.#getEffectiveMax(pool);
      pool.currentValue = max;
    }
  }

  /**
   * Resets all `"short_rest"` resource pools to their computed maximum.
   *
   * D&D 3.5 USAGE (optional / house rule):
   *   Standard D&D 3.5 does not use short rests; this is provided for variant rules
   *   (e.g., the "Spell Points" variant or d20 Modern) that include a short rest concept.
   *
   * @see ResourcePool.resetCondition — `"short_rest"` documentation
   * @see ARCHITECTURE.md Phase 1.6
   */
  triggerShortRest(): void {
    for (const pool of Object.values(this.character.resources)) {
      if (pool.resetCondition !== 'short_rest') continue;
      const max = this.#getEffectiveMax(pool);
      pool.currentValue = max;
    }
  }

  /**
   * Resets ALL resource pools that recover on a long rest to their computed maximum.
   *
   * D&D 3.5 standard rest = 8 hours of sleep. Restores HP, spell slots, psi points,
   * rage rounds, turn undead uses, and all other `"long_rest"` pools.
   * Also restores `"short_rest"` pools (a long rest includes a short rest).
   *
   * @see ResourcePool.resetCondition
   * @see ARCHITECTURE.md Phase 1.6
   */
  triggerLongRest(): void {
    for (const pool of Object.values(this.character.resources)) {
      if (pool.resetCondition !== 'long_rest' && pool.resetCondition !== 'short_rest') continue;
      const max = this.#getEffectiveMax(pool);
      pool.currentValue = max;
    }
  }

  /**
   * Resets all `"per_day"` resource pools to their maximum value.
   *
   * D&D 3.5 CONTEXT — CALENDAR-DAY RESET:
   *   Many magic items and abilities reset on a daily calendar basis ("X uses per day"),
   *   independently of whether the character has slept. Dawn arrives whether or not the
   *   party rested. This is explicitly different from `"long_rest"`, which requires
   *   8 hours of restful sleep to recover spell slots and similar class resources.
   *
   * EXAMPLES OF `"per_day"` POOLS:
   *   - Ring of Djinni Calling: 1 call per day → `resetCondition: "per_day"`, `maxValue: 1`
   *   - Ring of Spell Turning: 3 uses per day → `resetCondition: "per_day"`, `maxValue: 3`
   *   - Ring of Elemental Command (Air): gust of wind 2/day, air walk 1/day
   *   - Any X/day activated item charge
   *
   * DOES NOT RESET: `"long_rest"` or `"per_week"` pools.
   * The GM or combat manager calls this method at the in-game dawn transition.
   *
   * @see ResourcePool.resetCondition — `"per_day"` documentation
   * @see ARCHITECTURE.md section 4.4 — Calendar Reset Conditions
   */
  triggerDawnReset(): void {
    // Reset character-level per_day pools (e.g., class features with daily uses)
    for (const pool of Object.values(this.character.resources)) {
      if (pool.resetCondition !== 'per_day') continue;
      const max = this.#getEffectiveMax(pool);
      pool.currentValue = max;
    }
    // Reset item instance per_day pools (E-2: Ring of Djinni Calling, Spell Turning, etc.)
    this.#resetItemPoolsByCondition('per_day');
  }

  /**
   * Resets all `"per_week"` resource pools to their maximum value.
   *
   * D&D 3.5 CONTEXT — WEEKLY CALENDAR RESET:
   *   Some magic item abilities reset on a weekly basis. The Ring of Elemental Command
   *   series specifies several abilities as "X per week" (chain lightning 1/week,
   *   ice storm 2/week, control water 2/week, etc.). These are significantly rarer
   *   than per-day abilities and reset on their own weekly schedule.
   *
   * EXAMPLES OF `"per_week"` POOLS:
   *   - Ring of Elemental Command (Air): chain lightning 1/week
   *   - Ring of Elemental Command (Earth): stoneskin 1/week, passwall 2/week
   *   - Ring of Elemental Command (Fire): flame strike 2/week
   *   - Ring of Elemental Command (Water): ice storm 2/week, control water 2/week
   *   - Ring of Shooting Stars: shooting stars 3/week
   *
   * DOES NOT RESET: `"long_rest"`, `"per_day"`, or other pool types.
   * The GM calls this method at the weekly in-game boundary (typically a Monday
   * sunrise equivalent in the game world).
   *
   * @see ResourcePool.resetCondition — `"per_week"` documentation
   * @see ARCHITECTURE.md section 4.4 — Calendar Reset Conditions
   */
  triggerWeeklyReset(): void {
    for (const pool of Object.values(this.character.resources)) {
      if (pool.resetCondition !== 'per_week') continue;
      const max = this.#getEffectiveMax(pool);
      pool.currentValue = max;
    }
    // Also reset per_week item pools on all active feature instances
    this.#resetItemPoolsByCondition('per_week');
  }

  // ---------------------------------------------------------------------------
  // TRIGGER-BASED ACTIVATION — REACTION / PASSIVE FEATURES (Enhancement E-4)
  // ---------------------------------------------------------------------------

  /**
   * Returns all currently active features whose activation type is `"reaction"`
   * and whose `triggerEvent` matches the given event string.
   *
   * PURPOSE — AUTOMATIC REACTION DISPATCH:
   *   In the combat event loop (Phase 10), when a triggerable event occurs
   *   (e.g., character falls more than 5 feet), the combat tracker should call
   *   this method to discover which active features respond to that event.
   *   Features with matching `triggerEvent` are "fired" without player input.
   *
   * D&D 3.5 EXAMPLES:
   *   - `"on_fall"`:          Ring of Feather Falling.
   *   - `"on_spell_targeted"`: Ring of Counterspells (auto-counters stored spell).
   *
   * ALGORITHM:
   *   1. Iterates all `character.activeFeatures` where `isActive: true`.
   *   2. For each, loads the Feature from the DataLoader.
   *   3. Returns features whose `activation.actionType === "reaction"` AND
   *      `activation.triggerEvent === triggerEvent`.
   *
   * @param triggerEvent - The event string to match against `Feature.activation.triggerEvent`.
   * @returns Array of matching Feature objects (may be empty). Caller fires them.
   *
   * @see ARCHITECTURE.md section 5.5b — Trigger-Based Activation full reference
   * @see Feature.activation.triggerEvent — the event discriminant field
   */
  getReactionFeaturesByTrigger(triggerEvent: string): Feature[] {
    const result: Feature[] = [];
    for (const instance of this.character.activeFeatures) {
      if (!instance.isActive) continue;
      const feature = dataLoader.getFeature(instance.featureId);
      if (!feature?.activation) continue;
      if (
        feature.activation.actionType === 'reaction' &&
        feature.activation.triggerEvent === triggerEvent
      ) {
        result.push(feature);
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // TIERED VARIABLE-COST ACTIVATION (Enhancement E-3)
  // ---------------------------------------------------------------------------

  /**
   * Activates a tiered variable-cost ability, spending the chosen tier's charges.
   *
   * D&D 3.5 CONTEXT — RING OF THE RAM:
   *   The Ring of the Ram lets the wearer choose to spend 1, 2, or 3 charges per use,
   *   with escalating damage and bull-rush bonus. Without tiered activation, the engine
   *   would need hardcoded logic to differentiate the three power levels. With it, the
   *   data author declares the tiers in JSON and the engine resolves them uniformly.
   *
   * CALL SITE:
   *   The Inventory item card or Special Abilities panel calls this method after the
   *   player selects a tier from the tier selector UI. The method returns the chosen
   *   tier's `grantedModifiers` for the calling code to pass to the Dice Engine.
   *
   * ALGORITHM:
   *   1. Validates `tierIndex` is within the `tieredResourceCosts` array bounds.
   *   2. Looks up the pool: first checks `instance.itemResourcePools[tier.targetPoolId]`
   *      (instance-scoped E-2 pools), then `character.resources[tier.targetPoolId]`
   *      (character-level pools).
   *   3. Resolves tier `cost` (number or formula string via Math Parser).
   *   4. Validates the pool has enough charges.
   *   5. Deducts the cost.
   *   6. Returns the tier's `grantedModifiers` (transient — valid for ONE roll only).
   *
   * @param instanceId - The `ActiveFeatureInstance.instanceId` of the activating item.
   * @param tierIndex  - 0-based index into `feature.activation.tieredResourceCosts`.
   * @returns The tier's `grantedModifiers` to inject into the Dice Engine roll context,
   *          OR `null` if validation fails (invalid tier, insufficient charges, etc.).
   *
   * @see ARCHITECTURE.md section 5 — activation.tieredResourceCosts
   * @see ActivationTier                — the tier data structure
   * @see spendItemPoolCharge()         — the underlying charge deduction method
   */
  activateWithTier(instanceId: string, tierIndex: number): import('../types/pipeline').Modifier[] | null {
    // Find the item instance
    const instance = this.character.activeFeatures.find(
      (afi) => afi.instanceId === instanceId,
    );
    if (!instance) return null;

    // Load the feature and find its tiered costs
    const feature = dataLoader.getFeature(instance.featureId);
    if (!feature?.activation?.tieredResourceCosts) return null;

    const tiers: ActivationTier[] = feature.activation.tieredResourceCosts;

    // Validate tier index
    if (tierIndex < 0 || tierIndex >= tiers.length) {
      console.warn(
        `[GameEngine.activateWithTier] Tier index ${tierIndex} out of range ` +
        `(0–${tiers.length - 1}) for feature "${feature.id}".`,
      );
      return null;
    }

    const tier = tiers[tierIndex];

    // Resolve the cost (may be a formula string)
    let resolvedCost: number;
    if (typeof tier.cost === 'number') {
      resolvedCost = tier.cost;
    } else {
      const parsed = evaluateFormula(tier.cost, this.phase0_context, this.settings.language);
      resolvedCost = typeof parsed === 'number' ? parsed : parseFloat(String(parsed));
      if (!isFinite(resolvedCost) || resolvedCost < 0) {
        console.warn(
          `[GameEngine.activateWithTier] Cost formula "${tier.cost}" resolved to invalid` +
          ` value: ${resolvedCost}. Aborting activation.`,
        );
        return null;
      }
    }

    // Find the current pool value (item pool takes precedence over character pool)
    let currentCharges: number;
    const hasItemPool = instance.itemResourcePools &&
      Object.prototype.hasOwnProperty.call(instance.itemResourcePools, tier.targetPoolId);

    if (hasItemPool) {
      currentCharges = instance.itemResourcePools![tier.targetPoolId];
    } else if (this.character.resources[tier.targetPoolId]) {
      currentCharges = this.character.resources[tier.targetPoolId].currentValue;
    } else {
      console.warn(
        `[GameEngine.activateWithTier] Pool "${tier.targetPoolId}" not found ` +
        `on instance "${instanceId}" or character resources.`,
      );
      return null;
    }

    // Validate sufficient charges
    if (currentCharges < resolvedCost) {
      console.warn(
        `[GameEngine.activateWithTier] Insufficient charges: ` +
        `need ${resolvedCost}, have ${currentCharges} in pool "${tier.targetPoolId}".`,
      );
      return null;
    }

    // Deduct the cost
    if (hasItemPool) {
      this.spendItemPoolCharge(instanceId, tier.targetPoolId, resolvedCost);
    } else {
      const pool = this.character.resources[tier.targetPoolId];
      pool.currentValue = Math.max(0, pool.currentValue - resolvedCost);
    }

    // Return the tier's transient modifiers for the Dice Engine
    return tier.grantedModifiers;
  }

  // ---------------------------------------------------------------------------
  // INSTANCE-SCOPED ITEM RESOURCE POOLS (Enhancement E-2)
  // ---------------------------------------------------------------------------

  /**
   * Initialises `itemResourcePools` on a feature instance for any pool templates
   * declared on the feature that do not yet have an entry.
   *
   * IDEMPOTENCY CONTRACT:
   *   Safe to call multiple times on the same instance. Only adds NEW keys —
   *   never overwrites existing (depleted) charge counts. This means calling
   *   this method on an already-equipped item with 23/50 charges does NOT
   *   reset it back to 50.
   *
   * CALL SITE: whenever a new `ActiveFeatureInstance` is added to the character's
   * `activeFeatures` (equip/loot flow in Phase 13.3).
   *
   * @param instance - The `ActiveFeatureInstance` being initialised.
   * @param feature  - The resolved `Feature` definition for this instance.
   *
   * @see ARCHITECTURE.md section 5.7 — itemResourcePools lifecycle
   */
  initItemResourcePools(instance: ActiveFeatureInstance, feature: Feature): void {
    // If the feature declares no pool templates, there is nothing to initialise.
    if (!feature.resourcePoolTemplates || feature.resourcePoolTemplates.length === 0) return;

    // Ensure the itemResourcePools record exists on the instance.
    if (!instance.itemResourcePools) {
      instance.itemResourcePools = {};
    }

    for (const template of feature.resourcePoolTemplates) {
      // IDEMPOTENCY: only set if this poolId is not already present.
      // We use `Object.prototype.hasOwnProperty` to distinguish absent (never set)
      // from 0 (fully depleted) — both are falsy, but only the former should be initialised.
      if (!Object.prototype.hasOwnProperty.call(instance.itemResourcePools, template.poolId)) {
        instance.itemResourcePools[template.poolId] = template.defaultCurrent;
      }
    }
  }

  /**
   * Returns the current value of a named pool on a specific item instance.
   *
   * Returns the value from `instance.itemResourcePools[poolId]` if present,
   * or `template.defaultCurrent` if the pool has never been initialised
   * (consistent with what `initItemResourcePools` would set).
   * Returns `0` if neither the instance nor a matching template can be found.
   *
   * @param instanceId - The `ActiveFeatureInstance.instanceId` to query.
   * @param poolId     - The pool identifier (from `ResourcePoolTemplate.poolId`).
   * @returns The current charge / use count.
   *
   * @see ARCHITECTURE.md section 5.7 — `getItemPoolValue()` specification
   */
  getItemPoolValue(instanceId: string, poolId: string): number {
    // Find the instance in the character's active features.
    const instance = this.character.activeFeatures.find(
      (afi) => afi.instanceId === instanceId,
    );
    if (!instance) return 0;

    // If already initialised, return the recorded current value directly.
    if (instance.itemResourcePools && Object.prototype.hasOwnProperty.call(
      instance.itemResourcePools, poolId)) {
      return instance.itemResourcePools[poolId];
    }

    // Not yet initialised — look up the template's defaultCurrent as the authoritative value.
    const feature = dataLoader.getFeature(instance.featureId);
    if (!feature?.resourcePoolTemplates) return 0;
    const template = (feature.resourcePoolTemplates as ResourcePoolTemplate[])
      .find((t: ResourcePoolTemplate) => t.poolId === poolId);
    return template?.defaultCurrent ?? 0;
  }

  /**
   * Atomically deducts charges from an item instance's named pool.
   *
   * FLOOR: `currentValue` can never go below 0 (charges cannot become negative).
   * The caller should check `getItemPoolValue() >= amount` BEFORE calling
   * `spendItemPoolCharge()` if "insufficient charges" validation is needed
   * (the engine itself does not throw — it simply clamps at 0).
   *
   * PATTERN: Spend 3 charges from Ring of the Ram:
   * ```typescript
   * if (engine.getItemPoolValue(instanceId, "charges") >= 3) {
   *   engine.spendItemPoolCharge(instanceId, "charges", 3);
   *   // resolve the 3d6 damage attack
   * }
   * ```
   *
   * @param instanceId - The `ActiveFeatureInstance.instanceId`.
   * @param poolId     - The pool to deduct from.
   * @param amount     - Number of charges to spend (default: 1). Must be > 0.
   *
   * @see ARCHITECTURE.md section 5.7 — `spendItemPoolCharge()` specification
   */
  spendItemPoolCharge(instanceId: string, poolId: string, amount = 1): void {
    if (amount <= 0) return; // Nothing to spend

    const instance = this.character.activeFeatures.find(
      (afi) => afi.instanceId === instanceId,
    );
    if (!instance) return;

    // Ensure the pool is initialised before spending.
    const feature = dataLoader.getFeature(instance.featureId);
    if (feature) {
      this.initItemResourcePools(instance, feature);
    }
    if (!instance.itemResourcePools) return;

    const current = instance.itemResourcePools[poolId] ?? 0;
    // Floor at 0 — charges cannot go negative.
    instance.itemResourcePools[poolId] = Math.max(0, current - amount);
  }

  /**
   * Adds charges to an item instance's named pool, capped at the template's
   * `defaultCurrent` (treated as the maximum for recharge purposes).
   *
   * Symmetric counterpart to `spendItemPoolCharge()`. Used by PsionicItemCard
   * to restore PP to a cognizance crystal or psicrown without performing
   * `Math.min(max, current + amount)` in the Svelte component (which would
   * violate the zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *
   * @param instanceId - The `ActiveFeatureInstance.instanceId`.
   * @param poolId     - The pool to recharge.
   * @param amount     - Number of charges to restore (default: 1). Must be > 0.
   */
  rechargeItemPoolCharge(instanceId: string, poolId: string, amount = 1): void {
    if (amount <= 0) return;

    const instance = this.character.activeFeatures.find(
      (afi) => afi.instanceId === instanceId,
    );
    if (!instance) return;

    const feature = dataLoader.getFeature(instance.featureId);
    if (feature) {
      this.initItemResourcePools(instance, feature);
    }
    if (!instance.itemResourcePools) return;

    // Determine the maximum value from the template's defaultCurrent.
    const maxValue = feature?.resourcePoolTemplates?.find(
      (t: ResourcePoolTemplate) => t.poolId === poolId,
    )?.defaultCurrent ?? Infinity;

    const current = instance.itemResourcePools[poolId] ?? 0;
    // Ceiling at the template max — cannot exceed full charges.
    instance.itemResourcePools[poolId] = Math.min(maxValue, current + amount);
  }

  // ---------------------------------------------------------------------------
  // PSIONIC ITEM STATE MANAGEMENT — PsionicItemCard.svelte delegates
  // ---------------------------------------------------------------------------
  //
  // PsionicItemCard interacts with psionic item state through these engine methods
  // instead of mutating `item.psionicItemData` directly.  Direct mutation in a
  // Svelte component violates the zero-game-logic-in-Svelte rule (ARCHITECTURE.md §3)
  // because `Math.max` / `Math.min` clamping is game logic, not presentation logic.

  /**
   * Deducts power points from a psionic item's `storedPP`, floored at 0.
   *
   * Used by PsionicItemCard for cognizance crystals and psicrowns.
   *
   * @param instanceId - The `ActiveFeatureInstance.instanceId`.
   * @param amount     - PP to spend (default: 1).
   */
  drawPsionicItemPP(instanceId: string, amount = 1): void {
    const instance = this.character.activeFeatures.find(
      (afi) => afi.instanceId === instanceId,
    );
    const feature = instance ? (dataLoader.getFeature(instance.featureId) as ItemFeature | undefined) : undefined;
    if (!feature?.psionicItemData) return;
    feature.psionicItemData.storedPP = Math.max(0, (feature.psionicItemData.storedPP ?? 0) - amount);
  }

  /**
   * Restores power points to a psionic item's `storedPP`, capped at `maxPP`.
   *
   * Used by PsionicItemCard for cognizance crystals and psicrowns.
   *
   * @param instanceId - The `ActiveFeatureInstance.instanceId`.
   * @param amount     - PP to restore (default: 1).
   */
  rechargePsionicItemPP(instanceId: string, amount = 1): void {
    const instance = this.character.activeFeatures.find(
      (afi) => afi.instanceId === instanceId,
    );
    const feature = instance ? (dataLoader.getFeature(instance.featureId) as ItemFeature | undefined) : undefined;
    if (!feature?.psionicItemData) return;
    const maxPP = feature.psionicItemData.maxPP ?? 0;
    feature.psionicItemData.storedPP = Math.min(maxPP, (feature.psionicItemData.storedPP ?? 0) + amount);
  }

  /**
   * Uses one charge from a dorje's charge pool, floored at 0.
   *
   * @param instanceId - The `ActiveFeatureInstance.instanceId`.
   */
  usePsionicItemCharge(instanceId: string): void {
    const instance = this.character.activeFeatures.find(
      (afi) => afi.instanceId === instanceId,
    );
    const feature = instance ? (dataLoader.getFeature(instance.featureId) as ItemFeature | undefined) : undefined;
    if (!feature?.psionicItemData) return;
    if ((feature.psionicItemData.charges ?? 0) <= 0) return;
    feature.psionicItemData.charges = (feature.psionicItemData.charges ?? 1) - 1;
  }

  /**
   * Toggles the `attuned` flag on a cognizance crystal.
   *
   * @param instanceId - The `ActiveFeatureInstance.instanceId`.
   */
  togglePsionicItemAttune(instanceId: string): void {
    const instance = this.character.activeFeatures.find(
      (afi) => afi.instanceId === instanceId,
    );
    const feature = instance ? (dataLoader.getFeature(instance.featureId) as ItemFeature | undefined) : undefined;
    if (!feature?.psionicItemData) return;
    feature.psionicItemData.attuned = !feature.psionicItemData.attuned;
  }

  /**
   * Activates a psionic tattoo (sets `activated = true`).
   * Once activated a tattoo cannot be de-activated via normal means.
   *
   * @param instanceId - The `ActiveFeatureInstance.instanceId`.
   */
  activatePsionicTattoo(instanceId: string): void {
    const instance = this.character.activeFeatures.find(
      (afi) => afi.instanceId === instanceId,
    );
    const feature = instance ? (dataLoader.getFeature(instance.featureId) as ItemFeature | undefined) : undefined;
    if (!feature?.psionicItemData) return;
    feature.psionicItemData.activated = true;
  }

  /**
   * Marks a power stone imprinted power as used up.
   *
   * @param instanceId - The `ActiveFeatureInstance.instanceId`.
   * @param entryIndex - Zero-based index into `psionicItemData.powersImprinted`.
   */
  flushPowerStoneEntry(instanceId: string, entryIndex: number): void {
    const instance = this.character.activeFeatures.find(
      (afi) => afi.instanceId === instanceId,
    );
    const feature = instance ? (dataLoader.getFeature(instance.featureId) as ItemFeature | undefined) : undefined;
    if (!feature?.psionicItemData?.powersImprinted) return;
    if (entryIndex < 0 || entryIndex >= feature.psionicItemData.powersImprinted.length) return;
    feature.psionicItemData.powersImprinted[entryIndex].usedUp = true;
  }

  /**
   * Resets all item instance pools whose template declares the given `resetCondition`.
   *
   * Private helper invoked by `triggerDawnReset()` and `triggerWeeklyReset()` to
   * handle item pools alongside character-level `resources` pools.
   *
   * ALGORITHM:
   *   For each active feature instance → load the feature → for each template
   *   with matching `resetCondition` → restore `itemResourcePools[poolId]`
   *   to the template's `defaultCurrent` (treated as the full max for calendar-reset
   *   item pools, since the actual max pipeline may vary).
   *
   * @param condition - The `resetCondition` value to match against templates.
   */
  #resetItemPoolsByCondition(condition: ResourcePoolTemplate['resetCondition']): void {
    for (const instance of this.character.activeFeatures) {
      if (!instance.isActive) continue; // stashed items don't reset

      const feature = dataLoader.getFeature(instance.featureId);
      if (!feature?.resourcePoolTemplates) continue;

      // Ensure itemResourcePools exists before writing to it.
      if (!instance.itemResourcePools) {
        instance.itemResourcePools = {};
      }

      for (const template of feature.resourcePoolTemplates) {
        if (template.resetCondition !== condition) continue;
        // Restore to defaultCurrent (the "full" value defined by the template).
        // For a Ring of Spell Turning with 3/day, this resets the pool back to 3.
        instance.itemResourcePools[template.poolId] = template.defaultCurrent;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS — Resource tick & max resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolves the effective maximum for a resource pool.
   *
   * Reads the `maxPipelineId` pointer and looks up the pipeline's `totalValue`
   * from the current character state. Falls back to the pool's current value if the
   * pipeline is not found (prevents accidental over-correction during early init).
   *
   * @param pool - The resource pool whose max is needed.
   * @returns The effective maximum as a number.
   */
  #getEffectiveMax(pool: ResourcePool): number {
    // Search across all pipeline categories for the maxPipelineId
    const allPipelines: Record<string, { totalValue: number }> = {
      ...this.character.attributes,
      ...this.character.combatStats,
      ...this.character.saves,
    };
    const pipeline = allPipelines[pool.maxPipelineId];
    if (pipeline) {
      return pipeline.totalValue;
    }
    // GAP-01 auto-convention: if no explicit pipeline is found, check if modifiers
    // targeting "resources.<poolId>.maxValue" have accumulated in combatStats.<poolId>_max.
    // This is the virtual pipeline created by normaliseModifierTargetId().
    // Example: pool.id = "resources.barbarian_rage_uses" → check "combatStats.barbarian_rage_uses_max"
    if (pool.id.startsWith('resources.')) {
      const poolKey = pool.id.slice('resources.'.length);
      const autoMaxPipelineId = `combatStats.${poolKey}_max`;
      const autoPipeline = this.character.combatStats[autoMaxPipelineId];
      if (autoPipeline && autoPipeline.totalValue > 0) {
        return autoPipeline.totalValue;
      }
    }
    // Fallback: use current value (prevents accidental zero-cap during init)
    return pool.currentValue;
  }

  /**
   * Core incremental tick implementation shared by `triggerTurnTick` and `triggerRoundTick`.
   *
   * For each pool with the given `resetCondition`:
   *   1. Resolves `rechargeAmount` (formula or number; defaults to 0 if absent).
   *   2. Adds the amount to `currentValue`.
   *   3. Clamps `currentValue` to `[currentValue, effectiveMax]` (cannot exceed max,
   *      cannot go below its pre-tick value through this method).
   *
   * FORMULA EVALUATION:
   *   If `rechargeAmount` is a string formula, it is resolved via the Math Parser
   *   using the current `phase0_context` snapshot. This allows scaling recharge
   *   rates (e.g., `"floor(@classLevels.class_cleric / 2)"` for level-scaled healing).
   *
   * @param condition - `"per_turn"` or `"per_round"`.
   */
  #applyIncrementalTick(condition: 'per_turn' | 'per_round'): void {
    for (const pool of Object.values(this.character.resources)) {
      if (pool.resetCondition !== condition) continue;

      // Resolve rechargeAmount (number or formula string)
      const raw = pool.rechargeAmount;
      let amount = 0;
      if (typeof raw === 'number') {
        amount = raw;
      } else if (typeof raw === 'string') {
        const resolved = evaluateFormula(raw, this.phase0_context, this.settings.language);
        amount = typeof resolved === 'number' ? resolved : parseFloat(String(resolved)) || 0;
      }
      // Nothing to recharge if amount ≤ 0
      if (amount <= 0) continue;

      // Apply recharge, capped at effective maximum
      const max = this.#getEffectiveMax(pool);
      pool.currentValue = Math.min(pool.currentValue + amount, max);
    }
  }

  /** Toggles a feature instance's active state (equip/unequip, buff on/off). */
  setFeatureActive(instanceId: ID, isActive: boolean): void {
    const instance = this.character.activeFeatures.find(f => f.instanceId === instanceId);
    if (instance) {
      instance.isActive = isActive;
    } else {
      console.warn(`[GameEngine] setFeatureActive: instance "${instanceId}" not found.`);
    }
  }

  /** Adds a new ActiveFeatureInstance to the character. Prevents duplicate instanceIds. */
  addFeature(instance: ActiveFeatureInstance): void {
    if (this.character.activeFeatures.some(f => f.instanceId === instance.instanceId)) {
      console.warn(`[GameEngine] addFeature: instance "${instance.instanceId}" already exists.`);
      return;
    }
    this.character.activeFeatures.push(instance);
  }

  /**
   * Removes an ActiveFeatureInstance by instanceId.
   *
   * CURSED ITEM GUARD (Enhancement E-14):
   *   If the item's Feature definition has `removalPrevention.isCursed === true`,
   *   this method REFUSES to remove it and logs a warning instead.
   *
   *   The rationale: cursed items in D&D 3.5 cannot be voluntarily removed.
   *   Allowing `removeFeature()` to succeed would bypass the curse mechanic.
   *   The correct removal path is `tryRemoveCursedItem(instanceId, dispelMethod)`.
   *
   *   EXCEPTION: This guard is bypassed when called from `tryRemoveCursedItem()`.
   *   The private `#removeFeatureUnchecked()` method provides the bypass.
   *
   * @param instanceId - The instanceId of the feature to remove.
   */
  removeFeature(instanceId: ID): void {
    // --- Cursed item guard ---
    const instance = this.character.activeFeatures.find(f => f.instanceId === instanceId);
    if (instance) {
      const feature = dataLoader.getFeature(instance.featureId);
      const itemFeature = feature as (typeof feature & { removalPrevention?: { isCursed: boolean; removableBy: string[]; preventionNote?: string } });
      if (itemFeature?.removalPrevention?.isCursed) {
        console.warn(
          `[GameEngine] removeFeature: "${instanceId}" (featureId: "${instance.featureId}") ` +
          `is a cursed item and cannot be removed normally. ` +
          `Use tryRemoveCursedItem(instanceId, dispelMethod) instead. ` +
          `Removable by: ${itemFeature.removalPrevention.removableBy.join(', ')}.`
        );
        return; // Refuse removal
      }
    }
    this.#removeFeatureUnchecked(instanceId);
  }

  /**
   * Attempts to remove a cursed item from the character's active features
   * by applying a specific dispel method.
   *
   * D&D 3.5 CONTEXT:
   *   Cursed items cannot be removed by normal means. They can only be dispelled
   *   by specific magical interventions listed in their `removalPrevention.removableBy`
   *   array. When a cleric casts remove curse, or a wizard casts wish, this method
   *   is called with the appropriate dispel method string.
   *
   * ALGORITHM:
   *   1. Find the source instance.
   *   2. Load the Feature definition to get `removalPrevention`.
   *   3. If the item is not cursed (no `removalPrevention`): log a warning
   *      (use `removeFeature()` instead for non-cursed items).
   *   4. If `dispelMethod` is NOT in `removableBy`: return `false` (insufficient magic).
   *   5. If `dispelMethod` IS in `removableBy`: call `#removeFeatureUnchecked()` and
   *      return `true` (curse successfully broken).
   *
   * RETURN VALUE:
   *   `true` — curse was successfully broken, item removed.
   *   `false` — insufficient magic (dispelMethod not in removableBy), item stays.
   *   `null` — instance not found or item not cursed (wrong method called).
   *
   * EXAMPLE USAGE:
   *   ```typescript
   *   // Cleric casts remove curse on the player's ring of clumsiness:
   *   const removed = engine.tryRemoveCursedItem(ringInstanceId, 'remove_curse');
   *   if (removed) {
   *     ui.showMessage("The curse is broken! You remove the ring.");
   *   } else {
   *     ui.showMessage("The remove curse spell was insufficient for this curse.");
   *   }
   *   ```
   *
   * @param instanceId    - The instanceId of the cursed item.
   * @param dispelMethod  - The magic used: 'remove_curse' | 'limited_wish' | 'wish' | 'miracle'
   * @returns `true` (removed), `false` (insufficient magic), or `null` (not found / not cursed)
   *
   * @see removeFeature() — blocked for cursed items; use this method instead
   * @see ARCHITECTURE.md section 4.15 — Cursed Item Removal contract
   */
  tryRemoveCursedItem(
    instanceId: ID,
    dispelMethod: 'remove_curse' | 'limited_wish' | 'wish' | 'miracle'
  ): boolean | null {
    const instance = this.character.activeFeatures.find(f => f.instanceId === instanceId);
    if (!instance) {
      console.warn(`[GameEngine] tryRemoveCursedItem: instance "${instanceId}" not found.`);
      return null;
    }

    const feature = dataLoader.getFeature(instance.featureId);
    const itemFeature = feature as (typeof feature & { removalPrevention?: { isCursed: boolean; removableBy: string[]; preventionNote?: string } });

    if (!itemFeature?.removalPrevention?.isCursed) {
      console.warn(
        `[GameEngine] tryRemoveCursedItem: "${instance.featureId}" is not a cursed item. ` +
        `Use removeFeature() to remove non-cursed items.`
      );
      return null;
    }

    // Check if the dispel method is sufficient
    if (!itemFeature.removalPrevention.removableBy.includes(dispelMethod)) {
      // Insufficient magic — curse stands
      return false;
    }

    // Sufficient magic — remove the item
    this.#removeFeatureUnchecked(instanceId);
    return true;
  }

  /**
   * Internal unchecked removal — bypasses the cursed item guard.
   * Called by: removeFeature() (after guard passes), tryRemoveCursedItem() (after magic check),
   * expireEffect() (ephemeral effects are never cursed), consumeItem() (same).
   */
  #removeFeatureUnchecked(instanceId: ID): void {
    const index = this.character.activeFeatures.findIndex(f => f.instanceId === instanceId);
    if (index !== -1) {
      this.character.activeFeatures.splice(index, 1);
    } else {
      console.warn(`[GameEngine] removeFeature: instance "${instanceId}" not found.`);
    }
  }

  // ---------------------------------------------------------------------------
  // CONSUMABLE ITEM METHODS — Two-phase consumption for potions, oils, scrolls
  // ---------------------------------------------------------------------------

  /**
   * Consumes a single-use item (potion, oil, scroll) and creates an ephemeral
   * `ActiveFeatureInstance` carrying its effects.
   *
   * D&D 3.5 CONTEXT:
   *   When a character drinks a Potion of Bull's Strength, two things happen
   *   simultaneously:
   *   1. The potion is destroyed (disappears from inventory).
   *   2. The character gains +4 STR enhancement for the duration.
   *
   *   This method handles BOTH steps atomically.
   *
   * ALGORITHM:
   *   1. Find the source `ActiveFeatureInstance` by `instanceId`.
   *   2. Load the associated `ItemFeature` from the DataLoader.
   *   3. Validate the feature is consumable (`feature.consumable?.isConsumable`).
   *   4. Create a new ephemeral `ActiveFeatureInstance`:
   *      - `featureId`: same as the consumed item (so the same modifiers apply)
   *      - `isActive: true` (effect is immediately active)
   *      - `ephemeral.isEphemeral: true` (signals the EphemeralEffectsPanel)
   *      - `ephemeral.sourceItemInstanceId`: the consumed item's instanceId (for display)
   *      - `ephemeral.appliedAtRound`: the current combat round (0 if out of combat)
   *      - `ephemeral.durationHint`: copied from the feature's `consumable.durationHint`
   *   5. Push the ephemeral instance into `activeFeatures`.
   *   6. Remove the source item instance (the potion is now consumed).
   *
   * RETURN VALUE:
   *   The `instanceId` of the created ephemeral effect, or `null` on failure.
   *   The caller can use this to highlight the new effect in the UI.
   *
   * FAILURE MODES (returns `null` and logs a warning):
   *   - Source instance not found.
   *   - Feature data not found in DataLoader.
   *   - Feature is not consumable (`consumable.isConsumable` is absent/false).
   *
   * @param sourceInstanceId - The `instanceId` of the item to consume.
   * @param currentRound     - The current in-game combat round (default 0).
   * @returns The new ephemeral effect's `instanceId`, or `null` on failure.
   *
   * @see expireEffect() — removes the ephemeral instance when the effect ends
   * @see EphemeralEffectsPanel.svelte — displays active ephemeral effects
   */
  consumeItem(sourceInstanceId: ID, currentRound = 0): ID | null {
    // --- Step 1: Find the source item instance ---
    const sourceInstance = this.character.activeFeatures.find(
      f => f.instanceId === sourceInstanceId
    );
    if (!sourceInstance) {
      console.warn(`[GameEngine] consumeItem: instance "${sourceInstanceId}" not found.`);
      return null;
    }

    // --- Step 2: Load the feature definition ---
    const feature = dataLoader.getFeature(sourceInstance.featureId);
    if (!feature) {
      console.warn(`[GameEngine] consumeItem: feature "${sourceInstance.featureId}" not found in DataLoader.`);
      return null;
    }

    // --- Step 3: Validate the item is consumable ---
    // We use a type guard pattern: check for the `consumable.isConsumable` flag.
    // Non-consumable items (rings, armour) must NOT be destroyed by this method.
    const itemFeature = feature as (typeof feature & { consumable?: { isConsumable: true; durationHint?: string } });
    if (!itemFeature.consumable?.isConsumable) {
      console.warn(
        `[GameEngine] consumeItem: feature "${sourceInstance.featureId}" is not consumable. ` +
        `Add consumable.isConsumable: true to the item's JSON definition.`
      );
      return null;
    }

    // --- Step 4: Create the ephemeral effect instance ---
    //
    // The ephemeral instance references the SAME featureId as the consumed item.
    // This means the same `grantedModifiers` from the potion's JSON will be applied
    // to the character's DAG. The effect is active immediately.
    //
    // The instanceId uses a timestamp to ensure uniqueness even if the same item
    // type is consumed multiple times (e.g., two Potions of Cure Light Wounds).
    const ephemeralInstanceId: ID = `eph_${sourceInstance.featureId}_${Date.now()}`;

    const ephemeralInstance: ActiveFeatureInstance = {
      instanceId: ephemeralInstanceId,
      featureId: sourceInstance.featureId,
      isActive: true,
      // Copy any selections from the source (e.g., if a potion had a choice)
      selections: sourceInstance.selections ? { ...sourceInstance.selections } : undefined,
      ephemeral: {
        isEphemeral: true,
        appliedAtRound: currentRound,
        sourceItemInstanceId: sourceInstanceId,
        durationHint: itemFeature.consumable.durationHint,
      },
    };

    // --- Step 5: Push the ephemeral instance and remove the source ---
    //
    // Order matters: push first, then splice. This ensures the DAG never sees a
    // frame with NEITHER the item NOR the effect (avoids a one-tick gap in buffs).
    // Use unchecked removal — potions/consumables are NEVER cursed items.
    this.character.activeFeatures.push(ephemeralInstance);
    this.#removeFeatureUnchecked(sourceInstanceId);

    return ephemeralInstanceId;
  }

  /**
   * Expires (ends) an ephemeral effect by removing it from `activeFeatures`.
   *
   * Called when:
   *   (a) The player clicks the "Expire" button on an effect card in `EphemeralEffectsPanel`.
   *   (b) A future session manager auto-expires an effect after N rounds/minutes.
   *
   * SAFETY:
   *   This method will ONLY remove instances that have `ephemeral.isEphemeral: true`.
   *   Attempting to expire a non-ephemeral instance (a race, feat, or equipment item)
   *   is blocked with a warning. This prevents accidental data loss via misuse.
   *
   * @param instanceId - The ephemeral `ActiveFeatureInstance.instanceId` to remove.
   *
   * @see consumeItem() — creates ephemeral instances
   * @see EphemeralEffectsPanel.svelte — the UI that calls this method
   */
  expireEffect(instanceId: ID): void {
    const instance = this.character.activeFeatures.find(f => f.instanceId === instanceId);
    if (!instance) {
      console.warn(`[GameEngine] expireEffect: instance "${instanceId}" not found.`);
      return;
    }

    // Guard: only remove truly ephemeral instances.
    // This prevents the "Expire" button from accidentally deleting permanent features.
    if (!instance.ephemeral?.isEphemeral) {
      console.warn(
        `[GameEngine] expireEffect: instance "${instanceId}" (featureId: "${instance.featureId}") ` +
        `is not ephemeral. Use removeFeature() to remove permanent instances.`
      );
      return;
    }

    // Ephemeral effects are NEVER cursed items — safe to use unchecked removal.
    this.#removeFeatureUnchecked(instanceId);
  }

  /**
   * Returns all currently active ephemeral effect instances on this character.
   *
   * This is a pure helper — it does not trigger any DAG recomputation.
   * Used by `EphemeralEffectsPanel` to build the active effects list.
   *
   * Note: The returned array is a filtered VIEW of `activeFeatures`.
   * Mutating it does NOT affect the character state — use `expireEffect()` to remove.
   *
   * @returns Array of ephemeral `ActiveFeatureInstance`s sorted by `appliedAtRound`
   *          (most recently applied first).
   */
  getEphemeralEffects(): ActiveFeatureInstance[] {
    return this.character.activeFeatures
      .filter(afi => afi.ephemeral?.isEphemeral === true)
      .sort((a, b) => {
        // Most recently applied effects appear first in the panel.
        const aRound = a.ephemeral?.appliedAtRound ?? 0;
        const bRound = b.ephemeral?.appliedAtRound ?? 0;
        return bRound - aRound;
      });
  }

  /** Updates campaign settings. Partial updates are merged with Object.assign. */
  updateSettings(newSettings: Partial<CampaignSettings>): void {
    Object.assign(this.settings, newSettings);
  }

  /**
   * Sets the selections for a specific choice on a feature instance.
   *
   * This is called by the FeatureModal when a player picks a choice option
   * (e.g., Dromite energy type, Cleric domain). The selections are stored on
   * the `ActiveFeatureInstance` for the parent race/class feature.
   *
   * @param featureId  - The feature whose instance to update (e.g., "race_dromite").
   * @param choiceId   - The choice within that feature (e.g., "chitin_energy_type").
   * @param selectedIds - The selected option IDs (e.g., ["dromite_energy_fire"]).
   */
  setFeatureSelection(featureId: ID, choiceId: string, selectedIds: string[]): void {
    const instance = this.character.activeFeatures.find(
      afi => afi.featureId === featureId && afi.isActive,
    );
    if (!instance) {
      console.warn(`[GameEngine] setFeatureSelection: no active instance for featureId="${featureId}"`);
      return;
    }
    if (!instance.selections) instance.selections = {};
    instance.selections[choiceId] = selectedIds;
  }

  // ---------------------------------------------------------------------------
  // CLASS LEVEL MANAGEMENT — keeps classLevels mutations in the engine
  // (ARCHITECTURE.md §3: no game logic in .svelte files)
  // ---------------------------------------------------------------------------

  /**
   * Sets the level for a specific class, initialising classLevels if needed.
   *
   * Called by `BasicInfo.svelte` when the player chooses a class. Keeping this
   * mutation in the engine ensures the DAG re-evaluates every downstream phase
   * (phase0_characterLevel, skill-points budget, feat slots, BAB, saves …)
   * in a single reactive cycle.
   *
   * @param classFeatureId - The class feature ID (e.g., "class_fighter").
   * @param level          - The level to set. Must be ≥ 1.
   */
  setClassLevel(classFeatureId: ID, level: number): void {
    if (level < 1) {
      console.warn(`[GameEngine] setClassLevel: level must be ≥ 1 (got ${level}). Use deleteClassLevel() to remove.`);
      return;
    }
    // Clamp to MAX_CLASS_LEVEL (20 by default, per ARCHITECTURE.md §6 / constants.ts).
    // Validation lives here — not in .svelte files (zero-game-logic rule, ARCHITECTURE.md §3).
    const clamped = Math.min(level, MAX_CLASS_LEVEL);
    if (clamped !== level) {
      console.warn(`[GameEngine] setClassLevel: level ${level} exceeds MAX_CLASS_LEVEL (${MAX_CLASS_LEVEL}). Clamped to ${clamped}.`);
    }
    this.character.classLevels[classFeatureId] = clamped;
  }

  /**
   * Removes a class from classLevels entirely.
   *
   * Called by `BasicInfo.svelte` when the player switches to a different class,
   * to prevent stale class entries from inflating the total character level.
   * Removing via the engine ensures the reactive DAG immediately re-evaluates.
   *
   * @param classFeatureId - The class feature ID to remove.
   */
  deleteClassLevel(classFeatureId: ID): void {
    delete this.character.classLevels[classFeatureId];
  }

  /**
   * Atomically replaces the character's current class with a new one.
   *
   * ZERO-GAME-LOGIC-IN-SVELTE RULE (ARCHITECTURE.md §3):
   *   Previously `BasicInfo.svelte` orchestrated this multi-step operation:
   *     1. Reading `engine.character.activeFeatures` to collect previous class IDs.
   *     2. Calling `engine.removeFeature()` for each.
   *     3. Calling `engine.deleteClassLevel()` for each.
   *     4. Adding the new class feature and setting level = 1.
   *   This coordination logic involves knowledge of the character's internal
   *   data model (classLevels, activeFeatures, the "one active class" invariant)
   *   and therefore belongs here, not in a .svelte component.
   *
   * D&D 3.5 CONTEXT:
   *   A character may only have one primary class in the single-class selector
   *   on the Core tab. Switching class removes all prior class feature instances
   *   and clears their classLevels entries so the character level is not inflated.
   *   Multiclassing is handled by additional class rows, not by this method.
   *
   * @param newClassId - The feature ID of the class to switch to (e.g.,
   *   `"class_fighter"`). Pass an empty string to clear the class entirely.
   */
  replaceClass(newClassId: string): void {
    // Collect all current class feature instances (by category lookup).
    const classInstances = this.character.activeFeatures.filter(afi => {
      const feature = dataLoader.getFeature(afi.featureId);
      return feature?.category === 'class';
    });

    // Remove each class instance and delete its classLevels entry.
    for (const afi of classInstances) {
      this.#removeFeatureUnchecked(afi.instanceId);
      delete this.character.classLevels[afi.featureId];
    }

    // If a new class was selected, initialise it at level 1 and add the instance.
    if (newClassId) {
      this.setClassLevel(newClassId, 1);
      this.addFeature({
        instanceId: `afi_class_${newClassId}`,
        featureId:  newClassId,
        isActive:   true,
      });
    }
  }

  /**
   * Replaces the character's race by removing all existing race feature instances
   * and adding the new one (or clearing if an empty string is passed).
   *
   * WHY IN THE ENGINE:
   *   BasicInfo.svelte previously implemented a `removeAllOfCategory('race')` helper
   *   that filtered activeFeatures by category — game-domain logic that violates
   *   ARCHITECTURE.md §3 (zero-game-logic-in-Svelte). This method centralises the
   *   race-replacement lifecycle in the engine, mirroring the pattern of `replaceClass`.
   *
   * @param newRaceId - The feature ID of the new race (e.g. `"race_elf"`).
   *   Pass an empty string to clear the race entirely.
   */
  replaceRace(newRaceId: string): void {
    const raceInstances = this.character.activeFeatures.filter(afi => {
      const feature = dataLoader.getFeature(afi.featureId);
      return feature?.category === 'race';
    });
    for (const afi of raceInstances) {
      this.#removeFeatureUnchecked(afi.instanceId);
    }
    if (newRaceId) {
      this.addFeature({ instanceId: `afi_race_${newRaceId}`, featureId: newRaceId, isActive: true });
    }
  }

  /**
   * Replaces the character's deity by removing all existing deity feature instances
   * and adding the new one (or clearing if an empty string is passed).
   *
   * WHY IN THE ENGINE:
   *   Mirrors the pattern of `replaceClass` and `replaceRace`. BasicInfo.svelte
   *   previously implemented a `removeAllOfCategory('deity')` helper in Svelte code,
   *   violating ARCHITECTURE.md §3 (zero-game-logic-in-Svelte). This method
   *   centralises deity-replacement in the engine layer.
   *
   * @param newDeityId - The feature ID of the new deity (e.g. `"deity_heironeous"`).
   *   Pass an empty string to clear the deity entirely.
   */
  replaceDeity(newDeityId: string): void {
    const deityInstances = this.character.activeFeatures.filter(afi => {
      const feature = dataLoader.getFeature(afi.featureId);
      return feature?.category === 'deity';
    });
    for (const afi of deityInstances) {
      this.#removeFeatureUnchecked(afi.instanceId);
    }
    if (newDeityId) {
      this.addFeature({ instanceId: `afi_deity_${newDeityId}`, featureId: newDeityId, isActive: true });
    }
  }

  // ---------------------------------------------------------------------------
  // ALIGNMENT — keeps synthetic feature construction in the engine
  // ---------------------------------------------------------------------------

  /**
   * Sets the character's alignment.
   *
   * D&D 3.5 context: Alignment is a character property that affects interaction
   * with spells, powers, and items (e.g., Holy Avenger requires Good alignment).
   * It is modelled as a synthetic `Feature` instance with a unique tag so that
   * `@activeTags` and `prerequisitesNode` checks can reference it.
   *
   * DESIGN:
   *   Alignments may or may not exist as full Feature entries in the loaded rule
   *   files (a campaign might define them, or might not). This method handles
   *   both cases:
   *     1. If the alignment Feature is already in the DataLoader cache (from a
   *        rule file), it is used as-is.
   *     2. Otherwise, a minimal synthetic Feature is registered in the DataLoader
   *        cache using the localized label from the `ALIGNMENTS` constant in
   *        `constants.ts`. The synthetic feature grants no modifiers — it only
   *        exists so that `@activeTags` emits the alignment tag for logic nodes.
   *
   * ZERO-GAME-LOGIC-IN-SVELTE RULE (ARCHITECTURE.md §3):
   *   Previously, `BasicInfo.svelte` called `dataLoader.cacheFeature()` directly
   *   to synthesize alignment features. This violated the rule that game entity
   *   construction must not happen in `.svelte` files. This method centralises
   *   that logic in the engine layer.
   *
   * @param alignmentId - One of the canonical alignment IDs (e.g.,
   *   `'alignment_lawful_good'`). Pass an empty string to clear the alignment.
   */
  setAlignment(alignmentId: string): void {
    // 1. Remove all existing alignment feature instances.
    const toRemove = this.character.activeFeatures
      .filter(afi => afi.featureId.startsWith('alignment_'))
      .map(afi => afi.instanceId);
    for (const instanceId of toRemove) {
      this.#removeFeatureUnchecked(instanceId);
    }

    if (!alignmentId) return; // Clearing alignment — done.

    // 2. Ensure the alignment feature is in the DataLoader cache.
    //    If a rule file already defined it, the cache hit short-circuits.
    if (!dataLoader.getFeature(alignmentId)) {
      const config = ALIGNMENTS.find(a => a.id === alignmentId);
      if (!config) {
        console.warn(`[GameEngine] setAlignment: unknown alignment ID "${alignmentId}". Skipping.`);
        return;
      }
      // Build the localized label from the ui-strings.ts key.
      // `buildLocalizedString(config.ui_key)` reads all currently loaded locale
      // files so every supported language resolves correctly. Translations live
      // in `static/locales/fr.json` etc.; no inline language strings in engine code.
      const alignLabel = buildLocalizedString(config.ui_key);
      // Register the synthetic feature. It has no modifiers — the alignment tag
      // is the only thing that matters for prerequisite and logic-node checks.
      dataLoader.cacheFeature({
        id:              alignmentId,
        category:        'condition',
        label:           alignLabel,
        description:     alignLabel,
        tags:            [alignmentId],
        grantedModifiers: [],
        grantedFeatures: [],
        ruleSource:      'core_system',
      });
    }

    // 3. Add the alignment as an active feature instance.
    this.addFeature({
      instanceId: `afi_alignment_${alignmentId}`,
      featureId:  alignmentId,
      isActive:   true,
    });
  }

  // ---------------------------------------------------------------------------
  // ITEM STASH MANAGEMENT — keeps isStashed mutations in the engine
  // ---------------------------------------------------------------------------

  /**
   * Moves a stashed item back into the backpack (carried) state.
   *
   * "Stashed" items are stored at a location other than on the character's
   * person — they don't count toward encumbrance and are not readied for use.
   * This method removes the stash flag so the item becomes a carried item again.
   *
   * Called by `InventoryTab.svelte` (Storage section "Move to backpack" button).
   * Centralising here keeps direct `ActiveFeatureInstance` mutations out of the
   * Svelte component (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
   *
   * @param instanceId - The `ActiveFeatureInstance.instanceId` to un-stash.
   */
  moveItemFromStash(instanceId: ID): void {
    const afi = this.character.activeFeatures.find(a => a.instanceId === instanceId);
    if (!afi) {
      console.warn(`[GameEngine] moveItemFromStash: instance "${instanceId}" not found.`);
      return;
    }
    afi.isStashed = false;
  }


  // ---------------------------------------------------------------------------
  // CHARACTER RESOURCE POOL MUTATIONS
  // ---------------------------------------------------------------------------

  /**
   * Spends charges from a character-scoped resource pool (e.g., Turn Undead uses,
   * Rage uses, domain power uses stored in `character.resources`).
   *
   * D&D 3.5 USAGE:
   *   Called by `SpecialAbilities.svelte` when the player clicks "Use" on a class
   *   feature or domain ability. The `resourceCost` on `Feature.activation` specifies
   *   which pool (`targetId`) and how many charges (`cost`) to deduct.
   *
   * FLOORS AT 0:
   *   The pool cannot go negative. An already-empty pool is a no-op (the button
   *   should be disabled in the UI, but this guard prevents data corruption).
   *
   * CENTRALISED HERE (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3):
   *   The `Math.max(0, pool.currentValue - cost)` arithmetic belongs in the engine,
   *   not in the Svelte component. All resource mutations go through engine methods.
   *
   * @param poolId       - The resource pool key in `character.resources` (e.g., `"resources.turn_undead"`).
   * @param cost         - The number of charges to deduct. Must be > 0.
   */
  spendCharacterResource(poolId: string, cost: number): void {
    const pool = this.character.resources[poolId];
    if (!pool) {
      console.warn(`[GameEngine] spendCharacterResource: pool "${poolId}" not found.`);
      return;
    }
    // D&D 3.5: resource pools cannot go below 0 (uses floor at 0).
    pool.currentValue = Math.max(0, pool.currentValue - cost);
  }

  /**
   * Resolves the numeric cost from an activation `resourceCost.cost` value.
   *
   * WHY IN THE ENGINE (ARCHITECTURE.md §3 — zero game logic in .svelte files):
   *   `Feature.activation.resourceCost.cost` is typed as `number | string` because
   *   simple integer strings ("2") and future formula strings
   *   ("1 + @classLevels.class_druid") are both valid. Parsing this to a usable
   *   number is cost-resolution logic — it must not live in a Svelte component.
   *
   *   Full formula evaluation (e.g., `"1 + @classLevels.class_druid"`) is deferred
   *   to a future phase. For now this handles the common cases:
   *     - `number`  → returned as-is.
   *     - `string`  → parsed as a float; falls back to 1 if unparseable.
   *
   * @param cost - The raw cost from `activation.resourceCost.cost`.
   * @returns The resolved numeric cost (always ≥ 1).
   */
  resolveActivationCost(cost: number | string): number {
    if (typeof cost === 'number') return cost;
    const parsed = parseFloat(String(cost));
    return isNaN(parsed) ? 1 : parsed;
  }

  // ---------------------------------------------------------------------------
  // PIPELINE LABEL RESOLUTION — for FeatureModal and CastingPanel
  // ---------------------------------------------------------------------------

  /**
   * Static fallback labels for pipeline `targetId` values that have no
   * corresponding runtime `StatisticPipeline` in phase2/3/4.
   *
   * WHY IN THE ENGINE (ARCHITECTURE.md §6 — zero hardcoding in .svelte files):
   *   D&D ability-score names ("Strength", "Dexterity", etc.) and system stat
   *   names are game content. They must not appear as literal strings in Svelte
   *   components. Centralising the fallback map here keeps all game-term
   *   localisation in a single source of truth and out of the UI layer.
   *
   * These are `LocalizedString`-compatible objects so they are routed through
   * `engine.t()` exactly like every other label in the system.
   */
  static readonly PIPELINE_FALLBACK_LABELS: Record<string, { en: string }> = {
    'saves.all':                                { en: 'All Saving Throws'              },
    'saves.fortitude':                          { en: 'Fortitude Save'                 },
    'saves.reflex':                             { en: 'Reflex Save'                    },
    'saves.will':                               { en: 'Will Save'                      },
    'combatStats.attack_bonus':                 { en: 'Attack Bonus'                   },
    'combatStats.stability_check':              { en: 'Stability Check'                },
    'combatStats.hit_die_type':                 { en: 'Hit Die'                        },
    'combatStats.speed_land':                   { en: 'Land Speed'                     },
    'combatStats.speed_fly':                    { en: 'Fly Speed'                      },
    'combatStats.speed_swim':                   { en: 'Swim Speed'                     },
    'combatStats.speed_climb':                  { en: 'Climb Speed'                    },
    'combatStats.speed_burrow':                 { en: 'Burrow Speed'                   },
    'combatStats.ac_normal':                    { en: 'Armor Class'                    },
    'combatStats.ac_touch':                     { en: 'Touch AC'                       },
    'combatStats.ac_flat_footed':               { en: 'Flat-Footed AC'                 },
    'attributes.speed_land':                    { en: 'Land Speed'                     },
    'attributes.skill_points_per_level':        { en: 'Skill Points / Level'           },
    'attributes.bonus_skill_points_per_level':  { en: 'Bonus Skill Points / Level'     },
    'attributes.bonus_skill_points_1st_level':  { en: 'Bonus Skill Points (1st Level)' },
    'attributes.bonus_feat_slots':              { en: 'Bonus Feat Slots'               },
    'attributes.spell_dc_illusion':             { en: 'Illusion Spell DC'              },
    'attributes.stat_strength':                 { en: 'Strength'                       },
    'attributes.stat_dexterity':                { en: 'Dexterity'                      },
    'attributes.stat_constitution':             { en: 'Constitution'                   },
    'attributes.stat_intelligence':             { en: 'Intelligence'                   },
    'attributes.stat_wisdom':                   { en: 'Wisdom'                         },
    'attributes.stat_charisma':                 { en: 'Charisma'                       },
    'attributes.stat_size':                     { en: 'Size'                           },
    'resources.power_points.maxValue':          { en: 'Power Points (max)'             },
    'resources.vitality_points.maxValue':       { en: 'Vitality Points (max)'          },
    'resources.wound_points.maxValue':          { en: 'Wound Points (max)'             },
    'resources.hp.maxValue':                    { en: 'Hit Points (max)'               },
    'resources.ki_points.maxValue':             { en: 'Ki Points (max)'                },
  };

  /**
   * Resolves a human-readable label for a modifier `targetId`.
   *
   * WHY IN THE ENGINE (ARCHITECTURE.md §3, §6 — zero game logic and zero
   * hardcoding in .svelte files):
   *   Mapping pipeline IDs (e.g. `"attributes.stat_strength"`) to display names
   *   (e.g. "Strength") is both data-access logic (checking live pipelines) and
   *   game-term localisation. Neither belongs in a Svelte component.
   *
   * RESOLUTION ORDER:
   *   1. Live `phase2_attributes` pipeline — most accurate; carries the
   *      language-reactive label from the JSON rule files.
   *   2. Live `phase3_combatStats` pipeline — for combat stat targets.
   *   3. Live `phase4_skills` pipeline — for skill targets (with/without
   *      the "skills." prefix).
   *   4. `GameEngine.PIPELINE_FALLBACK_LABELS` — covers targetIds that have
   *      no runtime pipeline (e.g. `saves.all`, `combatStats.hit_die_type`).
   *   5. Last-resort prettification of the raw ID string.
   *
   * @param targetId - The modifier `targetId` to resolve (e.g. `"attributes.stat_strength"`).
   * @returns A localised human-readable label in the current engine language.
   */
  resolvePipelineLabel(targetId: string): string {
    // 1. Normalize: "attributes.stat_strength" → "stat_strength"
    const normalised = targetId.startsWith('attributes.') ? targetId.slice('attributes.'.length) : targetId;

    // 2. Try live attribute pipelines first (most accurate, language-reactive)
    const attrPipeline = this.phase2_attributes[normalised];
    if (attrPipeline?.label) return this.t(attrPipeline.label);

    // 3. Try live combat stat pipelines
    const combatPipeline = this.phase3_combatStats[targetId];
    if (combatPipeline?.label) return this.t(combatPipeline.label);

    // 4. Try live skill pipelines (targetId may have "skills." prefix)
    const skillId = targetId.startsWith('skills.') ? targetId.slice('skills.'.length) : targetId;
    const skillPipeline = this.phase4_skills[skillId];
    if (skillPipeline?.label) return this.t(skillPipeline.label);

    // 5. Static fallback map for targetIds with no runtime pipeline.
    // English baseline is now in UI_STRINGS (pipeline_label.* keys); all
    // languages — including English — are resolved via ui().
    const fallback = GameEngine.PIPELINE_FALLBACK_LABELS[targetId]
      ?? GameEngine.PIPELINE_FALLBACK_LABELS[`attributes.${targetId}`];
    if (fallback) {
      const uiKey = `pipeline_label.${targetId}`;
      const translated = ui(uiKey, this.lang);
      // ui() returns the key itself only when it is missing from both the loaded
      // locale and UI_STRINGS — treat that as a last-resort fallback.
      if (translated !== uiKey) return translated;
      return fallback.en;
    }

    // 6. Last resort: prettify the raw ID
    return targetId
      .replace(/^(attributes|combatStats|skills|saves|resources)\./, '')
      .replace(/\.maxValue$/, ' ' + ui('pipeline.suffix_max', this.lang))
      .replace(/\.currentValue$/, ' ' + ui('pipeline.suffix_current', this.lang))
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

/**
 * The single shared GameEngine instance used across the entire application.
 *
 * Import pattern in Svelte components:
 *   ```svelte
 *   <script>
 *     import { engine } from '$lib/engine/GameEngine.svelte';
 *   </script>
 *   ```
 *
 * In tests, create a fresh instance: `const engine = new GameEngine();`
 */
export const engine = new GameEngine();
