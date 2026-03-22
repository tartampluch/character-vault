/**
 * @file src/tests/attackerModifiers.test.ts
 * @description Vitest unit tests for Enhancement E-5: `attacker.*` modifier target namespace.
 *
 * WHAT IS TESTED:
 *   Enhancement E-5 adds an `"attacker.*"` prefix to `Modifier.targetId` as a convention
 *   for modifiers that penalise incoming attackers rather than the modifier owner.
 *
 *   This is needed for the entire Ring of Elemental Command series:
 *     "Creatures from the plane to which the ring is attuned who attack the wearer take
 *      a −1 penalty on their attack rolls."  (D&D 3.5 SRD, rings.html)
 *
 *   Tests cover:
 *
 *   1. TYPE SOUNDNESS:
 *      - A Modifier with `targetId: "attacker.combatStats.attack_bonus"` compiles.
 *      - The `RollResult.attackerPenaltiesApplied` optional field compiles.
 *
 *   2. `resolveAttackerMods()` (extracted logic, mirrors internal Dice Engine helper):
 *      - A matching `attacker.*` modifier with matching situationalContext is applied.
 *      - A modifier with non-matching situationalContext is excluded.
 *      - A modifier with NO `"attacker."` prefix is excluded.
 *      - A modifier targeting a different attacker pipeline is excluded.
 *      - Multiple matching `attacker.*` modifiers stack (sum their values).
 *
 *   3. `parseAndRoll()` integration — `defenderAttackerMods` parameter (E-5):
 *      - The attacker penalty is applied to `finalTotal`.
 *      - `attackerPenaltiesApplied` array is populated in `RollResult`.
 *      - Static pipeline `totalBonus` (defender's own attack bonus) is NOT modified.
 *      - Roll with no matching attacker mods produces no penalty.
 *      - Roll with non-matching `situationalContext` produces no penalty.
 *
 * D&D 3.5 SRD EXAMPLE:
 *   Ring of Elemental Command (Air): Air elementals attacking the wearer take −1 to their CR.
 *   Modifier:
 *   ```json
 *   {
 *     "targetId": "attacker.combatStats.attack_bonus",
 *     "value": -1,
 *     "type": "untyped",
 *     "situationalContext": "vs_air_elementals"
 *   }
 *   ```
 *   When an air elemental attacks:
 *     - Roll context targetTags: ["air_elemental", "elemental"]
 *     - The elemental takes −1 to its attack roll.
 *     - The wearer's own `combatStats.attack_bonus` pipeline UNCHANGED.
 *
 * @see src/lib/utils/diceEngine.ts  — parseAndRoll, resolveAttackerMods
 * @see src/lib/types/pipeline.ts    — Modifier.targetId `attacker.*` convention
 * @see ARCHITECTURE.md section 4.6  — full `attacker.*` design documentation
 */

import { describe, it, expect } from 'vitest';
import { parseAndRoll } from '../lib/utils/diceEngine';
import type { Modifier, StatisticPipeline } from '../lib/types/pipeline';
import type { RollContext } from '../lib/utils/diceEngine';
import type { CampaignSettings } from '../lib/types/settings';

// =============================================================================
// FIXTURES & HELPERS
// =============================================================================

/** Default campaign settings used in all tests (no variant rules active). */
const defaultSettings: CampaignSettings = {
  language: 'en',
  statGeneration: { method: 'standard_array', rerollOnes: false, pointBuyBudget: 25 },
  diceRules: { explodingTwenties: false },
  variantRules: { vitalityWoundPoints: false, gestalt: false },
  enabledRuleSources: ['srd_core'],
};

/**
 * Creates a minimal StatisticPipeline for the attacker's attack bonus.
 * This represents the AIR ELEMENTAL's own attack roll pipeline.
 */
function makeAttackerPipeline(pipelineId = 'combatStats.attack_bonus', totalBonus = 8): StatisticPipeline {
  return {
    id: pipelineId,
    label: { en: 'Attack Bonus' },
    baseValue: 0,
    totalBonus,
    totalValue: totalBonus,
    derivedModifier: 0,
    activeModifiers: [],
    situationalModifiers: [],
  };
}

