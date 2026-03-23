/**
 * @file src/tests/ephemeralEffects.test.ts
 * @description Vitest unit tests for the ephemeral effect lifecycle system.
 *
 * WHAT IS TESTED:
 *   The ephemeral effect system allows one-shot consumable items (potions, oils)
 *   to inject temporary buffs into the character's DAG without permanently modifying
 *   the character. Each effect can be manually dismissed via the "Expire" button.
 *
 *   This test suite covers FOUR aspects:
 *
 * ─── ASPECT 1: TYPE SOUNDNESS ───────────────────────────────────────────────
 *   - `ActiveFeatureInstance.ephemeral` field compiles with all valid fields.
 *   - `ItemFeature.consumable` field compiles with isConsumable + durationHint.
 *   - Non-consumable items correctly lack the `consumable` field.
 *
 * ─── ASPECT 2: consumeItem() LIFECYCLE ──────────────────────────────────────
 *   - Consuming a potion removes the source item instance from activeFeatures.
 *   - Consuming creates a new ephemeral ActiveFeatureInstance with isActive: true.
 *   - The ephemeral instance carries the same featureId as the consumed item.
 *   - The ephemeral instance has ephemeral.isEphemeral = true.
 *   - The ephemeral instance carries durationHint from the feature definition.
 *   - Consuming a non-consumable item returns null (safe guard).
 *   - Consuming a non-existent instanceId returns null (safe guard).
 *   - The ephemeral instanceId is unique even if the same item is consumed twice.
 *   - The source item's selections are copied to the ephemeral instance.
 *
 * ─── ASPECT 3: expireEffect() LIFECYCLE ─────────────────────────────────────
 *   - Expiring an ephemeral effect removes it from activeFeatures.
 *   - Expiring a non-ephemeral instance is blocked (safety guard).
 *   - Expiring a non-existent instanceId logs a warning (no crash).
 *   - After expiry, getEphemeralEffects() returns an empty array.
 *
 * ─── ASPECT 4: getEphemeralEffects() SORTING ────────────────────────────────
 *   - Returns only ephemeral instances (not permanent features).
 *   - Sorts by appliedAtRound descending (most recent first).
 *   - Out-of-combat effects (appliedAtRound = 0) appear last.
 *
 * D&D 3.5 CANONICAL EXAMPLES USED IN TESTS:
 *   - Potion of Bull's Strength → +4 STR enhancement, "3 min" duration.
 *   - Potion of Barkskin +3     → +3 natural armor, "6 min" duration.
 *   - Oil of Magic Weapon       → +1 enhancement on weapon, "1 min" duration.
 *   - Ring of Protection +2     → non-consumable (should be blocked).
 *
 * TESTING APPROACH:
 *   Since GameEngine uses Svelte 5 runes ($state, $derived) which require a
 *   Svelte component context to function, we test the PURE LOGIC only —
 *   the consumeItem / expireEffect algorithms — not the reactive DAG.
 *
 *   We mirror the GameEngine methods as pure functions here, keeping all
 *   test assertions in plain TypeScript without Svelte context.
 *
 * @see src/lib/types/character.ts          — ActiveFeatureInstance.ephemeral field
 * @see src/lib/types/feature.ts            — ItemFeature.consumable field
 * @see src/lib/engine/GameEngine.svelte.ts — consumeItem(), expireEffect(), getEphemeralEffects()
 */

import { describe, it, expect, vi } from 'vitest';
import type { ActiveFeatureInstance } from '../lib/types/character';
import type { ItemFeature, Feature } from '../lib/types/feature';
import type { ID } from '../lib/types/primitives';

// =============================================================================
// TEST FIXTURES — SRD-accurate item definitions
// =============================================================================

/**
 * A consumable potion of Bull's Strength.
 * D&D 3.5: +4 enhancement bonus to STR for 3 minutes (cleric 2, CL 3).
 */
