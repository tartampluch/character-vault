/**
 * @file StorageManager.ts
 * @description Multi-character persistence layer using localStorage.
 *
 * Design philosophy:
 *   The StorageManager is the ONLY component of the system that reads from and writes
 *   to localStorage (Phase 4.1) or the PHP API (Phase 14.6 — refactored later).
 *   No other module should directly access `localStorage`. This separation ensures:
 *     1. The storage backend can be swapped (localStorage → PHP API) without touching
 *        any other file.
 *     2. All serialisation/deserialisation logic is in one place.
 *     3. The `GameEngine` remains pure (computation only, no I/O side effects).
 *
 *   WHAT IS STORED:
 *   - Multiple `Character` objects indexed by their ID.
 *   - The `CampaignSettings` object (language, house rules, enabled sources).
 *   - These are SEPARATE storage keys in localStorage (not a single blob).
 *
 *   LINKEDENTITY SERIALIZATION GUARD:
 *   The `Character.linkedEntities` array contains recursive `Character` objects
 *   (a familiar has its own character data). JSON.stringify handles this correctly
 *   because the `LinkedEntity` type design explicitly PREVENTS back-references
 *   (no `masterId` field — see character.ts). The serialization is always safe.
 *   However, we validate the depth of `linkedEntities` nesting during save to
 *   catch any accidental circular references before they cause a stack overflow.
 *
 *   GMSOVERRIDES SEPARATION:
 *   `Character.gmOverrides` is stored IN the character JSON in localStorage.
 *   (In Phase 14.6, the PHP API splits this into a separate column. But for
 *   localStorage, keeping it together simplifies the implementation.)
 *
 * STORAGE KEY CONVENTIONS:
 *   `cv_character_{id}` — A single character's JSON.
 *   `cv_character_index` — JSON array of known character IDs (for listing).
 *   `cv_campaign_settings` — The CampaignSettings JSON.
 *   `cv_active_character_id` — The last-loaded character's ID (for session restore).
 *
 *   "cv_" prefix: "CharacterVault_" — namespaces our keys to avoid conflicts
 *   with other apps sharing the same localStorage origin.
 *
 * @see src/lib/types/character.ts   for Character, LinkedEntity
 * @see src/lib/types/settings.ts    for CampaignSettings
 * @see src/lib/engine/GameEngine.svelte.ts for the $effect auto-save connection
 */

import type { Character } from '../types/character';
import type { CampaignSettings } from '../types/settings';
import { createDefaultCampaignSettings } from '../types/settings';
import type { ID } from '../types/primitives';

// =============================================================================
// STORAGE KEY CONSTANTS
// =============================================================================

/**
 * Namespace prefix for all localStorage keys used by this application.
 * Prevents key collisions if other apps/tabs share the same origin.
 */
const STORAGE_PREFIX = 'cv_';

const KEYS = {
  /** Index of all known character IDs. Value: JSON-encoded string[]. */
  CHARACTER_INDEX: `${STORAGE_PREFIX}character_index`,
  /** Prefix for individual character records. Full key: cv_character_{id}. */
  CHARACTER_PREFIX: `${STORAGE_PREFIX}character_`,
  /** The CampaignSettings object. Value: JSON-encoded CampaignSettings. */
  CAMPAIGN_SETTINGS: `${STORAGE_PREFIX}campaign_settings`,
  /** The ID of the last-active character (for session restore). Value: string. */
  ACTIVE_CHARACTER_ID: `${STORAGE_PREFIX}active_character_id`,
} as const;

/**
 * Maximum nesting depth for LinkedEntity serialization guard.
 * Prevents stack overflows from accidentally circular structures.
 */
const MAX_LINK_DEPTH = 5;

// =============================================================================
// SERIALIZATION GUARD — LinkedEntity depth check
// =============================================================================

