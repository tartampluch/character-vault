/**
 * @file src/tests/triggerActivation.test.ts
 * @description Vitest unit tests for Enhancement E-4: trigger-based (passive/reaction) activation.
 *
 * WHAT IS TESTED:
 *   Enhancement E-4 adds two new `Feature.activation.actionType` values:
 *     - `"passive"`:  Always active, no player action required.
 *     - `"reaction"`: Fires automatically in response to a trigger event.
 *   It also adds the `triggerEvent?: string` field on `activation` to identify
 *   which in-world event fires the reaction.
 *
 *   Tests cover:
 *
 *   1. TYPE SOUNDNESS:
 *      - `actionType: "passive"` compiles on `Feature.activation`.
 *      - `actionType: "reaction"` compiles on `Feature.activation`.
 *      - `triggerEvent` compiles as an optional string on `Feature.activation`.
 *      - All existing action types remain valid (no regressions).
 *
 *   2. REACTION FEATURE DISCOVERY (mirrors `GameEngine.getReactionFeaturesByTrigger()`):
 *      - Features with matching `triggerEvent` are returned.
 *      - Features with non-matching `triggerEvent` are excluded.
 *      - Features with `actionType !== "reaction"` are excluded (even if they have a `triggerEvent`).
 *      - Inactive features (`isActive: false`) are excluded.
 *      - Multiple features sharing the same trigger event are all returned.
 *
 *   3. PASSIVE FEATURE MECHANICS:
 *      - Passive features have no resource cost.
 *      - Passive features have no `triggerEvent`.
 *      - The `activation` block is optional on passive features (absence = always active by omission).
 *
 * D&D 3.5 CANONICAL EXAMPLES:
 *   - Ring of Feather Falling:  `actionType: "reaction"`, `triggerEvent: "on_fall"`.
 *   - Ring of Counterspells:    `actionType: "reaction"`, `triggerEvent: "on_spell_targeted"`.
 *   - Ring of Swimming:         `actionType: "passive"` (or absent — always active).
 *   - Ring of Protection +2:    No explicit actionType — passive by omission.
 *
 * @see src/lib/types/feature.ts        — Feature.activation.actionType, triggerEvent
 * @see src/lib/engine/GameEngine.svelte.ts — getReactionFeaturesByTrigger()
 * @see ARCHITECTURE.md section 5.5b    — Trigger-Based Activation full specification
 */

import { describe, it, expect } from 'vitest';
import type { Feature } from '../lib/types/feature';
import type { ActiveFeatureInstance } from '../lib/types/character';

// =============================================================================
// PURE HELPER — mirrors GameEngine.getReactionFeaturesByTrigger()
// =============================================================================

/**
 * Pure standalone implementation for unit testing without GameEngine context.
 * Mirrors the production method: returns active features matching a trigger event.
 */
function getReactionFeaturesByTrigger(
  instances: ActiveFeatureInstance[],
  featureMap: Map<string, Feature>,
  triggerEvent: string,
): Feature[] {
  const result: Feature[] = [];
  for (const instance of instances) {
    if (!instance.isActive) continue;
    const feature = featureMap.get(instance.featureId);
    if (!feature?.activation) continue;
    if (
      feature.activation.actionType === 'reaction' &&
      feature.activation.triggerEvent === triggerEvent
    ) {
      result.push(feature);
    }
  }
  return result;
}

// =============================================================================
// FIXTURES
// =============================================================================

const ringFeatherFalling: Feature = {
  id: 'item_ring_feather_falling',
  category: 'item',
  ruleSource: 'srd_core',
  label: { en: 'Ring of Feather Falling', fr: 'Anneau de chute de plume' },
  description: {
    en: 'Acts exactly like feather fall, activated immediately if the wearer falls more than 5 feet.',
    fr: 'Agit comme chute de plume, activé immédiatement si le porteur chute de plus de 1,5 m.',
  },
  tags: ['item', 'ring', 'magic_item'],
  grantedModifiers: [],
  grantedFeatures: [],
  activation: {
    actionType: 'reaction',
    triggerEvent: 'on_fall',
  },
};

const ringCounterspells: Feature = {
  id: 'item_ring_counterspells',
  category: 'item',
  ruleSource: 'srd_core',
  label: { en: 'Ring of Counterspells', fr: 'Anneau de contre-sort' },
  description: {
    en: 'When the stored spell is cast upon the wearer, it is immediately countered.',
    fr: 'Quand le sort stocké est lancé contre le porteur, il est immédiatement contré.',
  },
  tags: ['item', 'ring', 'magic_item'],
  grantedModifiers: [],
  grantedFeatures: [],
  activation: {
    actionType: 'reaction',
    triggerEvent: 'on_spell_targeted',
  },
};

