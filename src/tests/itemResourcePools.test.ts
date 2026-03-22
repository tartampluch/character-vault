/**
 * @file src/tests/itemResourcePools.test.ts
 * @description Vitest unit tests for Enhancement E-2: instance-scoped item resource pools.
 *
 * WHAT IS TESTED:
 *   Enhancement E-2 adds `ActiveFeatureInstance.itemResourcePools` and
 *   `Feature.resourcePoolTemplates` to support charged items whose charge counts
 *   travel with the item instance rather than being tied to the character.
 *
 *   This covers:
 *
 *   1. TYPE SOUNDNESS:
 *      - `resourcePoolTemplates` compiles on a Feature.
 *      - `itemResourcePools` compiles on an ActiveFeatureInstance.
 *      - `ResourcePoolTemplate` interface accepts all valid `resetCondition` values.
 *
 *   2. INITIALISATION LOGIC (mirrors `GameEngine.initItemResourcePools()`):
 *      - `initItemResourcePools()` sets `defaultCurrent` for any absent pool key.
 *      - Calling it twice does NOT reset an existing (depleted) count (idempotent).
 *      - Pool entries that are 0 (fully depleted) are not re-initialised.
 *      - Features without `resourcePoolTemplates` produce no `itemResourcePools`.
 *
 *   3. CHARGE SPENDING (mirrors `GameEngine.spendItemPoolCharge()`):
 *      - Spending decrements by the given amount.
 *      - The floor is 0 — charges cannot go negative.
 *      - Spending 0 has no effect.
 *
 *   4. CROSS-INSTANCE INDEPENDENCE:
 *      - Two instances of the same ring item have independent charge pools.
 *        (e.g., both players carry a Ring of the Ram; one's 23 charges are
 *        separate from the other's 50 charges.)
 *
 *   5. CALENDAR RESET INTEGRATION (mirrors `#resetItemPoolsByCondition()`):
 *      - `triggerDawnReset()` restores `"per_day"` item pools to `defaultCurrent`.
 *      - `triggerWeeklyReset()` restores `"per_week"` item pools.
 *      - Dawn reset does NOT touch `"per_week"` or `"never"` pools.
 *      - Weekly reset does NOT touch `"per_day"` or `"never"` pools.
 *
 * D&D 3.5 CANONICAL EXAMPLES:
 *   - Ring of the Ram:              50 charges, `resetCondition: "never"`.
 *   - Ring of Spell Turning:        3/day uses, `resetCondition: "per_day"`.
 *   - Ring of Elemental Command (Air): chain lightning 1/week, `resetCondition: "per_week"`.
 *   - Ring of Three Wishes:         3 ruby-charges, `resetCondition: "never"`.
 *
 * @see src/lib/types/feature.ts        — ResourcePoolTemplate interface
 * @see src/lib/types/character.ts      — ActiveFeatureInstance.itemResourcePools
 * @see src/lib/engine/GameEngine.svelte.ts — initItemResourcePools, spendItemPoolCharge
 * @see ARCHITECTURE.md section 5.7     — complete design documentation
 */

import { describe, it, expect } from 'vitest';
import type { Feature, ResourcePoolTemplate } from '../lib/types/feature';
import type { ActiveFeatureInstance } from '../lib/types/character';

// =============================================================================
// PURE HELPERS — Mirror GameEngine methods for isolated unit testing
// These helpers replicate the GameEngine logic so that tests don't need to spin
// up a full GameEngine instance (which would require Svelte 5 rune context).
// =============================================================================

/**
 * Mirrors `GameEngine.initItemResourcePools()`.
 * Populates `instance.itemResourcePools` from the feature's `resourcePoolTemplates`
 * for any poolId that is not yet present. Idempotent.
 */
