/**
 * @file src/tests/storageManager.test.ts
 * @description Unit tests for StorageManager — dual-backend persistence layer.
 *
 * StorageManager has two layers:
 *   1. SYNC LAYER (localStorage): saveCharacter, loadCharacter, deleteCharacter,
 *      listCharacterIds, loadAllCharacters, saveSettings, loadSettings,
 *      saveActiveCharacterId, loadActiveCharacterId.
 *      → FULLY TESTABLE by mocking localStorage via vi.stubGlobal.
 *
 *   2. ASYNC API LAYER (fetch calls to PHP): saveCharacterToApi, loadAllCharactersFromApi,
 *      deleteCharacterFromApi, saveGmOverridesToApi, startPolling/stopPolling.
 *      → Partially testable by mocking fetch.
 *
 * COVERAGE TARGET: All synchronous localStorage-based methods + helper functions
 *                  + deleteCharacterFromApi() (added in the deletion feature).
 *
 * STRATEGY — localStorage mock:
 *   Node.js does not have localStorage. We use vi.stubGlobal() to inject a
 *   Map-backed in-memory implementation that behaves identically to the DOM API.
 *   Each test gets a fresh storage map to avoid cross-test state pollution.
 *
 * @see src/lib/engine/StorageManager.ts
 * @see ARCHITECTURE.md Phase 14.6 — StorageManager specification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageManager, setCsrfToken, debounce } from '$lib/engine/StorageManager';
import { createEmptyCharacter } from '$lib/engine/GameEngine.svelte';
import type { Character } from '$lib/types/character';

// =============================================================================
// MOCK localStorage
// =============================================================================

/**
 * Creates a fresh in-memory localStorage mock for each test.
 * Exposes the same interface as the DOM's localStorage object.
 */
function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem:    (key: string) => store.get(key) ?? null,
    setItem:    (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear:      () => { store.clear(); },
    key:        (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
}

let localStorageMock: ReturnType<typeof createLocalStorageMock>;

beforeEach(() => {
  localStorageMock = createLocalStorageMock();
  // Stub `window` so StorageManager#checkAvailability() sees a browser-like
  // environment (Node.js 25 has native localStorage but no `window`, which
  // would trigger a --localstorage-file warning and cause isAvailable = false).
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', localStorageMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// =============================================================================
// HELPER — minimal Character object for testing
// =============================================================================

function makeChar(id: string, name = 'Test'): Character {
  const char = createEmptyCharacter(id, name);
  char.id = id;
  char.name = name;
  return char;
}

// =============================================================================
// 1. Availability check
// =============================================================================

describe('StorageManager — availability check', () => {
  it('isAvailable = true when localStorage is accessible', () => {
    const sm = new StorageManager();
    expect((sm as unknown as { isAvailable: boolean }).isAvailable).toBe(true);
  });

  it('isAvailable = false when localStorage throws on setItem', () => {
    const brokenStorage = {
      getItem:    () => null,
      setItem:    () => { throw new Error('storage full'); },
      removeItem: () => {},
      clear:      () => {},
      key:        () => null,
      length:     0,
    };
    vi.stubGlobal('localStorage', brokenStorage);
    const sm = new StorageManager();
    expect((sm as unknown as { isAvailable: boolean }).isAvailable).toBe(false);
  });
});

// =============================================================================
// 2. saveCharacter() + loadCharacter()
// =============================================================================

describe('StorageManager — saveCharacter() and loadCharacter()', () => {
  it('saves and retrieves a character by ID', () => {
    const sm = new StorageManager();
    const char = makeChar('char_001');
    expect(sm.saveCharacter(char)).toBe(true);
    const loaded = sm.loadCharacter('char_001');
    expect(loaded?.id).toBe('char_001');
    expect(loaded?.name).toBe('Test');
  });

  it('returns null for an ID that was never saved', () => {
    const sm = new StorageManager();
    expect(sm.loadCharacter('char_nonexistent')).toBeNull();
  });

  it('returns false when isAvailable = false', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error(); }, getItem: () => null, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 });
    const sm = new StorageManager();
    expect(sm.saveCharacter(makeChar('char_fail'))).toBe(false);
  });

  it('logs warning and returns false when character has no ID', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sm = new StorageManager();
    const char = makeChar('');
    char.id = '';
    expect(sm.saveCharacter(char)).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('no ID'));
    consoleSpy.mockRestore();
  });

  it('adds to character index on first save', () => {
    const sm = new StorageManager();
    sm.saveCharacter(makeChar('char_a'));
    expect(sm.listCharacterIds()).toContain('char_a');
  });

  it('does not duplicate ID in index on second save', () => {
    const sm = new StorageManager();
    const char = makeChar('char_a');
    sm.saveCharacter(char);
    sm.saveCharacter(char); // Save again
    expect(sm.listCharacterIds().filter(id => id === 'char_a')).toHaveLength(1);
  });
});

