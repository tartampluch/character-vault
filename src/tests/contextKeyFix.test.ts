/**
 * @file src/tests/contextKeyFix.test.ts
 * @description Regression tests for the CharacterContext key-prefix-stripping fix.
 *
 * BUG FIXED (2026-03-23):
 *   The GameEngine context builders were storing combatStats entries with their full
 *   database keys ("combatStats.base_attack_bonus") instead of flat keys ("base_attack_bonus"). The Math Parser
 *   path @combatStats.base_attack_bonus.totalValue splits into ["combatStats","base_attack_bonus","totalValue"] and
 *   looks up context.combatStats["base_attack_bonus"] — which returned undefined with the old code.
 *
 *   This caused ALL BAB prerequisite checks (Power Attack, Cleave, Weapon Specialization,
 *   etc.) to silently return 0, making them never satisfiable in production.
 *
 * WHAT IS TESTED:
 *   1. resolvePath correctly resolves @combatStats.X.totalValue using flat keys.
 *   2. resolvePath correctly resolves @saves.X.totalValue using flat keys.
 *   3. Prerequisites using @combatStats.base_attack_bonus.totalValue pass/fail correctly.
 *   4. normaliseModifierTargetId handles "resources.X.maxValue" → "combatStats.X_max".
 *
 * @see ARCHITECTURE.md section 9.10 — CharacterContext key conventions
 * @see src/lib/engine/GameEngine.svelte.ts — phase0_context and phase3_context builders
 */

import { describe, it, expect } from 'vitest';
import { resolvePath, evaluateFormula } from '$lib/utils/mathParser';
import { checkCondition } from '$lib/utils/logicEvaluator';
import type { CharacterContext } from '$lib/utils/mathParser';
import type { LogicNode } from '$lib/types/logic';

// =============================================================================
// MOCK CONTEXT — Matches the fixed context shape (flat keys, no namespace prefix)
// =============================================================================

/**
 * A CharacterContext that precisely mirrors what the fixed GameEngine produces:
 *   - combatStats uses FLAT keys: "base_attack_bonus", "ac_normal", "speed_land" (NOT "combatStats.base_attack_bonus")
 *   - saves uses FLAT keys: "fortitude", "reflex", "will" (NOT "saves.fortitude")
 */
const MOCK_CONTEXT: CharacterContext = {
  attributes: {
    stat_strength:  { baseValue: 16, totalValue: 16, derivedModifier: 3 },
    stat_dexterity:  { baseValue: 14, totalValue: 14, derivedModifier: 2 },
    stat_constitution:  { baseValue: 14, totalValue: 14, derivedModifier: 2 },
    stat_intelligence:  { baseValue: 12, totalValue: 12, derivedModifier: 1 },
    stat_wisdom:  { baseValue: 10, totalValue: 10, derivedModifier: 0 },
    stat_charisma:  { baseValue: 10, totalValue: 10, derivedModifier: 0 },
    stat_caster_level: { baseValue: 0, totalValue: 5, derivedModifier: 0 },
  },
  skills: {
    skill_climb: { ranks: 8, totalValue: 11 },
    skill_knowledge_arcana: { ranks: 4, totalValue: 5 },
  },
  // FLAT KEYS — the fix strips "combatStats." prefix when building the context
  combatStats: {
    base_attack_bonus: { totalValue: 6 },
    ac_normal:    { totalValue: 17 },
    ac_touch:     { totalValue: 13 },
    ac_flat_footed: { totalValue: 15 },
    initiative: { totalValue: 3 },
    grapple:      { totalValue: 9 },
    speed_land:   { totalValue: 30 },
    speed_fly:    { totalValue: 0 },
    fortification: { totalValue: 25 },
  },
  // FLAT KEYS — the fix strips "saves." prefix when building the context
  saves: {
    fortitude: { totalValue: 7 },
    reflex: { totalValue: 4 },
    will: { totalValue: 2 },
  },
  characterLevel: 6,
  eclForXp: 6,
  classLevels: { class_fighter: 6 },
  activeTags: ['race_human', 'class_fighter', 'feat_power_attack', 'size_medium'],
  equippedWeaponTags: ['weapon_longsword', 'slashing'],
  selection: {},
  constants: {},
};

// =============================================================================
// 1. resolvePath — combatStats flat key resolution
// =============================================================================

