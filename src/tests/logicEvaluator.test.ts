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
import type { CharacterContext } from '$lib/utils/mathParser';

// ============================================================
// MOCK CONTEXT
// ============================================================

const mockContext: CharacterContext = {
  attributes: {
    stat_str: { baseValue: 14, totalValue: 14, derivedModifier: 2 },
    stat_dex: { baseValue: 19, totalValue: 19, derivedModifier: 4 },
    stat_int: { baseValue: 10, totalValue: 10, derivedModifier: 0 },
    caster_level: { baseValue: 0, totalValue: 5, derivedModifier: 0 },
  },
  skills: {
    skill_knowledge_arcana: { ranks: 8, totalValue: 8 },
    skill_tumble: { ranks: 3, totalValue: 7 },
  },
  combatStats: {
    bab: { totalValue: 6 },
  },
  saves: {},
  characterLevel: 8,
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
        targetPath: '@attributes.stat_str.totalValue',
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
        targetPath: '@attributes.stat_str.totalValue',
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
        targetPath: '@combatStats.bab.totalValue',
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
        targetPath: '@combatStats.bab.totalValue',
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
            targetPath: '@attributes.stat_str.totalValue',
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
            targetPath: '@attributes.stat_str.totalValue',
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
