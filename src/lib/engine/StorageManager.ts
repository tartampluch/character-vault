/**
 * @file StorageManager.ts
 * @description Persistence layer for the Character Vault application.
 *
 * ARCHITECTURE — Server-First Design:
 *   Characters are the source of truth on the server (PHP/SQLite).
 *   They are never cached in localStorage; every page load fetches
 *   fresh data from the API.
 *
 *   localStorage is kept only for:
 *     - UI preferences (language, active character ID, sidebar pins)
 *     - Campaign settings (house rules, stat generation variant)
 *     - Rules batch cache (ETag-based, invalidated by server)
 *
 * EXPLICIT SAVES:
 *   All character writes (POST/PUT) are triggered explicitly by the user
 *   clicking a Save button. There is no auto-save, no debounce, and no
 *   silent fallback. Any server error is thrown so the UI can display it.
 *
 * CONCURRENCY PROTECTION:
 *   PUT /api/characters/{id} accepts an `updatedAt` timestamp from the
 *   client. If the server's record is newer the server returns 409 Conflict.
 *   The frontend handles 409 by showing an error message and prompting the
 *   user to reload before saving.
 *
 * @see src/lib/types/character.ts   for Character, LinkedEntity
 * @see src/lib/types/settings.ts    for CampaignSettings
 * @see ARCHITECTURE.md §14 for the full specification.
 */

import type { Character } from '../types/character';
import type { CampaignSettings } from '../types/settings';
import { createDefaultCampaignSettings } from '../types/settings';
import type { ID } from '../types/primitives';

// =============================================================================
// STORAGE KEY CONSTANTS (localStorage — UI preferences only)
// =============================================================================

const STORAGE_PREFIX = 'cv_';

/**
 * localStorage keys that survive the server-first refactoring.
 * Character blobs, the character index, and sync timestamps are intentionally
 * absent — characters live on the server only.
 */
const KEYS = {
  CAMPAIGN_SETTINGS:   `${STORAGE_PREFIX}campaign_settings`,
  ACTIVE_CHARACTER_ID: `${STORAGE_PREFIX}active_character_id`,
  /**
   * User-level language preference, persisted independently of campaign
   * settings so a language switch is not overwritten when campaign settings
   * are reloaded from the server.
   */
  USER_LANGUAGE:       `${STORAGE_PREFIX}user_language`,
} as const;

// =============================================================================
// CSRF TOKEN UTILITY
// =============================================================================

/**
 * The CSRF token fetched from GET /api/auth/me.
 * Stored in memory (not localStorage — tokens must not survive a page reload
 * because the PHP session may have changed).
 */
let csrfToken: string | null = null;

/**
 * Sets the CSRF token (called after a successful /api/auth/me response).
 */
export function setCsrfToken(token: string): void {
  csrfToken = token;
}

/**
 * Returns true when the CSRF token has been populated from GET /api/auth/me.
 */
export function hasCsrfToken(): boolean {
  return csrfToken !== null;
}

/**
 * Returns headers for API requests, including CSRF token and Content-Type.
 * Exported so other stores (e.g. HomebrewStore) can share the same CSRF token
 * without duplicating the token-management logic.
 */
export function apiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  return headers;
}

// =============================================================================
// STORAGE MANAGER CLASS
// =============================================================================

/**
 * STORAGE MANAGER CLASS
 *
 * PUBLIC INTERFACE SUMMARY:
 *
 *   localStorage (synchronous):
 *     - `saveSettings(settings)` / `loadSettings()`
 *     - `saveUserLanguage(lang)` / `loadUserLanguage()`
 *     - `saveActiveCharacterId(id)` / `loadActiveCharacterId()`
 *
 *   API reads (async):
 *     - `loadCharacterFromApi(id)`         — GET /api/characters/{id}
 *     - `loadAllCharactersFromApi(cId?)`   — GET /api/characters[?campaignId=X]
 *     - `loadTemplateFromApi(id)`          — GET /api/templates/{id}
 *     - `loadTemplatesFromApi(type?)`      — GET /api/templates
 *
 *   API writes (async, throw on any error):
 *     - `createCharacterOnApi(char)`       — POST /api/characters
 *     - `saveCharacterToApi(char)`         — PUT  /api/characters/{id}
 *     - `deleteCharacterFromApi(id)`       — DELETE /api/characters/{id}
 *     - `createTemplateOnApi(tmpl)`        — POST /api/templates
 *     - `saveTemplateToApi(tmpl)`          — PUT  /api/templates/{id}
 *     - `deleteTemplateFromApi(id)`        — DELETE /api/templates/{id}
 *     - `saveGmOverridesToApi(charId, o)`  — PUT  /api/characters/{id}/gm-overrides
 */
