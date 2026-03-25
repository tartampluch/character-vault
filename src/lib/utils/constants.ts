/**
 * Shared constants for the D&D 3.5 engine.
 *
 * These are SRD structural invariants — the 6 core ability scores and their
 * standard 3-letter abbreviations. They are used by multiple UI components
 * (AbilityScores, PointBuyModal, RollStatsModal, AbilityScoresSummary)
 * and are centralised here to avoid duplication and ensure consistency.
 *
 * Note: The abbreviations are English-only by convention (STR, DEX, CON, INT,
 * WIS, CHA are universally recognised in D&D 3.5 regardless of locale).
 */

import type { ID } from '../types/primitives';

/**
 * The 6 main ability score pipeline IDs, in canonical D&D 3.5 order:
 * Strength → Constitution → Dexterity → Intelligence → Wisdom → Charisma.
 */
export const MAIN_ABILITY_IDS = [
  'stat_strength', 'stat_constitution', 'stat_dexterity',
  'stat_intelligence', 'stat_wisdom', 'stat_charisma',
] as const;

/**
 * Localized 3-letter abbreviations for each ability score.
 *
 * French D&D 3.5 abbreviations:
 *   FOR (Force), DEX (Dextérité), CON (Constitution),
 *   INT (Intelligence), SAG (Sagesse), CHA (Charisme)
 *
 * Use `getAbilityAbbr(id, language)` to retrieve the correct abbreviation.
 */
export const ABILITY_ABBRS: Readonly<Record<ID, { en: string; fr: string }>> = {
  stat_strength:     { en: 'STR', fr: 'FOR' },
  stat_dexterity:    { en: 'DEX', fr: 'DEX' },
  stat_constitution: { en: 'CON', fr: 'CON' },
  stat_intelligence: { en: 'INT', fr: 'INT' },
  stat_wisdom:       { en: 'WIS', fr: 'SAG' },
  stat_charisma:     { en: 'CHA', fr: 'CHA' },
};

/**
 * Returns the localized 3-letter abbreviation for an ability score ID.
 *
 * @param id       - The ability score ID (e.g. 'stat_strength').
 * @param language - The current UI language (any string; falls back to 'en' for
 *                   unknown languages since ABILITY_ABBRS only defines 'en' and 'fr').
 */
export function getAbilityAbbr(id: ID, language: string): string {
  const abbrs = ABILITY_ABBRS[id];
  if (!abbrs) return id.replace('stat_', '').toUpperCase().slice(0, 3);
  // Use the requested language if present; fall back to English.
  return (abbrs as Record<string, string>)[language] ?? abbrs['en'];
}
