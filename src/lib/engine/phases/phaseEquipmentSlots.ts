/**
 * @file phaseEquipmentSlots.ts
 * @description Equipment slot pipeline resolution (Phase 13.1).
 */

import type { StatisticPipeline } from '../../types/pipeline';
import type { ID } from '../../types/primitives';
import type { ActiveFeatureInstance } from '../../types/character';
import type { ItemFeature } from '../../types/feature';
import { dataLoader } from '../DataLoader';

const SLOT_PIPELINE_KEYS = [
  'slots.head', 'slots.eyes', 'slots.neck', 'slots.torso', 'slots.body',
  'slots.waist', 'slots.shoulders', 'slots.arms', 'slots.hands',
  'slots.ring', 'slots.feet', 'slots.main_hand', 'slots.off_hand',
] as const;

/**
 * Reads the resolved slot maximum counts from Phase 3 combat stats.
 */
export function buildEquipmentSlots(combatStats: Record<ID, StatisticPipeline>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of SLOT_PIPELINE_KEYS) {
    result[key] = combatStats[key]?.totalValue ?? 0;
  }
  return result;
}

/**
 * Counts currently equipped items per slot.
 */
export function buildEquippedSlotCounts(activeFeatures: ActiveFeatureInstance[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const afi of activeFeatures) {
    if (!afi.isActive) continue;
    const feature = dataLoader.getFeature(afi.featureId);
    if (!feature || (feature as ItemFeature).equipmentSlot === undefined) continue;
    const itemFeat = feature as ItemFeature;
    const slot = itemFeat.equipmentSlot;
    if (!slot || slot === 'none') continue;
    const slotKey = `slots.${slot}`;
    counts[slotKey] = (counts[slotKey] ?? 0) + 1;
  }
  return counts;
}
