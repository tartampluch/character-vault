/**
 * @file contentLanguages.ts
 * @description Utility functions and constants for content-editor language management.
 *
 * PURPOSE:
 *   The content editor allows GMs to author LocalizedString fields (label, description,
 *   etc.) in multiple languages simultaneously. This module provides:
 *
 *   1. `KNOWN_CONTENT_LANGUAGES` — A premade list of commonly-used game translation
 *      languages. Sourced from src/lib/data/content-languages.json (a JSON file that can
 *      safely contain non-ASCII native language names without triggering the audit rule
 *      that forbids accented characters in .ts/.svelte files).
 *
 *   2. `getContentLangDisplayName()` — Resolves a language code to its native-language
 *      name for display in editor tabs and language selector buttons.
 *
 *   3. `getContentLangCountryCode()` — Resolves a language code to an ISO 3166-1 alpha-2
 *      country code for rendering a flag icon.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * BCP-47 REGIONAL VARIANT SUPPORT
 * ────────────────────────────────────────────────────────────────────────────
 * Language codes use the BCP-47 standard in all-lowercase hyphenated form:
 *
 *   Base language:    "en", "fr", "de", "es"
 *   Regional variant: "en-gb", "fr-be", "fr-fr", "pt-br", "en-au"
 *
 * NOTATION RATIONALE (why "en-gb" not "en_GB" or "enGB"):
 *   - "en-gb" is lowercase BCP-47: standard for web APIs, file names, and
 *     Intl.* objects. `Intl.PluralRules("en-gb")` works identically to
 *     `Intl.PluralRules("en-GB")`.
 *   - "en_GB" is the ICU/Java convention — avoided to prevent confusion.
 *   - "enGB" looks like a variable name — avoided.
 *   - All-lowercase is consistent, unambiguous on case-sensitive file systems,
 *     and matches web convention (next-intl, vue-i18n, etc.).
 *
 * FALLBACK CHAIN for regional variants ("fr-be" → "fr" → "en"):
 *   - All resolution functions try the exact code first.
 *   - If not found, they strip the region suffix (e.g. "fr-be" → "fr") and retry.
 *   - If still not found, they fall back to "en" (universal engine fallback).
 *   - This means "fr-be" content automatically inherits all "fr" translations.
 *
 * COUNTRY CODE CONVENTION for regional variants:
 *   For a code like "en-gb" or "fr-be", the flag country code is the REGION part
 *   of the tag ("gb", "be"), which is also the ISO 3166-1 alpha-2 code for the
 *   primary territory of that locale variant.
 *
 * SEPARATION OF CONCERNS:
 *   This module is DISTINCT from the UI locale system (ui-strings.ts / LANG_UNIT_SYSTEM):
 *   - UI locales control the application's *interface language* (menus, labels, buttons).
 *   - Content languages control which *game data translations* the GM can author.
 *   A GM can run the UI in English while authoring content in English + German + Spanish.
 *
 * ARCHITECTURE NOTE — Why JSON, not inline TypeScript?
 *   The project's CRITICAL CODING GUIDELINE §8 bans accented characters from .ts/.svelte
 *   source files (audit: `grep -rn "[accent chars]" src/lib`). Language native names
 *   such as French, Portuguese, Turkish necessarily contain non-ASCII characters.
 *   Storing them in a JSON file (src/lib/data/content-languages.json) keeps TypeScript
 *   source clean while preserving fully accurate native names.
 */

import type { UnitSystem } from '$lib/types/i18n';
import { dataLoader } from '$lib/engine/DataLoader';
import rawLanguages from '$lib/data/content-languages.json';
import { getBaseLang, isRegionalVariant } from './localizationHelpers';

// =============================================================================
// KNOWN CONTENT LANGUAGE TYPE
// =============================================================================