export class StorageManager {
  private readonly isAvailable: boolean;

  /**
   * Whether the PHP API was reachable on the last call.
   * Used by the vault to decide whether to show an offline indicator.
   */
  isApiReachable = false;

  constructor() {
    this.isAvailable = this.#checkAvailability();
  }

  // ---------------------------------------------------------------------------
  // AVAILABILITY CHECK
  // ---------------------------------------------------------------------------

  #checkAvailability(): boolean {
    try {
      if (typeof window === 'undefined') return false;
      if (typeof localStorage === 'undefined') return false;
      const testKey = `${STORAGE_PREFIX}_test`;
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // SETTINGS PERSISTENCE (localStorage)
  // ---------------------------------------------------------------------------

  saveSettings(settings: CampaignSettings): boolean {
    if (!this.isAvailable) return false;
    try {
      localStorage.setItem(KEYS.CAMPAIGN_SETTINGS, JSON.stringify(settings));
      return true;
    } catch (err) {
      console.warn('[StorageManager] saveSettings: failed:', err);
      return false;
    }
  }

  loadSettings(): CampaignSettings {
    if (!this.isAvailable) return createDefaultCampaignSettings();
    try {
      const json = localStorage.getItem(KEYS.CAMPAIGN_SETTINGS);
      return json ? (JSON.parse(json) as CampaignSettings) : createDefaultCampaignSettings();
    } catch (err) {
      console.warn('[StorageManager] loadSettings: failed, using defaults:', err);
      return createDefaultCampaignSettings();
    }
  }

  /**
   * Persists the user's preferred UI language independently of campaign settings.
   *
   * @param lang - BCP-47-style language code (e.g. `"en"`, `"fr"`).
   */
  saveUserLanguage(lang: string): void {
    if (!this.isAvailable) return;
    try {
      localStorage.setItem(KEYS.USER_LANGUAGE, lang);
    } catch (err) {
      console.warn('[StorageManager] saveUserLanguage: failed:', err);
    }
  }

  /**
   * Loads the user's preferred UI language, defaulting to `"en"`.
   */
  loadUserLanguage(): string {
    if (!this.isAvailable) return 'en';
    try {
      return localStorage.getItem(KEYS.USER_LANGUAGE) ?? 'en';
    } catch {
      return 'en';
    }
  }

  saveActiveCharacterId(id: ID | null): void {
    if (!this.isAvailable) return;
    if (id === null) {
      localStorage.removeItem(KEYS.ACTIVE_CHARACTER_ID);
    } else {
      localStorage.setItem(KEYS.ACTIVE_CHARACTER_ID, id);
    }
  }

  loadActiveCharacterId(): ID | null {
    if (!this.isAvailable) return null;
    return localStorage.getItem(KEYS.ACTIVE_CHARACTER_ID);
  }

  // ---------------------------------------------------------------------------
  // ASYNC API — CHARACTER READS
  // ---------------------------------------------------------------------------

  /**
   * Fetches a single character by ID from the server.
   *
   * Returns `null` when the character does not exist (404) or is not accessible
   * (403 treated as not-found to avoid information leakage).
   * Throws for any other non-OK status (network errors, 500, etc.).
   *
   * @param id - The character ID.
   */
  async loadCharacterFromApi(id: ID): Promise<Character | null> {
    try {
      const response = await fetch(`/api/characters/${id}`, {
        headers:     apiHeaders(),
        credentials: 'include',
      });
      if (response.status === 404 || response.status === 403) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.isApiReachable = true;
      return (await response.json()) as Character;
    } catch (err) {
      this.isApiReachable = false;
      throw err;
    }
  }

  /**
   * Loads characters from the PHP API.
   *
   * - With `campaignId`: returns characters for that campaign (visibility rules applied).
   * - Without `campaignId`: returns all characters the caller is allowed to see.
   *
   * Returns `[]` on any API failure (the caller shows an empty list rather than
   * crashing; the vault page shows an error indicator via `isApiReachable`).
   *
   * @param campaignId - Optional campaign scope.
   */
  async loadAllCharactersFromApi(campaignId?: ID): Promise<Character[]> {
    try {
      const url = campaignId
        ? `/api/characters?campaignId=${encodeURIComponent(campaignId)}`
        : '/api/characters';
      const response = await fetch(url, {
        headers:     apiHeaders(),
        credentials: 'include',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.isApiReachable = true;
      return (await response.json()) as Character[];
    } catch (err) {
      this.isApiReachable = false;
      console.warn(`[StorageManager] loadAllCharactersFromApi: failed. (${err})`);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // ASYNC API — CHARACTER WRITES (throw on any error)
  // ---------------------------------------------------------------------------

  /**
   * Creates a new character on the server via POST /api/characters.
   * Throws on any non-OK response so the UI can display the error.
   *
   * WHY POST AND NOT PUT?
   *   PUT /api/characters/{id} requires the record to already exist in the DB.
   *   For brand-new characters, POST creates the record first.
   *
   * @param char - The new character to persist.
   */
  async createCharacterOnApi(char: Character): Promise<void> {
    if (char.isTemplate) {
      return this.createTemplateOnApi(char);
    }

    const response = await fetch('/api/characters', {
      method:      'POST',
      headers:     apiHeaders(),
      credentials: 'include',
      body:        JSON.stringify(char),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new ApiError(response.status, body['message'] as string | undefined);
    }
    this.isApiReachable = true;
  }

  /**
   * Saves a character to the server via PUT /api/characters/{id}.
   * Throws on any non-OK response — including 409 Conflict (stale save).
   *
   * Returns the server's new `updatedAt` timestamp on success so the caller
   * can update the in-memory character before the next save.
   *
   * Callers should catch `ApiError` and inspect `.status`:
   *   - 409 → "Character modified elsewhere, reload before saving."
   *   - 429 → "Too many requests, wait and try again."
   *   - others → generic save error.
   *
   * @param char - The character to save (should include `updatedAt` for concurrency check).
   * @returns The server-assigned `updatedAt` timestamp.
   */
  async saveCharacterToApi(char: Character): Promise<number> {
    if (char.isTemplate) {
      await this.saveTemplateToApi(char);
      return Date.now() / 1000 | 0;
    }

    const response = await fetch(`/api/characters/${char.id}`, {
      method:      'PUT',
      headers:     apiHeaders(),
      credentials: 'include',
      body:        JSON.stringify(char),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new ApiError(
        response.status,
        body['message'] as string | undefined,
        body['serverUpdatedAt'] as number | undefined,
      );
    }
    this.isApiReachable = true;
    const result = (await response.json().catch(() => ({}))) as { updatedAt?: number };
    return result.updatedAt ?? (Date.now() / 1000 | 0);
  }

  /**
   * Deletes a character from the server. Throws on any non-OK response.
   */
  async deleteCharacterFromApi(id: ID): Promise<void> {
    const response = await fetch(`/api/characters/${id}`, {
      method:      'DELETE',
      headers:     apiHeaders(),
      credentials: 'include',
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new ApiError(response.status, body['message'] as string | undefined);
    }
    this.isApiReachable = true;
  }

  /**
   * Saves GM per-character overrides via PUT /api/characters/{id}/gm-overrides.
   * Throws on any non-OK response.
   */
  async saveGmOverridesToApi(charId: ID, overrides: unknown[]): Promise<void> {
    const response = await fetch(`/api/characters/${charId}/gm-overrides`, {
      method:      'PUT',
      headers:     apiHeaders(),
      credentials: 'include',
      body:        JSON.stringify({ gmOverrides: overrides }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new ApiError(response.status, body['message'] as string | undefined);
    }
    this.isApiReachable = true;
  }

  // ---------------------------------------------------------------------------
  // ASYNC API — TEMPLATE READS
  // ---------------------------------------------------------------------------

  /**
   * Loads a single template by ID. Returns `null` on 404/403.
   */
  async loadTemplateFromApi(id: string): Promise<Character | null> {
    try {
      const response = await fetch(`/api/templates/${id}`, {
        headers:     apiHeaders(),
        credentials: 'include',
      });
      if (response.status === 404 || response.status === 403) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.isApiReachable = true;
      return (await response.json()) as Character;
    } catch (err) {
      this.isApiReachable = false;
      console.warn(`[StorageManager] loadTemplateFromApi: failed. (${err})`);
      return null;
    }
  }

  /**
   * Loads all templates from GET /api/templates (GM only).
   * Returns `[]` on API failure.
   *
   * @param type - Optional filter: `'npc'` | `'monster'`.
   */
  async loadTemplatesFromApi(type?: 'npc' | 'monster'): Promise<Character[]> {
    try {
      const url = type ? `/api/templates?type=${type}` : '/api/templates';
      const response = await fetch(url, {
        headers:     apiHeaders(),
        credentials: 'include',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.isApiReachable = true;
      return (await response.json()) as Character[];
    } catch (err) {
      this.isApiReachable = false;
      console.warn(`[StorageManager] loadTemplatesFromApi: failed. (${err})`);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // ASYNC API — TEMPLATE WRITES (throw on any error)
  // ---------------------------------------------------------------------------

  /**
   * Creates a new template via POST /api/templates. Throws on any non-OK response.
   */
  async createTemplateOnApi(tmpl: Character): Promise<void> {
    const response = await fetch('/api/templates', {
      method:      'POST',
      headers:     apiHeaders(),
      credentials: 'include',
      body:        JSON.stringify(tmpl),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new ApiError(response.status, body['message'] as string | undefined);
    }
    this.isApiReachable = true;
  }

  /**
   * Saves a template via PUT /api/templates/{id}. Throws on any non-OK response.
   */
  async saveTemplateToApi(tmpl: Character): Promise<void> {
    const response = await fetch(`/api/templates/${tmpl.id}`, {
      method:      'PUT',
      headers:     apiHeaders(),
      credentials: 'include',
      body:        JSON.stringify(tmpl),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new ApiError(response.status, body['message'] as string | undefined);
    }
    this.isApiReachable = true;
  }

  /**
   * Deletes a template via DELETE /api/templates/{id}. Throws on any non-OK response.
   */
  async deleteTemplateFromApi(id: string): Promise<void> {
    const response = await fetch(`/api/templates/${id}`, {
      method:      'DELETE',
      headers:     apiHeaders(),
      credentials: 'include',
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new ApiError(response.status, body['message'] as string | undefined);
    }
    this.isApiReachable = true;
  }
}

// =============================================================================
// API ERROR CLASS
// =============================================================================

/**
 * Thrown by all StorageManager API write methods when the server returns a
 * non-OK response.
 *
 * Callers should inspect `.status` to decide how to present the error:
 *   - 409  → stale save conflict  (`serverUpdatedAt` contains the server's timestamp)
 *   - 429  → rate limited
 *   - 403  → access denied
 *   - 404  → character not found (e.g. deleted by GM)
 *   - 5xx  → server error
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message?: string,
    /** Only set on 409 Conflict — the server's current `updated_at` value. */
    public readonly serverUpdatedAt?: number,
  ) {
    super(message ?? `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

// =============================================================================
// DEBOUNCE HELPER
// =============================================================================

/**
 * Creates a debounced function that delays execution until `delayMs` ms have
 * passed without another call.
 *
 * Used by HomebrewStore for its explicit-save debounce.
 *
 * @param fn      - The function to debounce.
 * @param delayMs - Milliseconds to wait after the last call.
 */
export function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  delayMs: number
): (...args: T) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: T): void => {
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  };
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

/**
 * The single shared `StorageManager` instance used across the entire application.
 *
 * Provides localStorage persistence for UI preferences and settings, plus async
 * API methods to read/write characters and templates on the PHP backend.
 *
 * Import pattern:
 *   ```typescript
 *   import { storageManager } from '$lib/engine/StorageManager';
 *   ```
 */
export const storageManager = new StorageManager();
