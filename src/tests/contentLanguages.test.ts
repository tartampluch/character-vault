/**
 * @file src/tests/contentLanguages.test.ts
 * @description Unit tests for src/lib/utils/contentLanguages.ts
 *
 * WHAT IS TESTED
 *   1. KNOWN_CONTENT_LANGUAGES integrity
 *      — Required fields present on every entry
 *      — No duplicate codes
 *      — 'en' is absent (English is mandatory base, handled separately)
 *      — Regional variants use the region part as countryCode
 *      — All codes are valid BCP-47 lowercase (no uppercase, valid format)
 *      — Sorted by nativeName (localeCompare)
 *
 *   2. getContentLangDisplayName()
 *      — 'en' → "English" (hardcoded)
 *      — Known base language from premade list  (e.g. 'fr' → native name)
 *      — Known regional variant from premade list (e.g. 'fr-be' → native name)
 *      — Unlisted regional variant → composed from base name + "(REGION)"
 *      — Completely unknown code → uppercase fallback
 *
  *   3. getContentLangCountryCode()
 *      — 'en' → 'us'
 *      — Regional variant: region part is the country code (e.g. 'fr-be' → 'be')
 *      — Base language from premade list → countryCode field
 *      — Unknown base code → code itself as fallback
 *
 *   4. getContentLangUnitSystem()
 *      — 'en' → 'imperial'
 *      — Metric base language (e.g. 'fr') → 'metric'
 *      — Non-metric English variant (e.g. 'en-gb') → 'imperial'
 *      — Metric regional variant (e.g. 'fr-be') → inherits 'metric' from 'fr'
 *      — Unknown code → defaults to 'metric'
 *
 * ISOLATION STRATEGY
 *   contentLanguages.ts imports DataLoader (singleton). In the test environment,
 *   DataLoader's external locale methods return undefined (no server available),
 *   so all tests exercise the premade-list and composition fallback paths.
 *   DataLoader's getLocaleDisplayName() and getLocaleCountryCode() are expected
 *   to return undefined/falsy in this context, ensuring the premade-list path
 *   is always exercised.
 *
 * @see src/lib/utils/contentLanguages.ts  Module under test
 * @see src/lib/data/content-languages.json  Premade language data
 */

import { describe, it, expect } from 'vitest';
import {
  KNOWN_CONTENT_LANGUAGES,
  getContentLangDisplayName,
  getContentLangCountryCode,
  getContentLangUnitSystem,
} from '$lib/utils/contentLanguages';

// =============================================================================
// 1 — KNOWN_CONTENT_LANGUAGES — data integrity
// =============================================================================

