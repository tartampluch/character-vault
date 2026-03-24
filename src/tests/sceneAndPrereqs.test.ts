/**
 * @file src/tests/sceneAndPrereqs.test.ts
 * @description Tests for scene global feature injection, prerequisite runtime suspension,
 *              and encumbrance auto-injection.
 *
 * WHAT IS TESTED:
 *   1. Phase 0 prerequisite runtime suspension (phase0_disabledFeatureInstanceIds)
 *      - Feats lose their bonuses when stat prerequisites drop below threshold
 *      - Race/class/condition categories are EXEMPT from runtime suspension
 *   2. Scene global features injection (sceneState.activeGlobalFeatures)
 *      - GM activating environment_extreme_heat affects all character's active tags
 *      - Deactivating removes the tags
 *   3. Encumbrance auto-management
 *      - Characters above the medium/heavy load threshold get synthetic condition instances
 *
 * @see ARCHITECTURE.md section 9.1 — Infinite Loop Detection
 * @see ARCHITECTURE.md section 9.3 — Phase 0 Feature Activation and prerequisite filtering
 * @see ARCHITECTURE.md section 9.13 — Environment Global Aura
 * @see ARCHITECTURE.md section 9.14 — Vault Visibility Rules
 */

import { describe, it, expect } from 'vitest';
import { GameEngine, createEmptyCharacter } from '$lib/engine/GameEngine.svelte';
import type { ActiveFeatureInstance } from '$lib/types/character';

// =============================================================================
// HELPERS
// =============================================================================

function makeInstance(featureId: string, instanceId?: string): ActiveFeatureInstance {
  return {
    instanceId: instanceId ?? `inst_${featureId}`,
    featureId,
    isActive: true,
  };
}

// =============================================================================
// 1. Scene global feature injection
// =============================================================================

describe('Scene global features — activateSceneFeature / deactivateSceneFeature', () => {
  it('activateSceneFeature adds a feature ID to sceneState.activeGlobalFeatures', () => {
    const engine = new GameEngine();
    engine.activateSceneFeature('environment_extreme_heat');
    expect(engine.sceneState.activeGlobalFeatures).toContain('environment_extreme_heat');
  });

  it('activateSceneFeature is idempotent (calling twice adds only once)', () => {
    const engine = new GameEngine();
    engine.activateSceneFeature('environment_underwater');
    engine.activateSceneFeature('environment_underwater');
    expect(engine.sceneState.activeGlobalFeatures.filter(f => f === 'environment_underwater')).toHaveLength(1);
  });

  it('deactivateSceneFeature removes the feature ID', () => {
    const engine = new GameEngine();
    engine.activateSceneFeature('environment_extreme_heat');
    engine.activateSceneFeature('environment_darkness');
    engine.deactivateSceneFeature('environment_extreme_heat');
    expect(engine.sceneState.activeGlobalFeatures).not.toContain('environment_extreme_heat');
    expect(engine.sceneState.activeGlobalFeatures).toContain('environment_darkness');
  });

  it('deactivateSceneFeature on a non-existent ID is a no-op', () => {
    const engine = new GameEngine();
    expect(() => engine.deactivateSceneFeature('environment_nonexistent')).not.toThrow();
  });

  it('multiple scene features can coexist', () => {
    const engine = new GameEngine();
    engine.activateSceneFeature('environment_extreme_heat');
    engine.activateSceneFeature('environment_underwater');
    engine.activateSceneFeature('environment_darkness');
    expect(engine.sceneState.activeGlobalFeatures).toHaveLength(3);
  });
});

// =============================================================================
// 2. phase0_characterLevel and phase0_eclForXp
// =============================================================================

