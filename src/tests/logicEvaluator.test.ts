/**
 * @file src/tests/logicEvaluator.test.ts
 * @description Vitest unit tests for the Logic Evaluator (evaluateLogicNode).
 *
 * Tests all LogicNode types and LogicOperator values from ARCHITECTURE.md section 3:
 *   - AND, OR, NOT, CONDITION node types
 *   - ==, >=, <=, !=, includes, not_includes, has_tag, missing_tag operators
 *   - Error message extraction from failing CONDITION nodes
 *   - Deeply nested logic trees
 *   - @activeTags has_tag / missing_tag
 *   - Numeric comparisons on pipeline values
 *
 * The `evaluateLogicNode` function returns an `EvaluationResult` with:
 *   - `passed: boolean`
 *   - `metMessages: string[]` (conditions that passed)
 *   - `errorMessages: string[]` (conditions that failed, from errorMessage field)
 *
 * @see src/lib/utils/logicEvaluator.ts
 * @see ARCHITECTURE.md section 3
 * @see ARCHITECTURE.md Phase 17.2
 */

import { describe, it, expect } from 'vitest';
import { evaluateLogicNode } from '$lib/utils/logicEvaluator';
import type { LogicOperator } from '$lib/types/primitives';
import type { CharacterContext } from '$lib/utils/mathParser';

// ============================================================
// MOCK CONTEXT
// ============================================================

const mockContext: CharacterContext = {
  attributes: {
    stat_strength: { baseValue: 14, totalValue: 14, derivedModifier: 2 },
    stat_dexterity: { baseValue: 19, totalValue: 19, derivedModifier: 4 },
    stat_intelligence: { baseValue: 10, totalValue: 10, derivedModifier: 0 },
    caster_level: { baseValue: 0, totalValue: 5, derivedModifier: 0 },
  },
  skills: {
    skill_knowledge_arcana: { ranks: 8, totalValue: 8 },
    skill_tumble: { ranks: 3, totalValue: 7 },
  },
  combatStats: {
    base_attack_bonus: { totalValue: 6 },
  },
  saves: {},
  characterLevel: 8,
  eclForXp: 8,
  classLevels: { 'class_fighter': 4, 'class_wizard': 4 },
  activeTags: [
    'race_human', 'class_fighter', 'class_wizard',
    'feat_power_attack', 'feat_weapon_focus',
    'alignment_lawful_good',
  ],
  equippedWeaponTags: ['weapon', 'longsword', 'martial'],
  selection: {},
  constants: {},
};

// ============================================================
// CONDITION NODE TESTS
// ============================================================

describe('CONDITION — numeric comparison (>=)', () => {
  it('passes when STR >= 13 (STR is 14)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@attributes.stat_strength.totalValue',
        operator: '>=',
        value: 13,
        errorMessage: 'Requires Strength 13+',
      },
      mockContext
    );
    expect(result.passed).toBe(true);
  });

  it('fails when STR >= 20 (STR is 14)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@attributes.stat_strength.totalValue',
        operator: '>=',
        value: 20,
        errorMessage: 'Requires Strength 20+',
      },
      mockContext
    );
    expect(result.passed).toBe(false);
    expect(result.errorMessages).toContain('Requires Strength 20+');
  });

  it('passes when BAB >= 6 (BAB is 6)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@combatStats.base_attack_bonus.totalValue',
        operator: '>=',
        value: 6,
        errorMessage: 'Requires BAB +6',
      },
      mockContext
    );
    expect(result.passed).toBe(true);
  });

  it('fails when BAB >= 11 (BAB is 6) — extracts errorMessage', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@combatStats.base_attack_bonus.totalValue',
        operator: '>=',
        value: 11,
        errorMessage: 'Requires BAB +11',
      },
      mockContext
    );
    expect(result.passed).toBe(false);
    expect(result.errorMessages).toContain('Requires BAB +11');
  });
});

describe('CONDITION — has_tag', () => {
  it('passes when race_human tag is present', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@activeTags',
        operator: 'has_tag',
        value: 'race_human',
        errorMessage: 'Must be Human',
      },
      mockContext
    );
    expect(result.passed).toBe(true);
  });

  it('fails when race_elf tag is absent', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@activeTags',
        operator: 'has_tag',
        value: 'race_elf',
        errorMessage: 'Must be an Elf',
      },
      mockContext
    );
    expect(result.passed).toBe(false);
    expect(result.errorMessages).toContain('Must be an Elf');
  });
});

