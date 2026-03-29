/**
 * @file ruleConstants.ts
 * @description D&D 3.5 rule constants: pipeline IDs, save constants, alignments.
 *
 * Extracted from constants.ts. Import from constants.ts (barrel) for backward compatibility.
 */

import { UI_STRINGS, buildLocalizedString } from '../i18n/ui-strings';

/** UI string key for the "Synergy" modifier source label. */
export const SYNERGY_SOURCE_LABEL_KEY = 'modifier.synergy' as const;

/**
 * @deprecated Use `SYNERGY_SOURCE_LABEL_KEY` with `buildLocalizedString()`.
 * @internal
 */
export const SYNERGY_SOURCE_LABEL = {
  get en() { return UI_STRINGS[SYNERGY_SOURCE_LABEL_KEY] as string; },
  get fr() { return buildLocalizedString(SYNERGY_SOURCE_LABEL_KEY).fr ?? UI_STRINGS[SYNERGY_SOURCE_LABEL_KEY] as string; },
} as const;

/** Feature ID for the encumbered condition (defined in rule files). */
export const CONDITION_ENCUMBERED_FEATURE_ID = 'condition_encumbered' as const;
/** Instance ID for the auto-dispatched encumbered condition (stable, predictable for idempotent add/remove). */
export const CONDITION_ENCUMBERED_INSTANCE_ID = 'afi_condition_encumbered_auto' as const;

/** Maximum allowed class level per class in D&D 3.5 SRD (1–20). */
export const MAX_CLASS_LEVEL = 20 as const;

/** Canonical pipeline ID for the Base Attack Bonus pipeline. */
export const BAB_PIPELINE_ID = 'combatStats.base_attack_bonus' as const;

/** Canonical pipeline IDs for the three D&D 3.5 saving throws. */
export const SAVE_FORT_PIPELINE_ID    = 'saves.fortitude' as const;
export const SAVE_REFLEX_PIPELINE_ID  = 'saves.reflex' as const;
export const SAVE_WILL_PIPELINE_ID    = 'saves.will' as const;

/** The 9 standard D&D 3.5 alignments with their stable IDs and ui-strings translation keys. */
export const ALIGNMENTS: ReadonlyArray<{ id: string; ui_key: string }> = [
  { id: 'alignment_lawful_good',     ui_key: 'alignment.lawful_good'     },
  { id: 'alignment_neutral_good',    ui_key: 'alignment.neutral_good'    },
  { id: 'alignment_chaotic_good',    ui_key: 'alignment.chaotic_good'    },
  { id: 'alignment_lawful_neutral',  ui_key: 'alignment.lawful_neutral'  },
  { id: 'alignment_true_neutral',    ui_key: 'alignment.true_neutral'    },
  { id: 'alignment_chaotic_neutral', ui_key: 'alignment.chaotic_neutral' },
  { id: 'alignment_lawful_evil',     ui_key: 'alignment.lawful_evil'     },
  { id: 'alignment_neutral_evil',    ui_key: 'alignment.neutral_evil'    },
  { id: 'alignment_chaotic_evil',    ui_key: 'alignment.chaotic_evil'    },
] as const;

/** Pipeline / resource pool ID for Vitality Points (V/WP variant rule). */
export const RESOURCE_VITALITY_POINTS_ID = 'resources.vitality_points' as const;
/** Pipeline / resource pool ID for Wound Points (V/WP variant rule). */
export const RESOURCE_WOUND_POINTS_ID = 'resources.wound_points' as const;
/** Pipeline / resource pool ID for standard Hit Points. */
export const RESOURCE_HP_ID = 'resources.hp' as const;

/** Pipeline ID for the Max Vitality stat (V/WP variant). */
export const COMBAT_STAT_MAX_VITALITY_ID = 'combatStats.max_vitality' as const;
/** Pipeline ID for the total Attack Bonus. */
export const COMBAT_STAT_ATTACK_BONUS_ID = 'combatStats.attack_bonus' as const;
/** Pipeline ID for Armor Class (Normal). */
export const COMBAT_STAT_AC_NORMAL_ID = 'combatStats.ac_normal' as const;
/** Pipeline ID for Touch Armor Class. */
export const COMBAT_STAT_AC_TOUCH_ID = 'combatStats.ac_touch' as const;
/** Pipeline ID for Flat-Footed Armor Class. */
export const COMBAT_STAT_AC_FLAT_FOOTED_ID = 'combatStats.ac_flat_footed' as const;
/** Pipeline ID for Maximum Dexterity Bonus to AC. */
export const COMBAT_STAT_MAX_DEX_BONUS_ID = 'combatStats.max_dexterity_bonus' as const;
/** Pipeline ID for Initiative. */
export const COMBAT_STAT_INITIATIVE_ID = 'combatStats.initiative' as const;
/** Pipeline ID for Grapple Check. */
export const COMBAT_STAT_GRAPPLE_ID = 'combatStats.grapple' as const;
/** Pipeline ID for Fortification percentage. */
export const COMBAT_STAT_FORTIFICATION_ID = 'combatStats.fortification' as const;
/** Pipeline ID for Arcane Spell Failure percentage. */
export const COMBAT_STAT_ARCANE_SPELL_FAILURE_ID = 'combatStats.arcane_spell_failure' as const;
/** Pipeline ID for Damage Reduction. */
export const COMBAT_STAT_DAMAGE_REDUCTION_ID = 'combatStats.damage_reduction' as const;
/** Pipeline ID for Land movement speed. */
export const COMBAT_STAT_SPEED_LAND_ID = 'combatStats.speed_land' as const;
/** Pipeline ID for Burrow movement speed. */
export const COMBAT_STAT_SPEED_BURROW_ID = 'combatStats.speed_burrow' as const;
/** Pipeline ID for Climb movement speed. */
export const COMBAT_STAT_SPEED_CLIMB_ID = 'combatStats.speed_climb' as const;
/** Pipeline ID for Fly movement speed. */
export const COMBAT_STAT_SPEED_FLY_ID = 'combatStats.speed_fly' as const;
/** Pipeline ID for Swim movement speed. */
export const COMBAT_STAT_SPEED_SWIM_ID = 'combatStats.speed_swim' as const;
/** Pipeline ID for Fire energy resistance. */
export const COMBAT_STAT_RESIST_FIRE_ID = 'combatStats.resist_fire' as const;
/** Pipeline ID for Cold energy resistance. */
export const COMBAT_STAT_RESIST_COLD_ID = 'combatStats.resist_cold' as const;
/** Pipeline ID for Acid energy resistance. */
export const COMBAT_STAT_RESIST_ACID_ID = 'combatStats.resist_acid' as const;
/** Pipeline ID for Electricity energy resistance. */
export const COMBAT_STAT_RESIST_ELECTRICITY_ID = 'combatStats.resist_electricity' as const;
/** Pipeline ID for Sonic energy resistance. */
export const COMBAT_STAT_RESIST_SONIC_ID = 'combatStats.resist_sonic' as const;
/** Pipeline ID for Spell Resistance. */
export const COMBAT_STAT_SPELL_RESISTANCE_ID = 'combatStats.spell_resistance' as const;
/** Pipeline ID for Power Resistance (psionic equivalent of SR). */
export const COMBAT_STAT_POWER_RESISTANCE_ID = 'combatStats.power_resistance' as const;
