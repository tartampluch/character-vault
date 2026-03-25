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
 *   Unit conversion happens ONLY at the display layer, using `UNIT_SYSTEM_CONFIG`
 *   combined with `LANG_UNIT_SYSTEM` (from `ui-strings.ts`). The math engine never
 *   needs to know or care about the active language.
 *
 * UNIT SYSTEM ARCHITECTURE (decoupled from language codes):
 *   Unit display (imperial vs. metric) is a property of the *unit system* a language
 *   uses, not of the language code itself. This means:
 *
 *   1. `UNIT_SYSTEM_CONFIG` maps `UnitSystem` → conversion factors/suffixes.
 *      Only TWO entries ever: "imperial" and "metric". Adding a new language
 *      never requires touching this table.
 *
 *   2. `LANG_UNIT_SYSTEM` (in ui-strings.ts) maps each built-in language code to
 *      either "imperial" or "metric". This is the ONLY place to change when adding
 *      a new built-in UI language.
 *
 *   3. Community language codes not present in `LANG_UNIT_SYSTEM` default to
 *      "imperial" (safest fallback — SRD values are in feet/pounds).
 *
 * Usage pattern (inside the GameEngine's `t()` helper):
 *   const name = engine.t(feature.label);
 *   // → Returns "Boule de feu" if lang is "fr", fallback to "en" if missing.
 */

// =============================================================================
// LOCALIZED STRING
// =============================================================================

// =============================================================================
// UI LOCALE TYPES  (chrome strings only — not used for game-data entities)
// =============================================================================

/**
 * A single CLDR plural-form object for a UI chrome string.
 * Keys are CLDR plural categories: "zero", "one", "two", "few", "many", "other".
 * Translators only need to fill in the categories their language uses
 * (most European languages just need "one" and "other").
 *
 * @example
 * { one: "{n} fichier", other: "{n} fichiers" }  // French
 * { one: "{n} file",    other: "{n} files"    }  // English
 */
export type UiPluralForms = Partial<Record<Intl.LDMLPluralRule, string>>;

/**
 * A single UI chrome string value.
 * - Plain `string` for simple labels (buttons, headings, messages).
 * - `UiPluralForms` for count-dependent strings (use with `uiN()`).
 */
export type UiStringValue = string | UiPluralForms;

/**
 * A flat key→value map loaded from a locale JSON file.
 * The `$meta` block (present in the JSON file for translator guidance) is
 * stripped out by the loader before the map is cached.
 */
export type UiLocale = Record<string, UiStringValue>;

// =============================================================================
// LOCALIZED STRING  (game-data entities — JSON rule files)
// =============================================================================

/**
 * A translatable string stored as a map from language code to translated text.
 *
 * Using `Record<string, string>` (instead of a union type) intentionally keeps
 * this type open. Community-created content can include arbitrary language keys
 * (e.g., "de", "es", "ja") without TypeScript errors, while the engine always
 * gracefully falls back to "en" if the active language is not present.
 *
 * @example
 * const label: LocalizedString = {
 *   en: "Power Attack",
 *   fr: "Attaque en puissance"
 * };
 */
export type LocalizedString = Record<string, string>;

// =============================================================================
// UNIT SYSTEM
// =============================================================================

/**
 * The two unit systems used in display formatting.
 *
 * - `"imperial"`: feet and pounds (SRD default; English, etc.)
 * - `"metric"`:   metres and kilograms (French, most of the world)
 *
 * This is decoupled from language codes: a new language simply maps to one of
 * these two values in `SUPPORTED_UI_LANGUAGES` / `LANG_UNIT_SYSTEM`
 * (both in `ui-strings.ts`) and never requires changes to `UNIT_SYSTEM_CONFIG`.
 */
export type UnitSystem = "imperial" | "metric";

// =============================================================================
// LOCALIZATION CONFIG — DISPLAY LAYER UNIT CONVERSION
// =============================================================================

/**
 * Per-unit-system display configuration for unit conversion.
 *
 * Why keyed by `UnitSystem` rather than language code?
 *   Because unit display is a property of the measurement system, not the
 *   language. Dozens of languages all map to the same two conversion factors.
 *   Adding German, Spanish, Italian, etc. requires zero changes here — they
 *   just map to "metric" or "imperial" in `SUPPORTED_UI_LANGUAGES`.
 *
 * Reference units (always stored in the engine and JSONs):
 *   - Distance: feet (ft)  → D&D 3.5 SRD uses feet as the base unit.
 *   - Weight:   pounds (lb) → D&D 3.5 SRD uses pounds as the base unit.
 */
export interface LocalizationConfig {
  /**
   * Multiplier to convert feet to the display unit.
   * imperial: 1    (feet → feet, no conversion)
   * metric:   0.3  (feet → metres, standard used in FR/metric localisations)
   */
  distanceMultiplier: number;

  /**
   * The display unit suffix for distance.
   * imperial: "ft."
   * metric:   "m"
   */
  distanceUnit: string;

  /**
   * Multiplier to convert pounds to the display unit.
   * imperial: 1    (pounds → pounds, no conversion)
   * metric:   0.5  (pounds → kilograms; D&D 3.5 FR uses 0.5 kg/lb for simplicity)
   */
  weightMultiplier: number;

  /**
   * The display unit suffix for weight.
   * imperial: "lb."
   * metric:   "kg"
   */
  weightUnit: string;
}

// =============================================================================
// UNIT_SYSTEM_CONFIG — COMPILE-TIME CONSTANT TABLE
// =============================================================================

/**
 * The authoritative mapping from `UnitSystem` to display configuration.
 *
 * This table has exactly TWO entries and will NEVER need additional entries,
 * regardless of how many languages are added. When a new language is added
 * to `SUPPORTED_UI_LANGUAGES` in `ui-strings.ts`, it maps to one of these two
 * existing unit systems.
 *
 * Consumed by `formatDistance()` and `formatWeight()` in `formatters.ts` via
 * the `getUnitSystem(lang)` helper (also in `formatters.ts`).
 *
 * Also consumed by the Math Parser (`mathParser.ts`) to resolve the `|distance`
 * and `|weight` pipe operators in formula strings:
 *   "@attributes.speed_land.totalValue|distance"
 *   → Calls formatDistance(totalValue, lang) → "40 ft." (imperial) or "12 m" (metric)
 */
export const UNIT_SYSTEM_CONFIG: Record<UnitSystem, LocalizationConfig> = {
  imperial: {
    distanceMultiplier: 1,
    distanceUnit: "ft.",
    weightMultiplier: 1,
    weightUnit: "lb.",
  },
  metric: {
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