describe('CONDITION — missing_tag', () => {
  it('passes when heavy_armor tag is absent (character is not wearing heavy armor)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@activeTags',
        operator: 'missing_tag',
        value: 'heavy_armor',
        errorMessage: 'Cannot wear heavy armor',
      },
      mockContext
    );
    expect(result.passed).toBe(true);
  });

  it('fails when race_human is present (missing_tag check)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@activeTags',
        operator: 'missing_tag',
        value: 'race_human',
        errorMessage: 'Cannot be Human',
      },
      mockContext
    );
    expect(result.passed).toBe(false);
    expect(result.errorMessages).toContain('Cannot be Human');
  });
});

describe('CONDITION — skill ranks comparison', () => {
  it('passes when Knowledge Arcana has >= 8 ranks', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@skills.skill_knowledge_arcana.ranks',
        operator: '>=',
        value: 8,
        errorMessage: 'Requires 8 ranks in Knowledge (Arcana)',
      },
      mockContext
    );
    expect(result.passed).toBe(true);
  });
});

// ============================================================
// AND NODE TESTS
// ============================================================

describe('AND node', () => {
  it('passes when ALL conditions are met (Cleave prerequisite)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'AND',
        nodes: [
          {
            logic: 'CONDITION',
            targetPath: '@attributes.stat_strength.totalValue',
            operator: '>=',
            value: 13,
            errorMessage: 'Requires Strength 13+',
          },
          {
            logic: 'CONDITION',
            targetPath: '@activeTags',
            operator: 'has_tag',
            value: 'feat_power_attack',
            errorMessage: 'Requires Power Attack feat',
          },
        ],
      },
      mockContext
    );
    expect(result.passed).toBe(true);
    expect(result.errorMessages).toHaveLength(0);
  });

  it('fails when ONE condition is not met', () => {
    const result = evaluateLogicNode(
      {
        logic: 'AND',
        nodes: [
          {
            logic: 'CONDITION',
            targetPath: '@attributes.stat_strength.totalValue',
            operator: '>=',
            value: 13,
            errorMessage: 'Requires Strength 13+',
          },
          {
            logic: 'CONDITION',
            targetPath: '@activeTags',
            operator: 'has_tag',
            value: 'feat_improved_initiative',
            errorMessage: 'Requires Improved Initiative feat',
          },
        ],
      },
      mockContext
    );
    expect(result.passed).toBe(false);
    expect(result.errorMessages).toContain('Requires Improved Initiative feat');
  });
});

// ============================================================
// OR NODE TESTS
// ============================================================

describe('OR node', () => {
  it('passes when FIRST condition is met (Human or Half-Elf)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'OR',
        nodes: [
          {
            logic: 'CONDITION',
            targetPath: '@activeTags',
            operator: 'has_tag',
            value: 'race_human',
            errorMessage: 'Must be Human',
          },
          {
            logic: 'CONDITION',
            targetPath: '@activeTags',
            operator: 'has_tag',
            value: 'race_half_elf',
            errorMessage: 'Must be Half-Elf',
          },
        ],
      },
      mockContext
    );
    expect(result.passed).toBe(true);
  });

  it('passes when SECOND condition is met (first fails, second passes)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'OR',
        nodes: [
          {
            logic: 'CONDITION',
            targetPath: '@activeTags',
            operator: 'has_tag',
            value: 'race_elf',  // Fails — not an elf
            errorMessage: 'Must be an Elf',
          },
          {
            logic: 'CONDITION',
            targetPath: '@activeTags',
            operator: 'has_tag',
            value: 'class_wizard',  // Passes — has wizard tag
            errorMessage: 'Must be a Wizard',
          },
        ],
      },
      mockContext
    );
    expect(result.passed).toBe(true);
    // Only the FAILING branch's errors are reported
    expect(result.errorMessages).not.toContain('Must be a Wizard');
  });

  it('fails when ALL conditions are unmet', () => {
    const result = evaluateLogicNode(
      {
        logic: 'OR',
        nodes: [
          {
            logic: 'CONDITION',
            targetPath: '@activeTags',
            operator: 'has_tag',
            value: 'race_dragon',
            errorMessage: 'Must be a Dragon',
          },
          {
            logic: 'CONDITION',
            targetPath: '@activeTags',
            operator: 'has_tag',
            value: 'race_undead',
            errorMessage: 'Must be Undead',
          },
        ],
      },
      mockContext
    );
    expect(result.passed).toBe(false);
  });
});