function initItemResourcePools(instance: ActiveFeatureInstance, feature: Feature): void {
  if (!feature.resourcePoolTemplates || feature.resourcePoolTemplates.length === 0) return;
  if (!instance.itemResourcePools) {
    instance.itemResourcePools = {};
  }
  for (const template of feature.resourcePoolTemplates) {
    if (!Object.prototype.hasOwnProperty.call(instance.itemResourcePools, template.poolId)) {
      instance.itemResourcePools[template.poolId] = template.defaultCurrent;
    }
  }
}

/**
 * Mirrors `GameEngine.spendItemPoolCharge()`.
 * Decrements the named pool by `amount`, floored at 0.
 */
function spendItemPoolCharge(
  instance: ActiveFeatureInstance,
  poolId: string,
  amount = 1,
): void {
  if (amount <= 0) return;
  if (!instance.itemResourcePools) instance.itemResourcePools = {};
  const current = instance.itemResourcePools[poolId] ?? 0;
  instance.itemResourcePools[poolId] = Math.max(0, current - amount);
}

/**
 * Mirrors `GameEngine.#resetItemPoolsByCondition()`.
 * Restores all pools with matching `resetCondition` to `defaultCurrent`.
 */
function resetItemPoolsByCondition(
  instances: ActiveFeatureInstance[],
  features: Map<string, Feature>,
  condition: ResourcePoolTemplate['resetCondition'],
): void {
  for (const instance of instances) {
    if (!instance.isActive) continue;
    const feature = features.get(instance.featureId);
    if (!feature?.resourcePoolTemplates) continue;
    if (!instance.itemResourcePools) instance.itemResourcePools = {};
    for (const template of feature.resourcePoolTemplates) {
      if (template.resetCondition !== condition) continue;
      instance.itemResourcePools[template.poolId] = template.defaultCurrent;
    }
  }
}

// =============================================================================
// FIXTURES
// =============================================================================

/** Ring of the Ram — 50 finite charges, `resetCondition: "never"`. */
const ringOfRamFeature: Feature = {
  id: 'item_ring_ram',
  category: 'item',
  ruleSource: 'srd_core',
  label: { en: 'Ring of the Ram', fr: 'Anneau du bélier' },
  description: { en: 'Deals 1d6/2d6/3d6 damage and bull rushes.', fr: 'Inflige des dégâts et fait brise-adversaire.' },
  tags: ['item', 'ring', 'magic_item'],
  grantedModifiers: [],
  grantedFeatures: [],
  resourcePoolTemplates: [
    {
      poolId: 'charges',
      label: { en: 'Ram Charges', fr: 'Charges du bélier' },
      maxPipelineId: 'combatStats.ram_charges_max',
      defaultCurrent: 50,
      resetCondition: 'never',
    },
  ],
};

/** Ring of Spell Turning — 3 uses/day, `resetCondition: "per_day"`. */
const ringOfSpellTurningFeature: Feature = {
  id: 'item_ring_spell_turning',
  category: 'item',
  ruleSource: 'srd_core',
  label: { en: 'Ring of Spell Turning', fr: 'Anneau de renvoi des sorts' },
  description: { en: 'Up to 3 times per day, reflects the next 9 levels of spells cast at the wearer.', fr: '' },
  tags: ['item', 'ring', 'magic_item'],
  grantedModifiers: [],
  grantedFeatures: [],
  resourcePoolTemplates: [
    {
      poolId: 'spell_turning_uses',
      label: { en: 'Spell Turning (3/day)', fr: 'Renvoi des sorts (3/jour)' },
      maxPipelineId: 'combatStats.spell_turning_max',
      defaultCurrent: 3,
      resetCondition: 'per_day',
    },
  ],
};

