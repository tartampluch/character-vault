/**
 * @file abilityConstants.ts
 * @description Ability score constants: core IDs, abbreviations, bounds.
 *
 * Extracted from constants.ts. Import from constants.ts (barrel) for backward compatibility.
 */

import type { ID } from '../types/primitives';
import { ui, UI_STRINGS } from '../i18n/ui-strings';

/**
 * The 6 main ability score pipeline IDs, in canonical D&D 3.5 order:
 * Strength → Constitution → Dexterity → Intelligence → Wisdom → Charisma.
 */
export const MAIN_ABILITY_IDS = [
  'stat_strength', 'stat_constitution', 'stat_dexterity',
  'stat_intelligence', 'stat_wisdom', 'stat_charisma',
] as const;

/**
 * English-only fallback abbreviations for ability scores.
 * Prefer `getAbilityAbbr(id, language)` which uses the locale system.
 */
export const ABILITY_ABBRS: Readonly<Record<ID, { en: string }>> = {
  stat_strength:     { en: 'STR' },
  stat_dexterity:    { en: 'DEX' },
  stat_constitution: { en: 'CON' },
  stat_intelligence: { en: 'INT' },
  stat_wisdom:       { en: 'WIS' },
  stat_charisma:     { en: 'CHA' },
};

/**
 * Returns the localized 3-letter abbreviation for an ability score ID.
 * Resolution: locale JSON → UI_STRINGS English baseline → derived from ID.
 */
export function getAbilityAbbr(id: ID, language: string): string {
  const uiKey = `ability_abbr.${id}`;
  const fromLocale = ui(uiKey, language);
  if (fromLocale !== uiKey) return fromLocale;
  return id.replace(/^stat_/, '').toUpperCase().slice(0, 3);
}

/** Minimum allowed base value for an ability score input (D&D 3.5 SRD). */
export const ABILITY_SCORE_MIN = 1 as const;

/** Maximum allowed base value entered directly in the ability score input. */
export const ABILITY_SCORE_MAX = 30 as const;

/**
 * Namespace prefix for ability-score pipelines (e.g. `attributes.stat_strength`).
 * Centralised per the zero-hardcoding rule (ARCHITECTURE.md §6).
 */
export const ATTRIBUTE_PIPELINE_NAMESPACE = 'attributes.' as const;

/**
 * All known @-paths from ARCHITECTURE.md §4.3.
 * Used as a `<datalist>` autocomplete source in `ConditionNodeBuilder.svelte`.
 */
export const CONDITION_NODE_KNOWN_PATHS: readonly string[] = [
  // Ability scores
  '@attributes.stat_strength.totalValue',
  '@attributes.stat_strength.derivedModifier',
  '@attributes.stat_strength.baseValue',
  '@attributes.stat_dexterity.totalValue',
  '@attributes.stat_dexterity.derivedModifier',
  '@attributes.stat_dexterity.baseValue',
  '@attributes.stat_constitution.totalValue',
  '@attributes.stat_constitution.derivedModifier',
  '@attributes.stat_constitution.baseValue',
  '@attributes.stat_intelligence.totalValue',
  '@attributes.stat_intelligence.derivedModifier',
  '@attributes.stat_intelligence.baseValue',
  '@attributes.stat_wisdom.totalValue',
  '@attributes.stat_wisdom.derivedModifier',
  '@attributes.stat_wisdom.baseValue',
  '@attributes.stat_charisma.totalValue',
  '@attributes.stat_charisma.derivedModifier',
  '@attributes.stat_charisma.baseValue',
  // Combat
  '@combatStats.base_attack_bonus.totalValue',
  '@combatStats.ac_normal.totalValue',
  '@combatStats.ac_touch.totalValue',
  '@combatStats.ac_flat_footed.totalValue',
  '@combatStats.initiative.totalValue',
  '@combatStats.grapple.totalValue',
  '@combatStats.max_hp.totalValue',
  '@combatStats.speed_land.totalValue',
  // Saves
  '@saves.fortitude.totalValue',
  '@saves.reflex.totalValue',
  '@saves.will.totalValue',
  // Level
  '@characterLevel',
  '@eclForXp',
  // Tags
  '@activeTags',
  '@equippedWeaponTags',
  '@targetTags',
  // Skills (common SRD skills)
  '@skills.skill_balance.ranks',      '@skills.skill_balance.totalValue',
  '@skills.skill_bluff.ranks',        '@skills.skill_bluff.totalValue',
  '@skills.skill_climb.ranks',        '@skills.skill_climb.totalValue',
  '@skills.skill_concentration.ranks','@skills.skill_concentration.totalValue',
  '@skills.skill_diplomacy.ranks',    '@skills.skill_diplomacy.totalValue',
  '@skills.skill_disable_device.ranks',
  '@skills.skill_disguise.ranks',
  '@skills.skill_escape_artist.ranks',
  '@skills.skill_handle_animal.ranks',
  '@skills.skill_heal.ranks',         '@skills.skill_heal.totalValue',
  '@skills.skill_hide.ranks',         '@skills.skill_hide.totalValue',
  '@skills.skill_intimidate.ranks',   '@skills.skill_intimidate.totalValue',
  '@skills.skill_jump.ranks',         '@skills.skill_jump.totalValue',
  '@skills.skill_knowledge_arcana.ranks',
  '@skills.skill_knowledge_dungeoneering.ranks',
  '@skills.skill_knowledge_history.ranks',
  '@skills.skill_knowledge_local.ranks',
  '@skills.skill_knowledge_nature.ranks',
  '@skills.skill_knowledge_planes.ranks',
  '@skills.skill_knowledge_religion.ranks',
  '@skills.skill_listen.ranks',       '@skills.skill_listen.totalValue',
  '@skills.skill_move_silently.ranks',
  '@skills.skill_open_lock.ranks',
  '@skills.skill_perform.ranks',
  '@skills.skill_ride.ranks',
  '@skills.skill_search.ranks',
  '@skills.skill_sense_motive.ranks',
  '@skills.skill_sleight_of_hand.ranks',
  '@skills.skill_spellcraft.ranks',   '@skills.skill_spellcraft.totalValue',
  '@skills.skill_spot.ranks',         '@skills.skill_spot.totalValue',
  '@skills.skill_survival.ranks',     '@skills.skill_survival.totalValue',
  '@skills.skill_swim.ranks',
  '@skills.skill_tumble.ranks',       '@skills.skill_tumble.totalValue',
  '@skills.skill_use_magic_device.ranks',
] as const;
