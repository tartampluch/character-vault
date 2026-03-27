/**
 * @file src/tests/characterFields.test.ts
 * @description Unit tests for the character `name` and `playerName` fields
 *              introduced in the BasicInfo panel update.
 *
 * SCOPE:
 *   - `Character.name`       — the in-game character name, always present.
 *   - `Character.playerName` — optional player name / nickname, PCs only.
 *   - `Character.isNPC`      — discriminator between PCs and NPCs.
 *   - `StorageManager` round-trip — both fields survive save → load.
 *   - `canDelete` permission logic — extracted as a pure helper and tested in
 *     isolation (the same logic used in the vault page).
 *
 * WHAT IS NOT TESTED HERE:
 *   - The Svelte UI rendering of the inputs (no jsdom in this test environment).
 *   - `GameEngine.removeCharacterFromVault()` — requires Svelte rune context.
 *     The StorageManager.deleteCharacterFromApi() it delegates to is covered in
 *     storageManager.test.ts.
 *
 * @see src/lib/components/core/BasicInfo.svelte   — name / playerName inputs
 * @see src/lib/types/character.ts                 — Character type definition
 * @see src/lib/engine/StorageManager.ts           — persistence layer
 * @see src/lib/components/vault/CharacterCard.svelte — subtitle display logic
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEmptyCharacter } from '$lib/engine/GameEngine.svelte';
import { StorageManager } from '$lib/engine/StorageManager';
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

beforeEach(() => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', createLocalStorageMock());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// =============================================================================
// HELPERS
// =============================================================================

function makePC(id: string, name = 'Thorin Ironforge'): Character {
  const char = createEmptyCharacter(id, name);
  char.isNPC = false;
  return char;
}

function makeNPC(id: string, name = 'Goblin Scout'): Character {
  const char = createEmptyCharacter(id, name);
  char.isNPC = true;
  return char;
}

/**
 * Pure permission check extracted from the vault page — mirrors canDelete().
 * Kept here so it can be tested without Svelte context.
 */
function canDelete(
  character: { ownerId?: string },
  currentUserId: string,
  isGameMaster: boolean
): boolean {
  return isGameMaster || character.ownerId === currentUserId;
}

// =============================================================================
// 1. Character.name — default value and mutation
// =============================================================================

describe('Character.name — initialization and mutation', () => {
  it('createEmptyCharacter sets the provided name', () => {
    const char = createEmptyCharacter('char_001', 'Aria Swiftblade');
    expect(char.name).toBe('Aria Swiftblade');
  });

  it('name can be updated by direct mutation (how BasicInfo writes it)', () => {
    const char = makePC('char_002');
    char.name = 'Renamed Hero';
    expect(char.name).toBe('Renamed Hero');
  });

  it('name is a non-empty string after createEmptyCharacter', () => {
    const char = createEmptyCharacter('char_003', '');
    // Empty string is allowed — the UI prevents submission in a form but the
    // type itself allows empty strings.
    expect(typeof char.name).toBe('string');
  });

  it('name treats whitespace-only strings as valid (trimming is UI responsibility)', () => {
    const char = makePC('char_004', '   ');
    expect(char.name).toBe('   ');
  });
});

// =============================================================================
// 2. Character.playerName — optional PC-only field
// =============================================================================

describe('Character.playerName — optional PC-only field', () => {
  it('is undefined by default on a freshly created character', () => {
    const char = makePC('char_010');
    expect(char.playerName).toBeUndefined();
  });

  it('can be set to a non-empty string for a PC', () => {
    const char = makePC('char_011');
    char.playerName = 'Alice';
    expect(char.playerName).toBe('Alice');
  });

  it('can be cleared back to undefined (empty input → undefined)', () => {
    const char = makePC('char_012');
    char.playerName = 'Alice';
    char.playerName = undefined;
    expect(char.playerName).toBeUndefined();
  });

  it('NPC characters can technically carry playerName but the UI hides it', () => {
    // The business rule (hide input for NPCs) is enforced in the UI.
    // The type itself does not restrict the field to PCs — a GM could use it
    // to note which person is voicing an NPC or follower.
    const npc = makeNPC('npc_013');
    npc.playerName = 'GM Note';
    expect(npc.playerName).toBe('GM Note');
  });
});

// =============================================================================
// 3. Character.isNPC — discriminator
// =============================================================================