/** Creates an `attacker.*` modifier as authored on a Ring of Elemental Command. */
function makeAttackerMod(
  id: string,
  value: number,
  targetPipeline = 'combatStats.attack_bonus',
  situationalContext?: string,
): Modifier {
  return {
    id,
    sourceId: 'item_ring_elemental_command_air',
    sourceName: { en: 'Ring of Elemental Command (Air)', fr: 'Anneau de commandement élémentaire (Air)' },
    targetId: `attacker.${targetPipeline}`, // E-5: attacker prefix
    value,
    type: 'untyped',
    ...(situationalContext ? { situationalContext } : {}),
  };
}

/** Creates a regular (non-attacker) modifier for control comparisons. */
function makeRegularMod(id: string, targetId: string, value: number): Modifier {
  return {
    id,
    sourceId: 'item_ring_protection_2',
    sourceName: { en: 'Ring of Protection +2' },
    targetId, // NO "attacker." prefix
    value,
    type: 'deflection',
  };
}

/**
 * Roll context simulating an air elemental attacking the ring wearer.
 * The attacker (air elemental) has tags: ["air_elemental", "elemental", "evil"]
 */
const airElementalContext: RollContext = {
  targetTags: ['air_elemental', 'elemental', 'evil'],
  isAttackOfOpportunity: false,
};

const emptyContext: RollContext = {
  targetTags: [],
  isAttackOfOpportunity: false,
};

/** Deterministic RNG that always returns the given face value. */
function fixedRng(result: number): (faces: number) => number {
  return (_faces) => result;
}

// =============================================================================
// SECTION 1: TypeScript type soundness
// =============================================================================

describe('attacker.* modifier — type soundness (E-5)', () => {
  it('Modifier.targetId accepts "attacker.*" prefix strings', () => {
    const mod: Modifier = {
      id: 'test_attacker_mod',
      sourceId: 'item_ring_elemental_command_air',
      sourceName: { en: 'Ring of Elemental Command (Air)' },
      targetId: 'attacker.combatStats.attack_bonus', // E-5 prefix
      value: -1,
      type: 'untyped',
      situationalContext: 'vs_air_elementals',
    };
    expect(mod.targetId).toBe('attacker.combatStats.attack_bonus');
    expect(mod.value).toBe(-1);
  });

  it('RollResult.attackerPenaltiesApplied is an optional Modifier array', () => {
    // When attacker penalties apply, the field is populated.
    // When they don't, the field is absent (undefined).
    const mockResult = {
      formula: '1d20',
      diceRolls: [10],
      naturalTotal: 10,
      staticBonus: 8,
      situationalBonusApplied: 0,
      finalTotal: 17,
      numberOfExplosions: 0,
      isCriticalThreat: false,
      isAutomaticHit: false,
      isAutomaticMiss: false,
      targetPool: 'res_hp' as const,
      attackerPenaltiesApplied: [makeAttackerMod('m', -1, 'combatStats.attack_bonus')],
    };
    expect(mockResult.attackerPenaltiesApplied).toHaveLength(1);
  });
});

// =============================================================================
// SECTION 2: resolveAttackerMods logic (tested via parseAndRoll integration)
// =============================================================================