// =============================================================================
// 3. deleteCharacter()
// =============================================================================

describe('StorageManager — deleteCharacter()', () => {
  it('removes a character and its ID from the index', () => {
    const sm = new StorageManager();
    sm.saveCharacter(makeChar('char_del'));
    expect(sm.deleteCharacter('char_del')).toBe(true);
    expect(sm.loadCharacter('char_del')).toBeNull();
    expect(sm.listCharacterIds()).not.toContain('char_del');
  });

  it('returns false when trying to delete a non-existent character', () => {
    const sm = new StorageManager();
    expect(sm.deleteCharacter('char_missing')).toBe(false);
  });

  it('returns false when storage is unavailable', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error(); }, getItem: () => null, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 });
    const sm = new StorageManager();
    expect(sm.deleteCharacter('char_any')).toBe(false);
  });
});

// =============================================================================
// 4. listCharacterIds()
// =============================================================================

describe('StorageManager — listCharacterIds()', () => {
  it('returns empty array when no characters saved', () => {
    const sm = new StorageManager();
    expect(sm.listCharacterIds()).toEqual([]);
  });

  it('returns IDs of all saved characters', () => {
    const sm = new StorageManager();
    sm.saveCharacter(makeChar('c1'));
    sm.saveCharacter(makeChar('c2'));
    sm.saveCharacter(makeChar('c3'));
    expect(sm.listCharacterIds()).toHaveLength(3);
    expect(sm.listCharacterIds()).toContain('c1');
    expect(sm.listCharacterIds()).toContain('c3');
  });
});

// =============================================================================
// 5. loadAllCharacters()
// =============================================================================

describe('StorageManager — loadAllCharacters()', () => {
  it('returns all saved characters', () => {
    const sm = new StorageManager();
    sm.saveCharacter(makeChar('c1', 'Alice'));
    sm.saveCharacter(makeChar('c2', 'Bob'));
    const all = sm.loadAllCharacters();
    expect(all).toHaveLength(2);
    expect(all.map(c => c.name)).toContain('Alice');
  });

  it('returns empty array when no characters saved', () => {
    const sm = new StorageManager();
    expect(sm.loadAllCharacters()).toEqual([]);
  });

  it('skips characters that fail to load (warns)', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sm = new StorageManager();
    sm.saveCharacter(makeChar('c1'));
    // Corrupt the stored JSON
    localStorageMock.setItem('cv_character_c1', '{invalid json}');
    const all = sm.loadAllCharacters();
    expect(all).toHaveLength(0);
    consoleSpy.mockRestore();
  });
});

// =============================================================================
// 6. saveSettings() + loadSettings()
// =============================================================================

describe('StorageManager — saveSettings() and loadSettings()', () => {
  it('saves and retrieves campaign settings', () => {
    const sm = new StorageManager();
    const settings = {
      language: 'fr' as const,
      statGeneration: { method: 'point_buy' as const, rerollOnes: false, pointBuyBudget: 32 },
      diceRules: { explodingTwenties: true },
      variantRules: { vitalityWoundPoints: false, gestalt: false },
      enabledRuleSources: ['srd_core', 'srd_psionics'],
    };
    expect(sm.saveSettings(settings)).toBe(true);
    const loaded = sm.loadSettings();
    expect(loaded?.language).toBe('fr');
    expect(loaded?.statGeneration.pointBuyBudget).toBe(32);
  });

  it('returns default settings when nothing has been saved', () => {
    const sm = new StorageManager();
    const settings = sm.loadSettings();
    // Should return default settings (not null/undefined)
    expect(settings).toBeDefined();
    expect(settings?.language).toBe('en'); // Default language is English
  });

  it('returns false when storage is unavailable', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error(); }, getItem: () => null, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 });
    const sm = new StorageManager();
    expect(sm.saveSettings({} as import('$lib/types/settings').CampaignSettings)).toBe(false);
  });
});

