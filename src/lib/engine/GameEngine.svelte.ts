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
import { t as translateString, formatDistance as fmtDistance, formatWeight as fmtWeight } from '../utils/formatters';
import type { Character, ActiveFeatureInstance } from '../types/character';
import type { CampaignSettings } from '../types/settings';
import type { LocalizedString } from '../types/i18n';
import type { StatisticPipeline, SkillPipeline, ResourcePool, Modifier } from '../types/pipeline';
import type { Feature, ResourcePoolTemplate, ActivationTier } from '../types/feature';
import type { ID } from '../types/primitives';
import { dataLoader } from './DataLoader';
import { checkCondition } from '../utils/logicEvaluator';
import { evaluateFormula } from '../utils/mathParser';
import type { CharacterContext } from '../utils/mathParser';
import { applyStackingRules, computeDerivedModifier } from '../utils/stackingRules';
import { computeGestaltBase, isGestaltAffectedPipeline } from '../utils/gestaltRules';
import { SYNERGY_SOURCE_LABEL } from '../utils/constants';
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
// SKILL POINTS BUDGET — exported type for UI consumption
// =============================================================================

/**
 * Per-class contribution to the skill point budget.
 *
 * D&D 3.5 MULTICLASS RULE:
 *   Each class level grants skill points equal to its base SP/level plus the
 *   character's INT modifier (minimum 1 per level). In multiclass characters,
 *   each class contributes SEPARATELY — the Fighter's 2 SP/level is NOT averaged
 *   with the Rogue's 8 SP/level. The totals are summed independently.
 *
 * FIRST LEVEL BONUS:
 *   At character level 1, the first class taken grants 4× the normal SP (SRD rule).
 *   The engine identifies the "first class" via JavaScript object insertion order on
 *   `character.classLevels` — the first key corresponds to the class the player added
 *   first in the UI, which is the class taken at character level 1.
 *   `firstLevelBonus = 3 × pointsPerLevel` (the extra 3 multiples beyond the normal 1×).
 *   `totalPoints` includes this bonus: `(pointsPerLevel × classLevel) + firstLevelBonus`.
 */
export interface ClassSkillPointsEntry {
  /** The class Feature ID (e.g., "class_fighter"). */
  classId: ID;
  /** Localized class name for display in the journal. */
  classLabel: LocalizedString;
  /** Base skill points per level as declared in the class Feature's modifier. */
  spPerLevel: number;
  /** The character's current level count in this class. */
  classLevel: number;
  /**
   * The INT modifier applied at calculation time.
   * Uses the CURRENT INT modifier (most character builders use this retroactive approach).
   * D&D 3.5 rules technically make INT bonuses retroactive for previously gained levels.
   */
  intModifier: number;
  /** max(1, spPerLevel + intModifier) — effective SP per level (after INT and minimum-1 rule). */
  pointsPerLevel: number;
  /**
   * Extra skill points from the first-level 4× bonus (D&D 3.5 SRD).
   * = 3 × pointsPerLevel for the class taken at character level 1; 0 for all other classes.
   * Always 0 if this class did not contribute character level 1 (i.e., is not the first class).
   */
  firstLevelBonus: number;
  /**
   * Total skill point contribution from this class.
   * = (pointsPerLevel × classLevel) + firstLevelBonus
   * Includes the first-level 4× bonus for whichever class was taken first.
   */
  totalPoints: number;
}

/**
 * Per-class entry in the Leveling Journal.
 *
 * Aggregates all the mechanical contributions from one class to the character sheet.
 * The LevelingJournalModal renders one card per entry to explain WHERE each bonus came from.
 */
export interface LevelingJournalClassEntry {
  /** Class Feature ID (e.g., "class_fighter"). */
  classId: ID;
  /** Localized class name. */
  classLabel: LocalizedString;
  /** The character's level in this class. */
  classLevel: number;
  /** Total BAB contribution from this class (type "base" modifiers on "combatStats.base_attack_bonus"). */
  totalBab: number;
  /** Total Fortitude save base from this class (type "base" modifiers on "saves.fortitude"). */
  totalFort: number;
  /** Total Reflex save base from this class (type "base" modifiers on "saves.reflex"). */
  totalRef: number;
  /** Total Will save base from this class (type "base" modifiers on "saves.will"). */
  totalWill: number;
  /** Base SP/level from this class (before INT modifier). */
  spPerLevel: number;
  /** Effective SP per level: max(1, spPerLevel + intMod). */
  spPointsPerLevel: number;
  /** First-level 4× bonus SP (3 × spPointsPerLevel if this was the first class; else 0). */
  firstLevelBonus: number;
  /** Skill points contributed by this class: (spPointsPerLevel × classLevel) + firstLevelBonus. */
  totalSp: number;
  /** Class skill IDs declared by this class. */
  classSkills: ID[];
  /** Localized class skill names for display. */
  classSkillLabels: Array<{ id: ID; label: LocalizedString }>;
  /**
   * IDs of features granted by levelProgression entries (up to classLevel).
   * Used to show "Class Features Gained" in the journal.
   */
  grantedFeatureIds: string[];
}

/**
 * Complete leveling journal for the character.
 *
 * Contains the per-class breakdown of all mechanical contributions, making it
 * easy to verify that BAB, saves, HP, and skill points are correctly tracked.
 */
export interface LevelingJournal {
  /** Breakdown per active class. */
  perClassBreakdown: LevelingJournalClassEntry[];
  /** Sum of BAB contributions from all classes. */
  totalBab: number;
  /** Sum of Fort save base from all classes. */
  totalFort: number;
  /** Sum of Ref save base from all classes. */
  totalRef: number;
  /** Sum of Will save base from all classes. */
  totalWill: number;
  /** Total skill points available. */
  totalSp: number;
  /** Total character level (sum of all class levels). */
  characterLevel: number;
}

/**
 * Complete skill point budget for the character.
 *
 * Consumed by the SkillsMatrix and LevelingJournalModal to correctly display
 * and enforce the per-class, per-level skill point allocation for D&D 3.5.
 */
export interface SkillPointsBudget {
  /**
   * Breakdown of skill points contributed by each active class.
   * Empty for characters with no active classes.
   */
  perClassBreakdown: ClassSkillPointsEntry[];

  /**
   * Sum of bonus SP/level from racial or feat sources (e.g., Human +1 SP/level).
   * These are added uniformly per total character level, not per-class level.
   *
   * Example:
   *   Human racial trait grants `attributes.bonus_skill_points_per_level: 1`.
   *   A Fighter 5 / Rogue 3 Human gets: bonus = 1 × 8 = 8 extra SP.
   */
  bonusSpPerLevel: number;

  /** Total bonus skill points: bonusSpPerLevel × totalCharacterLevel. */
  totalBonusPoints: number;

  /** Sum of all ClassSkillPointsEntry.totalPoints across all classes. */
  totalClassPoints: number;

  /** Grand total: totalClassPoints + totalBonusPoints. */
  totalAvailable: number;

  /** The current INT derivedModifier used in all class budget calculations. */
  intModifier: number;
}

// =============================================================================
// SaveConfigEntry — data-driven saving throw display configuration
// =============================================================================

/**
 * One entry in the saving throw display configuration.
 * Consumed by SavingThrows.svelte and SavingThrowsSummary.svelte.
 *
 * Populated at runtime from the `config_save_definitions` JSON config table
 * (loaded by the DataLoader). The engine falls back to `DEFAULT_SAVE_CONFIG`
 * during bootstrap (before the DataLoader has finished loading).
 *
 * Fields mirror the `config_save_definitions` table rows:
 *   pipelineId     — the save pipeline key (e.g., "saves.fortitude")
 *   label          — localized save name (e.g., { en: "Fortitude", fr: "Vigueur" })
 *   keyAbilityId   — governing ability pipeline ID (e.g., "stat_constitution")
 *   keyAbilityAbbr — localized abbreviation (e.g., { en: "CON", fr: "CON" })
 *   accentColor    — CSS color string for themed display (any valid CSS value)
 */
