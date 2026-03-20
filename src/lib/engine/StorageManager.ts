/**
 * @file StorageManager.ts
 * @description Multi-character persistence layer.
 *
 * ARCHITECTURE — Phase 14.6 Refactoring:
 *   This file replaces the localStorage-only Phase 4.1 implementation with a
 *   dual-backend strategy:
 *
 *     1. PRIMARY BACKEND: PHP REST API (async fetch calls to /api/).
 *        Used when the API is reachable and the user is authenticated.
 *
 *     2. FALLBACK BACKEND: localStorage (same keys as Phase 4.1).
 *        Used when the API is unreachable (offline mode) or during SSR.
 *
 *   ALL PUBLIC METHODS remain synchronous for localStorage calls (no breaking
 *   changes to the GameEngine $effect integration). Async API calls are fired-and-
 *   forgotten for writes (auto-save doesn't block the UI). For reads, the async
 *   API methods are exposed separately (loadFromApi*, loadAllCharactersFromApi).
 *
 * AUTO-SAVE DEBOUNCE:
 *   The GameEngine uses a 500ms debounce for localStorage writes.
 *   For API writes (PUT /api/characters/{id}), the debounce is 2000ms to avoid
 *   spamming the server on every keystroke.
 *
 * POLLING MECHANISM (ARCHITECTURE.md section 19):
 *   `startPolling(campaignId, onCampaignUpdated, onCharactersUpdated, intervalMs)`
 *   Starts a polling loop that calls GET /api/campaigns/{id}/sync-status every
 *   `intervalMs` milliseconds. Compares timestamps with locally cached values.
 *   Only re-fetches data that has changed.
 *
 * LINKED ENTITY SERIALIZATION GUARD:
 *   Validates LinkedEntity nesting depth before any serialization.
 *   See Phase 4.1 design notes — the guard prevents stack overflows from
 *   accidentally circular structures.
 *
 * @see src/lib/types/character.ts   for Character, LinkedEntity
 * @see src/lib/types/settings.ts    for CampaignSettings
 * @see src/lib/engine/GameEngine.svelte.ts for the $effect auto-save integration
 * @see ARCHITECTURE.md Phase 14.6 for the full specification.
 */

import type { Character } from '../types/character';
import type { CampaignSettings } from '../types/settings';
import { createDefaultCampaignSettings } from '../types/settings';
import type { ID } from '../types/primitives';

// =============================================================================
// STORAGE KEY CONSTANTS (localStorage fallback)
// =============================================================================

const STORAGE_PREFIX = 'cv_';

const KEYS = {
  CHARACTER_INDEX:     `${STORAGE_PREFIX}character_index`,
  CHARACTER_PREFIX:    `${STORAGE_PREFIX}character_`,
  CAMPAIGN_SETTINGS:   `${STORAGE_PREFIX}campaign_settings`,
  ACTIVE_CHARACTER_ID: `${STORAGE_PREFIX}active_character_id`,
  /** Cached sync timestamps from the last poll. */
  SYNC_TIMESTAMPS:     `${STORAGE_PREFIX}sync_timestamps`,
} as const;

const MAX_LINK_DEPTH = 5;

// =============================================================================
// SERIALIZATION GUARD
// =============================================================================

/**
 * Validates LinkedEntity nesting depth to catch circular references before
 * JSON.stringify causes a stack overflow.
 */
function validateLinkDepth(char: Character, depth = 0): boolean {
  if (depth > MAX_LINK_DEPTH) {
    console.warn(`[StorageManager] LinkedEntity nesting exceeds max depth (${MAX_LINK_DEPTH}). Possible circular reference.`);
    return false;
  }
  for (const linked of char.linkedEntities) {
    if (!validateLinkDepth(linked.characterData, depth + 1)) return false;
  }
  return true;
}

// =============================================================================
// CSRF TOKEN UTILITY
// =============================================================================

/**
 * The CSRF token fetched from GET /api/auth/me.
 * Stored in memory (not localStorage — tokens should not survive page reload).
 */
let csrfToken: string | null = null;

/**
 * Sets the CSRF token (called after a successful /api/auth/me response).
 */
export function setCsrfToken(token: string): void {
  csrfToken = token;
}

