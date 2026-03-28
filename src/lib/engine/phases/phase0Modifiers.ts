/**
 * @file phase0Modifiers.ts
 * @description DAG Phase 0 — Feature Flattening & Modifier Extraction.
 *
 * Pure functions extracted from GameEngine.svelte.ts. Accepts all inputs as
 * explicit parameters so they can be called from $derived.by() wrappers in the
 * engine without pulling reactive logic into this plain .ts file.
 *
 * @see GameEngine.svelte.ts — #phase0_result, phase0_activeTags, phase0_context
 * @see ARCHITECTURE.md §3.2 for the full DAG Phase 0 specification.
 */

import type { ActiveFeatureInstance } from '../../types/character';
import type { Feature } from '../../types/feature';
import type { Modifier } from '../../types/pipeline';
import type { ID } from '../../types/primitives';
import type { FlatModifierEntry } from '../../types/engine';
import type { CharacterContext } from '../../utils/mathParser';
import { MAX_RESOLUTION_DEPTH } from '../../types/engine';
import { dataLoader } from '../DataLoader';
import { checkCondition } from '../../utils/logicEvaluator';
import { evaluateFormula } from '../../utils/mathParser';
import { normaliseModifierTargetId } from '../CharacterFactory';

// =============================================================================
// computeActiveTags — DAG Phase 0b
// =============================================================================

/**
 * Computes the flat array of all active tags from all isActive features.
 *
 * Tags are deduplicated. All tags from ALL active features are included
 * (regardless of prerequisite status — this is the intentionally inclusive
 * list used for @activeTags path resolution).
 *
 * Includes scene global features and choice-derived sub-tags.
 */
export function computeActiveTags(
  activeFeatures: ActiveFeatureInstance[],
  gmOverrides: ActiveFeatureInstance[] | undefined,
  sceneActiveGlobalFeatures: string[]
): string[] {
  const tagSet = new Set<string>();

  const sceneInstances: ActiveFeatureInstance[] = sceneActiveGlobalFeatures.map(featureId => ({
    instanceId: `scene_global_${featureId}`,
    featureId,
    isActive: true,
  }));

  const allInstances = [
    ...activeFeatures,
    ...sceneInstances,
    ...(gmOverrides ?? []),
  ];

  for (const instance of allInstances) {
    if (!instance.isActive) continue;
    const feature = dataLoader.getFeature(instance.featureId);
    if (!feature) continue;

    // 1. Add the feature's own static tags
    for (const tag of feature.tags) {
      tagSet.add(tag);
    }

    // 2. Emit choice-derived sub-tags from choices with `choiceGrantedTagPrefix`.
    if (feature.choices && instance.selections) {
      for (const choice of feature.choices) {
        if (!choice.choiceGrantedTagPrefix) continue;
        const selected = instance.selections[choice.choiceId];
        if (!selected) continue;
        for (const selectedId of selected) {
          if (selectedId) {
            tagSet.add(`${choice.choiceGrantedTagPrefix}${selectedId}`);
          }
        }
      }
    }
  }

  return Array.from(tagSet);
}

// =============================================================================
// computePhase0Result — DAG Phase 0 flat modifier extraction
// =============================================================================

/**
 * Builds the flat list of all valid active modifiers from all active features.
 *
 * @param activeFeatures           - Character's own active feature instances.
 * @param gmOverrides              - GM per-character override instances (processed last).
 * @param sceneActiveGlobalFeatures - Active global feature IDs from scene state.
 * @param classLevels              - Character's class level map (for progression gating).
 * @param language                 - Active language (for formula string resolution).
 * @param activeTags               - Pre-computed active tags (from computeActiveTags).
 * @param context                  - Pre-computed character context snapshot.
 */
export function computePhase0Result(
  activeFeatures: ActiveFeatureInstance[],
  gmOverrides: ActiveFeatureInstance[] | undefined,
  sceneActiveGlobalFeatures: string[],
  classLevels: Record<ID, number>,
  language: string,
  activeTags: string[],
  context: CharacterContext
): { modifiers: FlatModifierEntry[]; disabledInstanceIds: Set<ID> } {
  const result: FlatModifierEntry[] = [];
  const disabledInstanceIds = new Set<ID>();

  const sceneInstances: ActiveFeatureInstance[] = sceneActiveGlobalFeatures.map(featureId => ({
    instanceId: `scene_global_${featureId}`,
    featureId,
    isActive: true,
  }));

  const allInstances: ActiveFeatureInstance[] = [
    ...activeFeatures,
    ...sceneInstances,
    ...(gmOverrides ?? []),
  ];

  const visitedFeatureIds = new Set<ID>();

  for (const instance of allInstances) {
    if (!instance.isActive) continue;
    collectModifiersFromInstance(
      instance, activeTags, context, classLevels, language,
      result, visitedFeatureIds, disabledInstanceIds, 0
    );
  }

  return { modifiers: result, disabledInstanceIds };
}

// =============================================================================
// Internal helpers
// =============================================================================

