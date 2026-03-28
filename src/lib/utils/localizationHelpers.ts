/**
 * @file localizationHelpers.ts
 * @description Localized string resolution and unit system detection.
 *
 * Extracted from formatters.ts. Import from formatters.ts (barrel) for backward compatibility.
 */

import type { UnitSystem } from '../types/i18n';
import { LANG_UNIT_SYSTEM } from '../i18n/ui-strings';
import type { LocalizedString } from '../types/i18n';

/**
 * Resolves a `LocalizedString` to a plain string for the given language.
 *
 * FALLBACK STRATEGY:
 *   1. Try the requested language  (`textObj[lang]`)
 *   2. Fall back to English        (`textObj["en"]`)
 *   3. Fall back to the first key  (`Object.values(textObj)[0]`)
 *   4. Return a sentinel string    ("??") to visually flag missing translations
 *
 * @param textObj  - A `LocalizedString` record or a plain string (returned as-is).
 * @param lang     - The target display language from `CampaignSettings.language`.
 * @returns The localised string for the requested language, with fallbacks.
 */
export function t(textObj: LocalizedString | string, lang: string): string {
  if (typeof textObj === 'string') return textObj;
  if (textObj[lang]) return textObj[lang];
  if (textObj['en']) return textObj['en'];
  const firstValue = Object.values(textObj)[0];
  if (firstValue) return firstValue;
  return '??';
}

/**
 * Resolves the `UnitSystem` for a given language code.
 *
 * @param lang - Any language code string (e.g. `"en"`, `"fr"`, `"es"`).
 * @returns `"imperial"` or `"metric"`.
 */
export function getUnitSystem(lang: string): UnitSystem {
  return LANG_UNIT_SYSTEM.get(lang) ?? 'imperial';
}