// =============================================================================
// 7. saveActiveCharacterId() + loadActiveCharacterId()
// =============================================================================

describe('StorageManager — saveActiveCharacterId() and loadActiveCharacterId()', () => {
  it('saves and retrieves the active character ID', () => {
    const sm = new StorageManager();
    sm.saveActiveCharacterId('char_active_001');
    expect(sm.loadActiveCharacterId()).toBe('char_active_001');
  });

  it('returns null when no active character ID has been saved', () => {
    const sm = new StorageManager();
    expect(sm.loadActiveCharacterId()).toBeNull();
  });
});

// =============================================================================
// 8. setCsrfToken() — exported utility
// =============================================================================

describe('setCsrfToken() — CSRF token management', () => {
  it('sets the CSRF token without throwing', () => {
    expect(() => setCsrfToken('test-csrf-token-abc123')).not.toThrow();
  });

  it('can be called multiple times (latest token wins)', () => {
    setCsrfToken('token_v1');
    setCsrfToken('token_v2');
    // Can't inspect private `csrfToken` var — just verify no error thrown
    expect(() => setCsrfToken('token_v3')).not.toThrow();
  });
});

// =============================================================================
// 9. validateLinkDepth() — via saveCharacter (linked entity guard)
// =============================================================================

describe('StorageManager — validateLinkDepth guard', () => {
  it('saves character with no linked entities (depth = 0)', () => {
    const sm = new StorageManager();
    const char = makeChar('char_no_links');
    expect(sm.saveCharacter(char)).toBe(true);
  });

  it('saves character with a single linked entity (depth = 1)', () => {
    const sm = new StorageManager();
    const char = makeChar('char_with_link');
    const familiar = makeChar('familiar_cat', 'Cat Familiar');
    char.linkedEntities = [{
      instanceId: 'link_001',
      entityType: 'familiar',
      bondingFeatureId: 'class_feature_familiar',
      characterData: familiar,
    }];
    expect(sm.saveCharacter(char)).toBe(true);
  });

  it('rejects character with excessively nested linked entities (depth > 5)', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sm = new StorageManager();

    // MAX_LINK_DEPTH = 5. We need depth=6 (> 5) to trigger the guard.
    // Chain of 7 levels: level1→level2→…→level7.
    // validateLinkDepth(level1, 0) recurses until (level7, 6): 6 > 5 → false.
    let deepChar = makeChar('level7');
    for (let i = 6; i >= 1; i--) {
      const parent = makeChar(`level${i}`);
      parent.linkedEntities = [{
        instanceId: `link_${i}`,
        entityType: 'familiar',
        bondingFeatureId: 'feat_familiar',
        characterData: deepChar,
      }];
      deepChar = parent;
    }

    expect(sm.saveCharacter(deepChar)).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('nesting exceeds max depth'));
    consoleSpy.mockRestore();
  });
});

// =============================================================================
// 10. clearAll() — removes all localStorage keys
// =============================================================================

describe('StorageManager — clearAll()', () => {
  it('removes all saved characters and settings', () => {
    const sm = new StorageManager();
    sm.saveCharacter(makeChar('char_clear_1'));
    sm.saveCharacter(makeChar('char_clear_2'));
    sm.saveActiveCharacterId('char_clear_1');

    sm.clearAll();

    expect(sm.listCharacterIds()).toEqual([]);
    expect(sm.loadCharacter('char_clear_1')).toBeNull();
    expect(sm.loadActiveCharacterId()).toBeNull();
  });

  it('clearAll() on empty storage does not throw', () => {
    const sm = new StorageManager();
    expect(() => sm.clearAll()).not.toThrow();
  });
});

// =============================================================================
// 11. stopPolling() — no crash when called before startPolling
// =============================================================================