/** Ring of Elemental Command (Air) — multiple pools at different cadences. */
const ringAirFeature: Feature = {
  id: 'item_ring_elemental_command_air',
  category: 'item',
  ruleSource: 'srd_core',
  label: { en: 'Ring of Elemental Command (Air)', fr: 'Anneau de commandement élémentaire (Air)' },
  description: { en: 'Commands air elementals; grants several magical abilities.', fr: '' },
  tags: ['item', 'ring', 'magic_item'],
  grantedModifiers: [],
  grantedFeatures: [],
  resourcePoolTemplates: [
    {
      poolId: 'gust_of_wind_uses',
      label: { en: 'Gust of Wind (2/day)', fr: 'Rafale de vent (2/jour)' },
      maxPipelineId: 'combatStats.gust_wind_max',
      defaultCurrent: 2,
      resetCondition: 'per_day',
    },
    {
      poolId: 'air_walk_uses',
      label: { en: 'Air Walk (1/day)', fr: 'Marche dans les airs (1/jour)' },
      maxPipelineId: 'combatStats.air_walk_max',
      defaultCurrent: 1,
      resetCondition: 'per_day',
    },
    {
      poolId: 'chain_lightning_uses',
      label: { en: 'Chain Lightning (1/week)', fr: 'Éclair multiple (1/semaine)' },
      maxPipelineId: 'combatStats.chain_lightning_max',
      defaultCurrent: 1,
      resetCondition: 'per_week',
    },
  ],
};

/** A plain armor item with no resource pool templates (control fixture). */
const chainShirtFeature: Feature = {
  id: 'item_chain_shirt',
  category: 'item',
  ruleSource: 'srd_core',
  label: { en: 'Chain Shirt', fr: 'Chemise de mailles' },
  description: { en: 'Light armor.', fr: '' },
  tags: ['item', 'armor', 'light_armor'],
  grantedModifiers: [],
  grantedFeatures: [],
  // No resourcePoolTemplates — represents the vast majority of non-charged items
};

/** Creates a minimal ActiveFeatureInstance. */
function makeInstance(instanceId: string, featureId: string): ActiveFeatureInstance {
  return { instanceId, featureId, isActive: true };
}

// =============================================================================
// SECTION 1: TypeScript type soundness
// =============================================================================

describe('ResourcePoolTemplate — type soundness (E-2)', () => {
  it('compiles with resetCondition: "never" (finite charges)', () => {
    const template: ResourcePoolTemplate = {
      poolId: 'charges',
      label: { en: 'Charges' },
      maxPipelineId: 'combatStats.charges_max',
      defaultCurrent: 50,
      resetCondition: 'never',
    };
    expect(template.resetCondition).toBe('never');
  });

  it('compiles with resetCondition: "per_day"', () => {
    const template: ResourcePoolTemplate = {
      poolId: 'daily_uses',
      label: { en: 'Uses (1/day)' },
      maxPipelineId: 'combatStats.daily_max',
      defaultCurrent: 1,
      resetCondition: 'per_day',
    };
    expect(template.resetCondition).toBe('per_day');
  });

  it('compiles with resetCondition: "per_week"', () => {
    const template: ResourcePoolTemplate = {
      poolId: 'weekly_uses',
      label: { en: 'Uses (1/week)' },
      maxPipelineId: 'combatStats.weekly_max',
      defaultCurrent: 1,
      resetCondition: 'per_week',
    };
    expect(template.resetCondition).toBe('per_week');
  });

  it('compiles with resetCondition: "long_rest"', () => {
    const template: ResourcePoolTemplate = {
      poolId: 'rest_uses',
      label: { en: 'Uses per rest' },
      maxPipelineId: 'combatStats.rest_max',
      defaultCurrent: 2,
      resetCondition: 'long_rest',
    };
    expect(template.resetCondition).toBe('long_rest');
  });

  it('accepts optional rechargeAmount for incremental pools', () => {
    const template: ResourcePoolTemplate = {
      poolId: 'slow_charges',
      label: { en: 'Slow Recharge' },
      maxPipelineId: 'p',
      defaultCurrent: 10,
      resetCondition: 'per_turn',
      rechargeAmount: 1,
    };
    expect(template.rechargeAmount).toBe(1);
  });

  it('ActiveFeatureInstance accepts itemResourcePools field', () => {
    const instance: ActiveFeatureInstance = {
      instanceId: 'afi_ring_ram_abc',
      featureId: 'item_ring_ram',
      isActive: true,
      itemResourcePools: { charges: 27 },
    };
    expect(instance.itemResourcePools?.['charges']).toBe(27);
  });

  it('itemResourcePools is optional on ActiveFeatureInstance', () => {
    const instance: ActiveFeatureInstance = {
      instanceId: 'afi_chain_shirt_xyz',
      featureId: 'item_chain_shirt',
      isActive: true,
      // itemResourcePools intentionally absent
    };
    expect(instance.itemResourcePools).toBeUndefined();
  });
});