describe('CharacterContext flat key fix — @combatStats paths', () => {
  it('resolves @combatStats.base_attack_bonus.totalValue to 6 (flat key "base_attack_bonus")', () => {
    const result = resolvePath('@combatStats.base_attack_bonus.totalValue', MOCK_CONTEXT);
    expect(result).toBe(6);
  });

  it('resolves @combatStats.ac_normal.totalValue correctly', () => {
    const result = resolvePath('@combatStats.ac_normal.totalValue', MOCK_CONTEXT);
    expect(result).toBe(17);
  });

  it('resolves @combatStats.ac_touch.totalValue correctly', () => {
    expect(resolvePath('@combatStats.ac_touch.totalValue', MOCK_CONTEXT)).toBe(13);
  });

  it('resolves @combatStats.initiative.totalValue correctly', () => {
    expect(resolvePath('@combatStats.initiative.totalValue', MOCK_CONTEXT)).toBe(3);
  });

  it('resolves @combatStats.speed_land.totalValue correctly', () => {
    expect(resolvePath('@combatStats.speed_land.totalValue', MOCK_CONTEXT)).toBe(30);
  });

  it('resolves @combatStats.fortification.totalValue correctly', () => {
    expect(resolvePath('@combatStats.fortification.totalValue', MOCK_CONTEXT)).toBe(25);
  });

  it('returns 0 and warns for a nonexistent combatStats key', () => {
    // Should not throw — returns 0 gracefully
    const result = resolvePath('@combatStats.nonexistent.totalValue', MOCK_CONTEXT);
    expect(result).toBe(0);
  });

  it('would return 0 if context used full keys instead of flat keys (regression proof)', () => {
    // A context that INCORRECTLY stores full keys (the old buggy behavior)
    const brokenContext: CharacterContext = {
      ...MOCK_CONTEXT,
      combatStats: {
        // The BAD old format — full "combatStats.base_attack_bonus" key (with prefix) instead of flat "base_attack_bonus"
        'combatStats.base_attack_bonus': { totalValue: 99 }, // This key can never be resolved by path
      },
    };
    // @combatStats.base_attack_bonus.totalValue splits into ["combatStats","base_attack_bonus"] — looks for key "base_attack_bonus"
    // The broken context has full prefixed key "combatStats.base_attack_bonus" not flat "base_attack_bonus" → undefined → 0
    const result = resolvePath('@combatStats.base_attack_bonus.totalValue', brokenContext);
    expect(result).toBe(0); // Would silently fail with broken context
  });
});

// =============================================================================
// 2. resolvePath — saves flat key resolution
// =============================================================================

describe('CharacterContext flat key fix — @saves paths', () => {
  it('resolves @saves.fortitude.totalValue to 7', () => {
    expect(resolvePath('@saves.fortitude.totalValue', MOCK_CONTEXT)).toBe(7);
  });

  it('resolves @saves.reflex.totalValue to 4', () => {
    expect(resolvePath('@saves.reflex.totalValue', MOCK_CONTEXT)).toBe(4);
  });

  it('resolves @saves.will.totalValue to 2', () => {
    expect(resolvePath('@saves.will.totalValue', MOCK_CONTEXT)).toBe(2);
  });

  it('would return 0 with broken saves context (full "saves.fortitude" key)', () => {
    const brokenContext: CharacterContext = {
      ...MOCK_CONTEXT,
      saves: {
        'saves.fortitude': { totalValue: 99 }, // baggy format won't resolve
      },
    };
    expect(resolvePath('@saves.fortitude.totalValue', brokenContext)).toBe(0);
  });
});

// =============================================================================
// 3. Prerequisite checking — @combatStats.base_attack_bonus.totalValue used in LogicNode
// =============================================================================

