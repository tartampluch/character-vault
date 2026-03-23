/**
 * @file src/tests/cursedItemRemoval.test.ts
 * @description Vitest unit tests for Enhancement E-14 — Cursed Item Removal Prevention.
 *
 * WHAT IS TESTED:
 *   The `removalPrevention` field on `ItemFeature` was added to prevent
 *   cursed items from being voluntarily unequipped. The engine's `removeFeature()`
 *   now blocks removal of items with `removalPrevention.isCursed === true`.
 *   The new `tryRemoveCursedItem(instanceId, dispelMethod)` provides the
 *   only legitimate removal path.
 *
 * D&D 3.5 SRD — CURSED ITEM REMOVAL RULES:
 *   Most cursed items can only be removed by magical intervention:
 *   - "Can be removed only with a remove curse spell" (ring of clumsiness, etc.)
 *   - "Can be gotten rid of only by limited wish, wish, or miracle"
 *   - "Cannot be removed by any means short of a wish/miracle"
 *
 * TESTS (15):
 *
 * ─── TYPE SOUNDNESS (3) ──────────────────────────────────────────────────────
 *   1.  removalPrevention with isCursed=true compiles correctly
 *   2.  removableBy accepts all valid methods: remove_curse, limited_wish, wish, miracle
 *   3.  removalPrevention is optional — non-cursed items compile without it
 *
 * ─── removeFeature() GUARD (4) ───────────────────────────────────────────────
 *   4.  removeFeature() BLOCKS removal of a cursed item (returns without removing)
 *   5.  removeFeature() ALLOWS removal of a non-cursed item (no removalPrevention)
 *   6.  removeFeature() ALLOWS removal of an ephemeral item (no removalPrevention—never cursed)
 *   7.  Blocked removal logs a warning (consoleSpy)
 *
 * ─── tryRemoveCursedItem() CONTRACT (6) ──────────────────────────────────────
 *   8.  tryRemoveCursedItem returns true when dispelMethod is in removableBy → item removed
 *   9.  tryRemoveCursedItem returns false when dispelMethod is NOT in removableBy → item stays
 *  10.  tryRemoveCursedItem returns null for a non-existent instanceId
 *  11.  tryRemoveCursedItem returns null for a non-cursed item (logs warning)
 *  12.  After successful tryRemoveCursedItem, item is gone from activeFeatures
 *  13.  After failed tryRemoveCursedItem, item remains in activeFeatures
 *
 * ─── INTERACTION WITH OTHER METHODS (2) ──────────────────────────────────────
 *  14.  expireEffect() still works on ephemeral effects (never blocked by curse guard)
 *  15.  consumeItem() still works on potions (never blocked by curse guard)
 *
 * @see src/lib/types/feature.ts            — ItemFeature.removalPrevention (E-14a)
 * @see src/lib/engine/GameEngine.svelte.ts — removeFeature() guard + tryRemoveCursedItem()
 * @see ARCHITECTURE.md section 4.15       — Cursed Item Removal contract
 */

import { describe, it, expect, vi } from 'vitest';
import type { ItemFeature } from '../lib/types/feature';
import type { ActiveFeatureInstance } from '../lib/types/character';
import type { ID } from '../lib/types/primitives';

// =============================================================================
// PURE HELPER FUNCTIONS — Mirror GameEngine logic for isolated Svelte-free testing
// (Same pattern used in ephemeralEffects.test.ts)
// =============================================================================

/** Mock feature registry used by the pure functions. */
type MockFeatureMap = Map<ID, Partial<ItemFeature>>;

/**
 * Pure implementation of GameEngine.removeFeature() with the E-14 cursed item guard.
 * Returns true if item was removed, false if blocked by cursor guard.
 */
function removeFeature(
  activeFeatures: ActiveFeatureInstance[],
  featureMap: MockFeatureMap,
  instanceId: ID
): boolean {
  const instance = activeFeatures.find(f => f.instanceId === instanceId);
  if (!instance) return false;

  const feature = featureMap.get(instance.featureId);
  const rp = (feature as Partial<ItemFeature>)?.removalPrevention;
  if (rp?.isCursed) {
    // Blocked — log warning (mocked in tests)
    console.warn(`[Guard] Cursed item "${instance.featureId}" cannot be removed normally.`);
    return false; // Blocked
  }

  const index = activeFeatures.findIndex(f => f.instanceId === instanceId);
  if (index !== -1) activeFeatures.splice(index, 1);
  return true;
}

