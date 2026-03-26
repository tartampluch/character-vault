/**
 * Shared constants for the D&D 3.5 engine.
 *
 * These are SRD structural invariants — the 6 core ability scores and their
 * standard 3-letter abbreviations, plus engine-internal localized labels.
 * They are used by multiple engine files and UI components
 * (AbilityScores, PointBuyModal, RollStatsModal, AbilityScoresSummary, GameEngine).
 *
 * WHY A SEPARATE CONSTANTS FILE?
 *   Centralising these values prevents magic strings from appearing in engine code.
 *   Any developer adding a new language adds translations here (and in the locale
 *   JSON) rather than searching the codebase for hardcoded strings.
 *
 * Note: The abbreviations are English-only by convention (STR, DEX, CON, INT,
 * WIS, CHA are universally recognised in D&D 3.5 regardless of locale).
 */

import type { ID } from '../types/primitives';
import type { LocalizedString } from '../types/i18n';

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

// =============================================================================
// ENGINE-INTERNAL LOCALIZED LABELS
// =============================================================================

/**
 * Localized display prefix for auto-generated skill synergy modifiers.
 *
 * WHY HERE AND NOT IN ui-strings.ts?
 *   `ui-strings.ts` provides single-language strings for the current UI locale.
 *   The GameEngine stores modifier `sourceName` as a `LocalizedString` (all
 *   languages at once) so that the displayed language can change without
 *   re-running the DAG. This constant provides the localized "Synergy" word
 *   so the engine never hard-codes language-specific text.
 *
 * ADDING A NEW LANGUAGE:
 *   Add a new key matching the language code (e.g., `de: 'Synergie'`).
 *   The engine uses `translateString(SYNERGY_SOURCE_LABEL, lang)` at display
 *   time, so the new language will appear automatically.
 *
 * @example  sourceName built by the engine:
 *   `{ en: 'Synergy (Diplomacy)', fr: 'Synergie (Diplomatie)' }`
 */
export const SYNERGY_SOURCE_LABEL: LocalizedString = {
  en: 'Synergy',
  fr: 'Synergie',
};

// =============================================================================
// ALIGNMENT DEFINITIONS
// =============================================================================

/**
 * The 9 standard D&D 3.5 alignments, each with a stable internal ID and a
 * localized label.
 *
 * WHY IN CONSTANTS (not hardcoded in BasicInfo.svelte)?
 *   Alignment names are D&D game content. Centralizing them here enforces the
 *   zero-hardcoding rule (ARCHITECTURE.md §6): no D&D game terms may be embedded
 *   directly in `.svelte` component files. Components import and translate these
 *   via `engine.t()` at render time.
 *
 *   Ideally these would live in JSON rule files so GMs can override them.
 *   This constant serves as a typed, centralized fallback until a
 *   `config_alignments` rule table is added to the D20 SRD data pack.
 *
 * NOTE ON IDENTIFIERS:
 *   The IDs (e.g., `alignment_lawful_good`) are also used as feature IDs when
 *   the alignment is injected as a condition feature instance in the engine.
 *   They MUST remain stable across sessions.
 */
// =============================================================================
// SYSTEM FEATURE IDs — Auto-dispatched condition and pseudo-item identifiers
// =============================================================================

/**
 * Feature ID for the encumbered condition (defined in rule files).
 *
 * WHY A CONSTANT (not inlined in Encumbrance.svelte):
 *   Svelte components must not hardcode game content IDs (zero-hardcoding rule,
 *   ARCHITECTURE.md §6). Centralising here makes renames safe: update once here
 *   and all consumers follow automatically.
 */
export const CONDITION_ENCUMBERED_FEATURE_ID = 'condition_encumbered' as const;

/**
 * Instance ID for the auto-dispatched encumbered condition.
 *
 * Using a stable, predictable ID allows idempotent add/remove in
 * Encumbrance.svelte: we can safely call addFeature / removeFeature without
 * accidentally creating duplicate instances.
 */
export const CONDITION_ENCUMBERED_INSTANCE_ID = 'afi_condition_encumbered_auto' as const;

// =============================================================================
// PSIONIC ITEM CONSTANTS
// =============================================================================

/**
 * Standard maximum charge count for a Dorje (psionic wand equivalent).
 *
 * D&D 3.5 SRD (Expanded Psionics Handbook, p. 218):
 *   "A dorje is created with 50 charges."
 *
 * WHY A CONSTANT (not inlined in PsionicItemCard.svelte):
 *   Game constants must not appear in .svelte files (zero-hardcoding rule,
 *   ARCHITECTURE.md §6). Centralising here means a GM-extended rule set that
 *   changes the standard charge count only needs updating in one place.
 */
export const DORJE_MAX_CHARGES = 50 as const;

// =============================================================================
// CUSTOM DR PREFIX
// =============================================================================

/**
 * Feature ID prefix for custom Damage Reduction entries added by the GM at runtime.
 *
 * The DamageReduction component queries active features whose IDs start with this
 * prefix to find GM-added DR entries (as opposed to class/racial DR from rule files).
 */
export const DR_CUSTOM_FEATURE_PREFIX = 'dr_custom_' as const;

export const ALIGNMENTS: ReadonlyArray<{ id: string; label: LocalizedString }> = [
  { id: 'alignment_lawful_good',     label: { en: 'Lawful Good',     fr: 'Loyal Bon'         } },
  { id: 'alignment_neutral_good',    label: { en: 'Neutral Good',    fr: 'Neutre Bon'        } },
  { id: 'alignment_chaotic_good',    label: { en: 'Chaotic Good',    fr: 'Chaotique Bon'     } },
  { id: 'alignment_lawful_neutral',  label: { en: 'Lawful Neutral',  fr: 'Loyal Neutre'      } },
  { id: 'alignment_true_neutral',    label: { en: 'True Neutral',    fr: 'Vrai Neutre'       } },
  { id: 'alignment_chaotic_neutral', label: { en: 'Chaotic Neutral', fr: 'Chaotique Neutre'  } },
  { id: 'alignment_lawful_evil',     label: { en: 'Lawful Evil',     fr: 'Loyal Mauvais'     } },
  { id: 'alignment_neutral_evil',    label: { en: 'Neutral Evil',    fr: 'Neutre Mauvais'    } },
  { id: 'alignment_chaotic_evil',    label: { en: 'Chaotic Evil',    fr: 'Chaotique Mauvais' } },
] as const;