describe('StorageManager — stopPolling() safety', () => {
  it('calling stopPolling() before startPolling() does not crash', () => {
    const sm = new StorageManager();
    expect(() => sm.stopPolling()).not.toThrow();
  });

  it('calling stopPolling() after startPolling() clears the interval', async () => {
    // startPolling() sets setInterval AND calls poll() once immediately.
    // We wait for the immediate poll() promise to settle (mocked fetch resolves instantly).
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ campaignUpdatedAt: 0, characterTimestamps: {} }),
    }));

    sm.startPolling('campaign_test', () => {}, () => {}, 9_999_999); // Very long interval — never fires
    // Wait for the one immediate poll() async call to settle
    await new Promise(resolve => setTimeout(resolve, 10));

    expect((sm as unknown as { pollingInterval: unknown }).pollingInterval).not.toBeNull();
    sm.stopPolling();
    expect((sm as unknown as { pollingInterval: unknown }).pollingInterval).toBeNull();

    vi.unstubAllGlobals();
  });

  it('startPolling detects changed campaign on second immediate call', async () => {
    // We test the "two polls, second has changed campaignUpdatedAt" path
    // by calling the poll function twice via the immediate call + one interval advance.
    let campaignUpdatedCalled = false;
    const onCampaignUpdated = () => { campaignUpdatedCalled = true; };
    const sm = new StorageManager();

    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          campaignUpdatedAt: callCount === 1 ? 100 : 200, // Changes on second call
          characterTimestamps: {},
        }),
      });
    }));

    // First poll: immediate (callCount=1, baseline stored as 100)
    sm.startPolling('campaign_poll', onCampaignUpdated, () => {}, 9_999_999);
    await new Promise(resolve => setTimeout(resolve, 10));

    // Simulate a second poll by stopping and restarting — this triggers the immediate poll again
    sm.stopPolling();
    sm.startPolling('campaign_poll', onCampaignUpdated, () => {}, 9_999_999); // callCount=2, returns 200 (different → fires)
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(campaignUpdatedCalled).toBe(true);
    sm.stopPolling();
    vi.unstubAllGlobals();
  });

  it('startPolling detects new character IDs in timestamps', async () => {
    const changedIds: string[] = [];
    const onCharsUpdated = (ids: string[]) => { changedIds.push(...ids); };
    const sm = new StorageManager();

    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          campaignUpdatedAt: 0,
          characterTimestamps: callCount === 1
            ? { char_a: 1000 }               // Baseline
            : { char_a: 1000, char_b: 2000 }, // char_b is new → detected as changed
        }),
      });
    }));

    // First poll: sets baseline
    sm.startPolling('campaign_chars', () => {}, onCharsUpdated, 9_999_999);
    await new Promise(resolve => setTimeout(resolve, 10));

    // Second poll: char_b appears
    sm.stopPolling();
    sm.startPolling('campaign_chars', () => {}, onCharsUpdated, 9_999_999);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(changedIds).toContain('char_b');
    sm.stopPolling();
    vi.unstubAllGlobals();
  });
});

// =============================================================================
// 12. Async API methods — saveCharacterToApi / loadAllCharactersFromApi
// =============================================================================

describe('StorageManager — async API methods with mocked fetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saveCharacterToApi: successful PUT sets isApiReachable = true', async () => {
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve({ success: true }),
    }));
    const char = makeChar('char_api_ok');
    await sm.saveCharacterToApi(char);
    expect(sm.isApiReachable).toBe(true);
  });

  it('saveCharacterToApi: failed PUT logs warning and sets isApiReachable = false', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500,
    }));
    const char = makeChar('char_api_fail');
    await sm.saveCharacterToApi(char);
    expect(sm.isApiReachable).toBe(false);
    consoleSpy.mockRestore();
  });

  it('saveCharacterToApi: network error is caught gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    await expect(sm.saveCharacterToApi(makeChar('char_network_fail'))).resolves.not.toThrow();
    consoleSpy.mockRestore();
  });

  it('loadAllCharactersFromApi: returns characters on success', async () => {
    const sm = new StorageManager();
    const chars = [makeChar('api_char_1', 'Alice'), makeChar('api_char_2', 'Bob')];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(chars),
    }));
    const result = await sm.loadAllCharactersFromApi('campaign_123');
    expect(result).toHaveLength(2);
    expect(result.map(c => c.name)).toContain('Alice');
  });

  it('loadAllCharactersFromApi: non-ok HTTP response falls back to localStorage', async () => {
    const sm = new StorageManager();
    sm.saveCharacter(makeChar('fallback_char', 'FallbackUser'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 503,
    }));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await sm.loadAllCharactersFromApi('campaign_xyz');
    expect(result.some(c => c.name === 'FallbackUser')).toBe(true);
    consoleSpy.mockRestore();
  });

  it('loadAllCharactersFromApi: falls back to localStorage on API failure', async () => {
    const sm = new StorageManager();
    sm.saveCharacter(makeChar('local_char', 'LocalAlice'));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('API down')));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await sm.loadAllCharactersFromApi('campaign_123');
    // Should fall back to localStorage
    expect(result.some(c => c.name === 'LocalAlice')).toBe(true);
    consoleSpy.mockRestore();
  });
});