const ringSwimming: Feature = {
  id: 'item_ring_swimming',
  category: 'item',
  ruleSource: 'srd_core',
  label: { en: 'Ring of Swimming', fr: 'Anneau de natation' },
  description: { en: 'Continually grants +5 competence on Swim checks.', fr: '' },
  tags: ['item', 'ring', 'magic_item'],
  grantedModifiers: [
    {
      id: 'ring_swimming_bonus',
      sourceId: 'item_ring_swimming',
      sourceName: { en: 'Ring of Swimming' },
      targetId: 'skills.skill_swim',
      value: 5,
      type: 'competence',
    },
  ],
  grantedFeatures: [],
  activation: {
    actionType: 'passive',
    // No triggerEvent — passive features never fire on a trigger
  },
};

const ringProtection2: Feature = {
  id: 'item_ring_protection_2',
  category: 'item',
  ruleSource: 'srd_core',
  label: { en: 'Ring of Protection +2', fr: 'Anneau de protection +2' },
  description: { en: 'Deflection bonus +2 to AC.', fr: '' },
  tags: ['item', 'ring', 'magic_item'],
  grantedModifiers: [
    {
      id: 'ring_protection_2_ac',
      sourceId: 'item_ring_protection_2',
      sourceName: { en: 'Ring of Protection +2' },
      targetId: 'combatStats.ac_normal',
      value: 2,
      type: 'deflection',
    },
  ],
  grantedFeatures: [],
  // No activation field at all — passive by omission
};

function makeInstance(featureId: string, isActive = true): ActiveFeatureInstance {
  return {
    instanceId: `afi_${featureId}_test`,
    featureId,
    isActive,
  };
}

// =============================================================================
// SECTION 1: TypeScript type soundness
// =============================================================================

describe('Feature.activation — "passive" and "reaction" type soundness (E-4)', () => {
  it('actionType: "passive" compiles and is stored correctly', () => {
    const feat: Feature = {
      ...ringSwimming,
    };
    expect(feat.activation?.actionType).toBe('passive');
  });

  it('actionType: "reaction" compiles and is stored correctly', () => {
    const feat: Feature = {
      ...ringFeatherFalling,
    };
    expect(feat.activation?.actionType).toBe('reaction');
  });

  it('triggerEvent compiles as optional string', () => {
    expect(ringFeatherFalling.activation?.triggerEvent).toBe('on_fall');
    expect(ringCounterspells.activation?.triggerEvent).toBe('on_spell_targeted');
    expect(ringSwimming.activation?.triggerEvent).toBeUndefined(); // passive has none
  });

  it('all pre-existing actionType values remain valid (no regression)', () => {
    const actionTypes: Feature['activation'][] = [
      { actionType: 'standard' },
      { actionType: 'move' },
      { actionType: 'swift' },
      { actionType: 'immediate' },
      { actionType: 'free' },
      { actionType: 'full_round' },
      { actionType: 'minutes' },
      { actionType: 'hours' },
      { actionType: 'passive' },
      { actionType: 'reaction' },
    ];
    // If this compiles, all 10 values are in the union.
    expect(actionTypes).toHaveLength(10);
    for (const a of actionTypes) {
      expect(a?.actionType).toBeTruthy();
    }
  });

  it('passive activation has no resource cost field required', () => {
    const feat: Feature = {
      id: 'test_passive',
      category: 'item',
      ruleSource: 'srd_core',
      label: { en: 'Test Passive Item' },
      description: { en: '' },
      tags: [],
      grantedModifiers: [],
      grantedFeatures: [],
      activation: { actionType: 'passive' },
    };
    expect(feat.activation?.resourceCost).toBeUndefined();
    expect(feat.activation?.tieredResourceCosts).toBeUndefined();
  });
});

// =============================================================================
// SECTION 2: Reaction feature discovery
// =============================================================================

