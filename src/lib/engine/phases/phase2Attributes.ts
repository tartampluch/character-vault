/**
 * @file phase2Attributes.ts
 * @description DAG Phase 2 — Attribute pipeline resolution and context upgrade.
 *
 * Extracted from GameEngine.svelte.ts phase2_attributes and phase2_context $derived.
 */

import type { StatisticPipeline } from '../../types/pipeline';
import type { ID } from '../../types/primitives';
import type { FlatModifierEntry } from '../../types/engine';
import type { CharacterContext } from '../../utils/mathParser';
import { applyStackingRules, computeDerivedModifier } from '../../utils/stackingRules';

/**
 * Resolves all character attribute pipelines (ability scores + custom stats).
 *
 * Applies stacking rules to flat modifiers targeting each attribute pipeline.
 * Computes `derivedModifier` = floor((totalValue - 10) / 2) for ability scores.
 *
 * @param characterAttributes - Character's attribute pipelines (base values).
 * @param flatModifiers       - Phase 0 flat modifier list.
 */
export function buildAttributePipelines(
  characterAttributes: Record<ID, StatisticPipeline>,
  flatModifiers: FlatModifierEntry[]
): Record<ID, StatisticPipeline> {
  const result: Record<ID, StatisticPipeline> = {};

  for (const [pipelineId, basePipeline] of Object.entries(characterAttributes)) {
    const activeMods = flatModifiers
      .filter(e => e.modifier.targetId === pipelineId && !e.modifier.situationalContext)
      .map(e => e.modifier);

    const situationalMods = flatModifiers
      .filter(e => e.modifier.targetId === pipelineId && e.modifier.situationalContext)
      .map(e => e.modifier);

    const stacking = applyStackingRules(activeMods, basePipeline.baseValue);
    const derivedMod = computeDerivedModifier(stacking.totalValue);

    result[pipelineId] = {
      ...basePipeline,
      activeModifiers: stacking.appliedModifiers,
      situationalModifiers: situationalMods,
      totalBonus: stacking.totalBonus,
      totalValue: stacking.totalValue,
      derivedModifier: derivedMod,
    };
  }

  return result;
}

/**
 * Upgrades the Phase 0 context with Phase 2 resolved attribute values.
 *
 * Returns a new context snapshot with fully resolved ability score totalValues
 * and derivedModifiers. Used by Phase 3 formulas referencing ability scores.
 *
 * @param phase0Context - The preliminary context from Phase 0.
 * @param attributes    - Phase 2 resolved attribute pipelines.
 */
export function buildPhase2Context(
  phase0Context: CharacterContext,
  attributes: Record<ID, StatisticPipeline>
): CharacterContext {
  const upgradedAttributes: CharacterContext['attributes'] = {};
  for (const [id, pipeline] of Object.entries(attributes)) {
    upgradedAttributes[id] = {
      baseValue: pipeline.baseValue,
      totalValue: pipeline.totalValue,
      derivedModifier: pipeline.derivedModifier,
    };
  }

  return {
    ...phase0Context,
    attributes: upgradedAttributes,
  };
}