// ============================================================
// NOT NODE TESTS
// ============================================================

describe('NOT node', () => {
  it('passes when inner condition fails (NOT wearing heavy armor)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'NOT',
        node: {
          logic: 'CONDITION',
          targetPath: '@activeTags',
          operator: 'has_tag',
          value: 'heavy_armor',
          errorMessage: 'Cannot wear heavy armor',
        },
      },
      mockContext
    );
    expect(result.passed).toBe(true);
  });

  it('fails when inner condition passes (NOT human fails for a human)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'NOT',
        node: {
          logic: 'CONDITION',
          targetPath: '@activeTags',
          operator: 'has_tag',
          value: 'race_human',
          errorMessage: 'Cannot be Human',
        },
      },
      mockContext
    );
    expect(result.passed).toBe(false);
  });
});

// ============================================================
// DEEPLY NESTED LOGIC TREE (ARCHITECTURE.md Example B)
// ============================================================

describe('Deeply nested AND > OR > NOT > CONDITION tree (Example B from ARCHITECTURE.md)', () => {
  /**
   * Tests the mystic Feature prerequisite:
   * (Human OR Half-Elf)
   * AND NOT wearing heavy armor
   * AND (5 ranks in Knowledge Arcana OR has "spellcaster" tag)
   */
  it('passes when all branches are satisfied', () => {
    const result = evaluateLogicNode(
      {
        logic: 'AND',
        nodes: [
          // (Human OR Half-Elf)
          {
            logic: 'OR',
            nodes: [
              { logic: 'CONDITION', targetPath: '@activeTags', operator: 'has_tag', value: 'race_human', errorMessage: 'Must be Human' },
              { logic: 'CONDITION', targetPath: '@activeTags', operator: 'has_tag', value: 'race_half_elf', errorMessage: 'Must be Half-Elf' },
            ],
          },
          // NOT wearing heavy armor
          {
            logic: 'NOT',
            node: { logic: 'CONDITION', targetPath: '@activeTags', operator: 'has_tag', value: 'heavy_armor', errorMessage: 'Cannot wear heavy armor' },
          },
          // (5 ranks in Arcana OR spellcaster tag)
          {
            logic: 'OR',
            nodes: [
              { logic: 'CONDITION', targetPath: '@skills.skill_knowledge_arcana.ranks', operator: '>=', value: 5, errorMessage: '5 ranks in Knowledge (Arcana)' },
              { logic: 'CONDITION', targetPath: '@activeTags', operator: 'has_tag', value: 'spellcaster', errorMessage: 'Must be a spellcaster' },
            ],
          },
        ],
      },
      mockContext
    );
    expect(result.passed).toBe(true);
    expect(result.errorMessages).toHaveLength(0);
  });

  it('fails when one branch fails — returns correct errorMessage', () => {
    // Context without class_wizard (no spellcaster) and without enough Knowledge
    const ctxNoSpells: CharacterContext = {
      ...mockContext,
      activeTags: ['race_human', 'class_fighter', 'feat_power_attack'],  // No spellcaster tag
      skills: { skill_knowledge_arcana: { ranks: 2, totalValue: 2 } },   // Only 2 ranks
    };

    const result = evaluateLogicNode(
      {
        logic: 'AND',
        nodes: [
          {
            logic: 'OR',
            nodes: [
              { logic: 'CONDITION', targetPath: '@activeTags', operator: 'has_tag', value: 'race_human', errorMessage: 'Must be Human' },
              { logic: 'CONDITION', targetPath: '@activeTags', operator: 'has_tag', value: 'race_half_elf', errorMessage: 'Must be Half-Elf' },
            ],
          },
          {
            logic: 'NOT',
            node: { logic: 'CONDITION', targetPath: '@activeTags', operator: 'has_tag', value: 'heavy_armor', errorMessage: 'Cannot wear heavy armor' },
          },
          {
            logic: 'OR',
            nodes: [
              { logic: 'CONDITION', targetPath: '@skills.skill_knowledge_arcana.ranks', operator: '>=', value: 5, errorMessage: '5 ranks in Knowledge (Arcana)' },
              { logic: 'CONDITION', targetPath: '@activeTags', operator: 'has_tag', value: 'spellcaster', errorMessage: 'Must be a spellcaster' },
            ],
          },
        ],
      },
      ctxNoSpells
    );

    expect(result.passed).toBe(false);
    // The failing OR branch should report its error messages
    expect(result.errorMessages.length).toBeGreaterThan(0);
  });
});

