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
 *     Phase 0 (3.2): Feature Flattening → flatModifiers[] (from activeFeatures + gmOverrides)
 *     Phase 1 (3.2): Active Tags        → activeTags[] (flat tag array for logic evaluation)
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
import { t as translateString, formatDistance as fmtDistance, formatWeight as fmtWeight } from '../utils/formatters';
import type { Character, ActiveFeatureInstance } from '../types/character';
import type { CampaignSettings } from '../types/settings';
import type { LocalizedString, SupportedLanguage } from '../types/i18n';
import type { StatisticPipeline, SkillPipeline, ResourcePool, Modifier } from '../types/pipeline';
import type { Feature } from '../types/feature';
import type { ID } from '../types/primitives';
import { dataLoader } from './DataLoader';
import { checkCondition } from '../utils/logicEvaluator';
import { evaluateFormula } from '../utils/mathParser';
import type { CharacterContext } from '../utils/mathParser';
import { applyStackingRules, computeDerivedModifier } from '../utils/stackingRules';
import { storageManager, debounce } from './StorageManager';
import { sessionContext } from './SessionContext.svelte';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Maximum times a pipeline can be re-evaluated in a single resolution cycle.
 * Prevents infinite loops from circular feature dependencies.
 * @see ARCHITECTURE.md section 9.1 for the protection strategy.
 */
const MAX_RESOLUTION_DEPTH = 3;

// =============================================================================
// TARGETID NORMALISATION — Handles both JSON authoring conventions
// =============================================================================

/**
 * Normalises a modifier's `targetId` to the internal pipeline key convention used
 * for `Character.attributes`, `Character.combatStats`, `Character.saves`, and
 * `Character.skills`.
 *
 * WHY THIS EXISTS — THE TWO-CONVENTION PROBLEM:
 *   The GameEngine stores pipelines in several `Record<ID, StatisticPipeline>` maps
 *   on the `Character` object. The map KEYS are the canonical IDs:
 *
 *     character.attributes   → keyed by  "stat_str", "stat_dex", ...  (NO prefix)
 *     character.combatStats  → keyed by  "combatStats.bab", "combatStats.ac_normal"  (WITH prefix)
 *     character.saves        → keyed by  "saves.fort", "saves.ref"  (WITH prefix)
 *     character.skills       → keyed by  "skill_climb", "skill_jump"  (NO prefix)
 *
 *   However, ARCHITECTURE.md section 4.3 and ANNEXES.md Annex A use the
 *   `"attributes."` prefix in Math Parser @-paths AND sometimes in targetId fields:
 *
 *     @-paths    : "@attributes.stat_str.totalValue"  (always with namespace)
 *     targetId?  : "attributes.stat_str" OR "stat_str"  (both appear in examples)
 *
 *   The normaliser strips the `"attributes."` prefix from attribute targetIds so
 *   that JSON authors can use either convention and the engine processes them identically.
 *
 *   OTHER NAMESPACES (combatStats.*, saves.*, skill_*) do NOT need normalisation:
 *     - "combatStats.ac_normal" is used consistently both in JSON and as a map key.
 *     - "saves.fort" is used consistently both in JSON and as a map key.
 *     - "skill_climb" is used consistently both in JSON and as the map key.
 *   Only the 6 main attribute stats (and custom homebrew stats) have this ambiguity.
 *
 * @param targetId - The raw `targetId` from a Modifier JSON field.
 * @returns The normalised pipeline key used as a map key in `Character.attributes`.
 */
function normaliseModifierTargetId(targetId: ID): ID {
  // Strip the "attributes." namespace prefix if present.
  // This maps "attributes.stat_str" → "stat_str" (the actual Character.attributes key).
  //
  // Note: strings like "combatStats.bab", "saves.fort", "slots.ring", "skill_climb"
  // do NOT start with "attributes." (they start with "combatStats.", "saves.", "slots.",
  // "skill_", or "resources.") and are returned unchanged.
  if (targetId.startsWith('attributes.')) {
    return targetId.slice('attributes.'.length);
  }
  return targetId;
}

// =============================================================================
// PIPELINE FACTORY HELPERS — Public utilities for tests and DataLoader
// =============================================================================

/**
 * Creates a blank `SkillPipeline` with default values.
 *
 * EXPORTED UTILITY:
 *   Used by:
 *   - Phase 4.2 (DataLoader): When populating `Character.skills` from the
 *     `config_skill_definitions` config table, the DataLoader creates fresh
 *     SkillPipeline entries for each defined skill.
 *   - Phase 17 (Tests): Test helpers call this to build mock skill pipelines
 *     without importing the full character factory.
 *
 * @param pipelineId             - Unique skill pipeline ID (e.g., "skill_climb").
 * @param label                  - Localised display name.
 * @param keyAbility             - The governing ability score ID (e.g., "stat_str").
 * @param appliesArmorCheckPenalty - Whether armour check penalty affects this skill.
 * @param canBeUsedUntrained     - Whether the skill can be used without any ranks.
 * @returns A blank SkillPipeline ready for injection into `Character.skills`.
 */
export function makeSkillPipeline(
  pipelineId: ID,
  label: LocalizedString,
  keyAbility: ID,
  appliesArmorCheckPenalty = false,
  canBeUsedUntrained = true
): SkillPipeline {
  return {
    id: pipelineId,
    label,
    baseValue: 0,
    keyAbility,
    ranks: 0,
    isClassSkill: false,
    appliesArmorCheckPenalty,
    canBeUsedUntrained,
    activeModifiers: [],
    situationalModifiers: [],
    totalBonus: 0,
    totalValue: 0,
    derivedModifier: 0,
  };
}

// =============================================================================
// EMPTY CHARACTER FACTORY
// =============================================================================

/**
 * Creates a blank, empty character with default pipeline structures.
 *
 * All standard pipelines are pre-initialised to avoid null-checks everywhere.
 *
 * PIPELINE LABEL DATA-DRIVENNESS (MINOR fix #3):
 *   Attribute labels (e.g., "Strength"/"Force") are loaded from the `config_attribute_definitions`
 *   config table when the DataLoader is available and the table is loaded. If the table is not
 *   yet available (e.g., at engine bootstrap before rule sources are loaded), the code falls back
 *   to embedded labels — this ensures the engine always starts in a consistent state even before
 *   the DataLoader has finished loading.
 *
 * @param id   - Unique character ID (UUID).
 * @param name - Character display name.
 * @returns A blank Character with all standard pipelines initialised to base values.
 */
