/**
 * @file src/tests/dataLoaderDirect.test.ts
 * @description Unit tests for DataLoader's synchronous/in-memory APIs.
 *
 * The DataLoader has two distinct layers:
 *   1. ASYNC LAYER  — loadRuleSources() / #loadRuleFile() — makes fetch() calls.
 *                     These are NOT tested here (require HTTP mocking).
 *   2. SYNC LAYER   — cacheFeature(), getFeature(), queryFeatures(), processEntity
 *                     via applyGmOverrides(), clearCache() — fully testable.
 *
 * This test suite focuses on the SYNC LAYER and the Merge Engine functions.
 * The mergeEngine.test.ts file already covers mergeArray/mergeLevelProgression/mergeChoices.
 * This file adds coverage for:
 *   - DataLoader.cacheFeature() + getFeature() round-trip           (line 656–658)
 *   - DataLoader.cacheConfigTable() + getConfigTable() round-trip   (lines 666–668)
 *   - DataLoader.getConfigValue() — row-based lookup                (lines 634–644)
 *   - DataLoader.queryFeatures() — tag / category queries           (lines 592–610)
 *   - DataLoader.getAllFeatures()                                    (lines 576–578)
 *   - DataLoader.clearCache()                                       (lines 673–677)
 *   - DataLoader.#processEntity() via the injectEntity() test helper
 *     (covers entity validation, array defaulting, replace/partial merge)
  *   - DataLoader.#applyGmOverrides — invalid JSON, non-array, valid override
 *
 * COVERAGE DELTA (from 67.29%):
 *   After these tests, the uncovered DataLoader lines should be only the async
 *   loadRuleSources() → fetch() calls and their error branches (unavoidable without
 *   HTTP mocking, which is out of scope for pure unit tests).
 *
 * @see src/lib/engine/DataLoader.ts
 * @see ARCHITECTURE.md section 17 — Data Override Engine
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { DataLoader } from '$lib/engine/DataLoader';
import type { ConfigTable } from '$lib/engine/DataLoader';
import type { Feature } from '$lib/types/feature';

// =============================================================================
// HELPERS — minimal valid Feature objects for testing
// =============================================================================

function makeFeature(id: string, ruleSource = 'srd_core', tags: string[] = []): Feature {
  return {
    id,
    category: 'feat',
    label: { en: id },
    description: { en: '' },
    tags,
    grantedModifiers: [],
    grantedFeatures: [],
    ruleSource,
  } as unknown as Feature;
}

function makeConfigTable(tableId: string, data: Record<string, unknown>[]): ConfigTable {
  return { tableId, ruleSource: 'srd_core', data };
}

/**
 * Wraps a flat array of raw entities into the required rule-file wrapper format.
 * Used in fetch mocks so test data matches the format DataLoader expects.
 */
function wrapEntities(entities: unknown[]): { supportedLanguages: string[]; entities: unknown[] } {
  return { supportedLanguages: ['en'], entities };
}

// =============================================================================
// 1. cacheFeature() + getFeature() round-trip
// =============================================================================

describe('DataLoader — cacheFeature() and getFeature()', () => {
  it('stores and retrieves a feature by ID', () => {
    const loader = new DataLoader();
    const feat = makeFeature('feat_power_attack');
    loader.cacheFeature(feat);
    expect(loader.getFeature('feat_power_attack')).toBe(feat);
  });

  it('returns undefined for a feature that was never cached', () => {
    const loader = new DataLoader();
    expect(loader.getFeature('feat_nonexistent')).toBeUndefined();
  });

  it('overwrites an existing feature with the same ID', () => {
    const loader = new DataLoader();
    const v1 = makeFeature('feat_cleave', 'srd_core', ['general']);
    const v2 = makeFeature('feat_cleave', 'homebrew', ['general', 'fighter_bonus_feat']);
    loader.cacheFeature(v1);
    loader.cacheFeature(v2);
    expect(loader.getFeature('feat_cleave')?.ruleSource).toBe('homebrew');
    expect(loader.getFeature('feat_cleave')?.tags).toContain('fighter_bonus_feat');
  });
});

// =============================================================================
// 2. cacheConfigTable() + getConfigTable() round-trip
// =============================================================================

describe('DataLoader — cacheConfigTable() and getConfigTable()', () => {
  it('stores and retrieves a config table by tableId', () => {
    const loader = new DataLoader();
    const table = makeConfigTable('config_xp_thresholds', [
      { level: 1, xpRequired: 0 },
      { level: 2, xpRequired: 1000 },
    ]);
    loader.cacheConfigTable(table);
    const result = loader.getConfigTable('config_xp_thresholds');
    expect(result).toBeDefined();
    expect(result?.data).toHaveLength(2);
  });

  it('returns undefined for a table that was never cached', () => {
    const loader = new DataLoader();
    expect(loader.getConfigTable('config_nonexistent')).toBeUndefined();
  });

  it('overwrites an existing table with the same tableId', () => {
    const loader = new DataLoader();
    loader.cacheConfigTable(makeConfigTable('config_test', [{ a: 1 }]));
    loader.cacheConfigTable(makeConfigTable('config_test', [{ a: 2 }, { b: 3 }]));
    expect(loader.getConfigTable('config_test')?.data).toHaveLength(2);
  });
});