// =============================================================================
// 13. deleteCharacterFromApi() — localStorage + API deletion
// =============================================================================

describe('StorageManager — deleteCharacterFromApi()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes the character from localStorage before the API call resolves', async () => {
    const sm = new StorageManager();
    sm.saveCharacter(makeChar('char_del_api_1'));
    // Use a fetch mock that never resolves (simulates slow network)
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

    // Fire-and-forget — do not await so we can check the sync removal immediately
    void sm.deleteCharacterFromApi('char_del_api_1');

    // localStorage removal is synchronous — it has already happened
    expect(sm.loadCharacter('char_del_api_1')).toBeNull();
    expect(sm.listCharacterIds()).not.toContain('char_del_api_1');
  });

  it('sets isApiReachable = true on successful DELETE response', async () => {
    const sm = new StorageManager();
    sm.saveCharacter(makeChar('char_del_api_2'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204 }));

    await sm.deleteCharacterFromApi('char_del_api_2');

    expect(sm.isApiReachable).toBe(true);
  });

  it('sets isApiReachable = false and warns on network failure, character still removed locally', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sm = new StorageManager();
    sm.saveCharacter(makeChar('char_del_api_3'));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));

    await sm.deleteCharacterFromApi('char_del_api_3');

    expect(sm.isApiReachable).toBe(false);
    // Character is gone from localStorage even though the API call failed
    expect(sm.loadCharacter('char_del_api_3')).toBeNull();
    consoleSpy.mockRestore();
  });

  it('sending DELETE for a non-existent localStorage character does not crash', async () => {
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204 }));

    // The character was never saved — deleteCharacter() returns false silently
    await expect(sm.deleteCharacterFromApi('char_never_existed')).resolves.not.toThrow();
  });

  it('DELETE request targets the correct API path with the character ID', async () => {
    const sm = new StorageManager();
    sm.saveCharacter(makeChar('char_del_api_url'));

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    await sm.deleteCharacterFromApi('char_del_api_url');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/characters/char_del_api_url',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('DELETE request includes credentials: include for session cookie', async () => {
    const sm = new StorageManager();
    sm.saveCharacter(makeChar('char_del_creds'));

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    await sm.deleteCharacterFromApi('char_del_creds');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' })
    );
  });
});

// =============================================================================
// User-level language persistence (saveUserLanguage / loadUserLanguage)
// =============================================================================

describe('StorageManager — user language persistence', () => {
  let mockStorage: Map<string, string>;

  beforeEach(() => {
    mockStorage = new Map();
    vi.stubGlobal('localStorage', {
      getItem:    (k: string) => mockStorage.get(k) ?? null,
      setItem:    (k: string, v: string) => { mockStorage.set(k, v); },
      removeItem: (k: string) => { mockStorage.delete(k); },
      clear:      () => { mockStorage.clear(); },
      get length() { return mockStorage.size; },
      key:        (i: number) => [...mockStorage.keys()][i] ?? null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saveUserLanguage persists the code and loadUserLanguage retrieves it', () => {
    const sm = new StorageManager();
    sm.saveUserLanguage('fr');
    expect(sm.loadUserLanguage()).toBe('fr');
  });

  it('saveUserLanguage overwrites a previous value', () => {
    const sm = new StorageManager();
    sm.saveUserLanguage('fr');
    sm.saveUserLanguage('en');
    expect(sm.loadUserLanguage()).toBe('en');
  });

  it('loadUserLanguage returns "en" when nothing has been saved', () => {
    const sm = new StorageManager();
    expect(sm.loadUserLanguage()).toBe('en');
  });

  it('saveUserLanguage with a community code round-trips correctly', () => {
    const sm = new StorageManager();
    sm.saveUserLanguage('es');
    expect(sm.loadUserLanguage()).toBe('es');
  });

  it('saveUserLanguage is a no-op when localStorage is unavailable', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', undefined);
    const sm = new StorageManager();
    // Should not throw
    expect(() => sm.saveUserLanguage('fr')).not.toThrow();
  });

  it('loadUserLanguage returns "en" when localStorage is unavailable', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', undefined);
    const sm = new StorageManager();
    expect(sm.loadUserLanguage()).toBe('en');
  });
});