const POTION_BULLS_STRENGTH: ItemFeature = {
  id: 'item_potion_bulls_strength',
  category: 'item',
  ruleSource: 'srd_core',
  label: { en: "Potion of Bull's Strength", fr: "Potion de force du taureau" },
  description: { en: 'Grants +4 STR for 3 minutes.', fr: 'Accorde +4 Force pendant 3 minutes.' },
  tags: ['item', 'potion', 'magic_item', 'consumable'],
  equipmentSlot: 'none',
  weightLbs: 0.1,
  costGp: 300,
  grantedModifiers: [
    {
      id: 'item_potion_bulls_strength_str',
      sourceId: 'item_potion_bulls_strength',
      sourceName: { en: "Potion of Bull's Strength", fr: "Potion de force du taureau" },
      targetId: 'attributes.stat_str',
      value: 4,
      type: 'enhancement',
    },
  ],
  grantedFeatures: [],
  consumable: {
    isConsumable: true,
    durationHint: '3 min',
  },
};

/**
 * A non-consumable ring (Ring of Protection +2).
 * Should NOT be consumable — guard test.
 */
const RING_PROTECTION_2: ItemFeature = {
  id: 'item_ring_protection_2',
  category: 'item',
  ruleSource: 'srd_core',
  label: { en: 'Ring of Protection +2', fr: 'Anneau de protection +2' },
  description: { en: 'Deflection bonus +2 to AC.', fr: 'Bonus de parade +2 à la CA.' },
  tags: ['item', 'ring', 'magic_item'],
  equipmentSlot: 'ring',
  weightLbs: 0,
  costGp: 8000,
  grantedModifiers: [],
  grantedFeatures: [],
  // No `consumable` field — this is a permanent item
};

/**
 * A consumable oil of Bless Weapon.
 * D&D 3.5: Makes a melee weapon good-aligned vs. evil, paladin 1, CL 1.
 */
const OIL_BLESS_WEAPON: ItemFeature = {
  id: 'item_oil_bless_weapon',
  category: 'item',
  ruleSource: 'srd_core',
  label: { en: 'Oil of Bless Weapon', fr: "Huile de bénédiction d'arme" },
  description: { en: 'Applied to melee weapon; treats it as good-aligned.', fr: "..." },
  tags: ['item', 'oil', 'magic_item', 'consumable'],
  equipmentSlot: 'none',
  weightLbs: 0.1,
  costGp: 100,
  grantedModifiers: [],
  grantedFeatures: [],
  consumable: {
    isConsumable: true,
    durationHint: '1 min',
  },
};

// =============================================================================
// PURE HELPER FUNCTIONS — Mirror GameEngine logic for isolated testing
// =============================================================================

/**
 * Pure implementation of GameEngine.consumeItem() logic.
 *
 * Returns the new ephemeral instanceId on success, or null on failure.
 * Mutates `activeFeatures` in-place (same as the engine does on $state).
 */
