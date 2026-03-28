/**
 * @file constants.ts
 * @description Barrel re-export for all D&D 3.5 engine constants.
 *
 * Sub-modules:
 *   abilityConstants.ts — MAIN_ABILITY_IDS, ABILITY_ABBRS, getAbilityAbbr(),
 *                         ABILITY_SCORE_MIN/MAX, ATTRIBUTE_PIPELINE_NAMESPACE,
 *                         CONDITION_NODE_KNOWN_PATHS
 *   itemConstants.ts    — psionic item type IDs, weapon tags, magic types,
 *                         DR constants, equipment slot sentinels
 *   ruleConstants.ts    — pipeline IDs (BAB, saves, combat stats), alignments,
 *                         rule bounds, resource pool IDs
 *
 * Import from this barrel to access all constants without path changes.
 */

export * from './abilityConstants';
export * from './itemConstants';
export * from './ruleConstants';