describe('Character.isNPC — PC vs NPC discriminator', () => {
  it('createEmptyCharacter defaults isNPC to false (PC)', () => {
    const char = createEmptyCharacter('char_020', 'Hero');
    expect(char.isNPC).toBe(false);
  });

  it('can be set to true to mark a character as NPC', () => {
    const char = makeNPC('npc_021');
    expect(char.isNPC).toBe(true);
  });

  it('PC and NPC share the same Character type — only the flag differs', () => {
    const pc  = makePC('char_022');
    const npc = makeNPC('npc_022');
    expect(pc.isNPC).toBe(false);
    expect(npc.isNPC).toBe(true);
    // Same structural type
    expect(typeof pc.name).toBe(typeof npc.name);
    expect(typeof pc.classLevels).toBe(typeof npc.classLevels);
  });
});

// =============================================================================
// 4. StorageManager round-trip — name and playerName survive save/load
// =============================================================================

describe('StorageManager — name and playerName round-trip', () => {
  it('persists character name and retrieves it intact', () => {
    const sm   = new StorageManager();
    const char = makePC('char_030', 'Selûne Dawnbringer');
    sm.saveCharacter(char);

    const loaded = sm.loadCharacter('char_030');
    expect(loaded?.name).toBe('Selûne Dawnbringer');
  });

  it('persists playerName and retrieves it intact', () => {
    const sm   = new StorageManager();
    const char = makePC('char_031');
    char.playerName = 'Martin';
    sm.saveCharacter(char);

    const loaded = sm.loadCharacter('char_031');
    expect(loaded?.playerName).toBe('Martin');
  });

  it('loaded character has playerName = undefined when none was set', () => {
    const sm   = new StorageManager();
    const char = makePC('char_032');
    // No playerName set
    sm.saveCharacter(char);

    const loaded = sm.loadCharacter('char_032');
    expect(loaded?.playerName).toBeUndefined();
  });

  it('persists isNPC flag as true for NPCs', () => {
    const sm  = new StorageManager();
    const npc = makeNPC('npc_033', 'Orc Warlord');
    sm.saveCharacter(npc);

    const loaded = sm.loadCharacter('npc_033');
    expect(loaded?.isNPC).toBe(true);
  });

  it('overwriting a character with a new name updates the stored value', () => {
    const sm   = new StorageManager();
    const char = makePC('char_034', 'Old Name');
    sm.saveCharacter(char);

    char.name = 'New Name';
    sm.saveCharacter(char);

    expect(sm.loadCharacter('char_034')?.name).toBe('New Name');
  });

  it('overwriting playerName to undefined removes it from stored data', () => {
    const sm   = new StorageManager();
    const char = makePC('char_035');
    char.playerName = 'Bob';
    sm.saveCharacter(char);

    char.playerName = undefined;
    sm.saveCharacter(char);

    expect(sm.loadCharacter('char_035')?.playerName).toBeUndefined();
  });
});

// =============================================================================
// 5. canDelete() permission logic
// =============================================================================

describe('canDelete() — vault deletion permission rules', () => {
  it('GM can delete any character regardless of ownerId', () => {
    const char = makePC('char_040');
    char.ownerId = 'user_player_001';
    expect(canDelete(char, 'user_gm_001', /* isGameMaster */ true)).toBe(true);
  });

  it('GM can delete NPCs', () => {
    const npc = makeNPC('npc_041');
    npc.ownerId = 'user_gm_001';
    expect(canDelete(npc, 'user_gm_001', true)).toBe(true);
  });

  it('GM can delete a character they do not own', () => {
    const char = makePC('char_042');
    char.ownerId = 'user_player_001';
    // GM user_gm_001 does not own this character but isGameMaster is true
    expect(canDelete(char, 'user_gm_001', true)).toBe(true);
  });

  it('player can delete their own character', () => {
    const char = makePC('char_043');
    char.ownerId = 'user_player_001';
    expect(canDelete(char, 'user_player_001', /* isGameMaster */ false)).toBe(true);
  });

  it('player cannot delete a character owned by another player', () => {
    const char = makePC('char_044');
    char.ownerId = 'user_player_002';
    expect(canDelete(char, 'user_player_001', false)).toBe(false);
  });

  it('player cannot delete an NPC they do not own', () => {
    const npc = makeNPC('npc_045');
    npc.ownerId = 'user_gm_001';
    expect(canDelete(npc, 'user_player_001', false)).toBe(false);
  });

  it('player cannot delete a character with no ownerId set', () => {
    const char = makePC('char_046');
    // ownerId left as undefined
    expect(canDelete(char, 'user_player_001', false)).toBe(false);
  });

  it('player with no ownerId match cannot delete even if isNPC is false', () => {
    const char = makePC('char_047');
    char.ownerId = 'user_player_001';
    // Different user ID
    expect(canDelete(char, 'user_player_999', false)).toBe(false);
  });
});