/**
 * Validates that a Character's linkedEntities nesting depth does not exceed the limit.
 *
 * WHY THIS CHECK?
 *   While the `LinkedEntity` type design PREVENTS back-references (no masterId field),
 *   a malformed JSON import or a bug could theoretically create deep nesting.
 *   This check catches it before serialization causes a stack overflow in JSON.stringify.
 *
 * @param char  - The character to validate.
 * @param depth - Current nesting depth (0 for the root character).
 * @returns `true` if nesting is within bounds, `false` if exceeded.
 */
function validateLinkDepth(char: Character, depth = 0): boolean {
  if (depth > MAX_LINK_DEPTH) {
    console.warn(`[StorageManager] LinkedEntity nesting exceeds max depth (${MAX_LINK_DEPTH}). Possible circular reference.`);
    return false;
  }
  for (const linked of char.linkedEntities) {
    if (!validateLinkDepth(linked.characterData, depth + 1)) {
      return false;
    }
  }
  return true;
}

// =============================================================================
// STORAGE MANAGER CLASS
// =============================================================================

/**
 * Manages persistence of characters and campaign settings to localStorage.
 *
 * CRUD OPERATIONS:
 *   - `saveCharacter(char)`:     Serialise and store one character.
 *   - `loadCharacter(id)`:       Retrieve and deserialise one character by ID.
 *   - `deleteCharacter(id)`:     Remove a character and update the index.
 *   - `listCharacters()`:        Return the list of stored character IDs.
 *   - `loadAllCharacters()`:     Load all stored characters (for Vault display).
 *   - `saveSettings(settings)`:  Store the CampaignSettings.
 *   - `loadSettings()`:          Retrieve saved CampaignSettings (or defaults).
 *   - `saveActiveCharacterId(id)`: Persist the last-active character ID.
 *   - `loadActiveCharacterId()`: Retrieve the last-active character ID.
 *
 * AUTO-SAVE (via $effect in GameEngine):
 *   The GameEngine sets up `$effect(() => { storageManager.saveCharacter(engine.character); })`
 *   so that any change to the character $state automatically triggers a save.
 *   This is done in a DEBOUNCED fashion (via a delay wrapper) to avoid saving on every keystroke.
 *   The debounce wrapper is provided by `createDebouncedSave()`.
 */
export class StorageManager {
  /**
   * Whether localStorage is available in the current environment.
   * localStorage is not available in SSR (server-side rendering) contexts.
   * All methods gracefully degrade when `isAvailable` is false.
   */
  private readonly isAvailable: boolean;

  constructor() {
    this.isAvailable = this.#checkAvailability();
  }

  // ---------------------------------------------------------------------------
  // AVAILABILITY CHECK
  // ---------------------------------------------------------------------------

  /**
   * Tests if localStorage is available and writable.
   * Returns false in SSR/test environments where localStorage is not defined.
   */
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

  // ---------------------------------------------------------------------------
  // CHARACTER CRUD
  // ---------------------------------------------------------------------------

  /**
   * Saves a character to localStorage.
   *
   * SERIALIZATION:
   *   Uses JSON.stringify with no replacer (the Character type is designed to be safe).
   *   Validates LinkedEntity nesting depth before serializing.
   *
   * INDEX MAINTENANCE:
   *   The character's ID is added to `cv_character_index` if not already present.
   *   This index is used by `listCharacters()` to discover all stored characters
   *   without scanning all localStorage keys.
   *
   * @param char - The character to save. Must have a valid, non-empty `id`.
   * @returns `true` if save succeeded, `false` on error (logged with warning).
   */
  saveCharacter(char: Character): boolean {
    if (!this.isAvailable) return false;
    if (!char.id) {
      console.warn('[StorageManager] saveCharacter: character has no ID. Skipping.');
      return false;
    }

    // Validate link depth before serialization (catch circular reference bugs early)
    if (!validateLinkDepth(char)) {
      console.warn(`[StorageManager] saveCharacter: character "${char.id}" has excessive nesting. Save aborted.`);
      return false;
    }

    try {
      const json = JSON.stringify(char);
      localStorage.setItem(`${KEYS.CHARACTER_PREFIX}${char.id}`, json);

      // Update the character index
      const index = this.listCharacterIds();
      if (!index.includes(char.id)) {
        index.push(char.id);
        localStorage.setItem(KEYS.CHARACTER_INDEX, JSON.stringify(index));
      }

      return true;
    } catch (err) {
      console.warn(`[StorageManager] saveCharacter: failed to save character "${char.id}":`, err);
      return false;
    }
  }