function consumeItem(
  activeFeatures: ActiveFeatureInstance[],
  featureMap: Map<ID, Feature>,
  sourceInstanceId: ID,
  currentRound = 0
): ID | null {
  const sourceInstance = activeFeatures.find(f => f.instanceId === sourceInstanceId);
  if (!sourceInstance) return null;

  const feature = featureMap.get(sourceInstance.featureId);
  if (!feature) return null;

  // Type-safe consumable check (mirrors the engine's cast)
  const itemFeature = feature as ItemFeature;
  if (!itemFeature.consumable?.isConsumable) return null;

  // Create the ephemeral instance
  const ephemeralInstanceId: ID = `eph_${sourceInstance.featureId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const ephemeralInstance: ActiveFeatureInstance = {
    instanceId: ephemeralInstanceId,
    featureId: sourceInstance.featureId,
    isActive: true,
    selections: sourceInstance.selections ? { ...sourceInstance.selections } : undefined,
    ephemeral: {
      isEphemeral: true,
      appliedAtRound: currentRound,
      sourceItemInstanceId: sourceInstanceId,
      durationHint: itemFeature.consumable.durationHint,
    },
  };

  // Push effect before removing source (avoids one-tick gap)
  activeFeatures.push(ephemeralInstance);

  // Remove the source item (consumed)
  const index = activeFeatures.findIndex(f => f.instanceId === sourceInstanceId);
  if (index !== -1) activeFeatures.splice(index, 1);

  return ephemeralInstanceId;
}

/**
 * Pure implementation of GameEngine.expireEffect() logic.
 * Returns true if the effect was expired, false if blocked/not-found.
 */
function expireEffect(
  activeFeatures: ActiveFeatureInstance[],
  instanceId: ID
): boolean {
  const instance = activeFeatures.find(f => f.instanceId === instanceId);
  if (!instance) return false;
  if (!instance.ephemeral?.isEphemeral) return false;

  const index = activeFeatures.findIndex(f => f.instanceId === instanceId);
  if (index !== -1) activeFeatures.splice(index, 1);
  return true;
}

/**
 * Pure implementation of GameEngine.getEphemeralEffects() logic.
 */
function getEphemeralEffects(activeFeatures: ActiveFeatureInstance[]): ActiveFeatureInstance[] {
  return activeFeatures
    .filter(afi => afi.ephemeral?.isEphemeral === true)
    .sort((a, b) => (b.ephemeral?.appliedAtRound ?? 0) - (a.ephemeral?.appliedAtRound ?? 0));
}

// =============================================================================
// HELPERS — create fresh test state
// =============================================================================

function makePotion(instanceSuffix = '1'): ActiveFeatureInstance {
  return {
    instanceId: `afi_potion_bulls_strength_${instanceSuffix}`,
    featureId: 'item_potion_bulls_strength',
    isActive: false, // Potions start in backpack (not equipped)
  };
}

function makeRingInstance(): ActiveFeatureInstance {
  return {
    instanceId: 'afi_ring_protection_2',
    featureId: 'item_ring_protection_2',
    isActive: true,
  };
}

function makeFeatureMap(): Map<ID, Feature> {
  return new Map<ID, Feature>([
    [POTION_BULLS_STRENGTH.id, POTION_BULLS_STRENGTH],
    [RING_PROTECTION_2.id, RING_PROTECTION_2],
    [OIL_BLESS_WEAPON.id, OIL_BLESS_WEAPON],
  ]);
}

// =============================================================================
// TEST SUITES
// =============================================================================

// ─── ASPECT 1: TYPE SOUNDNESS ─────────────────────────────────────────────────

describe('Ephemeral Effects — Type Soundness', () => {

  it('ActiveFeatureInstance accepts the ephemeral block with all fields', () => {
    const instance: ActiveFeatureInstance = {
      instanceId: 'eph_test_001',
      featureId: 'item_potion_bulls_strength',
      isActive: true,
      ephemeral: {
        isEphemeral: true,
        appliedAtRound: 3,
        sourceItemInstanceId: 'afi_original_potion',
        durationHint: '3 min',
      },
    };
    expect(instance.ephemeral?.isEphemeral).toBe(true);
    expect(instance.ephemeral?.appliedAtRound).toBe(3);
    expect(instance.ephemeral?.durationHint).toBe('3 min');
    expect(instance.ephemeral?.sourceItemInstanceId).toBe('afi_original_potion');
  });

  it('ActiveFeatureInstance.ephemeral is optional (permanent features)', () => {
    const permanent: ActiveFeatureInstance = {
      instanceId: 'afi_race_human',
      featureId: 'race_human',
      isActive: true,
      // No ephemeral field — this is correct for permanent features
    };
    expect(permanent.ephemeral).toBeUndefined();
  });

  it('ItemFeature accepts the consumable block', () => {
    // Directly test that the type accepts the field (compile-time check via value assignment)
    const potion: ItemFeature = POTION_BULLS_STRENGTH;
    expect(potion.consumable?.isConsumable).toBe(true);
    expect(potion.consumable?.durationHint).toBe('3 min');
  });

  it('ItemFeature.consumable is optional (permanent items)', () => {
    const ring: ItemFeature = RING_PROTECTION_2;
    expect(ring.consumable).toBeUndefined();
  });

  it('consumable.durationHint is optional', () => {
    const noHint: ItemFeature = {
      ...POTION_BULLS_STRENGTH,
      consumable: { isConsumable: true },
    };
    expect(noHint.consumable?.isConsumable).toBe(true);
    expect(noHint.consumable?.durationHint).toBeUndefined();
  });
});

// ─── ASPECT 2: consumeItem() LIFECYCLE ────────────────────────────────────────

describe('consumeItem() — Two-Phase Consumption', () => {

  it('removes the source item instance from activeFeatures', () => {
    const activeFeatures: ActiveFeatureInstance[] = [makePotion()];
    const featureMap = makeFeatureMap();
    const sourceId = activeFeatures[0].instanceId;

    consumeItem(activeFeatures, featureMap, sourceId);

    const sourceStillExists = activeFeatures.some(f => f.instanceId === sourceId);
    expect(sourceStillExists).toBe(false);
  });

  it('creates a new ephemeral ActiveFeatureInstance', () => {
    const activeFeatures: ActiveFeatureInstance[] = [makePotion()];
    const featureMap = makeFeatureMap();
    const sourceId = activeFeatures[0].instanceId;

    const ephemeralId = consumeItem(activeFeatures, featureMap, sourceId);

    expect(ephemeralId).not.toBeNull();
    const ephemeralInstance = activeFeatures.find(f => f.instanceId === ephemeralId);
    expect(ephemeralInstance).toBeDefined();
  });

  it('the ephemeral instance has isActive: true (effect is immediately active)', () => {
    const activeFeatures: ActiveFeatureInstance[] = [makePotion()];
    const featureMap = makeFeatureMap();
    const ephemeralId = consumeItem(activeFeatures, featureMap, activeFeatures[0].instanceId)!;

    const effect = activeFeatures.find(f => f.instanceId === ephemeralId)!;
    expect(effect.isActive).toBe(true);
  });

  it('the ephemeral instance carries the same featureId as the consumed item', () => {
    const activeFeatures: ActiveFeatureInstance[] = [makePotion()];
    const featureMap = makeFeatureMap();
    const ephemeralId = consumeItem(activeFeatures, featureMap, activeFeatures[0].instanceId)!;

    const effect = activeFeatures.find(f => f.instanceId === ephemeralId)!;
    expect(effect.featureId).toBe('item_potion_bulls_strength');
  });

  it('the ephemeral instance has ephemeral.isEphemeral = true', () => {
    const activeFeatures: ActiveFeatureInstance[] = [makePotion()];
    const featureMap = makeFeatureMap();
    const ephemeralId = consumeItem(activeFeatures, featureMap, activeFeatures[0].instanceId)!;

    const effect = activeFeatures.find(f => f.instanceId === ephemeralId)!;
    expect(effect.ephemeral?.isEphemeral).toBe(true);
  });

  it('the ephemeral instance carries durationHint from the feature definition', () => {
    const activeFeatures: ActiveFeatureInstance[] = [makePotion()];
    const featureMap = makeFeatureMap();
    const ephemeralId = consumeItem(activeFeatures, featureMap, activeFeatures[0].instanceId)!;

    const effect = activeFeatures.find(f => f.instanceId === ephemeralId)!;
    expect(effect.ephemeral?.durationHint).toBe('3 min'); // from POTION_BULLS_STRENGTH.consumable.durationHint
  });

  it('the ephemeral instance records the current round', () => {
    const activeFeatures: ActiveFeatureInstance[] = [makePotion()];
    const featureMap = makeFeatureMap();
    const ephemeralId = consumeItem(activeFeatures, featureMap, activeFeatures[0].instanceId, 7)!;

    const effect = activeFeatures.find(f => f.instanceId === ephemeralId)!;
    expect(effect.ephemeral?.appliedAtRound).toBe(7);
  });

  it('returns null when consuming a non-consumable item (ring guard)', () => {
    const activeFeatures: ActiveFeatureInstance[] = [makeRingInstance()];
    const featureMap = makeFeatureMap();

    const result = consumeItem(activeFeatures, featureMap, 'afi_ring_protection_2');

    expect(result).toBeNull();
    // Ring should still be in activeFeatures (not removed)
    expect(activeFeatures).toHaveLength(1);
    expect(activeFeatures[0].featureId).toBe('item_ring_protection_2');
  });

  it('returns null when consuming a non-existent instanceId (safe guard)', () => {
    const activeFeatures: ActiveFeatureInstance[] = [];
    const featureMap = makeFeatureMap();

    const result = consumeItem(activeFeatures, featureMap, 'non_existent_id');

    expect(result).toBeNull();
    expect(activeFeatures).toHaveLength(0);
  });

  it('generates unique ephemeral instanceIds when the same item is consumed twice', async () => {
    const activeFeatures: ActiveFeatureInstance[] = [makePotion('a'), makePotion('b')];
    const featureMap = makeFeatureMap();

    // Consume first potion
    const id1 = consumeItem(activeFeatures, featureMap, 'afi_potion_bulls_strength_a')!;
    // Small delay to ensure different timestamp
    await new Promise(r => setTimeout(r, 2));
    // Consume second potion (need to add it back since first consumed removed it)
    activeFeatures.push(makePotion('b'));
    const id2 = consumeItem(activeFeatures, featureMap, 'afi_potion_bulls_strength_b')!;

    expect(id1).not.toBeNull();
    expect(id2).not.toBeNull();
    expect(id1).not.toBe(id2); // Must be unique!
  });

  it('copies selections from the source instance to the ephemeral instance', () => {
    const sourceWithSelections: ActiveFeatureInstance = {
      instanceId: 'afi_potion_with_selections',
      featureId: 'item_potion_bulls_strength',
      isActive: false,
      selections: { color_choice: ['red'] }, // hypothetical choice
    };
    const activeFeatures: ActiveFeatureInstance[] = [sourceWithSelections];
    const featureMap = makeFeatureMap();

    const ephemeralId = consumeItem(activeFeatures, featureMap, 'afi_potion_with_selections')!;
    const effect = activeFeatures.find(f => f.instanceId === ephemeralId)!;

    expect(effect.selections).toEqual({ color_choice: ['red'] });
  });

  it('net activeFeatures count stays the same (remove source, add effect)', () => {
    // Start with 3 features: ring (active), potion (backpack), some feat
    const activeFeatures: ActiveFeatureInstance[] = [
      makeRingInstance(),
      makePotion(),
      { instanceId: 'afi_feat_toughness', featureId: 'feat_toughness', isActive: true },
    ];
    const featureMap = makeFeatureMap();

    consumeItem(activeFeatures, featureMap, 'afi_potion_bulls_strength_1');

    // Still 3 features: ring + ephemeral_effect + feat
    expect(activeFeatures).toHaveLength(3);
  });
});

// ─── ASPECT 3: expireEffect() LIFECYCLE ──────────────────────────────────────

describe('expireEffect() — Manual Effect Dismissal', () => {

  it('removes the ephemeral instance from activeFeatures', () => {
    const activeFeatures: ActiveFeatureInstance[] = [makePotion()];
    const featureMap = makeFeatureMap();
    const ephemeralId = consumeItem(activeFeatures, featureMap, 'afi_potion_bulls_strength_1')!;

    const result = expireEffect(activeFeatures, ephemeralId);

    expect(result).toBe(true);
    expect(activeFeatures.find(f => f.instanceId === ephemeralId)).toBeUndefined();
  });

  it('blocks expiring a non-ephemeral instance (safety guard for permanent features)', () => {
    const activeFeatures: ActiveFeatureInstance[] = [makeRingInstance()];

    const result = expireEffect(activeFeatures, 'afi_ring_protection_2');

    expect(result).toBe(false);
    // Ring must still be there!
    expect(activeFeatures).toHaveLength(1);
    expect(activeFeatures[0].featureId).toBe('item_ring_protection_2');
  });

  it('returns false for non-existent instanceId (no crash)', () => {
    const activeFeatures: ActiveFeatureInstance[] = [];

    const result = expireEffect(activeFeatures, 'does_not_exist');

    expect(result).toBe(false);
  });

  it('after expiry, the character has no active ephemeral effects', () => {
    const activeFeatures: ActiveFeatureInstance[] = [makePotion()];
    const featureMap = makeFeatureMap();
    const ephemeralId = consumeItem(activeFeatures, featureMap, 'afi_potion_bulls_strength_1')!;

    expireEffect(activeFeatures, ephemeralId);

    expect(getEphemeralEffects(activeFeatures)).toHaveLength(0);
  });

  it('expiring one effect does not affect other active effects', () => {
    // Setup: consume two potions, expire one
    const potion1: ActiveFeatureInstance = { instanceId: 'afi_p1', featureId: 'item_potion_bulls_strength', isActive: false };
    const potion2: ActiveFeatureInstance = { instanceId: 'afi_p2', featureId: 'item_potion_bulls_strength', isActive: false };
    const activeFeatures: ActiveFeatureInstance[] = [potion1, potion2];
    const featureMap = makeFeatureMap();

    const eph1 = consumeItem(activeFeatures, featureMap, 'afi_p1')!;
    const eph2 = consumeItem(activeFeatures, featureMap, 'afi_p2')!;

    expireEffect(activeFeatures, eph1);

    const remainingEffects = getEphemeralEffects(activeFeatures);
    expect(remainingEffects).toHaveLength(1);
    expect(remainingEffects[0].instanceId).toBe(eph2);
  });
});

// ─── ASPECT 4: getEphemeralEffects() SORTING ─────────────────────────────────

describe('getEphemeralEffects() — Query and Sorting', () => {

  it('returns only ephemeral instances, not permanent features', () => {
    const ephemeralInstance: ActiveFeatureInstance = {
      instanceId: 'eph_test',
      featureId: 'item_potion_bulls_strength',
      isActive: true,
      ephemeral: { isEphemeral: true, appliedAtRound: 1 },
    };
    const permanentFeature: ActiveFeatureInstance = {
      instanceId: 'afi_race_human',
      featureId: 'race_human',
      isActive: true,
      // No ephemeral field
    };
    const activeFeatures = [ephemeralInstance, permanentFeature];

    const effects = getEphemeralEffects(activeFeatures);

    expect(effects).toHaveLength(1);
    expect(effects[0].instanceId).toBe('eph_test');
  });

  it('returns empty array when no ephemeral effects exist', () => {
    const activeFeatures: ActiveFeatureInstance[] = [
      { instanceId: 'afi_race', featureId: 'race_human', isActive: true },
      { instanceId: 'afi_class', featureId: 'class_fighter', isActive: true },
    ];

    expect(getEphemeralEffects(activeFeatures)).toHaveLength(0);
  });

  it('sorts by appliedAtRound descending (most recent first)', () => {
    const old: ActiveFeatureInstance = {
      instanceId: 'eph_old',
      featureId: 'item_potion_bulls_strength',
      isActive: true,
      ephemeral: { isEphemeral: true, appliedAtRound: 1 },
    };
    const recent: ActiveFeatureInstance = {
      instanceId: 'eph_recent',
      featureId: 'item_potion_bulls_strength',
      isActive: true,
      ephemeral: { isEphemeral: true, appliedAtRound: 5 },
    };
    const middle: ActiveFeatureInstance = {
      instanceId: 'eph_middle',
      featureId: 'item_potion_bulls_strength',
      isActive: true,
      ephemeral: { isEphemeral: true, appliedAtRound: 3 },
    };
    const activeFeatures = [old, recent, middle]; // deliberately out of order

    const sorted = getEphemeralEffects(activeFeatures);

    expect(sorted[0].instanceId).toBe('eph_recent'); // round 5 → first
    expect(sorted[1].instanceId).toBe('eph_middle'); // round 3 → second
    expect(sorted[2].instanceId).toBe('eph_old');    // round 1 → last
  });

  it('out-of-combat effects (appliedAtRound = 0) appear last', () => {
    const inCombat: ActiveFeatureInstance = {
      instanceId: 'eph_in_combat',
      featureId: 'item_potion_bulls_strength',
      isActive: true,
      ephemeral: { isEphemeral: true, appliedAtRound: 2 },
    };
    const outOfCombat: ActiveFeatureInstance = {
      instanceId: 'eph_out_of_combat',
      featureId: 'item_potion_bulls_strength',
      isActive: true,
      ephemeral: { isEphemeral: true, appliedAtRound: 0 },
    };
    const activeFeatures = [outOfCombat, inCombat];

    const sorted = getEphemeralEffects(activeFeatures);

    expect(sorted[0].instanceId).toBe('eph_in_combat');   // round 2 → first
    expect(sorted[1].instanceId).toBe('eph_out_of_combat'); // round 0 → last
  });

  it('an instance with ephemeral.isEphemeral = false is excluded', () => {
    // Edge case: someone set ephemeral.isEphemeral to false (shouldn't happen, but safe)
    const notEphemeral: ActiveFeatureInstance = {
      instanceId: 'eph_false',
      featureId: 'item_potion_bulls_strength',
      isActive: true,
      ephemeral: {
        isEphemeral: true, // required by type — but let's test with undefined cast
      } as never,
    };
    // Rewrite with a plain object override to simulate isEphemeral = false
    (notEphemeral.ephemeral as Record<string, unknown>)['isEphemeral'] = false;

    expect(getEphemeralEffects([notEphemeral])).toHaveLength(0);
  });
});

// ─── INTEGRATION SCENARIO ────────────────────────────────────────────────────

describe('Full Consumption Scenario — Fighter drinks Potion of Bull\'s Strength mid-combat', () => {

  it('models the full lifecycle: backpack → active effect → expired', () => {
    // Start: Fighter has ring (equipped), feat (active), and potion (backpack)
    const ring: ActiveFeatureInstance    = makeRingInstance();
    const feat: ActiveFeatureInstance    = { instanceId: 'afi_feat', featureId: 'feat_toughness', isActive: true };
    const potion: ActiveFeatureInstance  = makePotion();
    const activeFeatures: ActiveFeatureInstance[] = [ring, feat, potion];
    const featureMap = makeFeatureMap();

    // STEP 1: Fighter is at round 4, drinks the potion
    const ephemeralId = consumeItem(activeFeatures, featureMap, potion.instanceId, 4)!;
    expect(ephemeralId).not.toBeNull();

    // STEP 2: Potion is gone from inventory
    expect(activeFeatures.find(f => f.instanceId === potion.instanceId)).toBeUndefined();

    // STEP 3: Ephemeral effect is active
    const effect = activeFeatures.find(f => f.instanceId === ephemeralId)!;
    expect(effect.isActive).toBe(true);
    expect(effect.ephemeral?.isEphemeral).toBe(true);
    expect(effect.ephemeral?.appliedAtRound).toBe(4);
    expect(effect.ephemeral?.durationHint).toBe('3 min');

    // STEP 4: getEphemeralEffects() shows the effect
    const effects = getEphemeralEffects(activeFeatures);
    expect(effects).toHaveLength(1);
    expect(effects[0].featureId).toBe('item_potion_bulls_strength');

    // STEP 5: Ring and feat still intact (no unintended side effects)
    expect(activeFeatures.find(f => f.instanceId === ring.instanceId)).toBeDefined();
    expect(activeFeatures.find(f => f.instanceId === feat.instanceId)).toBeDefined();

    // STEP 6: At round 7 (approximately 3 combat minutes later), player expires the effect
    const expired = expireEffect(activeFeatures, ephemeralId);
    expect(expired).toBe(true);

    // STEP 7: Effect is gone
    expect(getEphemeralEffects(activeFeatures)).toHaveLength(0);

    // STEP 8: Still 2 permanent features (ring + feat)
    expect(activeFeatures).toHaveLength(2);
  });
});
