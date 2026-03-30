/**
 * @file phase4Skills.ts
 * @description DAG Phase 4 — Skills, class skill detection, skill point budgeting, leveling journal.
 *
 * Extracted from GameEngine.svelte.ts phase4_* $derived properties.
 *
 * @see ARCHITECTURE.md §3.4 for Phase 4 specification.
 */

import type { ActiveFeatureInstance } from '../../types/character';
import type { StatisticPipeline, SkillPipeline, Modifier } from '../../types/pipeline';
import type { ID } from '../../types/primitives';
import type { LocalizedString } from '../../types/i18n';
import type { ModifierType } from '../../types/primitives';
import type { FlatModifierEntry, ClassSkillPointsEntry, SkillPointsBudget, LevelingJournal, LevelingJournalClassEntry } from '../../types/engine';
import { dataLoader } from '../DataLoader';
import { applyStackingRules } from '../../utils/stackingRules';
import { buildLocalizedString } from '../../i18n/ui-strings';
import { t as translateString } from '../../utils/formatters';
import { SYNERGY_SOURCE_LABEL_KEY } from '../../utils/constants';

// =============================================================================
// buildClassSkillSet — Phase 4
// =============================================================================

/**
 * Builds the set of all skill IDs that are class skills for this character.
 * Unions classSkills arrays from ALL active features (not just class features).
 */
export function buildClassSkillSet(
  activeFeatures: ActiveFeatureInstance[],
  gmOverrides: ActiveFeatureInstance[] | undefined,
  classLevels: Record<ID, number>
): ReadonlySet<ID> {
  const classSkillIds = new Set<ID>();
  const allInstances = [...activeFeatures, ...(gmOverrides ?? [])];

  for (const instance of allInstances) {
    if (!instance.isActive) continue;
    const feature = dataLoader.getFeature(instance.featureId);
    if (!feature || !feature.classSkills) continue;

    if (feature.category === 'class') {
      const classLevel = classLevels[feature.id] ?? 0;
      if (classLevel < 1) continue;
    }

    for (const skillId of feature.classSkills) {
      classSkillIds.add(skillId);
    }
  }

  return classSkillIds;
}

// =============================================================================
// buildSkillPointsBudget — Phase 4
// =============================================================================

/**
 * Computes the per-class skill point budget breakdown.
 *
 * @param flatModifiers  - Phase 0 flat modifier list.
 * @param classLevels    - Character class level map.
 * @param intModifier    - Current INT ability derivedModifier.
 * @param characterLevel - Total character level (sum of class levels).
 */
export function buildSkillPointsBudget(
  flatModifiers: FlatModifierEntry[],
  classLevels: Record<ID, number>,
  intModifier: number,
  characterLevel: number
): SkillPointsBudget {
  const firstClassId = Object.keys(classLevels)[0] as ID | undefined;
  const classEntries: ClassSkillPointsEntry[] = [];
  const processedClassSPSources = new Set<ID>();

  for (const entry of flatModifiers) {
    const mod = entry.modifier;
    if (mod.targetId !== 'attributes.skill_points_per_level') continue;
    if (mod.situationalContext) continue;

    const sourceId = mod.sourceId;
    if (processedClassSPSources.has(sourceId)) continue;

    const classLevel = classLevels[sourceId];
    if (classLevel === undefined || classLevel < 1) continue;

    processedClassSPSources.add(sourceId);

    const spPerLevel = typeof mod.value === 'number' ? mod.value : 0;
    const pointsPerLevel = Math.max(1, spPerLevel + intModifier);

    const isFirstClass = sourceId === firstClassId;
    const firstLevelBonus = isFirstClass ? 3 * pointsPerLevel : 0;
    const totalPoints = pointsPerLevel * classLevel + firstLevelBonus;

    const classFeature = dataLoader.getFeature(sourceId);
    const classLabel: LocalizedString = classFeature?.label ?? { en: sourceId };

    classEntries.push({
      classId: sourceId,
      classLabel,
      spPerLevel,
      classLevel,
      intModifier,
      pointsPerLevel,
      firstLevelBonus,
      totalPoints,
    });
  }

  let bonusSpPerLevel = 0;
  for (const entry of flatModifiers) {
    const mod = entry.modifier;
    if (mod.targetId !== 'attributes.bonus_skill_points_per_level') continue;
    if (mod.situationalContext) continue;
    bonusSpPerLevel += typeof mod.value === 'number' ? mod.value : 0;
  }

  for (const entry of flatModifiers) {
    const mod = entry.modifier;
    if (mod.targetId !== 'attributes.skill_points_per_level') continue;
    if (mod.situationalContext) continue;
    const sourceId = mod.sourceId;
    if (processedClassSPSources.has(sourceId)) continue;
    bonusSpPerLevel += typeof mod.value === 'number' ? mod.value : 0;
  }

  const totalClassPoints = classEntries.reduce((sum, e) => sum + e.totalPoints, 0);
  const totalBonusPoints = bonusSpPerLevel * characterLevel;

  return {
    perClassBreakdown: classEntries,
    bonusSpPerLevel,
    totalBonusPoints,
    totalClassPoints,
    totalAvailable: totalClassPoints + totalBonusPoints,
    intModifier,
  };
}