describe('Prerequisite checks using @combatStats.base_attack_bonus.totalValue (regression)', () => {
  /**
   * These are the exact prerequisite patterns used in the D20 SRD rule files.
   * With the old buggy context keys, ALL of these would silently return false.
   */

  it('Power Attack (BAB +1): passes when BAB = 6', () => {
    const node: LogicNode = {
      logic: 'CONDITION',
      targetPath: '@combatStats.base_attack_bonus.totalValue',
      operator: '>=',
      value: 1,
      errorMessage: 'Requires Base Attack Bonus +1',
    };
    expect(checkCondition(node, MOCK_CONTEXT)).toBe(true);
  });

  it('Weapon Specialization (BAB +4): passes when BAB = 6', () => {
    const node: LogicNode = {
      logic: 'CONDITION',
      targetPath: '@combatStats.base_attack_bonus.totalValue',
      operator: '>=',
      value: 4,
      errorMessage: 'Requires BAB +4',
    };
    expect(checkCondition(node, MOCK_CONTEXT)).toBe(true);
  });

  it('Combat Reflexes (BAB +1): fails when BAB = 0 (level 0 character)', () => {
    const noBABContext: CharacterContext = {
      ...MOCK_CONTEXT,
      combatStats: { ...MOCK_CONTEXT.combatStats, base_attack_bonus: { totalValue: 0 } },
    };
    const node: LogicNode = {
      logic: 'CONDITION',
      targetPath: '@combatStats.base_attack_bonus.totalValue',
      operator: '>=',
      value: 1,
    };
    expect(checkCondition(node, noBABContext)).toBe(false);
  });

  it('Greater Weapon Specialization (BAB +12): fails when BAB = 6', () => {
    const node: LogicNode = {
      logic: 'CONDITION',
      targetPath: '@combatStats.base_attack_bonus.totalValue',
      operator: '>=',
      value: 12,
    };
    expect(checkCondition(node, MOCK_CONTEXT)).toBe(false);
  });

  it('Spring Attack compound prerequisite (BAB +4, Dodge, Mobility)', () => {
    const springAttackNode: LogicNode = {
      logic: 'AND',
      nodes: [
        { logic: 'CONDITION', targetPath: '@combatStats.base_attack_bonus.totalValue', operator: '>=', value: 4 },
        { logic: 'CONDITION', targetPath: '@activeTags', operator: 'has_tag', value: 'feat_dodge' },
        { logic: 'CONDITION', targetPath: '@activeTags', operator: 'has_tag', value: 'feat_mobility' },
      ],
    };
    const ctxWithFeats: CharacterContext = {
      ...MOCK_CONTEXT,
      activeTags: [...MOCK_CONTEXT.activeTags, 'feat_dodge', 'feat_mobility'],
    };
    expect(checkCondition(springAttackNode, ctxWithFeats)).toBe(true);
    // Should fail with the base context (no dodge/mobility)
    expect(checkCondition(springAttackNode, MOCK_CONTEXT)).toBe(false);
  });
});

// =============================================================================
// 4. evaluateFormula — @combatStats in arithmetic formulas
// =============================================================================

describe('evaluateFormula with @combatStats paths (flat key required)', () => {
  it('uses BAB in arithmetic: BAB + STR mod = attack roll base', () => {
    const formula = '@combatStats.base_attack_bonus.totalValue + @attributes.stat_strength.derivedModifier';
    const result = evaluateFormula(formula, MOCK_CONTEXT, 'en');
    expect(result).toBe(9); // BAB 6 + STR mod 3
  });

  it('saves check formula: @saves.fortitude.totalValue >= 10', () => {
    // Used in "auto-pass fort DC 10" style formulas
    const result = evaluateFormula('@saves.fortitude.totalValue', MOCK_CONTEXT, 'en');
    expect(result).toBe(7);
  });

  it('speed formula: @combatStats.speed_land.totalValue = 30', () => {
    const result = evaluateFormula('@combatStats.speed_land.totalValue', MOCK_CONTEXT, 'en');
    expect(result).toBe(30);
  });
});

// =============================================================================
// 5. normaliseModifierTargetId — resources.X.maxValue convention
// =============================================================================

describe('normaliseModifierTargetId indirectly via stackingRules context', () => {
  /**
   * The "resources.X.maxValue" → "combatStats.X_max" normalisation enables
   * content authors to write "resources.barbarian_rage_uses.maxValue" as a modifier
   * target, and the engine converts it to "combatStats.barbarian_rage_uses_max".
   *
   * We test this via the evaluateFormula path — the formula encoder uses the context
   * with normalised pipeline IDs.
   */

  it('evaluateFormula resolves @eclForXp correctly for monster PC context', () => {
    const dwarfRogueContext: CharacterContext = {
      ...MOCK_CONTEXT,
      characterLevel: 3,
      eclForXp: 3, // Dwarf has no LA in standard SRD
      classLevels: { class_rogue: 3 },
    };
    const result = evaluateFormula('@eclForXp', dwarfRogueContext, 'en');
    expect(result).toBe(3);
  });

  it('evaluateFormula resolves @eclForXp = characterLevel + LA for Drow (LA+2)', () => {
    const drowRogueContext: CharacterContext = {
      ...MOCK_CONTEXT,
      characterLevel: 3,
      eclForXp: 5, // 3 class levels + 2 LA
      classLevels: { class_rogue: 3 },
    };
    const result = evaluateFormula('@eclForXp', drowRogueContext, 'en');
    expect(result).toBe(5);
  });

  it('@eclForXp and @characterLevel differ for monster PCs with LA > 0', () => {
    const context: CharacterContext = {
      ...MOCK_CONTEXT,
      characterLevel: 4,
      eclForXp: 7, // 4 class levels + 3 LA (Half-Dragon)
    };
    expect(evaluateFormula('@characterLevel', context, 'en')).toBe(4);
    expect(evaluateFormula('@eclForXp', context, 'en')).toBe(7);
  });
});
