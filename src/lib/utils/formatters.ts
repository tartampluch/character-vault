/**
 * @file formatters.ts
 * @description Localization helpers and unit conversion utilities.
 *
 * Design philosophy:
 *   ALL game data is stored in the engine using the SRD reference units:
 *     - Distances: feet (ft)
 *     - Weights:   pounds (lb)
 *   These values are NEVER converted until the display layer.
 *
 *   This file is the ONLY place where unit conversion happens. Any component or
 *   utility that needs to display a distance or weight to the user must call
 *   these functions. The result changes automatically when the active language
 *   changes, because all formatting reads from the `I18N_CONFIG` constant.
 *
 *   PURE FUNCTIONS:
 *   All functions in this file are pure (no side effects, no state).
 *   They receive the `CampaignSettings` (or just the language) as a parameter
 *   so that they can be called in:
 *     - The GameEngine's helper methods (Phase 3.1)
 *     - The Math Parser's pipe handlers (Phase 2.2)
 *     - Svelte component templates (Phase 8+)
 *     - Unit tests (Phase 17.1)
 *
 * @see src/lib/types/i18n.ts       for LocalizedString, SupportedLanguage, I18N_CONFIG
 * @see src/lib/types/settings.ts   for CampaignSettings
 * @see src/lib/utils/mathParser.ts (Phase 2.2) for |distance and |weight pipe handling
 */

import { I18N_CONFIG } from '../types/i18n';
import type { LocalizedString, SupportedLanguage } from '../types/i18n';
import type { CampaignSettings } from '../types/settings';

// =============================================================================
// LOCALIZED STRING RESOLUTION
// =============================================================================

/**
 * Resolves a `LocalizedString` to a plain string for the given language.
 *
 * FALLBACK STRATEGY:
 *   1. Try the requested language  (`textObj[lang]`)
 *   2. Fall back to English        (`textObj["en"]`)
 *   3. Fall back to the first key  (`Object.values(textObj)[0]`)
 *   4. Return a sentinel string    ("??") to visually flag missing translations
 *
 * This strategy ensures:
 *   - Community content in a single language still works in other language UIs.
 *   - Missing translations are visually obvious in the UI (not silent empty strings).
 *   - The engine never crashes on a missing translation key.
 *
 * @param textObj  - A `LocalizedString` record or a plain string (returned as-is).
 * @param lang     - The target display language from `CampaignSettings.language`.
 * @returns The localised string for the requested language, with fallbacks.
 *
 * @example
 * const label: LocalizedString = { en: "Strength", fr: "Force" };
 * t(label, "fr") // → "Force"
 * t(label, "de") // → "Strength" (falls back to English)
 * t("raw string", "fr") // → "raw string" (pass-through for plain strings)
 */
export function t(textObj: LocalizedString | string, lang: SupportedLanguage): string {
  // --- Pass-through for plain strings (already translated or non-translated labels) ---
  if (typeof textObj === 'string') return textObj;

  // --- Try the requested language ---
  if (textObj[lang]) return textObj[lang];

  // --- Fall back to English ---
  if (textObj['en']) return textObj['en'];

  // --- Fall back to any available language ---
  const firstValue = Object.values(textObj)[0];
  if (firstValue) return firstValue;

  // --- Sentinel for completely missing translations (visually obvious in UI) ---
  return '??';
}

// =============================================================================
// DISTANCE FORMATTING
// =============================================================================

/**
 * Converts a distance value in FEET to the display unit for the active language.
 *
 * Conversion:
 *   - English: 1:1 (feet stay as feet) → "30 ft."
 *   - French:  feet × 0.3 → metres     → "9 m"
 *
 * WHY NOT STORE IN METRES?
 *   D&D 3.5 rule text, spell ranges, and movement speeds are always specified in
 *   feet in the SRD. All modifiers targeting speed pipelines use feet. Converting
 *   storage to metric would require different numbers in all JSON files for different
 *   locales — a maintenance nightmare. Storing in feet and converting at display time
 *   is the standard Single-Source-of-Truth approach.
 *
 * ROUNDING:
 *   Values are rounded to 1 decimal place to avoid floating point noise.
 *   Feet × 0.3 = metres:
 *     30 ft → 9.0 m  (displayed as "9 m")
 *     25 ft → 7.5 m  (displayed as "7.5 m")
 *     40 ft → 12.0 m (displayed as "12 m")
 *   Trailing zeros after the decimal are stripped by JS's default number-to-string.
 *
 * @param feet     - Distance in feet (the engine's reference unit).
 * @param lang     - The target display language.
 * @returns Formatted distance string with unit suffix.
 *
 * @example
 * formatDistance(30, "en") // → "30 ft."
 * formatDistance(30, "fr") // → "9 m"
 * formatDistance(25, "fr") // → "7.5 m"
 * formatDistance(0, "en")  // → "0 ft."
 */
export function formatDistance(feet: number, lang: SupportedLanguage): string {
  const config = I18N_CONFIG[lang];
  const converted = feet * config.distanceMultiplier;
  // Round to 1 decimal to avoid floating point artifacts (e.g., 9.000000001)
  const rounded = Math.round(converted * 10) / 10;
  return `${rounded} ${config.distanceUnit}`;
}