// =============================================================================
// buildLevelingJournal — Phase 4
// =============================================================================

/**
 * Builds the leveling journal with per-class contribution breakdowns.
 */
export function buildLevelingJournal(
  classLevels: Record<ID, number>,
  flatModifiers: FlatModifierEntry[],
  budget: SkillPointsBudget,
  characterLevel: number
): LevelingJournal {
  const classSPMap = new Map<ID, ClassSkillPointsEntry>(
    budget.perClassBreakdown.map(e => [e.classId, e])
  );

  const perClassBreakdown: LevelingJournalClassEntry[] = [];

  for (const [classId, classLevel] of Object.entries(classLevels)) {
    if (classLevel < 1) continue;

    const classFeature = dataLoader.getFeature(classId);
    const classLabel: LocalizedString = classFeature?.label ?? { en: classId };

    const sumMods = (targetId: string) =>
      flatModifiers
        .filter(e => e.modifier.sourceId === classId && e.modifier.targetId === targetId && e.modifier.type === 'base' && !e.modifier.situationalContext)
        .reduce((s, e) => s + (typeof e.modifier.value === 'number' ? e.modifier.value : 0), 0);

    const totalBab  = sumMods('combatStats.base_attack_bonus');
    const totalFort = sumMods('saves.fortitude');
    const totalRef  = sumMods('saves.reflex');
    const totalWill = sumMods('saves.will');

    const spEntry = classSPMap.get(classId);
    const totalSp          = spEntry?.totalPoints    ?? 0;
    const spPerLevel       = spEntry?.spPerLevel     ?? 0;
    const spPointsPerLevel = spEntry?.pointsPerLevel ?? 0;
    const firstLevelBonus  = spEntry?.firstLevelBonus ?? 0;

    const classSkills: ID[] = classFeature?.classSkills ?? [];
    const classSkillLabels = classSkills.map(skillId => {
      const skillDef = dataLoader.getFeature(skillId);
      return { id: skillId, label: skillDef?.label ?? ({ en: skillId } as LocalizedString) };
    });

    const grantedFeatureIds: string[] = [];
    if (classFeature?.levelProgression) {
      for (const entry of classFeature.levelProgression) {
        if (entry.level <= classLevel) {
          for (const fid of entry.grantedFeatures) {
            if (fid && !fid.startsWith('-') && !grantedFeatureIds.includes(fid)) {
              grantedFeatureIds.push(fid);
            }
          }
        }
      }
    }

    perClassBreakdown.push({
      classId, classLabel, classLevel,
      totalBab, totalFort, totalRef, totalWill,
      totalSp, spPerLevel, spPointsPerLevel, firstLevelBonus,
      classSkills, classSkillLabels, grantedFeatureIds,
    });
  }

  return {
    perClassBreakdown,
    totalBab:  perClassBreakdown.reduce((s, e) => s + e.totalBab,  0),
    totalFort: perClassBreakdown.reduce((s, e) => s + e.totalFort, 0),
    totalRef:  perClassBreakdown.reduce((s, e) => s + e.totalRef,  0),
    totalWill: perClassBreakdown.reduce((s, e) => s + e.totalWill, 0),
    totalSp:   perClassBreakdown.reduce((s, e) => s + e.totalSp,   0) + budget.totalBonusPoints,
    characterLevel,
  };
}

// =============================================================================
// computeMulticlassXpPenaltyRisk
// =============================================================================

/**
 * Returns true if the character is at risk of a multiclass XP penalty.
 * D&D 3.5 SRD: any non-favored class more than 1 level below the highest triggers a 20% XP penalty.
 */
export function computeMulticlassXpPenaltyRisk(
  classLevels: Record<ID, number>,
  favoredClass: string | undefined
): boolean {
  const entries = Object.entries(classLevels);
  if (entries.length <= 1) return false;

  const checkableEntries = favoredClass
    ? entries.filter(([id]) => id !== favoredClass)
    : entries;

  if (checkableEntries.length <= 1) return false;

  const max = Math.max(...checkableEntries.map(([, lvl]) => lvl));
  return checkableEntries.some(([, l]) => max - l > 1);
}

