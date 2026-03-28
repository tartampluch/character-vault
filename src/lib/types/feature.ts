/**
 * @file feature.ts
 * @description Barrel re-export for the Feature type system.
 *
 * Sub-modules:
 *   feature-base.ts  — FeatureCategory, MergeStrategy, FeatureChoice,
 *                      LevelProgressionEntry, ResourcePoolTemplate,
 *                      ActivationTier, Feature
 *   feature-items.ts — OnCritDiceSpec, ItemFeature, PsionicItemType, PowerStoneEntry
 *   feature-magic.ts — PsionicDiscipline, PsionicDisplay, AugmentationRule, MagicFeature
 *
 * Import from this barrel to access all feature types without path changes.
 */

export * from './feature-base';
export * from './feature-items';
export * from './feature-magic';