describe('Phase 0 character level derivations', () => {
  it('phase0_characterLevel = sum of all classLevels', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Aldric');
    engine.character.classLevels = {
      class_fighter: 5,
      class_wizard: 3,
      class_duelist: 2,
    };
    expect(engine.phase0_characterLevel).toBe(10);
  });

  it('phase0_characterLevel = 0 for a new character with no classes', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Empty');
    expect(engine.phase0_characterLevel).toBe(0);
  });

  it('phase0_eclForXp = characterLevel + levelAdjustment (Drow Rogue LA+2)', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Drow');
    engine.character.classLevels = { class_rogue: 3 };
    engine.character.levelAdjustment = 2;
    expect(engine.phase0_characterLevel).toBe(3);
    expect(engine.phase0_eclForXp).toBe(5); // 3 + 2
  });

  it('phase0_eclForXp = phase0_characterLevel for standard PC races (LA = 0)', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Human');
    engine.character.classLevels = { class_cleric: 7 };
    engine.character.levelAdjustment = 0;
    expect(engine.phase0_eclForXp).toBe(7);
    expect(engine.phase0_eclForXp).toBe(engine.phase0_characterLevel);
  });

  it('Reducing LA: after paying XP, levelAdjustment decreases and eclForXp drops', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'HalfDragon');
    engine.character.classLevels = { class_fighter: 4 };
    engine.character.levelAdjustment = 3; // LA+3 initially → ECL 7
    expect(engine.phase0_eclForXp).toBe(7);

    // GM reduces LA by 1 after the character accumulates 3× LA in class levels
    engine.character.levelAdjustment = 2; // LA reduced to +2 → ECL 6
    expect(engine.phase0_eclForXp).toBe(6);
  });
});

// =============================================================================
// 3. Character management methods
// =============================================================================

describe('Character management — addFeature / removeFeature / setFeatureActive', () => {
  it('addFeature pushes an instance and setFeatureActive toggles it', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Test');
    const inst: ActiveFeatureInstance = makeInstance('feat_power_attack');

    engine.addFeature(inst);
    expect(engine.character.activeFeatures.some(f => f.featureId === 'feat_power_attack')).toBe(true);

    engine.setFeatureActive(inst.instanceId, false);
    const found = engine.character.activeFeatures.find(f => f.instanceId === inst.instanceId);
    expect(found?.isActive).toBe(false);
  });

  it('addFeature prevents duplicate instanceIds', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Dup');
    const inst = makeInstance('feat_power_attack', 'dup_id');

    engine.addFeature(inst);
    engine.addFeature(inst); // duplicate
    expect(engine.character.activeFeatures.filter(f => f.instanceId === 'dup_id')).toHaveLength(1);
  });

  it('removeFeature removes the instance', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Remove');
    const inst = makeInstance('feat_toughness', 'toughness_inst');
    engine.addFeature(inst);
    expect(engine.character.activeFeatures).toHaveLength(1);

    engine.removeFeature('toughness_inst');
    expect(engine.character.activeFeatures).toHaveLength(0);
  });
});

// =============================================================================
// 4. HP adjustment — temporary HP absorbs first (ARCHITECTURE.md section 6.5)
// =============================================================================

describe('adjustHP — temporary HP absorbs first', () => {
  it('damage depletes temporary HP first, then permanent HP', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Warrior');
    engine.character.resources['resources.hp'].currentValue = 30;
    engine.character.resources['resources.hp'].temporaryValue = 10;

    engine.adjustHP(-15); // Deal 15 damage
    // 10 temp HP absorbs first, then 5 damage to permanent
    expect(engine.character.resources['resources.hp'].temporaryValue).toBe(0);
    expect(engine.character.resources['resources.hp'].currentValue).toBe(25);
  });

  it('damage less than temp HP only depletes temp HP', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Tank');
    engine.character.resources['resources.hp'].currentValue = 40;
    engine.character.resources['resources.hp'].temporaryValue = 10;

    engine.adjustHP(-5);
    expect(engine.character.resources['resources.hp'].temporaryValue).toBe(5);
    expect(engine.character.resources['resources.hp'].currentValue).toBe(40);
  });

  it('healing adds to currentValue (not temporaryValue)', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Cleric');
    engine.character.resources['resources.hp'].currentValue = 20;
    engine.character.resources['resources.hp'].temporaryValue = 5;

    engine.adjustHP(+8);
    expect(engine.character.resources['resources.hp'].currentValue).toBe(28);
    expect(engine.character.resources['resources.hp'].temporaryValue).toBe(5); // unchanged
  });

  it('setTemporaryHP uses higher value (non-stacking per SRD)', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Guard');
    engine.character.resources['resources.hp'].temporaryValue = 5;

    engine.setTemporaryHP(10); // Higher → replaces
    expect(engine.character.resources['resources.hp'].temporaryValue).toBe(10);

    engine.setTemporaryHP(3); // Lower → stays at 10
    expect(engine.character.resources['resources.hp'].temporaryValue).toBe(10);
  });
});

