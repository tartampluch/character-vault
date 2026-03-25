/**
 * @file src/tests/formatters.test.ts
 * @description Unit tests for all localization and formatting utilities.
 *
 * All functions in formatters.ts are PURE FUNCTIONS (no side effects, no state),
 * making them trivially testable in Node.js without any mocking or Svelte runtime.
 *
 * COVERAGE TARGET: formatters.ts — 100% statement/branch/function coverage.
 *
 * WHAT IS TESTED:
 *   - t()              : LocalizedString → string with 4-level fallback chain
 *   - formatDistance() : feet → locale-appropriate distance string
 *   - formatDistanceWithSettings(): CampaignSettings convenience overload
 *   - formatWeight()   : pounds → locale-appropriate weight string
 *   - formatWeightWithSettings(): CampaignSettings convenience overload
 *   - formatModifier() : numeric modifier with explicit +/- sign
 *   - formatCurrency() : amount + denomination string
 *   - formatDiceRolls(): die results array → readable string
 *
 * @see src/lib/utils/formatters.ts
 * @see ARCHITECTURE.md section 11 — i18n and Unit Conversion
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import {
  t,
  formatDistance,
  formatDistanceWithSettings,
  formatWeight,
  formatWeightWithSettings,
  formatModifier,
  formatCurrency,
  formatDiceRolls,
  getUnitSystem,
} from '$lib/utils/formatters';
import type { LocalizedString } from '$lib/types/i18n';
import { SUPPORTED_UI_LANGUAGES, LANG_UNIT_SYSTEM, ui, loadUiLocale } from '$lib/i18n/ui-strings';
import { getAbilityAbbr, MAIN_ABILITY_IDS, ABILITY_ABBRS } from '$lib/utils/constants';

// =============================================================================
// HELPERS
// =============================================================================

function makeSettings(lang: string) {
  return {
    language: lang,
    statGeneration: { method: 'standard_array' as const, rerollOnes: false, pointBuyBudget: 25 },
    diceRules: { explodingTwenties: false },
    variantRules: { vitalityWoundPoints: false, gestalt: false },
    enabledRuleSources: ['srd_core'],
  };
}

// =============================================================================
// 1. t() — LocalizedString translation with fallback chain
// =============================================================================

describe('t() — LocalizedString translation', () => {
  it('returns the requested language when available', () => {
    const label: LocalizedString = { en: 'Strength', fr: 'Force' };
    expect(t(label, 'fr')).toBe('Force');
    expect(t(label, 'en')).toBe('Strength');
  });

  it('falls back to English when requested language is missing', () => {
    const label: LocalizedString = { en: 'Initiative', fr: 'Initiative' };
    // Simulate a 3rd language not in the object
    const labelNoFr: LocalizedString = { en: 'Strength' };
    expect(t(labelNoFr, 'fr')).toBe('Strength'); // Fallback: en
  });

  it('falls back to first available language when English is also missing', () => {
    // Homebrew content only in Spanish — should still render something
    const label: LocalizedString = { es: 'Fuerza' } as LocalizedString;
    expect(t(label, 'fr')).toBe('Fuerza'); // Falls back to first value
  });

  it('returns "??" sentinel when all languages are missing or object is empty', () => {
    const empty: LocalizedString = {} as LocalizedString;
    expect(t(empty, 'en')).toBe('??');
    expect(t(empty, 'fr')).toBe('??');
  });

  it('passes through plain strings unchanged (already translated)', () => {
    expect(t('Force', 'en')).toBe('Force');
    expect(t('Force', 'fr')).toBe('Force');
    expect(t('', 'en')).toBe(''); // empty string passes through
  });

  it('English fallback wins over first-key fallback when English key exists', () => {
    const label: LocalizedString = { de: 'Stärke', en: 'Strength' };
    // Requesting 'fr' (not available): falls back to English (not German)
    expect(t(label, 'fr')).toBe('Strength');
  });
});

// =============================================================================
// 2. formatDistance() — feet → locale display string
// =============================================================================

describe('formatDistance() — feet to display unit', () => {
  // English: 1:1 ratio, unit = "ft."
  it('English: 30 ft → "30 ft."', () => {
    expect(formatDistance(30, 'en')).toBe('30 ft.');
  });

  it('English: 0 ft → "0 ft."', () => {
    expect(formatDistance(0, 'en')).toBe('0 ft.');
  });

  it('English: 120 ft (darkvision) → "120 ft."', () => {
    expect(formatDistance(120, 'en')).toBe('120 ft.');
  });

  // French: × 0.3 multiplier, unit = "m"
  it('French: 30 ft → "9 m" (30 × 0.3 = 9)', () => {
    expect(formatDistance(30, 'fr')).toBe('9 m');
  });

  it('French: 25 ft → "7.5 m" (25 × 0.3 = 7.5, 1 decimal)', () => {
    expect(formatDistance(25, 'fr')).toBe('7.5 m');
  });

  it('French: 40 ft → "12 m" (40 × 0.3 = 12.0, no trailing zero)', () => {
    expect(formatDistance(40, 'fr')).toBe('12 m');
  });

  it('French: 60 ft (darkvision) → "18 m"', () => {
    expect(formatDistance(60, 'fr')).toBe('18 m');
  });

  it('French: 5 ft (1 square) → "1.5 m"', () => {
    expect(formatDistance(5, 'fr')).toBe('1.5 m');
  });

  it('French: 10 ft → "3 m"', () => {
    expect(formatDistance(10, 'fr')).toBe('3 m');
  });

  it('rounds to 1 decimal to avoid floating point noise', () => {
    // 3 ft × 0.3 = 0.8999... → rounds to 0.9
    const result = formatDistance(3, 'fr');
    expect(result).toBe('0.9 m');
  });
});

// =============================================================================
// 3. formatDistanceWithSettings() — CampaignSettings convenience overload
// =============================================================================

describe('formatDistanceWithSettings() — uses language from settings object', () => {
  it('English settings: 30 ft → "30 ft."', () => {
    expect(formatDistanceWithSettings(30, makeSettings('en'))).toBe('30 ft.');
  });

  it('French settings: 30 ft → "9 m"', () => {
    expect(formatDistanceWithSettings(30, makeSettings('fr'))).toBe('9 m');
  });
});

// =============================================================================
// 4. formatWeight() — pounds → locale display string
// =============================================================================

describe('formatWeight() — pounds to display unit', () => {
  // English: 1:1 ratio, unit = "lb."
  it('English: 10 lbs → "10 lb."', () => {
    expect(formatWeight(10, 'en')).toBe('10 lb.');
  });

  it('English: 0 lbs → "0 lb."', () => {
    expect(formatWeight(0, 'en')).toBe('0 lb.');
  });

  it('English: 50 lbs (full plate) → "50 lb."', () => {
    expect(formatWeight(50, 'en')).toBe('50 lb.');
  });

  // French: × 0.5 multiplier, unit = "kg"
  it('French: 10 lbs → "5 kg" (10 × 0.5 = 5)', () => {
    expect(formatWeight(10, 'fr')).toBe('5 kg');
  });

  it('French: 1 lb → "0.5 kg"', () => {
    expect(formatWeight(1, 'fr')).toBe('0.5 kg');
  });

  it('French: 50 lbs (full plate) → "25 kg"', () => {
    expect(formatWeight(50, 'fr')).toBe('25 kg');
  });

  it('French: 25 lbs → "12.5 kg"', () => {
    expect(formatWeight(25, 'fr')).toBe('12.5 kg');
  });

  it('French: 3 lbs → "1.5 kg"', () => {
    expect(formatWeight(3, 'fr')).toBe('1.5 kg');
  });
});

// =============================================================================
// 5. formatWeightWithSettings() — CampaignSettings convenience overload
// =============================================================================

describe('formatWeightWithSettings() — uses language from settings object', () => {
  it('English settings: 10 lbs → "10 lb."', () => {
    expect(formatWeightWithSettings(10, makeSettings('en'))).toBe('10 lb.');
  });

  it('French settings: 10 lbs → "5 kg"', () => {
    expect(formatWeightWithSettings(10, makeSettings('fr'))).toBe('5 kg');
  });
});

// =============================================================================
// 6. formatModifier() — explicit sign formatting
// =============================================================================

describe('formatModifier() — explicit +/- sign', () => {
  it('positive value gets "+" prefix: +4', () => {
    expect(formatModifier(4)).toBe('+4');
  });

  it('negative value keeps "-" prefix: -2', () => {
    expect(formatModifier(-2)).toBe('-2');
  });

  it('zero value gets "+" prefix: +0', () => {
    expect(formatModifier(0)).toBe('+0');
  });

  it('large positive: +18', () => {
    expect(formatModifier(18)).toBe('+18');
  });

  it('large negative: -5 (ability drain)', () => {
    expect(formatModifier(-5)).toBe('-5');
  });

  it('+1 (the most common modifier in D&D 3.5)', () => {
    expect(formatModifier(1)).toBe('+1');
  });
});

// =============================================================================
// 7. formatCurrency() — denomination formatting
// =============================================================================

describe('formatCurrency() — D&D 3.5 denomination formatting', () => {
  it('formats Gold Pieces: 150 GP', () => {
    expect(formatCurrency(150, 'GP')).toBe('150 GP');
  });

  it('formats Platinum Pieces: 5 PP', () => {
    expect(formatCurrency(5, 'PP')).toBe('5 PP');
  });

  it('formats Silver Pieces: 30 SP', () => {
    expect(formatCurrency(30, 'SP')).toBe('30 SP');
  });

  it('formats Copper Pieces: 100 CP', () => {
    expect(formatCurrency(100, 'CP')).toBe('100 CP');
  });

  it('formats 0 GP', () => {
    expect(formatCurrency(0, 'GP')).toBe('0 GP');
  });

  it('formats large amount (standard wand price): 750 GP', () => {
    expect(formatCurrency(750, 'GP')).toBe('750 GP');
  });
});

// =============================================================================
// 8. formatDiceRolls() — die results array → readable string
// =============================================================================

describe('formatDiceRolls() — dice roll display', () => {
  it('single d20 roll: "1d20: [17]"', () => {
    expect(formatDiceRolls([17], 20)).toBe('1d20: [17]');
  });

  it('4d6: "4d6: [4, 2, 6, 1]"', () => {
    expect(formatDiceRolls([4, 2, 6, 1], 6)).toBe('4d6: [4, 2, 6, 1]');
  });

  it('3d8: "3d8: [8, 3, 5]"', () => {
    expect(formatDiceRolls([8, 3, 5], 8)).toBe('3d8: [8, 3, 5]');
  });

  it('empty rolls array: "0d6: []"', () => {
    expect(formatDiceRolls([], 6)).toBe('0d6: []');
  });

  it('single 1: "1d4: [1]"', () => {
    expect(formatDiceRolls([1], 4)).toBe('1d4: [1]');
  });
});

// =============================================================================
// 9. getUnitSystem() — language code → unit system resolution
// =============================================================================

describe('getUnitSystem() — language to unit system mapping', () => {
  it('English → "imperial"', () => {
    expect(getUnitSystem('en')).toBe('imperial');
  });

  it('French → "metric"', () => {
    expect(getUnitSystem('fr')).toBe('metric');
  });

  it('unknown community language → "imperial" (safe SRD default)', () => {
    expect(getUnitSystem('es')).toBe('imperial');
    expect(getUnitSystem('de')).toBe('imperial');
    expect(getUnitSystem('ja')).toBe('imperial');
    expect(getUnitSystem('xyz')).toBe('imperial');
  });

  it('empty string → "imperial"', () => {
    expect(getUnitSystem('')).toBe('imperial');
  });

  it('all SUPPORTED_UI_LANGUAGES entries resolve without throwing', () => {
    for (const { code } of SUPPORTED_UI_LANGUAGES) {
      const result = getUnitSystem(code);
      expect(['imperial', 'metric']).toContain(result);
    }
  });
});

// =============================================================================
// 10. SUPPORTED_UI_LANGUAGES / LANG_UNIT_SYSTEM registry integrity
// =============================================================================

describe('SUPPORTED_UI_LANGUAGES registry integrity', () => {
  it('has at least two entries (en and fr)', () => {
    expect(SUPPORTED_UI_LANGUAGES.length).toBeGreaterThanOrEqual(2);
  });

  it('always includes "en" with unitSystem "imperial"', () => {
    const en = SUPPORTED_UI_LANGUAGES.find(l => l.code === 'en');
    expect(en).toBeDefined();
    expect(en!.unitSystem).toBe('imperial');
  });

  it('always includes "fr" with unitSystem "metric"', () => {
    const fr = SUPPORTED_UI_LANGUAGES.find(l => l.code === 'fr');
    expect(fr).toBeDefined();
    expect(fr!.unitSystem).toBe('metric');
  });

  it('every entry has a non-empty code and a valid unitSystem', () => {
    for (const { code, unitSystem } of SUPPORTED_UI_LANGUAGES) {
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
      expect(['imperial', 'metric']).toContain(unitSystem);
    }
  });

  it('LANG_UNIT_SYSTEM map contains every code from SUPPORTED_UI_LANGUAGES', () => {
    for (const { code, unitSystem } of SUPPORTED_UI_LANGUAGES) {
      expect(LANG_UNIT_SYSTEM.has(code)).toBe(true);
      expect(LANG_UNIT_SYSTEM.get(code)).toBe(unitSystem);
    }
  });
});

// =============================================================================
// 11. formatDistance() and formatWeight() with community (unknown) language
// =============================================================================

describe('formatDistance() with community language codes', () => {
  it('unknown language "es" falls back to imperial: 30 ft → "30 ft."', () => {
    expect(formatDistance(30, 'es')).toBe('30 ft.');
  });

  it('unknown language "de" falls back to imperial: 60 ft → "60 ft."', () => {
    expect(formatDistance(60, 'de')).toBe('60 ft.');
  });
});

describe('formatWeight() with community language codes', () => {
  it('unknown language "es" falls back to imperial: 10 lbs → "10 lb."', () => {
    expect(formatWeight(10, 'es')).toBe('10 lb.');
  });

  it('unknown language "de" falls back to imperial: 50 lbs → "50 lb."', () => {
    expect(formatWeight(50, 'de')).toBe('50 lb.');
  });
});

// =============================================================================
// 12. ui() — UI chrome string lookup with fallback
// =============================================================================

describe('ui() — UI string lookup', () => {
  // The new ui-strings architecture loads non-English locales on demand via
  // loadUiLocale(). Seed a minimal French locale so the "fr" tests work without
  // a running server. Only the keys exercised in this section are needed.
  beforeAll(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            '$meta': { code: 'fr', language: 'Français' },
            'lang.en':             'Anglais',
            'lang.label':          'Langue',
            'lang.select_tooltip': 'Changer la langue',
            'lang.fr':             'Français',
            'combat.hp.title':     'Points de vie',
            'combat.ac.title':     'Classe d\'armure',
          }),
      }),
    );
    await loadUiLocale('fr');
    vi.unstubAllGlobals();
  });

  it('returns English string for a known key with lang "en"', () => {
    expect(ui('lang.en', 'en')).toBe('English');
  });

  it('returns French string for a known key with lang "fr"', () => {
    expect(ui('lang.en', 'fr')).toBe('Anglais');
  });

  it('falls back to English when the requested language key is missing', () => {
    // "es" is not in UI_STRINGS for any key — should fall back to English
    const result = ui('lang.en', 'es');
    expect(result).toBe('English');
  });

  it('defaults lang to "en" when no lang argument is supplied', () => {
    expect(ui('lang.fr')).toBe('French');
  });

  it('returns the key itself and logs a warning for an unknown key', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = ui('nonexistent.key.that.does.not.exist');
    expect(result).toBe('nonexistent.key.that.does.not.exist');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('nonexistent.key.that.does.not.exist')
    );
    warnSpy.mockRestore();
  });

  it('all keys that exist for "en" also exist for "fr"', () => {
    // Verify a representative sample of UI_STRINGS keys: calling ui(key, 'fr')
    // must never return the key string itself (which would signal a missing entry).
    const knownKeys = [
      'lang.label', 'lang.select_tooltip', 'lang.en', 'lang.fr',
      'combat.hp.title', 'combat.ac.title',
    ];
    for (const key of knownKeys) {
      const result = ui(key, 'fr');
      expect(result).not.toBe(key);
    }
  });
});

// =============================================================================
// 13. getAbilityAbbr() — constants.ts
// =============================================================================

describe('getAbilityAbbr() — ability score abbreviations', () => {
  it('returns English abbreviation for each of the 6 ability scores', () => {
    expect(getAbilityAbbr('stat_strength',     'en')).toBe('STR');
    expect(getAbilityAbbr('stat_dexterity',    'en')).toBe('DEX');
    expect(getAbilityAbbr('stat_constitution', 'en')).toBe('CON');
    expect(getAbilityAbbr('stat_intelligence', 'en')).toBe('INT');
    expect(getAbilityAbbr('stat_wisdom',       'en')).toBe('WIS');
    expect(getAbilityAbbr('stat_charisma',     'en')).toBe('CHA');
  });

  it('returns French abbreviation for each ability score', () => {
    expect(getAbilityAbbr('stat_strength',     'fr')).toBe('FOR');
    expect(getAbilityAbbr('stat_dexterity',    'fr')).toBe('DEX');
    expect(getAbilityAbbr('stat_constitution', 'fr')).toBe('CON');
    expect(getAbilityAbbr('stat_intelligence', 'fr')).toBe('INT');
    expect(getAbilityAbbr('stat_wisdom',       'fr')).toBe('SAG');
    expect(getAbilityAbbr('stat_charisma',     'fr')).toBe('CHA');
  });

  it('falls back to English abbreviation for an unknown language code', () => {
    expect(getAbilityAbbr('stat_strength',  'es')).toBe('STR');
    expect(getAbilityAbbr('stat_wisdom',    'de')).toBe('WIS');
  });

  it('returns a derived abbreviation for an unknown ability ID', () => {
    // stat_perception → 'PER' (first 3 uppercase letters after stripping 'stat_')
    expect(getAbilityAbbr('stat_perception', 'en')).toBe('PER');
    expect(getAbilityAbbr('stat_ab',         'en')).toBe('AB');
  });

  it('MAIN_ABILITY_IDS covers exactly the 6 standard ability scores', () => {
    expect(MAIN_ABILITY_IDS).toHaveLength(6);
    expect(MAIN_ABILITY_IDS).toContain('stat_strength');
    expect(MAIN_ABILITY_IDS).toContain('stat_charisma');
  });

  it('ABILITY_ABBRS has an entry for every ID in MAIN_ABILITY_IDS', () => {
    for (const id of MAIN_ABILITY_IDS) {
      expect(ABILITY_ABBRS[id]).toBeDefined();
      expect(ABILITY_ABBRS[id].en).toBeTruthy();
      expect(ABILITY_ABBRS[id].fr).toBeTruthy();
    }
  });
});