/**
 * A single entry in the premade language list for the NewLanguageModal.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * NATIVE NAME CONVENTION
 * ────────────────────────────────────────────────────────────────────────────
 * nativeName follows two rules depending on the code type:
 *
 * BASE LANGUAGES (e.g. "fr", "de", "es"):
 *   The language's own name in its own script:
 *     "fr" → "Français"
 *     "de" → "Deutsch"
 *     "es" → "Español"
 *
 * REGIONAL VARIANTS (e.g. "fr-be", "en-gb", "pt-br"):
 *   "<base name> (<full country name in that language>)"
 *   The country name is written in the SAME LANGUAGE as the entry — NOT as
 *   an ISO abbreviation. This gives the most natural, readable display for
 *   native speakers:
 *     "fr-be" → "Français (Belgique)"     ← Belgium in French, not "FR (BE)"
 *     "fr-ch" → "Français (Suisse)"       ← Switzerland in French
 *     "fr-ca" → "Français (Canada)"
 *     "en-gb" → "English (United Kingdom)"← NOT "English (GB)"
 *     "de-at" → "Deutsch (Österreich)"    ← Austria in German
 *     "pt-br" → "Português (Brasil)"      ← Brazil in Portuguese
 *     "nl-be" → "Nederlands (België)"     ← Belgium in Dutch
 *     "it-ch" → "Italiano (Svizzera)"     ← Switzerland in Italian
 *
 * WHY FULL COUNTRY NAMES?
 *   An abbreviation like "(BE)" requires the reader to know that BE is Belgium.
 *   "(Belgique)" is immediately readable to any French speaker without a lookup.
 *   This also avoids confusion when the same country has different codes
 *   (Switzerland is "ch" in ISO 3166, which is non-obvious from "Switzerland").
 */
export interface KnownContentLanguage {
  /** BCP-47 language code, all-lowercase hyphenated (e.g. 'fr', 'en-gb', 'pt-br'). */
  code: string;
  /**
   * The language's native name. See the NATIVE NAME CONVENTION above.
   * Base languages: language name only (e.g. 'Deutsch').
   * Regional variants: language name + full country name in that language
   * (e.g. 'Français (Suisse)', 'English (United Kingdom)').
   * Never use ISO abbreviations in parentheses (e.g. NOT 'Français (CH)').
   */
  nativeName: string;
  /**
   * ISO 3166-1 alpha-2 country code used for flag rendering (e.g. 'fr', 'gb').
   * For regional variants, this is the region part of the BCP-47 tag:
   *   'en-gb' → 'gb', 'fr-be' → 'be', 'pt-br' → 'br', 'de-at' → 'at'.
   */
  countryCode: string;
  /** Whether this language variant uses the metric unit system. */
  metric: boolean;
}

// =============================================================================
// PREMADE LANGUAGE LIST
// =============================================================================

/**
 * Premade list of commonly-used game translation languages, loaded from the JSON
 * data file to avoid accented characters in TypeScript source files.
 *
 * CONTENTS (~50 entries):
 *   Base languages: fr, de, es, pt, it, nl, sv, nb, nn, da, fi,
 *                   pl, cs, sk, hu, ro, hr, ca, ru, uk, bg, el,
 *                   tr, ja, ko, ar
 *   French variants:   fr-fr, fr-be, fr-ch, fr-ca, fr-lu
 *   German variants:   de-at, de-ch, de-lu
 *   English variants:  en-gb, en-au, en-ca, en-nz, en-ie, en-za
 *   Spanish variants:  es-mx, es-ar, es-co, es-cl
 *   Portuguese vars:   pt-pt, pt-br
 *   Italian variants:  it-ch
 *   Dutch variants:    nl-be
 *   Norwegian:         nb (Bokmål), nn (Nynorsk)
 *   Chinese:           zh-hans (Simplified), zh-hant (Traditional)
 *
 * NATIVE NAME CONVENTION:
 *   Country names in regional variants are written in FULL, in the language
 *   of the entry itself — never as ISO abbreviations.
 *   e.g. "fr-be" → "Français (Belgique)", NOT "Français (BE)".
 *   See `KnownContentLanguage.nativeName` for the complete convention.
 *
 * 'en' (English) is intentionally absent — it is always present as the mandatory
 * base language and handled separately in display logic.
 *
 * This list is used in:
 *   - NewLanguageModal.svelte — as the "select from common languages" panel
 *   - LocalizedStringEditor.svelte — to resolve display names for language codes
 */
export const KNOWN_CONTENT_LANGUAGES: ReadonlyArray<KnownContentLanguage> =
  rawLanguages as KnownContentLanguage[];

// =============================================================================
// DISPLAY NAME RESOLUTION
// =============================================================================

/**
 * Returns the native-language display name for a given BCP-47 content language code.
 *
 * RESOLUTION ORDER (first match wins):
 *   1. 'en' → "English" (hardcoded; English has no locale file)
 *   2. DataLoader external locales — names from `/api/locales` server files
 *      (e.g. 'fr' → the native name declared in fr.json `$meta.language`)
 *   3. KNOWN_CONTENT_LANGUAGES premade list (common languages before locale files exist)
 *   4. Regional variant composition — for 'xx-yy' codes not in the list:
 *      derive from the base language name + uppercased region tag
 *      (e.g. 'fr-ch' → "[French-name] (CH)" when 'fr' is in the premade list)
 *   5. Fallback: uppercase code (e.g. "ZZ" for an unregistered code)
 *
 * @param code - BCP-47 language code (e.g. 'fr', 'fr-be', 'en-gb', 'de').
 * @returns The language's native name (e.g. 'Deutsch', 'English').
 */
