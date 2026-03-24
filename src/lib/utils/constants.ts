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
 * Strength → Dexterity → Constitution → Intelligence → Wisdom → Charisma.
 */
export const MAIN_ABILITY_IDS = [
  'stat_strength', 'stat_dexterity', 'stat_constitution',
  'stat_intelligence', 'stat_wisdom', 'stat_charisma',
] as const;

/**
 * Standard 3-letter abbreviations for each ability score.
 * These are universally used in D&D 3.5 (even in non-English locales).
 */
export const ABILITY_ABBRS: Readonly<Record<ID, string>> = {
  stat_strength: 'STR', stat_dexterity: 'DEX', stat_constitution: 'CON',
  stat_intelligence: 'INT', stat_wisdom: 'WIS', stat_charisma: 'CHA',
};