  /**
   * Loads a character from localStorage by ID.
   *
   * @param id - The character ID to load.
   * @returns The parsed Character object, or `null` if not found or parse error.
   */
  loadCharacter(id: ID): Character | null {
    if (!this.isAvailable) return null;

    try {
      const json = localStorage.getItem(`${KEYS.CHARACTER_PREFIX}${id}`);
      if (!json) return null;
      return JSON.parse(json) as Character;
    } catch (err) {
      console.warn(`[StorageManager] loadCharacter: failed to load character "${id}":`, err);
      return null;
    }
  }

  /**
   * Deletes a character from localStorage and removes it from the index.
   *
   * @param id - The character ID to delete.
   * @returns `true` if the character was found and deleted, `false` otherwise.
   */
  deleteCharacter(id: ID): boolean {
    if (!this.isAvailable) return false;

    try {
      const key = `${KEYS.CHARACTER_PREFIX}${id}`;
      if (!localStorage.getItem(key)) return false;

      localStorage.removeItem(key);

      // Remove from index
      const index = this.listCharacterIds();
      const newIndex = index.filter(existingId => existingId !== id);
      localStorage.setItem(KEYS.CHARACTER_INDEX, JSON.stringify(newIndex));

      return true;
    } catch (err) {
      console.warn(`[StorageManager] deleteCharacter: failed to delete character "${id}":`, err);
      return false;
    }
  }

  /**
   * Returns the list of all known character IDs from the index.
   * This is the fast O(1) alternative to scanning all localStorage keys.
   *
   * @returns Array of character IDs. Empty array if none stored or on error.
   */
  listCharacterIds(): ID[] {
    if (!this.isAvailable) return [];

    try {
      const json = localStorage.getItem(KEYS.CHARACTER_INDEX);
      if (!json) return [];
      return JSON.parse(json) as ID[];
    } catch {
      return [];
    }
  }

  /**
   * Loads ALL stored characters (used by the Character Vault, Phase 7).
   *
   * Iterates the character index and loads each character.
   * Characters that fail to parse are silently skipped (logged as warnings).
   *
   * @returns Array of all successfully loaded Character objects.
   */
  loadAllCharacters(): Character[] {
    const ids = this.listCharacterIds();
    const characters: Character[] = [];

    for (const id of ids) {
      const char = this.loadCharacter(id);
      if (char) {
        characters.push(char);
      } else {
        console.warn(`[StorageManager] loadAllCharacters: skipping character "${id}" (failed to load).`);
      }
    }

    return characters;
  }

  // ---------------------------------------------------------------------------
  // CAMPAIGN SETTINGS PERSISTENCE
  // ---------------------------------------------------------------------------

  /**
   * Saves the campaign settings to localStorage.
   *
   * Called by the GameEngine's `$effect` whenever settings change.
   * Also called explicitly when the GM updates settings via the Settings page.
   *
   * @param settings - The CampaignSettings object to save.
   * @returns `true` if save succeeded, `false` on error.
   */
  saveSettings(settings: CampaignSettings): boolean {
    if (!this.isAvailable) return false;

    try {
      localStorage.setItem(KEYS.CAMPAIGN_SETTINGS, JSON.stringify(settings));
      return true;
    } catch (err) {
      console.warn('[StorageManager] saveSettings: failed to save settings:', err);
      return false;
    }
  }