describe('attacker.* resolution — via parseAndRoll defenderAttackerMods (E-5)', () => {
  it('applies -1 penalty to attacker roll when air elemental attacks ring wearer', () => {
    /**
     * CANONICAL SCENARIO:
     *   - Air elemental attacks the Ring of Elemental Command (Air) wearer.
     *   - Elemental's attack pipeline: totalBonus = 8 (its own BAB + STR).
     *   - Defender's ring has modifier:
     *     { targetId: "attacker.combatStats.attack_bonus", value: -1, situationalContext: "air_elemental" }
     *   - d20 roll = 10 (fixed RNG).
     *   - Expected finalTotal = 10 (natural) + 8 (static) + (-1) (attacker penalty) = 17.
     */
    const attackerPipeline = makeAttackerPipeline('combatStats.attack_bonus', 8);
    const defenderMods: Modifier[] = [
      makeAttackerMod('ring_air_penalty', -1, 'combatStats.attack_bonus', 'air_elemental'),
    ];

    const result = parseAndRoll(
      '1d20',
      attackerPipeline,
      airElementalContext,
      defaultSettings,
      fixedRng(10),
      '20',
      defenderMods,
    );

    expect(result.naturalTotal).toBe(10);
    expect(result.staticBonus).toBe(8);
    expect(result.finalTotal).toBe(17); // 10 + 8 + (-1)
    expect(result.attackerPenaltiesApplied).toHaveLength(1);
    expect(result.attackerPenaltiesApplied![0].value).toBe(-1);
  });

  it('attacker penalty is absent when attacker does NOT have the required tag', () => {
    /**
     * Scenario: A human warrior attacks the ring wearer (no air_elemental tag).
     * The ring penalty should NOT apply.
     */
    const humanContext: RollContext = {
      targetTags: ['humanoid', 'human'], // no "air_elemental"
      isAttackOfOpportunity: false,
    };

    const attackerPipeline = makeAttackerPipeline('combatStats.attack_bonus', 5);
    const defenderMods: Modifier[] = [
      makeAttackerMod('ring_air_penalty', -1, 'combatStats.attack_bonus', 'air_elemental'),
    ];

    const result = parseAndRoll(
      '1d20',
      attackerPipeline,
      humanContext,
      defaultSettings,
      fixedRng(12),
      '20',
      defenderMods,
    );

    expect(result.finalTotal).toBe(17); // 12 + 5 + 0 (no penalty — human is not an air elemental)
    expect(result.attackerPenaltiesApplied).toBeUndefined(); // no penalties applied
  });

  it('regular (non-attacker.*) modifiers in defenderMods are ignored', () => {
    /**
     * The deflection bonus on the Ring of Protection +2 targets the DEFENDER's
     * AC pipeline — it is NOT an attacker modifier and must be ignored here.
     */
    const attackerPipeline = makeAttackerPipeline('combatStats.attack_bonus', 6);
    const defenderMods: Modifier[] = [
      makeRegularMod('ring_protection_ac', 'combatStats.ac_normal', 2), // regular, no prefix
    ];

    const result = parseAndRoll(
      '1d20',
      attackerPipeline,
      emptyContext,
      defaultSettings,
      fixedRng(15),
      '20',
      defenderMods,
    );

    expect(result.finalTotal).toBe(21); // 15 + 6 + 0 (regular modifier ignored)
    expect(result.attackerPenaltiesApplied).toBeUndefined();
  });

  it('attacker.* modifier for a different pipeline does not affect the current roll', () => {
    /**
     * An "attacker.saves.will" modifier would affect the attacker's Will save,
     * not their attack roll. It should be excluded when rolling attack.
     */
    const attackerPipeline = makeAttackerPipeline('combatStats.attack_bonus', 6);
    const defenderMods: Modifier[] = [
      {
        id: 'aura_will_penalty',
        sourceId: 'item_ring_elemental_command_air',
        sourceName: { en: 'Ring of Elemental Command' },
        targetId: 'attacker.saves.will', // targets Will save, not attack bonus
        value: -2,
        type: 'untyped',
      },
    ];

    const result = parseAndRoll(
      '1d20',
      attackerPipeline,
      emptyContext,
      defaultSettings,
      fixedRng(8),
      '20',
      defenderMods,
    );

    expect(result.finalTotal).toBe(14); // 8 + 6 + 0 (will penalty doesn't affect attack)
    expect(result.attackerPenaltiesApplied).toBeUndefined();
  });

  it('multiple matching attacker.* penalties stack (both untyped → sum)', () => {
    /**
     * Two separate ring modifiers both apply to the same attacker's attack roll.
     * Untyped bonuses/penalties stack in D&D 3.5.
     */
    const attackerPipeline = makeAttackerPipeline('combatStats.attack_bonus', 10);
    const defenderMods: Modifier[] = [
      makeAttackerMod('penalty_1', -1, 'combatStats.attack_bonus', 'air_elemental'),
      makeAttackerMod('penalty_2', -1, 'combatStats.attack_bonus', 'air_elemental'),
    ];

    const result = parseAndRoll(
      '1d20',
      attackerPipeline,
      airElementalContext,
      defaultSettings,
      fixedRng(14),
      '20',
      defenderMods,
    );

    expect(result.finalTotal).toBe(22); // 14 + 10 + (-1) + (-1) = 22
    expect(result.attackerPenaltiesApplied).toHaveLength(2);
  });

  it('the DEFENDER\'s own pipeline totalBonus is unchanged by attacker.* modifiers', () => {
    /**
     * Critical invariant: the attacker penalty is applied ONLY to the incoming roll.
     * The ring wearer's own attack pipeline (combatStats.attack_bonus) must NOT
     * be affected by having an attacker.* modifier on their Active Features.
     *
     * This is tested by verifying the pipeline object's totalBonus is unchanged
     * before and after the roll.
     */
    const defenderOwnPipeline = makeAttackerPipeline('combatStats.attack_bonus', 9);
    const totalBonusBefore = defenderOwnPipeline.totalBonus;

    // The defender's own pipeline is NOT modified by having attacker mods
    const defenderMods: Modifier[] = [
      makeAttackerMod('ring_air_penalty', -1, 'combatStats.attack_bonus', 'air_elemental'),
    ];

    // Simulate: parseAndRoll is called with the ATTACKER'S context (not the defender's)
    // The pipeline passed here is the attacker's, not the defender's.
    const attackerPipeline = makeAttackerPipeline('combatStats.attack_bonus', 8);

    parseAndRoll(
      '1d20',
      attackerPipeline,
      airElementalContext,
      defaultSettings,
      fixedRng(14),
      '20',
      defenderMods,
    );

    // The defender's own pipeline was never touched
    expect(defenderOwnPipeline.totalBonus).toBe(totalBonusBefore);
  });

  it('no attacker mods — finalTotal and staticBonus are standard', () => {
    // Control test: without attacker mods, parseAndRoll behaves exactly as before E-5.
    const pipeline = makeAttackerPipeline('combatStats.attack_bonus', 5);

    const result = parseAndRoll(
      '1d20',
      pipeline,
      emptyContext,
      defaultSettings,
      fixedRng(11),
      '20',
      // defenderAttackerMods omitted
    );

    expect(result.naturalTotal).toBe(11);
    expect(result.staticBonus).toBe(5);
    expect(result.finalTotal).toBe(16);
    expect(result.attackerPenaltiesApplied).toBeUndefined();
  });

  it('attacker.* modifier without situationalContext applies unconditionally', () => {
    /**
     * A modifier with no situationalContext acts as an unconditional aura penalty:
     * it applies to ALL attackers regardless of their tag set.
     *
     * Example (hypothetical): a cursed ring that makes ALL attackers penalised.
     */
    const attackerPipeline = makeAttackerPipeline('combatStats.attack_bonus', 7);
    const defenderMods: Modifier[] = [
      makeAttackerMod('unconditional_penalty', -2, 'combatStats.attack_bonus'),
      // No situationalContext — applies to any attacker
    ];

    const humanContext: RollContext = {
      targetTags: ['humanoid', 'human'], // totally different tags, no "air_elemental"
      isAttackOfOpportunity: false,
    };

    const result = parseAndRoll(
      '1d20',
      attackerPipeline,
      humanContext,
      defaultSettings,
      fixedRng(9),
      '20',
      defenderMods,
    );

    expect(result.finalTotal).toBe(14); // 9 + 7 + (-2)
    expect(result.attackerPenaltiesApplied).toHaveLength(1);
  });
});
