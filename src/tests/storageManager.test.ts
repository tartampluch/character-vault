/**
 * @file src/tests/storageManager.test.ts
 * @description Unit tests for StorageManager — server-first persistence layer.
 *
 * STORAGE STRATEGY (after Phase 14.6 refactoring):
 *   - Characters live on the server only. No localStorage caching.
 *   - localStorage stores: settings, user language, active character ID.
 *   - All API write methods (POST/PUT/DELETE) throw ApiError on non-OK responses.
 *   - All API read methods (GET) return null / [] on failure (no throw).
 *
 * COVERAGE:
 *   - localStorage preference methods (settings, language, active char ID)
 *   - CSRF token utility (setCsrfToken, hasCsrfToken)
 *   - API write methods: throw behaviour on error
 *   - API read methods: graceful fallback on failure
 *   - ApiError class
 *   - debounce() helper
 *
 * @see src/lib/engine/StorageManager.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageManager, ApiError, setCsrfToken, hasCsrfToken, debounce } from '$lib/engine/StorageManager';
import { createEmptyCharacter } from '$lib/engine/GameEngine.svelte';
import type { Character } from '$lib/types/character';

// =============================================================================
// MOCK localStorage
// =============================================================================

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
  char.id   = id;
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
    vi.stubGlobal('localStorage', {
      getItem:    () => null,
      setItem:    () => { throw new Error('storage full'); },
      removeItem: () => {},
      clear:      () => {},
      key:        () => null,
      length:     0,
    });
    const sm = new StorageManager();
    expect((sm as unknown as { isAvailable: boolean }).isAvailable).toBe(false);
  });
});

// =============================================================================
// 2. Settings persistence
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
    expect(settings).toBeDefined();
    expect(settings?.language).toBe('en');
  });

  it('returns false when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => { throw new Error(); },
      getItem: () => null,
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    });
    const sm = new StorageManager();
    expect(sm.saveSettings({} as import('$lib/types/settings').CampaignSettings)).toBe(false);
  });

  it('saveSettings() returns false when localStorage.setItem throws', () => {
    vi.stubGlobal('window', {});
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem:    (k: string) => store.get(k) ?? null,
      setItem:    (k: string, v: string) => {
        if (k === 'cv_campaign_settings') throw new Error('QuotaExceededError');
        store.set(k, v);
      },
      removeItem: (k: string) => { store.delete(k); },
      clear:      () => { store.clear(); },
      key:        (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sm = new StorageManager();
    const result = sm.saveSettings({} as Parameters<typeof sm.saveSettings>[0]);
    expect(result).toBe(false);
    warnSpy.mockRestore();
  });

  it('loadSettings() returns defaults when JSON is corrupt', () => {
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
});

// =============================================================================
// 3. Active character ID persistence
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

  it('saveActiveCharacterId(null) removes the key from localStorage', () => {
    const sm = new StorageManager();
    sm.saveActiveCharacterId('char_001');
    expect(sm.loadActiveCharacterId()).toBe('char_001');
    sm.saveActiveCharacterId(null);
    expect(sm.loadActiveCharacterId()).toBeNull();
  });
});

// =============================================================================
// 4. User language persistence
// =============================================================================

describe('StorageManager — user language persistence', () => {
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
    expect(() => sm.saveUserLanguage('fr')).not.toThrow();
  });

  it('loadUserLanguage returns "en" when localStorage is unavailable', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', undefined);
    const sm = new StorageManager();
    expect(sm.loadUserLanguage()).toBe('en');
  });

  it('does not throw when localStorage.setItem fails for saveUserLanguage', () => {
    vi.stubGlobal('window', {});
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem:    (k: string) => store.get(k) ?? null,
      setItem:    (k: string, v: string) => {
        if (k === 'cv_user_language') throw new Error('QuotaExceededError');
        store.set(k, v);
      },
      removeItem: (k: string) => { store.delete(k); },
      clear:      () => { store.clear(); },
      key:        (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sm = new StorageManager();
    expect(() => sm.saveUserLanguage('fr')).not.toThrow();
    warnSpy.mockRestore();
  });

  it('returns "en" when localStorage.getItem throws', () => {
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

// =============================================================================
// 5. CSRF token utilities
// =============================================================================

describe('setCsrfToken() / hasCsrfToken() — CSRF token management', () => {
  it('sets the CSRF token without throwing', () => {
    expect(() => setCsrfToken('test-csrf-token-abc123')).not.toThrow();
  });

  it('hasCsrfToken() returns true after setCsrfToken()', () => {
    setCsrfToken('my-token');
    expect(hasCsrfToken()).toBe(true);
  });

  it('can be called multiple times (latest token wins)', () => {
    setCsrfToken('token_v1');
    setCsrfToken('token_v2');
    expect(() => setCsrfToken('token_v3')).not.toThrow();
    expect(hasCsrfToken()).toBe(true);
  });
});

// =============================================================================
// 6. ApiError class
// =============================================================================

describe('ApiError — structured API error', () => {
  it('has the correct name and status', () => {
    const err = new ApiError(404, 'Not found');
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
  });

  it('defaults message to "HTTP {status}" when none provided', () => {
    const err = new ApiError(500);
    expect(err.message).toBe('HTTP 500');
  });

  it('includes serverUpdatedAt on 409 Conflict', () => {
    const err = new ApiError(409, 'Conflict', 1234567890);
    expect(err.status).toBe(409);
    expect(err.serverUpdatedAt).toBe(1234567890);
  });

  it('is an instanceof Error', () => {
    const err = new ApiError(403);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });
});

// =============================================================================
// 7. API write methods — throw on non-OK response
// =============================================================================

describe('StorageManager — saveCharacterToApi() throws on error', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves with a number (updatedAt) on successful PUT', async () => {
    // setCsrfToken needed for CSRF header
    setCsrfToken('token');
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'char_ok', updatedAt: 1700000000 }),
    }));
    const result = await sm.saveCharacterToApi(makeChar('char_ok'));
    expect(typeof result).toBe('number');
    expect(sm.isApiReachable).toBe(true);
  });

  it('throws ApiError with status 500 on server error', async () => {
    setCsrfToken('token');
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Internal error' }),
    }));
    await expect(sm.saveCharacterToApi(makeChar('char_fail')))
      .rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError with status 409 on stale save conflict', async () => {
    setCsrfToken('token');
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({
        error: 'Conflict',
        message: 'Stale save',
        serverUpdatedAt: 9999,
      }),
    }));
    await expect(sm.saveCharacterToApi(makeChar('char_conflict')))
      .rejects.toMatchObject({ status: 409, serverUpdatedAt: 9999 });
  });

  it('throws on network error', async () => {
    setCsrfToken('token');
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));
    await expect(sm.saveCharacterToApi(makeChar('char_net'))).rejects.toThrow();
  });
});

describe('StorageManager — deleteCharacterFromApi() throws on error', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets isApiReachable = true on successful DELETE', async () => {
    setCsrfToken('token');
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    await sm.deleteCharacterFromApi('char_del');
    expect(sm.isApiReachable).toBe(true);
  });

  it('throws ApiError on non-OK response', async () => {
    setCsrfToken('token');
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: 'Forbidden' }),
    }));
    await expect(sm.deleteCharacterFromApi('char_forbidden'))
      .rejects.toBeInstanceOf(ApiError);
  });

  it('DELETE request targets the correct API path', async () => {
    setCsrfToken('token');
    const sm = new StorageManager();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    await sm.deleteCharacterFromApi('char_url_test');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/characters/char_url_test',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('DELETE request includes credentials: include', async () => {
    setCsrfToken('token');
    const sm = new StorageManager();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    await sm.deleteCharacterFromApi('char_creds');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});

describe('StorageManager — saveGmOverridesToApi() throws on error', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets isApiReachable = true on successful PUT', async () => {
    setCsrfToken('token');
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    await sm.saveGmOverridesToApi('char_gmo_ok', []);
    expect(sm.isApiReachable).toBe(true);
  });

  it('throws ApiError on non-OK response', async () => {
    setCsrfToken('token');
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Server error' }),
    }));
    await expect(sm.saveGmOverridesToApi('char_gmo_fail', []))
      .rejects.toBeInstanceOf(ApiError);
  });

  it('throws on network error', async () => {
    setCsrfToken('token');
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));
    await expect(sm.saveGmOverridesToApi('char_gmo_net', []))
      .rejects.toThrow('Network failure');
  });
});

// =============================================================================
// 8. API read methods — graceful fallback
// =============================================================================

describe('StorageManager — loadCharacterFromApi()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the character on 200 OK', async () => {
    const sm = new StorageManager();
    const char = makeChar('char_api_1', 'Frodo');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(char),
    }));
    const result = await sm.loadCharacterFromApi('char_api_1');
    expect(result?.id).toBe('char_api_1');
    expect(result?.name).toBe('Frodo');
    expect(sm.isApiReachable).toBe(true);
  });

  it('returns null on 404', async () => {
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const result = await sm.loadCharacterFromApi('char_missing');
    expect(result).toBeNull();
  });

  it('returns null on 403', async () => {
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const result = await sm.loadCharacterFromApi('char_forbidden');
    expect(result).toBeNull();
  });

  it('throws on 500 server error', async () => {
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(sm.loadCharacterFromApi('char_500')).rejects.toThrow();
  });
});

describe('StorageManager — loadAllCharactersFromApi()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns characters on success', async () => {
    const sm = new StorageManager();
    const chars = [makeChar('api_c1', 'Alice'), makeChar('api_c2', 'Bob')];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(chars),
    }));
    const result = await sm.loadAllCharactersFromApi('campaign_123');
    expect(result).toHaveLength(2);
    expect(result.map(c => c.name)).toContain('Alice');
    expect(sm.isApiReachable).toBe(true);
  });

  it('returns [] on non-OK HTTP response (no throw)', async () => {
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await sm.loadAllCharactersFromApi('campaign_xyz');
    expect(result).toEqual([]);
    expect(sm.isApiReachable).toBe(false);
    consoleSpy.mockRestore();
  });

  it('returns [] on network failure (no throw)', async () => {
    const sm = new StorageManager();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('API down')));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await sm.loadAllCharactersFromApi('campaign_123');
    expect(result).toEqual([]);
    consoleSpy.mockRestore();
  });
});

// =============================================================================
// 9. debounce() — exported helper
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
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('third');
    vi.useRealTimers();
  });

  it('fires again after the delay has elapsed since the last call', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced('first');
    vi.advanceTimersByTime(60);
    expect(fn).toHaveBeenCalledTimes(1);
    debounced('second');
    vi.advanceTimersByTime(60);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('second');
    vi.useRealTimers();
  });

  it('resets the timer when called again before the delay elapses', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('a');
    vi.advanceTimersByTime(80);
    debounced('b');
    vi.advanceTimersByTime(80);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
    vi.useRealTimers();
  });
});