export interface SaveConfigEntry {
  readonly pipelineId:     string;
  readonly label:          LocalizedString;
  readonly keyAbilityId:   string;
  readonly keyAbilityAbbr: LocalizedString;
  readonly accentColor:    string;
}

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
    label:          { en: 'saves.fortitude', fr: 'saves.fortitude' },
    keyAbilityId:   'stat_constitution',
    // keyAbilityAbbr uses the pipeline ID as a fallback to comply with PROGRESS.md Guideline 6
    // (no D&D-specific abbreviations hardcoded in TypeScript). The human-readable abbreviations
    // ("CON", "DEX", "WIS") are loaded from config_save_definitions and replace these placeholders
    // within milliseconds of app startup. Players will never see these fallback values.
    keyAbilityAbbr: { en: 'stat_constitution', fr: 'stat_constitution' },
    accentColor:    'oklch(65% 0.19 28)',
  },
  {
    pipelineId:     'saves.reflex',
    label:          { en: 'saves.reflex', fr: 'saves.reflex' },
    keyAbilityId:   'stat_dexterity',
    keyAbilityAbbr: { en: 'stat_dexterity', fr: 'stat_dexterity' },
    accentColor:    'oklch(74% 0.12 230)',
  },
  {
    pipelineId:     'saves.will',
    label:          { en: 'saves.will', fr: 'saves.will' },
    keyAbilityId:   'stat_wisdom',
    keyAbilityAbbr: { en: 'stat_wisdom', fr: 'stat_wisdom' },
    accentColor:    'oklch(72% 0.12 280)',
  },
];

// =============================================================================
// WeaponDefaults — data-driven weapon ability score defaults
// =============================================================================

/**
 * Default ability score assignments for weapon attack and damage rolls.
 * Populated at runtime from the `config_weapon_defaults` JSON config table.
 * Falls back to `DEFAULT_WEAPON_CONFIG` during bootstrap.
 *
 * WHY THIS EXISTS:
 *   D&D 3.5 hardwires STR for melee attack/damage and DEX for ranged attacks.
 *   By reading these from a config table, homebrew systems can remap the defaults
 *   (e.g., a setting that uses a custom `stat_agility` for all ranged attacks)
 *   without modifying engine code.
 *
 *   Per-weapon overrides (Weapon Finesse, ranged STR via Mighty bow, psionic
 *   INT-based attacks) are handled via the weapon Feature's modifier formulas,
 *   NOT by changing these defaults.
 */
export interface WeaponDefaults {
  /** Ability score ID used for melee attack rolls. Default: `"stat_strength"`. */
  readonly meleeAttackAbility:        string;
  /** Ability score ID used for ranged attack rolls. Default: `"stat_dexterity"`. */
  readonly rangedAttackAbility:       string;
  /** Ability score ID added to melee damage rolls. Default: `"stat_strength"`. */
  readonly meleeDamageAbility:        string;
  /** Multiplier on damage ability for two-handed grip. Default: `1.5` (D&D 3.5 rule). */
  readonly twoHandedDamageMultiplier: number;
}

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
 *     character.attributes   → keyed by  "stat_strength", "stat_dexterity", ...  (NO prefix)
 *     character.combatStats  → keyed by  "combatStats.base_attack_bonus", "combatStats.ac_normal"  (WITH prefix)
 *     character.saves        → keyed by  "saves.fortitude", "saves.reflex"  (WITH prefix)
 *     character.skills       → keyed by  "skill_climb", "skill_jump"  (NO prefix)
 *
 *   However, ARCHITECTURE.md section 4.3 and ANNEXES.md Annex A use the
 *   `"attributes."` prefix in Math Parser @-paths AND sometimes in targetId fields:
 *
 *     @-paths    : "@attributes.stat_strength.totalValue"  (always with namespace)
 *     targetId?  : "attributes.stat_strength" OR "stat_strength"  (both appear in examples)
 *
 *   The normaliser strips the `"attributes."` prefix from attribute targetIds so
 *   that JSON authors can use either convention and the engine processes them identically.
 *
 *   OTHER NAMESPACES (combatStats.*, saves.*, skill_*) do NOT need normalisation:
 *     - "combatStats.ac_normal" is used consistently both in JSON and as a map key.
 *     - "saves.fortitude" is used consistently both in JSON and as a map key.
 *     - "skill_climb" is used consistently both in JSON and as the map key.
 *   Only the 6 main attribute stats (and custom homebrew stats) have this ambiguity.
 *
 * @param targetId - The raw `targetId` from a Modifier JSON field.
 * @returns The normalised pipeline key used as a map key in `Character.attributes`.
 */
