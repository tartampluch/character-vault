/**
 * @file i18n.ts
 * @description Internationalization (i18n) types and configuration.
 *
 * Design philosophy:
 *   The engine follows a "Single Source of Truth" principle for rule data.
 *   Rule files (JSON) are NEVER duplicated per language. Each translatable string
 *   is stored as a `LocalizedString` record: a plain object mapping a language code
 *   to its translation.
 *
 *   All calculations are performed in the SRD reference unit system (feet, pounds).
 *   Unit conversion happens ONLY at the display layer, using the `I18N_CONFIG` lookup.
 *   This means the math engine never needs to know or care about the active language.
 *
 * Usage pattern (inside the GameEngine's `t()` helper):
 *   const name = engine.t(feature.label);
 *   // → Returns "Boule de feu" if lang is "fr", fallback to "en" if missing.
 */

// =============================================================================
// SUPPORTED LANGUAGES
// =============================================================================

/**
 * The set of languages the engine officially supports.
 *
 * Extending this type (e.g., adding "de" for German) is the only change needed
 * in this file to support a new language. Rule JSON files would then simply add
 * the new key to their `LocalizedString` objects.
 */
export type SupportedLanguage = "en" | "fr";

// =============================================================================
// LOCALIZED STRING
// =============================================================================

/**
 * A translatable string stored as a map from language code to translated text.
 *
 * Using `Record<string, string>` (instead of `Record<SupportedLanguage, string>`)
 * intentionally keeps this type open. Community-created content can include
 * arbitrary language keys (e.g., "de", "es", "ja") without TypeScript errors,
 * while the engine always gracefully falls back to "en" if the active language
 * is not present in a given object.
 *
 * @example
 * const label: LocalizedString = {
 *   en: "Power Attack",
 *   fr: "Attaque en puissance"
 * };
 */
export type LocalizedString = Record<string, string>;

// =============================================================================
// LOCALIZATION CONFIG — DISPLAY LAYER UNIT CONVERSION
// =============================================================================

/**
 * Per-language display configuration for unit conversion.
 *
 * Why keep this here and not in a JSON file?
 *   Because these multipliers are universal mathematical constants tied to the
 *   language/locale, not to a specific rule source. They are safe as compile-time
 *   constants. Putting them in a JSON would add a loading step for trivial data.
 *
 * Reference units (always stored in the engine and JSONs):
 *   - Distance: feet (ft)  → D&D 3.5 SRD uses feet as the base unit.
 *   - Weight:   pounds (lb) → D&D 3.5 SRD uses pounds as the base unit.
 */
export interface LocalizationConfig {
  /**
   * Multiplier to convert feet to the display unit.
   * English: 1 (feet → feet, no conversion)
   * French:  0.3 (feet → metres, approximate standard conversion used in FR localisations)
   */
  distanceMultiplier: number;

  /**
   * The display unit suffix for distance.
   * English: "ft."
   * French:  "m"
   */
  distanceUnit: string;

  /**
   * Multiplier to convert pounds to the display unit.
   * English: 1 (pounds → pounds, no conversion)
   * French:  0.5 (pounds → kilograms, approximate: 1 lb ≈ 0.5 kg)
   *
   * Note: D&D 3.5 FR officially uses 0.5 kg/lb for encumbrance simplicity.
   */
  weightMultiplier: number;

  /**
   * The display unit suffix for weight.
   * English: "lb."
   * French:  "kg"
   */
  weightUnit: string;
}

// =============================================================================
// I18N_CONFIG — COMPILE-TIME CONSTANT TABLE
// =============================================================================

/**
 * The global localization configuration table.
 *
 * This is the authoritative mapping from a `SupportedLanguage` code to its
 * unit-display configuration. It is consumed by the `GameEngine`'s `formatDistance()`
 * and `formatWeight()` helper methods (see `GameEngine.svelte.ts`, Phase 3.1).
 *
 * It is also used by the Math Parser (`mathParser.ts`, Phase 2.2) to resolve
 * the `|distance` and `|weight` pipe operators in formula strings:
 *   "@attributes.speed_land.totalValue|distance"
 *   → Calls formatDistance(totalValue) → "40 ft." (en) or "12 m" (fr)
 */
export const I18N_CONFIG: Record<SupportedLanguage, LocalizationConfig> = {
  en: {
    distanceMultiplier: 1,
    distanceUnit: "ft.",
    weightMultiplier: 1,
    weightUnit: "lb.",
  },
  fr: {
    // French D&D 3.5 localisations use metres and kilograms.
    // 1 square = 5 ft = 1.5 m, but the simpler 0.3 multiplier is used
    // for descriptions like "30 ft. → 9 m" (more intuitive than 1.5×6=9).
    distanceMultiplier: 0.3,
    distanceUnit: "m",
    // French editions use 0.5 kg per pound for encumbrance rules (rounded convention).
    weightMultiplier: 0.5,
    weightUnit: "kg",
  },
};