// =============================================================================
// 3. getConfigValue() — row-based lookup
// =============================================================================

describe('DataLoader — getConfigValue()', () => {
  it('returns the correct value for a matching row', () => {
    const loader = new DataLoader();
    loader.cacheConfigTable(makeConfigTable('config_xp', [
      { level: 1, xpRequired: 0 },
      { level: 2, xpRequired: 1000 },
      { level: 3, xpRequired: 3000 },
    ]));
    expect(loader.getConfigValue('config_xp', 'level', 2, 'xpRequired')).toBe(1000);
  });

  it('returns undefined when table does not exist', () => {
    const loader = new DataLoader();
    expect(loader.getConfigValue('config_missing', 'level', 1, 'xp')).toBeUndefined();
  });

  it('returns undefined when no row matches the key value', () => {
    const loader = new DataLoader();
    loader.cacheConfigTable(makeConfigTable('config_xp', [{ level: 1, xpRequired: 0 }]));
    expect(loader.getConfigValue('config_xp', 'level', 99, 'xpRequired')).toBeUndefined();
  });

  it('returns undefined when the value field does not exist on the row', () => {
    const loader = new DataLoader();
    loader.cacheConfigTable(makeConfigTable('config_xp', [{ level: 1, xpRequired: 0 }]));
    expect(loader.getConfigValue('config_xp', 'level', 1, 'nonexistent_field')).toBeUndefined();
  });
});

// =============================================================================
// 4. queryFeatures() — declarative query system
// =============================================================================

describe('DataLoader — queryFeatures()', () => {
  function setupLoader(): DataLoader {
    const loader = new DataLoader();
    loader.cacheFeature({ id: 'feat_power_attack', category: 'feat', tags: ['general', 'fighter_bonus_feat'], grantedModifiers: [], grantedFeatures: [], ruleSource: 'srd_core', label: { en: 'Power Attack' }, description: { en: '' } } as unknown as Feature);
    loader.cacheFeature({ id: 'feat_cleave',        category: 'feat', tags: ['general', 'fighter_bonus_feat'], grantedModifiers: [], grantedFeatures: [], ruleSource: 'srd_core', label: { en: 'Cleave' }, description: { en: '' } } as unknown as Feature);
    loader.cacheFeature({ id: 'race_human',          category: 'race', tags: ['race', 'humanoid', 'size_medium'],     grantedModifiers: [], grantedFeatures: [], ruleSource: 'srd_core', label: { en: 'Human' }, description: { en: '' } } as unknown as Feature);
    loader.cacheFeature({ id: 'condition_stunned',   category: 'condition', tags: ['condition'],                    grantedModifiers: [], grantedFeatures: [], ruleSource: 'srd_core', label: { en: 'Stunned' }, description: { en: '' } } as unknown as Feature);
    return loader;
  }

  it('tag query returns all features with that tag', () => {
    const loader = setupLoader();
    const results = loader.queryFeatures('tag:fighter_bonus_feat');
    expect(results).toHaveLength(2);
    expect(results.map(f => f.id)).toContain('feat_power_attack');
    expect(results.map(f => f.id)).toContain('feat_cleave');
  });

  it('category query returns all features of that category', () => {
    const loader = setupLoader();
    const results = loader.queryFeatures('category:feat');
    expect(results).toHaveLength(2);
  });

  it('category:race returns races only', () => {
    const loader = setupLoader();
    const results = loader.queryFeatures('category:race');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('race_human');
  });

  it('intersection query (tag+tag) narrows results', () => {
    const loader = setupLoader();
    // Both feats have "general" + "fighter_bonus_feat"
    const results = loader.queryFeatures('tag:general+tag:fighter_bonus_feat');
    expect(results).toHaveLength(2);
    // A condition tag would not match general
    const narrow = loader.queryFeatures('tag:condition+tag:fighter_bonus_feat');
    expect(narrow).toHaveLength(0);
  });

  it('unknown query format logs a warning and returns no results', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = setupLoader();
    const results = loader.queryFeatures('invalid:something');
    expect(results).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown query format'));
    consoleSpy.mockRestore();
  });

  it('returns empty array when no features are cached', () => {
    const loader = new DataLoader();
    expect(loader.queryFeatures('tag:general')).toHaveLength(0);
  });
});

// =============================================================================
// 5. getAllFeatures()
// =============================================================================