describe('getReactionFeaturesByTrigger — reaction discovery (E-4)', () => {
  const featureMap = new Map<string, Feature>([
    ['item_ring_feather_falling', ringFeatherFalling],
    ['item_ring_counterspells', ringCounterspells],
    ['item_ring_swimming', ringSwimming],
    ['item_ring_protection_2', ringProtection2],
  ]);

  it('returns the matching reaction feature for "on_fall"', () => {
    const instances = [
      makeInstance('item_ring_feather_falling', true),
      makeInstance('item_ring_swimming', true),
    ];

    const result = getReactionFeaturesByTrigger(instances, featureMap, 'on_fall');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('item_ring_feather_falling');
  });

  it('returns the matching reaction feature for "on_spell_targeted"', () => {
    const instances = [
      makeInstance('item_ring_counterspells', true),
      makeInstance('item_ring_feather_falling', true),
    ];

    const result = getReactionFeaturesByTrigger(instances, featureMap, 'on_spell_targeted');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('item_ring_counterspells');
  });

  it('returns empty array when no active feature matches the trigger', () => {
    const instances = [
      makeInstance('item_ring_swimming', true),
      makeInstance('item_ring_protection_2', true),
    ];

    const result = getReactionFeaturesByTrigger(instances, featureMap, 'on_fall');

    expect(result).toHaveLength(0);
  });

  it('returns empty array for an unknown trigger event', () => {
    const instances = [
      makeInstance('item_ring_feather_falling', true),
    ];

    const result = getReactionFeaturesByTrigger(instances, featureMap, 'on_teleported');

    expect(result).toHaveLength(0);
  });

  it('multiple features with the same triggerEvent are all returned', () => {
    // Hypothetical: two items both react to "on_fall".
    const anotherFallReaction: Feature = {
      ...ringFeatherFalling,
      id: 'item_ring_safe_landing',
    };
    const featureMap2 = new Map<string, Feature>([
      ['item_ring_feather_falling', ringFeatherFalling],
      ['item_ring_safe_landing', anotherFallReaction],
    ]);
    const instances = [
      makeInstance('item_ring_feather_falling', true),
      makeInstance('item_ring_safe_landing', true),
    ];

    const result = getReactionFeaturesByTrigger(instances, featureMap2, 'on_fall');

    expect(result).toHaveLength(2);
    expect(result.map((f) => f.id)).toContain('item_ring_feather_falling');
    expect(result.map((f) => f.id)).toContain('item_ring_safe_landing');
  });

  it('excludes inactive instances (isActive: false)', () => {
    // Scenario: Ring of Feather Falling is carried in backpack (not equipped).
    const instances = [
      makeInstance('item_ring_feather_falling', false), // NOT active
    ];

    const result = getReactionFeaturesByTrigger(instances, featureMap, 'on_fall');

    expect(result).toHaveLength(0);
  });

  it('excludes passive features even if they have a matching triggerEvent string', () => {
    // Edge case: a badly authored feature has actionType: "passive" but also sets triggerEvent.
    // The engine should only fire actual "reaction" features.
    const badlyAuthoredFeature: Feature = {
      id: 'item_badly_authored',
      category: 'item',
      ruleSource: 'srd_core',
      label: { en: 'Badly Authored' },
      description: { en: '' },
      tags: [],
      grantedModifiers: [],
      grantedFeatures: [],
      activation: {
        actionType: 'passive', // passive, NOT reaction
        triggerEvent: 'on_fall', // set by mistake
      },
    };
    const featureMap3 = new Map<string, Feature>([
      ['item_badly_authored', badlyAuthoredFeature],
    ]);
    const instances = [makeInstance('item_badly_authored', true)];

    const result = getReactionFeaturesByTrigger(instances, featureMap3, 'on_fall');

    // Should NOT fire — it's passive, not a reaction.
    expect(result).toHaveLength(0);
  });

  it('excludes features with no activation field ("passive by omission")', () => {
    // Ring of Protection +2 has no activation — its bonus is always applied
    // through the DAG, never through the reaction system.
    const instances = [makeInstance('item_ring_protection_2', true)];

    const result = getReactionFeaturesByTrigger(instances, featureMap, 'on_fall');

    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// SECTION 3: Passive feature mechanics
// =============================================================================

describe('Passive features — mechanics (E-4)', () => {
  it('passive features grant modifiers through the DAG, not through reactions', () => {
    // Ring of Swimming grants +5 Swim via grantedModifiers — this is validated
    // through standard DAG processing, not event dispatch.
    expect(ringSwimming.grantedModifiers).toHaveLength(1);
    expect(ringSwimming.grantedModifiers[0].targetId).toBe('skills.skill_swim');
    expect(ringSwimming.grantedModifiers[0].value).toBe(5);
  });

  it('passive features are silently omitted from reaction dispatch', () => {
    const instances = [makeInstance('item_ring_swimming', true)];
    const featureMap = new Map<string, Feature>([
      ['item_ring_swimming', ringSwimming],
    ]);

    // Passive features should never appear in reaction dispatch results
    const fallResult = getReactionFeaturesByTrigger(instances, featureMap, 'on_fall');
    const spellResult = getReactionFeaturesByTrigger(instances, featureMap, 'on_spell_targeted');

    expect(fallResult).toHaveLength(0);
    expect(spellResult).toHaveLength(0);
  });

  it('passive by omission (no activation field) is identical to passive by declaration', () => {
    // Ring of Protection +2 (no activation) and Ring of Swimming (activation: passive)
    // behave identically: both provide always-on modifiers through the DAG.
    expect(ringProtection2.activation).toBeUndefined();
    expect(ringSwimming.activation?.actionType).toBe('passive');

    // Both should have no triggerEvent and not appear in reaction dispatch
    expect(ringProtection2.activation?.triggerEvent).toBeUndefined();
    expect(ringSwimming.activation?.triggerEvent).toBeUndefined();
  });
});