// =============================================================================
// SECTION 2: initItemResourcePools — idempotent initialisation
// =============================================================================

describe('initItemResourcePools — idempotent initialisation (E-2)', () => {
  it('sets defaultCurrent for each pool on a fresh instance', () => {
    // Scenario: Player equips a brand-new Ring of the Ram (no prior itemResourcePools).
    const instance = makeInstance('afi_ram_001', 'item_ring_ram');
    initItemResourcePools(instance, ringOfRamFeature);

    expect(instance.itemResourcePools).toBeDefined();
    expect(instance.itemResourcePools!['charges']).toBe(50); // default = full 50 charges
  });

  it('does NOT reset an existing depleted pool (idempotent)', () => {
    // Scenario: Player has used 27 charges (23 remaining). Re-equipping must not reset.
    const instance = makeInstance('afi_ram_002', 'item_ring_ram');
    instance.itemResourcePools = { charges: 23 }; // pre-existing depleted state

    initItemResourcePools(instance, ringOfRamFeature); // call it again

    // The existing 23 should NOT be overwritten with 50.
    expect(instance.itemResourcePools!['charges']).toBe(23);
  });

  it('does NOT reset a fully depleted pool (0 charges)', () => {
    // Scenario: Ring of the Ram fully exhausted. initItemResourcePools should not replenish.
    const instance = makeInstance('afi_ram_003', 'item_ring_ram');
    instance.itemResourcePools = { charges: 0 }; // fully spent

    initItemResourcePools(instance, ringOfRamFeature);

    // hasOwnProperty check means 0 ≠ absent — do not re-initialise.
    expect(instance.itemResourcePools!['charges']).toBe(0);
  });

  it('initialises multiple pools from a multi-template feature', () => {
    // Ring of Elemental Command (Air): three separate pools.
    const instance = makeInstance('afi_air_001', 'item_ring_elemental_command_air');
    initItemResourcePools(instance, ringAirFeature);

    expect(instance.itemResourcePools!['gust_of_wind_uses']).toBe(2);
    expect(instance.itemResourcePools!['air_walk_uses']).toBe(1);
    expect(instance.itemResourcePools!['chain_lightning_uses']).toBe(1);
  });

  it('partially initialises: adds only the NEW pool, keeps existing ones', () => {
    // Scenario: gust_of_wind was already set; only the others need to be added.
    const instance = makeInstance('afi_air_002', 'item_ring_elemental_command_air');
    instance.itemResourcePools = { gust_of_wind_uses: 1 }; // 1 gust remaining

    initItemResourcePools(instance, ringAirFeature);

    expect(instance.itemResourcePools!['gust_of_wind_uses']).toBe(1);   // unchanged
    expect(instance.itemResourcePools!['air_walk_uses']).toBe(1);        // freshly added
    expect(instance.itemResourcePools!['chain_lightning_uses']).toBe(1); // freshly added
  });

  it('does nothing for a feature with no resourcePoolTemplates', () => {
    // Chain Shirt has no templates — itemResourcePools must remain absent.
    const instance = makeInstance('afi_chain_001', 'item_chain_shirt');
    initItemResourcePools(instance, chainShirtFeature);

    expect(instance.itemResourcePools).toBeUndefined();
  });
});

// =============================================================================
// SECTION 3: spendItemPoolCharge — atomic charge deduction
// =============================================================================

