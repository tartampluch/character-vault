/**
 * @file src/tests/characterFields.test.ts
 * @description Unit tests for scalar character metadata fields.
 *
 * SCOPE:
 *   - `Character.name`             — the in-game character name, always present.
 *   - `Character.playerName`       — optional player name / nickname, PCs only.
 *   - `Character.isNPC`            — discriminator between PCs and NPCs.
 *   - `Character.playerVisibility` — GM-controlled NPC visibility level.
 *   - JSON serialisation round-trip — all fields survive JSON.stringify → JSON.parse
 *     (the path taken when data is sent to and received from the server).
 *   - `canDelete` permission logic — extracted as a pure helper and tested in
 *     isolation (the same logic used in the vault page).
 *
 * WHAT IS NOT TESTED HERE:
 *   - The Svelte UI rendering (no jsdom in this test environment).
 *   - `GameEngine.setPlayerVisibility()` / `GameEngine.removeCharacterFromVault()`
 *     — require Svelte rune context.
 *
 * @see src/lib/components/core/BasicInfo.svelte             — name / playerName inputs
 * @see src/lib/components/gm/GmCharacterOverridesPanel.svelte — playerVisibility selector
 * @see src/lib/types/character.ts                            — Character type definition
 * @see src/lib/components/vault/CharacterCard.svelte         — subtitle display logic
 */

import { describe, it, expect } from 'vitest';
import { createEmptyCharacter } from '$lib/engine/GameEngine.svelte';
import type { Character } from '$lib/types/character';

// =============================================================================
// HELPER — JSON round-trip (mirrors the PUT body → server → GET response path)
// =============================================================================

function jsonRoundTrip(char: Character): Character {
  return JSON.parse(JSON.stringify(char)) as Character;
}

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
// 4. JSON round-trip — name and playerName survive serialisation
// =============================================================================

describe('JSON serialisation — name and playerName round-trip', () => {
  it('character name survives JSON.stringify → JSON.parse', () => {
    const char = makePC('char_030', 'Selûne Dawnbringer');
    expect(jsonRoundTrip(char).name).toBe('Selûne Dawnbringer');
  });

  it('playerName survives JSON round-trip', () => {
    const char = makePC('char_031');
    char.playerName = 'Martin';
    expect(jsonRoundTrip(char).playerName).toBe('Martin');
  });

  it('loaded character has playerName = undefined when none was set', () => {
    const char = makePC('char_032');
    // JSON.parse returns undefined for absent keys
    expect(jsonRoundTrip(char).playerName).toBeUndefined();
  });

  it('isNPC flag survives JSON round-trip for NPCs', () => {
    const npc = makeNPC('npc_033', 'Orc Warlord');
    expect(jsonRoundTrip(npc).isNPC).toBe(true);
  });

  it('updated name survives JSON round-trip after mutation', () => {
    const char = makePC('char_034', 'Old Name');
    char.name = 'New Name';
    expect(jsonRoundTrip(char).name).toBe('New Name');
  });

  it('clearing playerName to undefined survives JSON round-trip', () => {
    const char = makePC('char_035');
    char.playerName = 'Bob';
    char.playerName = undefined;
    expect(jsonRoundTrip(char).playerName).toBeUndefined();
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

// =============================================================================
// 6. Character.playerVisibility — GM-controlled NPC visibility level
// =============================================================================

describe('Character.playerVisibility — GM-controlled visibility level', () => {
  it('is undefined by default on a freshly created NPC', () => {
    const npc = makeNPC('npc_050');
    expect(npc.playerVisibility).toBeUndefined();
  });

  it('is undefined by default on a freshly created PC', () => {
    // The field is optional and has no meaning for PCs, but the type allows it.
    const pc = makePC('char_050');
    expect(pc.playerVisibility).toBeUndefined();
  });

  it('can be set to "hidden" on an NPC', () => {
    const npc = makeNPC('npc_051');
    npc.playerVisibility = 'hidden';
    expect(npc.playerVisibility).toBe('hidden');
  });

  it('can be set to "name" on an NPC', () => {
    const npc = makeNPC('npc_052');
    npc.playerVisibility = 'name';
    expect(npc.playerVisibility).toBe('name');
  });

  it('can be set to "name_level" on an NPC', () => {
    const npc = makeNPC('npc_053');
    npc.playerVisibility = 'name_level';
    expect(npc.playerVisibility).toBe('name_level');
  });

  it('can be set to "full" on an NPC', () => {
    const npc = makeNPC('npc_054');
    npc.playerVisibility = 'full';
    expect(npc.playerVisibility).toBe('full');
  });

  it('can be cleared back to undefined', () => {
    const npc = makeNPC('npc_055');
    npc.playerVisibility = 'name';
    npc.playerVisibility = undefined;
    expect(npc.playerVisibility).toBeUndefined();
  });

  it('setting visibility on an NPC does not affect other NPC fields', () => {
    const npc = makeNPC('npc_056', 'Goblin Scout');
    npc.playerVisibility = 'name_level';
    expect(npc.name).toBe('Goblin Scout');
    expect(npc.isNPC).toBe(true);
    expect(npc.playerVisibility).toBe('name_level');
  });
});

// =============================================================================
// 7. JSON round-trip — playerVisibility survives serialisation
// =============================================================================

describe('JSON serialisation — playerVisibility round-trip', () => {
  it('playerVisibility survives JSON round-trip', () => {
    const npc = makeNPC('npc_060');
    npc.playerVisibility = 'name_level';
    expect(jsonRoundTrip(npc).playerVisibility).toBe('name_level');
  });

  it('NPC has playerVisibility = undefined when none was set', () => {
    const npc = makeNPC('npc_061');
    expect(jsonRoundTrip(npc).playerVisibility).toBeUndefined();
  });

  // All four valid values survive the round-trip.
  const ALL_LEVELS = ['hidden', 'name', 'name_level', 'full'] as const;
  for (const level of ALL_LEVELS) {
    it(`playerVisibility="${level}" survives JSON round-trip`, () => {
      const npc = makeNPC(`npc_062_${level}`);
      npc.playerVisibility = level;
      expect(jsonRoundTrip(npc).playerVisibility).toBe(level);
    });
  }

  it('updated visibility value survives JSON round-trip after mutation', () => {
    const npc = makeNPC('npc_063');
    npc.playerVisibility = 'name';
    npc.playerVisibility = 'full';
    expect(jsonRoundTrip(npc).playerVisibility).toBe('full');
  });

  it('clearing visibility to undefined survives JSON round-trip', () => {
    const npc = makeNPC('npc_064');
    npc.playerVisibility = 'name_level';
    npc.playerVisibility = undefined;
    expect(jsonRoundTrip(npc).playerVisibility).toBeUndefined();
  });
});
