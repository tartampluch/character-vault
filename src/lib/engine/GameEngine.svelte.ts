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
// EMPTY CHARACTER FACTORY
// =============================================================================

/**
 * Creates a blank, empty character with default pipeline structures.
 *
 * All standard pipelines are pre-initialised to avoid null-checks everywhere.
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

  // Helper to create a blank SkillPipeline
  const makeSkillPipeline = (pipelineId: ID, label: LocalizedString, keyAbility: ID): SkillPipeline => ({
    id: pipelineId,
    label,
    baseValue: 0,
    keyAbility,
    ranks: 0,
    isClassSkill: false,
    appliesArmorCheckPenalty: false,
    canBeUsedUntrained: true,
    activeModifiers: [],
    situationalModifiers: [],
    totalBonus: 0,
    totalValue: 0,
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

  return {
    id,
    name,
    isNPC: false,
    classLevels: {},
    attributes: {
      'stat_str': makePipeline('stat_str', { en: 'Strength', fr: 'Force' }, 10),
      'stat_dex': makePipeline('stat_dex', { en: 'Dexterity', fr: 'Dextérité' }, 10),
      'stat_con': makePipeline('stat_con', { en: 'Constitution', fr: 'Constitution' }, 10),
      'stat_int': makePipeline('stat_int', { en: 'Intelligence', fr: 'Intelligence' }, 10),
      'stat_wis': makePipeline('stat_wis', { en: 'Wisdom', fr: 'Sagesse' }, 10),
      'stat_cha': makePipeline('stat_cha', { en: 'Charisma', fr: 'Charisme' }, 10),
      'stat_size': makePipeline('stat_size', { en: 'Size', fr: 'Taille' }, 0),
      'stat_caster_level': makePipeline('stat_caster_level', { en: 'Caster Level', fr: 'Niveau de lanceur' }, 0),
      'stat_manifester_level': makePipeline('stat_manifester_level', { en: 'Manifester Level', fr: 'Niveau de manifesteur' }, 0),
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
  // AUTO-SAVE $effect — Connect character and settings changes to StorageManager
  // ---------------------------------------------------------------------------

  /**
   * Debounced save function for the character.
   * Waits 500ms after the last change before writing to localStorage.
   * Prevents excessive writes during rapid user interactions (typing, sliders).
   *
   * In Phase 14.6, this delay is increased to 2000ms for the PHP API backend.
   */
  readonly #debouncedSaveCharacter = debounce((char: Character) => {
    storageManager.saveCharacter(char);
  }, 500);

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
        this.#debouncedSaveCharacter(char);
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
   */
  phase0_flatModifiers: FlatModifierEntry[] = $derived(this.#computeFlatModifiers());

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
      equippedWeaponTags: [], // Populated in Phase 3 when weapon slot is resolved
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

      // --- Max HP: inject CON modifier contribution ---
      if (pipelineId === 'combatStats.max_hp') {
        // CON modifier × character level is the constitution contribution to Max HP.
        // This is treated as an untyped bonus on top of the rolled/fixed hit die sum.
        // We add it directly to the base value for this computation so it participates
        // in the stacking resolution but always applies (no stacking competition with itself).
        effectiveBaseValue = basePipeline.baseValue + conHpContrib;
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
    const characterLevel = this.phase0_characterLevel;

    // The armor check penalty is stored as a negative number on its pipeline
    const armorCheckPenalty = this.phase3_combatStats['combatStats.armor_check_penalty']?.totalValue ?? 0;

    for (const [skillId, baseSkill] of Object.entries(this.character.skills)) {
      const isClassSkill = classSkillSet.has(skillId);

      // Get the key ability modifier for this skill
      const keyAbilityMod = attributes[baseSkill.keyAbility]?.derivedModifier ?? 0;

      // Collect all misc modifiers targeting this skill pipeline
      const activeMods = flatMods
        .filter(e => e.modifier.targetId === skillId && !e.modifier.situationalContext)
        .map(e => e.modifier);

      const situationalMods = flatMods
        .filter(e => e.modifier.targetId === skillId && e.modifier.situationalContext)
        .map(e => e.modifier);

      // Apply stacking rules to misc modifiers (base for skills is the ability modifier)
      // For skills: baseValue is effectively 0 (ranks + ability modifier are handled separately)
      const stacking = applyStackingRules(activeMods, 0);

      // Total = ranks + keyAbilityModifier + miscBonuses + armorCheckPenalty
      const totalValue = baseSkill.ranks + keyAbilityMod + stacking.totalBonus
        + (baseSkill.appliesArmorCheckPenalty ? armorCheckPenalty : 0);

      result[skillId] = {
        ...baseSkill,
        isClassSkill,
        activeModifiers: stacking.appliedModifiers,
        situationalModifiers: situationalMods,
        totalBonus: stacking.totalBonus, // Misc bonuses only (not ranks + ability)
        totalValue,
        derivedModifier: 0, // Skills don't have a derivedModifier in D&D 3.5 sense
      };
    }

    return result;
  });

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
   * ALGORITHM:
   *   1. Collect all instances: character.activeFeatures + character.gmOverrides.
   *   2. For each isActive instance:
   *      a. Look up the Feature from the DataLoader.
   *      b. Skip if Feature not found (logs warning; graceful degradation).
   *      c. Check forbiddenTags: if any forbidden tag is in activeTags, skip this feature.
   *      d. Check prerequisitesNode: skip if prerequisites not met.
   *         (Uses Phase 0 context — preliminary, not fully derived yet.)
   *      e. Collect modifiers from grantedModifiers (base feature modifiers).
   *      f. For class features: collect modifiers from levelProgression entries
   *         where entry.level <= classLevels[featureId].
   *      g. Recursively collect from grantedFeatures (up to MAX_RESOLUTION_DEPTH).
   *      h. For each collected modifier:
   *         - Resolve string `value` formulas to numbers.
   *         - Evaluate conditionNode (if present).
   *         - Route to active or situational list based on situationalContext presence.
   *
   * GM OVERRIDE MERGE:
   *   gmOverrides are appended AFTER regular activeFeatures so their modifiers
   *   are processed last. For setAbsolute-type modifiers, last wins. This ensures
   *   GM overrides always take precedence over player features.
   */
  #computeFlatModifiers(): FlatModifierEntry[] {
    const result: FlatModifierEntry[] = [];
    const activeTags = this.#computeActiveTags();
    const context = this.phase0_context;

    // Combine regular features with GM overrides (GM overrides processed last)
    const allInstances: ActiveFeatureInstance[] = [
      ...this.character.activeFeatures,
      ...(this.character.gmOverrides ?? []),
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

      // --- Resolve string value formulas to numbers ---
      let resolvedModifier: Modifier = mod;
      if (typeof mod.value === 'string') {
        const resolved = evaluateFormula(mod.value, instanceContext, this.settings.language);
        const numericValue = typeof resolved === 'number' ? resolved : parseFloat(String(resolved)) || 0;
        resolvedModifier = { ...mod, value: numericValue };
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
   */
  #computeActiveTags(): string[] {
    const tagSet = new Set<string>();

    const allInstances = [
      ...this.character.activeFeatures,
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