function normaliseModifierTargetId(targetId: ID): ID {
  // Strip namespace prefixes to produce the canonical map key used internally.
  //
  // SUPPORTED NORMALISATIONS:
  //   "attributes.stat_strength"          → "stat_strength"                (Character.attributes key)
  //   "skills.skill_climb"           → "skill_climb"             (Character.skills key)
  //   "resources.X.maxValue"         → "combatStats.X_max"       (virtual max pipeline)
  //
  // WHY TWO FORMS EXIST IN JSON:
  //   Content authors have historically used two conventions:
  //     - Bare form:       "stat_strength",   "skill_climb"   (matches the map key directly)
  //     - Namespaced form: "attributes.stat_strength", "skills.skill_climb"  (more readable)
  //   Both are valid; this function normalises both to the map-key form so that all
  //   downstream comparisons work regardless of which convention the JSON uses.
  //
  // "resources.X.maxValue" CONVENTION (GAP-01 fix):
  //   Content authors use "resources.barbarian_rage_uses.maxValue" to target the
  //   maximum capacity of a resource pool — a natural and readable convention.
  //   The engine does NOT have a pipeline keyed "resources.X.maxValue"; instead,
  //   each pool's max is looked up from the pipeline pointed to by its `maxPipelineId`.
  //   To bridge this, we normalise "resources.X.maxValue" → "combatStats.X_max".
  //   The `#getEffectiveMax()` method has been updated to look up "combatStats.X_max"
  //   as the fallback pipeline when the pool's `maxPipelineId` resolves to nothing.
  //   This lets modifiers like "+1 per 4 Barbarian levels" accumulate in the
  //   combatStats pipeline and be read back as the pool's effective maximum.
  //
  // OTHER NAMESPACES are returned unchanged — they ARE the map key already:
  //   "combatStats.base_attack_bonus", "saves.fortitude", "resources.hp", "slots.ring"
  if (targetId.startsWith('attributes.')) {
    return targetId.slice('attributes.'.length);
  }
  if (targetId.startsWith('skills.')) {
    return targetId.slice('skills.'.length);
  }
  // "resources.X.maxValue" → "combatStats.X_max"
  if (targetId.startsWith('resources.') && targetId.endsWith('.maxValue')) {
    const poolId = targetId.slice('resources.'.length, -'.maxValue'.length);
    return `combatStats.${poolId}_max`;
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
 * @param keyAbility             - The governing ability score ID (e.g., "stat_strength").
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

  // Helper to create a blank ResourcePool.
  // `rechargeAmount` is omitted here (undefined) — incremental pools define it in JSON.
  // The default `resetCondition: 'long_rest'` covers all standard daily-use resources.
  // @see ResourcePool.resetCondition for 'per_turn' / 'per_round' variants.
  const makeResource = (resourceId: ID, label: LocalizedString, maxPipelineId: ID): ResourcePool => ({
    id: resourceId,
    label,
    maxPipelineId,
    currentValue: 0,
    temporaryValue: 0,
    resetCondition: 'long_rest',
    // rechargeAmount: undefined — only set for 'per_turn' / 'per_round' pools
  });

  // --- Attribute label resolution (data-driven when available) ---
  //
  // Try to load attribute labels from the `config_attribute_definitions` config table.
  // This allows homebrew content to override stat names without code changes.
  //
  // FALLBACK LABELS:
  //   Embedded labels are used when:
  //   a) The DataLoader has not yet completed loading (engine bootstrap).
  //   b) The config_tables file is not in the enabled file-path whitelist.
  //   c) The 00_d20srd_core_config_tables.json file failed to load.
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

  /**
   * Reads the default base value for a movement speed pipeline from
   * `config_movement_defaults`. Falls back to `fallbackValue` (usually 0)
   * if the table has not loaded yet (bootstrap state).
   *
   * WHY A CONFIG TABLE INSTEAD OF A HARDCODED CONSTANT?
   *   The D&D 3.5 standard land speed (30 ft) is a rule, not a universal truth.
   *   Storing it in JSON lets homebrew rule sources change the default for all
   *   characters (e.g., a "short races" setting defaulting to 25 ft) without
   *   touching TypeScript. Individual races/creatures still override via
   *   "base" or "setAbsolute" modifiers on their Feature JSON.
   *
   * @param pipelineId    - The speed pipeline ID (e.g., "combatStats.speed_land").
   * @param fallbackValue - Value returned when the config table is absent.
   */
  const getSpeedDefault = (pipelineId: ID, fallbackValue: number): number => {
    try {
      const movTable = dataLoader.getConfigTable('config_movement_defaults');
      if (movTable?.data) {
        const row = (movTable.data as Array<Record<string, unknown>>).find(
          r => r['pipelineId'] === pipelineId
        );
        if (row !== undefined && typeof row['defaultBaseValue'] === 'number') {
          return row['defaultBaseValue'] as number;
        }
      }
    } catch {
      // DataLoader not yet initialized — use fallback silently
    }
    return fallbackValue;
  };

  // Bootstrap fallback labels for standard attribute pipelines.
  // These are used ONLY when the `config_attribute_definitions` config table
  // has not been loaded yet (engine bootstrap) or is unavailable.
  // At runtime, `getAttrLabel()` above attempts to load from the data-driven
  // config table first, falling back to these constants.
  //
  // ZERO-HARDCODING COMPLIANCE (PROGRESS.md Guideline 6):
  //   D&D-specific attribute names ("Strength", "Dexterity", etc.) must NOT be
  //   hardcoded in TypeScript logic. This fallback uses the pipeline IDs as labels
  //   instead of D&D-specific terms. The human-readable names are defined in
  //   `config_attribute_definitions` (inside the JSON rule files) and replace
  //   these placeholders as soon as the DataLoader finishes loading.
  const DEFAULT_LABELS: Record<string, LocalizedString> = {
    'stat_strength':         { en: 'stat_strength',         fr: 'stat_strength' },
    'stat_dexterity':        { en: 'stat_dexterity',        fr: 'stat_dexterity' },
    'stat_constitution':     { en: 'stat_constitution',     fr: 'stat_constitution' },
    'stat_intelligence':     { en: 'stat_intelligence',     fr: 'stat_intelligence' },
    'stat_wisdom':           { en: 'stat_wisdom',           fr: 'stat_wisdom' },
    'stat_charisma':         { en: 'stat_charisma',         fr: 'stat_charisma' },
    'stat_size':             { en: 'stat_size',             fr: 'stat_size' },
    'stat_caster_level':     { en: 'stat_caster_level',     fr: 'stat_caster_level' },
    'stat_manifester_level': { en: 'stat_manifester_level', fr: 'stat_manifester_level' },
  };

  return {
    id,
    name,
    isNPC: false,
    classLevels: {},
    // Level Adjustment is 0 for all standard PC races.
    // Set > 0 for monster PCs (e.g. Drow LA+2, Half-Dragon LA+3).
    // ECL for XP = sum(classLevels) + levelAdjustment.
    // @see ARCHITECTURE.md section 6 — levelAdjustment, @eclForXp path
    levelAdjustment: 0,
    // XP earned by this character. New characters start at 0.
    // Compared against config_xp_table thresholds using ECL (classLevels sum + LA).
    // @see ARCHITECTURE.md section 6 — xp field
    xp: 0,
    // Hit die results per character level — empty for a new character.
    // Populated by the Level Up mechanic (Phase 10.1).
    // Key: character level (1-indexed), Value: die result at that level.
    // @see ARCHITECTURE.md section 9, Phase 3: Max HP = sum(hitDieResults) + CON_mod × level
    hitDieResults: {},
    attributes: {
      'stat_strength':             makePipeline('stat_strength',             getAttrLabel('stat_strength',             DEFAULT_LABELS['stat_strength']),              10),
      'stat_dexterity':             makePipeline('stat_dexterity',             getAttrLabel('stat_dexterity',             DEFAULT_LABELS['stat_dexterity']),              10),
      'stat_constitution':             makePipeline('stat_constitution',             getAttrLabel('stat_constitution',             DEFAULT_LABELS['stat_constitution']),              10),
      'stat_intelligence':             makePipeline('stat_intelligence',             getAttrLabel('stat_intelligence',             DEFAULT_LABELS['stat_intelligence']),              10),
      'stat_wisdom':             makePipeline('stat_wisdom',             getAttrLabel('stat_wisdom',             DEFAULT_LABELS['stat_wisdom']),              10),
      'stat_charisma':             makePipeline('stat_charisma',             getAttrLabel('stat_charisma',             DEFAULT_LABELS['stat_charisma']),              10),
      'stat_size':            makePipeline('stat_size',            getAttrLabel('stat_size',            DEFAULT_LABELS['stat_size']),              0),
      'stat_caster_level':    makePipeline('stat_caster_level',    getAttrLabel('stat_caster_level',    DEFAULT_LABELS['stat_caster_level']),      0),
      'stat_manifester_level':makePipeline('stat_manifester_level',getAttrLabel('stat_manifester_level',DEFAULT_LABELS['stat_manifester_level']),  0),
    },
    combatStats: {
      'combatStats.ac_normal': makePipeline('combatStats.ac_normal', { en: 'Armor Class', fr: "Classe d'armure" }, 10),
      'combatStats.ac_touch': makePipeline('combatStats.ac_touch', { en: 'Touch AC', fr: 'CA de contact' }, 10),
      'combatStats.ac_flat_footed': makePipeline('combatStats.ac_flat_footed', { en: 'Flat-Footed AC', fr: 'CA pris au dépourvu' }, 10),
      'combatStats.base_attack_bonus': makePipeline('combatStats.base_attack_bonus', { en: 'Base Attack Bonus', fr: "Bonus d'attaque de base" }, 0),
      'combatStats.initiative': makePipeline('combatStats.initiative', { en: 'Initiative', fr: 'Initiative' }, 0),
      'combatStats.grapple': makePipeline('combatStats.grapple', { en: 'Grapple', fr: 'Lutte' }, 0),
      // Speed pipeline base values are read from `config_movement_defaults`.
      // The fallback values here are the D&D 3.5 SRD defaults used during
      // bootstrap (before the DataLoader has loaded the config table).
      // Races/creatures override these defaults via "base" or "setAbsolute" modifiers.
      'combatStats.speed_land':   makePipeline('combatStats.speed_land',   { en: 'Land Speed',   fr: 'Vitesse terrestre' },     getSpeedDefault('combatStats.speed_land',   30)),
      'combatStats.speed_burrow': makePipeline('combatStats.speed_burrow', { en: 'Burrow Speed',  fr: 'Vitesse de fouissement' }, getSpeedDefault('combatStats.speed_burrow',  0)),
      'combatStats.speed_climb':  makePipeline('combatStats.speed_climb',  { en: 'Climb Speed',   fr: "Vitesse d'escalade" },     getSpeedDefault('combatStats.speed_climb',   0)),
      'combatStats.speed_fly':    makePipeline('combatStats.speed_fly',    { en: 'Fly Speed',     fr: 'Vitesse de vol' },         getSpeedDefault('combatStats.speed_fly',     0)),
      'combatStats.speed_swim':   makePipeline('combatStats.speed_swim',   { en: 'Swim Speed',    fr: 'Vitesse de nage' },        getSpeedDefault('combatStats.speed_swim',    0)),
      'combatStats.armor_check_penalty': makePipeline('combatStats.armor_check_penalty', { en: 'Armor Check Penalty', fr: "Malus d'armure aux tests" }, 0),
      'combatStats.max_hp': makePipeline('combatStats.max_hp', { en: 'Max Hit Points', fr: 'Points de vie maximum' }, 0),

      // --- FORTIFICATION (SRD: Magic Armor special ability) ---
      // Percentage chance to negate a critical hit or sneak attack.
      // Light = 25%, Moderate = 75%, Heavy = 100%.
      // D&D 3.5 SRD: "When a critical hit or sneak attack is scored on the wearer,
      //   there is a chance that the critical hit or sneak attack is negated and
      //   damage is instead rolled normally."
      //
      // CONTENT AUTHORING:
      //   Items grant fortification via a grantedModifier:
      //     { targetId: "combatStats.fortification", value: 25, type: "untyped" }
      //   Multiple sources stack (unusual — but two Fortification items never appear
      //   on the same character; the SRD says "if you roll a special ability twice,
      //   use the better"). In practice only one value is active. Stored as percentage
      //   integer (0–100). baseValue = 0 (no fortification by default).
      //
      // DICE ENGINE CONTRACT:
      //   When parseAndRoll() confirms a critical hit, it reads the defender's
      //   combatStats.fortification.totalValue. If > 0, it rolls 1d100:
      //   if the roll <= fortificationPct, the crit is negated (damage rolled normally).
      //   @see diceEngine.ts — defenderFortificationPct parameter
      //   @see ARCHITECTURE.md section 4.7 — Fortification mechanic reference
      'combatStats.fortification': makePipeline('combatStats.fortification', { en: 'Fortification', fr: 'Fortification' }, 0),

      // --- ARCANE SPELL FAILURE (SRD: Armor & Shields) ---
      // Percentage chance that an arcane spell fails when cast while wearing armor.
      // D&D 3.5 SRD: armor with arcane spell failure chance requires an arcane
      //   spellcaster to roll 1d100 before casting; if the roll <= ASF%, the spell
      //   fails and the spell slot is expended.
      //
      // STACKING RULE (SRD):
      //   ASF percentages from multiple pieces of armor ADD together (not best-wins).
      //   A character wearing a chain shirt (20%) and carrying a heavy steel shield (15%)
      //   has a total ASF of 35%. This is why type "untyped" is used — untyped modifiers
      //   always stack, correctly modeling additive ASF.
      //
      // CONTENT AUTHORING:
      //   Each armor/shield item contributes via grantedModifier:
      //     { targetId: "combatStats.arcane_spell_failure", value: 20, type: "untyped" }
      //   Masterwork and mithral items reduce ASF separately via additional modifiers.
      //   baseValue = 0 (no spell failure by default — unarmored character).
      //
      // DICE ENGINE CONTRACT:
      //   The CastingPanel UI (Phase 12.3) reads combatStats.arcane_spell_failure.totalValue
      //   and rolls 1d100 before every arcane spell cast. If roll <= ASF%, the spell fails.
      //   @see ARCHITECTURE.md section 4.8 — Arcane Spell Failure mechanic reference
      'combatStats.arcane_spell_failure': makePipeline('combatStats.arcane_spell_failure', { en: 'Arcane Spell Failure', fr: "Risque d'échec des sorts arcaniques" }, 0),

      // --- MAX DEX BONUS TO AC (`combatStats.max_dexterity_bonus`) ---
      //
      // The maximum Dexterity modifier a character may apply to their Armor Class
      // while wearing armor, carrying a shield with a restriction, or under encumbrance.
      //
      // D&D 3.5 SRD rule: "If your armor has a maximum Dexterity bonus, this is the
      //   highest Dexterity modifier you can add to your Armor Class while wearing it."
      //
      // STACKING MODEL (MINIMUM-WINS per Phase 3 special handling):
      //   Armor and conditions impose a CAP via `type: "max_dex_cap"` modifiers.
      //   Multiple `max_dex_cap` sources → MINIMUM value applies (most restrictive wins).
      //   Additive bonuses (e.g., Mithral +2) use `type: "untyped"` and are applied AFTER
      //   the cap is determined. See Phase 3 special case in phase3_combatStats.
      //
      // BASE VALUE = 99:
      //   An unarmored character (no active `max_dex_cap` modifier) has a cap of 99,
      //   which effectively means "no restriction — full DEX applies to AC".
      //
      // CONTENT AUTHORING:
      //   Armor/shield restricting DEX:
      //     { type: "max_dex_cap", targetId: "combatStats.max_dexterity_bonus", value: 3 }
      //   Heavy Load condition (cap of +1):
      //     { type: "max_dex_cap", targetId: "combatStats.max_dexterity_bonus", value: 1 }
      //   Mithral special material (+2 to the cap):
      //     { type: "untyped", targetId: "combatStats.max_dexterity_bonus", value: 2 }
      //
      // UI CONTRACT:
      //   The ArmorClass panel reads `combatStats.max_dexterity_bonus.totalValue` and caps
      //   the DEX modifier contribution to AC at that value. A totalValue of 99 means
      //   "no cap" (full DEX applies). The pipeline value is also displayed in the
      //   ArmorClass breakdown for player transparency.
      //
      // @see ARCHITECTURE.md section 4.17 — Max DEX Bonus pipeline reference
      // @see primitives.ts ModifierType: "max_dex_cap" for the new minimum-wins type
      'combatStats.max_dexterity_bonus': makePipeline('combatStats.max_dexterity_bonus', { en: 'Max Dex Bonus', fr: 'Bonus de Dex maximum' }, 99),

      // --- EQUIPMENT SLOT PIPELINES (Phase 3.1 — ARCHITECTURE.md §3.1) ---
      //
      // One pipeline per equipment body slot. `baseValue` = the default slot count for
      // a standard Medium humanoid. Racial/feat features can grant extra slots (e.g.,
      // an exotic race with 4 ring fingers gets `"slots.ring" baseValue: 4`, or a
      // modifier with `type: "untyped"` and `value: 2` adds 2 extra ring slots).
      //
      // These ARE proper StatisticPipeline entries so that:
      //   1. Slot counts are visible in the ModifierBreakdownModal.
      //   2. Features can grant extra slots via standard grantedModifiers.
      //   3. The pipeline machinery handles the accumulation uniformly.
      //
      // Slots that logically allow exactly 1 equipped item (head, neck, torso, etc.)
      // have baseValue: 1. The ring slot allows 2 per D&D 3.5 SRD.
      //
      // Labels use the pipeline ID during bootstrap — config_slot_definitions provides
      // human-readable names once the DataLoader loads. (PROGRESS.md Guideline 6:
      // no D&D-specific terms hardcoded in TypeScript.)
      'slots.head':      makePipeline('slots.head',      { en: 'slots.head',      fr: 'slots.head' },      1),
      'slots.eyes':      makePipeline('slots.eyes',      { en: 'slots.eyes',      fr: 'slots.eyes' },      1),
      'slots.neck':      makePipeline('slots.neck',      { en: 'slots.neck',      fr: 'slots.neck' },      1),
      'slots.torso':     makePipeline('slots.torso',     { en: 'slots.torso',     fr: 'slots.torso' },     1),
      'slots.body':      makePipeline('slots.body',      { en: 'slots.body',      fr: 'slots.body' },      1),
      'slots.waist':     makePipeline('slots.waist',     { en: 'slots.waist',     fr: 'slots.waist' },     1),
      'slots.shoulders': makePipeline('slots.shoulders', { en: 'slots.shoulders', fr: 'slots.shoulders' }, 1),
      'slots.arms':      makePipeline('slots.arms',      { en: 'slots.arms',      fr: 'slots.arms' },      1),
      'slots.hands':     makePipeline('slots.hands',     { en: 'slots.hands',     fr: 'slots.hands' },     1),
      // D&D 3.5 SRD standard: a humanoid has two ring slots (one per hand).
      'slots.ring':      makePipeline('slots.ring',      { en: 'slots.ring',      fr: 'slots.ring' },      2),
      'slots.feet':      makePipeline('slots.feet',      { en: 'slots.feet',      fr: 'slots.feet' },      1),
      'slots.main_hand': makePipeline('slots.main_hand', { en: 'slots.main_hand', fr: 'slots.main_hand' }, 1),
      'slots.off_hand':  makePipeline('slots.off_hand',  { en: 'slots.off_hand',  fr: 'slots.off_hand' },  1),
    },
    saves: {
      // Bootstrap-phase labels use pipeline IDs to comply with PROGRESS.md Guideline 6
      // (no D&D-specific terms in TypeScript). config_save_definitions supplies the human-
      // readable save names ("Fortitude", "Reflex", "Will") once the DataLoader loads.
      'saves.fortitude': makePipeline('saves.fortitude', { en: 'saves.fortitude', fr: 'saves.fortitude' }, 0),
      'saves.reflex':    makePipeline('saves.reflex',    { en: 'saves.reflex',    fr: 'saves.reflex' },    0),
      'saves.will':      makePipeline('saves.will',      { en: 'saves.will',      fr: 'saves.will' },      0),
    },
    skills: {},
    // minimumSkillRanks is ABSENT for new characters — all ranks can be freely adjusted
    // during character creation. Call engine.lockAllSkillRanks() after each level-up commit
    // to lock in the current ranks as the irreducible minimum.
    // @see Character.minimumSkillRanks and GameEngine.lockSkillRanksMin()
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

  /**
   * The active campaign settings (language, house rules, enabled sources).
   *
   * NOTE ON LANGUAGE INITIALIZATION:
   *   `settings.language` is initialized from user-level localStorage
   *   (`storageManager.loadUserLanguage()`) rather than the campaign-settings
   *   default. This ensures the user's language preference persists across
   *   all campaigns and app restarts independent of campaign data.
   */
  settings = $state<CampaignSettings>({
    ...createDefaultCampaignSettings(),
    language: storageManager.loadUserLanguage(),
  });

  /** The currently active character. Replacing this triggers full DAG re-evaluation. */
  character = $state<Character>(createEmptyCharacter('default', 'New Character'));

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
   * The set of language codes available across all currently loaded rule files.
   *
   * Derived reactively from `dataLoader.getAvailableLanguages()`. Re-evaluated
   * whenever `bumpDataLoaderVersion()` is called (i.e., after every load cycle).
   *
   * Always contains at least `["en"]`. Additional codes (e.g., `"fr"`, `"es"`) appear
   * when at least one loaded file declares them in its `supportedLanguages` array.
   *
   * UI usage:
   *   The language dropdown in the sidebar reads this array to populate its options.
   *   Selecting a language code updates `engine.settings.language`, which propagates
   *   reactively to all `engine.t()` and `ui()` calls across the UI.
   */
  availableLanguages: string[] = $derived.by(() => {
    // Reading dataLoaderVersion creates a reactive dependency so this $derived
    // re-runs when loadRuleSources() completes and bumpDataLoaderVersion() is called.
    void this.dataLoaderVersion;
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

  /**
   * Auto-save $effect: persists the language preference at the USER level
   * (independently of campaign settings) whenever it changes.
   *
   * WHY SEPARATE FROM autoSaveSettingsEffect?
   *   Campaign settings are campaign-scoped. The language preference must
   *   survive campaign changes and be restored next time the user logs in,
   *   regardless of which campaign they are in.
   */
  readonly #autoSaveLanguageEffect = $effect.root(() => {
    $effect(() => {
      storageManager.saveUserLanguage(this.settings.language);
    });
  });

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
        if (this.character.skills[skillId]) continue; // already seeded — never overwrite

        const label = (row['label'] ?? { en: skillId }) as import('../types/i18n').LocalizedString;
        const keyAbility = (row['keyAbility'] as string | undefined) ?? 'stat_intelligence';
        const acp  = Boolean(row['appliesArmorCheckPenalty']);
        const uTrained = row['canBeUsedUntrained'] !== false;

        this.character.skills[skillId] = makeSkillPipeline(
          skillId, label, keyAbility, acp, uTrained
        );
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
    // IMPORTANT: Explicitly read both upstream $derived values before passing them
    // to the helper. This ensures Svelte 5 correctly tracks them as dependencies.
    const activeTags = this.phase0_activeTags;
    const context = this.phase0_context;
    return this.#computeFlatModifiers(activeTags, context);
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
    return this.#computeActiveTags();
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
    const combatStats: CharacterContext['combatStats'] = {};
    for (const [id, stat] of Object.entries(char.combatStats)) {
      const flatKey = id.startsWith('combatStats.') ? id.slice('combatStats.'.length) : id;
      combatStats[flatKey] = { totalValue: stat.totalValue };
    }

    // Build saves snapshot — strip "saves." prefix for the same reason.
    // @saves.fortitude.totalValue requires context.saves["fortitude"], not context.saves["saves.fortitude"].
    const saves: CharacterContext['saves'] = {};
    for (const [id, save] of Object.entries(char.saves)) {
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
   * MAIN ABILITY SCORE IDs: stat_strength, stat_dexterity, stat_constitution, stat_intelligence, stat_wisdom, stat_charisma
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
   phase3_combatStats: Record<ID, StatisticPipeline> = $derived.by(() => {
     const result: Record<ID, StatisticPipeline> = {};
     const flatMods = this.phase0_flatModifiers;
     const attributes = this.phase2_attributes;
     const characterLevel = this.phase0_characterLevel;
     const isGestalt = this.settings.variantRules?.gestalt ?? false;

    // --- Max HP Special Calculation ---
    // D&D 3.5 formula: sum(hitDieResults per level) + CON_modifier × characterLevel
    // Since hit die results per level are stored in the character's resource pool
    // (rolled or set at level-up), we compute the CON contribution here and add
    // it to the base pipeline (which holds the sum of hit die rolls).
    // CON modifier × character level is added as a runtime bonus.
    const conDerivedMod = attributes['stat_constitution']?.derivedModifier ?? 0;
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

      // --- Max DEX Bonus to AC: minimum-wins among armor/condition caps ---
      //
      // `combatStats.max_dexterity_bonus` uses a special stacking model:
      //   - `max_dex_cap` modifiers represent CONSTRAINTS (armor, encumbrance, conditions).
      //     The most restrictive cap wins: if chain mail (cap=2) and tower shield (cap=2)
      //     are both active, the effective cap is min(2, 2) = 2.
      //   - Other modifier types (e.g., `untyped` +2 from Mithral, or enhancement bonuses
      //     from magical items) are applied AFTER the cap is established via normal stacking.
      //
      // WHY NOT setAbsolute?
      //   Using setAbsolute for armor caps prevents additive bonuses (like Mithral's +2)
      //   from stacking on top. The `max_dex_cap` type solves this by separating the
      //   "cap from armor" from "bonus to cap from special material".
      //
      //   Example: mithral chainmail
      //     - chain mail max_dex_cap = 2  → effectiveBaseValue = 2
      //     - mithral untyped = +2        → totalValue = 2 + 2 = 4
      //     Combined: "max DEX bonus to AC is +4" (chainmail base 2, mithral adds 2).
      //
      // BASE VALUE = 99:
      //   No armor worn → no max_dex_cap modifiers → effectiveBaseValue = 99 (no restriction).
      //   Additive bonuses on an unarmored character (unusual but possible) still stack.
      //
      // @see primitives.ts — ModifierType "max_dex_cap" documentation
      // @see ARCHITECTURE.md section 4.17 — Max DEX Bonus pipeline reference
      if (pipelineId === 'combatStats.max_dexterity_bonus') {
        // Separate the cap-imposing modifiers from additive bonuses
        const capMods = activeMods.filter(m => m.type === 'max_dex_cap');
        // After we extract capMods, only the non-cap modifiers go through normal stacking
        // (we reassign activeMods below — TypeScript requires a local override)
        const remainingMods = activeMods.filter(m => m.type !== 'max_dex_cap');

        if (capMods.length > 0) {
          // MINIMUM-WINS: most restrictive armor/condition cap applies
          effectiveBaseValue = Math.min(...capMods.map(m => Number(m.value)));
        } else {
          // No armor / no condition restricting DEX → use base of 99 (no cap)
          effectiveBaseValue = basePipeline.baseValue; // 99
        }

        // Apply non-cap modifiers (e.g., Mithral's untyped +2) via normal stacking.
        // Gestalt mode has no effect on this pipeline (it's not BAB/saves).
        const stackingResult = applyStackingRules(remainingMods, effectiveBaseValue);

        result[pipelineId] = {
          ...basePipeline,
          // Expose ALL source modifiers in activeModifiers for the UI breakdown:
          // cap mods + applied non-cap mods, so the player can see what imposed the cap
          // and what bonuses were added on top.
          activeModifiers: [...capMods, ...stackingResult.appliedModifiers],
          situationalModifiers: situationalMods,
          totalBonus: stackingResult.totalBonus,
          totalValue: stackingResult.totalValue,
          derivedModifier: 0,
        };
        continue; // Skip the general processing loop for this pipeline
      }

       // GESTALT MODE (Phase 3.7):
       //   For BAB and saves, replace the standard "sum all base mods" with
       //   computeGestaltBase() which applies max-per-level then sums.
       //   Non-"base" modifiers (enhancement, luck, etc.) still go through
       //   applyStackingRules() normally in both standard and gestalt modes.
       let gestaltBaseAdjustment = 0;
       let nonBaseMods = activeMods;
       if (isGestalt && isGestaltAffectedPipeline(pipelineId)) {
         const baseMods = activeMods.filter(m => m.type === 'base');
         nonBaseMods = activeMods.filter(m => m.type !== 'base');
         // computeGestaltBase replaces the standard sum of all "base" modifiers
         gestaltBaseAdjustment = computeGestaltBase(
           baseMods,
           { ...this.character.classLevels },
           characterLevel
         );
       }

       const stacking = applyStackingRules(nonBaseMods, isGestalt && isGestaltAffectedPipeline(pipelineId)
         ? effectiveBaseValue + gestaltBaseAdjustment
         : effectiveBaseValue);

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

       // GESTALT MODE for saves: same max-per-level logic as BAB above
       let gestaltSaveAdjustment = 0;
       let nonBaseSaveMods = activeMods;
       if (isGestalt && isGestaltAffectedPipeline(pipelineId)) {
         const baseSaveMods = activeMods.filter(m => m.type === 'base');
         nonBaseSaveMods = activeMods.filter(m => m.type !== 'base');
         gestaltSaveAdjustment = computeGestaltBase(
           baseSaveMods,
           { ...this.character.classLevels },
           characterLevel
         );
       }

       const stacking = applyStackingRules(
         nonBaseSaveMods,
         isGestalt && isGestaltAffectedPipeline(pipelineId)
           ? basePipeline.baseValue + gestaltSaveAdjustment
           : basePipeline.baseValue
       );
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

    // Strip "combatStats." prefix — see phase0_context for the full rationale.
    const combatStats: CharacterContext['combatStats'] = {};
    for (const [id, stat] of Object.entries(this.phase3_combatStats)) {
      if (!id.startsWith('saves.')) {
        const flatKey = id.startsWith('combatStats.') ? id.slice('combatStats.'.length) : id;
        combatStats[flatKey] = { totalValue: stat.totalValue };
      }
    }

    // Strip "saves." prefix — @saves.fortitude.totalValue needs context.saves["fortitude"].
    const saves: CharacterContext['saves'] = {};
    for (const [id, save] of Object.entries(this.phase3_combatStats)) {
      if (id.startsWith('saves.')) {
        const flatKey = id.slice('saves.'.length);
        saves[flatKey] = { totalValue: save.totalValue };
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
    // Reading dataLoaderVersion creates a reactive dependency so this $derived
    // re-runs when loadRuleSources() completes and bumpDataLoaderVersion() is called.
    void this.dataLoaderVersion;

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
   * DAG Phase 4: Per-class skill point budget breakdown.
   *
   * D&D 3.5 MULTICLASS SKILL POINT RULES (SRD, "Skills" section):
   *   At EACH CHARACTER LEVEL, the character gains skill points equal to:
   *     max(1, Class_SP_Per_Level + INT_modifier)
   *   ...where "Class_SP_Per_Level" is the base SP/level for the CLASS whose level
   *   was gained at that character level.
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
  phase4_skillPointsBudget: SkillPointsBudget = $derived.by(() => {
    // INT modifier: actual value; max(1, ...) applied per level below.
    const intMod = this.phase2_attributes['stat_intelligence']?.derivedModifier ?? 0;

    // --- D&D 3.5 FIRST-LEVEL 4× BONUS ---
    //
    // At character level 1, the class taken grants 4× the normal SP (SRD rule, "Skills" chapter).
    //   "At 1st level, you get four times the number of skill points you normally get
    //    for a level in that class."
    //
    // IDENTIFYING THE "FIRST CLASS":
    //   character.classLevels is a plain JS object. Modern JS (ES2015+) preserves insertion
    //   order for string keys, so Object.keys(classLevels)[0] is the class the player added
    //   first in the UI — which corresponds to the class taken at character level 1.
    //   This is a sound heuristic and matches how BasicInfo.svelte builds classLevels.
    //
    // The bonus is represented as `firstLevelBonus = 3 × pointsPerLevel` (3 extra multiples,
    // taking the effective count from 1× to 4× for that first level).
    const firstClassId = Object.keys(this.character.classLevels)[0] as ID | undefined;

    const classEntries: ClassSkillPointsEntry[] = [];
    // Track which sourceIds have been processed as class SP sources to avoid double-counting
    const processedClassSPSources = new Set<ID>();

    // --- Step 1: Collect class-based SP/level modifiers ---
    //
    // Scan all active flat modifiers for those targeting `attributes.skill_points_per_level`.
    // Each such modifier SHOULD come from a class Feature (sourceId = class Feature ID).
    // We verify by checking character.classLevels[sourceId] exists.
    //
    // WHY FLAT MODIFIERS (not directly from feature.grantedModifiers)?
    //   Phase 0 already resolved all level-gated and conditional modifiers.
    //   Reading from phase0_flatModifiers ensures we respect isActive, forbiddenTags,
    //   conditionNodes, and the full resolution chain — consistent with all other DAG phases.
    for (const entry of this.phase0_flatModifiers) {
      const mod = entry.modifier;
      if (mod.targetId !== 'attributes.skill_points_per_level') continue;
      if (mod.situationalContext) continue; // Ignore situational SP modifiers

      const sourceId = mod.sourceId;
      if (processedClassSPSources.has(sourceId)) continue; // De-duplicate per source

      const classLevel = this.character.classLevels[sourceId];
      if (classLevel === undefined || classLevel < 1) {
        // This SP/level modifier comes from a non-class source (racial trait etc.)
        // Treat it as a bonus — will be accumulated below with the bonus pass.
        continue;
      }

      // Found a class-based SP/level source.
      processedClassSPSources.add(sourceId);

      const spPerLevel = typeof mod.value === 'number' ? mod.value : 0;
      const pointsPerLevel = Math.max(1, spPerLevel + intMod);

      // Apply the first-level 4× bonus to whichever class was taken at character level 1.
      const isFirstClass = sourceId === firstClassId;
      const firstLevelBonus = isFirstClass ? 3 * pointsPerLevel : 0;
      const totalPoints = pointsPerLevel * classLevel + firstLevelBonus;

      // Look up the class feature label for display in the journal
      const classFeature = dataLoader.getFeature(sourceId);
      const classLabel: LocalizedString = classFeature?.label ?? { en: sourceId, fr: sourceId };

      classEntries.push({
        classId: sourceId,
        classLabel,
        spPerLevel,
        classLevel,
        intModifier: intMod,
        pointsPerLevel,
        firstLevelBonus,
        totalPoints,
      });
    }

    // --- Step 2: Collect bonus SP/level modifiers (racial, feat, etc.) ---
    //
    // These modifiers target `attributes.bonus_skill_points_per_level`.
    // They apply uniformly per TOTAL CHARACTER LEVEL (not per-class level).
    // Example: Human racial "+1 SP/level" adds 1 SP for every level the character has.
    let bonusSpPerLevel = 0;
    for (const entry of this.phase0_flatModifiers) {
      const mod = entry.modifier;
      if (mod.targetId !== 'attributes.bonus_skill_points_per_level') continue;
      if (mod.situationalContext) continue;
      bonusSpPerLevel += typeof mod.value === 'number' ? mod.value : 0;
    }

    // Also check for non-class sources targeting `attributes.skill_points_per_level` —
    // these are treated as bonus SP per total level (same treatment as bonus_skill_points_per_level).
    for (const entry of this.phase0_flatModifiers) {
      const mod = entry.modifier;
      if (mod.targetId !== 'attributes.skill_points_per_level') continue;
      if (mod.situationalContext) continue;
      const sourceId = mod.sourceId;
      if (processedClassSPSources.has(sourceId)) continue; // Already handled as class SP
      // Not a class source — treat as bonus per total character level
      bonusSpPerLevel += typeof mod.value === 'number' ? mod.value : 0;
    }

    const totalClassPoints = classEntries.reduce((sum, e) => sum + e.totalPoints, 0);
    const totalBonusPoints = bonusSpPerLevel * this.phase0_characterLevel;
    const totalAvailable = totalClassPoints + totalBonusPoints;

    return {
      perClassBreakdown: classEntries,
      bonusSpPerLevel,
      totalBonusPoints,
      totalClassPoints,
      totalAvailable,
      intModifier: intMod,
    };
  });

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
  phase4_levelingJournal: LevelingJournal = $derived.by(() => {
    const flatMods = this.phase0_flatModifiers;
    const budget = this.phase4_skillPointsBudget;
    const classSPMap = new Map<ID, ClassSkillPointsEntry>(
      budget.perClassBreakdown.map(e => [e.classId, e])
    );

    const perClassBreakdown: LevelingJournalClassEntry[] = [];

    for (const [classId, classLevel] of Object.entries(this.character.classLevels)) {
      if (classLevel < 1) continue;

      // Get the class Feature definition for labels, classSkills, etc.
      const classFeature = dataLoader.getFeature(classId);
      const classLabel: LocalizedString = classFeature?.label ?? { en: classId, fr: classId };

      // --- BAB and saves: sum all "base" type modifiers from this class source ---
      //
      // The modifier.sourceId tells us which class contributed each increment.
      // We filter by sourceId = classId to get only THIS class's contributions.
      // "base" type modifiers stack, so summing gives the correct total per class.
      const babMods = flatMods.filter(
        e => e.modifier.sourceId === classId
          && e.modifier.targetId === 'combatStats.base_attack_bonus'
          && e.modifier.type === 'base'
          && !e.modifier.situationalContext
      );
      const fortMods = flatMods.filter(
        e => e.modifier.sourceId === classId
          && e.modifier.targetId === 'saves.fortitude'
          && e.modifier.type === 'base'
          && !e.modifier.situationalContext
      );
      const refMods = flatMods.filter(
        e => e.modifier.sourceId === classId
          && e.modifier.targetId === 'saves.reflex'
          && e.modifier.type === 'base'
          && !e.modifier.situationalContext
      );
      const willMods = flatMods.filter(
        e => e.modifier.sourceId === classId
          && e.modifier.targetId === 'saves.will'
          && e.modifier.type === 'base'
          && !e.modifier.situationalContext
      );

      const totalBab  = babMods.reduce((s, e) => s + (typeof e.modifier.value === 'number' ? e.modifier.value : 0), 0);
      const totalFort = fortMods.reduce((s, e) => s + (typeof e.modifier.value === 'number' ? e.modifier.value : 0), 0);
      const totalRef  = refMods.reduce((s, e) => s + (typeof e.modifier.value === 'number' ? e.modifier.value : 0), 0);
      const totalWill = willMods.reduce((s, e) => s + (typeof e.modifier.value === 'number' ? e.modifier.value : 0), 0);

      // Skill points from the per-class SP budget (includes first-level bonus if applicable)
      const spEntry = classSPMap.get(classId);
      const totalSp         = spEntry?.totalPoints    ?? 0;
      const spPerLevel      = spEntry?.spPerLevel     ?? 0;
      const spPointsPerLevel = spEntry?.pointsPerLevel ?? 0;
      const firstLevelBonus = spEntry?.firstLevelBonus ?? 0;

      // Class skills from the Feature definition
      const classSkills: ID[] = classFeature?.classSkills ?? [];
      const classSkillLabels = classSkills.map(skillId => {
        const skillDef = dataLoader.getFeature(skillId);
        return {
          id: skillId,
          label: skillDef?.label ?? ({ en: skillId } as LocalizedString),
        };
      });

      // Granted features from levelProgression up to classLevel
      const grantedFeatureIds: string[] = [];
      if (classFeature?.levelProgression) {
        for (const entry of classFeature.levelProgression) {
          if (entry.level <= classLevel) {
            for (const fid of entry.grantedFeatures) {
              if (fid && !fid.startsWith('-') && !grantedFeatureIds.includes(fid)) {
                grantedFeatureIds.push(fid);
              }
            }
          }
        }
      }

      perClassBreakdown.push({
        classId,
        classLabel,
        classLevel,
        totalBab,
        totalFort,
        totalRef,
        totalWill,
        totalSp,
        spPerLevel,
        spPointsPerLevel,
        firstLevelBonus,
        classSkills,
        classSkillLabels,
        grantedFeatureIds,
      });
    }

    const totalBab  = perClassBreakdown.reduce((s, e) => s + e.totalBab,  0);
    const totalFort = perClassBreakdown.reduce((s, e) => s + e.totalFort, 0);
    const totalRef  = perClassBreakdown.reduce((s, e) => s + e.totalRef,  0);
    const totalWill = perClassBreakdown.reduce((s, e) => s + e.totalWill, 0);
    const totalSp   = perClassBreakdown.reduce((s, e) => s + e.totalSp,   0)
      + budget.totalBonusPoints;

    return {
      perClassBreakdown,
      totalBab,
      totalFort,
      totalRef,
      totalWill,
      totalSp,
      characterLevel: this.phase0_characterLevel,
    };
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
    // Reading dataLoaderVersion creates a reactive dependency so this $derived
    // re-runs when loadRuleSources() completes and bumpDataLoaderVersion() is called.
    void this.dataLoaderVersion;

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
          // Resolve the source skill's localized label from the DataLoader so the
          // modifier's sourceName reads "Synergy (Diplomacy)" instead of
          // "Synergy (skill_diplomacy)". Falls back to the raw ID if the feature
          // hasn't loaded yet (bootstrap) — the DAG will re-evaluate once it loads.
          const sourceSkillFeature = dataLoader.getFeature(sourceSkill);
          const sourceLabel: LocalizedString = sourceSkillFeature?.label
            ?? { en: sourceSkill, fr: sourceSkill };

          // Build the synergy modifier source name using the externalized
          // SYNERGY_SOURCE_LABEL constant (no hardcoded EN/FR strings in engine code).
          // Adding a new UI language only requires updating constants.ts + the locale
          // JSON — no changes to this engine method.
          const synergyMod: import('../types/pipeline').Modifier = {
            id: `synergy_${sourceSkill}_to_${targetSkill}`,
            sourceId: sourceSkill,
            sourceName: {
              en: `${SYNERGY_SOURCE_LABEL.en} (${translateString(sourceLabel, 'en')})`,
              fr: `${SYNERGY_SOURCE_LABEL.fr} (${translateString(sourceLabel, 'fr')})`,
            },
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
    // Track the dataLoader version so this derived re-evaluates when rules reload.
    void this.dataLoaderVersion;

    const table = dataLoader.getConfigTable('config_save_definitions');
    if (table?.data && Array.isArray(table.data) && table.data.length > 0) {
      // Map each row from the config table to a typed SaveConfigEntry.
      // Unknown extra fields (e.g., future homebrew extensions) are silently ignored.
      return (table.data as Array<Record<string, unknown>>).map(row => ({
        pipelineId:     (row['pipelineId']     as string)        ?? '',
        label:          (row['label']          as LocalizedString) ?? { en: '', fr: '' },
        keyAbilityId:   (row['keyAbilityId']   as string)        ?? '',
        keyAbilityAbbr: (row['keyAbilityAbbr'] as LocalizedString) ?? { en: '', fr: '' },
        accentColor:    (row['accentColor']    as string)        ?? '#888',
      })) satisfies SaveConfigEntry[];
    }

    // Fallback: DataLoader not yet loaded (bootstrap) or table absent in rule sources
    return DEFAULT_SAVE_CONFIG;
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
  phase_equipmentSlots: Record<string, number> = $derived.by(() => {
    // Read the resolved slot counts from phase3_combatStats (full pipeline processing:
    // base value + stacking rules for any features that modify slot counts).
    // Fall back to 0 for any slot not present (should never happen — all are initialised
    // in createEmptyCharacter(), but defensive guard prevents NaN).
    const combatStats = this.phase3_combatStats;
    const result: Record<string, number> = {};

    const SLOT_PIPELINE_KEYS = [
      'slots.head', 'slots.eyes', 'slots.neck', 'slots.torso', 'slots.body',
      'slots.waist', 'slots.shoulders', 'slots.arms', 'slots.hands',
      'slots.ring', 'slots.feet', 'slots.main_hand', 'slots.off_hand',
    ] as const;

    for (const key of SLOT_PIPELINE_KEYS) {
      result[key] = combatStats[key]?.totalValue ?? 0;
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
    return total;
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
   * Reactive encumbrance condition manager.
   *
   * Watches `phase2b_encumbranceTier` and auto-adds/removes synthetic
   * condition features in `character.activeFeatures`:
   *   - tier >= 1: adds "condition_medium_load" (tags: ["medium_load"])
   *   - tier >= 2: adds "condition_heavy_load"  (tags: ["heavy_load"])
   *   - tier < 1:  removes both conditions
   *
   * These synthetic features are identified by their instanceId prefix
   * "enc_auto_" so they can be managed without affecting player-added features.
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
      const hasMedium = features.some(f => f.instanceId === 'enc_auto_medium_load');
      const hasHeavy  = features.some(f => f.instanceId === 'enc_auto_heavy_load');

      const needMedium = tier >= 1;
      const needHeavy  = tier >= 2;

      // Only mutate if the current state doesn't match the desired state
      if (hasMedium === needMedium && hasHeavy === needHeavy) return;

      // Build the new feature list
      // Remove any existing auto-encumbrance entries first
      const filtered = features.filter(f =>
        f.instanceId !== 'enc_auto_medium_load' && f.instanceId !== 'enc_auto_heavy_load'
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
  phase4_featSlots: number = $derived.by(() => {
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
  phase4_grantedFeatIds: ReadonlySet<string> = $derived.by(() => {
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
   * Feats in phase4_grantedFeatIds are excluded.
   */
  phase4_manualFeatCount: number = $derived.by(() => {
    const grantedIds = this.phase4_grantedFeatIds;
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
  phase4_featSlotsRemaining: number = $derived(
    this.phase4_featSlots - this.phase4_manualFeatCount
  );

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
      const clamped = Math.max(minimum, Math.max(0, ranks));
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
   * Sets temporary HP (takes the higher value per SRD non-stacking rule).
   * @param amount - The temporary HP to set.
   */
  setTemporaryHP(amount: number): void {
    const hp = this.character.resources['resources.hp'];
    if (!hp) return;
    hp.temporaryValue = Math.max(hp.temporaryValue, amount);
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
  #computeFlatModifiers(activeTags: string[], context: CharacterContext): { modifiers: FlatModifierEntry[]; disabledInstanceIds: Set<ID> } {
    const result: FlatModifierEntry[] = [];
    // Track feature instances whose prerequisitesNode is no longer satisfied.
    // These features are "owned" by the character but their modifiers are suspended.
    // The UI renders them grayed-out with a warning (e.g., "Dexterity dropped below 15").
    const disabledInstanceIds = new Set<ID>();

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
        disabledInstanceIds,
        0 // initial depth
      );
    }

    return { modifiers: result, disabledInstanceIds };
  }

  /**
   * Recursively collects modifiers from a feature instance.
   *
   * @param instance            - The ActiveFeatureInstance to process.
   * @param activeTags          - Current character tag set (for forbiddenTags and conditionNode checks).
   * @param context             - Preliminary character context (for formula resolution).
   * @param result              - Output array to push FlatModifierEntry objects into.
   * @param visitedFeatureIds   - Set of already-visited feature IDs (cycle prevention).
   * @param disabledInstanceIds - Set to record instances whose prerequisites are no longer met.
   * @param depth               - Current recursion depth (prevent infinite loops).
   */
  #collectModifiersFromInstance(
    instance: ActiveFeatureInstance,
    activeTags: string[],
    context: CharacterContext,
    result: FlatModifierEntry[],
    visitedFeatureIds: Set<ID>,
    disabledInstanceIds: Set<ID>,
    depth: number
  ): void {
    // Depth guard: prevent infinite recursion from circular grantedFeatures references.
    // Architecture §9.1 specifies a maximum of 3 re-evaluations. The initial call starts
    // at depth 0, so depth >= 3 means we've already done 3 recursive expansions.
    if (depth >= MAX_RESOLUTION_DEPTH) {
      console.warn(`[GameEngine] Phase 0: Max resolution depth (${MAX_RESOLUTION_DEPTH}) reached for feature "${instance.featureId}". Stopping recursion.`);
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

    // --- Check prerequisitesNode at RUNTIME ---
    // D&D 3.5 rule: If a character's stats change (ability drain, level loss, curse)
    // such that a feat's prerequisites are no longer met, the feat's bonuses are
    // suspended. The feat is NOT removed — it remains on the character sheet
    // (displayed grayed-out) and reactivates automatically if prerequisites are met again.
    //
    // Example: Two-Weapon Fighting requires DEX 15. If the character's DEX drops
    // below 15 (due to poison, a curse, etc.), the feat's attack modifiers are
    // suspended until DEX is restored.
    //
    // We only check at depth 0 (player's own features), not for recursively-granted
    // sub-features (those are governed by their parent's gating).
    // Race, class, and class_feature categories are exempt — their "prerequisites"
    // are structural (you chose this race/class), not stat-dependent.
    if (depth === 0 && feature.prerequisitesNode) {
      const exemptCategories = new Set(['race', 'class', 'class_feature', 'condition', 'environment', 'monster_type']);
      if (!exemptCategories.has(feature.category)) {
        const prereqContext: CharacterContext = { ...context, activeTags };
        if (!checkCondition(feature.prerequisitesNode, prereqContext)) {
          // Prerequisites failed — mark this instance as disabled and skip its modifiers.
          disabledInstanceIds.add(instance.instanceId);
          return; // Feature's modifiers are suspended (not collected).
        }
      }
    }

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
          disabledInstanceIds,
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
   *     - "stat_strength"           (short form — the Character.attributes map key)
   *     - "attributes.stat_strength" (long form — as used in ARCHITECTURE.md Annex A examples)
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
      // Strips the optional "attributes." prefix so both "stat_strength" and
      // "attributes.stat_strength" target the same Character.attributes pipeline.
      // Also strips the "skills." prefix: "skills.skill_climb" → "skill_climb".
      // This is a non-destructive normalisation — the original JSON is not mutated.
      const normalisedTargetId = normaliseModifierTargetId(mod.targetId);

      // --- saves.all fan-out ---
      // "saves.all" is a broadcast shorthand: apply this modifier to ALL three saves.
      // Used by Divine Grace, Resistance spells, Cloaks of Resistance, etc.
      // Fan out into three independent modifier entries targeting saves.fortitude/reflex/will.
      if (normalisedTargetId === 'saves.all') {
        const saveTargets = ['saves.fortitude', 'saves.reflex', 'saves.will'] as const;
        for (const saveTarget of saveTargets) {
          const suffix = saveTarget.split('.')[1]; // "fortitude" | "reflex" | "will"
          let fanMod: Modifier = { ...mod, targetId: saveTarget, id: `${mod.id}_${suffix}` };
          if (typeof fanMod.value === 'string') {
            const resolved = evaluateFormula(fanMod.value, instanceContext, this.settings.language);
            fanMod = { ...fanMod, value: typeof resolved === 'number' ? resolved : parseFloat(String(resolved)) || 0 };
          }
          result.push({ modifier: fanMod, sourceInstanceId: instance.instanceId, sourceFeatureId: feature.id });
        }
        continue; // Already pushed fan-out entries; skip the default push below
      }

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

      // 1. Add the feature's own static tags
      for (const tag of feature.tags) {
        tagSet.add(tag);
      }

      // 2. Emit choice-derived sub-tags from choices with `choiceGrantedTagPrefix`.
      //    For each FeatureChoice that has a `choiceGrantedTagPrefix`, every selected
      //    item ID is combined with the prefix to produce a specific active tag.
      //
      //    Example: feat_weapon_focus with choiceId="weapon_choice", prefix="feat_weapon_focus_"
      //    and selection ["item_longbow"] → emits "feat_weapon_focus_item_longbow"
      //
      //    This allows prerequisite conditions on OTHER features to precisely check
      //    parameterized feat selections using the standard `has_tag` operator.
      if (feature.choices && instance.selections) {
        for (const choice of feature.choices) {
          if (!choice.choiceGrantedTagPrefix) continue;
          const selected = instance.selections[choice.choiceId];
          if (!selected) continue;
          for (const selectedId of selected) {
            if (selectedId) {
              tagSet.add(`${choice.choiceGrantedTagPrefix}${selectedId}`);
            }
          }
        }
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