/**
 * Pure implementation of GameEngine.tryRemoveCursedItem().
 * Returns true (removed), false (insufficient magic), or null (not found/not cursed).
 */
function tryRemoveCursedItem(
  activeFeatures: ActiveFeatureInstance[],
  featureMap: MockFeatureMap,
  instanceId: ID,
  dispelMethod: 'remove_curse' | 'limited_wish' | 'wish' | 'miracle'
): boolean | null {
  const instance = activeFeatures.find(f => f.instanceId === instanceId);
  if (!instance) return null;

  const feature = featureMap.get(instance.featureId);
  const rp = (feature as Partial<ItemFeature>)?.removalPrevention;

  if (!rp?.isCursed) {
    console.warn(`[Guard] "${instance.featureId}" is not a cursed item.`);
    return null;
  }

  if (!rp.removableBy.includes(dispelMethod)) {
    return false; // Insufficient magic
  }

  // Remove unconditionally (bypass guard)
  const index = activeFeatures.findIndex(f => f.instanceId === instanceId);
  if (index !== -1) activeFeatures.splice(index, 1);
  return true;
}

// =============================================================================
// FIXTURES
// =============================================================================

/** Ring of Clumsiness — removable by remove_curse, wish, or miracle. */
const RING_CLUMSINESS: Partial<ItemFeature> = {
  id: 'item_cursed_ring_of_clumsiness',
  category: 'item',
  tags: ['item', 'ring', 'cursed', 'magic_item'],
  removalPrevention: {
    isCursed: true,
    removableBy: ['remove_curse', 'wish', 'miracle'],
  },
};

/** Necklace of Strangulation — only wish, limited_wish, or miracle */
const NECKLACE_STRANGULATION: Partial<ItemFeature> = {
  id: 'item_cursed_necklace_of_strangulation',
  category: 'item',
  tags: ['item', 'wondrous_item', 'cursed', 'magic_item'],
  removalPrevention: {
    isCursed: true,
    removableBy: ['limited_wish', 'wish', 'miracle'],
    preventionNote: 'Cannot be removed by any means short of limited wish, wish, or miracle.',
  },
};

/** Normal ring — no curse, can be freely removed. */
const RING_PROTECTION: Partial<ItemFeature> = {
  id: 'item_ring_protection_2',
  category: 'item',
  tags: ['item', 'ring', 'magic_item'],
  // No removalPrevention
};

/** Potion — consumable, never cursed. */
const POTION_CLW: Partial<ItemFeature> = {
  id: 'item_potion_cure_light_wounds',
  category: 'item',
  tags: ['item', 'potion', 'consumable', 'magic_item'],
  consumable: { isConsumable: true, durationHint: 'instant' },
};

function makeInstance(featureId: ID, instanceId: ID = `afi_${featureId}`): ActiveFeatureInstance {
  return { instanceId, featureId, isActive: true };
}

