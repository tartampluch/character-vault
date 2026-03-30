/**
 * @file src/tests/enginePhases.test.ts
 * @description Unit tests for the extracted DAG phase pure functions.
 *
 * COVERAGE TARGETS:
 *   - engine/phases/phase1Size.ts    — buildSizePipeline
 *   - engine/phases/phase2Attributes.ts — buildAttributePipelines, buildPhase2Context
 *   - engine/phases/phase3CombatStats.ts — buildCombatStatPipelines, buildPhase3Context
 *   - engine/phases/phaseEquipmentSlots.ts — buildEquipmentSlots, buildEquippedSlotCounts
 *   - engine/phases/phaseFeatSlots.ts — computeFeatSlots, computeGrantedFeatIds, computeManualFeatCount
 *   - engine/phases/phaseActionBudget.ts — computeEffectiveActionBudget, computeActionBudgetHasXOR, computeActionBudgetBlockers
 *   - engine/phases/phase0Modifiers.ts — computeActiveTags, computePhase0Result
 *   - engine/phases/phase4Skills.ts — computeMulticlassXpPenaltyRisk, buildClassSkillSet, buildSkillPointsBudget,
 *                                     buildLevelingJournal, buildSkillPipelines
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { StatisticPipeline, SkillPipeline, Modifier } from '$lib/types/pipeline';
import type { FlatModifierEntry } from '$lib/types/engine';
import type { ActiveFeatureInstance } from '$lib/types/character';
import type { CharacterContext } from '$lib/utils/mathParser';
import type { Feature } from '$lib/types/feature';

// ─── Imports under test ────────────────────────────────────────────────────────
import { buildSizePipeline } from '$lib/engine/phases/phase1Size';
import { buildAttributePipelines, buildPhase2Context } from '$lib/engine/phases/phase2Attributes';
import { buildCombatStatPipelines, buildPhase3Context } from '$lib/engine/phases/phase3CombatStats';
import { buildEquipmentSlots, buildEquippedSlotCounts } from '$lib/engine/phases/phaseEquipmentSlots';
import { computeFeatSlots, computeGrantedFeatIds, computeManualFeatCount } from '$lib/engine/phases/phaseFeatSlots';
import {
  computeEffectiveActionBudget,
  computeActionBudgetHasXOR,
  computeActionBudgetBlockers,
} from '$lib/engine/phases/phaseActionBudget';
import { computeActiveTags, computePhase0Result } from '$lib/engine/phases/phase0Modifiers';
import {
  computeMulticlassXpPenaltyRisk,
  buildClassSkillSet,
  buildSkillPointsBudget,
  buildLevelingJournal,
  buildSkillPipelines,
} from '$lib/engine/phases/phase4Skills';
import { dataLoader } from '$lib/engine/DataLoader';
import { createEmptyCharacter } from '$lib/engine/CharacterFactory';

// =============================================================================
// SHARED HELPERS
// =============================================================================

function makePipeline(id: string, base = 0): StatisticPipeline {
  return {
    id, label: { en: id }, baseValue: base,
    activeModifiers: [], situationalModifiers: [],
    totalBonus: 0, totalValue: base, derivedModifier: 0,
  };
}

function makeMod(
  id: string,
  value: number,
  type: string,
  targetId: string,
  extra: Partial<Modifier> = {}
): Modifier {
  return {
    id, sourceId: `src_${id}`, sourceName: { en: id },
    targetId, value, type: type as import('$lib/types/primitives').ModifierType,
    ...extra,
  };
}

function makeFlatEntry(mod: Modifier): FlatModifierEntry {
  return {
    modifier: mod,
    sourceInstanceId: `inst_${mod.id}`,
    sourceFeatureId: `feat_${mod.id}`,
  };
}

function makeInstance(featureId: string, isActive = true): ActiveFeatureInstance {
  return { instanceId: `inst_${featureId}`, featureId, isActive };
}

function makeFeature(id: string, extra: Partial<Feature> = {}): Feature {
  return {
    id, category: 'feat', ruleSource: 'srd_core',
    label: { en: id }, description: { en: '' },
    tags: [], grantedModifiers: [], grantedFeatures: [],
    ...extra,
  } as Feature;
}

const EMPTY_CONTEXT: CharacterContext = {
  attributes: {}, skills: {}, combatStats: {}, saves: {},
  characterLevel: 0, eclForXp: 0, classLevels: {},
  activeTags: [], equippedWeaponTags: [], selection: {}, constants: {},
};

// =============================================================================
// 1. phase1Size — buildSizePipeline
// =============================================================================

describe('phase1Size — buildSizePipeline', () => {
  it('returns default pipeline when sizeBaseAttribute is undefined', () => {
    const result = buildSizePipeline(undefined, []);
    expect(result.id).toBe('stat_size');
    expect(result.totalValue).toBe(0);
    expect(result.derivedModifier).toBe(0);
    expect(result.activeModifiers).toHaveLength(0);
  });

  it('returns base pipeline when no size modifiers exist', () => {
    const base = makePipeline('stat_size', 0);
    const result = buildSizePipeline(base, []);
    expect(result.totalValue).toBe(0);
    expect(result.totalBonus).toBe(0);
    expect(result.activeModifiers).toHaveLength(0);
  });

  it('applies size modifiers from flat list (Small: +1)', () => {
    const base = makePipeline('stat_size', 0);
    // Small race: +1 size modifier
    const sizeMod = makeMod('size_small', 1, 'racial', 'stat_size');
    const flat: FlatModifierEntry[] = [makeFlatEntry(sizeMod)];
    const result = buildSizePipeline(base, flat);
    expect(result.totalBonus).toBe(1);
    expect(result.totalValue).toBe(1);
    // size 1 → derivedModifier = floor((1-10)/2) = floor(-9/2) = -5 — actually computed from totalValue
    expect(result.activeModifiers).toHaveLength(1);
  });

  it('applies Large size (-1) and derives negative modifier', () => {
    const base = makePipeline('stat_size', 0);
    const sizeMod = makeMod('size_large', -1, 'racial', 'stat_size');
    const flat: FlatModifierEntry[] = [makeFlatEntry(sizeMod)];
    const result = buildSizePipeline(base, flat);
    expect(result.totalBonus).toBe(-1);
    expect(result.totalValue).toBe(-1);
  });

  it('places situational size mods into situationalModifiers', () => {
    const base = makePipeline('stat_size', 0);
    const situationalMod = makeMod('size_sit', 1, 'untyped', 'stat_size', {
      situationalContext: 'vs_giants',
    });
    const flat: FlatModifierEntry[] = [makeFlatEntry(situationalMod)];
    const result = buildSizePipeline(base, flat);
    expect(result.situationalModifiers).toHaveLength(1);
    expect(result.activeModifiers).toHaveLength(0);
  });

  it('ignores modifiers targeting other pipelines', () => {
    const base = makePipeline('stat_size', 0);
    const otherMod = makeMod('str_bonus', 2, 'enhancement', 'stat_strength');
    const flat: FlatModifierEntry[] = [makeFlatEntry(otherMod)];
    const result = buildSizePipeline(base, flat);
    expect(result.totalBonus).toBe(0);
    expect(result.activeModifiers).toHaveLength(0);
  });
});

// =============================================================================
// 2. phase2Attributes — buildAttributePipelines & buildPhase2Context
// =============================================================================

describe('phase2Attributes — buildAttributePipelines', () => {
  it('returns empty record for empty input', () => {
    const result = buildAttributePipelines({}, []);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('applies enhancement modifier to stat_strength', () => {
    const attrs = { stat_strength: makePipeline('stat_strength', 10) };
    const mod = makeMod('belt_str', 2, 'enhancement', 'stat_strength');
    const result = buildAttributePipelines(attrs, [makeFlatEntry(mod)]);

    expect(result['stat_strength'].totalBonus).toBe(2);
    expect(result['stat_strength'].totalValue).toBe(12);
    // derivedModifier for STR 12: floor((12-10)/2) = 1
    expect(result['stat_strength'].derivedModifier).toBe(1);
  });

  it('only applies modifiers targeting the correct pipeline', () => {
    const attrs = {
      stat_strength: makePipeline('stat_strength', 10),
      stat_dexterity: makePipeline('stat_dexterity', 14),
    };
    const strMod = makeMod('str_mod', 4, 'enhancement', 'stat_strength');
    const result = buildAttributePipelines(attrs, [makeFlatEntry(strMod)]);

    expect(result['stat_strength'].totalValue).toBe(14);
    expect(result['stat_dexterity'].totalValue).toBe(14); // unaffected
  });

  it('places situational mods into situationalModifiers', () => {
    const attrs = { stat_strength: makePipeline('stat_strength', 10) };
    const sitMod = makeMod('rage_str', 4, 'morale', 'stat_strength', {
      situationalContext: 'raging',
    });
    const result = buildAttributePipelines(attrs, [makeFlatEntry(sitMod)]);

    expect(result['stat_strength'].totalBonus).toBe(0); // not active
    expect(result['stat_strength'].situationalModifiers).toHaveLength(1);
  });

  it('derivedModifier is computed correctly for various base values', () => {
    const cases: [number, number][] = [
      [10, 0], [11, 0], [12, 1], [14, 2], [16, 3], [18, 4], [8, -1], [6, -2],
    ];
    for (const [base, expectedDerived] of cases) {
      const attrs = { stat_test: makePipeline('stat_test', base) };
      const result = buildAttributePipelines(attrs, []);
      expect(result['stat_test'].derivedModifier).toBe(expectedDerived);
    }
  });
});

describe('phase2Attributes — buildPhase2Context', () => {
  it('upgrades context with resolved attribute values', () => {
    const attrs = { stat_strength: makePipeline('stat_strength', 16) };
    attrs['stat_strength'].totalValue = 16;
    attrs['stat_strength'].derivedModifier = 3;

    const base0 = { ...EMPTY_CONTEXT };
    const result = buildPhase2Context(base0, attrs);

    expect(result.attributes['stat_strength']).toBeDefined();
    expect(result.attributes['stat_strength'].totalValue).toBe(16);
    expect(result.attributes['stat_strength'].derivedModifier).toBe(3);
  });

  it('preserves other context fields unchanged', () => {
    const base0: CharacterContext = { ...EMPTY_CONTEXT, characterLevel: 5 };
    const result = buildPhase2Context(base0, {});
    expect(result.characterLevel).toBe(5);
  });
});

// =============================================================================
// 3. phase3CombatStats — buildCombatStatPipelines & buildPhase3Context
// =============================================================================

describe('phase3CombatStats — buildCombatStatPipelines', () => {
  function makeAttrs(conBase = 10): Record<string, StatisticPipeline> {
    const con = makePipeline('stat_constitution', conBase);
    con.totalValue = conBase;
    con.derivedModifier = Math.floor((conBase - 10) / 2);
    return { stat_constitution: con };
  }

  it('returns empty result for empty combat stats', () => {
    const result = buildCombatStatPipelines({}, {}, {}, {}, [], {}, 0, false);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('applies enhancement bonus to combatStats.ac_normal', () => {
    const acPipeline = makePipeline('combatStats.ac_normal', 10);
    const mod = makeMod('shield', 2, 'shield', 'combatStats.ac_normal');
    const result = buildCombatStatPipelines(
      { 'combatStats.ac_normal': acPipeline },
      {}, {}, {}, [makeFlatEntry(mod)], makeAttrs(), 5, false
    );
    expect(result['combatStats.ac_normal'].totalBonus).toBe(2);
    expect(result['combatStats.ac_normal'].totalValue).toBe(12);
  });

  it('max_hp = sum of hit dice + CON modifier × character level', () => {
    const maxHp = makePipeline('combatStats.max_hp', 0);
    // Level 5, CON 14 (+2), hit dice: 1=8, 2=6, 3=7, 4=5, 5=6 = 32
    const hitDieResults: Record<number, number> = { 1: 8, 2: 6, 3: 7, 4: 5, 5: 6 };
    const attrs = makeAttrs(14); // CON 14 → +2 mod
    const result = buildCombatStatPipelines(
      { 'combatStats.max_hp': maxHp }, {}, hitDieResults, {}, [], attrs, 5, false
    );
    // 8+6+7+5+6 = 32 (dice) + 2*5 = 10 (con) = 42
    expect(result['combatStats.max_hp'].totalValue).toBe(42);
  });

  it('max_dexterity_bonus uses cap mods (min-wins)', () => {
    const maxDex = makePipeline('combatStats.max_dexterity_bonus', 99);
    const cap1 = makeMod('chain_mail_cap', 2, 'max_dex_cap', 'combatStats.max_dexterity_bonus');
    const cap2 = makeMod('tower_shield_cap', 1, 'max_dex_cap', 'combatStats.max_dexterity_bonus');
    const result = buildCombatStatPipelines(
      { 'combatStats.max_dexterity_bonus': maxDex },
      {}, {}, {}, [makeFlatEntry(cap1), makeFlatEntry(cap2)], makeAttrs(), 5, false
    );
    // min(2, 1) = 1
    expect(result['combatStats.max_dexterity_bonus'].totalValue).toBe(1);
  });

  it('max_dexterity_bonus with no caps returns baseValue (99)', () => {
    const maxDex = makePipeline('combatStats.max_dexterity_bonus', 99);
    const result = buildCombatStatPipelines(
      { 'combatStats.max_dexterity_bonus': maxDex },
      {}, {}, {}, [], makeAttrs(), 5, false
    );
    expect(result['combatStats.max_dexterity_bonus'].totalValue).toBe(99);
  });

  it('processes saving throw pipelines', () => {
    const fortPipeline = makePipeline('saves.fortitude', 0);
    const mod = makeMod('cloak', 2, 'resistance', 'saves.fortitude');
    const result = buildCombatStatPipelines(
      {}, { 'saves.fortitude': fortPipeline }, {}, {},
      [makeFlatEntry(mod)], makeAttrs(), 5, false
    );
    expect(result['saves.fortitude'].totalBonus).toBe(2);
    expect(result['saves.fortitude'].totalValue).toBe(2);
  });

  it('gestalt mode applies max-per-level BAB from two classes', () => {
    const babPipeline = makePipeline('combatStats.base_attack_bonus', 0);
    // Fighter BAB 3: base mods of [1, 1, 1] from class_fighter
    // Wizard BAB at level 3: [0, 1, 0]
    const fMods = [
      makeMod('f1', 1, 'base', 'combatStats.base_attack_bonus', { sourceId: 'class_fighter' }),
      makeMod('f2', 1, 'base', 'combatStats.base_attack_bonus', { sourceId: 'class_fighter' }),
      makeMod('f3', 1, 'base', 'combatStats.base_attack_bonus', { sourceId: 'class_fighter' }),
    ];
    const wMods = [
      makeMod('w1', 0, 'base', 'combatStats.base_attack_bonus', { sourceId: 'class_wizard' }),
      makeMod('w2', 1, 'base', 'combatStats.base_attack_bonus', { sourceId: 'class_wizard' }),
      makeMod('w3', 0, 'base', 'combatStats.base_attack_bonus', { sourceId: 'class_wizard' }),
    ];
    const flat = [...fMods, ...wMods].map(makeFlatEntry);
    const result = buildCombatStatPipelines(
      { 'combatStats.base_attack_bonus': babPipeline },
      {}, {}, { class_fighter: 3, class_wizard: 3 },
      flat, makeAttrs(), 3, true // isGestalt=true
    );
    // Gestalt: per-level max = max(1,0)+max(1,1)+max(1,0) = 1+1+1 = 3
    expect(result['combatStats.base_attack_bonus'].totalValue).toBe(3);
  });
});

describe('phase3CombatStats — buildPhase3Context', () => {
  it('upgrades context with combat stat values (strips combatStats. prefix)', () => {
    const combatStats = { 'combatStats.base_attack_bonus': { ...makePipeline('combatStats.base_attack_bonus', 0), totalValue: 5 } };
    const result = buildPhase3Context(EMPTY_CONTEXT, combatStats);
    expect(result.combatStats['base_attack_bonus']).toBeDefined();
    expect(result.combatStats['base_attack_bonus'].totalValue).toBe(5);
  });

  it('upgrades context with save values (strips saves. prefix)', () => {
    const combatStats = { 'saves.fortitude': { ...makePipeline('saves.fortitude', 0), totalValue: 4 } };
    const result = buildPhase3Context(EMPTY_CONTEXT, combatStats);
    expect(result.saves['fortitude']).toBeDefined();
    expect(result.saves['fortitude'].totalValue).toBe(4);
  });

  it('preserves other context fields', () => {
    const base: CharacterContext = { ...EMPTY_CONTEXT, characterLevel: 7 };
    const result = buildPhase3Context(base, {});
    expect(result.characterLevel).toBe(7);
  });

  it('handles custom non-prefixed pipeline IDs', () => {
    const combatStats = { 'custom_stat': { ...makePipeline('custom_stat', 0), totalValue: 10 } };
    const result = buildPhase3Context(EMPTY_CONTEXT, combatStats);
    expect(result.combatStats['custom_stat']).toBeDefined();
    expect(result.combatStats['custom_stat'].totalValue).toBe(10);
  });
});

// =============================================================================
// 4. phaseEquipmentSlots — buildEquipmentSlots & buildEquippedSlotCounts
// =============================================================================

describe('phaseEquipmentSlots — buildEquipmentSlots', () => {
  it('extracts slot counts from combat stats pipelines', () => {
    const combatStats: Record<string, StatisticPipeline> = {
      'slots.head': { ...makePipeline('slots.head', 1), totalValue: 1 },
      'slots.ring': { ...makePipeline('slots.ring', 2), totalValue: 2 },
    };
    const result = buildEquipmentSlots(combatStats);
    expect(result['slots.head']).toBe(1);
    expect(result['slots.ring']).toBe(2);
  });

  it('returns 0 for missing slot pipelines', () => {
    const result = buildEquipmentSlots({});
    expect(result['slots.head']).toBe(0);
    expect(result['slots.ring']).toBe(0);
  });

  it('returns all 13 expected slot keys', () => {
    const result = buildEquipmentSlots({});
    const expected = [
      'slots.head', 'slots.eyes', 'slots.neck', 'slots.torso', 'slots.body',
      'slots.waist', 'slots.shoulders', 'slots.arms', 'slots.hands',
      'slots.ring', 'slots.feet', 'slots.main_hand', 'slots.off_hand',
    ];
    for (const key of expected) {
      expect(key in result).toBe(true);
    }
  });
});

describe('phaseEquipmentSlots — buildEquippedSlotCounts', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns empty counts when no features are active', () => {
    const result = buildEquippedSlotCounts([]);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('counts equipped items by slot', () => {
    const instance = makeInstance('item_ring_protection');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('item_ring_protection'),
      category: 'item',
      // @ts-ignore — ItemFeature extension
      equipmentSlot: 'ring',
    } as Feature);

    const result = buildEquippedSlotCounts([instance]);
    expect(result['slots.ring']).toBe(1);
  });

  it('skips inactive instances', () => {
    const instance: ActiveFeatureInstance = { ...makeInstance('item_ring'), isActive: false };
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue(makeFeature('item_ring'));
    const result = buildEquippedSlotCounts([instance]);
    expect(result['slots.ring']).toBeUndefined();
  });

  it('skips items with no equipmentSlot field', () => {
    const instance = makeInstance('feat_power_attack');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue(makeFeature('feat_power_attack'));
    const result = buildEquippedSlotCounts([instance]);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('skips items with equipmentSlot = "none"', () => {
    const instance = makeInstance('item_no_slot');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('item_no_slot'),
      // @ts-ignore
      equipmentSlot: 'none',
    } as Feature);
    const result = buildEquippedSlotCounts([instance]);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('accumulates multiple items in the same slot', () => {
    const inst1 = makeInstance('ring1');
    const inst2 = makeInstance('ring2');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('ring1'),
      // @ts-ignore
      equipmentSlot: 'ring',
    } as Feature);
    const result = buildEquippedSlotCounts([inst1, inst2]);
    expect(result['slots.ring']).toBe(2);
  });
});

// =============================================================================
// 5. phaseFeatSlots — computeFeatSlots, computeGrantedFeatIds, computeManualFeatCount
// =============================================================================

describe('phaseFeatSlots — computeFeatSlots', () => {
  it('level 1 character gets 1 base slot + 0 bonus = 1', () => {
    expect(computeFeatSlots(1, [])).toBe(1);
  });

  it('level 3 character gets 2 slots (1 + floor(3/3))', () => {
    expect(computeFeatSlots(3, [])).toBe(2);
  });

  it('level 6 character gets 3 slots', () => {
    expect(computeFeatSlots(6, [])).toBe(3);
  });

  it('bonus_feat_slots modifier adds to total', () => {
    const bonusMod = makeMod('bonus', 1, 'untyped', 'attributes.bonus_feat_slots');
    expect(computeFeatSlots(3, [makeFlatEntry(bonusMod)])).toBe(3); // 2 + 1 bonus
  });

  it('situational bonus_feat_slots is ignored', () => {
    const sitMod = makeMod('bonus_sit', 1, 'untyped', 'attributes.bonus_feat_slots', {
      situationalContext: 'some_context',
    });
    expect(computeFeatSlots(3, [makeFlatEntry(sitMod)])).toBe(2); // situational, not counted
  });

  it('non-numeric bonus value is treated as 0', () => {
    const badMod: Modifier = {
      ...makeMod('bad', 0, 'untyped', 'attributes.bonus_feat_slots'),
      value: 'not_a_number' as unknown as number,
    };
    expect(computeFeatSlots(1, [makeFlatEntry(badMod)])).toBe(1);
  });
});

describe('phaseFeatSlots — computeGrantedFeatIds', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns empty set when no features are active', () => {
    const result = computeGrantedFeatIds([], {});
    expect(result.size).toBe(0);
  });

  it('collects granted features from active features', () => {
    const instance = makeInstance('class_fighter');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('class_fighter'),
      grantedFeatures: ['feat_bonus_feat_1'],
    } as Feature);
    const result = computeGrantedFeatIds([instance], {});
    expect(result.has('feat_bonus_feat_1')).toBe(true);
  });

  it('skips "-" prefixed removal entries', () => {
    const instance = makeInstance('class_fighter');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('class_fighter'),
      grantedFeatures: ['-feat_removed', 'feat_valid'],
    } as Feature);
    const result = computeGrantedFeatIds([instance], {});
    expect(result.has('-feat_removed')).toBe(false);
    expect(result.has('feat_valid')).toBe(true);
  });

  it('skips inactive instances', () => {
    const instance: ActiveFeatureInstance = {
      ...makeInstance('class_fighter'), isActive: false,
    };
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('class_fighter'),
      grantedFeatures: ['feat_bonus'],
    } as Feature);
    const result = computeGrantedFeatIds([instance], {});
    expect(result.has('feat_bonus')).toBe(false);
  });

  it('collects level-progression granted feats for class features', () => {
    const instance = makeInstance('class_fighter');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('class_fighter'),
      category: 'class',
      grantedFeatures: [],
      levelProgression: [
        { level: 1, grantedFeatures: ['feat_proficiency_all_martial'], grantedModifiers: [] },
        { level: 2, grantedFeatures: ['feat_bonus_feat_level2'], grantedModifiers: [] },
      ],
    } as unknown as Feature);
    // class_fighter is at level 2
    const result = computeGrantedFeatIds([instance], { class_fighter: 2 });
    expect(result.has('feat_proficiency_all_martial')).toBe(true);
    expect(result.has('feat_bonus_feat_level2')).toBe(true);
  });

  it('only grants feats up to current class level', () => {
    const instance = makeInstance('class_fighter');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('class_fighter'),
      category: 'class',
      grantedFeatures: [],
      levelProgression: [
        { level: 1, grantedFeatures: ['feat_level1'], grantedModifiers: [] },
        { level: 3, grantedFeatures: ['feat_level3'], grantedModifiers: [] },
      ],
    } as unknown as Feature);
    const result = computeGrantedFeatIds([instance], { class_fighter: 2 });
    expect(result.has('feat_level1')).toBe(true);
    expect(result.has('feat_level3')).toBe(false); // level 3 not yet reached
  });
});

describe('phaseFeatSlots — computeManualFeatCount', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns 0 when no active feat features', () => {
    expect(computeManualFeatCount([], new Set())).toBe(0);
  });

  it('counts feat features not in grantedFeatIds', () => {
    const instance = makeInstance('feat_power_attack');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('feat_power_attack'),
      category: 'feat',
    } as Feature);
    const result = computeManualFeatCount([instance], new Set());
    expect(result).toBe(1);
  });

  it('does not count feats in grantedFeatIds', () => {
    const instance = makeInstance('feat_granted');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('feat_granted'),
      category: 'feat',
    } as Feature);
    const result = computeManualFeatCount([instance], new Set(['feat_granted']));
    expect(result).toBe(0); // granted, no slot consumed
  });

  it('does not count non-feat features', () => {
    const instance = makeInstance('class_fighter');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('class_fighter'),
      category: 'class',
    } as Feature);
    const result = computeManualFeatCount([instance], new Set());
    expect(result).toBe(0);
  });

  it('does not count inactive instances', () => {
    const instance: ActiveFeatureInstance = {
      ...makeInstance('feat_power_attack'), isActive: false,
    };
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('feat_power_attack'),
      category: 'feat',
    } as Feature);
    const result = computeManualFeatCount([instance], new Set());
    expect(result).toBe(0);
  });
});

// =============================================================================
// 6. phaseActionBudget — computeEffectiveActionBudget, computeActionBudgetHasXOR, computeActionBudgetBlockers
// =============================================================================

describe('phaseActionBudget — computeEffectiveActionBudget', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns Infinity for all categories when no features have actionBudget', () => {
    const result = computeEffectiveActionBudget([]);
    expect(result.standard).toBe(Infinity);
    expect(result.move).toBe(Infinity);
    expect(result.swift).toBe(Infinity);
    expect(result.full_round).toBe(Infinity);
  });

  it('returns Infinity when active feature has no actionBudget', () => {
    const instance = makeInstance('feat_power_attack');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue(makeFeature('feat_power_attack'));
    const result = computeEffectiveActionBudget([instance]);
    expect(result.standard).toBe(Infinity);
  });

  it('applies actionBudget from active feature — Staggered', () => {
    const instance = makeInstance('condition_staggered');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('condition_staggered'),
      actionBudget: { standard: 1, move: 1, full_round: 0 },
    } as Feature);
    const result = computeEffectiveActionBudget([instance]);
    expect(result.standard).toBe(1);
    expect(result.move).toBe(1);
    expect(result.full_round).toBe(0);
    expect(result.swift).toBe(Infinity);
  });

  it('minimum-wins when two conditions restrict the same category', () => {
    const inst1 = makeInstance('cond_a');
    const inst2 = makeInstance('cond_b');
    const mockGetFeature = vi.spyOn(dataLoader, 'getFeature').mockImplementation((id: string) => {
      if (id === 'cond_a') return { ...makeFeature('cond_a'), actionBudget: { standard: 1 } } as Feature;
      if (id === 'cond_b') return { ...makeFeature('cond_b'), actionBudget: { standard: 0 } } as Feature;
      return undefined;
    });
    const result = computeEffectiveActionBudget([inst1, inst2]);
    expect(result.standard).toBe(0); // min(1, 0) = 0
  });

  it('skips inactive features', () => {
    const instance: ActiveFeatureInstance = {
      ...makeInstance('condition_stunned'), isActive: false,
    };
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('condition_stunned'),
      actionBudget: { standard: 0, move: 0, full_round: 0 },
    } as Feature);
    const result = computeEffectiveActionBudget([instance]);
    expect(result.standard).toBe(Infinity);
  });
});

describe('phaseActionBudget — computeActionBudgetHasXOR', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns false when no features have action_budget_xor tag', () => {
    const instance = makeInstance('feat_power_attack');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue(makeFeature('feat_power_attack'));
    expect(computeActionBudgetHasXOR([instance])).toBe(false);
  });

  it('returns true when active feature has action_budget_xor tag and actionBudget', () => {
    const instance = makeInstance('condition_staggered');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('condition_staggered'),
      tags: ['condition', 'action_budget_xor'],
      actionBudget: { standard: 1, move: 1, full_round: 0 },
    } as Feature);
    expect(computeActionBudgetHasXOR([instance])).toBe(true);
  });

  it('returns false when inactive even with XOR tag', () => {
    const instance: ActiveFeatureInstance = {
      ...makeInstance('condition_staggered'), isActive: false,
    };
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('condition_staggered'),
      tags: ['action_budget_xor'],
      actionBudget: { standard: 1 },
    } as Feature);
    expect(computeActionBudgetHasXOR([instance])).toBe(false);
  });

  it('returns false when feature has XOR tag but no actionBudget', () => {
    const instance = makeInstance('feat_no_budget');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('feat_no_budget'),
      tags: ['action_budget_xor'],
      // actionBudget intentionally absent
    } as Feature);
    expect(computeActionBudgetHasXOR([instance])).toBe(false);
  });
});

describe('phaseActionBudget — computeActionBudgetBlockers', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns empty strings for all categories when no blockers', () => {
    const result = computeActionBudgetBlockers([], 'en');
    expect(result.standard).toBe('');
    expect(result.move).toBe('');
    expect(result.free).toBe('');
  });

  it('names the condition blocking a category with value 0', () => {
    const instance = makeInstance('condition_stunned');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('condition_stunned'),
      label: { en: 'Stunned' },
      actionBudget: { standard: 0 },
    } as Feature);
    const result = computeActionBudgetBlockers([instance], 'en');
    expect(result.standard).toBe('Stunned');
  });

  it('does not list features with actionBudget value > 0', () => {
    const instance = makeInstance('condition_staggered');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('condition_staggered'),
      label: { en: 'Staggered' },
      actionBudget: { standard: 1 }, // value = 1, not 0
    } as Feature);
    const result = computeActionBudgetBlockers([instance], 'en');
    expect(result.standard).toBe(''); // 1 is not a blocker
  });

  it('skips inactive instances', () => {
    const instance: ActiveFeatureInstance = {
      ...makeInstance('condition_stunned'), isActive: false,
    };
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('condition_stunned'),
      label: { en: 'Stunned' },
      actionBudget: { standard: 0 },
    } as Feature);
    const result = computeActionBudgetBlockers([instance], 'en');
    expect(result.standard).toBe('');
  });

  it('joins multiple blockers with a comma', () => {
    const inst1 = makeInstance('cond_a');
    const inst2 = makeInstance('cond_b');
    vi.spyOn(dataLoader, 'getFeature').mockImplementation((id: string) => {
      if (id === 'cond_a') return { ...makeFeature('cond_a'), label: { en: 'CondA' }, actionBudget: { standard: 0 } } as Feature;
      if (id === 'cond_b') return { ...makeFeature('cond_b'), label: { en: 'CondB' }, actionBudget: { standard: 0 } } as Feature;
      return undefined;
    });
    const result = computeActionBudgetBlockers([inst1, inst2], 'en');
    expect(result.standard).toContain('CondA');
    expect(result.standard).toContain('CondB');
  });
});

// =============================================================================
// 7. phase0Modifiers — computeActiveTags & computePhase0Result
// =============================================================================

describe('phase0Modifiers — computeActiveTags', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns empty array when no features are active', () => {
    const result = computeActiveTags([], undefined, []);
    expect(result).toHaveLength(0);
  });

  it('collects tags from active features', () => {
    const instance = makeInstance('race_human');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('race_human'),
      tags: ['race', 'race_human', 'humanoid'],
    } as Feature);
    const result = computeActiveTags([instance], undefined, []);
    expect(result).toContain('race');
    expect(result).toContain('race_human');
    expect(result).toContain('humanoid');
  });

  it('deduplicates tags from multiple features', () => {
    const inst1 = makeInstance('feat_1');
    const inst2 = makeInstance('feat_2');
    vi.spyOn(dataLoader, 'getFeature').mockImplementation((id: string) => {
      if (id === 'feat_1') return { ...makeFeature('feat_1'), tags: ['combat', 'melee'] } as Feature;
      if (id === 'feat_2') return { ...makeFeature('feat_2'), tags: ['combat', 'power_attack'] } as Feature;
      return undefined;
    });
    const result = computeActiveTags([inst1, inst2], undefined, []);
    const combatCount = result.filter(t => t === 'combat').length;
    expect(combatCount).toBe(1); // deduplicated
    expect(result).toContain('melee');
    expect(result).toContain('power_attack');
  });

  it('skips inactive instances', () => {
    const instance: ActiveFeatureInstance = {
      ...makeInstance('race_human'), isActive: false,
    };
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('race_human'),
      tags: ['race', 'race_human'],
    } as Feature);
    const result = computeActiveTags([instance], undefined, []);
    expect(result).toHaveLength(0);
  });

  it('includes GM override tags', () => {
    const gmOverride = makeInstance('condition_blessed');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('condition_blessed'),
      tags: ['condition', 'blessed'],
    } as Feature);
    const result = computeActiveTags([], [gmOverride], []);
    expect(result).toContain('blessed');
  });

  it('includes scene global features', () => {
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('environment_darkness'),
      tags: ['environment', 'darkness'],
    } as Feature);
    const result = computeActiveTags([], undefined, ['environment_darkness']);
    expect(result).toContain('darkness');
  });

  it('emits choice-derived sub-tags from choiceGrantedTagPrefix', () => {
    const instance: ActiveFeatureInstance = {
      ...makeInstance('feat_weapon_focus'),
      selections: { 'choice_weapon': ['longsword'] },
    };
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('feat_weapon_focus'),
      tags: [],
      choices: [{ choiceId: 'choice_weapon', choiceGrantedTagPrefix: 'weapon_focus_', label: { en: 'Weapon' }, options: [] }],
    } as unknown as Feature);
    const result = computeActiveTags([instance], undefined, []);
    expect(result).toContain('weapon_focus_longsword');
  });
});

describe('phase0Modifiers — computePhase0Result', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns empty result for no active features', () => {
    const result = computePhase0Result([], undefined, [], {}, 'en', [], EMPTY_CONTEXT);
    expect(result.modifiers).toHaveLength(0);
    expect(result.disabledInstanceIds.size).toBe(0);
  });

  it('extracts modifiers from active features', () => {
    const instance = makeInstance('item_belt_str');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('item_belt_str'),
      grantedModifiers: [makeMod('str_2', 2, 'enhancement', 'stat_strength')],
    } as Feature);
    const result = computePhase0Result([instance], undefined, [], {}, 'en', [], EMPTY_CONTEXT);
    expect(result.modifiers.length).toBeGreaterThan(0);
    expect(result.modifiers[0].modifier.id).toBe('str_2');
  });

  it('skips inactive instances', () => {
    const instance: ActiveFeatureInstance = {
      ...makeInstance('item_belt_str'), isActive: false,
    };
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('item_belt_str'),
      grantedModifiers: [makeMod('str_2', 2, 'enhancement', 'stat_strength')],
    } as Feature);
    const result = computePhase0Result([instance], undefined, [], {}, 'en', [], EMPTY_CONTEXT);
    expect(result.modifiers).toHaveLength(0);
  });

  it('fans out saves.all to fortitude, reflex, will', () => {
    const instance = makeInstance('spell_resistance_cloak');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('spell_resistance_cloak'),
      grantedModifiers: [makeMod('res_all', 2, 'resistance', 'saves.all')],
    } as Feature);
    const result = computePhase0Result([instance], undefined, [], {}, 'en', [], EMPTY_CONTEXT);
    const targets = result.modifiers.map(e => e.modifier.targetId);
    expect(targets).toContain('saves.fortitude');
    expect(targets).toContain('saves.reflex');
    expect(targets).toContain('saves.will');
    expect(targets).not.toContain('saves.all');
  });

  it('disables instances when prerequisite fails', () => {
    const instance = makeInstance('feat_power_attack');
    const prereqNode = { logic: 'CONDITION' as const, targetPath: '@characterLevel', operator: '>=' as const, value: 10 };
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('feat_power_attack'),
      category: 'feat',
      prerequisitesNode: prereqNode,
      grantedModifiers: [],
    } as Feature);
    // Character level is 0 in EMPTY_CONTEXT — prereq fails
    const result = computePhase0Result([instance], undefined, [], {}, 'en', [], EMPTY_CONTEXT);
    expect(result.disabledInstanceIds.has(instance.instanceId)).toBe(true);
  });
});

// =============================================================================
// 8. phase4Skills — computeMulticlassXpPenaltyRisk
// =============================================================================

describe('phase4Skills — computeMulticlassXpPenaltyRisk', () => {
  it('returns false for single class', () => {
    expect(computeMulticlassXpPenaltyRisk({ class_fighter: 5 }, undefined)).toBe(false);
  });

  it('returns false for two classes with same level', () => {
    expect(computeMulticlassXpPenaltyRisk({ class_fighter: 5, class_wizard: 5 }, undefined)).toBe(false);
  });

  it('returns false for two classes within 1 level of each other', () => {
    expect(computeMulticlassXpPenaltyRisk({ class_fighter: 5, class_wizard: 4 }, undefined)).toBe(false);
  });

  it('returns true when a class is more than 1 level behind highest', () => {
    expect(computeMulticlassXpPenaltyRisk({ class_fighter: 5, class_wizard: 3 }, undefined)).toBe(true);
  });

  it('returns false when the lagging class is the favored class', () => {
    expect(
      computeMulticlassXpPenaltyRisk({ class_fighter: 5, class_wizard: 3 }, 'class_wizard')
    ).toBe(false); // wizard is favored class, fighter 5 vs nothing else
  });

  it('returns false when only one non-favored class remains', () => {
    expect(
      computeMulticlassXpPenaltyRisk({ class_fighter: 5, class_wizard: 3 }, 'class_fighter')
    ).toBe(false); // after excluding fighter, only wizard remains — single class = no penalty
  });

  it('returns true for three classes with one far behind (no favored class)', () => {
    expect(
      computeMulticlassXpPenaltyRisk({ class_fighter: 5, class_wizard: 5, class_rogue: 2 }, undefined)
    ).toBe(true);
  });
});

// =============================================================================
// 9. phase4Skills — buildClassSkillSet
// =============================================================================

describe('phase4Skills — buildClassSkillSet', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns empty set when no features active', () => {
    const result = buildClassSkillSet([], undefined, {});
    expect(result.size).toBe(0);
  });

  it('collects classSkills from non-class features unconditionally', () => {
    const instance = makeInstance('feat_skill_focus');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('feat_skill_focus'),
      category: 'feat',
      classSkills: ['skill_knowledge_arcana'],
    } as unknown as Feature);
    const result = buildClassSkillSet([instance], undefined, {});
    expect(result.has('skill_knowledge_arcana')).toBe(true);
  });

  it('only adds class skills if class level >= 1', () => {
    const instance = makeInstance('class_fighter');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('class_fighter'),
      category: 'class',
      classSkills: ['skill_climb', 'skill_jump', 'skill_swim'],
    } as unknown as Feature);
    // Class level = 0
    const result1 = buildClassSkillSet([instance], undefined, { class_fighter: 0 });
    expect(result1.has('skill_climb')).toBe(false);

    // Class level = 1
    const result2 = buildClassSkillSet([instance], undefined, { class_fighter: 1 });
    expect(result2.has('skill_climb')).toBe(true);
  });

  it('skips inactive instances', () => {
    const instance: ActiveFeatureInstance = {
      ...makeInstance('class_rogue'), isActive: false,
    };
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('class_rogue'),
      category: 'class',
      classSkills: ['skill_hide'],
    } as unknown as Feature);
    const result = buildClassSkillSet([instance], undefined, { class_rogue: 5 });
    expect(result.has('skill_hide')).toBe(false);
  });

  it('includes gm override class skills', () => {
    const gmOverride = makeInstance('class_bard');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('class_bard'),
      category: 'class',
      classSkills: ['skill_perform'],
    } as unknown as Feature);
    const result = buildClassSkillSet([], [gmOverride], { class_bard: 3 });
    expect(result.has('skill_perform')).toBe(true);
  });
});

// =============================================================================
// 10. phase4Skills — buildSkillPointsBudget
// =============================================================================

describe('phase4Skills — buildSkillPointsBudget', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns empty budget when no skill_points_per_level modifiers', () => {
    const result = buildSkillPointsBudget([], {}, 0, 0);
    expect(result.perClassBreakdown).toHaveLength(0);
    expect(result.totalAvailable).toBe(0);
  });

  it('computes correct SP budget for a fighter (2 SP/level, INT 10)', () => {
    // Fighter: 2 SP/level, INT mod 0, level 5
    // First-class bonus: 3 × pointsPerLevel = 6 extra at level 1
    // Total = 2 × 5 + 3×2 = 16
    const mod = makeMod('fighter_sp', 2, 'base', 'attributes.skill_points_per_level', {
      sourceId: 'class_fighter',
    });
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('class_fighter'),
      label: { en: 'Fighter' },
    } as Feature);
    const result = buildSkillPointsBudget([makeFlatEntry(mod)], { class_fighter: 5 }, 0, 5);
    expect(result.perClassBreakdown).toHaveLength(1);
    expect(result.perClassBreakdown[0].classId).toBe('class_fighter');
    expect(result.perClassBreakdown[0].spPerLevel).toBe(2);
    expect(result.totalClassPoints).toBe(16); // 2×5 + 3×2
  });

  it('applies INT modifier to SP/level (min 1 per level)', () => {
    const mod = makeMod('sp', 2, 'base', 'attributes.skill_points_per_level', {
      sourceId: 'class_wizard',
    });
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue(makeFeature('class_wizard'));
    // INT 16 → mod +3 → 2+3 = 5 SP/level
    const result = buildSkillPointsBudget([makeFlatEntry(mod)], { class_wizard: 3 }, 3, 3);
    expect(result.perClassBreakdown[0].pointsPerLevel).toBe(5);
  });

  it('counts bonus_skill_points_per_level as extra', () => {
    const bonusMod = makeMod('bonus_sp', 1, 'untyped', 'attributes.bonus_skill_points_per_level');
    const result = buildSkillPointsBudget([makeFlatEntry(bonusMod)], {}, 0, 4);
    expect(result.bonusSpPerLevel).toBe(1);
    expect(result.totalBonusPoints).toBe(4); // 1 × 4 levels
  });
});

// =============================================================================
// 11. phase4Skills — buildLevelingJournal
// =============================================================================

describe('phase4Skills — buildLevelingJournal', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns empty journal for no classes', () => {
    const budget = { perClassBreakdown: [], bonusSpPerLevel: 0, totalBonusPoints: 0, totalClassPoints: 0, totalAvailable: 0, intModifier: 0 };
    const result = buildLevelingJournal({}, [], budget, 0);
    expect(result.perClassBreakdown).toHaveLength(0);
    expect(result.totalBab).toBe(0);
  });

  it('computes journal entry for a single class', () => {
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('class_fighter'),
      label: { en: 'Fighter' },
      classSkills: ['skill_climb'],
    } as unknown as Feature);

    const babMod = makeMod('bab', 3, 'base', 'combatStats.base_attack_bonus', { sourceId: 'class_fighter' });
    const fortMod = makeMod('fort', 2, 'base', 'saves.fortitude', { sourceId: 'class_fighter' });
    const budget = {
      perClassBreakdown: [{
        classId: 'class_fighter', classLabel: { en: 'Fighter' }, classLevel: 3,
        spPerLevel: 2, spPointsPerLevel: 2, firstLevelBonus: 6, totalPoints: 12,
        intModifier: 0, pointsPerLevel: 2,
      }],
      bonusSpPerLevel: 0, totalBonusPoints: 0, totalClassPoints: 12, totalAvailable: 12, intModifier: 0,
    };
    const result = buildLevelingJournal(
      { class_fighter: 3 },
      [makeFlatEntry(babMod), makeFlatEntry(fortMod)],
      budget, 3
    );
    expect(result.perClassBreakdown).toHaveLength(1);
    expect(result.perClassBreakdown[0].totalBab).toBe(3);
    expect(result.perClassBreakdown[0].totalFort).toBe(2);
    expect(result.totalBab).toBe(3);
  });

  it('skips class entries with level < 1', () => {
    const budget = { perClassBreakdown: [], bonusSpPerLevel: 0, totalBonusPoints: 0, totalClassPoints: 0, totalAvailable: 0, intModifier: 0 };
    const result = buildLevelingJournal({ class_fighter: 0 }, [], budget, 0);
    expect(result.perClassBreakdown).toHaveLength(0);
  });
});

// =============================================================================
// 12. phase4Skills — buildSkillPipelines
// =============================================================================

describe('phase4Skills — buildSkillPipelines', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  function makeSkillPipeline(id: string, ranks = 0, keyAbility = 'stat_dexterity'): SkillPipeline {
    return {
      ...makePipeline(id, 0),
      keyAbility,
      ranks,
      isClassSkill: false,
      costPerRank: 2,
      appliesArmorCheckPenalty: false,
      canBeUsedUntrained: true,
    };
  }

  it('returns processed skills with updated isClassSkill and costPerRank', () => {
    const skills = { skill_climb: makeSkillPipeline('skill_climb', 3, 'stat_strength') };
    const attrs = { stat_strength: { ...makePipeline('stat_strength', 16), derivedModifier: 3, totalValue: 16 } };
    vi.spyOn(dataLoader, 'getConfigTable').mockReturnValue(undefined);

    const result = buildSkillPipelines(skills, [], attrs, new Set(['skill_climb']), 0);
    expect(result['skill_climb'].isClassSkill).toBe(true);
    expect(result['skill_climb'].costPerRank).toBe(1);
    // totalValue = ranks(3) + ability_mod(3) + stacking(0) = 6
    expect(result['skill_climb'].totalValue).toBe(6);
  });

  it('applies armor check penalty to affected skills', () => {
    const skills = {
      skill_swim: { ...makeSkillPipeline('skill_swim', 2, 'stat_strength'), appliesArmorCheckPenalty: true },
    };
    const attrs = { stat_strength: { ...makePipeline('stat_strength', 10), derivedModifier: 0 } };
    vi.spyOn(dataLoader, 'getConfigTable').mockReturnValue(undefined);

    const result = buildSkillPipelines(skills, [], attrs, new Set(), -3);
    // ranks(2) + ability_mod(0) + bonus(0) + ACP(-3) = -1
    expect(result['skill_swim'].totalValue).toBe(-1);
  });

  it('does not apply armor check penalty to skills without the flag', () => {
    const skills = { skill_spellcraft: makeSkillPipeline('skill_spellcraft', 5, 'stat_intelligence') };
    const attrs = { stat_intelligence: { ...makePipeline('stat_intelligence', 14), derivedModifier: 2 } };
    vi.spyOn(dataLoader, 'getConfigTable').mockReturnValue(undefined);

    const result = buildSkillPipelines(skills, [], attrs, new Set(), -3);
    // ranks(5) + ability_mod(2) = 7 (no ACP)
    expect(result['skill_spellcraft'].totalValue).toBe(7);
  });

  it('applies feature modifiers to the skill', () => {
    const skills = { skill_climb: makeSkillPipeline('skill_climb', 0, 'stat_strength') };
    const attrs = { stat_strength: { ...makePipeline('stat_strength', 10), derivedModifier: 0 } };
    const mod = makeMod('feat_bonus', 2, 'competence', 'skill_climb');
    vi.spyOn(dataLoader, 'getConfigTable').mockReturnValue(undefined);

    const result = buildSkillPipelines(skills, [makeFlatEntry(mod)], attrs, new Set(), 0);
    expect(result['skill_climb'].totalBonus).toBe(2);
    expect(result['skill_climb'].totalValue).toBe(2);
  });

  it('cross-class skill has costPerRank = 2', () => {
    const skills = { skill_spellcraft: makeSkillPipeline('skill_spellcraft', 0, 'stat_intelligence') };
    const attrs = { stat_intelligence: { ...makePipeline('stat_intelligence', 10), derivedModifier: 0 } };
    vi.spyOn(dataLoader, 'getConfigTable').mockReturnValue(undefined);

    const result = buildSkillPipelines(skills, [], attrs, new Set(), 0);
    expect(result['skill_spellcraft'].isClassSkill).toBe(false);
    expect(result['skill_spellcraft'].costPerRank).toBe(2);
  });

  it('generates synergy modifiers from config_skill_synergies table', () => {
    // Set up: Tumble (5 ranks) provides +2 synergy to Balance
    const skills: Record<string, SkillPipeline> = {
      skill_tumble: { ...makeSkillPipeline('skill_tumble', 5, 'stat_dexterity') },
      skill_balance: { ...makeSkillPipeline('skill_balance', 0, 'stat_dexterity') },
    };
    const attrs = {
      stat_dexterity: { ...makePipeline('stat_dexterity', 14), derivedModifier: 2 },
    };

    // Mock synergy table
    const synergyTableMock = {
      tableId: 'config_skill_synergies',
      ruleSource: 'srd_core',
      data: [{ sourceSkill: 'skill_tumble', targetSkill: 'skill_balance' }],
      requiredRanks: 5,
      bonusValue: 2,
      bonusType: 'synergy',
    };
    vi.spyOn(dataLoader, 'getConfigTable').mockReturnValue(synergyTableMock as any);
    vi.spyOn(dataLoader, 'getFeature').mockImplementation((id: string) => {
      if (id === 'skill_tumble') return { ...makeFeature('skill_tumble'), label: { en: 'Tumble' } } as Feature;
      return undefined;
    });

    const result = buildSkillPipelines(skills, [], attrs, new Set(), 0);
    // Balance should have a synergy bonus from Tumble (5 ranks >= 5 required)
    // totalValue = ranks(0) + ability_mod(2) + synergy_bonus(2) = 4
    expect(result['skill_balance'].totalBonus).toBe(2);
    expect(result['skill_balance'].totalValue).toBe(4);
  });

  it('synergy bonus is situational when condition string is provided', () => {
    const skills: Record<string, SkillPipeline> = {
      skill_bluff: { ...makeSkillPipeline('skill_bluff', 5, 'stat_charisma') },
      skill_sleight: { ...makeSkillPipeline('skill_sleight', 0, 'stat_dexterity') },
    };
    const attrs = {
      stat_charisma: { ...makePipeline('stat_charisma', 10), derivedModifier: 0 },
      stat_dexterity: { ...makePipeline('stat_dexterity', 10), derivedModifier: 0 },
    };

    const synergyTableMock = {
      tableId: 'config_skill_synergies',
      ruleSource: 'srd_core',
      data: [{ sourceSkill: 'skill_bluff', targetSkill: 'skill_sleight', condition: 'distracted_target' }],
      requiredRanks: 5,
      bonusValue: 2,
      bonusType: 'synergy',
    };
    vi.spyOn(dataLoader, 'getConfigTable').mockReturnValue(synergyTableMock as any);
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue(undefined);

    const result = buildSkillPipelines(skills, [], attrs, new Set(), 0);
    // Situational synergy: goes to situationalModifiers not totalBonus
    expect(result['skill_sleight'].totalBonus).toBe(0); // not active
    expect(result['skill_sleight'].situationalModifiers.length).toBeGreaterThanOrEqual(1);
  });

  it('situational feature modifier goes to situationalModifiers', () => {
    const skills = { skill_spot: makeSkillPipeline('skill_spot', 3, 'stat_wisdom') };
    const attrs = { stat_wisdom: { ...makePipeline('stat_wisdom', 12), derivedModifier: 1 } };
    const sitMod = makeMod('alertness_sit', 2, 'untyped', 'skill_spot', {
      situationalContext: 'near_familiar',
    });
    vi.spyOn(dataLoader, 'getConfigTable').mockReturnValue(undefined);

    const result = buildSkillPipelines(skills, [makeFlatEntry(sitMod)], attrs, new Set(), 0);
    expect(result['skill_spot'].totalBonus).toBe(0); // not counted in total
    expect(result['skill_spot'].situationalModifiers).toHaveLength(1);
    // totalValue = ranks(3) + ability_mod(1) = 4 (no situational)
    expect(result['skill_spot'].totalValue).toBe(4);
  });
});

// =============================================================================
// 13. phase0Modifiers — additional coverage for internal paths
// =============================================================================

describe('phase0Modifiers — advanced scenarios', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('skips feature with forbiddenTags that are in activeTags', () => {
    const instance = makeInstance('druid_natural_spell');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('druid_natural_spell'),
      forbiddenTags: ['metal_armor'], // druid cannot wear metal
      grantedModifiers: [makeMod('druid_mod', 1, 'untyped', 'stat_wisdom')],
    } as Feature);
    // Pass metal_armor as an active tag
    const result = computePhase0Result([instance], undefined, [], {}, 'en', ['metal_armor'], EMPTY_CONTEXT);
    expect(result.modifiers).toHaveLength(0); // feature suppressed by forbiddenTags
  });

  it('processes class level progression gating', () => {
    const instance = makeInstance('class_fighter');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('class_fighter'),
      category: 'class',
      grantedModifiers: [],
      levelProgression: [
        { level: 1, grantedModifiers: [makeMod('bab_1', 1, 'base', 'combatStats.base_attack_bonus')], grantedFeatures: [] },
        { level: 2, grantedModifiers: [makeMod('bab_2', 1, 'base', 'combatStats.base_attack_bonus')], grantedFeatures: [] },
        { level: 3, grantedModifiers: [makeMod('bab_3', 1, 'base', 'combatStats.base_attack_bonus')], grantedFeatures: [] },
      ],
    } as unknown as Feature);

    // Level 2 fighter gets level 1 and level 2 progression
    const result = computePhase0Result([instance], undefined, [], { class_fighter: 2 }, 'en', [], EMPTY_CONTEXT);
    const babMods = result.modifiers.filter(e => e.modifier.targetId === 'combatStats.base_attack_bonus');
    expect(babMods).toHaveLength(2); // levels 1 and 2 only
  });

  it('processes granted features recursively', () => {
    const instance = makeInstance('feat_alertness');
    const getFeatureSpy = vi.spyOn(dataLoader, 'getFeature').mockImplementation((id: string) => {
      if (id === 'feat_alertness') {
        return {
          ...makeFeature('feat_alertness'),
          grantedModifiers: [],
          grantedFeatures: ['feat_alertness_bonus'],
        } as Feature;
      }
      if (id === 'feat_alertness_bonus') {
        return {
          ...makeFeature('feat_alertness_bonus'),
          grantedModifiers: [makeMod('listen_bonus', 2, 'untyped', 'skill_listen')],
          grantedFeatures: [],
        } as Feature;
      }
      return undefined;
    });

    const result = computePhase0Result([instance], undefined, [], {}, 'en', [], EMPTY_CONTEXT);
    expect(result.modifiers.some(e => e.modifier.id === 'listen_bonus')).toBe(true);
  });

  it('processes formula-as-value modifier (string value resolved)', () => {
    const instance = makeInstance('feat_wis_to_ac');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('feat_wis_to_ac'),
      grantedModifiers: [{
        id: 'wis_ac_mod',
        sourceId: 'feat_wis_to_ac',
        sourceName: { en: 'Wisdom to AC' },
        targetId: 'combatStats.ac_normal',
        value: '@attributes.stat_wisdom.derivedModifier',
        type: 'untyped' as import('$lib/types/primitives').ModifierType,
      }],
    } as Feature);

    const ctx: CharacterContext = {
      ...EMPTY_CONTEXT,
      attributes: { stat_wisdom: { baseValue: 14, totalValue: 14, derivedModifier: 2 } },
    };
    const result = computePhase0Result([instance], undefined, [], {}, 'en', [], ctx);
    // Formula resolved to WIS derivedModifier = 2
    const acMod = result.modifiers.find(e => e.modifier.targetId === 'combatStats.ac_normal');
    expect(acMod).toBeDefined();
    expect(acMod?.modifier.value).toBe(2);
  });

  it('skips modifier with failing conditionNode', () => {
    const instance = makeInstance('feat_conditional');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('feat_conditional'),
      grantedModifiers: [{
        id: 'rage_bonus',
        sourceId: 'feat_conditional',
        sourceName: { en: 'Rage Bonus' },
        targetId: 'stat_strength',
        value: 4,
        type: 'morale' as import('$lib/types/primitives').ModifierType,
        conditionNode: {
          logic: 'CONDITION' as const,
          targetPath: '@activeTags',
          operator: 'has_tag' as const,
          value: 'raging',
        },
      }],
    } as Feature);

    // No 'raging' tag in activeTags → conditionNode fails → modifier not included
    const result = computePhase0Result([instance], undefined, [], {}, 'en', [], EMPTY_CONTEXT);
    expect(result.modifiers.filter(e => e.modifier.id === 'rage_bonus')).toHaveLength(0);
  });

  it('saves.all fan-out with formula-as-value resolves numerically', () => {
    const instance = makeInstance('feat_save_bonus');
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('feat_save_bonus'),
      grantedModifiers: [{
        id: 'res_all',
        sourceId: 'feat_save_bonus',
        sourceName: { en: 'Resistance All' },
        targetId: 'saves.all',
        value: '2',  // string formula
        type: 'resistance' as import('$lib/types/primitives').ModifierType,
      }],
    } as Feature);

    const result = computePhase0Result([instance], undefined, [], {}, 'en', [], EMPTY_CONTEXT);
    // Should fan out to fort, reflex, will — each with resolved numeric value 2
    const fort = result.modifiers.find(e => e.modifier.targetId === 'saves.fortitude');
    expect(fort).toBeDefined();
    expect(fort?.modifier.value).toBe(2);
  });

  it('class with top-level grantedFeatures processes them recursively', () => {
    const instance = makeInstance('class_paladin');
    vi.spyOn(dataLoader, 'getFeature').mockImplementation((id: string) => {
      if (id === 'class_paladin') {
        return {
          ...makeFeature('class_paladin'),
          category: 'class',
          // Top-level grantedFeatures triggers the recursive path
          grantedFeatures: ['feat_divine_grace'],
          grantedModifiers: [],
          levelProgression: undefined,
        } as unknown as Feature;
      }
      if (id === 'feat_divine_grace') {
        return {
          ...makeFeature('feat_divine_grace'),
          grantedModifiers: [makeMod('cha_saves', 2, 'charisma', 'saves.fortitude')],
          grantedFeatures: [],
        } as Feature;
      }
      return undefined;
    });

    const result = computePhase0Result([instance], undefined, [], { class_paladin: 1 }, 'en', [], EMPTY_CONTEXT);
    const fortMods = result.modifiers.filter(e => e.modifier.targetId === 'saves.fortitude');
    expect(fortMods.length).toBeGreaterThan(0);
  });

  it('class with both top-level grantedFeatures and levelProgression grantedFeatures', () => {
    const instance = makeInstance('class_fighter');
    vi.spyOn(dataLoader, 'getFeature').mockImplementation((id: string) => {
      if (id === 'class_fighter') {
        return {
          ...makeFeature('class_fighter'),
          category: 'class',
          // Both top-level and level progression granted features
          grantedFeatures: ['feat_martial_weapons'],
          grantedModifiers: [],
          levelProgression: [
            {
              level: 1,
              grantedModifiers: [],
              grantedFeatures: ['feat_bonus_combat_feat'],
            },
          ],
        } as unknown as Feature;
      }
      if (id === 'feat_martial_weapons') {
        return {
          ...makeFeature('feat_martial_weapons'),
          grantedModifiers: [makeMod('weapon_mod', 1, 'untyped', 'combatStats.base_attack_bonus')],
          grantedFeatures: [],
        } as Feature;
      }
      if (id === 'feat_bonus_combat_feat') {
        return {
          ...makeFeature('feat_bonus_combat_feat'),
          grantedModifiers: [makeMod('bonus_feat_mod', 1, 'untyped', 'stat_strength')],
          grantedFeatures: [],
        } as Feature;
      }
      return undefined;
    });

    const result = computePhase0Result([instance], undefined, [], { class_fighter: 1 }, 'en', [], EMPTY_CONTEXT);
    // Should have modifiers from both top-level and level-1 progression
    const babMods = result.modifiers.filter(e => e.modifier.targetId === 'combatStats.base_attack_bonus');
    const strMods = result.modifiers.filter(e => e.modifier.targetId === 'stat_strength');
    expect(babMods.length).toBeGreaterThan(0);
    expect(strMods.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// 14. phase4Skills — buildLevelingJournal with level progression
// =============================================================================

describe('phase4Skills — buildLevelingJournal with level progression', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('collects grantedFeatureIds from class level progression', () => {
    vi.spyOn(dataLoader, 'getFeature').mockImplementation((id: string) => {
      if (id === 'class_paladin') {
        return {
          ...makeFeature('class_paladin'),
          label: { en: 'Paladin' },
          category: 'class',
          classSkills: [],
          levelProgression: [
            { level: 1, grantedFeatures: ['feat_divine_grace', 'feat_lay_on_hands'], grantedModifiers: [] },
            { level: 2, grantedFeatures: ['feat_divine_health'], grantedModifiers: [] },
            { level: 3, grantedFeatures: ['feat_aura_of_courage'], grantedModifiers: [] },
          ],
        } as unknown as Feature;
      }
      return undefined;
    });

    const budget = {
      perClassBreakdown: [],
      bonusSpPerLevel: 0, totalBonusPoints: 0, totalClassPoints: 0, totalAvailable: 0, intModifier: 0,
    };
    const result = buildLevelingJournal({ class_paladin: 2 }, [], budget, 2);
    const paladin = result.perClassBreakdown[0];
    expect(paladin.grantedFeatureIds).toContain('feat_divine_grace');
    expect(paladin.grantedFeatureIds).toContain('feat_lay_on_hands');
    expect(paladin.grantedFeatureIds).toContain('feat_divine_health');
    expect(paladin.grantedFeatureIds).not.toContain('feat_aura_of_courage'); // level 3 not reached
  });

  it('deduplicates granted features that appear in multiple levels', () => {
    vi.spyOn(dataLoader, 'getFeature').mockReturnValue({
      ...makeFeature('class_wizard'),
      label: { en: 'Wizard' },
      category: 'class',
      classSkills: [],
      levelProgression: [
        { level: 1, grantedFeatures: ['feat_bonus_wizard_feat'], grantedModifiers: [] },
        { level: 5, grantedFeatures: ['feat_bonus_wizard_feat'], grantedModifiers: [] }, // duplicate
      ],
    } as unknown as Feature);

    const budget = {
      perClassBreakdown: [],
      bonusSpPerLevel: 0, totalBonusPoints: 0, totalClassPoints: 0, totalAvailable: 0, intModifier: 0,
    };
    const result = buildLevelingJournal({ class_wizard: 5 }, [], budget, 5);
    // Should deduplicate
    const wizardFeats = result.perClassBreakdown[0].grantedFeatureIds.filter(f => f === 'feat_bonus_wizard_feat');
    expect(wizardFeats).toHaveLength(1);
  });
});

// =============================================================================
// 15. CharacterFactory — createEmptyCharacter with DataLoader data
// =============================================================================

describe('CharacterFactory — createEmptyCharacter with DataLoader data', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('uses data-driven attribute labels when DataLoader has config_attribute_definitions', () => {
    vi.spyOn(dataLoader, 'getConfigTable').mockReturnValue({
      tableId: 'config_attribute_definitions',
      ruleSource: 'srd_core',
      data: [
        { id: 'stat_strength', label: { en: 'Strength', fr: 'Force' } },
        { id: 'stat_dexterity', label: { en: 'Dexterity', fr: 'Dextérité' } },
      ],
    } as any);

    const char = createEmptyCharacter('uuid-data', 'Data-Driven');
    // The label should come from the config table
    expect(char.attributes['stat_strength'].label).toEqual({ en: 'Strength', fr: 'Force' });
    expect(char.attributes['stat_dexterity'].label).toEqual({ en: 'Dexterity', fr: 'Dextérité' });
  });
});