describe('DataLoader — getAllFeatures()', () => {
  it('returns all cached features', () => {
    const loader = new DataLoader();
    loader.cacheFeature(makeFeature('feat_a'));
    loader.cacheFeature(makeFeature('feat_b'));
    loader.cacheFeature(makeFeature('feat_c'));
    expect(loader.getAllFeatures()).toHaveLength(3);
  });

  it('returns empty array when cache is empty', () => {
    const loader = new DataLoader();
    expect(loader.getAllFeatures()).toHaveLength(0);
  });
});

// =============================================================================
// 6. clearCache()
// =============================================================================

describe('DataLoader — clearCache()', () => {
  it('removes all features from the cache', () => {
    const loader = new DataLoader();
    loader.cacheFeature(makeFeature('feat_test'));
    loader.clearCache();
    expect(loader.getAllFeatures()).toHaveLength(0);
    expect(loader.getFeature('feat_test')).toBeUndefined();
  });

  it('removes all config tables from the cache', () => {
    const loader = new DataLoader();
    loader.cacheConfigTable(makeConfigTable('config_test', [{ a: 1 }]));
    loader.clearCache();
    expect(loader.getConfigTable('config_test')).toBeUndefined();
  });

  it('resets isLoaded to false', () => {
    const loader = new DataLoader();
    // Manually set isLoaded to true (normally set by loadRuleSources)
    (loader as unknown as { isLoaded: boolean }).isLoaded = true;
    loader.clearCache();
    expect(loader.isLoaded).toBe(false);
  });
});

// =============================================================================
// 7. #processEntity() via the internal pipeline (using applyGmOverrides proxy)
//    NOTE: #processEntity is private; we test it by injecting raw JSON
//    through the DataLoader's `#applyGmOverrides` → `#processEntity` path
//    (the #applyGmOverrides method is also private, but we can access it
//    through a raw-JSON call via a public method that accepts JSON strings)
// =============================================================================

describe('DataLoader — #processEntity() via direct cache path', () => {
  /**
   * cacheFeature() stores a pre-built Feature directly.
   * To test #processEntity() (which handles raw JSON with validation),
   * we use loadRuleSources() with mocked fetch OR we test by accessing
   * the loader after it has processed entities via #applyGmOverrides.
   *
   * We mock the global fetch to avoid HTTP calls.
   */

  it('processes a valid feature entity from GM overrides JSON', async () => {
    const loader = new DataLoader();

    // Mock fetch: empty file list (no static rule files) + global-rules returns empty
    const mockFetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/rules')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve([]),
        });
      }
      if (url === '/api/global-rules') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.reject(new Error('unexpected URL'));
    });
    vi.stubGlobal('fetch', mockFetch);

    await loader.loadRuleSources(['srd_core'], JSON.stringify([
      {
        id: 'feat_test_power',
        category: 'feat',
        ruleSource: 'srd_core',
        label: { en: 'Test Power Attack' },
        tags: ['general'],
        grantedModifiers: [],
        grantedFeatures: [],
      },
    ]));

    const feat = loader.getFeature('feat_test_power');
    expect(feat).toBeDefined();
    expect(feat?.id).toBe('feat_test_power');

    vi.unstubAllGlobals();
  });

  it('processEntity: entity missing id → skipped with warning', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new DataLoader();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal('fetch', mockFetch);

    await loader.loadRuleSources(['srd_core'], JSON.stringify([
      { category: 'feat', ruleSource: 'srd_core' }, // Missing id
    ]));
    // Should have warned and not added to cache
    // console.warn is called with (message, entity) — check first arg
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing or invalid'),
      expect.anything()
    );
    expect(loader.getAllFeatures()).toHaveLength(0);

    vi.unstubAllGlobals();
    consoleSpy.mockRestore();
  });

  it('processEntity: entity missing category → skipped with warning', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]),
    }));

    await loader.loadRuleSources(['srd_core'], JSON.stringify([
      { id: 'feat_no_cat', ruleSource: 'srd_core' }, // Missing category
    ]));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('missing or invalid `category`'));

    vi.unstubAllGlobals();
    consoleSpy.mockRestore();
  });

  it('processEntity: entity missing ruleSource → defaults to "unknown"', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]),
    }));

    // enabledRuleSources empty → accepts everything regardless of ruleSource
    await loader.loadRuleSources([], JSON.stringify([
      { id: 'feat_no_source', category: 'feat', grantedModifiers: [], grantedFeatures: [], tags: [] },
    ]));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('missing `ruleSource`'));
    // Feature should still be added (with ruleSource defaulted to "unknown")
    expect(loader.getFeature('feat_no_source')).toBeDefined();

    vi.unstubAllGlobals();
    consoleSpy.mockRestore();
  });

  it('processEntity: grantedFeatures non-array → reset to []', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]),
    }));

    await loader.loadRuleSources([], JSON.stringify([
      { id: 'feat_bad_features', category: 'feat', ruleSource: 'test', grantedModifiers: [], grantedFeatures: 'invalid_string' },
    ]));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('non-array `grantedFeatures`'));
    const feat = loader.getFeature('feat_bad_features');
    expect(Array.isArray(feat?.grantedFeatures)).toBe(true);

    vi.unstubAllGlobals();
    consoleSpy.mockRestore();
  });

  it('processEntity: grantedModifiers non-array → reset to []', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]),
    }));

    await loader.loadRuleSources([], JSON.stringify([
      { id: 'feat_bad_mods', category: 'feat', ruleSource: 'test', grantedModifiers: 'invalid', grantedFeatures: [] },
    ]));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('non-array `grantedModifiers`'));
    const feat = loader.getFeature('feat_bad_mods');
    expect(Array.isArray(feat?.grantedModifiers)).toBe(true);

    vi.unstubAllGlobals();
    consoleSpy.mockRestore();
  });

  it('processEntity: configTable entity stored by tableId', async () => {
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]),
    }));

    await loader.loadRuleSources([], JSON.stringify([
      { tableId: 'config_test_levels', ruleSource: 'srd_core', data: [{ level: 1, xp: 0 }] },
    ]));
    expect(loader.getConfigTable('config_test_levels')).toBeDefined();

    vi.unstubAllGlobals();
  });

  it('#applyGmOverrides: invalid JSON string logs warning and does nothing', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]),
    }));

    await loader.loadRuleSources(['srd_core'], '{ invalid json }');
    // console.warn('[DataLoader] Failed to parse GM global overrides JSON:', err)
    // — called with two args: message string and the SyntaxError
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse GM global overrides'),
      expect.any(SyntaxError)
    );
    expect(loader.getAllFeatures()).toHaveLength(0);

    vi.unstubAllGlobals();
    consoleSpy.mockRestore();
  });

  it('#applyGmOverrides: non-array JSON logs warning', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]),
    }));

    await loader.loadRuleSources(['srd_core'], '"not_an_array"');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('not a JSON array')
    );

    vi.unstubAllGlobals();
    consoleSpy.mockRestore();
  });
});