export function createEmptyCharacter(id: ID, name: string): Character {
  // Helper to create a blank StatisticPipeline with sensible defaults
  const makePipeline = (pipelineId: ID, label: LocalizedString, baseValue = 0): StatisticPipeline => ({
    id: pipelineId,
    label,
    baseValue,
    activeModifiers: [],
    situationalModifiers: [],
    totalBonus: 0,
    totalValue: baseValue,
    derivedModifier: 0,
  });

  // Helper to create a blank ResourcePool
  const makeResource = (resourceId: ID, label: LocalizedString, maxPipelineId: ID): ResourcePool => ({
    id: resourceId,
    label,
    maxPipelineId,
    currentValue: 0,
    temporaryValue: 0,
    resetCondition: 'long_rest',
  });

  // --- Attribute label resolution (data-driven when available) ---
  //
  // Try to load attribute labels from the `config_attribute_definitions` config table.
  // This allows homebrew content to override stat names without code changes.
  //
  // FALLBACK LABELS:
  //   Embedded labels are used when:
  //   a) The DataLoader has not yet completed loading (engine bootstrap).
  //   b) The 'srd_core' rule source is not in enabledRuleSources.
  //   c) The config_tables.json file failed to load.
  //   In all these cases, the engine remains functional with the embedded fallback labels.
  //
  // WHY NOT FULLY LAZY?
  //   `createEmptyCharacter` is called before `loadRuleSources` at engine init. We cannot
  //   wait for the DataLoader. The data-driven labels update naturally when the character
  //   sheet re-renders because pipeline labels are read from `phase2_attributes` (derived)
  //   not from the initial `character.attributes` ($state) directly.
  const getAttrLabel = (statId: ID, fallback: LocalizedString): LocalizedString => {
    try {
      // DataLoader is a singleton — it may or may not have data yet at this point.
      const attrTable = dataLoader.getConfigTable('config_attribute_definitions');
      if (attrTable?.data) {
        const row = (attrTable.data as Array<Record<string, unknown>>).find(r => r['id'] === statId);
        if (row?.['label'] && typeof row['label'] === 'object') {
          return row['label'] as LocalizedString;
        }
      }
    } catch {
      // DataLoader not yet initialized or table not found — use fallback silently
    }
    return fallback;
  };

  // Default fallback labels for standard attribute pipelines.
  // These are used ONLY when the `config_attribute_definitions` config table
  // has not been loaded yet (engine bootstrap) or is unavailable.
  // At runtime, `getAttrLabel()` above attempts to load from the data-driven
  // config table first, falling back to these constants.
  const DEFAULT_LABELS: Record<string, LocalizedString> = {
    'stat_str':              { en: 'Strength',         fr: 'Force' },
    'stat_dex':              { en: 'Dexterity',        fr: 'Dextérité' },
    'stat_con':              { en: 'Constitution',     fr: 'Constitution' },
    'stat_int':              { en: 'Intelligence',     fr: 'Intelligence' },
    'stat_wis':              { en: 'Wisdom',           fr: 'Sagesse' },
    'stat_cha':              { en: 'Charisma',         fr: 'Charisme' },
    'stat_size':             { en: 'Size',             fr: 'Taille' },
    'stat_caster_level':     { en: 'Caster Level',     fr: 'Niveau de lanceur' },
    'stat_manifester_level': { en: 'Manifester Level', fr: 'Niveau de manifesteur' },
  };

  return {
    id,
    name,
    isNPC: false,
    classLevels: {},
    // Hit die results per character level — empty for a new character.
    // Populated by the Level Up mechanic (Phase 10.1).
    // Key: character level (1-indexed), Value: die result at that level.
    // @see ARCHITECTURE.md section 9, Phase 3: Max HP = sum(hitDieResults) + CON_mod × level
    hitDieResults: {},
    attributes: {
      'stat_str':             makePipeline('stat_str',             getAttrLabel('stat_str',             DEFAULT_LABELS['stat_str']),              10),
      'stat_dex':             makePipeline('stat_dex',             getAttrLabel('stat_dex',             DEFAULT_LABELS['stat_dex']),              10),
      'stat_con':             makePipeline('stat_con',             getAttrLabel('stat_con',             DEFAULT_LABELS['stat_con']),              10),
      'stat_int':             makePipeline('stat_int',             getAttrLabel('stat_int',             DEFAULT_LABELS['stat_int']),              10),
      'stat_wis':             makePipeline('stat_wis',             getAttrLabel('stat_wis',             DEFAULT_LABELS['stat_wis']),              10),
      'stat_cha':             makePipeline('stat_cha',             getAttrLabel('stat_cha',             DEFAULT_LABELS['stat_cha']),              10),
      'stat_size':            makePipeline('stat_size',            getAttrLabel('stat_size',            DEFAULT_LABELS['stat_size']),              0),
      'stat_caster_level':    makePipeline('stat_caster_level',    getAttrLabel('stat_caster_level',    DEFAULT_LABELS['stat_caster_level']),      0),
      'stat_manifester_level':makePipeline('stat_manifester_level',getAttrLabel('stat_manifester_level',DEFAULT_LABELS['stat_manifester_level']),  0),
    },
    combatStats: {
      'combatStats.ac_normal': makePipeline('combatStats.ac_normal', { en: 'Armor Class', fr: "Classe d'armure" }, 10),
      'combatStats.ac_touch': makePipeline('combatStats.ac_touch', { en: 'Touch AC', fr: 'CA de contact' }, 10),
      'combatStats.ac_flat_footed': makePipeline('combatStats.ac_flat_footed', { en: 'Flat-Footed AC', fr: 'CA pris au dépourvu' }, 10),
      'combatStats.bab': makePipeline('combatStats.bab', { en: 'Base Attack Bonus', fr: "Bonus d'attaque de base" }, 0),
      'combatStats.init': makePipeline('combatStats.init', { en: 'Initiative', fr: 'Initiative' }, 0),
      'combatStats.grapple': makePipeline('combatStats.grapple', { en: 'Grapple', fr: 'Lutte' }, 0),
      'combatStats.speed_land': makePipeline('combatStats.speed_land', { en: 'Land Speed', fr: 'Vitesse terrestre' }, 30),
      'combatStats.speed_burrow': makePipeline('combatStats.speed_burrow', { en: 'Burrow Speed', fr: 'Vitesse de fouissement' }, 0),
      'combatStats.speed_climb': makePipeline('combatStats.speed_climb', { en: 'Climb Speed', fr: "Vitesse d'escalade" }, 0),
      'combatStats.speed_fly': makePipeline('combatStats.speed_fly', { en: 'Fly Speed', fr: 'Vitesse de vol' }, 0),
      'combatStats.speed_swim': makePipeline('combatStats.speed_swim', { en: 'Swim Speed', fr: 'Vitesse de nage' }, 0),
      'combatStats.armor_check_penalty': makePipeline('combatStats.armor_check_penalty', { en: 'Armor Check Penalty', fr: "Malus d'armure aux tests" }, 0),
      'combatStats.max_hp': makePipeline('combatStats.max_hp', { en: 'Max Hit Points', fr: 'Points de vie maximum' }, 0),
    },
    saves: {
      'saves.fort': makePipeline('saves.fort', { en: 'Fortitude', fr: 'Vigueur' }, 0),
      'saves.ref': makePipeline('saves.ref', { en: 'Reflex', fr: 'Réflexes' }, 0),
      'saves.will': makePipeline('saves.will', { en: 'Will', fr: 'Volonté' }, 0),
    },
    skills: {},
    resources: {
      'resources.hp': makeResource('resources.hp', { en: 'Hit Points', fr: 'Points de vie' }, 'combatStats.max_hp'),
    },
    activeFeatures: [],
    linkedEntities: [],
  };
}

// =============================================================================
// FLAT MODIFIER ENTRY — used by the DAG flattening phase
// =============================================================================

/**
 * A modifier with context about which feature instance it came from.
 * Used internally by the DAG to trace modifier origins for debugging and breakdown display.
 */