// =============================================================================
// saveGmOverridesToApi — error / catch branch
// =============================================================================

describe('StorageManager — saveGmOverridesToApi error handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets isApiReachable = false and warns when fetch throws', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));

    await sm.saveGmOverridesToApi('char_gmo_fail', []);

    expect(sm.isApiReachable).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('saveGmOverridesToApi')
    );
    consoleSpy.mockRestore();
  });

  it('sets isApiReachable = true on successful PUT', async () => {
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    await sm.saveGmOverridesToApi('char_gmo_ok', [{ type: 'test' }]);

    expect(sm.isApiReachable).toBe(true);
  });
});

// =============================================================================
// debounce() — exported helper
// =============================================================================

describe('debounce() — call deferral helper', () => {
  it('does not call the function immediately', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    expect(fn).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
    vi.useRealTimers();
  });

  it('only fires once when called multiple times within the delay window', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced('first');
    debounced('second');
    debounced('third');

    expect(fn).not.toHaveBeenCalled();
    vi.runAllTimers();

    // Only the last call should have fired
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('third');
    vi.useRealTimers();
  });

  it('fires again after the delay has elapsed since the last call', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced('first');
    vi.advanceTimersByTime(60); // first call fires
    expect(fn).toHaveBeenCalledTimes(1);

    debounced('second');
    vi.advanceTimersByTime(60); // second call fires
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('second');
    vi.useRealTimers();
  });

  it('resets the timer when called again before the delay elapses', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    vi.advanceTimersByTime(80); // Not yet fired
    debounced('b');             // Resets the timer
    vi.advanceTimersByTime(80); // Still not 100ms since last call
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30); // Now > 100ms since 'b' — fires
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
    vi.useRealTimers();
  });
});

// =============================================================================
// Additional coverage for uncovered branches
// =============================================================================

/**
 * Creates a localStorage mock that:
 *  - PASSES the availability check (setItem for '__test__' key succeeds),
 *  - THROWS on setItem/getItem for any key matching `failKey`.
 * This ensures `isAvailable = true` in the StorageManager so catch blocks
 * inside the actual operations are reachable.
 */