describe('spendItemPoolCharge — charge deduction (E-2)', () => {
  it('decrements the charge count by the given amount', () => {
    // Scenario: Ring of the Ram — spend 3 charges for the maximum 3d6 attack.
    const instance = makeInstance('afi_ram_004', 'item_ring_ram');
    instance.itemResourcePools = { charges: 50 };

    spendItemPoolCharge(instance, 'charges', 3);

    expect(instance.itemResourcePools!['charges']).toBe(47);
  });

  it('defaults to spending 1 charge when no amount is specified', () => {
    const instance = makeInstance('afi_ram_005', 'item_ring_ram');
    instance.itemResourcePools = { charges: 10 };

    spendItemPoolCharge(instance, 'charges'); // default amount = 1

    expect(instance.itemResourcePools!['charges']).toBe(9);
  });

  it('floors at 0 — cannot spend more than available (no negative charges)', () => {
    // Scenario: only 1 charge remains, but GM tries to spend 5.
    const instance = makeInstance('afi_ram_006', 'item_ring_ram');
    instance.itemResourcePools = { charges: 1 };

    spendItemPoolCharge(instance, 'charges', 5);

    expect(instance.itemResourcePools!['charges']).toBe(0);
  });

  it('spending 0 has no effect', () => {
    const instance = makeInstance('afi_ram_007', 'item_ring_ram');
    instance.itemResourcePools = { charges: 23 };

    spendItemPoolCharge(instance, 'charges', 0);

    expect(instance.itemResourcePools!['charges']).toBe(23); // unchanged
  });

  it('handles spending on an absent pool (starts at 0, floored at 0)', () => {
    // Pool not yet in itemResourcePools; treat as 0.
    const instance = makeInstance('afi_ram_008', 'item_ring_ram');
    instance.itemResourcePools = {};

    spendItemPoolCharge(instance, 'charges', 1);

    expect(instance.itemResourcePools!['charges']).toBe(0);
  });

  it('spending from one pool does not affect another pool on the same instance', () => {
    const instance = makeInstance('afi_air_003', 'item_ring_elemental_command_air');
    instance.itemResourcePools = {
      gust_of_wind_uses: 2,
      air_walk_uses: 1,
      chain_lightning_uses: 1,
    };

    spendItemPoolCharge(instance, 'gust_of_wind_uses', 1);

    expect(instance.itemResourcePools!['gust_of_wind_uses']).toBe(1);   // reduced
    expect(instance.itemResourcePools!['air_walk_uses']).toBe(1);        // unchanged
    expect(instance.itemResourcePools!['chain_lightning_uses']).toBe(1); // unchanged
  });
});

// =============================================================================
// SECTION 4: Cross-instance independence
// =============================================================================

describe('Cross-instance independence — two rings, separate charge pools (E-2)', () => {
  /**
   * This is the core motivation for instance-scoped pools:
   * if two characters each carry a Ring of the Ram at different charge levels,
   * their pools must be completely independent. Spending from one must not
   * affect the other.
   */
  it('two Ring of the Ram instances have completely independent charge pools', () => {
    const aldarysRing = makeInstance('afi_ram_aldary', 'item_ring_ram');
    const thorinRing  = makeInstance('afi_ram_thorin',  'item_ring_ram');

    initItemResourcePools(aldarysRing, ringOfRamFeature);
    initItemResourcePools(thorinRing,  ringOfRamFeature);

    // Thorin's ring has been used heavily — only 7 charges left.
    thorinRing.itemResourcePools!['charges'] = 7;

    // Aldarys uses her ring: spends 2 charges.
    spendItemPoolCharge(aldarysRing, 'charges', 2);

    // Aldarys: 50 − 2 = 48.
    expect(aldarysRing.itemResourcePools!['charges']).toBe(48);
    // Thorin: 7, completely unchanged by Aldarys's action.
    expect(thorinRing.itemResourcePools!['charges']).toBe(7);
  });
});

// =============================================================================
// SECTION 5: Calendar reset integration
// =============================================================================

