/**
 * @file phase1Size.ts
 * @description DAG Phase 1 — Size modifier resolution.
 *
 * Extracted from GameEngine.svelte.ts phase1_sizePipeline $derived.
 */

import type { StatisticPipeline } from '../../types/pipeline';
import type { ID } from '../../types/primitives';
import type { FlatModifierEntry } from '../../types/engine';
import { applyStackingRules, computeDerivedModifier } from '../../utils/stackingRules';

/**
 * Resolves the size pipeline from Phase 0 flat modifiers.
 *
 * Size values in D&D 3.5 (applied as modifiers to the base 0):
 *   Fine: +8, Diminutive: +4, Tiny: +2, Small: +1, Medium: 0,
 *   Large: -1, Huge: -2, Gargantuan: -4, Colossal: -8
 */
export function buildSizePipeline(
  sizeBaseAttribute: StatisticPipeline | undefined,
  flatModifiers: FlatModifierEntry[]
): StatisticPipeline {
  if (!sizeBaseAttribute) {
    return {
      id: 'stat_size',
      label: { en: 'Size', fr: 'Taille' },
      baseValue: 0,
      activeModifiers: [],
      situationalModifiers: [],
      totalBonus: 0,
      totalValue: 0,
      derivedModifier: 0,
    };
  }

  const sizeMods = flatModifiers
    .filter(e => e.modifier.targetId === 'stat_size' && !e.modifier.situationalContext)
    .map(e => e.modifier);

  const situationalSizeMods = flatModifiers
    .filter(e => e.modifier.targetId === 'stat_size' && e.modifier.situationalContext)
    .map(e => e.modifier);

  const stacking = applyStackingRules(sizeMods, sizeBaseAttribute.baseValue);
  const derivedMod = computeDerivedModifier(stacking.totalValue);

  return {
    ...sizeBaseAttribute,
    activeModifiers: stacking.appliedModifiers,
    situationalModifiers: situationalSizeMods,
    totalBonus: stacking.totalBonus,
    totalValue: stacking.totalValue,
    derivedModifier: derivedMod,
  };
}
