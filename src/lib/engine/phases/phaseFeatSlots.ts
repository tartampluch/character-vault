/**
 * @file phaseFeatSlots.ts
 * @description Feat slot computation (Phase 11.1).
 */

import type { ActiveFeatureInstance } from '../../types/character';
import type { FlatModifierEntry } from '../../types/engine';
import type { ID } from '../../types/primitives';
import { dataLoader } from '../DataLoader';

/**
 * Computes total available feat slots.
 * Formula: 1 + floor(characterLevel / 3) + bonus slots from features.
 */
export function computeFeatSlots(characterLevel: number, flatModifiers: FlatModifierEntry[]): number {
  const baseSlots = 1 + Math.floor(characterLevel / 3);
  const bonusSlots = flatModifiers
    .filter(e => e.modifier.targetId === 'attributes.bonus_feat_slots' && !e.modifier.situationalContext)
    .reduce((sum, e) => sum + (typeof e.modifier.value === 'number' ? e.modifier.value : 0), 0);
  return baseSlots + bonusSlots;
}

/**
 * Returns the set of feat Feature IDs that were auto-granted by Race/Class (not consuming a slot).
 */
export function computeGrantedFeatIds(
  activeFeatures: ActiveFeatureInstance[],
  classLevels: Record<ID, number>
): ReadonlySet<string> {
  const grantedIds = new Set<string>();
  for (const afi of activeFeatures) {
    if (!afi.isActive) continue;
    const feature = dataLoader.getFeature(afi.featureId);
    if (!feature) continue;
    for (const id of (feature.grantedFeatures ?? [])) {
      if (id && !id.startsWith('-')) grantedIds.add(id);
    }
    if (feature.category === 'class' && feature.levelProgression) {
      const classLevel = classLevels[feature.id] ?? 0;
      for (const entry of feature.levelProgression) {
        if (entry.level <= classLevel) {
          for (const id of entry.grantedFeatures) {
            if (id && !id.startsWith('-')) grantedIds.add(id);
          }
        }
      }
    }
  }
  return grantedIds;
}

/**
 * Counts manually selected feats (those that consume a slot).
 */
export function computeManualFeatCount(
  activeFeatures: ActiveFeatureInstance[],
  grantedFeatIds: ReadonlySet<string>
): number {
  let count = 0;
  for (const afi of activeFeatures) {
    if (!afi.isActive) continue;
    const feature = dataLoader.getFeature(afi.featureId);
    if (feature?.category !== 'feat') continue;
    if (!grantedFeatIds.has(afi.featureId)) count++;
  }
  return count;
}