// =============================================================================
// 8. File-path based source filtering
// =============================================================================
// The DataLoader now filters by FILE PATH, not by ruleSource ID.
// enabledSources is a list of relative paths like "00_d20srd_core/races.json".
// Only files whose sortKey matches an enabled path are fetched and loaded.
// GM overrides and homebrew are injected separately (always active).
// =============================================================================

describe('DataLoader — file-path based source filtering via loadRuleSources', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('loads entities ONLY from the enabled file path (skips unenabled files)', async () => {
    const loader = new DataLoader();

    // Discovery returns TWO files; only races.json is enabled
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/rules') {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(['/rules/races.json', '/rules/classes.json']),
        });
      }
      if (url === '/api/global-rules') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url === '/rules/races.json') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(wrapEntities([
            { id: 'race_human', category: 'race', ruleSource: 'srd_core', tags: ['race'], grantedModifiers: [], grantedFeatures: [] },
          ])),
        });
      }
      if (url === '/rules/classes.json') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(wrapEntities([
            { id: 'class_fighter', category: 'class', ruleSource: 'srd_core', tags: ['class'], grantedModifiers: [], grantedFeatures: [] },
          ])),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal('fetch', mockFetch);

    // Only enable races.json
    await loader.loadRuleSources(['races.json']);

    expect(loader.getFeature('race_human')).toBeDefined();      // enabled
    expect(loader.getFeature('class_fighter')).toBeUndefined(); // not enabled
    expect(mockFetch).toHaveBeenCalledWith('/rules/races.json');
    expect(mockFetch).not.toHaveBeenCalledWith('/rules/classes.json');
  });

  it('empty enabledSources loads ALL discovered files (permissive default)', async () => {
    const loader = new DataLoader();
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/rules') {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(['/rules/races.json', '/rules/classes.json']),
        });
      }
      if (url === '/api/global-rules') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url === '/rules/races.json') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(wrapEntities([
          { id: 'race_elf', category: 'race', ruleSource: 'srd_core', tags: [], grantedModifiers: [], grantedFeatures: [] },
        ])) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(wrapEntities([
        { id: 'class_rogue', category: 'class', ruleSource: 'srd_core', tags: [], grantedModifiers: [], grantedFeatures: [] },
      ])) });
    });
    vi.stubGlobal('fetch', mockFetch);

    await loader.loadRuleSources([]); // empty = load everything

    expect(loader.getFeature('race_elf')).toBeDefined();
    expect(loader.getFeature('class_rogue')).toBeDefined();
  });

  it('enabling a subset of files fine-grained — e.g. no prestige classes', async () => {
    const loader = new DataLoader();
    const coreFiles: string[] = [
      '/rules/00_d20srd_core/races.json',
      '/rules/00_d20srd_core/classes.json',
      '/rules/00_d20srd_core/prestige_classes.json',
    ];
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/rules') {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(coreFiles),
        });
      }
      if (url === '/api/global-rules') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('prestige')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(wrapEntities([
          { id: 'prestige_arcane_archer', category: 'class', ruleSource: 'srd_core', tags: [], grantedModifiers: [], grantedFeatures: [] },
        ])) });
      }
      if (url.includes('races')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(wrapEntities([
          { id: 'race_dwarf', category: 'race', ruleSource: 'srd_core', tags: [], grantedModifiers: [], grantedFeatures: [] },
        ])) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(wrapEntities([
        { id: 'class_wizard', category: 'class', ruleSource: 'srd_core', tags: [], grantedModifiers: [], grantedFeatures: [] },
      ])) });
    });
    vi.stubGlobal('fetch', mockFetch);

    // Only enable races.json — NOT prestige_classes.json
    await loader.loadRuleSources([
      '00_d20srd_core/races.json',
      '00_d20srd_core/classes.json',
    ]);

    expect(loader.getFeature('race_dwarf')).toBeDefined();
    expect(loader.getFeature('class_wizard')).toBeDefined();
    expect(loader.getFeature('prestige_arcane_archer')).toBeUndefined(); // excluded
  });

  it('config_tables are included when their file path is enabled', async () => {
    const loader = new DataLoader();
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/rules') {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(['/rules/00_d20srd_core/00_d20srd_core_config_tables.json']),
        });
      }
      if (url === '/api/global-rules') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(wrapEntities([
        { tableId: 'config_skill_definitions', ruleSource: 'srd_core', data: [{ id: 'skill_climb' }] },
      ])) });
    });
    vi.stubGlobal('fetch', mockFetch);

    await loader.loadRuleSources(['00_d20srd_core/00_d20srd_core_config_tables.json']);
    expect(loader.getConfigTable('config_skill_definitions')).toBeDefined();
  });

  it('config_tables are excluded when their file path is NOT enabled', async () => {
    const loader = new DataLoader();
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/rules') {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(['/rules/00_d20srd_core/00_d20srd_core_config_tables.json', '/rules/races.json']),
        });
      }
      if (url === '/api/global-rules') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('00_d20srd_core_config_tables')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(wrapEntities([
          { tableId: 'config_skill_definitions', ruleSource: 'srd_core', data: [] },
        ])) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(wrapEntities([
        { id: 'race_gnome', category: 'race', ruleSource: 'srd_core', tags: [], grantedModifiers: [], grantedFeatures: [] },
      ])) });
    });
    vi.stubGlobal('fetch', mockFetch);

    // Only enable races.json — NOT 00_d20srd_core_config_tables.json
    await loader.loadRuleSources(['races.json']);

    expect(loader.getFeature('race_gnome')).toBeDefined();
    expect(loader.getConfigTable('config_skill_definitions')).toBeUndefined();
  });

  it('GM overrides (gmGlobalOverrides param) are always loaded regardless of file paths', async () => {
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]),
    }));

    await loader.loadRuleSources(['some_file.json'], JSON.stringify([
      { id: 'gm_custom_curse', category: 'condition', ruleSource: 'gm_override', grantedModifiers: [], grantedFeatures: [], tags: [] },
    ]));

    // GM overrides are injected via the gmGlobalOverrides param, not file discovery
    expect(loader.getFeature('gm_custom_curse')).toBeDefined();
  });

  it('enabling multiple files loads entities from all of them', async () => {
    const loader = new DataLoader();
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/rules') {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(['/rules/a.json', '/rules/b.json', '/rules/c.json']),
        });
      }
      if (url === '/api/global-rules') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      const id = url.includes('a.json') ? 'feat_a' : url.includes('b.json') ? 'feat_b' : 'feat_c';
      return Promise.resolve({ ok: true, json: () => Promise.resolve(wrapEntities([
        { id, category: 'feat', ruleSource: 'srd_core', tags: [], grantedModifiers: [], grantedFeatures: [] },
      ])) });
    });
    vi.stubGlobal('fetch', mockFetch);

    await loader.loadRuleSources(['a.json', 'b.json']); // not c.json

    expect(loader.getFeature('feat_a')).toBeDefined();
    expect(loader.getFeature('feat_b')).toBeDefined();
    expect(loader.getFeature('feat_c')).toBeUndefined();
  });

  it('passing a Feature.ruleSource ID (not a file path) silently filters all file-based entities', async () => {
    // FOOTGUN DOCUMENTATION — enabledSources takes FILE PATHS, not ruleSource IDs.
    //
    // 'srd_core' is the Feature.ruleSource identifier embedded inside JSON files
    // (e.g. { "ruleSource": "srd_core" }). It is NOT a file path.
    //
    // When passed to loadRuleSources(), it creates the strict whitelist { 'srd_core' }.
    // The file-path filter checks:
    //   enabledFilePaths.has(sortKey)  where sortKey = "00_d20srd_core/races.json"
    // "00_d20srd_core/races.json" !== "srd_core" → every file is skipped.
    // Result: zero file-based entities load, with NO error or warning.
    //
    // The historical bug: createDefaultCampaignSettings() returned ['srd_core'],
    // which caused new campaigns to silently load nothing. Fixed by defaulting to [].
    //
    // Correct usage:
    //   []                                → load everything (permissive mode)
    //   ['00_d20srd_core/races.json']     → load only that specific file
    const loader = new DataLoader();
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/rules') {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(['/rules/00_d20srd_core/races.json']),
        });
      }
      if (url === '/api/global-rules') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      // This handler is for the races.json file — should NOT be called
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(wrapEntities([
          { id: 'race_human', category: 'race', ruleSource: 'srd_core', tags: [], grantedModifiers: [], grantedFeatures: [] },
        ])),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    // Pass a ruleSource ID instead of a file path — the historical bug
    await loader.loadRuleSources(['srd_core']);

    // race_human is NOT loaded: sortKey "00_d20srd_core/races.json" ≠ "srd_core"
    expect(loader.getFeature('race_human')).toBeUndefined();
    // The races.json file was never fetched (filtered before the HTTP call)
    expect(mockFetch).not.toHaveBeenCalledWith('/rules/00_d20srd_core/races.json');
  });
});