/**
 * Returns headers for API requests, including CSRF and Content-Type.
 */
function apiHeaders(): Record<string, string> {
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
 * Dual-backend persistence manager: PHP API (primary) + localStorage (fallback).
 *
 * SYNCHRONOUS METHODS (localStorage):
 *   - `saveCharacter(char)`, `loadCharacter(id)`, `deleteCharacter(id)`
 *   - `loadAllCharacters()`, `listCharacterIds()`
 *   - `saveSettings(settings)`, `loadSettings()`
 *   - `saveActiveCharacterId(id)`, `loadActiveCharacterId()`
 *
 * ASYNC API METHODS (fire-and-forget writes):
 *   - `saveCharacterToApi(char)` — PUT /api/characters/{id}
 *   - `deleteCharacterFromApi(id)` — DELETE /api/characters/{id}
 *   - `loadAllCharactersFromApi(campaignId)` — GET /api/characters?campaignId=X
 *   - `saveGmOverridesToApi(charId, overrides)` — PUT /api/characters/{id}/gm-overrides
 *
 * POLLING:
 *   - `startPolling(campaignId, onCampaign, onChars, intervalMs)`
 *   - `stopPolling()`
 */
export class StorageManager {
  private readonly isAvailable: boolean;

  /**
   * Whether the PHP API is reachable.
   * Set to false when a fetch call fails (triggers offline fallback).
   * Reset to true on next successful API call.
   */
  isApiReachable = false;

  /** Active polling interval handle (setInterval). */
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  /** Last known sync timestamps from the API. */
  private lastSyncTimestamps: Record<string, number> = {};

  constructor() {
    this.isAvailable = this.#checkAvailability();
    this.#loadCachedSyncTimestamps();
  }

  // ---------------------------------------------------------------------------
  // AVAILABILITY CHECK
  // ---------------------------------------------------------------------------

  #checkAvailability(): boolean {
    try {
      if (typeof localStorage === 'undefined') return false;
      const testKey = `${STORAGE_PREFIX}_test`;
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  #loadCachedSyncTimestamps(): void {
    if (!this.isAvailable) return;
    try {
      const json = localStorage.getItem(KEYS.SYNC_TIMESTAMPS);
      if (json) this.lastSyncTimestamps = JSON.parse(json);
    } catch {
      // Ignore — timestamps will be re-fetched on next poll
    }
  }

  #saveCachedSyncTimestamps(): void {
    if (!this.isAvailable) return;
    try {
      localStorage.setItem(KEYS.SYNC_TIMESTAMPS, JSON.stringify(this.lastSyncTimestamps));
    } catch {
      // Non-critical — polling will continue on next interval
    }
  }

  // ---------------------------------------------------------------------------
  // CHARACTER CRUD — SYNCHRONOUS (localStorage)
  // ---------------------------------------------------------------------------

  saveCharacter(char: Character): boolean {
    if (!this.isAvailable) return false;
    if (!char.id) {
      console.warn('[StorageManager] saveCharacter: character has no ID. Skipping.');
      return false;
    }
    if (!validateLinkDepth(char)) {
      console.warn(`[StorageManager] saveCharacter: character "${char.id}" has excessive nesting. Save aborted.`);
      return false;
    }

    try {
      const json = JSON.stringify(char);
      localStorage.setItem(`${KEYS.CHARACTER_PREFIX}${char.id}`, json);

      const index = this.listCharacterIds();
      if (!index.includes(char.id)) {
        index.push(char.id);
        localStorage.setItem(KEYS.CHARACTER_INDEX, JSON.stringify(index));
      }

      return true;
    } catch (err) {
      console.warn(`[StorageManager] saveCharacter: failed for "${char.id}":`, err);
      return false;
    }
  }

  loadCharacter(id: ID): Character | null {
    if (!this.isAvailable) return null;
    try {
      const json = localStorage.getItem(`${KEYS.CHARACTER_PREFIX}${id}`);
      if (!json) return null;
      return JSON.parse(json) as Character;
    } catch (err) {
      console.warn(`[StorageManager] loadCharacter: failed for "${id}":`, err);
      return null;
    }
  }

  deleteCharacter(id: ID): boolean {
    if (!this.isAvailable) return false;
    try {
      const key = `${KEYS.CHARACTER_PREFIX}${id}`;
      if (!localStorage.getItem(key)) return false;
      localStorage.removeItem(key);
      const index = this.listCharacterIds().filter(i => i !== id);
      localStorage.setItem(KEYS.CHARACTER_INDEX, JSON.stringify(index));
      return true;
    } catch (err) {
      console.warn(`[StorageManager] deleteCharacter: failed for "${id}":`, err);
      return false;
    }
  }

  listCharacterIds(): ID[] {
    if (!this.isAvailable) return [];
    try {
      const json = localStorage.getItem(KEYS.CHARACTER_INDEX);
      return json ? (JSON.parse(json) as ID[]) : [];
    } catch {
      return [];
    }
  }

  loadAllCharacters(): Character[] {
    const ids = this.listCharacterIds();
    const characters: Character[] = [];
    for (const id of ids) {
      const char = this.loadCharacter(id);
      if (char) {
        characters.push(char);
      } else {
        console.warn(`[StorageManager] loadAllCharacters: skipping "${id}" (failed to load).`);
      }
    }
    return characters;
  }

  // ---------------------------------------------------------------------------
  // SETTINGS PERSISTENCE
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

  clearAll(): void {
    if (!this.isAvailable) return;
    for (const id of this.listCharacterIds()) {
      localStorage.removeItem(`${KEYS.CHARACTER_PREFIX}${id}`);
    }
    localStorage.removeItem(KEYS.CHARACTER_INDEX);
    localStorage.removeItem(KEYS.CAMPAIGN_SETTINGS);
    localStorage.removeItem(KEYS.ACTIVE_CHARACTER_ID);
  }

  // ---------------------------------------------------------------------------
  // ASYNC API CALLS — Fire-and-forget writes (2000ms debounce recommended)
  // ---------------------------------------------------------------------------

  /**
   * Saves a character to the PHP API via PUT /api/characters/{id}.
   * Falls back to localStorage if the API is unreachable.
   *
   * DEBOUNCE: The caller should debounce this with 2000ms to avoid spamming.
   * (The GameEngine's #debouncedSaveCharacter uses 500ms; for API calls, override to 2000ms.)
   */
  async saveCharacterToApi(char: Character): Promise<void> {
    // Always save to localStorage as a local cache (offline fallback)
    this.saveCharacter(char);

    try {
      const response = await fetch(`/api/characters/${char.id}`, {
        method: 'PUT',
        headers: apiHeaders(),
        credentials: 'include',
        body: JSON.stringify(char),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      this.isApiReachable = true;
    } catch (err) {
      this.isApiReachable = false;
      console.warn(`[StorageManager] saveCharacterToApi: API unavailable. Using localStorage only. (${err})`);
    }
  }

  /**
   * Loads all characters for a campaign from the PHP API.
   * Caches each character in localStorage for offline access.
   *
   * @param campaignId - The campaign to load characters for.
   * @returns Array of characters from the API, or from localStorage if API is down.
   */
  async loadAllCharactersFromApi(campaignId: ID): Promise<Character[]> {
    try {
      const response = await fetch(`/api/characters?campaignId=${encodeURIComponent(campaignId)}`, {
        headers: apiHeaders(),
        credentials: 'include',
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const chars = (await response.json()) as Character[];
      this.isApiReachable = true;

      // Update localStorage cache
      for (const char of chars) {
        this.saveCharacter(char);
      }

      return chars;
    } catch (err) {
      this.isApiReachable = false;
      console.warn(`[StorageManager] loadAllCharactersFromApi: API unavailable. Using localStorage. (${err})`);
      return this.loadAllCharacters();
    }
  }

  /**
   * Deletes a character via DELETE /api/characters/{id}.
   */
  async deleteCharacterFromApi(id: ID): Promise<void> {
    this.deleteCharacter(id);

    try {
      await fetch(`/api/characters/${id}`, {
        method: 'DELETE',
        headers: apiHeaders(),
        credentials: 'include',
      });
      this.isApiReachable = true;
    } catch (err) {
      this.isApiReachable = false;
      console.warn(`[StorageManager] deleteCharacterFromApi: API unavailable. (${err})`);
    }
  }

  /**
   * Saves GM per-character overrides via PUT /api/characters/{id}/gm-overrides.
   * GM-only endpoint — the frontend should only call this when isGameMaster is true.
   */
  async saveGmOverridesToApi(charId: ID, overrides: unknown[]): Promise<void> {
    try {
      await fetch(`/api/characters/${charId}/gm-overrides`, {
        method: 'PUT',
        headers: apiHeaders(),
        credentials: 'include',
        body: JSON.stringify({ gmOverrides: overrides }),
      });
      this.isApiReachable = true;
    } catch (err) {
      this.isApiReachable = false;
      console.warn(`[StorageManager] saveGmOverridesToApi: API unavailable. (${err})`);
    }
  }

  // ---------------------------------------------------------------------------
  // POLLING MECHANISM (ARCHITECTURE.md section 19)
  // ---------------------------------------------------------------------------

  /**
   * Starts the sync polling loop.
   *
   * HOW POLLING WORKS:
   *   1. Every `intervalMs` milliseconds, call GET /api/campaigns/{id}/sync-status.
   *   2. Compare returned timestamps with `this.lastSyncTimestamps`.
   *   3. If `campaignUpdatedAt` changed → call `onCampaignUpdated()`.
   *   4. For each changed character timestamp → collect IDs for re-fetch.
   *   5. Call `onCharactersUpdated(changedCharacterIds)` with the list.
   *   6. Update `this.lastSyncTimestamps` and persist to localStorage.
   *
   * GRACEFUL DEGRADATION:
   *   If the API is unreachable (fetch throws), the interval continues.
   *   The next tick will try again. No error is shown to the user for polling failures
   *   (they will just not see live updates from other players).
   *
   * @param campaignId        - The campaign to poll for.
   * @param onCampaignUpdated - Called when the campaign itself changed (settings, chapters, overrides).
   * @param onCharactersUpdated - Called with an array of character IDs that changed.
   * @param intervalMs        - Polling interval in milliseconds (default: 7000 = 7 seconds).
   */
  startPolling(
    campaignId: ID,
    onCampaignUpdated: () => void,
    onCharactersUpdated: (changedIds: ID[]) => void,
    intervalMs = 7000
  ): void {
    this.stopPolling(); // Clear any existing interval

    const poll = async () => {
      try {
        const response = await fetch(`/api/campaigns/${campaignId}/sync-status`, {
          headers: apiHeaders(),
          credentials: 'include',
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const status = (await response.json()) as {
          campaignUpdatedAt: number;
          characterTimestamps: Record<ID, number>;
        };

        this.isApiReachable = true;

        // Check campaign-level changes
        const lastCampaignTs = this.lastSyncTimestamps['__campaign__'] ?? 0;
        if (status.campaignUpdatedAt > lastCampaignTs) {
          this.lastSyncTimestamps['__campaign__'] = status.campaignUpdatedAt;
          onCampaignUpdated();
        }

        // Check per-character changes
        const changedCharacterIds: ID[] = [];
        for (const [charId, ts] of Object.entries(status.characterTimestamps)) {
          const lastCharTs = this.lastSyncTimestamps[charId] ?? 0;
          if (ts > lastCharTs) {
            this.lastSyncTimestamps[charId] = ts;
            changedCharacterIds.push(charId);
          }
        }

        if (changedCharacterIds.length > 0) {
          onCharactersUpdated(changedCharacterIds);
        }

        // Persist timestamps so they survive page reload
        this.#saveCachedSyncTimestamps();
      } catch {
        this.isApiReachable = false;
        // Silently ignore polling failures (offline mode — no log spam)
      }
    };

    this.pollingInterval = setInterval(poll, intervalMs);
    // Run immediately on start too
    poll();
  }

  /**
   * Stops the polling loop.
   */
  stopPolling(): void {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}

// =============================================================================
// DEBOUNCE HELPER
// =============================================================================

/**
 * Creates a debounced function that delays execution until `delayMs` ms have
 * passed without another call.
 *
 * WHY TWO DELAY VALUES?
 *   - localStorage writes: 500ms (fast, local I/O)
 *   - API writes (PUT /api/characters/{id}): 2000ms (avoid spamming the server)
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

export const storageManager = new StorageManager();