/**
 * Convenience overload: resolves the language from a `CampaignSettings` object.
 *
 * This signature is provided for callers that have access to the full settings
 * object (e.g., Svelte components, GameEngine methods) rather than just the language string.
 *
 * @param feet     - Distance in feet.
 * @param settings - The active campaign settings (language is read from here).
 * @returns Formatted distance string.
 */
export function formatDistanceWithSettings(feet: number, settings: CampaignSettings): string {
  return formatDistance(feet, settings.language);
}

// =============================================================================
// WEIGHT FORMATTING
// =============================================================================

/**
 * Converts a weight value in POUNDS to the display unit for the active language.
 *
 * Conversion:
 *   - English: 1:1 (pounds stay as pounds) → "10 lb."
 *   - French:  pounds × 0.5 → kilograms    → "5 kg"
 *
 * WHY 0.5 FOR KG (not 0.4536)?
 *   D&D 3.5 French editions use 0.5 kg/lb as a rounded convention for encumbrance
 *   calculations (it simplifies head-math at the gaming table). The exact scientific
 *   conversion (0.4536) would produce ugly numbers like "4.536 kg" for a 10 lb item.
 *   The convention is explicit in the I18N_CONFIG constant.
 *
 * ROUNDING:
 *   Rounded to 1 decimal place for clean display output.
 *
 * @param lbs      - Weight in pounds (the engine's reference unit).
 * @param lang     - The target display language.
 * @returns Formatted weight string with unit suffix.
 *
 * @example
 * formatWeight(10, "en") // → "10 lb."
 * formatWeight(10, "fr") // → "5 kg"
 * formatWeight(1, "fr")  // → "0.5 kg"
 */
export function formatWeight(lbs: number, lang: SupportedLanguage): string {
  const config = I18N_CONFIG[lang];
  const converted = lbs * config.weightMultiplier;
  const rounded = Math.round(converted * 10) / 10;
  return `${rounded} ${config.weightUnit}`;
}

/**
 * Convenience overload: resolves the language from a `CampaignSettings` object.
 *
 * @param lbs      - Weight in pounds.
 * @param settings - The active campaign settings (language is read from here).
 * @returns Formatted weight string.
 */
export function formatWeightWithSettings(lbs: number, settings: CampaignSettings): string {
  return formatWeight(lbs, settings.language);
}

// =============================================================================
// MODIFIER SIGN FORMATTING
// =============================================================================

/**
 * Formats a numeric modifier value with an explicit sign prefix.
 *
 * D&D 3.5 convention: modifiers are always displayed with signs:
 *   - Positive: "+2"
 *   - Negative: "-2"
 *   - Zero:     "+0" (explicit zero on stats, "0" might be used for totals)
 *
 * This is used throughout the UI for:
 *   - Ability score modifiers: "+4 STR"
 *   - Spell save DCs: "+3 to DC"
 *   - Modifier breakdown lists: "+2 enhancement (Belt of Strength)"
 *
 * @param value    - The numeric modifier value (positive, negative, or zero).
 * @returns A string with an explicit +/- sign.
 *
 * @example
 * formatModifier(4)  // → "+4"
 * formatModifier(-2) // → "-2"
 * formatModifier(0)  // → "+0"
 */
export function formatModifier(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

// =============================================================================
// CURRENCY FORMATTING
// =============================================================================

/**
 * Formats a currency amount with the standard D&D 3.5 denomination abbreviation.
 *
 * D&D 3.5 currency denominations (in order of value):
 *   - CP: Copper Pieces   (1/100 gp)
 *   - SP: Silver Pieces   (1/10 gp)
 *   - GP: Gold Pieces     (1 gp, the reference unit — all prices stored in GP)
 *   - PP: Platinum Pieces (10 gp)
 *
 * Localization note: Currency abbreviations are abbreviated in Latin (CP, SP, GP, PP)
 * and are NOT localized — they are universally recognizable in RPG contexts across
 * all supported languages.
 *
 * @param amount       - The numeric amount.
 * @param denomination - The currency type abbreviation.
 * @returns Formatted currency string.
 *
 * @example
 * formatCurrency(150, "GP") // → "150 GP"
 * formatCurrency(5, "PP")   // → "5 PP"
 */
export function formatCurrency(amount: number, denomination: 'CP' | 'SP' | 'GP' | 'PP'): string {
  return `${amount} ${denomination}`;
}

// =============================================================================
// DICE EXPRESSION FORMATTING
// =============================================================================

/**
 * Formats a dice expression for display in roll result UIs.
 *
 * Pure formatting utility — does not perform any calculation.
 * Used by the DiceRollModal (Phase 9.2) to display what was rolled.
 *
 * @param rolls    - Array of individual die results.
 * @param faces    - Number of faces on each die (e.g., 6, 8, 20).
 * @returns A human-readable dice roll string.
 *
 * @example
 * formatDiceRolls([4, 2, 6, 1], 6) // → "4d6: [4, 2, 6, 1]"
 * formatDiceRolls([17], 20)         // → "1d20: [17]"
 */
export function formatDiceRolls(rolls: number[], faces: number): string {
  return `${rolls.length}d${faces}: [${rolls.join(', ')}]`;
}