// =============================================================================
// 8b. #loadRuleFile() — fetching actual rule files (via mock)
// =============================================================================

describe('DataLoader — #loadRuleFile() via loadRuleSources with non-empty file list', () => {
  it('loads features from a rule file returned by discovery', async () => {
    const loader = new DataLoader();

    // Discovery returns one file path
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/rules') {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(['/rules/test_features.json']),
        });
      }
      if (url === '/rules/test_features.json') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(wrapEntities([
            { id: 'feat_loaded', category: 'feat', ruleSource: 'srd_core', tags: ['general'], grantedModifiers: [], grantedFeatures: [] },
          ])),
        });
      }
      if (url === '/api/global-rules') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.reject(new Error('unexpected URL'));
    });
    vi.stubGlobal('fetch', mockFetch);

    await loader.loadRuleSources(['test_features.json']);
    expect(loader.getFeature('feat_loaded')).toBeDefined();
    expect(loader.isLoaded).toBe(true);
    vi.unstubAllGlobals();
  });

  it('#loadRuleFile: non-ok response logs warning', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url === '/rules') {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(['/rules/bad_file.json']),
        });
      }
      return Promise.resolve({ ok: false, status: 404 }); // File not found
    }));

    await loader.loadRuleSources([]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch rule file'));
    vi.unstubAllGlobals();
    consoleSpy.mockRestore();
  });

  it('#loadRuleFile: non-array JSON response logs warning', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url === '/rules') {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(['/rules/invalid.json']),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ not: 'an array' }), // Non-array response
      });
    }));

    await loader.loadRuleSources([]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('is not a valid rule-file wrapper object'));
    vi.unstubAllGlobals();
    consoleSpy.mockRestore();
  });

  it('#loadRuleFile: fetch throws → logs warning and continues', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url === '/rules') {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(['/rules/throws.json']),
        });
      }
      if (url === '/api/global-rules') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.reject(new Error('Network error'));
    }));

    await expect(loader.loadRuleSources([])).resolves.not.toThrow();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error loading rule file'), expect.any(Error));
    vi.unstubAllGlobals();
    consoleSpy.mockRestore();
  });

  it('discovery fallback: uses manifest.json when /rules returns non-ok HTTP status', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const consoleSpy2 = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url === '/rules') {
        // HTTP 404 → throw error → catch → fallback to manifest
        return Promise.resolve({ ok: false, status: 404, headers: { get: () => 'application/json' } });
      }
      if (url === '/rules/manifest.json') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url === '/api/global-rules') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.reject(new Error('unexpected'));
    }));

    await loader.loadRuleSources([]);
    expect(loader.isLoaded).toBe(true);
    vi.unstubAllGlobals();
    consoleSpy.mockRestore();
    consoleSpy2.mockRestore();
  });

  it('discovery fallback: manifest.json also returns non-ok → logs warning', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleSpy2 = vi.spyOn(console, 'info').mockImplementation(() => {});
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url === '/rules') {
        return Promise.resolve({ ok: false, status: 503, headers: { get: () => 'text/html' } });
      }
      if (url === '/rules/manifest.json') {
        return Promise.resolve({ ok: false, status: 404 }); // Manifest also not found
      }
      if (url === '/api/global-rules') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.reject(new Error('unexpected'));
    }));

    await loader.loadRuleSources([]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('manifest.json not available'));
    vi.unstubAllGlobals();
    consoleSpy.mockRestore();
    consoleSpy2.mockRestore();
  });

  it('discovery fallback: uses manifest.json when /rules returns non-JSON', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url === '/rules') {
        return Promise.resolve({ ok: true, headers: { get: () => 'text/html' }, json: () => Promise.resolve([]) });
      }
      if (url === '/rules/manifest.json') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url === '/api/global-rules') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.reject(new Error('unexpected'));
    }));

    await loader.loadRuleSources([]);
    expect(loader.isLoaded).toBe(true);
    vi.unstubAllGlobals();
    consoleSpy.mockRestore();
  });
});