interface FlatModifierEntry {
  /** The resolved Modifier with numeric value (string formulas already evaluated). */
  modifier: Modifier;
  /** The ID of the feature instance that granted this modifier. */
  sourceInstanceId: ID;
  /** The ID of the feature definition that contains this modifier. */
  sourceFeatureId: ID;
}

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

  /** The active campaign settings (language, house rules, enabled sources). */
  settings = $state<CampaignSettings>(createDefaultCampaignSettings());

  /** The currently active character. Replacing this triggers full DAG re-evaluation. */
  character = $state<Character>(createEmptyCharacter('default', 'New Character'));

  /** The URL-based character ID (may differ from character.id during load). */
  activeCharacterId = $state<ID | null>(null);

  /** True while loading character data from storage/API. */
  isLoading = $state<boolean>(false);

  /** Set when a storage error occurs. Displayed as a UI notification. */
  lastError = $state<string | null>(null);

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
   * Loads all characters for the active campaign into the vault.
   * Called when entering the Character Vault page.
   *
   * In Phase 4.1 (localStorage): loads all characters and filters in-memory.
   * In Phase 14.6 (PHP API): replaced by `GET /api/characters?campaignId=X`.
   */
  loadVaultCharacters(): void {
    this.allVaultCharacters = storageManager.loadAllCharacters();
  }

  /**
   * Adds a character to the vault's in-memory list and persists it.
   * Called when creating a new character from the Vault page (Phase 7.4).
   *
   * @param char - The character to add.
   */
  addCharacterToVault(char: Character): void {
    storageManager.saveCharacter(char);
    this.allVaultCharacters.push(char);
  }

  /**
   * Removes a character from the vault (used for deletion, Phase 7.4).
   *
   * @param characterId - The character ID to remove.
   */
  removeCharacterFromVault(characterId: ID): void {
    storageManager.deleteCharacter(characterId);
    const index = this.allVaultCharacters.findIndex(c => c.id === characterId);
    if (index !== -1) {
      this.allVaultCharacters.splice(index, 1);
    }
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

  /**
   * Auto-save $effect: persists the active character ID for session restore.
   */
  readonly #autoSaveActiveIdEffect = $effect.root(() => {
    $effect(() => {
      storageManager.saveActiveCharacterId(this.activeCharacterId);
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
  phase0_flatModifiers: FlatModifierEntry[] = $derived.by(() => {
    // IMPORTANT: Explicitly read both upstream $derived values before passing them
    // to the helper. This ensures Svelte 5 correctly tracks them as dependencies.
    const activeTags = this.phase0_activeTags;
    const context = this.phase0_context;
    return this.#computeFlatModifiers(activeTags, context);
  });

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
  phase0_activeTags: string[] = $derived(this.#computeActiveTags());

  /**
   * DAG Phase 0c: Character level (sum of all class levels).
   *
   * Formula: Object.values(character.classLevels).reduce((a, b) => a + b, 0)
   *
   * Used by: Phase 3 HP calculation, feat slot calculation (Phase 11.1),
   *          class progression gating, skill max ranks.
   */
  phase0_characterLevel: number = $derived(
    Object.values(this.character.classLevels).reduce((sum, lvl) => sum + lvl, 0)
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

    // Build combatStats snapshot
    const combatStats: CharacterContext['combatStats'] = {};
    for (const [id, stat] of Object.entries(char.combatStats)) {
      combatStats[id] = { totalValue: stat.totalValue };
    }

    // Build saves snapshot
    const saves: CharacterContext['saves'] = {};
    for (const [id, save] of Object.entries(char.saves)) {
      saves[id] = { totalValue: save.totalValue };
    }

    return {
      attributes,
      skills,
      combatStats,
      saves,
      characterLevel: this.phase0_characterLevel,
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
  phase1_sizePipeline: StatisticPipeline = $derived.by(() => {
    const base = this.character.attributes['stat_size'];
    if (!base) return { id: 'stat_size', label: { en: 'Size', fr: 'Taille' }, baseValue: 0, activeModifiers: [], situationalModifiers: [], totalBonus: 0, totalValue: 0, derivedModifier: 0 };

    // Collect all modifiers targeting stat_size
    const sizeMods = this.phase0_flatModifiers
      .filter(e => e.modifier.targetId === 'stat_size' && !e.modifier.situationalContext)
      .map(e => e.modifier);

    const situationalSizeMods = this.phase0_flatModifiers
      .filter(e => e.modifier.targetId === 'stat_size' && e.modifier.situationalContext)
      .map(e => e.modifier);

    const stacking = applyStackingRules(sizeMods, base.baseValue);
    const derivedMod = computeDerivedModifier(stacking.totalValue);

    return {
      ...base,
      activeModifiers: stacking.appliedModifiers,
      situationalModifiers: situationalSizeMods,
      totalBonus: stacking.totalBonus,
      totalValue: stacking.totalValue,
      derivedModifier: derivedMod,
    };
  });

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
   * MAIN ABILITY SCORE IDs: stat_str, stat_dex, stat_con, stat_int, stat_wis, stat_cha
   * Also processes any other attribute pipelines (stat_size, custom homebrew stats).
   */
  phase2_attributes: Record<ID, StatisticPipeline> = $derived.by(() => {
    const result: Record<ID, StatisticPipeline> = {};
    const flatMods = this.phase0_flatModifiers;

    for (const [pipelineId, basePipeline] of Object.entries(this.character.attributes)) {
      // Collect modifiers targeting this attribute pipeline
      const activeMods = flatMods
        .filter(e => e.modifier.targetId === pipelineId && !e.modifier.situationalContext)
        .map(e => e.modifier);

      const situationalMods = flatMods
        .filter(e => e.modifier.targetId === pipelineId && e.modifier.situationalContext)
        .map(e => e.modifier);

      // Apply stacking rules to compute totalBonus and totalValue
      const stacking = applyStackingRules(activeMods, basePipeline.baseValue);

      // Compute the D&D 3.5 ability modifier: floor((totalValue - 10) / 2)
      // This is meaningful only for the 6 main ability scores (STR/DEX/CON/INT/WIS/CHA).
      // For other pipelines (stat_size, stat_caster_level), derivedModifier is still computed
      // but effectively unused (it just returns 0 for non-ability-score-like values).
      const derivedMod = computeDerivedModifier(stacking.totalValue);

      result[pipelineId] = {
        ...basePipeline,
        activeModifiers: stacking.appliedModifiers,
        situationalModifiers: situationalMods,
        totalBonus: stacking.totalBonus,
        totalValue: stacking.totalValue,
        derivedModifier: derivedMod,
      };
    }

    return result;
  });

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
  phase2_context: CharacterContext = $derived.by(() => {
    // Start from the Phase 0 context snapshot
    const base = this.phase0_context;

    // Upgrade the attributes section with Phase 2 resolved values
    const upgradedAttributes: CharacterContext['attributes'] = {};
    for (const [id, pipeline] of Object.entries(this.phase2_attributes)) {
      upgradedAttributes[id] = {
        baseValue: pipeline.baseValue,
        totalValue: pipeline.totalValue,
        derivedModifier: pipeline.derivedModifier,
      };
    }

    return {
      ...base,
      attributes: upgradedAttributes,
    };
  });

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
   *
   * WRITES TO:
   *   This $derived updates the character sheet data used by the combat UI components.
   *   The character.$state pipelines are NOT mutated; this returns a computed snapshot.
   *   Phase 4 (skills) reads the armor_check_penalty from the output of this phase.
   */
  phase3_combatStats: Record<ID, StatisticPipeline> = $derived.by(() => {
    const result: Record<ID, StatisticPipeline> = {};
    const flatMods = this.phase0_flatModifiers;
    const attributes = this.phase2_attributes;
    const characterLevel = this.phase0_characterLevel;

    // --- Max HP Special Calculation ---
    // D&D 3.5 formula: sum(hitDieResults per level) + CON_modifier × characterLevel
    // Since hit die results per level are stored in the character's resource pool
    // (rolled or set at level-up), we compute the CON contribution here and add
    // it to the base pipeline (which holds the sum of hit die rolls).
    // CON modifier × character level is added as a runtime bonus.
    const conDerivedMod = attributes['stat_con']?.derivedModifier ?? 0;
    const conHpContrib = conDerivedMod * characterLevel;

    // Process each combat stat pipeline
    for (const [pipelineId, basePipeline] of Object.entries(this.character.combatStats)) {
      const activeMods = flatMods
        .filter(e => e.modifier.targetId === pipelineId && !e.modifier.situationalContext)
        .map(e => e.modifier);

      const situationalMods = flatMods
        .filter(e => e.modifier.targetId === pipelineId && e.modifier.situationalContext)
        .map(e => e.modifier);

      let effectiveBaseValue = basePipeline.baseValue;

      // --- Max HP: sum hit die results + CON modifier × character level ---
      if (pipelineId === 'combatStats.max_hp') {
        // D&D 3.5 Max HP Formula (ARCHITECTURE.md section 9, Phase 3):
        //   Max HP = sum(hitDieResults.values()) + (CON_derivedModifier × character_level)
        //
        // `hitDieResults` is a Record<number, number> on the `Character` type (MAJOR fix #1).
        // Key = character level (1-indexed), Value = die result rolled at that level during level-up.
        //
        // For a brand-new character with an empty hitDieResults record:
        //   Sum of die rolls = 0     (no levels yet)
        //   CON contribution = conDerivedMod * characterLevel  (still contributes)
        //
        // When the Level Up mechanic (Phase 10.1 UI) assigns die results:
        //   hitDieResults = { 1: 8, 2: 5, 3: 10 }  (e.g., Fighter 3 with d10 hit die)
        //   This produces: sumDice = 23, then + (CON_mod × 3) = totalMaxHP
        //
        // WHY USE hitDieResults DIRECTLY (not basePipeline.baseValue)?
        //   `basePipeline.baseValue` would require the Level Up mechanic to update it
        //   after every die roll, creating a redundant storage point. Directly computing
        //   from `hitDieResults` ensures the DAG always reflects the current record state
        //   reactively — any change to `hitDieResults` triggers an automatic HP update.
        //
        // @see src/lib/types/character.ts → Character.hitDieResults for full documentation.
        // @see ARCHITECTURE.md section 9, Phase 3: HP Calculation specification.
        const sumDiceRolls = Object.values(this.character.hitDieResults)
          .reduce((total, roll) => total + roll, 0);
        effectiveBaseValue = sumDiceRolls + conHpContrib;
      }

      const stacking = applyStackingRules(activeMods, effectiveBaseValue);
      // Combat stats don't have a "derivedModifier" in the ability score sense (always 0)
      result[pipelineId] = {
        ...basePipeline,
        activeModifiers: stacking.appliedModifiers,
        situationalModifiers: situationalMods,
        totalBonus: stacking.totalBonus,
        totalValue: stacking.totalValue,
        derivedModifier: 0, // Combat stats have no derived modifier
      };
    }

    // Process each saving throw pipeline
    for (const [pipelineId, basePipeline] of Object.entries(this.character.saves)) {
      const activeMods = flatMods
        .filter(e => e.modifier.targetId === pipelineId && !e.modifier.situationalContext)
        .map(e => e.modifier);

      const situationalMods = flatMods
        .filter(e => e.modifier.targetId === pipelineId && e.modifier.situationalContext)
        .map(e => e.modifier);

      const stacking = applyStackingRules(activeMods, basePipeline.baseValue);
      result[pipelineId] = {
        ...basePipeline,
        activeModifiers: stacking.appliedModifiers,
        situationalModifiers: situationalMods,
        totalBonus: stacking.totalBonus,
        totalValue: stacking.totalValue,
        derivedModifier: 0,
      };
    }

    return result;
  });

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
  phase3_context: CharacterContext = $derived.by(() => {
    const base = this.phase2_context;

    const combatStats: CharacterContext['combatStats'] = {};
    for (const [id, stat] of Object.entries(this.phase3_combatStats)) {
      combatStats[id] = { totalValue: stat.totalValue };
    }

    const saves: CharacterContext['saves'] = {};
    for (const [id, save] of Object.entries(this.phase3_combatStats)) {
      if (id.startsWith('saves.')) {
        saves[id] = { totalValue: save.totalValue };
      }
    }

    return {
      ...base,
      combatStats,
      saves,
    };
  });

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
    const classSkillIds = new Set<ID>();
    const allInstances = [
      ...this.character.activeFeatures,
      ...(this.character.gmOverrides ?? []),
    ];

    for (const instance of allInstances) {
      if (!instance.isActive) continue;
      const feature = dataLoader.getFeature(instance.featureId);
      if (!feature || !feature.classSkills) continue;

      // For class features: only contribute classSkills if the character has at least 1 level
      if (feature.category === 'class') {
        const classLevel = this.character.classLevels[feature.id] ?? 0;
        if (classLevel < 1) continue;
      }

      for (const skillId of feature.classSkills) {
        classSkillIds.add(skillId);
      }
    }

    return classSkillIds;
  });

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
    const result: Record<ID, import('../types/pipeline').SkillPipeline> = {};
    const flatMods = this.phase0_flatModifiers;
    const attributes = this.phase2_attributes;
    const classSkillSet = this.phase4_classSkillSet;

    // The armor check penalty is stored as a negative number on its pipeline
    const armorCheckPenalty = this.phase3_combatStats['combatStats.armor_check_penalty']?.totalValue ?? 0;

    // --- SYNERGY MODIFIERS (ARCHITECTURE.md section 9, Phase 4 & ANNEXES.md B.6) ---
    //
    // Auto-generate synergy modifiers from the config_skill_synergies config table.
    // Per the SRD: if a character has 5 or more ranks in a "source skill", they gain
    // a +2 synergy bonus to a "target skill". These bonuses stack (type: "synergy").
    //
    // WHY AUTO-GENERATED?
    //   Synergy bonuses could be manually authored in Feature JSON, but there are 30+
    //   synergy pairs in the SRD (Annex B.6). Manually authoring each one on every
    //   class/race Feature would be redundant. Auto-generation from the config table
    //   is cleaner, data-driven, and requires zero Feature JSON changes.
    //
    // HOW IT WORKS:
    //   1. Load the `config_skill_synergies` table from the DataLoader.
    //   2. For each synergy pair {sourceSkill, targetSkill}:
    //      a. Check if character has >= 5 ranks in sourceSkill.
    //      b. If yes, add a synergy Modifier to the targetSkill's modifier list.
    //   3. Synergy modifiers participate in stacking resolution (type "synergy" always stacks).
    //
    // SITUATIONAL SYNERGIES:
    //   Some synergy pairs have a `condition` field (e.g., "Bluff → Disguise when acting").
    //   These are treated as situational modifiers (added to situationalModifiers, not active).
    const synergyTable = dataLoader.getConfigTable('config_skill_synergies');
    const synergyMods = new Map<string, import('../types/pipeline').Modifier[]>(); // target → mods

    // Access top-level metadata fields via unknown cast for safe type widening.
    // ConfigTable stores typed `data: Record<string, unknown>[]` but its own metadata
    // fields (requiredRanks, bonusValue, bonusType) are in the raw JSON and thus accessed
    // via the broader unknown cast to avoid TypeScript's index signature requirement.
    const synergyTableAny = synergyTable as unknown as Record<string, unknown>;
    if (synergyTable?.data && Array.isArray(synergyTable.data)) {
      const requiredRanks = typeof synergyTableAny['requiredRanks'] === 'number' ? synergyTableAny['requiredRanks'] as number : 5;
      const bonusValue = typeof synergyTableAny['bonusValue'] === 'number' ? synergyTableAny['bonusValue'] as number : 2;
      const bonusType = (typeof synergyTableAny['bonusType'] === 'string' ? synergyTableAny['bonusType'] as string : 'synergy') as import('../types/primitives').ModifierType;

      for (const row of synergyTable.data as Array<Record<string, unknown>>) {
        const sourceSkill = row['sourceSkill'] as string;
        const targetSkill = row['targetSkill'] as string;
        const conditionStr = row['condition'] as string | undefined;

        // Check if character has sufficient ranks in the source skill
        const sourceRanks = this.character.skills[sourceSkill]?.ranks ?? 0;
        if (sourceRanks >= requiredRanks) {
          // Build the synergy modifier
          const synergyMod: import('../types/pipeline').Modifier = {
            id: `synergy_${sourceSkill}_to_${targetSkill}`,
            sourceId: sourceSkill,
            sourceName: { en: `Synergy (${sourceSkill})`, fr: `Synergie (${sourceSkill})` },
            targetId: targetSkill,
            value: bonusValue,
            type: bonusType,
            // If the synergy has a condition string, it's situational
            situationalContext: conditionStr ? `synergy_${conditionStr}` : undefined,
          };

          if (!synergyMods.has(targetSkill)) {
            synergyMods.set(targetSkill, []);
          }
          synergyMods.get(targetSkill)!.push(synergyMod);
        }
      }
    }

    for (const [skillId, baseSkill] of Object.entries(this.character.skills)) {
      const isClassSkill = classSkillSet.has(skillId);

      // Get the key ability modifier for this skill
      const keyAbilityMod = attributes[baseSkill.keyAbility]?.derivedModifier ?? 0;

      // Collect all misc modifiers targeting this skill pipeline from features
      const featureActiveMods = flatMods
        .filter(e => e.modifier.targetId === skillId && !e.modifier.situationalContext)
        .map(e => e.modifier);

      const featureSituationalMods = flatMods
        .filter(e => e.modifier.targetId === skillId && e.modifier.situationalContext)
        .map(e => e.modifier);

      // Add auto-generated synergy modifiers
      const skillSynergyMods = synergyMods.get(skillId) ?? [];
      const activeSynergyMods = skillSynergyMods.filter(m => !m.situationalContext);
      const situationalSynergyMods = skillSynergyMods.filter(m => m.situationalContext);

      // Combine feature mods with synergy mods for stacking resolution
      const allActiveMods = [...featureActiveMods, ...activeSynergyMods];
      const allSituationalMods = [...featureSituationalMods, ...situationalSynergyMods];

      // Apply stacking rules to all active modifiers combined
      // (synergy type always stacks with other synergy bonuses)
      const stacking = applyStackingRules(allActiveMods, 0);

      // Total = ranks + keyAbilityModifier + miscBonuses (incl. synergies) + armorCheckPenalty
      const totalValue = baseSkill.ranks + keyAbilityMod + stacking.totalBonus
        + (baseSkill.appliesArmorCheckPenalty ? armorCheckPenalty : 0);

      result[skillId] = {
        ...baseSkill,
        isClassSkill,
        activeModifiers: stacking.appliedModifiers,
        situationalModifiers: allSituationalMods,
        totalBonus: stacking.totalBonus, // Misc bonuses + synergies (not ranks + ability)
        totalValue,
        derivedModifier: 0, // Skills don't have a derivedModifier in D&D 3.5 sense
      };
    }

    return result;
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
   * Save pipeline → key ability ID and localized abbreviation mapping.
   * Loaded once and used by SavingThrowsSummary and SavingThrows components.
   *
   * DATA-DRIVENNESS NOTE (MINOR fix #2):
   *   The save-to-ability associations are D&D 3.5 SRD invariants (Fort→CON, Ref→DEX, Will→WIS).
   *   They will never change for any standard D&D 3.5 content.
   *
   *   The abbreviations are now stored as LocalizedString objects (supporting EN and FR)
   *   instead of plain English strings, resolving the i18n hardcoding issue.
   *   Components read the abbreviation via `engine.t(entry.keyAbilityAbbr)`.
   *
   *   For full data-drivenness, a `config_save_definitions` JSON table could replace this
   *   in the future — but the current approach is the lowest-complexity correct solution.
   */
  readonly savingThrowConfig = [
    {
      pipelineId: 'saves.fort',
      keyAbilityId: 'stat_con',
      /** Localized abbreviation of the key ability for this saving throw. */
      keyAbilityAbbr: { en: 'CON', fr: 'CON' } as { en: string; fr: string },
      // Fortitude: red-400 equivalent in oklch — perceptually consistent across themes
      accentColor: 'oklch(65% 0.19 28)',
    },
    {
      pipelineId: 'saves.ref',
      keyAbilityId: 'stat_dex',
      keyAbilityAbbr: { en: 'DEX', fr: 'DEX' } as { en: string; fr: string },
      // Reflex: sky-300 equivalent — cool blue for agility
      accentColor: 'oklch(74% 0.12 230)',
    },
    {
      pipelineId: 'saves.will',
      keyAbilityId: 'stat_wis',
      keyAbilityAbbr: { en: 'WIS', fr: 'SAG' } as { en: string; fr: string },
      // Will: indigo-300 equivalent — aligns with the accent palette
      accentColor: 'oklch(72% 0.12 280)',
    },
  ] as const;

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
   *     (see test_mock.json: class_fighter has tags ["class_fighter", "martial", ...]).
   *     The engine reads the first tag starting with "caster_ability_" to get the stat ID.
   *
   * @param spellLevel   - The level of the spell (0 for cantrips).
   * @param keyAbilityId - Optional: the explicit key ability pipeline ID (e.g., "stat_int").
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
      // Convention: class features have a tag "caster_ability_stat_int" (or _wis, _cha).
      // This follows the zero-hardcoding principle: the casting ability is declared in JSON.
      let foundAbilityId: ID | null = null;
      for (const tag of this.phase0_activeTags) {
        if (tag.startsWith('caster_ability_')) {
          foundAbilityId = tag.slice('caster_ability_'.length); // "stat_int", "stat_wis", etc.
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
        //   "caster_ability_stat_int" (Wizard), "caster_ability_stat_wis" (Cleric),
        //   or "caster_ability_stat_cha" (Sorcerer). When this tag is present, the
        //   primary code path above resolves the correct ability automatically.
        //
        //   This fallback only triggers when NONE of the active Features have a
        //   "caster_ability_*" tag. Using max(WIS, INT, CHA) is a safe conservative
        //   approach: it always produces the highest possible DC (benefits the caster).
        //   It is never harmful (no player would want a LOWER DC).
        //
        // TO ELIMINATE THIS FALLBACK:
        //   Ensure all spellcaster class Features include a tag like:
        //     "caster_ability_stat_wis" (divine), "caster_ability_stat_int" (arcane),
        //     or "caster_ability_stat_cha" (spontaneous arcane/psionic).
        //   See the FeatureChoice documentation in ARCHITECTURE.md section 5.
        //
        // DATA-DRIVEN CASTING ABILITY IDS (read from config if available):
        const castingAbilityTable = dataLoader.getConfigTable('config_attribute_definitions');
        const castingAbilityIds: string[] = [];
        if (castingAbilityTable?.data && Array.isArray(castingAbilityTable.data)) {
          // Filter to mental stats (INT, WIS, CHA) — the only valid casting abilities in D&D 3.5
          for (const row of castingAbilityTable.data as Array<Record<string, unknown>>) {
            const id = row['id'] as string | undefined;
            if (id && (id === 'stat_wis' || id === 'stat_int' || id === 'stat_cha')) {
              castingAbilityIds.push(id);
            }
          }
        }
        // If config table not available, use hardcoded fallback (bootstrap state)
        if (castingAbilityIds.length === 0) {
          castingAbilityIds.push('stat_wis', 'stat_int', 'stat_cha');
        }
        castingAbilityMod = Math.max(
          ...castingAbilityIds.map(id => this.phase2_attributes[id]?.derivedModifier ?? 0)
        );
      }
    }

    return 10 + spellLevel + castingAbilityMod;
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
   * Computes the total attack bonus for a weapon.
   * Formula: BAB + ability modifier (STR for melee, DEX for ranged) + enhancement.
   *
   * @param enhancement  - Weapon's enhancement bonus.
   * @param isRanged     - If true, uses DEX modifier; else uses STR modifier.
   * @returns The computed attack bonus as a number.
   */
  getWeaponAttackBonus(enhancement: number, isRanged: boolean): number {
    const bab = this.phase3_combatStats['combatStats.bab']?.totalValue ?? 0;
    const strMod = this.phase2_attributes['stat_str']?.derivedModifier ?? 0;
    const dexMod = this.phase2_attributes['stat_dex']?.derivedModifier ?? 0;
    const abilityMod = isRanged ? dexMod : strMod;
    return bab + abilityMod + enhancement;
  }

  /**
   * Computes the damage bonus for a weapon.
   * Formula: STR modifier (×1.5 for two-handed weapons) + enhancement.
   *
   * D&D 3.5 RULE:
   *   One-handed/Light weapons add STR modifier to damage.
   *   Two-handed weapons add 1.5× STR modifier (rounded down).
   *   Ranged weapons add STR modifier only if strength >= 12 (bows with mighty quality).
   *   For simplicity, ranged weapons use 0 STR (handled by the weapon enhancement alone).
   *
   * @param enhancement   - Weapon's enhancement bonus.
   * @param isTwoHanded   - If true, uses 1.5× STR modifier.
   * @returns The computed damage bonus as a number.
   */
  getWeaponDamageBonus(enhancement: number, isTwoHanded: boolean): number {
    const strMod = this.phase2_attributes['stat_str']?.derivedModifier ?? 0;
    const baseDamageMod = isTwoHanded ? Math.floor(strMod * 1.5) : strMod;
    return baseDamageMod + enhancement;
  }

  // ---------------------------------------------------------------------------
  // EQUIPMENT SLOTS — Phase 13.1
  // ---------------------------------------------------------------------------
  //
  // Equipment slots define how many items of each type the character can equip.
  // Default values follow the standard humanoid body (SRD):
  //   head: 1, eyes: 1, neck: 1, torso: 1, body: 1, waist: 1, shoulders: 1
  //   arms: 1 (pair), hands: 1 (pair), ring: 2, feet: 1, main_hand: 1, off_hand: 1
  //
  // EXTENSIBILITY:
  //   Exotic races or feats can modify these values by granting modifiers that
  //   target "slots.<slot_name>" pipelines (e.g., granting +2 ring slots).
  //   The engine auto-creates these pipelines from modifiers, so no hardcoding is needed.
  //
  // These values are NOT part of the standard `character.combatStats` or `attributes`
  // records. They are stored as a separate computed record for the Inventory UI.

  /**
   * Resolved equipment slot maximums.
   * Values start at the defaults below and can be modified by Feature modifiers.
   *
   * Used by the Inventory tab (Phase 13.3) to enforce item slot limits.
   */
  phase_equipmentSlots: Record<string, number> = $derived.by(() => {
    // Default slot counts for a standard humanoid body
    const defaults: Record<string, number> = {
      'slots.head': 1,
      'slots.eyes': 1,
      'slots.neck': 1,
      'slots.torso': 1,
      'slots.body': 1,
      'slots.waist': 1,
      'slots.shoulders': 1,
      'slots.arms': 1,
      'slots.hands': 1,
      'slots.ring': 2,        // D&D 3.5 standard humanoid body: 2 ring slots by default
      'slots.feet': 1,
      'slots.main_hand': 1,
      'slots.off_hand': 1,
    };

    // Apply modifiers from active features targeting "slots.*" pipelines
    const result = { ...defaults };
    for (const entry of this.phase0_flatModifiers) {
      const { modifier } = entry;
      if (!modifier.targetId.startsWith('slots.') || modifier.situationalContext) continue;
      const slot = modifier.targetId;
      const val = typeof modifier.value === 'number' ? modifier.value : 0;
      result[slot] = (result[slot] ?? 0) + val;
    }

    return result;
  });

  /**
   * The current count of equipped items per slot.
   * Used by Phase 13.3 to check if a slot is full before equipping.
   */
  phase_equippedSlotCounts: Record<string, number> = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const afi of this.character.activeFeatures) {
      if (!afi.isActive) continue;
      // Look up the Feature definition to check if it is an ItemFeature with an equipmentSlot
      const feature = dataLoader.getFeature(afi.featureId);
      if (!feature || (feature as import('../types/feature').ItemFeature).equipmentSlot === undefined) continue;
      const itemFeat = feature as import('../types/feature').ItemFeature;
      const slot = itemFeat.equipmentSlot;
      if (!slot || slot === 'none') continue;
      // Map slot name to slots.* key for comparison with phase_equipmentSlots
      const slotKey = `slots.${slot}`;
      counts[slotKey] = (counts[slotKey] ?? 0) + 1;
    }
    return counts;
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
  //     phase_grantedFeatIds (i.e., manually selected, not auto-granted).

  /**
   * Total available feat slots.
   * Formula: 1 + floor(characterLevel / 3) + bonus slots from features.
   */
  phase_featSlotsTotal: number = $derived.by(() => {
    const baseSlots = 1 + Math.floor(this.phase0_characterLevel / 3);
    const bonusSlots = this.phase0_flatModifiers
      .filter(e => e.modifier.targetId === 'attributes.bonus_feat_slots' && !e.modifier.situationalContext)
      .reduce((sum, e) => sum + (typeof e.modifier.value === 'number' ? e.modifier.value : 0), 0);
    return baseSlots + bonusSlots;
  });

  /**
   * Set of feat Feature IDs that were GRANTED automatically by Race/Class.
   * These feats do NOT consume a player feat slot.
   */
  phase_grantedFeatIds: ReadonlySet<string> = $derived.by(() => {
    const grantedIds = new Set<string>();
    for (const afi of this.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feature = dataLoader.getFeature(afi.featureId);
      if (!feature) continue;
      for (const id of (feature.grantedFeatures ?? [])) {
        if (id && !id.startsWith('-')) grantedIds.add(id);
      }
      if (feature.category === 'class' && feature.levelProgression) {
        const classLevel = this.character.classLevels[feature.id] ?? 0;
        for (const entry of feature.levelProgression) {
          if (entry.level <= classLevel) {
            for (const id of entry.grantedFeatures) {
              if (id && !id.startsWith('-')) grantedIds.add(id);
            }
          }
        }
      }
    }
    return grantedIds;
  });

  /**
   * Number of manually selected feats (consume a slot).
   * Feats in phase_grantedFeatIds are excluded.
   */
  phase_manualFeatCount: number = $derived.by(() => {
    const grantedIds = this.phase_grantedFeatIds;
    let count = 0;
    for (const afi of this.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feature = dataLoader.getFeature(afi.featureId);
      if (feature?.category !== 'feat') continue;
      if (!grantedIds.has(afi.featureId)) count++;
    }
    return count;
  });

  /** Remaining feat slots (total − manual count). */
  phase_featSlotsRemaining: number = $derived(
    this.phase_featSlotsTotal - this.phase_manualFeatCount
  );

  // ---------------------------------------------------------------------------
  // LANGUAGE SHORTCUT & HELPERS
  // ---------------------------------------------------------------------------

  /** Active display language shortcut. */
  get lang(): SupportedLanguage {
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

  // ---------------------------------------------------------------------------
  // CHARACTER MANAGEMENT
  // ---------------------------------------------------------------------------

  /** Loads a character as the active character (triggers full DAG re-evaluation). */
  loadCharacter(char: Character): void {
    this.character = char;
    this.activeCharacterId = char.id;
  }

  /** Creates and activates a new blank character. */
  createNewCharacter(id: ID, name: string): void {
    this.character = createEmptyCharacter(id, name);
    this.activeCharacterId = id;
  }

  /** Sets the character's name. */
  setCharacterName(name: string): void {
    this.character.name = name;
  }

  /** Sets the base value of an attribute pipeline (e.g., STR base score). */
  setAttributeBase(pipelineId: ID, baseValue: number): void {
    if (this.character.attributes[pipelineId]) {
      this.character.attributes[pipelineId].baseValue = baseValue;
    } else {
      console.warn(`[GameEngine] setAttributeBase: pipeline "${pipelineId}" not found.`);
    }
  }

  /** Sets the invested skill ranks for a skill pipeline. */
  setSkillRanks(skillId: ID, ranks: number): void {
    if (this.character.skills[skillId]) {
      this.character.skills[skillId].ranks = ranks;
    } else {
      console.warn(`[GameEngine] setSkillRanks: skill "${skillId}" not found.`);
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
   * Sets temporary HP (takes the higher value per SRD non-stacking rule).
   * @param amount - The temporary HP to set.
   */
  setTemporaryHP(amount: number): void {
    const hp = this.character.resources['resources.hp'];
    if (!hp) return;
    hp.temporaryValue = Math.max(hp.temporaryValue, amount);
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

  /** Removes an ActiveFeatureInstance by instanceId. */
  removeFeature(instanceId: ID): void {
    const index = this.character.activeFeatures.findIndex(f => f.instanceId === instanceId);
    if (index !== -1) {
      this.character.activeFeatures.splice(index, 1);
    } else {
      console.warn(`[GameEngine] removeFeature: instance "${instanceId}" not found.`);
    }
  }

  /** Updates campaign settings. Partial updates are merged with Object.assign. */
  updateSettings(newSettings: Partial<CampaignSettings>): void {
    Object.assign(this.settings, newSettings);
  }

  // ---------------------------------------------------------------------------
  // PRIVATE METHODS — DAG computation helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds the flat list of all valid active modifiers from all active features.
   *
   * RECEIVES explicit parameters (activeTags and context) instead of reading
   * $derived values internally. This ensures Svelte 5's reactivity graph correctly
   * registers the upstream $derived dependencies (phase0_activeTags, phase0_context)
   * on the $derived property that calls this method.
   *
   * @param activeTags - Pre-computed active tags (from phase0_activeTags).
   * @param context    - Pre-computed character context snapshot (from phase0_context).
   *
   * ALGORITHM:
   *   1. Collect all instances: character.activeFeatures + character.gmOverrides.
   *   2. For each isActive instance:
   *      a. Look up the Feature from the DataLoader.
   *      b. Skip if Feature not found (logs warning; graceful degradation).
   *      c. Check forbiddenTags: if any forbidden tag is in activeTags, skip this feature.
   *      d. Collect modifiers from grantedModifiers (base feature modifiers).
   *      e. For class features: collect modifiers from levelProgression entries
   *         where entry.level <= classLevels[featureId].
   *      f. Recursively collect from grantedFeatures (up to MAX_RESOLUTION_DEPTH).
   *      g. For each collected modifier:
   *         - Evaluate conditionNode (if present) using the provided context.
   *         - Resolve string `value` formulas to numbers.
   *         - Route to active or situational list based on situationalContext presence.
   *
   * GM OVERRIDE MERGE:
   *   gmOverrides are appended AFTER regular activeFeatures so their modifiers
   *   are processed last. For setAbsolute-type modifiers, last wins. This ensures
   *   GM overrides always take precedence over player features.
   */
  #computeFlatModifiers(activeTags: string[], context: CharacterContext): FlatModifierEntry[] {
    const result: FlatModifierEntry[] = [];

    // --- Build the complete list of feature instances to process ---
    //
    // Resolution order (last processed = highest priority for setAbsolute):
    //   1. Character's own activeFeatures  (player choices)
    //   2. Scene's activeGlobalFeatures    (GM global environment, same priority as character features)
    //   3. Character's gmOverrides         (GM per-character overrides, highest priority)
    //
    // SCENE GLOBAL FEATURES (ARCHITECTURE.md section 13):
    //   Features in `sceneState.activeGlobalFeatures` are virtually injected as if they
    //   were in every character's `activeFeatures`. This implements the "Global Aura" concept:
    //   when the GM activates "environment_extreme_heat", ALL characters immediately receive
    //   its modifiers (speed reduction, save penalty). Characters with appropriate protections
    //   (e.g., the "endure_elements" tag from an active spell) block these modifiers via
    //   their `conditionNode` logic — no special engine handling needed.
    //
    // WHY SYNTHETIC INSTANCES FOR SCENE FEATURES?
    //   `#collectModifiersFromInstance` expects `ActiveFeatureInstance` objects.
    //   We create synthetic instances for each scene feature with stable instanceIds
    //   so the engine can process them identically to character features.
    const sceneInstances: ActiveFeatureInstance[] = this.sceneState.activeGlobalFeatures.map(featureId => ({
      instanceId: `scene_global_${featureId}`,
      featureId,
      isActive: true,
    }));

    const allInstances: ActiveFeatureInstance[] = [
      ...this.character.activeFeatures,
      ...sceneInstances,                      // Global scene features (injected for all characters)
      ...(this.character.gmOverrides ?? []),  // GM per-character overrides (processed last = highest priority)
    ];

    // Track visited feature IDs to prevent recursive loops
    const visitedFeatureIds = new Set<ID>();

    for (const instance of allInstances) {
      if (!instance.isActive) continue;

      this.#collectModifiersFromInstance(
        instance,
        activeTags,
        context,
        result,
        visitedFeatureIds,
        0 // initial depth
      );
    }

    return result;
  }

  /**
   * Recursively collects modifiers from a feature instance.
   *
   * @param instance         - The ActiveFeatureInstance to process.
   * @param activeTags       - Current character tag set (for forbiddenTags and conditionNode checks).
   * @param context          - Preliminary character context (for formula resolution).
   * @param result           - Output array to push FlatModifierEntry objects into.
   * @param visitedFeatureIds- Set of already-visited feature IDs (cycle prevention).
   * @param depth            - Current recursion depth (prevent infinite loops).
   */
  #collectModifiersFromInstance(
    instance: ActiveFeatureInstance,
    activeTags: string[],
    context: CharacterContext,
    result: FlatModifierEntry[],
    visitedFeatureIds: Set<ID>,
    depth: number
  ): void {
    // Depth guard: prevent infinite recursion from circular grantedFeatures references
    if (depth > MAX_RESOLUTION_DEPTH) {
      console.warn(`[GameEngine] Phase 0: Max resolution depth (${MAX_RESOLUTION_DEPTH}) exceeded for feature "${instance.featureId}". Stopping recursion.`);
      return;
    }

    // Look up the feature definition
    const feature = dataLoader.getFeature(instance.featureId);
    if (!feature) {
      // Feature not loaded yet (DataLoader stub) — graceful skip
      return;
    }

    // Cycle prevention: skip if we've already processed this feature definition
    if (visitedFeatureIds.has(feature.id)) return;
    visitedFeatureIds.add(feature.id);

    // --- Check forbiddenTags ---
    // If the character has any of the forbidden tags, this feature's modifiers are suppressed
    if (feature.forbiddenTags && feature.forbiddenTags.some(tag => activeTags.includes(tag))) {
      return; // Feature suppressed by a conflicting tag (e.g., Druid + metal_armor)
    }

    // --- Check prerequisitesNode ---
    // For active features already on the character, we skip prerequisite gating
    // (the player chose them — we trust it was valid at selection time).
    // However, for grantedFeatures (granted by a parent feature), we DO check prerequisites
    // to ensure conditional grants (e.g., level-gated class features) are respected.
    // For depth > 0 (recursed from a parent), skip prerequisite checks to avoid confusion.
    // Phase 11.4 (feat catalog UI) handles prerequisite display for player-facing selection.

    // --- Collect base feature modifiers ---
    this.#processModifierList(
      feature.grantedModifiers,
      instance,
      feature,
      activeTags,
      context,
      result
    );

    // --- Class level progression gating ---
    // For class features, only include modifiers from levelProgression entries
    // where entry.level <= character.classLevels[featureId].
    if (feature.category === 'class' && feature.levelProgression) {
      const classLevel = this.character.classLevels[feature.id] ?? 0;
      for (const entry of feature.levelProgression) {
        if (entry.level <= classLevel) {
          this.#processModifierList(
            entry.grantedModifiers,
            instance,
            feature,
            activeTags,
            context,
            result
          );
        }
      }
    }

    // --- Recursively process granted features ---
    if (feature.grantedFeatures && feature.grantedFeatures.length > 0) {
      // For class features, also check levelProgression grantedFeatures
      const grantedFeatureIds = new Set<ID>([...feature.grantedFeatures]);

      if (feature.category === 'class' && feature.levelProgression) {
        const classLevel = this.character.classLevels[feature.id] ?? 0;
        for (const entry of feature.levelProgression) {
          if (entry.level <= classLevel) {
            for (const gfId of entry.grantedFeatures) {
              grantedFeatureIds.add(gfId);
            }
          }
        }
      }

      for (const grantedFeatureId of grantedFeatureIds) {
        // Skip deletion markers (from partial merge, should be resolved by DataLoader)
        if (grantedFeatureId.startsWith('-')) continue;

        const syntheticInstance: ActiveFeatureInstance = {
          instanceId: `${instance.instanceId}_granted_${grantedFeatureId}`,
          featureId: grantedFeatureId,
          isActive: true,
          selections: instance.selections, // Pass parent selections through
        };

        this.#collectModifiersFromInstance(
          syntheticInstance,
          activeTags,
          context,
          result,
          new Set(visitedFeatureIds), // Clone set to allow separate branches
          depth + 1
        );
      }
    }
  }

  /**
   * Processes a list of Modifier objects, evaluating conditions and routing to output.
   *
   * TARGETID NORMALISATION:
   *   Before pushing a modifier to the result, its `targetId` is normalised via
   *   `normaliseModifierTargetId()`. This allows JSON authors to use either:
   *     - "stat_str"           (short form — the Character.attributes map key)
   *     - "attributes.stat_str" (long form — as used in ARCHITECTURE.md Annex A examples)
   *   Both forms resolve to the same pipeline. See `normaliseModifierTargetId()` for details.
   */
  #processModifierList(
    modifiers: Modifier[],
    instance: ActiveFeatureInstance,
    feature: Feature,
    activeTags: string[],
    context: CharacterContext,
    result: FlatModifierEntry[]
  ): void {
    // Build a per-instance context that includes this instance's selections
    const instanceContext: CharacterContext = {
      ...context,
      activeTags,
      selection: { ...context.selection, ...(instance.selections ?? {}) },
    };

    for (const mod of modifiers) {
      // --- Evaluate conditionNode (if present) ---
      // Only include the modifier if the condition passes (or no condition).
      if (mod.conditionNode && !checkCondition(mod.conditionNode, instanceContext)) {
        continue; // Condition failed — modifier is not active right now
      }

      // --- Normalise the targetId convention ---
      // Strips the optional "attributes." prefix so both "stat_str" and
      // "attributes.stat_str" target the same Character.attributes pipeline.
      // This is a non-destructive normalisation — the original JSON is not mutated.
      const normalisedTargetId = normaliseModifierTargetId(mod.targetId);

      // --- Resolve string value formulas to numbers ---
      // Build the resolved modifier with the normalised targetId and numeric value.
      let resolvedModifier: Modifier = normalisedTargetId !== mod.targetId
        ? { ...mod, targetId: normalisedTargetId }  // targetId changed → new object
        : mod;                                        // targetId unchanged → reuse reference

      if (typeof mod.value === 'string') {
        const resolved = evaluateFormula(mod.value, instanceContext, this.settings.language);
        const numericValue = typeof resolved === 'number' ? resolved : parseFloat(String(resolved)) || 0;
        resolvedModifier = { ...resolvedModifier, value: numericValue };
      }

      result.push({
        modifier: resolvedModifier,
        sourceInstanceId: instance.instanceId,
        sourceFeatureId: feature.id,
      });
    }
  }

  /**
   * Computes the flat array of all active tags from all isActive features.
   *
   * Tags are deduplicated. All tags from ALL active features are included
   * (regardless of prerequisite status — this is the intentionally inclusive
   * list used for @activeTags path resolution).
   *
   * INCLUDES SCENE FEATURES (MAJOR fix #2 — ARCHITECTURE.md section 13):
   *   Scene global features (from `sceneState.activeGlobalFeatures`) also contribute
   *   their tags to the active tag set. This is critical for:
   *     - Environment features indicating their active condition (e.g., "underwater", "heat")
   *     - Characters checking if a global condition is active via `@activeTags has_tag X`
   *   Example: `environment_extreme_heat` has tag "heat". Characters check
   *   `NOT has_tag endure_elements` to determine if the heat penalty applies.
   *   The scene feature's "heat" tag in `@activeTags` is what other features react to.
   *   @see sceneState and activateSceneFeature/deactivateSceneFeature methods.
   */
  #computeActiveTags(): string[] {
    const tagSet = new Set<string>();

    // Include scene features (synthetic instances for global environment conditions)
    const sceneInstances: ActiveFeatureInstance[] = this.sceneState.activeGlobalFeatures.map(featureId => ({
      instanceId: `scene_global_${featureId}`,
      featureId,
      isActive: true,
    }));

    const allInstances = [
      ...this.character.activeFeatures,
      ...sceneInstances,
      ...(this.character.gmOverrides ?? []),
    ];

    for (const instance of allInstances) {
      if (!instance.isActive) continue;
      const feature = dataLoader.getFeature(instance.featureId);
      if (!feature) continue;
      for (const tag of feature.tags) {
        tagSet.add(tag);
      }
    }

    return Array.from(tagSet);
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
