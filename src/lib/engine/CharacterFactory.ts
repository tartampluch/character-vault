/**
 * @file CharacterFactory.ts
 * @description Pure factory functions for creating blank characters and skill pipelines.
 *
 * Extracted from GameEngine.svelte.ts so that these utilities can be imported
 * without pulling in the full reactive engine.
 *
 * @see GameEngine.svelte.ts for the reactive engine that uses these factories.
 */

import type { Character } from '../types/character';
import type { StatisticPipeline, SkillPipeline, ResourcePool } from '../types/pipeline';
import type { LocalizedString } from '../types/i18n';
import type { ID } from '../types/primitives';
import { dataLoader } from './DataLoader';

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
export function normaliseModifierTargetId(targetId: ID): ID {
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
    // Default to cross-class cost (2); Phase 4 overrides this to 1 when isClassSkill is set.
    costPerRank: 2,
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
    'stat_strength':         { en: 'stat_strength'         },
    'stat_dexterity':        { en: 'stat_dexterity'        },
    'stat_constitution':     { en: 'stat_constitution'     },
    'stat_intelligence':     { en: 'stat_intelligence'     },
    'stat_wisdom':           { en: 'stat_wisdom'           },
    'stat_charisma':         { en: 'stat_charisma'         },
    'stat_size':             { en: 'stat_size'             },
    'stat_caster_level':     { en: 'stat_caster_level'     },
    'stat_manifester_level': { en: 'stat_manifester_level' },
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
      // ZERO-HARDCODING COMPLIANCE (PROGRESS.md Guideline 6):
      //   Bootstrap labels use pipeline IDs (e.g. 'combatStats.ac_normal') instead of
      //   D&D-specific display names (e.g. 'Armor Class'). Human-readable names are
      //   loaded from `config_combat_stat_definitions` in the JSON rule files and replace
      //   these placeholders as soon as the DataLoader finishes loading — exactly the
      //   same pattern used for attribute labels and save labels. Players never see
      //   the pipeline-ID fallbacks in practice; they are only visible during the
      //   ~100 ms bootstrap window before rule sources are loaded.
      'combatStats.ac_normal':          makePipeline('combatStats.ac_normal',          { en: 'combatStats.ac_normal'          }, 10),
      'combatStats.ac_touch':           makePipeline('combatStats.ac_touch',           { en: 'combatStats.ac_touch'           }, 10),
      'combatStats.ac_flat_footed':     makePipeline('combatStats.ac_flat_footed',     { en: 'combatStats.ac_flat_footed'     }, 10),
      'combatStats.base_attack_bonus':  makePipeline('combatStats.base_attack_bonus',  { en: 'combatStats.base_attack_bonus'  }, 0),
      'combatStats.initiative':         makePipeline('combatStats.initiative',         { en: 'combatStats.initiative'         }, 0),
      'combatStats.grapple':            makePipeline('combatStats.grapple',            { en: 'combatStats.grapple'            }, 0),
      // Speed pipeline base values are read from `config_movement_defaults`.
      // The fallback values here are the D&D 3.5 SRD defaults used during
      // bootstrap (before the DataLoader has loaded the config table).
      // Races/creatures override these defaults via "base" or "setAbsolute" modifiers.
      'combatStats.speed_land':   makePipeline('combatStats.speed_land',   { en: 'combatStats.speed_land'   }, getSpeedDefault('combatStats.speed_land',   30)),
      'combatStats.speed_burrow': makePipeline('combatStats.speed_burrow', { en: 'combatStats.speed_burrow' }, getSpeedDefault('combatStats.speed_burrow',  0)),
      'combatStats.speed_climb':  makePipeline('combatStats.speed_climb',  { en: 'combatStats.speed_climb'  }, getSpeedDefault('combatStats.speed_climb',   0)),
      'combatStats.speed_fly':    makePipeline('combatStats.speed_fly',    { en: 'combatStats.speed_fly'    }, getSpeedDefault('combatStats.speed_fly',     0)),
      'combatStats.speed_swim':   makePipeline('combatStats.speed_swim',   { en: 'combatStats.speed_swim'   }, getSpeedDefault('combatStats.speed_swim',    0)),
      'combatStats.armor_check_penalty': makePipeline('combatStats.armor_check_penalty', { en: 'combatStats.armor_check_penalty' }, 0),
      'combatStats.max_hp': makePipeline('combatStats.max_hp', { en: 'combatStats.max_hp' }, 0),

      // --- FORTIFICATION (SRD: Magic Armor special ability) ---
      // Percentage chance to negate a critical hit or sneak attack.
      // Light = 25%, Moderate = 75%, Heavy = 100%.
      'combatStats.fortification': makePipeline('combatStats.fortification', { en: 'combatStats.fortification' }, 0),

      // --- ARCANE SPELL FAILURE (SRD: Armor & Shields) ---
      // Percentage chance that an arcane spell fails when cast while wearing armor.
      'combatStats.arcane_spell_failure': makePipeline('combatStats.arcane_spell_failure', { en: 'combatStats.arcane_spell_failure' }, 0),

      // --- MAX DEX BONUS TO AC (`combatStats.max_dexterity_bonus`) ---
      // BASE VALUE = 99 means "no restriction — full DEX applies to AC".
      // @see ARCHITECTURE.md section 4.17 — Max DEX Bonus pipeline reference
      'combatStats.max_dexterity_bonus': makePipeline('combatStats.max_dexterity_bonus', { en: 'combatStats.max_dexterity_bonus' }, 99),

      // --- EQUIPMENT SLOT PIPELINES (Phase 3.1 — ARCHITECTURE.md §3.1) ---
      // One pipeline per equipment body slot. `baseValue` = default count for a
      // standard Medium humanoid. Labels use pipeline IDs during bootstrap.
      'slots.head':      makePipeline('slots.head',      { en: 'slots.head'      }, 1),
      'slots.eyes':      makePipeline('slots.eyes',      { en: 'slots.eyes'      }, 1),
      'slots.neck':      makePipeline('slots.neck',      { en: 'slots.neck'      }, 1),
      'slots.torso':     makePipeline('slots.torso',     { en: 'slots.torso'     }, 1),
      'slots.body':      makePipeline('slots.body',      { en: 'slots.body'      }, 1),
      'slots.waist':     makePipeline('slots.waist',     { en: 'slots.waist'     }, 1),
      'slots.shoulders': makePipeline('slots.shoulders', { en: 'slots.shoulders' }, 1),
      'slots.arms':      makePipeline('slots.arms',      { en: 'slots.arms'      }, 1),
      'slots.hands':     makePipeline('slots.hands',     { en: 'slots.hands'     }, 1),
      // D&D 3.5 SRD standard: a humanoid has two ring slots (one per hand).
      'slots.ring':      makePipeline('slots.ring',      { en: 'slots.ring'      }, 2),
      'slots.feet':      makePipeline('slots.feet',      { en: 'slots.feet'      }, 1),
      'slots.main_hand': makePipeline('slots.main_hand', { en: 'slots.main_hand' }, 1),
      'slots.off_hand':  makePipeline('slots.off_hand',  { en: 'slots.off_hand'  }, 1),
    },
    saves: {
      // Bootstrap-phase labels use pipeline IDs to comply with PROGRESS.md Guideline 6.
      'saves.fortitude': makePipeline('saves.fortitude', { en: 'saves.fortitude' }, 0),
      'saves.reflex':    makePipeline('saves.reflex',    { en: 'saves.reflex'    }, 0),
      'saves.will':      makePipeline('saves.will',      { en: 'saves.will'      }, 0),
    },
    skills: {},
    // minimumSkillRanks is ABSENT for new characters — all ranks can be freely adjusted
    // during character creation. Call engine.lockAllSkillRanks() after each level-up commit
    // to lock in the current ranks as the irreducible minimum.
    // @see Character.minimumSkillRanks and GameEngine.lockSkillRanksMin()
    resources: {
      'resources.hp': makeResource('resources.hp', { en: 'Hit Points' }, 'combatStats.max_hp'),
    },
    activeFeatures: [],
    linkedEntities: [],
  };
}