// =============================================================================
// 9. partial merge via processEntity (replace + partial)
// =============================================================================

describe('DataLoader — replace and partial merge via processEntity', () => {
  it('replace (default): second entity with same ID fully overwrites first', async () => {
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]),
    }));

    await loader.loadRuleSources([], JSON.stringify([
      { id: 'feat_target', category: 'feat', ruleSource: 'base', tags: ['original'], grantedModifiers: [], grantedFeatures: [] },
      { id: 'feat_target', category: 'feat', ruleSource: 'override', tags: ['replaced'], grantedModifiers: [], grantedFeatures: [] },
    ]));

    const feat = loader.getFeature('feat_target');
    expect(feat?.ruleSource).toBe('override');
    expect(feat?.tags).toEqual(['replaced']);
    vi.unstubAllGlobals();
  });

  it('partial merge: appends new tag without removing existing ones', async () => {
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]),
    }));

    await loader.loadRuleSources([], JSON.stringify([
      { id: 'class_druid', category: 'class', ruleSource: 'srd_core', tags: ['divine_caster', 'nature'], grantedModifiers: [], grantedFeatures: ['class_feature_wild_shape'] },
      { id: 'class_druid', category: 'class', ruleSource: 'homebrew_circle', merge: 'partial', tags: ['circle_winter'], grantedFeatures: ['-class_feature_wild_shape', 'class_feature_ice_form'] },
    ]));

    const druid = loader.getFeature('class_druid');
    expect(druid?.tags).toContain('divine_caster');   // preserved
    expect(druid?.tags).toContain('circle_winter');   // appended
    expect(druid?.grantedFeatures).toContain('class_feature_ice_form');     // added
    expect(druid?.grantedFeatures).not.toContain('class_feature_wild_shape'); // removed
    vi.unstubAllGlobals();
  });
});