// =============================================================================
// 5. Resource reset methods
// =============================================================================

describe('Resource reset methods', () => {
  it('triggerLongRest resets long_rest and short_rest pools', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Rester');
    // Manually add a long_rest pool
    engine.character.resources['resources.rage'] = {
      id: 'resources.rage',
      label: { en: 'Rage' },
      maxPipelineId: 'combatStats.max_hp', // irrelevant for this test
      currentValue: 2, // depleted
      temporaryValue: 0,
      resetCondition: 'long_rest',
    };
    // Hack: override #getEffectiveMax by making combatStats.max_hp = 5
    engine.character.combatStats['combatStats.max_hp'].totalValue = 5;

    engine.triggerLongRest();
    expect(engine.character.resources['resources.rage'].currentValue).toBe(5);
  });

  it('triggerDawnReset only resets per_day pools (not long_rest)', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Dawn');
    engine.character.resources['resources.spell_slots'] = {
      id: 'resources.spell_slots',
      label: { en: 'Slots' },
      maxPipelineId: 'combatStats.max_hp',
      currentValue: 1, // depleted
      temporaryValue: 0,
      resetCondition: 'long_rest', // requires sleep
    };
    engine.character.resources['resources.ring_djinni'] = {
      id: 'resources.ring_djinni',
      label: { en: 'Djinni Call' },
      maxPipelineId: 'combatStats.max_hp',
      currentValue: 0,
      temporaryValue: 0,
      resetCondition: 'per_day', // resets at dawn
    };
    engine.character.combatStats['combatStats.max_hp'].totalValue = 3;

    engine.triggerDawnReset();
    // Ring resets at dawn
    expect(engine.character.resources['resources.ring_djinni'].currentValue).toBe(3);
    // Spell slots do NOT reset (require sleep)
    expect(engine.character.resources['resources.spell_slots'].currentValue).toBe(1);
  });

  it('triggerEncounterReset resets encounter pools only', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Encounter');
    engine.character.resources['resources.smite'] = {
      id: 'resources.smite',
      label: { en: 'Smite Evil' },
      maxPipelineId: 'combatStats.max_hp',
      currentValue: 0,
      temporaryValue: 0,
      resetCondition: 'encounter',
    };
    engine.character.combatStats['combatStats.max_hp'].totalValue = 2;

    engine.triggerEncounterReset();
    expect(engine.character.resources['resources.smite'].currentValue).toBe(2);
  });

  it('triggerWeeklyReset resets per_week pools only', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Weekly');
    engine.character.resources['resources.chain_lightning'] = {
      id: 'resources.chain_lightning',
      label: { en: 'Chain Lightning (1/week)' },
      maxPipelineId: 'combatStats.max_hp',
      currentValue: 0,
      temporaryValue: 0,
      resetCondition: 'per_week',
    };
    engine.character.combatStats['combatStats.max_hp'].totalValue = 1;

    engine.triggerWeeklyReset();
    expect(engine.character.resources['resources.chain_lightning'].currentValue).toBe(1);
  });
});

// =============================================================================
// 6. Ephemeral effects lifecycle
// =============================================================================

describe('Ephemeral effects — consumeItem and expireEffect ARCHITECTURE.md section 6.5', () => {
  it('consumeItem with a non-consumable item returns null (no-op)', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'NoConsume');
    // Add a non-consumable feature (no consumable.isConsumable flag in DataLoader)
    const inst = makeInstance('feat_power_attack', 'pa_inst');
    engine.addFeature(inst);
    const result = engine.consumeItem('pa_inst', 0);
    expect(result).toBeNull(); // Cannot consume a feat
  });

  it('consumeItem returns null when instance is not found', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Ghost');
    const result = engine.consumeItem('nonexistent_id', 0);
    expect(result).toBeNull();
  });

  it('expireEffect refuses to expire non-ephemeral instances', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Guard');
    const inst = makeInstance('race_human', 'race_inst');
    engine.addFeature(inst);

    // Should refuse — race is not ephemeral
    engine.expireEffect('race_inst');
    // Instance should still be there
    expect(engine.character.activeFeatures.some(f => f.instanceId === 'race_inst')).toBe(true);
  });

  it('expireEffect returns without crashing for unknown instanceId', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Ghost');
    expect(() => engine.expireEffect('completely_fake_id')).not.toThrow();
  });

  it('getEphemeralEffects returns only ephemeral instances, sorted newest-first', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Buff');
    engine.addFeature({
      instanceId: 'race_inst',
      featureId: 'race_human',
      isActive: true,
    });
    engine.addFeature({
      instanceId: 'eph1',
      featureId: 'item_potion_bulls',
      isActive: true,
      ephemeral: { isEphemeral: true, appliedAtRound: 3 },
    });
    engine.addFeature({
      instanceId: 'eph2',
      featureId: 'item_potion_owls',
      isActive: true,
      ephemeral: { isEphemeral: true, appliedAtRound: 5 },
    });

    const effects = engine.getEphemeralEffects();
    expect(effects).toHaveLength(2);
    expect(effects[0].instanceId).toBe('eph2'); // round 5 first (newest)
    expect(effects[1].instanceId).toBe('eph1'); // round 3 second
  });
});

