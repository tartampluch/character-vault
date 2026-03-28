/**
 * @file phase3CombatStats.ts
 * @description DAG Phase 3 — Combat Statistics & Saving Throws.
 *
 * Extracted from GameEngine.svelte.ts phase3_combatStats and phase3_context $derived.
 *
 * @see ARCHITECTURE.md §3.3 for Phase 3 specification.
 */

import type { StatisticPipeline } from '../../types/pipeline';
import type { ID } from '../../types/primitives';
import type { FlatModifierEntry } from '../../types/engine';
import type { CharacterContext } from '../../utils/mathParser';
import { applyStackingRules } from '../../utils/stackingRules';
import { computeGestaltBase, isGestaltAffectedPipeline } from '../../utils/gestaltRules';

/**
 * Resolves all combat stat and saving throw pipelines.
 *
 * @param characterCombatStats  - Character's combat stat pipelines (base values).
 * @param characterSaves        - Character's saving throw pipelines (base values).
 * @param hitDieResults         - Per-level hit die roll results for Max HP.
 * @param classLevels           - Character class level map (for gestalt computation).
 * @param flatModifiers         - Phase 0 flat modifier list.
 * @param attributes            - Phase 2 resolved attribute pipelines.
 * @param characterLevel        - Total character level (sum of class levels).
 * @param isGestalt             - Whether gestalt variant rule is active.
 */
export function buildCombatStatPipelines(
  characterCombatStats: Record<ID, StatisticPipeline>,
  characterSaves: Record<ID, StatisticPipeline>,
  hitDieResults: Record<number, number>,
  classLevels: Record<ID, number>,
  flatModifiers: FlatModifierEntry[],
  attributes: Record<ID, StatisticPipeline>,
  characterLevel: number,
  isGestalt: boolean
): Record<ID, StatisticPipeline> {
  const result: Record<ID, StatisticPipeline> = {};
  const flatMods = flatModifiers;

  // CON contribution to Max HP: CON_derivedModifier × characterLevel
  const conDerivedMod = attributes['stat_constitution']?.derivedModifier ?? 0;
  const conHpContrib = conDerivedMod * characterLevel;

  // Process each combat stat pipeline
  for (const [pipelineId, basePipeline] of Object.entries(characterCombatStats)) {
    const activeMods = flatMods
      .filter(e => e.modifier.targetId === pipelineId && !e.modifier.situationalContext)
      .map(e => e.modifier);

    const situationalMods = flatMods
      .filter(e => e.modifier.targetId === pipelineId && e.modifier.situationalContext)
      .map(e => e.modifier);

    let effectiveBaseValue = basePipeline.baseValue;

    // --- Max HP: sum hit die results + CON modifier × character level ---
    if (pipelineId === 'combatStats.max_hp') {
      const sumDiceRolls = Object.values(hitDieResults).reduce((total, roll) => total + roll, 0);
      effectiveBaseValue = sumDiceRolls + conHpContrib;
    }

    // --- Max DEX Bonus to AC: minimum-wins among armor/condition caps ---
    if (pipelineId === 'combatStats.max_dexterity_bonus') {
      const capMods = activeMods.filter(m => m.type === 'max_dex_cap');
      const remainingMods = activeMods.filter(m => m.type !== 'max_dex_cap');

      if (capMods.length > 0) {
        effectiveBaseValue = Math.min(...capMods.map(m => Number(m.value)));
      } else {
        effectiveBaseValue = basePipeline.baseValue; // 99 (no restriction)
      }

      const stackingResult = applyStackingRules(remainingMods, effectiveBaseValue);
      result[pipelineId] = {
        ...basePipeline,
        activeModifiers: [...capMods, ...stackingResult.appliedModifiers],
        situationalModifiers: situationalMods,
        totalBonus: stackingResult.totalBonus,
        totalValue: stackingResult.totalValue,
        derivedModifier: 0,
      };
      continue;
    }

    // GESTALT MODE (Phase 3.7)
    let gestaltBaseAdjustment = 0;
    let nonBaseMods = activeMods;
    if (isGestalt && isGestaltAffectedPipeline(pipelineId)) {
      const baseMods = activeMods.filter(m => m.type === 'base');
      nonBaseMods = activeMods.filter(m => m.type !== 'base');
      gestaltBaseAdjustment = computeGestaltBase(baseMods, { ...classLevels }, characterLevel);
    }

    const stacking = applyStackingRules(nonBaseMods, isGestalt && isGestaltAffectedPipeline(pipelineId)
      ? effectiveBaseValue + gestaltBaseAdjustment
      : effectiveBaseValue);

    result[pipelineId] = {
      ...basePipeline,
      activeModifiers: stacking.appliedModifiers,
      situationalModifiers: situationalMods,
      totalBonus: stacking.totalBonus,
      totalValue: stacking.totalValue,
      derivedModifier: 0,
    };
  }

  // Process each saving throw pipeline
  for (const [pipelineId, basePipeline] of Object.entries(characterSaves)) {
    const activeMods = flatMods
      .filter(e => e.modifier.targetId === pipelineId && !e.modifier.situationalContext)
      .map(e => e.modifier);

    const situationalMods = flatMods
      .filter(e => e.modifier.targetId === pipelineId && e.modifier.situationalContext)
      .map(e => e.modifier);

    let gestaltSaveAdjustment = 0;
    let nonBaseSaveMods = activeMods;
    if (isGestalt && isGestaltAffectedPipeline(pipelineId)) {
      const baseSaveMods = activeMods.filter(m => m.type === 'base');
      nonBaseSaveMods = activeMods.filter(m => m.type !== 'base');
      gestaltSaveAdjustment = computeGestaltBase(baseSaveMods, { ...classLevels }, characterLevel);
    }

    const stacking = applyStackingRules(
      nonBaseSaveMods,
      isGestalt && isGestaltAffectedPipeline(pipelineId)
        ? basePipeline.baseValue + gestaltSaveAdjustment
        : basePipeline.baseValue
    );

    result[pipelineId] = {
      ...basePipeline,
      activeModifiers: stacking.appliedModifiers,
      situationalModifiers: situationalMods,
      totalBonus: stacking.totalBonus,
      totalValue: stacking.totalValue,
      derivedModifier: 0,
    };
  }

  return result;
}

/**
 * Upgrades the Phase 2 context with Phase 3 resolved combat stat values.
 *
 * Strips namespace prefixes so path resolution works:
 *   "combatStats.base_attack_bonus" → context.combatStats["base_attack_bonus"]
 *   "saves.fortitude" → context.saves["fortitude"]
 */
export function buildPhase3Context(
  phase2Context: CharacterContext,
  combatStats: Record<ID, StatisticPipeline>
): CharacterContext {
  const updatedCombatStats: CharacterContext['combatStats'] = {};
  for (const [id, stat] of Object.entries(combatStats)) {
    if (!id.startsWith('saves.')) {
      const flatKey = id.startsWith('combatStats.') ? id.slice('combatStats.'.length) : id;
      updatedCombatStats[flatKey] = { totalValue: stat.totalValue };
    }
  }

  const updatedSaves: CharacterContext['saves'] = {};
  for (const [id, save] of Object.entries(combatStats)) {
    if (id.startsWith('saves.')) {
      const flatKey = id.slice('saves.'.length);
      updatedSaves[flatKey] = { totalValue: save.totalValue };
    }
  }

  return {
    ...phase2Context,
    combatStats: updatedCombatStats,
    saves: updatedSaves,
  };
}