describe('Calendar reset integration — "per_day" and "per_week" item pools (E-2)', () => {
  it('dawn reset restores "per_day" item pools to defaultCurrent', () => {
    // Scenario: Spell Turning ring used twice today (1/3 remaining), dawn arrives.
    const instance = makeInstance('afi_st_001', 'item_ring_spell_turning');
    instance.isActive = true;
    instance.itemResourcePools = { spell_turning_uses: 1 };

    const featureMap = new Map<string, Feature>([
      ['item_ring_spell_turning', ringOfSpellTurningFeature],
    ]);

    resetItemPoolsByCondition([instance], featureMap, 'per_day');

    expect(instance.itemResourcePools!['spell_turning_uses']).toBe(3); // restored to defaultCurrent
  });

  it('weekly reset restores "per_week" item pools to defaultCurrent', () => {
    // Scenario: Chain lightning used, a week passes.
    const instance = makeInstance('afi_air_004', 'item_ring_elemental_command_air');
    instance.isActive = true;
    instance.itemResourcePools = {
      gust_of_wind_uses: 2,
      air_walk_uses: 0,
      chain_lightning_uses: 0, // used this week
    };

    const featureMap = new Map<string, Feature>([
      ['item_ring_elemental_command_air', ringAirFeature],
    ]);

    resetItemPoolsByCondition([instance], featureMap, 'per_week');

    // Only the per_week pool (chain_lightning) should be restored.
    expect(instance.itemResourcePools!['chain_lightning_uses']).toBe(1); // restored
    expect(instance.itemResourcePools!['gust_of_wind_uses']).toBe(2);    // unchanged (per_day)
    expect(instance.itemResourcePools!['air_walk_uses']).toBe(0);         // unchanged (per_day)
  });

  it('dawn reset does NOT restore "per_week" pools', () => {
    // Chain lightning is per_week — dawn should not restore it.
    const instance = makeInstance('afi_air_005', 'item_ring_elemental_command_air');
    instance.isActive = true;
    instance.itemResourcePools = {
      gust_of_wind_uses: 0,
      air_walk_uses: 0,
      chain_lightning_uses: 0, // spent this week, dawn should NOT restore it
    };

    const featureMap = new Map<string, Feature>([
      ['item_ring_elemental_command_air', ringAirFeature],
    ]);

    resetItemPoolsByCondition([instance], featureMap, 'per_day');

    expect(instance.itemResourcePools!['gust_of_wind_uses']).toBe(2);    // restored (per_day)
    expect(instance.itemResourcePools!['air_walk_uses']).toBe(1);         // restored (per_day)
    expect(instance.itemResourcePools!['chain_lightning_uses']).toBe(0);  // NOT restored (per_week)
  });

  it('dawn reset does NOT restore "never" pools (finite charges)', () => {
    // Ring of the Ram charges are finite and never reset.
    const instance = makeInstance('afi_ram_009', 'item_ring_ram');
    instance.isActive = true;
    instance.itemResourcePools = { charges: 8 };

    const featureMap = new Map<string, Feature>([
      ['item_ring_ram', ringOfRamFeature],
    ]);

    resetItemPoolsByCondition([instance], featureMap, 'per_day');

    expect(instance.itemResourcePools!['charges']).toBe(8); // unchanged
  });

  it('stashed (isActive: false) instances are not reset by calendar resets', () => {
    // An item in storage doesn't benefit from daily reset until equipped.
    const instance = makeInstance('afi_st_002', 'item_ring_spell_turning');
    instance.isActive = false; // stashed
    instance.itemResourcePools = { spell_turning_uses: 0 };

    const featureMap = new Map<string, Feature>([
      ['item_ring_spell_turning', ringOfSpellTurningFeature],
    ]);

    resetItemPoolsByCondition([instance], featureMap, 'per_day');

    expect(instance.itemResourcePools!['spell_turning_uses']).toBe(0); // not reset
  });
});