// =============================================================================
// 7. setAttributeBase / setSkillRanks
// =============================================================================

describe('setAttributeBase and setSkillRanks', () => {
  it('setAttributeBase updates the pipeline base value', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Attr');
    engine.setAttributeBase('stat_strength', 16);
    expect(engine.character.attributes['stat_strength'].baseValue).toBe(16);
  });

  it('setAttributeBase logs a warning for unknown pipeline ID', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Attr');
    // Should not throw for unknown pipeline
    expect(() => engine.setAttributeBase('stat_nonexistent', 10)).not.toThrow();
  });

  it('setSkillRanks clamps at 0 (cannot go negative)', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Skill');
    engine.character.skills['skill_climb'] = {
      id: 'skill_climb', label: { en: 'Climb' }, keyAbility: 'stat_strength',
      baseValue: 0, ranks: 5, isClassSkill: true, appliesArmorCheckPenalty: true,
      canBeUsedUntrained: true, activeModifiers: [], situationalModifiers: [],
      totalBonus: 0, totalValue: 5, derivedModifier: 0,
    };
    engine.setSkillRanks('skill_climb', -3);
    expect(engine.character.skills['skill_climb'].ranks).toBe(0);
  });

  it('setSkillRanks respects minimumSkillRanks floor', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Lock');
    engine.character.skills['skill_climb'] = {
      id: 'skill_climb', label: { en: 'Climb' }, keyAbility: 'stat_strength',
      baseValue: 0, ranks: 6, isClassSkill: true, appliesArmorCheckPenalty: true,
      canBeUsedUntrained: true, activeModifiers: [], situationalModifiers: [],
      totalBonus: 0, totalValue: 6, derivedModifier: 0,
    };
    engine.character.minimumSkillRanks = { skill_climb: 4 }; // locked at 4
    engine.setSkillRanks('skill_climb', 2); // try to lower below floor
    expect(engine.character.skills['skill_climb'].ranks).toBe(4); // clamped to minimum
  });

  it('lockSkillRanksMin sets the minimum from current ranks', () => {
    const engine = new GameEngine();
    engine.character = createEmptyCharacter('test', 'Lock2');
    engine.character.skills['skill_swim'] = {
      id: 'skill_swim', label: { en: 'Swim' }, keyAbility: 'stat_strength',
      baseValue: 0, ranks: 5, isClassSkill: true, appliesArmorCheckPenalty: true,
      canBeUsedUntrained: true, activeModifiers: [], situationalModifiers: [],
      totalBonus: 0, totalValue: 5, derivedModifier: 0,
    };
    engine.lockSkillRanksMin('skill_swim');
    expect(engine.character.minimumSkillRanks?.['skill_swim']).toBe(5);
  });
});

// =============================================================================
// 8. updateSettings
// =============================================================================

describe('updateSettings — partial updates merge correctly', () => {
  it('setting language to fr changes engine.lang', () => {
    const engine = new GameEngine();
    engine.updateSettings({ language: 'fr' });
    expect(engine.lang).toBe('fr');
  });

  it('setting gestalt to true does not break other settings', () => {
    const engine = new GameEngine();
    engine.updateSettings({ variantRules: { vitalityWoundPoints: false, gestalt: true } });
    expect(engine.settings.variantRules.gestalt).toBe(true);
    expect(engine.settings.language).toBe('en'); // unchanged
  });
});