describe('KNOWN_CONTENT_LANGUAGES — data integrity', () => {

  it('is a non-empty array', () => {
    expect(Array.isArray(KNOWN_CONTENT_LANGUAGES)).toBe(true);
    expect(KNOWN_CONTENT_LANGUAGES.length).toBeGreaterThan(0);
  });

  it('has at least 40 entries (base + regional variants)', () => {
    // Baseline check: if the JSON is accidentally truncated, this will catch it.
    expect(KNOWN_CONTENT_LANGUAGES.length).toBeGreaterThanOrEqual(40);
  });

  it('every entry has a non-empty string code', () => {
    for (const entry of KNOWN_CONTENT_LANGUAGES) {
      expect(typeof entry.code, `${entry.code}: code type`).toBe('string');
      expect(entry.code.length, `${entry.code}: code length`).toBeGreaterThan(0);
    }
  });

  it('every entry has a non-empty string nativeName', () => {
    for (const entry of KNOWN_CONTENT_LANGUAGES) {
      expect(typeof entry.nativeName, `${entry.code}: nativeName type`).toBe('string');
      expect(entry.nativeName.length, `${entry.code}: nativeName length`).toBeGreaterThan(0);
    }
  });

  it('every entry has a non-empty string countryCode', () => {
    for (const entry of KNOWN_CONTENT_LANGUAGES) {
      expect(typeof entry.countryCode, `${entry.code}: countryCode type`).toBe('string');
      expect(entry.countryCode.length, `${entry.code}: countryCode length`).toBeGreaterThan(0);
    }
  });

  it('every entry has a boolean metric field', () => {
    for (const entry of KNOWN_CONTENT_LANGUAGES) {
      expect(typeof entry.metric, `${entry.code}: metric type`).toBe('boolean');
    }
  });

  it('codes are unique — no duplicates', () => {
    const codes = KNOWN_CONTENT_LANGUAGES.map(l => l.code);
    const unique = new Set(codes);
    // Find duplicates for a readable error message
    const dups = codes.filter((c, i) => codes.indexOf(c) !== i);
    expect(dups, `Duplicate codes: ${dups.join(', ')}`).toHaveLength(0);
    expect(unique.size).toBe(codes.length);
  });

  it('"en" is absent — English is always bundled separately as the mandatory base', () => {
    expect(KNOWN_CONTENT_LANGUAGES.find(l => l.code === 'en')).toBeUndefined();
  });

  it('all codes are lowercase (BCP-47 convention)', () => {
    for (const entry of KNOWN_CONTENT_LANGUAGES) {
      expect(entry.code, `${entry.code}: not lowercase`).toBe(entry.code.toLowerCase());
    }
  });

  it('all codes are valid BCP-47 format: 2-3 alpha, optionally followed by -2-3 alpha', () => {
    const pattern = /^[a-z]{2,3}(-[a-z]{2,4})?$/;
    for (const entry of KNOWN_CONTENT_LANGUAGES) {
      expect(
        pattern.test(entry.code),
        `"${entry.code}" is not valid BCP-47 format`
      ).toBe(true);
    }
  });

  it('all countryCode values are lowercase 2-letter alpha strings', () => {
    const pattern = /^[a-z]{2}$/;
    for (const entry of KNOWN_CONTENT_LANGUAGES) {
      expect(
        pattern.test(entry.countryCode),
        `"${entry.code}" has invalid countryCode: "${entry.countryCode}"`
      ).toBe(true);
    }
  });

  it('regional variants with 2-letter country subtags use the region part as countryCode', () => {
    // e.g. 'fr-be' → 'be', 'en-gb' → 'gb', 'pt-br' → 'br'
    // EXCLUDES script-subtag variants (4-letter like 'hans', 'hant') since those
    // encode a writing system, not a country (zh-hans → countryCode 'cn', not 'hans').
    const regionals = KNOWN_CONTENT_LANGUAGES.filter(l => {
      if (!l.code.includes('-')) return false;
      const regionPart = l.code.slice(l.code.indexOf('-') + 1);
      // Only check entries where the subtag is 2-letter (country, not 4-letter script)
      return regionPart.length === 2;
    });
    expect(regionals.length).toBeGreaterThan(0);
    for (const entry of regionals) {
      const regionPart = entry.code.slice(entry.code.indexOf('-') + 1);
      expect(
        entry.countryCode,
        `"${entry.code}": countryCode should be region part "${regionPart}"`
      ).toBe(regionPart);
    }
  });

  it('core English-speaking Commonwealth variants have metric=false (imperial)', () => {
    // These regions follow the SRD imperial convention.
    // NOTE: en-za (South Africa) uses metric in daily life and is correctly metric:true.
    const imperialVariants = ['en-gb', 'en-au', 'en-ca', 'en-nz', 'en-ie'];
    for (const code of imperialVariants) {
      const entry = KNOWN_CONTENT_LANGUAGES.find(l => l.code === code);
      expect(entry, `${code} must exist`).toBeDefined();
      expect(entry!.metric, `${code}: should be imperial (metric:false)`).toBe(false);
    }
  });

  it('contains expected base languages', () => {
    const codes = KNOWN_CONTENT_LANGUAGES.map(l => l.code);
    // Core European languages must be present
    const required = ['fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'sv', 'nb'];
    for (const code of required) {
      expect(codes, `missing base language "${code}"`).toContain(code);
    }
  });

  it('contains expected regional variants', () => {
    const codes = KNOWN_CONTENT_LANGUAGES.map(l => l.code);
    const required = ['fr-be', 'fr-ch', 'fr-ca', 'en-gb', 'en-au', 'de-at', 'pt-br', 'nl-be'];
    for (const code of required) {
      expect(codes, `missing regional variant "${code}"`).toContain(code);
    }
  });

  it('is sorted by nativeName (ascending, locale-aware)', () => {
    // Verify that the JSON array is in the same order that localeCompare produces.
    // This ensures the NewLanguageModal display grid is properly alphabetized.
    for (let i = 0; i < KNOWN_CONTENT_LANGUAGES.length - 1; i++) {
      const a = KNOWN_CONTENT_LANGUAGES[i].nativeName;
      const b = KNOWN_CONTENT_LANGUAGES[i + 1].nativeName;
      const comparison = a.localeCompare(b, 'en', { sensitivity: 'base' });
      expect(
        comparison,
        `Unsorted at index ${i}: "${a}" should come before "${b}"`
      ).toBeLessThanOrEqual(0);
    }
  });

  it('nativeName for fr-be is the full country name, not an abbreviation', () => {
    const frBe = KNOWN_CONTENT_LANGUAGES.find(l => l.code === 'fr-be');
    expect(frBe).toBeDefined();
    expect(frBe!.nativeName).toBe('Français (Belgique)');
    // Must NOT be an abbreviation
    expect(frBe!.nativeName).not.toContain('(BE)');
    expect(frBe!.nativeName).not.toContain('(be)');
  });

  it('nativeName for en-gb uses "United Kingdom", not an abbreviation', () => {
    const enGb = KNOWN_CONTENT_LANGUAGES.find(l => l.code === 'en-gb');
    expect(enGb).toBeDefined();
    expect(enGb!.nativeName).toBe('English (United Kingdom)');
    expect(enGb!.nativeName).not.toContain('(GB)');
    expect(enGb!.nativeName).not.toContain('(gb)');
  });

  it('nativeName for pt-br uses "Brasil", not "BR"', () => {
    const ptBr = KNOWN_CONTENT_LANGUAGES.find(l => l.code === 'pt-br');
    expect(ptBr).toBeDefined();
    expect(ptBr!.nativeName).toBe('Português (Brasil)');
    expect(ptBr!.nativeName).not.toContain('(BR)');
  });
});

// =============================================================================
// 2 — getContentLangDisplayName()
// =============================================================================

describe('getContentLangDisplayName() — native name resolution', () => {

  // --- English special case ---

  it('"en" → "English" (hardcoded, no locale file needed)', () => {
    expect(getContentLangDisplayName('en')).toBe('English');
  });

  // --- Known base languages from premade list ---

  it('"fr" → correct native name from premade list', () => {
    // DataLoader returns undefined in the test env; falls through to premade list.
    const name = getContentLangDisplayName('fr');
    expect(name.length).toBeGreaterThan(0);
    expect(typeof name).toBe('string');
    // Must not fall back to the uppercase sentinel
    expect(name).not.toBe('FR');
  });

  it('"de" → correct native name from premade list', () => {
    const name = getContentLangDisplayName('de');
    expect(name).toBe('Deutsch');
  });

  it('"es" → correct native name from premade list', () => {
    const name = getContentLangDisplayName('es');
    expect(name).not.toBe('ES');
    expect(name.length).toBeGreaterThan(0);
  });

  it('"ja" → correct native name from premade list', () => {
    const name = getContentLangDisplayName('ja');
    expect(name).not.toBe('JA');
    expect(name.length).toBeGreaterThan(0);
  });

  // --- Known regional variants from premade list ---

  it('"fr-be" → native name with full country name (from premade list)', () => {
    const name = getContentLangDisplayName('fr-be');
    // Should be the stored nativeName, not a composed fallback
    expect(name).toBe('Français (Belgique)');
  });

  it('"en-gb" → "English (United Kingdom)" (from premade list)', () => {
    expect(getContentLangDisplayName('en-gb')).toBe('English (United Kingdom)');
  });

  it('"pt-br" → correct native name (from premade list)', () => {
    expect(getContentLangDisplayName('pt-br')).toBe('Português (Brasil)');
  });

  it('"de-at" → correct native name (from premade list)', () => {
    expect(getContentLangDisplayName('de-at')).not.toBe('DE (AT)');
    expect(getContentLangDisplayName('de-at').length).toBeGreaterThan(0);
  });

  // --- Unlisted regional variant → composed fallback ---

  it('unlisted regional variant → composed as "<base> (REGION)"', () => {
    // 'de-us' is not in the premade list → compose from 'de' name + '(US)'
    const name = getContentLangDisplayName('de-us');
    expect(name).toBe('Deutsch (US)');
  });

  it('composed fallback uses the resolved base name, not the raw code', () => {
    // 'de-ch' IS in the premade list (returns 'Deutsch (Schweiz)'),
    // but a truly unlisted code like 'de-nz' should compose 'Deutsch (NZ)'.
    const name = getContentLangDisplayName('de-nz');
    expect(name).toBe('Deutsch (NZ)');
  });

  it('composed region is always uppercased', () => {
    // Ensure the region part appears in uppercase even if the code is lowercase.
    const name = getContentLangDisplayName('fr-jp');
    // 'fr-jp' is not in the premade list; base='fr', region='jp' → 'JP'
    expect(name).toContain('JP');
  });

  // --- Completely unknown codes ---

  it('completely unknown base code → uppercase code fallback', () => {
    expect(getContentLangDisplayName('xx')).toBe('XX');
    expect(getContentLangDisplayName('zzz')).toBe('ZZZ');
  });
});

// =============================================================================
// 3 — getContentLangCountryCode()
// =============================================================================

describe('getContentLangCountryCode() — flag country code resolution', () => {

  it('"en" → "us" (US flag — bare "en" defaults to American English)', () => {
    expect(getContentLangCountryCode('en')).toBe('us');
  });

  it('regional variant: extracts region part as the country code', () => {
    expect(getContentLangCountryCode('fr-be')).toBe('be');
    expect(getContentLangCountryCode('fr-ch')).toBe('ch');
    expect(getContentLangCountryCode('fr-ca')).toBe('ca');
    expect(getContentLangCountryCode('en-gb')).toBe('gb');
    expect(getContentLangCountryCode('en-au')).toBe('au');
    expect(getContentLangCountryCode('en-nz')).toBe('nz');
    expect(getContentLangCountryCode('de-at')).toBe('at');
    expect(getContentLangCountryCode('pt-br')).toBe('br');
    expect(getContentLangCountryCode('nl-be')).toBe('be');
  });

  it('regional variant country code is lowercase', () => {
    expect(getContentLangCountryCode('fr-BE')).toBe('be');
    expect(getContentLangCountryCode('EN-GB')).toBe('gb');
  });

  it('base language: returns countryCode from premade list', () => {
    // In test env, DataLoader returns undefined, so falls through to premade list.
    expect(getContentLangCountryCode('fr')).toBe('fr');
    expect(getContentLangCountryCode('de')).toBe('de');
    expect(getContentLangCountryCode('nl')).toBe('nl');
    expect(getContentLangCountryCode('sv')).toBe('se'); // Swedish → Sweden
    expect(getContentLangCountryCode('nb')).toBe('no'); // Norwegian → Norway
    expect(getContentLangCountryCode('el')).toBe('gr'); // Greek → Greece
    expect(getContentLangCountryCode('ja')).toBe('jp'); // Japanese → Japan
  });

  it('unknown base code → falls back to code itself', () => {
    expect(getContentLangCountryCode('xx')).toBe('xx');
    expect(getContentLangCountryCode('zz')).toBe('zz');
  });
});

// =============================================================================
// 4 — getContentLangUnitSystem()
// =============================================================================

describe('getContentLangUnitSystem() — metric/imperial resolution', () => {

  it('"en" → "imperial" (SRD baseline)', () => {
    expect(getContentLangUnitSystem('en')).toBe('imperial');
  });

  it('metric base languages return "metric"', () => {
    const metric = ['fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'ja', 'zh-hans'];
    for (const code of metric) {
      expect(getContentLangUnitSystem(code), `${code} should be metric`).toBe('metric');
    }
  });

  it('English regional variants are imperial (inherit from "en")', () => {
    // English is always imperial; all en-* variants should inherit that.
    expect(getContentLangUnitSystem('en-gb')).toBe('imperial');
    expect(getContentLangUnitSystem('en-au')).toBe('imperial');
    expect(getContentLangUnitSystem('en-ca')).toBe('imperial');
    expect(getContentLangUnitSystem('en-nz')).toBe('imperial');
    expect(getContentLangUnitSystem('en-ie')).toBe('imperial');
  });

  it('French regional variants are metric (inherit from "fr")', () => {
    expect(getContentLangUnitSystem('fr-be')).toBe('metric');
    expect(getContentLangUnitSystem('fr-ch')).toBe('metric');
    expect(getContentLangUnitSystem('fr-ca')).toBe('metric');
  });

  it('German regional variants are metric (inherit from "de")', () => {
    expect(getContentLangUnitSystem('de-at')).toBe('metric');
    expect(getContentLangUnitSystem('de-ch')).toBe('metric');
  });

  it('Portuguese regional variants are metric (inherit from "pt")', () => {
    expect(getContentLangUnitSystem('pt-br')).toBe('metric');
    expect(getContentLangUnitSystem('pt-pt')).toBe('metric');
  });

  it('completely unknown code defaults to "metric"', () => {
    // The codebase convention: most non-English languages use metric.
    // Unknown codes default to metric (conservative assumption).
    expect(getContentLangUnitSystem('xx')).toBe('metric');
    expect(getContentLangUnitSystem('zz-qq')).toBe('metric');
  });
});