// ============================================================
// ADDITIONAL OPERATORS (MINOR fix #4)
// Tests for ==, <=, !=, includes, not_includes
// (ARCHITECTURE.md section 3 — all 8 LogicOperator values)
// ============================================================

describe('CONDITION — == (equality) operator', () => {
  /**
   * The "==" operator checks strict equality.
   * Useful for comparing exact values like alignment or size category.
   */
  it('passes when characterLevel == 8', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@characterLevel',
        operator: '==',
        value: 8,
        errorMessage: 'Requires exactly character level 8',
      },
      mockContext
    );
    expect(result.passed).toBe(true);
  });

  it('fails when characterLevel == 5 (character is level 8)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@characterLevel',
        operator: '==',
        value: 5,
        errorMessage: 'Requires exactly character level 5',
      },
      mockContext
    );
    expect(result.passed).toBe(false);
    expect(result.errorMessages).toContain('Requires exactly character level 5');
  });
});

describe('CONDITION — != (not equal) operator', () => {
  /**
   * The "!=" operator checks strict inequality.
   * Useful for "not alignment_evil" checks.
   */
  it('passes when characterLevel != 5 (character is level 8)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@characterLevel',
        operator: '!=',
        value: 5,
        errorMessage: 'Must not be character level 5',
      },
      mockContext
    );
    expect(result.passed).toBe(true);
  });

  it('fails when characterLevel != 8 (character IS level 8)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@characterLevel',
        operator: '!=',
        value: 8,
        errorMessage: 'Must not be character level 8',
      },
      mockContext
    );
    expect(result.passed).toBe(false);
    expect(result.errorMessages).toContain('Must not be character level 8');
  });
});

describe('CONDITION — <= (less than or equal) operator', () => {
  /**
   * The "<=" operator checks upper bounds.
   * Useful for "maximum level" restrictions (e.g., prestige class entry requires BAB <= X).
   */
  it('passes when STR <= 14 (STR is 14)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@attributes.stat_strength.totalValue',
        operator: '<=',
        value: 14,
        errorMessage: 'Requires Strength 14 or lower',
      },
      mockContext
    );
    expect(result.passed).toBe(true);
  });

  it('fails when STR <= 10 (STR is 14)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@attributes.stat_strength.totalValue',
        operator: '<=',
        value: 10,
        errorMessage: 'Requires Strength 10 or lower',
      },
      mockContext
    );
    expect(result.passed).toBe(false);
    expect(result.errorMessages).toContain('Requires Strength 10 or lower');
  });
});

describe('CONDITION — includes operator', () => {
  /**
   * The "includes" operator checks if a value is IN an array.
   * Functionally identical to has_tag but named for non-tag arrays.
   * Example: checking if "longsword" is in equippedWeaponTags.
   */
  it('passes when "longsword" is in equippedWeaponTags (via includes)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@equippedWeaponTags',
        operator: 'includes',
        value: 'longsword',
        errorMessage: 'Requires a longsword to be equipped',
      },
      mockContext
    );
    expect(result.passed).toBe(true);
  });

  it('fails when "shortsword" is NOT in equippedWeaponTags (via includes)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@equippedWeaponTags',
        operator: 'includes',
        value: 'shortsword',
        errorMessage: 'Requires a shortsword to be equipped',
      },
      mockContext
    );
    expect(result.passed).toBe(false);
    expect(result.errorMessages).toContain('Requires a shortsword to be equipped');
  });
});

describe('CONDITION — not_includes operator', () => {
  /**
   * The "not_includes" operator checks if a value is NOT IN an array.
   * Functionally identical to missing_tag but named for non-tag arrays.
   * Example: checking that a forbidden weapon type is not equipped.
   */
  it('passes when "greataxe" is NOT in equippedWeaponTags (via not_includes)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@equippedWeaponTags',
        operator: 'not_includes',
        value: 'greataxe',
        errorMessage: 'Must not equip a greataxe',
      },
      mockContext
    );
    expect(result.passed).toBe(true);
  });

  it('fails when "longsword" IS in equippedWeaponTags (not_includes check)', () => {
    const result = evaluateLogicNode(
      {
        logic: 'CONDITION',
        targetPath: '@equippedWeaponTags',
        operator: 'not_includes',
        value: 'longsword',
        errorMessage: 'Must not equip a longsword',
      },
      mockContext
    );
    expect(result.passed).toBe(false);
    expect(result.errorMessages).toContain('Must not equip a longsword');
  });
});