function createThrowingMock(failKey: string, mode: 'setItem' | 'getItem' | 'both' = 'setItem') {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => {
      if ((mode === 'getItem' || mode === 'both') && key === failKey) {
        throw new Error('SecurityError');
      }
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if ((mode === 'setItem' || mode === 'both') && key === failKey) {
        throw new Error('QuotaExceededError');
      }
      store.set(key, value);
    },
    removeItem: (key: string) => { store.delete(key); },
    clear:      () => { store.clear(); },
    key:        (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}

describe('StorageManager — saveCharacter() / deleteCharacter() catch branches', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saveCharacter() returns false when localStorage.setItem throws for the character key', () => {
    vi.stubGlobal('window', {});
    // Throw specifically on character data keys (cv_character_*) but allow __test__ and index
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem:    (k: string) => store.get(k) ?? null,
      setItem:    (k: string, v: string) => {
        if (k.startsWith('cv_character_') && k !== 'cv_character_index') {
          throw new Error('QuotaExceededError');
        }
        store.set(k, v);
      },
      removeItem: (k: string) => { store.delete(k); },
      clear:      () => { store.clear(); },
      key:        (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sm = new StorageManager();
    // Use a properly-shaped character so validateLinkDepth doesn't throw before setItem
    const char = createEmptyCharacter('char_test', 'Test Char');
    const result = sm.saveCharacter(char);
    expect(result).toBe(false);
    warnSpy.mockRestore();
  });

  it('deleteCharacter() returns false when localStorage operations throw', () => {
    vi.stubGlobal('window', {});
    const store = new Map<string, string>([
      ['cv_character_index', JSON.stringify(['char_del'])],
      ['cv_character_char_del', JSON.stringify({ id: 'char_del' })],
    ]);
    vi.stubGlobal('localStorage', {
      getItem:    (k: string) => store.get(k) ?? null,
      setItem:    (k: string, _v: string) => {
        if (k === 'cv_character_index') throw new Error('StorageError'); // throw on index update
        store.set(k, _v);
      },
      removeItem: (k: string) => { store.delete(k); },
      clear:      () => { store.clear(); },
      key:        (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sm = new StorageManager();
    const result = sm.deleteCharacter('char_del');
    expect(result).toBe(false);
    warnSpy.mockRestore();
  });
});

describe('StorageManager — saveSettings() / loadSettings() catch branches', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saveSettings() returns false when localStorage.setItem throws for the settings key', () => {
    vi.stubGlobal('window', {});
    // The mock passes the __test__ availability check but throws for cv_campaign_settings
    vi.stubGlobal('localStorage', createThrowingMock('cv_campaign_settings', 'setItem'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sm = new StorageManager();
    const result = sm.saveSettings({} as Parameters<typeof sm.saveSettings>[0]);
    expect(result).toBe(false);
    warnSpy.mockRestore();
  });

  it('loadSettings() returns defaults when JSON parsing throws (corrupt data)', () => {
    vi.stubGlobal('window', {});
    const store = new Map<string, string>([['cv_campaign_settings', '{{invalid json}}']]);
    vi.stubGlobal('localStorage', {
      getItem:    (k: string) => store.get(k) ?? null,
      setItem:    (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear:      () => { store.clear(); },
      key:        (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sm = new StorageManager();
    const settings = sm.loadSettings();
    expect(settings).toBeDefined();
    expect(settings.language).toBe('en');
    warnSpy.mockRestore();
  });

  it('listCharacterIds() returns [] when JSON parsing of the index throws', () => {
    vi.stubGlobal('window', {});
    const store = new Map<string, string>([['cv_character_index', '{{not valid json}}']]);
    vi.stubGlobal('localStorage', {
      getItem:    (k: string) => store.get(k) ?? null,
      setItem:    (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear:      () => { store.clear(); },
      key:        (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    });
    const sm = new StorageManager();
    expect(sm.listCharacterIds()).toEqual([]);
  });
});

describe('StorageManager — saveUserLanguage() catch branch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not throw when localStorage.setItem fails for saveUserLanguage', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', createThrowingMock('cv_user_language', 'setItem'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sm = new StorageManager();
    // Must not throw; the error is swallowed with a console.warn
    expect(() => sm.saveUserLanguage('fr')).not.toThrow();
    warnSpy.mockRestore();
  });
});

describe('StorageManager — saveActiveCharacterId(null) branch', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', createLocalStorageMock());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saveActiveCharacterId(null) removes the key from localStorage', () => {
    const sm = new StorageManager();
    // First save a non-null ID
    sm.saveActiveCharacterId('char_001');
    expect(sm.loadActiveCharacterId()).toBe('char_001');

    // Passing null must remove it
    sm.saveActiveCharacterId(null);
    expect(sm.loadActiveCharacterId()).toBeNull();
  });
});

describe('StorageManager — loadUserLanguage() catch branch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns "en" when localStorage.getItem throws', () => {
    // Simulate a broken localStorage (e.g. QuotaExceededError on read in
    // some privacy-mode browsers).
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
      getItem:    () => { throw new Error('Security error'); },
      setItem:    () => {},
      removeItem: () => {},
      clear:      () => {},
      key:        () => null,
      length:     0,
    });

    const sm = new StorageManager();
    expect(sm.loadUserLanguage()).toBe('en');
  });
});

describe('StorageManager — polling failure branch (isApiReachable = false)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('sets isApiReachable to false when the poll fetch rejects', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', createLocalStorageMock());
    // Reject on every call — simulates a downed server.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));

    const sm = new StorageManager();
    sm.startPolling('campaign_1', () => {}, () => {}, 60_000);

    // startPolling calls poll() immediately (synchronously schedules the async work).
    // Flush all pending micro-tasks so the catch branch executes.
    await Promise.resolve(); // Schedules the async fetch chain
    await Promise.resolve(); // Flush catch branch

    expect(sm.isApiReachable).toBe(false);
    sm.stopPolling();
  });
});