function collectModifiersFromInstance(
  instance: ActiveFeatureInstance,
  activeTags: string[],
  context: CharacterContext,
  classLevels: Record<ID, number>,
  language: string,
  result: FlatModifierEntry[],
  visitedFeatureIds: Set<ID>,
  disabledInstanceIds: Set<ID>,
  depth: number
): void {
  if (depth >= MAX_RESOLUTION_DEPTH) {
    console.warn(`[GameEngine] Phase 0: Max resolution depth (${MAX_RESOLUTION_DEPTH}) reached for feature "${instance.featureId}". Stopping recursion.`);
    return;
  }

  const feature = dataLoader.getFeature(instance.featureId);
  if (!feature) return;

  if (visitedFeatureIds.has(feature.id)) return;
  visitedFeatureIds.add(feature.id);

  // Check forbiddenTags
  if (feature.forbiddenTags && feature.forbiddenTags.some(tag => activeTags.includes(tag))) {
    return;
  }

  // Check prerequisitesNode at runtime (depth 0 only, non-structural categories)
  if (depth === 0 && feature.prerequisitesNode) {
    const exemptCategories = new Set(['race', 'class', 'class_feature', 'condition', 'environment', 'monster_type']);
    if (!exemptCategories.has(feature.category)) {
      const prereqContext: CharacterContext = { ...context, activeTags };
      if (!checkCondition(feature.prerequisitesNode, prereqContext)) {
        disabledInstanceIds.add(instance.instanceId);
        return;
      }
    }
  }

  // Collect base feature modifiers
  processModifierList(feature.grantedModifiers, instance, feature, activeTags, context, language, result);

  // Class level progression gating
  if (feature.category === 'class' && feature.levelProgression) {
    const classLevel = classLevels[feature.id] ?? 0;
    for (const entry of feature.levelProgression) {
      if (entry.level <= classLevel) {
        processModifierList(entry.grantedModifiers, instance, feature, activeTags, context, language, result);
      }
    }
  }

  // Recursively process granted features
  if (feature.grantedFeatures && feature.grantedFeatures.length > 0) {
    const grantedFeatureIds = new Set<ID>([...feature.grantedFeatures]);

    if (feature.category === 'class' && feature.levelProgression) {
      const classLevel = classLevels[feature.id] ?? 0;
      for (const entry of feature.levelProgression) {
        if (entry.level <= classLevel) {
          for (const gfId of entry.grantedFeatures) {
            grantedFeatureIds.add(gfId);
          }
        }
      }
    }

    for (const grantedFeatureId of grantedFeatureIds) {
      if (grantedFeatureId.startsWith('-')) continue;

      const syntheticInstance: ActiveFeatureInstance = {
        instanceId: `${instance.instanceId}_granted_${grantedFeatureId}`,
        featureId: grantedFeatureId,
        isActive: true,
        selections: instance.selections,
      };

      collectModifiersFromInstance(
        syntheticInstance, activeTags, context, classLevels, language,
        result, new Set(visitedFeatureIds), disabledInstanceIds, depth + 1
      );
    }
  }
}

function processModifierList(
  modifiers: Modifier[],
  instance: ActiveFeatureInstance,
  feature: Feature,
  activeTags: string[],
  context: CharacterContext,
  language: string,
  result: FlatModifierEntry[]
): void {
  const instanceContext: CharacterContext = {
    ...context,
    activeTags,
    selection: { ...context.selection, ...(instance.selections ?? {}) },
  };

  for (const mod of modifiers) {
    if (mod.conditionNode && !checkCondition(mod.conditionNode, instanceContext)) {
      continue;
    }

    const normalisedTargetId = normaliseModifierTargetId(mod.targetId);

    // saves.all fan-out
    if (normalisedTargetId === 'saves.all') {
      const saveTargets = ['saves.fortitude', 'saves.reflex', 'saves.will'] as const;
      for (const saveTarget of saveTargets) {
        const suffix = saveTarget.split('.')[1];
        let fanMod: Modifier = { ...mod, targetId: saveTarget, id: `${mod.id}_${suffix}` };
        if (typeof fanMod.value === 'string') {
          const resolved = evaluateFormula(fanMod.value, instanceContext, language);
          fanMod = { ...fanMod, value: typeof resolved === 'number' ? resolved : parseFloat(String(resolved)) || 0 };
        }
        result.push({ modifier: fanMod, sourceInstanceId: instance.instanceId, sourceFeatureId: feature.id });
      }
      continue;
    }

    let resolvedModifier: Modifier = normalisedTargetId !== mod.targetId
      ? { ...mod, targetId: normalisedTargetId }
      : mod;

    if (typeof mod.value === 'string') {
      const resolved = evaluateFormula(mod.value, instanceContext, language);
      const numericValue = typeof resolved === 'number' ? resolved : parseFloat(String(resolved)) || 0;
      resolvedModifier = { ...resolvedModifier, value: numericValue };
    }

    result.push({
      modifier: resolvedModifier,
      sourceInstanceId: instance.instanceId,
      sourceFeatureId: feature.id,
    });
  }
}