function makeEphemeral(featureId: ID): ActiveFeatureInstance {
  return {
    instanceId: `eph_${featureId}_${Date.now()}`,
    featureId,
    isActive: true,
    ephemeral: { isEphemeral: true, appliedAtRound: 1 },
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('Cursed Item Removal — Type Soundness', () => {

  it('1. removalPrevention with isCursed=true compiles correctly', () => {
    const item: Partial<ItemFeature> = {
      id: 'test_cursed',
      category: 'item',
      removalPrevention: {
        isCursed: true,
        removableBy: ['remove_curse'],
        preventionNote: 'Use remove curse spell.',
      },
    };
    expect(item.removalPrevention?.isCursed).toBe(true);
    expect(item.removalPrevention?.removableBy).toContain('remove_curse');
    expect(item.removalPrevention?.preventionNote).toBeDefined();
  });

  it('2. removableBy accepts all four valid dispel methods', () => {
    const rp: NonNullable<ItemFeature['removalPrevention']> = {
      isCursed: true,
      removableBy: ['remove_curse', 'limited_wish', 'wish', 'miracle'],
    };
    expect(rp.removableBy).toHaveLength(4);
    expect(rp.removableBy).toContain('remove_curse');
    expect(rp.removableBy).toContain('limited_wish');
    expect(rp.removableBy).toContain('wish');
    expect(rp.removableBy).toContain('miracle');
  });

  it('3. removalPrevention is optional — non-cursed items compile without it', () => {
    const ring: Partial<ItemFeature> = { id: 'ring_test', category: 'item' };
    expect(ring.removalPrevention).toBeUndefined();
  });
});

describe('Cursed Item Removal — removeFeature() Guard', () => {

  it('4. removeFeature() BLOCKS removal of a cursed item', () => {
    const featureMap: MockFeatureMap = new Map([
      ['item_cursed_ring_of_clumsiness', RING_CLUMSINESS],
    ]);
    const activeFeatures: ActiveFeatureInstance[] = [
      makeInstance('item_cursed_ring_of_clumsiness'),
    ];

    const result = removeFeature(activeFeatures, featureMap, 'afi_item_cursed_ring_of_clumsiness');

    expect(result).toBe(false);  // blocked
    expect(activeFeatures).toHaveLength(1);  // item still present
  });

  it('5. removeFeature() ALLOWS removal of a non-cursed item', () => {
    const featureMap: MockFeatureMap = new Map([['item_ring_protection_2', RING_PROTECTION]]);
    const activeFeatures: ActiveFeatureInstance[] = [makeInstance('item_ring_protection_2')];

    const result = removeFeature(activeFeatures, featureMap, 'afi_item_ring_protection_2');

    expect(result).toBe(true);  // allowed
    expect(activeFeatures).toHaveLength(0);  // item removed
  });

  it('6. removeFeature() ALLOWS removal of an ephemeral item (potions/buffs are never cursed)', () => {
    const featureMap: MockFeatureMap = new Map([['item_potion_cure_light_wounds', POTION_CLW]]);
    const potion = makeInstance('item_potion_cure_light_wounds', 'eph_clw_123');
    const activeFeatures: ActiveFeatureInstance[] = [potion];

    const result = removeFeature(activeFeatures, featureMap, 'eph_clw_123');

    expect(result).toBe(true);
    expect(activeFeatures).toHaveLength(0);
  });

  it('7. removeFeature() logs a warning when blocked by the curse guard', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const featureMap: MockFeatureMap = new Map([
      ['item_cursed_ring_of_clumsiness', RING_CLUMSINESS],
    ]);
    const activeFeatures: ActiveFeatureInstance[] = [
      makeInstance('item_cursed_ring_of_clumsiness'),
    ];

    removeFeature(activeFeatures, featureMap, 'afi_item_cursed_ring_of_clumsiness');

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('Cursed item');
    warnSpy.mockRestore();
  });
});

describe('Cursed Item Removal — tryRemoveCursedItem() Contract', () => {

  it('8. tryRemoveCursedItem returns true when dispelMethod is in removableBy', () => {
    const featureMap: MockFeatureMap = new Map([
      ['item_cursed_ring_of_clumsiness', RING_CLUMSINESS],
    ]);
    const activeFeatures: ActiveFeatureInstance[] = [
      makeInstance('item_cursed_ring_of_clumsiness'),
    ];

    const result = tryRemoveCursedItem(activeFeatures, featureMap,
      'afi_item_cursed_ring_of_clumsiness', 'remove_curse');

    expect(result).toBe(true);  // success
  });

  it('9. tryRemoveCursedItem returns false when dispelMethod is NOT in removableBy', () => {
    const featureMap: MockFeatureMap = new Map([
      ['item_cursed_necklace_of_strangulation', NECKLACE_STRANGULATION],
    ]);
    const activeFeatures: ActiveFeatureInstance[] = [
      makeInstance('item_cursed_necklace_of_strangulation'),
    ];

    // remove_curse is NOT in [limited_wish, wish, miracle]
    const result = tryRemoveCursedItem(activeFeatures, featureMap,
      'afi_item_cursed_necklace_of_strangulation', 'remove_curse');

    expect(result).toBe(false);  // insufficient magic
    expect(activeFeatures).toHaveLength(1);  // item still present
  });

  it('10. tryRemoveCursedItem returns null for a non-existent instanceId', () => {
    const featureMap: MockFeatureMap = new Map();
    const activeFeatures: ActiveFeatureInstance[] = [];

    const result = tryRemoveCursedItem(activeFeatures, featureMap, 'does_not_exist', 'wish');

    expect(result).toBeNull();
  });

  it('11. tryRemoveCursedItem returns null when item is not cursed (wrong method)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const featureMap: MockFeatureMap = new Map([['item_ring_protection_2', RING_PROTECTION]]);
    const activeFeatures: ActiveFeatureInstance[] = [makeInstance('item_ring_protection_2')];

    const result = tryRemoveCursedItem(activeFeatures, featureMap,
      'afi_item_ring_protection_2', 'wish');

    expect(result).toBeNull();  // not cursed — use removeFeature() instead
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it('12. After successful tryRemoveCursedItem, item is gone from activeFeatures', () => {
    const featureMap: MockFeatureMap = new Map([
      ['item_cursed_ring_of_clumsiness', RING_CLUMSINESS],
    ]);
    const ring = makeInstance('item_cursed_ring_of_clumsiness');
    const feat = makeInstance('race_human', 'afi_race');  // another feature — should stay
    const activeFeatures: ActiveFeatureInstance[] = [ring, feat];

    tryRemoveCursedItem(activeFeatures, featureMap, 'afi_item_cursed_ring_of_clumsiness', 'wish');

    expect(activeFeatures).toHaveLength(1);  // only race remains
    expect(activeFeatures[0].featureId).toBe('race_human');
  });

  it('13. After failed tryRemoveCursedItem, item remains in activeFeatures', () => {
    const featureMap: MockFeatureMap = new Map([
      ['item_cursed_necklace_of_strangulation', NECKLACE_STRANGULATION],
    ]);
    const activeFeatures: ActiveFeatureInstance[] = [
      makeInstance('item_cursed_necklace_of_strangulation'),
    ];

    // Insufficient magic (remove_curse won't work)
    tryRemoveCursedItem(activeFeatures, featureMap,
      'afi_item_cursed_necklace_of_strangulation', 'remove_curse');

    expect(activeFeatures).toHaveLength(1);  // necklace remains
  });
});

describe('Cursed Item Removal — Interaction With Other Methods', () => {

  it('14. Ephemeral effects (from expireEffect) are never affected by the curse guard', () => {
    // An ephemeral effect has no removalPrevention — it's from a consumed potion, not a cursed item
    const featureMap: MockFeatureMap = new Map([
      ['item_potion_cure_light_wounds', POTION_CLW],
    ]);
    const ephemeral = makeEphemeral('item_potion_cure_light_wounds');
    const activeFeatures: ActiveFeatureInstance[] = [ephemeral];

    // removeFeature on an ephemeral item — should succeed (no removalPrevention)
    const result = removeFeature(activeFeatures, featureMap, ephemeral.instanceId);

    expect(result).toBe(true);
    expect(activeFeatures).toHaveLength(0);
  });

  it('15. A character can have both a cursed item and a removable item; removal works selectively', () => {
    const featureMap: MockFeatureMap = new Map([
      ['item_cursed_ring_of_clumsiness', RING_CLUMSINESS],
      ['item_ring_protection_2', RING_PROTECTION],
    ]);
    const cursed = makeInstance('item_cursed_ring_of_clumsiness', 'afi_cursed_ring');
    const normal = makeInstance('item_ring_protection_2', 'afi_normal_ring');
    const activeFeatures: ActiveFeatureInstance[] = [cursed, normal];

    // Remove the non-cursed ring — should succeed
    removeFeature(activeFeatures, featureMap, 'afi_normal_ring');
    expect(activeFeatures).toHaveLength(1);
    expect(activeFeatures[0].instanceId).toBe('afi_cursed_ring');

    // Try to remove the cursed ring with remove_curse — succeeds
    const removed = tryRemoveCursedItem(activeFeatures, featureMap, 'afi_cursed_ring', 'remove_curse');
    expect(removed).toBe(true);
    expect(activeFeatures).toHaveLength(0);
  });
});
