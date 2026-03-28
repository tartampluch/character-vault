/**
 * @file engine.ts
 * @description Types exported by the GameEngine layer — shared between the engine
 * and UI components consuming derived data.
 *
 * Extracted from GameEngine.svelte.ts to keep the engine file focused on logic.
 */

import type { LocalizedString } from './i18n';
import type { ID } from './primitives';
import type { Modifier } from './pipeline';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Maximum times a pipeline can be re-evaluated in a single resolution cycle.
 * Prevents infinite loops from circular feature dependencies.
 * @see ARCHITECTURE.md section 9.1 for the protection strategy.
 */
export const MAX_RESOLUTION_DEPTH = 3;

// =============================================================================
// SKILL POINTS BUDGET
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
// SAVING THROW CONFIG
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

// =============================================================================
// WEAPON DEFAULTS
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

// =============================================================================
// FLAT MODIFIER ENTRY — used by the DAG flattening phase
// =============================================================================

/**
 * A modifier with context about which feature instance it came from.
 * Used internally by the DAG to trace modifier origins for debugging and breakdown display.
 */
export interface FlatModifierEntry {
  /** The resolved Modifier with numeric value (string formulas already evaluated). */
  modifier: Modifier;
  /** The ID of the feature instance that granted this modifier. */
  sourceInstanceId: ID;
  /** The ID of the feature definition that contains this modifier. */
  sourceFeatureId: ID;
}