// =============================================================================
// buildSkillPipelines — Phase 4
// =============================================================================

/**
 * Resolves all skill pipelines with class skill detection, synergy bonuses, and armor check penalty.
 */
export function buildSkillPipelines(
  characterSkills: Record<ID, SkillPipeline>,
  flatModifiers: FlatModifierEntry[],
  attributes: Record<ID, StatisticPipeline>,
  classSkillSet: ReadonlySet<ID>,
  armorCheckPenalty: number
): Record<ID, SkillPipeline> {
  const result: Record<ID, SkillPipeline> = {};

  // Build synergy modifiers map
  const synergyTable = dataLoader.getConfigTable('config_skill_synergies');
  const synergyMods = new Map<string, Modifier[]>();

  const synergyTableAny = synergyTable as unknown as Record<string, unknown>;
  if (synergyTable?.data && Array.isArray(synergyTable.data)) {
    const requiredRanks = typeof synergyTableAny['requiredRanks'] === 'number' ? synergyTableAny['requiredRanks'] as number : 5;
    const bonusValue = typeof synergyTableAny['bonusValue'] === 'number' ? synergyTableAny['bonusValue'] as number : 2;
    const bonusType = (typeof synergyTableAny['bonusType'] === 'string' ? synergyTableAny['bonusType'] as string : 'synergy') as ModifierType;

    for (const row of synergyTable.data as Array<Record<string, unknown>>) {
      const sourceSkill = row['sourceSkill'] as string;
      const targetSkill = row['targetSkill'] as string;
      const conditionStr = row['condition'] as string | undefined;

      const sourceRanks = characterSkills[sourceSkill]?.ranks ?? 0;
      if (sourceRanks >= requiredRanks) {
        const sourceSkillFeature = dataLoader.getFeature(sourceSkill);
        const sourceLabel: LocalizedString = sourceSkillFeature?.label ?? { en: sourceSkill };

        const synergyLabel = buildLocalizedString(SYNERGY_SOURCE_LABEL_KEY);
        const synergyMod: Modifier = {
          id: `synergy_${sourceSkill}_to_${targetSkill}`,
          sourceId: sourceSkill,
          sourceName: Object.fromEntries(
            Object.keys(synergyLabel).map(lang => [
              lang,
              `${synergyLabel[lang]} (${translateString(sourceLabel, lang)})`,
            ])
          ) as LocalizedString,
          targetId: targetSkill,
          value: bonusValue,
          type: bonusType,
          situationalContext: conditionStr ? `synergy_${conditionStr}` : undefined,
        };

        if (!synergyMods.has(targetSkill)) synergyMods.set(targetSkill, []);
        synergyMods.get(targetSkill)!.push(synergyMod);
      }
    }
  }

  for (const [skillId, baseSkill] of Object.entries(characterSkills)) {
    // Skip skills that were stored from the API as bare `{ranks: N}` objects and
    // have not yet been seeded by the skill-seeding effect (label is undefined).
    // They will be included once the effect runs and character.skills is updated.
    if (!baseSkill.label) continue;

    const isClassSkill = classSkillSet.has(skillId);
    const keyAbilityMod = attributes[baseSkill.keyAbility]?.derivedModifier ?? 0;

    const featureActiveMods = flatModifiers
      .filter(e => e.modifier.targetId === skillId && !e.modifier.situationalContext)
      .map(e => e.modifier);

    const featureSituationalMods = flatModifiers
      .filter(e => e.modifier.targetId === skillId && e.modifier.situationalContext)
      .map(e => e.modifier);

    const skillSynergyMods = synergyMods.get(skillId) ?? [];
    const activeSynergyMods = skillSynergyMods.filter(m => !m.situationalContext);
    const situationalSynergyMods = skillSynergyMods.filter(m => m.situationalContext);

    const allActiveMods = [...featureActiveMods, ...activeSynergyMods];
    const allSituationalMods = [...featureSituationalMods, ...situationalSynergyMods];

    const stacking = applyStackingRules(allActiveMods, 0);
    const totalValue = baseSkill.ranks + keyAbilityMod + stacking.totalBonus
      + (baseSkill.appliesArmorCheckPenalty ? armorCheckPenalty : 0);

    result[skillId] = {
      ...baseSkill,
      isClassSkill,
      costPerRank: (isClassSkill ? 1 : 2) as 1 | 2,
      activeModifiers: stacking.appliedModifiers,
      situationalModifiers: allSituationalMods,
      totalBonus: stacking.totalBonus,
      totalValue,
      derivedModifier: 0,
    };
  }

  return result;
}