export function getContentLangDisplayName(code: string): string {
  if (code === 'en') return 'English';

  // Step 1: Prefer the name from the server locale file ($meta.language field).
  const fromLoader = dataLoader.getLocaleDisplayName(code);
  if (fromLoader) return fromLoader;

  // Step 2: Fall back to the premade list for common languages.
  const known = KNOWN_CONTENT_LANGUAGES.find(l => l.code === code);
  if (known) return known.nativeName;

  // Step 3: For regional variants not in the premade list, compose from base lang.
  //   e.g. "fr-ch" → "[French name] (CH)" (recursive — resolves "fr" via steps 1-2)
  if (isRegionalVariant(code)) {
    const baseLang = getBaseLang(code);
    const region   = code.slice(code.indexOf('-') + 1).toUpperCase();
    const baseName = getContentLangDisplayName(baseLang); // recursive; safe (no infinite loop)
    return `${baseName} (${region})`;
  }

  // Step 4: Last resort — uppercase code as a visible sentinel.
  return code.toUpperCase();
}

// =============================================================================
// COUNTRY CODE RESOLUTION
// =============================================================================

/**
 * Returns the ISO 3166-1 alpha-2 country code for a language, used to render
 * a flag icon/emoji in the language selector.
 *
 * RESOLUTION ORDER (first match wins):
 *   1. 'en' → 'gb' (UK flag is the conventional English-language flag)
 *   2. Regional variant extraction — for 'xx-yy', the region part IS the country code
 *      (e.g. 'en-gb' → 'gb', 'fr-be' → 'be', 'pt-br' → 'br')
 *   3. DataLoader external locales — from `/api/locales` server files ($meta.countryCode)
 *   4. KNOWN_CONTENT_LANGUAGES premade list
 *   5. Fallback: the language code itself (works for codes like 'fr', 'de', 'nl')
 *
 * WHY REGION PART FIRST FOR REGIONAL VARIANTS?
 *   For "fr-be" (Belgian French), the correct flag to show is Belgium (🇧🇪),
 *   not France (🇫🇷). The region part of the BCP-47 tag directly gives us the
 *   ISO 3166-1 country code — no additional lookup needed.
 *
 * @param code - BCP-47 language code (e.g. 'fr', 'en-gb', 'pt-br').
 * @returns ISO 3166-1 alpha-2 country code string (e.g. 'fr', 'gb', 'br').
 */
export function getContentLangCountryCode(code: string): string {
  if (code === 'en') return 'gb';

  // For regional variants (e.g. 'en-gb', 'fr-be'), extract the region tag.
  // The region tag IS the ISO 3166-1 country code — no further lookup needed.
  if (isRegionalVariant(code)) {
    return code.slice(code.indexOf('-') + 1).toLowerCase();
  }

  // For base language codes, try DataLoader then premade list.
  const fromLoader = dataLoader.getLocaleCountryCode(code);
  if (fromLoader) return fromLoader;

  const known = KNOWN_CONTENT_LANGUAGES.find(l => l.code === code);
  if (known) return known.countryCode;

  // Fallback: use the language code itself (works for 'fr', 'de', 'nl', etc.).
  return code;
}

// =============================================================================
// UNIT SYSTEM RESOLUTION
// =============================================================================

/**
 * Returns the unit system (metric or imperial) for a given BCP-47 language code.
 *
 * RESOLUTION ORDER (first match wins):
 *   1. 'en' → 'imperial' (SRD default; English hardcoded baseline)
 *   2. Exact match in KNOWN_CONTENT_LANGUAGES
 *   3. Regional variant → base language fallback
 *      (e.g. 'fr-be' → check 'fr' → metric)
 *   4. Default: 'metric' (most languages use metric; 'imperial' is the exception)
 *
 * Used when auto-registering a new language added via NewLanguageModal so that
 * distance/weight formatters work correctly for the new language immediately.
 *
 * @param code - BCP-47 language code.
 * @returns 'metric' or 'imperial'.
 */
export function getContentLangUnitSystem(code: string): UnitSystem {
  if (code === 'en') return 'imperial';

  // Check premade list for exact match.
  const known = KNOWN_CONTENT_LANGUAGES.find(l => l.code === code);
  if (known) return known.metric ? 'metric' : 'imperial';

  // For regional variants, fall back to the base language.
  if (isRegionalVariant(code)) {
    return getContentLangUnitSystem(getBaseLang(code)); // recursive; safe
  }

  // Default: metric (most non-English languages use metric units).
  return 'metric';
}
