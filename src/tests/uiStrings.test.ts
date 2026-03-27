/**
 * @file src/tests/uiStrings.test.ts
 * @description Unit tests for src/lib/i18n/ui-strings.ts — the UI chrome i18n module.
 *
 * COVERAGE TARGET
 *   Maximum practical branch / statement coverage of ui-strings.ts.
 *   loadUiLocale()'s fetch path is exercised via vi.stubGlobal('fetch', …).
 *   The private _loadedLocales and _pluralCache Maps are exercised indirectly
 *   through the public ui() / uiN() API.
 *
 * WHAT IS TESTED
 *   1. SUPPORTED_UI_LANGUAGES — registry shape and required entries.
 *   2. LANG_UNIT_SYSTEM        — Map built from the registry; unknown-code lookup.
 *   3. registerLangUnitSystem()— new registration; no-op guard for existing codes.
 *   4. loadUiLocale()          — URL pattern, cache no-op, $meta stripping,
 *                                !ok response, network throw, json() rejection.
 *   5. UI_STRINGS              — key presence, type checking, plural object shape.
 *   6. ui()                    — English baseline, locale override, fallback to EN,
 *                                plural-object "other" / "one" / empty paths,
 *                                missing-key warning.
 *   7. uiN()                   — singular / plural / zero, {n} replacement,
 *                                plain-string shortcut, PluralRules cache reuse,
 *                                locale override, fallback paths, missing-key warning.
 *
 * ISOLATION STRATEGY
 *   • Module-level state (_loadedLocales, LANG_UNIT_SYSTEM, _pluralCache) is
 *     shared within this file but isolated from all other test files because
 *     Vitest gives each file its own module registry.
 *   • A synthetic "de" locale is pre-loaded in a top-level beforeAll by stubbing
 *     global.fetch.  It covers all ui() / uiN() locale branches.
 *   • loadUiLocale() tests each use a unique code ('lc-1' … 'lc-6') so they
 *     cannot hit the early-return cache guard from each other.
 *   • All fetch stubs are cleaned up by a top-level afterEach.
 *
 * @see src/lib/i18n/ui-strings.ts  The module under test.
 * @see src/lib/types/i18n.ts        Shared i18n type definitions.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import {
  SUPPORTED_UI_LANGUAGES,
  LANG_UNIT_SYSTEM,
  registerLangUnitSystem,
  loadUiLocale,
  loadUiLocaleFromObject,
  UI_STRINGS,
  ui,
  uiN,
  buildLocalizedString,
} from '$lib/i18n/ui-strings';
import type { UnitSystem } from '$lib/types/i18n';

// =============================================================================
// GLOBAL SETUP — pre-load a synthetic German ('de') locale
// =============================================================================
// German has the same plural categories as English (one / other), which keeps
// count-based assertions straightforward.  The locale intentionally contains:
//   • a string key that overrides a known English key
//   • a string key that exists ONLY in this locale (not in UI_STRINGS)
//   • a full plural key (both 'one' and 'other')
//   • a partial plural key (only 'one') — covers the 'other' missing branch
//   • an empty plural key                — covers the all-forms-missing branch
//   • an override of a built-in English plural key

const MOCK_DE_LOCALE = {
  '$meta': { code: 'de', language: 'Deutsch', unitSystem: 'metric' },
  // Overrides a known English string:
  'login.title': 'Anmelden, um fortzufahren',
  // Exists only in this locale (not in UI_STRINGS):
  'test.de.only': 'Nur auf Deutsch',
  // Plural — both forms + {n}:
  'test.de.plural.full': { one: 'DE {n} Ding', other: 'DE {n} Dinge' },
  // Plural — only 'one' form (exercises entry['other'] → undefined fallback):
  'test.de.plural.only.one': { one: 'DE nur eins' },
  // Plural — no forms at all (exercises final key fallback):
  'test.de.plural.empty': {},
  // Overrides a built-in English plural key:
  'settings.rule_sources.files': { one: 'DE Datei', other: 'DE {n} Dateien' },
};

beforeAll(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_DE_LOCALE),
    }),
  );
  await loadUiLocale('de');
  vi.unstubAllGlobals();
});

// Ensure every test that stubs fetch leaves a clean slate.
afterEach(() => {
  vi.unstubAllGlobals();
});

// =============================================================================
// 1 — SUPPORTED_UI_LANGUAGES
// =============================================================================

describe('SUPPORTED_UI_LANGUAGES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(SUPPORTED_UI_LANGUAGES)).toBe(true);
    expect(SUPPORTED_UI_LANGUAGES.length).toBeGreaterThanOrEqual(2);
  });

  it('contains an "en" entry with unitSystem "imperial"', () => {
    const en = SUPPORTED_UI_LANGUAGES.find(l => l.code === 'en');
    expect(en).toBeDefined();
    expect(en!.unitSystem).toBe('imperial');
  });

  it('contains a "fr" entry with unitSystem "metric"', () => {
    const fr = SUPPORTED_UI_LANGUAGES.find(l => l.code === 'fr');
    expect(fr).toBeDefined();
    expect(fr!.unitSystem).toBe('metric');
  });

  it('every entry has a non-empty string code', () => {
    for (const { code } of SUPPORTED_UI_LANGUAGES) {
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
    }
  });

  it('every entry has a valid unitSystem ("imperial" or "metric")', () => {
    const valid: UnitSystem[] = ['imperial', 'metric'];
    for (const { unitSystem } of SUPPORTED_UI_LANGUAGES) {
      expect(valid).toContain(unitSystem);
    }
  });

  it('codes are unique — no duplicate language codes', () => {
    const codes = SUPPORTED_UI_LANGUAGES.map(l => l.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });
});

// =============================================================================
// 2 — LANG_UNIT_SYSTEM
// =============================================================================

describe('LANG_UNIT_SYSTEM', () => {
  it('is a Map instance', () => {
    expect(LANG_UNIT_SYSTEM).toBeInstanceOf(Map);
  });

  it('maps "en" → "imperial"', () => {
    expect(LANG_UNIT_SYSTEM.get('en')).toBe('imperial');
  });

  it('maps "fr" → "metric"', () => {
    expect(LANG_UNIT_SYSTEM.get('fr')).toBe('metric');
  });

  it('returns undefined for an unregistered code', () => {
    expect(LANG_UNIT_SYSTEM.get('qqq-completely-unknown')).toBeUndefined();
  });

  it('contains every entry that appears in SUPPORTED_UI_LANGUAGES', () => {
    for (const { code, unitSystem } of SUPPORTED_UI_LANGUAGES) {
      expect(LANG_UNIT_SYSTEM.get(code)).toBe(unitSystem);
    }
  });

  it('size equals the number of SUPPORTED_UI_LANGUAGES entries (at construction)', () => {
    // The map starts with exactly the built-in entries (before any registerLangUnitSystem calls).
    // Because other tests may have added entries, we just assert ≥.
    expect(LANG_UNIT_SYSTEM.size).toBeGreaterThanOrEqual(SUPPORTED_UI_LANGUAGES.length);
  });
});

// =============================================================================
// 3 — registerLangUnitSystem()
// =============================================================================

describe('registerLangUnitSystem()', () => {
  it('adds a new code with "metric" to LANG_UNIT_SYSTEM', () => {
    registerLangUnitSystem('test-reg-m', 'metric');
    expect(LANG_UNIT_SYSTEM.get('test-reg-m')).toBe('metric');
  });

  it('adds a new code with "imperial" to LANG_UNIT_SYSTEM', () => {
    registerLangUnitSystem('test-reg-i', 'imperial');
    expect(LANG_UNIT_SYSTEM.get('test-reg-i')).toBe('imperial');
  });

  it('is a no-op for "en" — existing built-in "imperial" is preserved', () => {
    registerLangUnitSystem('en', 'metric'); // attempt to overwrite
    expect(LANG_UNIT_SYSTEM.get('en')).toBe('imperial');
  });

  it('is a no-op for "fr" — existing built-in "metric" is preserved', () => {
    registerLangUnitSystem('fr', 'imperial'); // attempt to overwrite
    expect(LANG_UNIT_SYSTEM.get('fr')).toBe('metric');
  });

  it('first registration wins — subsequent calls with the same code are ignored', () => {
    registerLangUnitSystem('test-reg-first-wins', 'metric');
    registerLangUnitSystem('test-reg-first-wins', 'imperial');
    expect(LANG_UNIT_SYSTEM.get('test-reg-first-wins')).toBe('metric');
  });

  it('is a no-op for a previously-registered community code', () => {
    registerLangUnitSystem('test-reg-community', 'metric');
    registerLangUnitSystem('test-reg-community', 'metric'); // second call
    expect(LANG_UNIT_SYSTEM.get('test-reg-community')).toBe('metric');
  });
});

// =============================================================================
// 4 — loadUiLocale()
// =============================================================================

describe('loadUiLocale()', () => {
  it('is a no-op for "en" — fetch is never called', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await loadUiLocale('en');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches from /locales/{code}.json for a new locale code', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ '$meta': { code: 'lc-1' }, 'lc1.key': 'lc1 value' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await loadUiLocale('lc-1');
    expect(fetchMock).toHaveBeenCalledWith('/locales/lc-1.json');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for an already-cached code — fetch is called only once total', async () => {
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ '$meta': { code: 'lc-2' } }),
        });
      }),
    );
    await loadUiLocale('lc-2'); // first call: fetches and caches
    await loadUiLocale('lc-2'); // second call: cache hit, no fetch
    expect(callCount).toBe(1);
  });

  it('loads string keys into the locale cache (accessible via ui())', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        '$meta': { code: 'lc-3' },
        'lc3.greeting': 'Bonjour depuis lc-3',
      }),
    }));
    await loadUiLocale('lc-3');
    expect(ui('lc3.greeting', 'lc-3')).toBe('Bonjour depuis lc-3');
  });

  it('strips $meta so it is not accessible as a UI string key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        '$meta': { code: 'lc-4', language: 'Meta Strip Test' },
        'lc4.real': 'Real Value',
      }),
    }));
    await loadUiLocale('lc-4');
    // The real key works:
    expect(ui('lc4.real', 'lc-4')).toBe('Real Value');
    // $meta must not be accessible — returns the key itself with a warning:
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(ui('$meta', 'lc-4')).toBe('$meta');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('$meta'));
    warnSpy.mockRestore();
  });

  it('silently skips if the server returns a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await loadUiLocale('lc-5');
    // Locale not loaded — ui() falls back to English:
    expect(ui('login.title', 'lc-5')).toBe(UI_STRINGS['login.title'] as string);
  });

  it('silently skips if fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network offline')));
    await loadUiLocale('lc-6');
    expect(ui('login.title', 'lc-6')).toBe(UI_STRINGS['login.title'] as string);
  });

  it('silently skips if json() rejects (malformed body)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('Unexpected token')),
    }));
    await loadUiLocale('lc-7');
    expect(ui('login.title', 'lc-7')).toBe(UI_STRINGS['login.title'] as string);
  });
});

// =============================================================================
// 5 — UI_STRINGS
// =============================================================================

describe('UI_STRINGS', () => {
  it('has more than 100 keys (comprehensive baseline)', () => {
    expect(Object.keys(UI_STRINGS).length).toBeGreaterThan(100);
  });

  it('login namespace: string values exist and are non-empty', () => {
    const keys = ['login.title', 'login.username', 'login.password', 'login.sign_in'];
    for (const key of keys) {
      expect(typeof UI_STRINGS[key]).toBe('string');
      expect((UI_STRINGS[key] as string).length).toBeGreaterThan(0);
    }
  });

  it('navigation namespace: string values exist', () => {
    expect(typeof UI_STRINGS['nav.campaigns']).toBe('string');
    expect(typeof UI_STRINGS['app.title']).toBe('string');
    expect(typeof UI_STRINGS['nav.vault']).toBe('string');
  });

  it('common namespace: string values exist', () => {
    expect(typeof UI_STRINGS['common.cancel']).toBe('string');
    expect(typeof UI_STRINGS['common.save']).toBe('string');
  });

  it('language selector namespace: UI chrome keys are strings', () => {
    // Only lang.label, lang.select_tooltip, and lang.en live in the English baseline.
    // All other language self-names (lang.fr = "Français", lang.de = "Deutsch", …)
    // live exclusively in their own locale JSON files — not in UI_STRINGS.
    const langKeys = ['lang.label', 'lang.select_tooltip', 'lang.en'];
    for (const key of langKeys) {
      expect(typeof UI_STRINGS[key], `key "${key}"`).toBe('string');
    }
  });

  it('language selector: lang.fr / lang.de are NOT in the English baseline', () => {
    // Each language self-names only in its own locale file.
    // Cross-language entries like "lang.fr = French" were removed to prevent
    // speakers from seeing their language listed in a foreign name (e.g. "Chinois").
    expect(UI_STRINGS['lang.fr']).toBeUndefined();
    expect(UI_STRINGS['lang.de']).toBeUndefined();
  });

  it('"settings.rule_sources.entities" is a plural object with both forms', () => {
    const val = UI_STRINGS['settings.rule_sources.entities'] as Record<string, string>;
    expect(typeof val).toBe('object');
    expect(val['one']).toBeTruthy();
    expect(val['other']).toBeTruthy();
  });

  it('"settings.rule_sources.files" is a plural object with both forms', () => {
    const val = UI_STRINGS['settings.rule_sources.files'] as Record<string, string>;
    expect(typeof val).toBe('object');
    expect(val['one']).toBeTruthy();
    expect(val['other']).toBeTruthy();
  });

  it('"settings.overrides.entry" plural forms contain the {n} placeholder', () => {
    const val = UI_STRINGS['settings.overrides.entry'] as Record<string, string>;
    expect(val['one']).toContain('{n}');
    expect(val['other']).toContain('{n}');
  });

  it('all plain-string values are non-empty', () => {
    for (const [key, value] of Object.entries(UI_STRINGS)) {
      if (typeof value === 'string') {
        expect(value.length, `UI_STRINGS["${key}"] is an empty string`).toBeGreaterThan(0);
      }
    }
  });

  it('all plural-object values have at least one CLDR form', () => {
    for (const [key, value] of Object.entries(UI_STRINGS)) {
      if (typeof value === 'object' && value !== null) {
        const forms = Object.keys(value);
        expect(forms.length, `UI_STRINGS["${key}"] plural object has no forms`).toBeGreaterThan(0);
      }
    }
  });
});

// =============================================================================
// 6 — ui()
// =============================================================================

describe('ui() — string resolution', () => {
  // --- English baseline ---

  it('resolves a known key with lang="en"', () => {
    expect(ui('login.title', 'en')).toBe('Sign in to continue');
  });

  it('defaults lang to "en" when the argument is omitted', () => {
    expect(ui('login.title')).toBe('Sign in to continue');
  });

  it('resolves a plural key for "en" — returns the "other" form (non-count-aware)', () => {
    expect(ui('settings.rule_sources.entities', 'en')).toBe('entities');
    expect(ui('settings.rule_sources.files', 'en')).toBe('files');
  });

  it('resolves a plural key for "en" — "other" takes precedence when both forms exist', () => {
    // The key has { one: 'entity', other: 'entities' }; ui() always returns 'other'.
    expect(ui('settings.rule_sources.entities', 'en')).toBe('entities');
  });

  // --- Missing key ---

  it('returns the key itself for an unknown key', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const key = 'this.key.absolutely.does.not.exist';
    expect(ui(key)).toBe(key);
    warnSpy.mockRestore();
  });

  it('logs a console.warn for an unknown key containing the key name', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const key = 'another.missing.key.xyz';
    ui(key);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(key));
    warnSpy.mockRestore();
  });

  // --- Loaded locale ('de', pre-loaded in beforeAll) ---

  it('returns the locale string when a loaded non-English locale is requested', () => {
    expect(ui('login.title', 'de')).toBe('Anmelden, um fortzufahren');
  });

  it('returns a locale-only key not present in UI_STRINGS', () => {
    expect(ui('test.de.only', 'de')).toBe('Nur auf Deutsch');
  });

  it('falls back to English for a key absent from the loaded locale', () => {
    // 'nav.campaigns' is in UI_STRINGS but deliberately not in MOCK_DE_LOCALE.
    expect(ui('nav.campaigns', 'de')).toBe(UI_STRINGS['nav.campaigns'] as string);
  });

  it('falls back to English for a language that was never loaded', () => {
    // 'it' (Italian) has never been loaded — no _loadedLocales entry.
    expect(ui('login.title', 'it')).toBe(UI_STRINGS['login.title'] as string);
  });

  it('returns locale plural "other" form for a loaded locale plural key', () => {
    // MOCK_DE_LOCALE overrides 'settings.rule_sources.files' with DE forms.
    // ui() is not count-aware — it always picks 'other'.
    expect(ui('settings.rule_sources.files', 'de')).toBe('DE {n} Dateien');
  });

  // --- Plural edge cases in loaded locale ---

  it('returns "one" form when locale plural has only "one" (no "other")', () => {
    // MOCK_DE_LOCALE: 'test.de.plural.only.one': { one: 'DE nur eins' }
    // entry['other'] is undefined → fallback to entry['one']
    expect(ui('test.de.plural.only.one', 'de')).toBe('DE nur eins');
  });

  it('returns the key when locale plural has no forms at all', () => {
    // MOCK_DE_LOCALE: 'test.de.plural.empty': {}
    // entry['other'] and entry['one'] are both undefined → return key
    expect(ui('test.de.plural.empty', 'de')).toBe('test.de.plural.empty');
  });
});

// =============================================================================
// 7 — uiN()
// =============================================================================

describe('uiN() — count-aware plural resolution', () => {
  // --- English baseline ---

  // 'settings.rule_sources.files' = { one: 'file', other: 'files' } — no {n} placeholder.
  // uiN() selects the correct CLDR form and returns it verbatim (no substitution needed).
  it('count=1 → "one" form selected ("file" — no {n} placeholder in this key)', () => {
    expect(uiN('settings.rule_sources.files', 1, 'en')).toBe('file');
  });

  it('count=5 → "other" form selected ("files")', () => {
    expect(uiN('settings.rule_sources.files', 5, 'en')).toBe('files');
  });

  it('count=0 → "other" form (English has no "zero" CLDR category)', () => {
    expect(uiN('settings.rule_sources.files', 0, 'en')).toBe('files');
  });

  // 'settings.overrides.entry' = { one: '{n} override entry', other: '{n} override entries' }
  // This key has {n} — use it to verify the replacement logic.
  it('resolves override-entry plural: count=1 (one form + {n} replaced)', () => {
    expect(uiN('settings.overrides.entry', 1, 'en')).toBe('1 override entry');
  });

  it('resolves override-entry plural: count=3 (other form + {n} replaced)', () => {
    expect(uiN('settings.overrides.entry', 3, 'en')).toBe('3 override entries');
  });

  it('{n} replacement works for any count value', () => {
    expect(uiN('settings.overrides.entry', 42, 'en')).toBe('42 override entries');
    expect(uiN('settings.overrides.entry', 100, 'en')).toBe('100 override entries');
  });

  // --- Plain string key (no plural logic) ---

  it('returns the plain string unchanged when the key maps to a string', () => {
    expect(uiN('login.title', 1, 'en')).toBe('Sign in to continue');
    expect(uiN('login.title', 99, 'en')).toBe('Sign in to continue');
  });

  // --- Missing key ---

  it('returns the key itself for an unknown key', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const key = 'uiN.missing.key.zzz';
    expect(uiN(key, 5, 'en')).toBe(key);
    warnSpy.mockRestore();
  });

  it('logs console.warn for an unknown key', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const key = 'uiN.warn.key.aaa';
    uiN(key, 1, 'en');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(key));
    warnSpy.mockRestore();
  });

  // --- PluralRules cache reuse ---

  it('returns consistent results on repeated calls for the same lang (cache reuse)', () => {
    // Both calls use the cached Intl.PluralRules for 'en'; use a key with {n}.
    const r1 = uiN('settings.overrides.entry', 42, 'en');
    const r2 = uiN('settings.overrides.entry', 42, 'en');
    expect(r1).toBe(r2);
    expect(r1).toBe('42 override entries');
  });

  it('constructs a fresh PluralRules for a language used for the first time', () => {
    // 'fr' hasn't been used in uiN yet — first call creates the PluralRules cache entry.
    // _loadedLocales has no 'fr' locale → falls back to UI_STRINGS.
    // French count=1 → CLDR 'one' → '{n} override entry' → '1 override entry'.
    const result = uiN('settings.overrides.entry', 1, 'fr');
    expect(result).toBe('1 override entry');
  });

  // --- Loaded locale ('de') ---

  it('uses loaded locale plural forms when the language is loaded', () => {
    // MOCK_DE_LOCALE overrides 'settings.rule_sources.files'
    expect(uiN('settings.rule_sources.files', 1, 'de')).toBe('DE Datei');
    expect(uiN('settings.rule_sources.files', 7, 'de')).toBe('DE 7 Dateien');
  });

  it('resolves locale-only plural key with {n}: count=1', () => {
    // 'test.de.plural.full' exists only in MOCK_DE_LOCALE
    expect(uiN('test.de.plural.full', 1, 'de')).toBe('DE 1 Ding');
  });

  it('resolves locale-only plural key with {n}: count=3', () => {
    expect(uiN('test.de.plural.full', 3, 'de')).toBe('DE 3 Dinge');
  });

  // --- Fallback chain: entry['other'] missing → entry['one'] ---

  it('falls back to "one" form when the selected form is absent', () => {
    // 'test.de.plural.only.one': { one: 'DE nur eins' }
    // count=5 → form='other' in German → entry['other'] undefined → entry['one']
    // No {n} in 'DE nur eins', so string is returned as-is.
    expect(uiN('test.de.plural.only.one', 5, 'de')).toBe('DE nur eins');
  });

  it('returns the key when all plural forms are absent', () => {
    // 'test.de.plural.empty': {}
    // entry[form] / entry['other'] / entry['one'] all undefined → return key
    expect(uiN('test.de.plural.empty', 3, 'de')).toBe('test.de.plural.empty');
  });

  // --- Fallback to English when locale not loaded ---

  it('falls back to English plural for a language that was never loaded', () => {
    // 'ja' (Japanese) is not loaded → uses UI_STRINGS.
    // Japanese CLDR: all counts map to 'other' (no grammatical singular/plural distinction).
    // UI_STRINGS['settings.rule_sources.files']['other'] = 'files' (no {n}), so both return 'files'.
    expect(uiN('settings.rule_sources.files', 1, 'ja')).toBe('files');
    expect(uiN('settings.rule_sources.files', 5, 'ja')).toBe('files');
  });

  it('falls back to English for a language that has no locale but has a known plural key', () => {
    // 'es' is not loaded → falls back to UI_STRINGS English strings.
    expect(uiN('settings.rule_sources.files', 1, 'es')).toMatch(/file/i);
    // With {n} key: 'es' not loaded → UI_STRINGS → count=5 → 'other' → '5 override entries'
    expect(uiN('settings.overrides.entry', 5, 'es')).toBe('5 override entries');
  });
});

// =============================================================================
// 8. buildLocalizedString() — constructs LocalizedString from a ui-strings key
// =============================================================================

describe('buildLocalizedString() — build LocalizedString from a ui-strings key', () => {
  // Pre-load a synthetic Italian ('it') locale so we can verify that loaded
  // locales are included in the returned object.
  beforeAll(() => {
    loadUiLocaleFromObject('it', {
      'lang.en':         'Inglese',
      'combat.hp.title': 'Punti ferita',
    });
  });

  it('returns an object with at least an "en" key for a known string key', () => {
    const result = buildLocalizedString('lang.en');
    expect(typeof result).toBe('object');
    expect(result.en).toBe('English');
  });

  it('includes loaded-locale translations when the key exists in a loaded locale', () => {
    // 'it' was injected above with 'lang.en' → 'Inglese'
    const result = buildLocalizedString('lang.en');
    expect(result.it).toBe('Inglese');
  });

  it('omits loaded-locale code when that code does not have the key', () => {
    // 'it' locale has 'lang.en' but NOT 'lang.label'
    const result = buildLocalizedString('lang.label');
    expect(result.en).toBeTruthy(); // English baseline is always present
    expect(result.it).toBeUndefined();
  });

  it('falls back to the key itself as the "en" value when the key is missing from UI_STRINGS', () => {
    // An entirely unknown key produces { en: key } as graceful fallback.
    const result = buildLocalizedString('totally.unknown.key.xyz');
    expect(result.en).toBe('totally.unknown.key.xyz');
  });

  it('falls back to the key for a plural-object value (not a plain string)', () => {
    // Plural keys are objects like { one: '…', other: '…' }.
    // buildLocalizedString() expects plain strings; for plurals it falls back to the key.
    // 'settings.rule_sources.files' is a plural key in UI_STRINGS.
    const result = buildLocalizedString('settings.rule_sources.files');
    expect(result.en).toBe('settings.rule_sources.files');
  });
});

// =============================================================================
// 9. loadUiLocaleFromObject() — 'en' guard branch
// =============================================================================

describe('loadUiLocaleFromObject() — "en" is a no-op (English is always built-in)', () => {
  it('calling with code "en" does not modify _loadedLocales (guard branch)', () => {
    // The function has an early return for 'en' to protect the bundled baseline.
    // This test just verifies it doesn't throw and has no observable side-effect.
    const enBefore = ui('lang.en', 'en');
    loadUiLocaleFromObject('en', { 'lang.en': 'OVERRIDDEN' });
    const enAfter = ui('lang.en', 'en');
    // English should remain unchanged — the injection was silently ignored.
    expect(enAfter).toBe(enBefore);
  });
});