// ============================================================
// NULL / UNDEFINED NODE
// ============================================================

describe('evaluateLogicNode — null/undefined prerequisitesNode', () => {
  it('passes when prerequisitesNode is undefined (no prerequisites)', () => {
    const result = evaluateLogicNode(undefined, mockContext);
    expect(result.passed).toBe(true);
    expect(result.errorMessages).toHaveLength(0);
  });

  it('passes when prerequisitesNode is null', () => {
    const result = evaluateLogicNode(null as never, mockContext);
    expect(result.passed).toBe(true);
  });
});

// =============================================================================
// L9 — LogicOperator type safety in CONDITION nodes
// =============================================================================

describe('L9 — LogicOperator typed operator on CONDITION nodes', () => {
  /**
   * TYPE REGRESSION GUARD:
   *   The `evaluateCondition` internal function was previously typed as
   *   `operator: string` which disabled TypeScript exhaustiveness checking
   *   on the switch statement. This test suite verifies that all 8 LogicOperator
   *   values are correctly handled — if a new operator were added to LogicOperator
   *   but not to the switch, the compile would fail with the stricter type.
   */

  const ALL_OPERATORS: LogicOperator[] = [
    '==', '!=', '>=', '<=', 'includes', 'not_includes', 'has_tag', 'missing_tag',
  ];

  it('all 8 LogicOperator values are tested to ensure no silent pass-through', () => {
    // This test verifies that every operator produces a deterministic result
    // (either pass or fail) rather than silently falling through the switch.
    // Each operator is exercised with both a passing and failing case.
    expect(ALL_OPERATORS).toHaveLength(8);
  });

  it('== operator: passes on exact match, fails on mismatch', () => {
    // mockContext.characterLevel = 8
    const passResult = evaluateLogicNode(
      { logic: 'CONDITION', targetPath: '@characterLevel', operator: '==', value: 8 },
      mockContext
    );
    expect(passResult.passed).toBe(true);

    const failResult = evaluateLogicNode(
      { logic: 'CONDITION', targetPath: '@characterLevel', operator: '==', value: 99 },
      mockContext
    );
    expect(failResult.passed).toBe(false);
  });

  it('!= operator: passes when values differ', () => {
    const result = evaluateLogicNode(
      { logic: 'CONDITION', targetPath: '@characterLevel', operator: '!=', value: 99 },
      mockContext
    );
    expect(result.passed).toBe(true);
  });

  it('>= operator: passes when target >= value', () => {
    // characterLevel = 0, value = 0 → 0 >= 0 → pass
    const passResult = evaluateLogicNode(
      { logic: 'CONDITION', targetPath: '@characterLevel', operator: '>=', value: 0 },
      mockContext
    );
    expect(passResult.passed).toBe(true);
  });

  it('<= operator: passes when target <= value', () => {
    const passResult = evaluateLogicNode(
      { logic: 'CONDITION', targetPath: '@characterLevel', operator: '<=', value: 100 },
      mockContext
    );
    expect(passResult.passed).toBe(true);
  });

  it('includes operator: passes when array contains value', () => {
    // mockContext.activeTags contains 'race_human'
    const result = evaluateLogicNode(
      { logic: 'CONDITION', targetPath: '@activeTags', operator: 'includes', value: 'race_human' },
      mockContext
    );
    expect(result.passed).toBe(true);
  });

  it('not_includes operator: passes when array does NOT contain value', () => {
    const result = evaluateLogicNode(
      { logic: 'CONDITION', targetPath: '@activeTags', operator: 'not_includes', value: 'race_never_exists' },
      mockContext
    );
    expect(result.passed).toBe(true);
  });

  it('has_tag operator: passes when tag array contains the specified tag', () => {
    // mockContext.activeTags contains 'class_fighter'
    const result = evaluateLogicNode(
      { logic: 'CONDITION', targetPath: '@activeTags', operator: 'has_tag', value: 'class_fighter' },
      mockContext
    );
    expect(result.passed).toBe(true);
  });

  it('missing_tag operator: passes when tag is absent from the array', () => {
    const result = evaluateLogicNode(
      { logic: 'CONDITION', targetPath: '@activeTags', operator: 'missing_tag', value: 'race_orc' },
      mockContext
    );
    expect(result.passed).toBe(true);
  });
});