// =============================================================================
// 10. DataLoader — locale discovery methods
// =============================================================================

describe('DataLoader — getAvailableLanguages()', () => {
  it('fresh instance always includes the built-in UI languages (en, fr)', () => {
    const loader = new DataLoader();
    const langs = loader.getAvailableLanguages();
    expect(langs).toContain('en');
    expect(langs).toContain('fr');
  });

  it('returns a sorted array', () => {
    const loader = new DataLoader();
    const langs = loader.getAvailableLanguages();
    const sorted = [...langs].sort();
    expect(langs).toEqual(sorted);
  });

  it('clearCache() preserves built-in languages', () => {
    const loader = new DataLoader();
    loader.clearCache();
    expect(loader.getAvailableLanguages()).toContain('en');
    expect(loader.getAvailableLanguages()).toContain('fr');
  });
});

describe('DataLoader — loadRuleSources() error path: manifest.json fetch throws', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs a warn and continues when fetch("/rules/manifest.json") throws', async () => {
    const consoleSpy  = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleSpy2 = vi.spyOn(console, 'info').mockImplementation(() => {});
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url === '/rules') {
        // Simulate non-JSON response body so DataLoader falls back to manifest
        return Promise.resolve({ ok: true, headers: { get: () => 'text/html' }, json: () => Promise.resolve([]) });
      }
      if (url === '/rules/manifest.json') {
        // Throw on the manifest fetch to hit line 554
        return Promise.reject(new Error('manifest network failure'));
      }
      if (url === '/api/global-rules') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.reject(new Error('unexpected url: ' + url));
    }));

    await loader.loadRuleSources([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load manifest.json'),
      expect.anything(),
    );
    consoleSpy.mockRestore();
    consoleSpy2.mockRestore();
  });
});

describe('DataLoader — loadRuleSources() error paths: /api/global-rules', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs a warn when /api/global-rules returns non-404 HTTP error (e.g. 401)', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url === '/rules') return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]) });
      if (url === '/api/global-rules') return Promise.resolve({ ok: false, status: 401 });
      return Promise.reject(new Error('unexpected'));
    }));

    await loader.loadRuleSources([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/global-rules returned HTTP'),
      401,
    );
    consoleSpy.mockRestore();
  });

  it('logs a debug message and continues when /api/global-rules fetch throws', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url === '/rules') return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]) });
      if (url === '/api/global-rules') return Promise.reject(new Error('no backend'));
      return Promise.reject(new Error('unexpected'));
    }));

    // Must not throw — network failure on global-rules is non-fatal
    await expect(loader.loadRuleSources([])).resolves.toBeUndefined();
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/global-rules unavailable'),
    );
    debugSpy.mockRestore();
  });
});

