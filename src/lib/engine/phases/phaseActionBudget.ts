/**
 * @file phaseActionBudget.ts
 * @description Action economy budget computation (ARCHITECTURE.md §5.6).
 */

import type { ActiveFeatureInstance } from '../../types/character';
import type { LocalizedString } from '../../types/i18n';
import { dataLoader } from '../DataLoader';
import { t } from '../../utils/formatters';

/**
 * Computes the effective action budget: min-wins across all active action-restricting conditions.
 * Returns Infinity for unconstrained categories.
 */
export function computeEffectiveActionBudget(activeFeatures: ActiveFeatureInstance[]): Record<string, number> {
  const Inf = Infinity;
  let standard = Inf, move = Inf, swift = Inf, immediate = Inf, free = Inf, full_round = Inf;

  for (const afi of activeFeatures) {
    if (!afi.isActive) continue;
    const f = dataLoader.getFeature(afi.featureId);
    if (!f?.actionBudget) continue;
    const b = f.actionBudget;
    if (b.standard   !== undefined) standard   = Math.min(standard,   b.standard);
    if (b.move       !== undefined) move       = Math.min(move,       b.move);
    if (b.swift      !== undefined) swift      = Math.min(swift,      b.swift);
    if (b.immediate  !== undefined) immediate  = Math.min(immediate,  b.immediate);
    if (b.free       !== undefined) free       = Math.min(free,       b.free);
    if (b.full_round !== undefined) full_round = Math.min(full_round, b.full_round);
  }
  return { standard, move, swift, immediate, free, full_round };
}

/**
 * Returns true if any active feature has the `action_budget_xor` tag (Staggered/Disabled XOR rule).
 */
export function computeActionBudgetHasXOR(activeFeatures: ActiveFeatureInstance[]): boolean {
  return activeFeatures.some(afi => {
    if (!afi.isActive) return false;
    const f = dataLoader.getFeature(afi.featureId);
    return !!f?.actionBudget && f.tags?.includes('action_budget_xor') === true;
  });
}

/**
 * Returns localized names of condition features that hard-block (value=0) each action category.
 */
export function computeActionBudgetBlockers(
  activeFeatures: ActiveFeatureInstance[],
  language: string
): Record<string, string> {
  const categories = ['standard', 'move', 'swift', 'immediate', 'free', 'full_round'] as const;
  const result: Record<string, string> = {};
  for (const cat of categories) {
    result[cat] = activeFeatures
      .filter(afi => {
        if (!afi.isActive) return false;
        const f = dataLoader.getFeature(afi.featureId);
        if (!f?.actionBudget) return false;
        const val = (f.actionBudget as Record<string, unknown>)[cat];
        return val !== undefined && val === 0;
      })
      .map(afi => {
        const f = dataLoader.getFeature(afi.featureId);
        return f ? t(f.label as LocalizedString, language) : afi.featureId;
      })
      .join(', ');
  }
  return result;
}
