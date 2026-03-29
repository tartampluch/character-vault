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
  formatSituationalContext,
  SITUATIONAL_LABELS,
  computeAbilityModifier,
  computeIntelligentItemEgo,
  computeCoinWeight,
  computeWealthInGP,
  previewWithTempMod,
  computeBaseSave,
  toDisplayPct,
  getCharacterLevel,
} from '$lib/utils/formatters';
import type { LocalizedString } from '$lib/types/i18n';
import { SUPPORTED_UI_LANGUAGES, LANG_UNIT_SYSTEM, registerLangUnitSystem, ui, UI_STRINGS, loadUiLocaleFromObject } from '$lib/i18n/ui-strings';
import { getAbilityAbbr, MAIN_ABILITY_IDS, ABILITY_ABBRS } from '$lib/utils/constants';

// =============================================================================
// GLOBAL SETUP — simulate loadExternalLocales() for locale-aware formatter tests
// =============================================================================
// At runtime, DataLoader.loadExternalLocales() calls registerLangUnitSystem() for
// every locale file returned by GET /api/locales. Tests must reproduce that call
// so that formatDistance/formatWeight produce metric output for French, exactly as
// they would in a live browser session after the locale API has responded.
beforeAll(() => {
  registerLangUnitSystem('fr', 'metric');
});

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

  it('French → "metric" after registerLangUnitSystem() (simulating loadExternalLocales)', () => {
    // 'fr' is not pre-seeded — it arrives via loadExternalLocales() at runtime.
    // The file-level beforeAll simulates that call. Any code NOT registered falls
    // back to 'imperial' (see the 'unknown community language' test below).
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
  it('has exactly one entry — only English is a compile-time built-in', () => {
    // French and all other locales are runtime-discovered via /api/locales.
    expect(SUPPORTED_UI_LANGUAGES.length).toBe(1);
  });

  it('always includes "en" with unitSystem "imperial"', () => {
    const en = SUPPORTED_UI_LANGUAGES.find(l => l.code === 'en');
    expect(en).toBeDefined();
    expect(en!.unitSystem).toBe('imperial');
  });

  it('does NOT contain "fr" — French unit system arrives via registerLangUnitSystem at runtime', () => {
    expect(SUPPORTED_UI_LANGUAGES.find(l => l.code === 'fr')).toBeUndefined();
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
// 22. t() — BCP-47 regional variant fallback (new in multilingual sprint)
// =============================================================================

describe('t() — BCP-47 regional variant fallback in formatters', () => {
  it('fr-be falls back to fr when fr-be key is absent', () => {
    const label: LocalizedString = { en: 'Fireball', fr: 'Boule de feu' };
    expect(t(label, 'fr-be')).toBe('Boule de feu');
  });

  it('fr-ch falls back to fr when fr-ch key is absent', () => {
    const label: LocalizedString = { en: 'Rogue', fr: 'Roublard' };
    expect(t(label, 'fr-ch')).toBe('Roublard');
  });

  it('en-gb falls back to en', () => {
    const label: LocalizedString = { en: 'Armour' };
    expect(t(label, 'en-gb')).toBe('Armour');
  });

  it('regional code with its own entry is not overridden by base', () => {
    const label: LocalizedString = { en: 'Color', fr: 'Couleur', 'fr-be': 'Kleur' };
    expect(t(label, 'fr-be')).toBe('Kleur');
    expect(t(label, 'fr')).toBe('Couleur');
    expect(t(label, 'en')).toBe('Color');
  });

  it('regional code falls back to English when neither regional nor base is present', () => {
    const label: LocalizedString = { en: 'Barbarian' };
    expect(t(label, 'fr-be')).toBe('Barbarian');
    expect(t(label, 'de-at')).toBe('Barbarian');
  });

  it('regional code falls back to first key then ?? when English is also absent', () => {
    const label = { de: 'Zauberer' } as LocalizedString;
    // fr-be → fr (absent) → en (absent) → first key
    expect(t(label, 'fr-be')).toBe('Zauberer');
    // Empty object → ??
    expect(t({} as LocalizedString, 'fr-be')).toBe('??');
  });
});

// =============================================================================
// 23. getUnitSystem() — BCP-47 regional variant fallback (new in multilingual sprint)
// =============================================================================

describe('getUnitSystem() — BCP-47 regional variant inherits base unit system', () => {
  // 'fr' was registered as metric in the file-level beforeAll.
  // These tests verify that regional variants inherit from the registered base.

  it('fr-be → metric (inherits from registered fr)', () => {
    expect(getUnitSystem('fr-be')).toBe('metric');
  });

  it('fr-ch → metric (inherits from registered fr)', () => {
    expect(getUnitSystem('fr-ch')).toBe('metric');
  });

  it('fr-ca → metric (inherits from registered fr)', () => {
    expect(getUnitSystem('fr-ca')).toBe('metric');
  });

  it('en-gb → imperial (inherits from built-in en)', () => {
    expect(getUnitSystem('en-gb')).toBe('imperial');
  });

  it('en-au → imperial (inherits from built-in en)', () => {
    expect(getUnitSystem('en-au')).toBe('imperial');
  });

  it('formatDistance respects fr-be as metric (inherits from fr)', () => {
    expect(formatDistance(30, 'fr-be')).toBe('9 m');
  });

  it('formatDistance respects en-gb as imperial', () => {
    expect(formatDistance(30, 'en-gb')).toBe('30 ft.');
  });

  it('formatWeight respects fr-ch as metric (inherits from fr)', () => {
    expect(formatWeight(10, 'fr-ch')).toBe('5 kg');
  });

  it('regional variant with completely unregistered base → imperial fallback', () => {
    // 'xx' is not registered; 'xx-yy' has no registered base → imperial
    expect(getUnitSystem('xx-yy')).toBe('imperial');
  });
});

// =============================================================================
// 12. ui() — UI chrome string lookup with fallback
// =============================================================================

describe('ui() — UI string lookup', () => {
  // Seed a minimal French locale synchronously using the test helper, so the
  // "fr" tests work without a running HTTP server. Only the keys exercised in
  // this section are needed.
  beforeAll(() => {
    loadUiLocaleFromObject('fr', {
      'lang.en':             'Anglais',
      'lang.label':          'Langue',
      'lang.select_tooltip': 'Changer la langue',
      'lang.fr':             'Français',
      'combat.hp.title':     'Points de vie',
      'combat.ac.title':     "Classe d'armure",
    });
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
    // lang.en is the only language-name key in the English baseline — English
    // names itself. Other languages removed their cross-language entries: their
    // self-names now live in their own locale files only.
    expect(ui('lang.en')).toBe('English');
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

  it('representative UI chrome keys resolve for both "en" and "fr"', () => {
    // Verify that core UI chrome keys translate correctly.
    // Note: 'lang.fr' is intentionally absent from the English baseline —
    // French names itself in fr.json only ('lang.fr' = 'Français').
    const knownKeys = [
      'lang.label', 'lang.select_tooltip', 'lang.en',
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
  // Inject French abbreviations via the test helper (no HTTP fetch needed).
  // In production, these come from static/locales/fr.json; here we inject them
  // directly so the test suite is self-contained.
  beforeAll(() => {
    loadUiLocaleFromObject('fr', {
      'ability_abbr.stat_strength':     'FOR',
      'ability_abbr.stat_dexterity':    'DEX',
      'ability_abbr.stat_constitution': 'CON',
      'ability_abbr.stat_intelligence': 'INT',
      'ability_abbr.stat_wisdom':       'SAG',
      'ability_abbr.stat_charisma':     'CHA',
    });
  });

  it('returns English abbreviation for each of the 6 ability scores', () => {
    expect(getAbilityAbbr('stat_strength',     'en')).toBe('STR');
    expect(getAbilityAbbr('stat_dexterity',    'en')).toBe('DEX');
    expect(getAbilityAbbr('stat_constitution', 'en')).toBe('CON');
    expect(getAbilityAbbr('stat_intelligence', 'en')).toBe('INT');
    expect(getAbilityAbbr('stat_wisdom',       'en')).toBe('WIS');
    expect(getAbilityAbbr('stat_charisma',     'en')).toBe('CHA');
  });

  it('returns French abbreviation for each ability score (from locale, not constants.ts)', () => {
    // Translations live in static/locales/fr.json, injected above via loadUiLocaleFromObject.
    // If this test fails, check that fr.json contains the ability_abbr.* keys.
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

  it('UI_STRINGS has an ability_abbr key for every ID in MAIN_ABILITY_IDS', () => {
    // English baseline must exist in ui-strings.ts so getAbilityAbbr works offline.
    for (const id of MAIN_ABILITY_IDS) {
      const key = `ability_abbr.${id}`;
      expect(UI_STRINGS[key]).toBeTruthy();
    }
  });

  it('ABILITY_ABBRS still exports an English fallback for every standard ability ID', () => {
    // ABILITY_ABBRS is now English-only; other languages come from locale files.
    for (const id of MAIN_ABILITY_IDS) {
      expect(ABILITY_ABBRS[id]).toBeDefined();
      expect(ABILITY_ABBRS[id].en).toBeTruthy();
    }
  });
});

// =============================================================================
// 9. formatSituationalContext() — localized situational modifier labels (M5 fix)
// =============================================================================

describe('formatSituationalContext() — localized situational labels', () => {
  it('returns the English label for a known context key (default lang)', () => {
    expect(formatSituationalContext('vs_giant')).toBe('vs. Giants');
  });

  it('returns the English label when lang="en" is explicit', () => {
    expect(formatSituationalContext('vs_poison', 'en')).toBe('vs. Poison');
    expect(formatSituationalContext('sneak_attack', 'en')).toBe('On sneak attack');
    expect(formatSituationalContext('wielding_two_weapons', 'en')).toBe('While two-weapon fighting');
  });

  it('returns the French label when lang="fr" (translations loaded from locale)', () => {
    // French situational labels live in fr.json (situation.* keys), not in code.
    // Inject them via the test helper so the test is self-contained (no HTTP needed).
    loadUiLocaleFromObject('fr', {
      'situation.vs_giant':    'contre les Géants',
      'situation.vs_poison':   'contre le Poison',
      'situation.sneak_attack': "lors d'une attaque sournoise",
      'situation.vs_evil':     'contre le Mal',
      'situation.vs_good':     'contre le Bien',
    });
    expect(formatSituationalContext('vs_giant',    'fr')).toBe('contre les Géants');
    expect(formatSituationalContext('vs_poison',   'fr')).toBe('contre le Poison');
    expect(formatSituationalContext('sneak_attack','fr')).toBe("lors d'une attaque sournoise");
    expect(formatSituationalContext('vs_evil',     'fr')).toBe('contre le Mal');
    expect(formatSituationalContext('vs_good',     'fr')).toBe('contre le Bien');
  });

  it('falls back to English when requested language has no locale loaded', () => {
    // "de" (German) has no locale injected — falls back to English.
    expect(formatSituationalContext('vs_fear', 'de')).toBe('vs. Fear');
  });

  it('prettifies unknown context keys as a fallback (homebrew contexts)', () => {
    expect(formatSituationalContext('my_custom_buff', 'en')).toBe('My Custom Buff');
    expect(formatSituationalContext('vs_custom_foe',  'en')).toBe('vs. Custom Foe');
  });

  it('handles empty string gracefully', () => {
    // Empty key is not in map — returns empty string after prettification
    expect(formatSituationalContext('')).toBe('');
  });

  it('every entry in SITUATIONAL_LABELS has an en translation', () => {
    // COMPLETENESS CHECK: ensures every entry has the English baseline.
    for (const [key, label] of Object.entries(SITUATIONAL_LABELS)) {
      expect(label.en, `${key}: missing 'en' translation`).toBeTruthy();
    }
  });

  it('SITUATIONAL_LABELS entries are objects with an en string (locale-agnostic)', () => {
    // TYPE REGRESSION GUARD: verifies the label values are objects with an 'en' field.
    // French and other translations come from locale files (fr.json) via ui(), not from code.
    const sample = SITUATIONAL_LABELS['vs_enchantment'];
    expect(typeof sample).toBe('object');
    expect(typeof sample.en).toBe('string');
  });

  it('falls back to entry.en when no locale is loaded for the requested language', () => {
    // "de" (German) has no locale injected → ui() returns the key → falls back to entry.en.
    expect(formatSituationalContext('vs_giant', 'de')).toBe('vs. Giants');
    expect(formatSituationalContext('tracking', 'de')).toBe('While tracking');
  });
});

// =============================================================================
// 14. computeAbilityModifier() — D&D 3.5 ability score → modifier formula
// =============================================================================

describe('computeAbilityModifier() — floor((score − 10) / 2)', () => {
  // D&D 3.5 SRD: modifier = floor((score − 10) / 2)
  it('10 → +0 (neutral, most common default)', () => {
    expect(computeAbilityModifier(10)).toBe(0);
  });

  it('11 → +0 (same floor as 10)', () => {
    expect(computeAbilityModifier(11)).toBe(0);
  });

  it('18 → +4 (high STR like starting fighter with racial bonus)', () => {
    expect(computeAbilityModifier(18)).toBe(4);
  });

  it('8 → −1 (slightly below average)', () => {
    expect(computeAbilityModifier(8)).toBe(-1);
  });

  it('3 → −4 (minimum possible ability score)', () => {
    expect(computeAbilityModifier(3)).toBe(-4);
  });

  it('20 → +5 (common for boosted primary stat)', () => {
    expect(computeAbilityModifier(20)).toBe(5);
  });

  it('30 → +10 (epic-level or god-touched score)', () => {
    expect(computeAbilityModifier(30)).toBe(10);
  });

  it('floors correctly for odd scores (e.g. 15 → +2, not +2.5)', () => {
    expect(computeAbilityModifier(15)).toBe(2);
    expect(computeAbilityModifier(13)).toBe(1);
    expect(computeAbilityModifier(9)).toBe(-1);
    expect(computeAbilityModifier(7)).toBe(-2);
  });
});

// =============================================================================
// 15. computeIntelligentItemEgo() — DMG Chapter 8 Ego formula
// =============================================================================

describe('computeIntelligentItemEgo() — SRD Ego score formula', () => {
  // Base fixture: INT 12 (+1), WIS 12 (+1), CHA 12 (+1) = 3 ability mods
  function baseData(overrides: Partial<Parameters<typeof computeIntelligentItemEgo>[0]> = {}) {
    return {
      intelligenceScore: 12,
      wisdomScore:       12,
      charismaScore:     12,
      communication:     'speech',
      lesserPowers:      0,
      greaterPowers:     0,
      specialPurpose:    null,
      dedicatedPower:    null,
      ...overrides,
    };
  }

  it('base ability mods only: INT+1, WIS+1, CHA+1 = Ego 3', () => {
    expect(computeIntelligentItemEgo(baseData())).toBe(3);
  });

  it('each lesser power adds +1 Ego', () => {
    expect(computeIntelligentItemEgo(baseData({ lesserPowers: 2 }))).toBe(5);
  });

  it('each greater power adds +2 Ego', () => {
    expect(computeIntelligentItemEgo(baseData({ greaterPowers: 3 }))).toBe(9);
  });

  it('telepathy communication adds +1 Ego', () => {
    expect(computeIntelligentItemEgo(baseData({ communication: 'telepathy' }))).toBe(4);
  });

  it('special purpose + dedicated power adds +4 Ego', () => {
    expect(computeIntelligentItemEgo(baseData({
      specialPurpose: 'Slay undead',
      dedicatedPower: '+4 to attacks vs undead',
    }))).toBe(7);
  });

  it('special purpose WITHOUT dedicated power does NOT add the bonus', () => {
    // The +4 bonus requires BOTH fields to be non-null.
    expect(computeIntelligentItemEgo(baseData({
      specialPurpose: 'Slay undead',
      dedicatedPower: null,
    }))).toBe(3);
  });

  it('full high-tier item: telepathy + 2 lesser + 1 greater + purpose/power', () => {
    // INT 17 (+3), WIS 14 (+2), CHA 10 (+0) = 5 ability mods
    // + telepathy 1 + lesser 2 + greater 2 + purpose 4 = 14
    expect(computeIntelligentItemEgo({
      intelligenceScore: 17,
      wisdomScore:       14,
      charismaScore:     10,
      communication:     'telepathy',
      lesserPowers:      2,
      greaterPowers:     1,
      specialPurpose:    'Slay undead',
      dedicatedPower:    '+4 to attacks vs undead',
    })).toBe(14);
  });

  it('floors at 0 when all stats are very low (minimum Ego = 0)', () => {
    // INT 3 (−4), WIS 3 (−4), CHA 3 (−4) = −12 → clamped to 0
    expect(computeIntelligentItemEgo(baseData({
      intelligenceScore: 3,
      wisdomScore:       3,
      charismaScore:     3,
    }))).toBe(0);
  });
});

// =============================================================================
// 16. computeCoinWeight() — 50 coins = 1 lb (SRD encumbrance rule)
// =============================================================================

describe('computeCoinWeight() — 50 coins = 1 lb', () => {
  it('50 coins of a single denomination = 1 lb', () => {
    expect(computeCoinWeight(50, 0, 0, 0)).toBe(1);
    expect(computeCoinWeight(0, 0, 50, 0)).toBe(1);
    expect(computeCoinWeight(0, 0, 0, 50)).toBe(1);
  });

  it('0 coins = 0 lbs', () => {
    expect(computeCoinWeight(0, 0, 0, 0)).toBe(0);
  });

  it('mixed denominations add up: 100 cp + 100 gp = 200 coins = 4 lbs', () => {
    expect(computeCoinWeight(100, 0, 100, 0)).toBe(4);
  });

  it('floors fractional pounds: 49 coins → 0 lb', () => {
    expect(computeCoinWeight(49, 0, 0, 0)).toBe(0);
  });

  it('typical adventurer coin purse: 10 gp, 5 sp, 20 cp = 35 coins → 0 lb', () => {
    expect(computeCoinWeight(20, 5, 10, 0)).toBe(0);
  });

  it('large treasure hoard: 500 gp = 10 lbs', () => {
    expect(computeCoinWeight(0, 0, 500, 0)).toBe(10);
  });
});

// =============================================================================
// 17. computeWealthInGP() — D&D 3.5 exchange rates
// =============================================================================

describe('computeWealthInGP() — exchange rate: 100cp=1gp, 10sp=1gp, 1pp=10gp', () => {
  it('100 cp = 1 gp', () => {
    expect(computeWealthInGP(100, 0, 0, 0)).toBeCloseTo(1.0);
  });

  it('10 sp = 1 gp', () => {
    expect(computeWealthInGP(0, 10, 0, 0)).toBeCloseTo(1.0);
  });

  it('1 gp = 1 gp', () => {
    expect(computeWealthInGP(0, 0, 1, 0)).toBe(1.0);
  });

  it('1 pp = 10 gp', () => {
    expect(computeWealthInGP(0, 0, 0, 1)).toBe(10.0);
  });

  it('mixed coins: 200cp + 30sp + 5gp + 1pp = 2 + 3 + 5 + 10 = 20 gp', () => {
    expect(computeWealthInGP(200, 30, 5, 1)).toBeCloseTo(20.0);
  });

  it('zero coins = 0 gp', () => {
    expect(computeWealthInGP(0, 0, 0, 0)).toBe(0.0);
  });
});

// =============================================================================
// 18. previewWithTempMod() — temporary ability modifier preview (Abilities tab)
// =============================================================================

describe('previewWithTempMod() — UI preview for temporary ability adjustment', () => {
  it('adds a positive temporary bonus to the base total', () => {
    // e.g. STR 14 (base) + Belt of STR +4 (temp preview) = 18
    expect(previewWithTempMod(14, 4)).toBe(18);
  });

  it('adds a negative temporary mod (ability damage preview)', () => {
    expect(previewWithTempMod(14, -4)).toBe(10);
  });

  it('zero temp modifier returns base total unchanged', () => {
    expect(previewWithTempMod(20, 0)).toBe(20);
  });

  it('works with base total of 0', () => {
    expect(previewWithTempMod(0, 5)).toBe(5);
  });
});

// =============================================================================
// 19. computeBaseSave() — isolate class-progression save from ability mod
// =============================================================================

describe('computeBaseSave() — base save = totalBonus − abilityMod', () => {
  it('Fighter 3 Fortitude: total +5, CON +2 → base +3', () => {
    // Good save: +3 at level 3. CON +2 brings total to +5.
    expect(computeBaseSave(5, 2)).toBe(3);
  });

  it('negative CON mod: total −1, CON −2 → base +1', () => {
    expect(computeBaseSave(-1, -2)).toBe(1);
  });

  it('zero ability mod: total equals base save', () => {
    expect(computeBaseSave(4, 0)).toBe(4);
  });

  it('same total and ability mod: base save = 0 (no class progression)', () => {
    expect(computeBaseSave(3, 3)).toBe(0);
  });
});

// =============================================================================
// 20. toDisplayPct() — progress-bar percentage clamp (0–100, no div-by-zero)
// =============================================================================

describe('toDisplayPct() — percentage clamp [0, 100], div-by-zero safe', () => {
  it('50 of 100 = 50%', () => {
    expect(toDisplayPct(50, 100)).toBe(50);
  });

  it('0 of 100 = 0%', () => {
    expect(toDisplayPct(0, 100)).toBe(0);
  });

  it('100 of 100 = 100%', () => {
    expect(toDisplayPct(100, 100)).toBe(100);
  });

  it('value > max is clamped to 100% (overflow)', () => {
    expect(toDisplayPct(120, 100)).toBe(100);
  });

  it('negative value is clamped to 0% (underflow)', () => {
    expect(toDisplayPct(-10, 100)).toBe(0);
  });

  it('max ≤ 0 returns 0% to prevent division by zero', () => {
    expect(toDisplayPct(50, 0)).toBe(0);
    expect(toDisplayPct(50, -5)).toBe(0);
  });

  it('3 PP remaining of 7 max PP ≈ 42.86%', () => {
    const result = toDisplayPct(3, 7);
    expect(result).toBeCloseTo(42.86, 1);
  });
});

// =============================================================================
// 21. getCharacterLevel() — sum of classLevels (CharacterCard / GM Dashboard)
// =============================================================================

describe('getCharacterLevel() — sum of classLevels record (excludes LA)', () => {
  it('empty record = level 0', () => {
    expect(getCharacterLevel({})).toBe(0);
  });

  it('single class: Fighter 5 = level 5', () => {
    expect(getCharacterLevel({ class_fighter: 5 })).toBe(5);
  });

  it('two-class multiclass: Fighter 3 / Rogue 2 = level 5', () => {
    expect(getCharacterLevel({ class_fighter: 3, class_rogue: 2 })).toBe(5);
  });

  it('three-class multiclass: Fighter 3 / Monk 3 / Wizard 1 = level 7', () => {
    expect(getCharacterLevel({ class_fighter: 3, class_monk: 3, class_wizard: 1 })).toBe(7);
  });

  it('Level Adjustment (LA) is stored separately — classLevels contains only class levels', () => {
    // A Drow Rogue 5 (LA +2) still has classLevels = { class_rogue: 5 } → level 5.
    // The +2 LA lives on character.levelAdjustment, NOT in classLevels.
    expect(getCharacterLevel({ class_rogue: 5 })).toBe(5);
  });
});
