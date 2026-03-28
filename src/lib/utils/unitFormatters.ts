/**
 * @file unitFormatters.ts
 * @description Distance, weight, and coin unit formatters.
 *
 * All game data is stored in the engine using SRD reference units (feet, pounds).
 * These functions are the ONLY place where unit conversion happens.
 *
 * Extracted from formatters.ts. Import from formatters.ts (barrel) for backward compatibility.
 */

import { UNIT_SYSTEM_CONFIG } from '../types/i18n';
import type { CampaignSettings } from '../types/settings';
import { getUnitSystem } from './localizationHelpers';

/**
 * Converts a distance value in FEET to the display unit for the active language.
 *
 * @param feet - Distance in feet (the engine's reference unit).
 * @param lang - The target display language (any string; unknown → imperial).
 * @returns Formatted distance string with unit suffix.
 */
export function formatDistance(feet: number, lang: string): string {
  const config = UNIT_SYSTEM_CONFIG[getUnitSystem(lang)];
  const converted = feet * config.distanceMultiplier;
  const rounded = Math.round(converted * 10) / 10;
  return `${rounded} ${config.distanceUnit}`;
}

/**
 * Convenience overload: resolves the language from a `CampaignSettings` object.
 */
export function formatDistanceWithSettings(feet: number, settings: CampaignSettings): string {
  return formatDistance(feet, settings.language);
}

/**
 * Converts a weight value in POUNDS to the display unit for the active language.
 *
 * @param lbs  - Weight in pounds (the engine's reference unit).
 * @param lang - The target display language (any string; unknown → imperial).
 * @returns Formatted weight string with unit suffix.
 */
export function formatWeight(lbs: number, lang: string): string {
  const config = UNIT_SYSTEM_CONFIG[getUnitSystem(lang)];
  const converted = lbs * config.weightMultiplier;
  const rounded = Math.round(converted * 10) / 10;
  return `${rounded} ${config.weightUnit}`;
}

/**
 * Convenience overload: resolves the language from a `CampaignSettings` object.
 */
export function formatWeightWithSettings(lbs: number, settings: CampaignSettings): string {
  return formatWeight(lbs, settings.language);
}

/**
 * Computes the total weight of a coin purse in pounds.
 *
 * D&D 3.5 RULE: Every denomination weighs the same: 50 coins = 1 lb.
 *
 * @returns Weight in pounds (integer, rounded down per SRD encumbrance rules)
 */
export function computeCoinWeight(cp: number, sp: number, gp: number, pp: number): number {
  return Math.floor((cp + sp + gp + pp) / 50);
}

/**
 * Converts a mixed coin purse to its total gold piece equivalent.
 *
 * D&D 3.5 exchange rates: 100cp = 1gp, 10sp = 1gp, 1pp = 10gp.
 */
export function computeWealthInGP(cp: number, sp: number, gp: number, pp: number): number {
  return cp / 100 + sp / 10 + gp + pp * 10;
}
