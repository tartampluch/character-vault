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
 *   - DataLoader.#filterByEnabledSources() via loadRuleSources()
 *     — tested indirectly by calling the private method flow via #applyGmOverrides
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

import { describe, it, expect, vi } from 'vitest';
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

    // Mock fetch to return empty file list (no files to load)
    const mockFetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/rules')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve([]),
        });
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
// 8. #filterByEnabledSources() — filter behavior
// =============================================================================

describe('DataLoader — #filterByEnabledSources() via loadRuleSources', () => {
  it('retains features from enabled sources', async () => {
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]),
    }));

    await loader.loadRuleSources(['srd_core'], JSON.stringify([
      { id: 'feat_core', category: 'feat', ruleSource: 'srd_core', grantedModifiers: [], grantedFeatures: [], tags: [] },
      { id: 'feat_homebrew', category: 'feat', ruleSource: 'homebrew_custom', grantedModifiers: [], grantedFeatures: [], tags: [] },
    ]));

    expect(loader.getFeature('feat_core')).toBeDefined();
    expect(loader.getFeature('feat_homebrew')).toBeUndefined(); // Filtered out
    vi.unstubAllGlobals();
  });

  it('config tables are also filtered by enabledRuleSources', async () => {
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]),
    }));

    await loader.loadRuleSources(['srd_core'], JSON.stringify([
      { tableId: 'config_xp_srd', ruleSource: 'srd_core', data: [{ level: 1, xp: 0 }] },
      { tableId: 'config_xp_homebrew', ruleSource: 'homebrew_custom', data: [{ level: 1, xp: 0 }] },
    ]));

    expect(loader.getConfigTable('config_xp_srd')).toBeDefined();
    expect(loader.getConfigTable('config_xp_homebrew')).toBeUndefined(); // Filtered
    vi.unstubAllGlobals();
  });

  it('gm_override ruleSource is exempt from filtering', async () => {
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]),
    }));

    await loader.loadRuleSources(['srd_core'], JSON.stringify([
      { id: 'gm_custom_curse', category: 'condition', ruleSource: 'gm_override', grantedModifiers: [], grantedFeatures: [], tags: [] },
    ]));

    // gm_override is always retained regardless of enabledRuleSources
    expect(loader.getFeature('gm_custom_curse')).toBeDefined();
    vi.unstubAllGlobals();
  });

  it('empty enabledRuleSources = no filtering (accept everything)', async () => {
    const loader = new DataLoader();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]),
    }));

    await loader.loadRuleSources([], JSON.stringify([
      { id: 'feat_xsrd', category: 'feat', ruleSource: 'homebrew_anything', grantedModifiers: [], grantedFeatures: [], tags: [] },
    ]));

    expect(loader.getFeature('feat_xsrd')).toBeDefined();
    vi.unstubAllGlobals();
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
          json: () => Promise.resolve([
            { id: 'feat_loaded', category: 'feat', ruleSource: 'srd_core', tags: ['general'], grantedModifiers: [], grantedFeatures: [] },
          ]),
        });
      }
      return Promise.reject(new Error('unexpected URL'));
    });
    vi.stubGlobal('fetch', mockFetch);

    await loader.loadRuleSources(['srd_core']);
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
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('does not contain a JSON array'));
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