describe('DataLoader — #applyCampaignHomebrew() error branches', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('silently ignores malformed JSON passed as campaign homebrew rules', async () => {
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]),
    }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 3rd param is campaignHomebrewRulesJson; pass invalid JSON
    await loader.loadRuleSources([], undefined, '{{not json at all}}');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse campaign homebrew rules JSON'),
      expect.anything(),
    );
    expect(loader.getAllFeatures()).toHaveLength(0);
    warnSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('silently ignores a valid JSON value that is not an array (e.g. an object)', async () => {
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]),
    }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 3rd param: a JSON object (not an array) — the non-array guard fires
    await loader.loadRuleSources([], undefined, JSON.stringify({ id: 'feat_foo' }));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not a JSON array'),
    );
    warnSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe('DataLoader — object-keyed config table normalisation (line 770)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalises an object-keyed config table data field to an array', async () => {
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]),
    }));

    // 3rd param: campaign homebrew — inject a config table with object-keyed data
    await loader.loadRuleSources([], undefined, JSON.stringify([
      {
        tableId: 'config_test_object_keyed',
        ruleSource: 'srd_core',
        data: {
          row_a: { key: 'A', value: 1 },
          row_b: { key: 'B', value: 2 },
        },
      },
    ]));

    const table = loader.getConfigTable('config_test_object_keyed');
    expect(table).toBeDefined();
    // After normalisation, data should be an array of the object's values
    expect(Array.isArray(table!.data)).toBe(true);
    expect(table!.data).toHaveLength(2);
    vi.unstubAllGlobals();
  });
});

describe('DataLoader — getHomebrewRules("global") branch', () => {
  it('returns an empty array when no global rule sources are registered', () => {
    const loader = new DataLoader();
    // No files loaded → _globalRuleSourceIds is empty
    expect(loader.getHomebrewRules('global')).toEqual([]);
  });

  it('returns only features whose ruleSource is tracked as a global source', () => {
    const loader = new DataLoader();
    // Directly populate the cache with two features from different sources
    const globalFeat  = makeFeature('feat_global',   'my_global_rules');
    const campaignFeat = makeFeature('feat_campaign', 'user_homebrew');
    loader.cacheFeature(globalFeat);
    loader.cacheFeature(campaignFeat);

    // Manually register one ruleSource as "global"
    (loader as unknown as { _globalRuleSourceIds: Set<string> })
      ._globalRuleSourceIds.add('my_global_rules');

    const results = loader.getHomebrewRules('global');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('feat_global');
  });
});

describe('DataLoader — loadExternalLocales() and getLocaleDisplayName()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds community language codes to available languages on success', async () => {
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { code: 'de', language: 'Deutsch', unitSystem: 'metric' },
        { code: 'es', language: 'Español', unitSystem: 'imperial' },
      ]),
    }));

    await loader.loadExternalLocales();

    const langs = loader.getAvailableLanguages();
    expect(langs).toContain('de');
    expect(langs).toContain('es');
  });

  it('getLocaleDisplayName() returns the self-name provided by the API', async () => {
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { code: 'de', language: 'Deutsch', unitSystem: 'metric' },
      ]),
    }));

    await loader.loadExternalLocales();
    expect(loader.getLocaleDisplayName('de')).toBe('Deutsch');
  });

  it('getLocaleDisplayName() returns undefined for codes not in external locales', () => {
    const loader = new DataLoader();
    // No fetch call — external locales are empty
    expect(loader.getLocaleDisplayName('de')).toBeUndefined();
    expect(loader.getLocaleDisplayName('en')).toBeUndefined(); // en is built-in, not external
  });

  it('silently ignores a non-ok response (offline mode)', async () => {
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }));

    // Must not throw; available languages remain unchanged
    await expect(loader.loadExternalLocales()).resolves.toBeUndefined();
    expect(loader.getAvailableLanguages()).toContain('en');
  });

  it('silently ignores a network error (offline mode)', async () => {
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    await expect(loader.loadExternalLocales()).resolves.toBeUndefined();
    expect(loader.getAvailableLanguages()).toContain('en');
  });

  it('clearCache() preserves external locales so they survive campaign switches', async () => {
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { code: 'de', language: 'Deutsch', unitSystem: 'metric' },
      ]),
    }));

    await loader.loadExternalLocales();
    loader.clearCache(); // Simulates campaign switch

    // External locale code must survive the clear
    expect(loader.getAvailableLanguages()).toContain('de');
    expect(loader.getLocaleDisplayName('de')).toBe('Deutsch');
  });
});