  /**
   * Loads campaign settings from localStorage.
   *
   * Falls back to `createDefaultCampaignSettings()` if no settings are stored
   * (first-time user, cleared storage, or parse error).
   *
   * @returns The loaded CampaignSettings, or default settings as fallback.
   */
  loadSettings(): CampaignSettings {
    if (!this.isAvailable) return createDefaultCampaignSettings();

    try {
      const json = localStorage.getItem(KEYS.CAMPAIGN_SETTINGS);
      if (!json) return createDefaultCampaignSettings();
      return JSON.parse(json) as CampaignSettings;
    } catch (err) {
      console.warn('[StorageManager] loadSettings: failed to parse settings. Using defaults:', err);
      return createDefaultCampaignSettings();
    }
  }

  // ---------------------------------------------------------------------------
  // SESSION RESTORE
  // ---------------------------------------------------------------------------

  /**
   * Saves the ID of the currently active character for session restore.
   * Called by the GameEngine whenever the active character changes.
   *
   * @param id - The character ID to persist (or null to clear).
   */
  saveActiveCharacterId(id: ID | null): void {
    if (!this.isAvailable) return;

    if (id === null) {
      localStorage.removeItem(KEYS.ACTIVE_CHARACTER_ID);
    } else {
      localStorage.setItem(KEYS.ACTIVE_CHARACTER_ID, id);
    }
  }

  /**
   * Loads the ID of the last-active character for session restore.
   *
   * @returns The saved character ID, or `null` if none is stored.
   */
  loadActiveCharacterId(): ID | null {
    if (!this.isAvailable) return null;

    return localStorage.getItem(KEYS.ACTIVE_CHARACTER_ID);
  }

  // ---------------------------------------------------------------------------
  // FULL RESET (for testing and "New Campaign" scenarios)
  // ---------------------------------------------------------------------------

  /**
   * Removes ALL application data from localStorage.
   *
   * ⚠️ DESTRUCTIVE: This deletes character data and settings.
   *    Only call from explicit user actions ("Reset All Data") or test setup/teardown.
   *
   * Does NOT remove the `cv_` test key (used by the availability check, harmless).
   */
  clearAll(): void {
    if (!this.isAvailable) return;

    const ids = this.listCharacterIds();
    for (const id of ids) {
      localStorage.removeItem(`${KEYS.CHARACTER_PREFIX}${id}`);
    }
    localStorage.removeItem(KEYS.CHARACTER_INDEX);
    localStorage.removeItem(KEYS.CAMPAIGN_SETTINGS);
    localStorage.removeItem(KEYS.ACTIVE_CHARACTER_ID);
  }
}

// =============================================================================
// DEBOUNCE HELPER — for auto-save integration
// =============================================================================

/**
 * Creates a debounced version of a function that delays execution until
 * `delayMs` milliseconds have passed without another call.
 *
 * WHY DEBOUNCE?
 *   The GameEngine's `$effect` fires synchronously on every $state mutation.
 *   Without debouncing, typing a single character in a text input would trigger
 *   50+ `localStorage.setItem` calls per second (one per keypress).
 *   With a 500ms debounce, we wait until the user pauses before saving.
 *
 *   In Phase 14.6 (PHP API), the debounce delay is increased to 2000ms to avoid
 *   spamming the server.
 *
 * @param fn      - The function to debounce.
 * @param delayMs - Milliseconds to wait after the last call before executing.
 * @returns The debounced version of `fn`.
 */
export function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  delayMs: number
): (...args: T) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: T): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
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
 * The single shared StorageManager instance.
 *
 * The GameEngine connects to this singleton via `$effect` to auto-save:
 * ```typescript
 * // In GameEngine.svelte.ts (Phase 4.1 integration step):
 * $effect(() => {
 *   debouncedSave(this.character);
 * });
 * const debouncedSave = debounce((char: Character) => {
 *   storageManager.saveCharacter(char);
 * }, 500);
 * ```
 */
export const storageManager = new StorageManager();
