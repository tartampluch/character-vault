/**
 * @file src/tests/localizationHelpers.test.ts
 * @description Unit tests for src/lib/utils/localizationHelpers.ts
 *
 * WHAT IS TESTED
 *   1. getBaseLang()       — extracts the base language from a BCP-47 code
 *   2. isRegionalVariant() — detects regional variants (codes containing a hyphen)
 *   3. t()                 — LocalizedString resolution with the 5-step BCP-47
 *                            aware fallback chain:
 *                              exact → base lang → English → first key → "??"
 *   4. getUnitSystem()     — language code → UnitSystem with regional fallback:
 *                              exact → base lang → "imperial" (SRD default)
 *
 * DESIGN DECISIONS
 *   • These functions are PURE (no side effects, no state), so tests are
 *     self-contained and need no mocking.
 *   • getUnitSystem() depends on LANG_UNIT_SYSTEM (from ui-strings.ts). The
 *     file-level beforeAll registers 'fr' as metric to simulate the runtime
 *     state after DataLoader.loadExternalLocales() has run, exactly as
 *     formatters.test.ts does for its own tests.
 *   • Unit-system tests for regional variants are isolated from each other
 *     by using unique test codes ('tv-xx-*') that don't collide with real codes
 *     or with other test files' registrations.
 *
 * RELATIONSHIP TO EXISTING TESTS
 *   formatters.test.ts already tests the old t() and getUnitSystem() behaviour
 *   (exact match, English fallback, unknown community language). This file adds
 *   the NEW regional-variant behaviour that was introduced in this sprint:
 *     t({ fr: 'Boule de feu' }, 'fr-be')  → 'Boule de feu'
 *     getUnitSystem('fr-be')               → 'metric' (inherits from 'fr')
 *
 * @see src/lib/utils/localizationHelpers.ts  Module under test
 * @see src/lib/i18n/ui-strings.ts            LANG_UNIT_SYSTEM dependency
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  getBaseLang,
  isRegionalVariant,
  t,
  getUnitSystem,
} from '$lib/utils/formatters';
import { registerLangUnitSystem } from '$lib/i18n/ui-strings';
import type { LocalizedString } from '$lib/types/i18n';

// =============================================================================
// GLOBAL SETUP
// =============================================================================
// Register 'fr' as metric to simulate runtime state after loadExternalLocales().
// Regional variant tests (fr-be, fr-ch) rely on this registration for their
// inherited unit-system lookups.
beforeAll(() => {
  registerLangUnitSystem('fr', 'metric');
  registerLangUnitSystem('de', 'metric');
  registerLangUnitSystem('pt', 'metric');
});

// =============================================================================
// 1 — getBaseLang()
// =============================================================================

describe('getBaseLang() — extracts the language subtag from a BCP-47 code', () => {
  it('returns the code unchanged for a base language (no hyphen)', () => {
    expect(getBaseLang('en')).toBe('en');
    expect(getBaseLang('fr')).toBe('fr');
    expect(getBaseLang('de')).toBe('de');
    expect(getBaseLang('ja')).toBe('ja');
    expect(getBaseLang('zh')).toBe('zh');
  });

  it('strips the region subtag from a two-part BCP-47 code', () => {
    expect(getBaseLang('fr-be')).toBe('fr');
    expect(getBaseLang('fr-ch')).toBe('fr');
    expect(getBaseLang('fr-ca')).toBe('fr');
    expect(getBaseLang('en-gb')).toBe('en');
    expect(getBaseLang('en-au')).toBe('en');
    expect(getBaseLang('de-at')).toBe('de');
    expect(getBaseLang('pt-br')).toBe('pt');
    expect(getBaseLang('zh-hans')).toBe('zh');
  });

  it('only strips up to the first hyphen', () => {
    // BCP-47 tags may theoretically have multiple subtags;
    // getBaseLang always returns everything before the first hyphen.
    expect(getBaseLang('zh-hans-cn')).toBe('zh');
  });

  it('handles edge cases gracefully', () => {
    expect(getBaseLang('')).toBe('');
    // '-be' has the hyphen at index 0 (not > 0), so the function returns the
    // code unchanged — there is no "base language" part to extract.
    expect(getBaseLang('-be')).toBe('-be');
  });
});

// =============================================================================
// 2 — isRegionalVariant()
// =============================================================================

describe('isRegionalVariant() — detects hyphenated BCP-47 codes', () => {
  it('returns false for base language codes (no hyphen)', () => {
    expect(isRegionalVariant('en')).toBe(false);
    expect(isRegionalVariant('fr')).toBe(false);
    expect(isRegionalVariant('de')).toBe(false);
    expect(isRegionalVariant('ja')).toBe(false);
    expect(isRegionalVariant('zh')).toBe(false);
    expect(isRegionalVariant('nb')).toBe(false);
    expect(isRegionalVariant('nn')).toBe(false);
  });

  it('returns true for codes with a hyphen (regional variants)', () => {
    expect(isRegionalVariant('fr-be')).toBe(true);
    expect(isRegionalVariant('fr-ch')).toBe(true);
    expect(isRegionalVariant('fr-ca')).toBe(true);
    expect(isRegionalVariant('en-gb')).toBe(true);
    expect(isRegionalVariant('en-au')).toBe(true);
    expect(isRegionalVariant('de-at')).toBe(true);
    expect(isRegionalVariant('pt-br')).toBe(true);
    expect(isRegionalVariant('zh-hans')).toBe(true);
    expect(isRegionalVariant('zh-hant')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isRegionalVariant('')).toBe(false);
  });

  it('returns false when the hyphen is at position 0 (degenerate)', () => {
    // indexOf('-') returns 0, which is NOT > 0, so treated as base code.
    expect(isRegionalVariant('-be')).toBe(false);
  });
});

// =============================================================================
// 3 — t() — BCP-47 aware fallback chain
// =============================================================================

describe('t() — LocalizedString resolution with BCP-47 regional fallback', () => {

  // --- STEP 1: exact match ---

  it('step 1 — returns the exact language match when the code is present', () => {
    const label: LocalizedString = { en: 'Fireball', fr: 'Boule de feu', 'fr-be': 'Boule flamme' };
    expect(t(label, 'fr-be')).toBe('Boule flamme');
    expect(t(label, 'fr')).toBe('Boule de feu');
    expect(t(label, 'en')).toBe('Fireball');
  });

  // --- STEP 2: base language fallback (NEW — BCP-47 regional chain) ---

  it('step 2 — fr-be falls back to fr when fr-be key is absent', () => {
    const label: LocalizedString = { en: 'Power Attack', fr: 'Attaque en puissance' };
    expect(t(label, 'fr-be')).toBe('Attaque en puissance');
  });

  it('step 2 — fr-ch falls back to fr when fr-ch key is absent', () => {
    const label: LocalizedString = { en: 'Wizard', fr: 'Magicien' };
    expect(t(label, 'fr-ch')).toBe('Magicien');
  });

  it('step 2 — en-gb falls back to en when en-gb key is absent', () => {
    // English variants fall back to the mandatory 'en' key.
    const label: LocalizedString = { en: 'Strength' };
    expect(t(label, 'en-gb')).toBe('Strength');
  });

  it('step 2 — de-at falls back to de when de-at key is absent', () => {
    const label: LocalizedString = { en: 'Sword', de: 'Schwert' };
    expect(t(label, 'de-at')).toBe('Schwert');
  });

  it('step 2 — pt-br falls back to pt when pt-br key is absent', () => {
    const label: LocalizedString = { en: 'Rogue', pt: 'Ladino' };
    expect(t(label, 'pt-br')).toBe('Ladino');
  });

  it('step 2 — prefers the exact regional code over the base language', () => {
    const label: LocalizedString = { en: 'Color', 'en-gb': 'Colour', fr: 'Couleur', 'fr-be': 'Kleur' };
    // fr-be has its own entry — must NOT fall back to fr
    expect(t(label, 'fr-be')).toBe('Kleur');
    // en-gb has its own entry — must NOT fall back to en
    expect(t(label, 'en-gb')).toBe('Colour');
  });

  // --- STEP 3: English fallback ---

  it('step 3 — falls back to English when neither exact nor base lang is present', () => {
    const label: LocalizedString = { en: 'Ranger', de: 'Waldläufer' };
    // 'fr-be' not present, 'fr' not present → falls back to English
    expect(t(label, 'fr-be')).toBe('Ranger');
  });

  it('step 3 — falls back to English for a completely unknown regional code', () => {
    const label: LocalizedString = { en: 'Cleric' };
    expect(t(label, 'xx-yy')).toBe('Cleric');
  });

  // --- STEP 4: first available key ---

  it('step 4 — returns first available key when English is also missing', () => {
    // Homebrew content with only a single non-English translation
    const label = { es: 'Paladín' } as LocalizedString;
    expect(t(label, 'fr-be')).toBe('Paladín'); // fr-be → fr → en → first key
  });

  // --- STEP 5: sentinel ---

  it('step 5 — returns "??" when the object is completely empty', () => {
    expect(t({} as LocalizedString, 'fr-be')).toBe('??');
    expect(t({} as LocalizedString, 'en')).toBe('??');
  });

  // --- Plain string passthrough (unchanged) ---

  it('passes through plain strings unchanged (already resolved)', () => {
    expect(t('Fireball', 'fr-be')).toBe('Fireball');
    expect(t('', 'fr-be')).toBe('');
  });

  // --- Base language codes still work as before ---

  it('base language codes retain the original en → first key → ?? chain', () => {
    const label: LocalizedString = { en: 'Barbarian', fr: 'Barbare' };
    expect(t(label, 'fr')).toBe('Barbare');
    expect(t(label, 'en')).toBe('Barbarian');
    expect(t(label, 'de')).toBe('Barbarian'); // falls back to English
  });
});

// =============================================================================
// 4 — getUnitSystem() — BCP-47 aware unit system resolution
// =============================================================================

describe('getUnitSystem() — regional variant inherits base language unit system', () => {

  // --- Exact matches (unchanged behaviour) ---

  it('exact: en → imperial', () => {
    expect(getUnitSystem('en')).toBe('imperial');
  });

  it('exact: fr → metric (registered in beforeAll)', () => {
    expect(getUnitSystem('fr')).toBe('metric');
  });

  it('exact: de → metric (registered in beforeAll)', () => {
    expect(getUnitSystem('de')).toBe('metric');
  });

  // --- Regional variant fallback to base language (NEW) ---

  it('fr-be inherits metric from registered fr', () => {
    // 'fr-be' is not explicitly registered; falls back to 'fr' which is metric.
    expect(getUnitSystem('fr-be')).toBe('metric');
  });

  it('fr-ch inherits metric from registered fr', () => {
    expect(getUnitSystem('fr-ch')).toBe('metric');
  });

  it('fr-ca inherits metric from registered fr', () => {
    expect(getUnitSystem('fr-ca')).toBe('metric');
  });

  it('en-gb inherits imperial from registered en', () => {
    // English is always imperial; en-gb should inherit that.
    expect(getUnitSystem('en-gb')).toBe('imperial');
  });

  it('en-au inherits imperial from registered en', () => {
    expect(getUnitSystem('en-au')).toBe('imperial');
  });

  it('de-at inherits metric from registered de', () => {
    expect(getUnitSystem('de-at')).toBe('metric');
  });

  it('de-ch inherits metric from registered de', () => {
    expect(getUnitSystem('de-ch')).toBe('metric');
  });

  it('pt-br inherits metric from registered pt', () => {
    expect(getUnitSystem('pt-br')).toBe('metric');
  });

  // --- Explicit registration beats inheritance ---

  it('explicit registration takes precedence over base-language inheritance', () => {
    // Register 'tv-xx' (test variant) explicitly as imperial,
    // even though 'tv' (test base) would be unregistered → imperial anyway.
    // The key point: explicit wins.
    registerLangUnitSystem('tv-xx-exp', 'imperial');
    registerLangUnitSystem('tv-xx-base', 'metric');
    // tv-xx-exp was explicitly registered:
    expect(getUnitSystem('tv-xx-exp')).toBe('imperial');
    // tv-xx-base base not registered — falls back to imperial (not found → default):
    expect(getUnitSystem('tv-zz')).toBe('imperial');
  });

  // --- Unknown / unregistered regional codes → default imperial ---

  it('unknown regional variant with unregistered base → imperial (SRD default)', () => {
    // Neither 'xx-yy' nor 'xx' is registered → falls back to 'imperial'.
    expect(getUnitSystem('xx-yy')).toBe('imperial');
    expect(getUnitSystem('zz-qq')).toBe('imperial');
  });

  it('empty string → imperial', () => {
    expect(getUnitSystem('')).toBe('imperial');
  });
});
