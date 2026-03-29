/**
 * @file localizationHelpers.ts
 * @description Localized string resolution and unit system detection.
 *
 * Extracted from formatters.ts. Import from formatters.ts (barrel) for backward compatibility.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * BCP-47 REGIONAL VARIANT SUPPORT
 * ────────────────────────────────────────────────────────────────────────────
 * Language codes follow the BCP-47 standard (lowercase, hyphen separator):
 *   - Base language:      "en", "fr", "de", "es"
 *   - Regional variant:   "en-gb", "fr-be", "fr-fr", "pt-br"
 *
 * The fallback chain for any code with a regional tag (e.g. "fr-be"):
 *   1. Exact code          ("fr-be")
 *   2. Base language       ("fr")     ← strip everything after the hyphen
 *   3. English             ("en")     ← universal engine fallback
 *   4. First available key in the object
 *   5. Sentinel "??"                  ← visual flag for missing translations
 *
 * This means a "fr-be" user benefits from all "fr" translations for any key
 * that has not been specifically overridden in the "fr-be" file, and falls back
 * to English for anything not covered in either file.
 *
 * NOTATION RATIONALE — lowercase hyphenated BCP-47 ("en-gb", not "en_GB"):
 *   - Official IETF standard (RFC 5646): language tags are case-insensitive but
 *     conventionally lowercased for language subtags and uppercased for region
 *     subtags (e.g. "en-GB"). However, we use all-lowercase throughout to:
 *       (a) Avoid confusion with variable names (camelCase looks like code).
 *       (b) Simplify file naming — "en-gb.json" is unambiguous on all systems.
 *       (c) Match the de-facto web convention (Intl APIs accept both casings).
 *   - `Intl.PluralRules("en-gb")` works identically to `Intl.PluralRules("en-GB")`.
 */

import type { UnitSystem } from '../types/i18n';
import { LANG_UNIT_SYSTEM } from '../i18n/ui-strings';
import type { LocalizedString } from '../types/i18n';

// =============================================================================
// BASE LANGUAGE EXTRACTION
// =============================================================================

/**
 * Extracts the base language code from a BCP-47 tag.
 *
 * Examples:
 *   "fr-be" → "fr"
 *   "en-gb" → "en"
 *   "pt-br" → "pt"
 *   "de"    → "de"  (already a base code — returned unchanged)
 *
 * @param lang - BCP-47 language code (lowercase hyphen format).
 * @returns The base language part (everything before the first hyphen).
 */
export function getBaseLang(lang: string): string {
  const hyphenIdx = lang.indexOf('-');
  return hyphenIdx > 0 ? lang.slice(0, hyphenIdx) : lang;
}

/**
 * Returns true when `lang` is a regional variant (contains a hyphen).
 * Examples: "fr-be" → true, "fr" → false, "en-gb" → true.
 */
export function isRegionalVariant(lang: string): boolean {
  return lang.indexOf('-') > 0;
}

// =============================================================================
// LOCALIZED STRING RESOLUTION
// =============================================================================

/**
 * Resolves a `LocalizedString` to a plain string for the given language.
 *
 * FALLBACK CHAIN (BCP-47 aware):
 *   1. Exact language code     ("fr-be" — the most specific match)
 *   2. Base language code      ("fr"    — strip regional suffix; only for regional variants)
 *   3. English                 ("en"    — universal engine fallback)
 *   4. First key in the object          (any available translation)
 *   5. Sentinel "??"                    (visually flags a completely missing translation)
 *
 * Step 2 implements the `fr-be → fr → en` chain. A user whose campaign is set
 * to "fr-be" (Belgian French) will automatically receive generic French
 * translations for any string not specifically provided in the "fr-be" variant.
 *
 * @param textObj  - A `LocalizedString` record or a plain string (returned as-is).
 * @param lang     - BCP-47 language code from `CampaignSettings.language`.
 * @returns The best available translation with graceful fallback.
 */
export function t(textObj: LocalizedString | string, lang: string): string {
  if (typeof textObj === 'string') return textObj;

  // 1. Exact code match (e.g. "fr-be" or "fr").
  if (textObj[lang]) return textObj[lang];

  // 2. Base language fallback for regional variants (e.g. "fr-be" → "fr").
  //    Only attempted when the requested code actually has a hyphen.
  if (isRegionalVariant(lang)) {
    const baseLang = getBaseLang(lang);
    if (textObj[baseLang]) return textObj[baseLang];
  }

  // 3. English universal fallback.
  if (textObj['en']) return textObj['en'];

  // 4. Any first available translation (non-English, non-base-lang, last resort).
  const firstValue = Object.values(textObj)[0];
  if (firstValue) return firstValue;

  // 5. Sentinel — visually flags a completely missing translation.
  return '??';
}

// =============================================================================
// UNIT SYSTEM RESOLUTION
// =============================================================================

/**
 * Resolves the `UnitSystem` for a given BCP-47 language code.
 *
 * FALLBACK CHAIN:
 *   1. Exact code in LANG_UNIT_SYSTEM     ("fr-be" if explicitly registered)
 *   2. Base language in LANG_UNIT_SYSTEM  ("fr"    — for regional variants)
 *   3. Default: "imperial"                (SRD reference system)
 *
 * WHY BASE-LANGUAGE FALLBACK HERE?
 *   Unit systems are registered at locale-load time via `registerLangUnitSystem()`.
 *   A user who selects "fr-be" but only has "fr" registered will correctly get
 *   the metric system from the "fr" entry, without requiring every regional
 *   variant to be explicitly registered.
 *
 * @param lang - BCP-47 language code (e.g. "fr-be", "en-gb", "de").
 * @returns `"imperial"` or `"metric"`.
 */
export function getUnitSystem(lang: string): UnitSystem {
  // 1. Exact code (handles explicitly registered regional variants).
  const exact = LANG_UNIT_SYSTEM.get(lang);
  if (exact !== undefined) return exact;

  // 2. Base language fallback (e.g. "fr-be" → look up "fr").
  if (isRegionalVariant(lang)) {
    const base = LANG_UNIT_SYSTEM.get(getBaseLang(lang));
    if (base !== undefined) return base;
  }

  // 3. Default to imperial (SRD reference system — safest fallback).
  return 'imperial';
}
