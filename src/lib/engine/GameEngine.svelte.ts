/**
 * @file GameEngine.svelte.ts
 * @description The central reactive engine — the "brain" of the VTT application.
 *
 * Design philosophy:
 *   The GameEngine is a SVELTE 5 CLASS using the Runes API ($state, $derived).
 *   It is the single source of truth for the entire application state:
 *     - The active character being displayed/edited
 *     - The campaign settings (house rules, enabled sources, language)
 *     - All derived statistics (computed from character data via the DAG)
 *
 *   WHY A CLASS (not a store)?
 *   Svelte 5 allows $state and $derived to live inside class instances. This gives us:
 *     1. Encapsulation: engine state/methods are co-located and type-safe.
 *     2. Testability: the engine can be instantiated in tests without the DOM.
 *     3. Multiple instances: theoretically instantiate one engine per active character
 *        (useful for the GM Dashboard showing multiple character previews simultaneously).
 *
 *   THE DAG (Directed Acyclic Graph) ARCHITECTURE:
 *   The GameEngine implements a STRICTLY SEQUENTIAL computation graph.
 *   Each phase only reads from the outputs of PREVIOUS phases, ensuring no cycles.
 *
 *   PHASE ORDER (Phase 3.1 initialises the skeleton; 3.2-3.4 add the derived computations):
 *     Phase 0: Feature Flattening  → flatModifiers[]   (from activeFeatures + gmOverrides)
 *     Phase 1: Base & Size         → size, encumbrance
 *     Phase 2: Main Attributes     → STR, DEX, CON, INT, WIS, CHA
 *     Phase 3: Combat Statistics   → AC, BAB, Saves, MaxHP
 *     Phase 4: Skills & Abilities  → all skill pipelines
 *
 *   THIS FILE (Phase 3.1) initialises:
 *     - $state for all mutable data (character, settings)
 *     - Helper methods (t, formatDistance, formatWeight)
 *     - A minimal character factory for initial/empty state
 *   The $derived computations (Phases 0-4) are added in Phase 3.2-3.4.
 *
 * @see src/lib/types/character.ts  for Character, ActiveFeatureInstance
 * @see src/lib/types/settings.ts   for CampaignSettings
 * @see src/lib/utils/formatters.ts for t(), formatDistance(), formatWeight()
 */

import { createDefaultCampaignSettings } from '../types/settings';
import { t as translateString, formatDistance as fmtDistance, formatWeight as fmtWeight } from '../utils/formatters';
import type { Character, ActiveFeatureInstance } from '../types/character';
import type { CampaignSettings } from '../types/settings';
import type { LocalizedString, SupportedLanguage } from '../types/i18n';
import type { StatisticPipeline, SkillPipeline, ResourcePool } from '../types/pipeline';
import type { ID } from '../types/primitives';

// =============================================================================
// EMPTY CHARACTER FACTORY
// =============================================================================

/**
 * Creates a blank, empty character with default pipeline structures.
 *
 * WHY A FACTORY FUNCTION?
 *   Avoids the need to check for null/undefined on every pipeline access.
 *   The engine can always safely read `character.attributes["stat_str"]` because
 *   the factory pre-initialises all standard pipelines with their default values.
 *
 * STANDARD ATTRIBUTE IDs:
 *   Following D&D 3.5 SRD naming convention with the "stat_" prefix:
 *   stat_str, stat_dex, stat_con, stat_int, stat_wis, stat_cha
 *
 * STANDARD COMBAT STAT IDs (using period notation for namespacing):
 *   combatStats.ac_normal, combatStats.ac_touch, combatStats.ac_flat_footed
 *   combatStats.bab, combatStats.init, combatStats.grapple
 *   combatStats.speed_land, combatStats.speed_burrow, combatStats.speed_climb
 *   combatStats.speed_fly, combatStats.speed_swim
 *
 * STANDARD SAVE IDs:
 *   saves.fort, saves.ref, saves.will
 *
 * @param id   - Unique character ID (UUID).
 * @param name - Character display name.
 * @returns A blank Character with all standard pipelines initialised to base values.
 */
export function createEmptyCharacter(id: ID, name: string): Character {
  // Helper to create a blank StatisticPipeline with sensible defaults
  const makePipeline = (pipelineId: ID, label: LocalizedString, baseValue = 0): StatisticPipeline => ({
    id: pipelineId,
    label,
    baseValue,
    activeModifiers: [],
    situationalModifiers: [],
    totalBonus: 0,
    totalValue: baseValue,
    derivedModifier: 0,
  });

  // Helper to create a blank SkillPipeline
  const makeSkillPipeline = (pipelineId: ID, label: LocalizedString, keyAbility: ID): SkillPipeline => ({
    id: pipelineId,
    label,
    baseValue: 0,
    keyAbility,
    ranks: 0,
    isClassSkill: false,
    appliesArmorCheckPenalty: false,
    canBeUsedUntrained: true,
    activeModifiers: [],
    situationalModifiers: [],
    totalBonus: 0,
    totalValue: 0,
    derivedModifier: 0,
  });

  // Helper to create a blank ResourcePool
  const makeResource = (resourceId: ID, label: LocalizedString, maxPipelineId: ID): ResourcePool => ({
    id: resourceId,
    label,
    maxPipelineId,
    currentValue: 0,
    temporaryValue: 0,
    resetCondition: 'long_rest',
  });

  return {
    id,
    name,
    // Campaign metadata
    isNPC: false,
    // Multiclassing (empty — no class levels at creation)
    classLevels: {},
    // 6 Main ability score pipelines (base 10 = neutral start)
    attributes: {
      'stat_str': makePipeline('stat_str', { en: 'Strength', fr: 'Force' }, 10),
      'stat_dex': makePipeline('stat_dex', { en: 'Dexterity', fr: 'Dextérité' }, 10),
      'stat_con': makePipeline('stat_con', { en: 'Constitution', fr: 'Constitution' }, 10),
      'stat_int': makePipeline('stat_int', { en: 'Intelligence', fr: 'Intelligence' }, 10),
      'stat_wis': makePipeline('stat_wis', { en: 'Wisdom', fr: 'Sagesse' }, 10),
      'stat_cha': makePipeline('stat_cha', { en: 'Charisma', fr: 'Charisme' }, 10),
      // Size category pipeline (0 = Medium; modifiers adjust for Small, Large, etc.)
      'stat_size': makePipeline('stat_size', { en: 'Size', fr: 'Taille' }, 0),
      // Caster and manifester level (used by spell formula resolution)
      'stat_caster_level': makePipeline('stat_caster_level', { en: 'Caster Level', fr: 'Niveau de lanceur' }, 0),
      'stat_manifester_level': makePipeline('stat_manifester_level', { en: 'Manifester Level', fr: 'Niveau de manifesteur' }, 0),
    },
    // Core combat stat pipelines
    combatStats: {
      'combatStats.ac_normal': makePipeline('combatStats.ac_normal', { en: 'Armor Class', fr: 'Classe d\'armure' }, 10),
      'combatStats.ac_touch': makePipeline('combatStats.ac_touch', { en: 'Touch AC', fr: 'CA de contact' }, 10),
      'combatStats.ac_flat_footed': makePipeline('combatStats.ac_flat_footed', { en: 'Flat-Footed AC', fr: 'CA pris au dépourvu' }, 10),
      'combatStats.bab': makePipeline('combatStats.bab', { en: 'Base Attack Bonus', fr: 'Bonus d\'attaque de base' }, 0),
      'combatStats.init': makePipeline('combatStats.init', { en: 'Initiative', fr: 'Initiative' }, 0),
      'combatStats.grapple': makePipeline('combatStats.grapple', { en: 'Grapple', fr: 'Lutte' }, 0),
      // Movement speeds in feet (standard 30 ft land speed as default)
      'combatStats.speed_land': makePipeline('combatStats.speed_land', { en: 'Land Speed', fr: 'Vitesse terrestre' }, 30),
      'combatStats.speed_burrow': makePipeline('combatStats.speed_burrow', { en: 'Burrow Speed', fr: 'Vitesse de fouissement' }, 0),
      'combatStats.speed_climb': makePipeline('combatStats.speed_climb', { en: 'Climb Speed', fr: 'Vitesse d\'escalade' }, 0),
      'combatStats.speed_fly': makePipeline('combatStats.speed_fly', { en: 'Fly Speed', fr: 'Vitesse de vol' }, 0),
      'combatStats.speed_swim': makePipeline('combatStats.speed_swim', { en: 'Swim Speed', fr: 'Vitesse de nage' }, 0),
      // Armour check penalty pipeline (negative value; injected into affected skills)
      'combatStats.armor_check_penalty': makePipeline('combatStats.armor_check_penalty', { en: 'Armor Check Penalty', fr: 'Malus d\'armure aux tests' }, 0),
      // Max HP pipeline (computed from hit dice + CON mod × level)
      'combatStats.max_hp': makePipeline('combatStats.max_hp', { en: 'Max Hit Points', fr: 'Points de vie maximum' }, 0),
    },
    // Saving throw pipelines (all start at 0 — built up from class levelProgression)
    saves: {
      'saves.fort': makePipeline('saves.fort', { en: 'Fortitude', fr: 'Vigueur' }, 0),
      'saves.ref': makePipeline('saves.ref', { en: 'Reflex', fr: 'Réflexes' }, 0),
      'saves.will': makePipeline('saves.will', { en: 'Will', fr: 'Volonté' }, 0),
    },
    // Skill pipelines (empty by default — populated by DataLoader from config tables)
    skills: {},
    // Resource pools
    resources: {
      'resources.hp': makeResource('resources.hp', { en: 'Hit Points', fr: 'Points de vie' }, 'combatStats.max_hp'),
    },
    activeFeatures: [],
    linkedEntities: [],
  };
}

// =============================================================================
// GAME ENGINE CLASS
// =============================================================================

/**
 * The central reactive engine for the VTT application.
 *
 * SVELTE 5 RUNES USAGE:
 *   - `$state`: for mutable data that triggers reactive updates when changed.
 *   - `$derived`: for computed values that automatically re-evaluate when their
 *     dependencies change. The DAG is built from a chain of $derived values.
 *
 * SINGLETON PATTERN:
 *   Exported as a single instance at the bottom of this file (`export const engine`).
 *   All Svelte components import and use this shared instance.
 *   For testing, a new instance can be created: `new GameEngine()`.
 *
 * INITIALIZATION:
 *   The engine starts with a default CampaignSettings and a blank character.
 *   The StorageManager (Phase 4.1) loads persisted data and calls `loadCharacter()`.
 *
 * PHASE 3.1 SCOPE (THIS FILE):
 *   Initialises $state and helper methods only.
 *   The $derived DAG computations are added in follow-up phases (3.2, 3.3, 3.4).
 */
export class GameEngine {
  // ---------------------------------------------------------------------------
  // MUTABLE STATE ($state)
  // The engine's reactive state. Any change triggers dependent $derived to re-evaluate.
  // ---------------------------------------------------------------------------

  /**
   * The active campaign settings.
   * Changes here (language, house rules, enabled sources) immediately cascade
   * through all $derived computations via Svelte 5's reactivity graph.
   *
   * Initialised with sensible defaults (English, 25pt buy, no house rules).
   * Updated by:
   *   - GM via the Settings page (Phase 15.1)
   *   - StorageManager.load() at startup (Phase 4.1)
   */
  settings = $state<CampaignSettings>(createDefaultCampaignSettings());

  /**
   * The currently active (displayed/edited) character.
   *
   * When this reference changes (different character loaded), ALL $derived
   * computations re-evaluate completely, rebuilding the entire character sheet.
   *
   * When a field inside this object changes (e.g., an attribute's baseValue),
   * only the $derived computations that depend on that specific field re-evaluate.
   * Svelte 5's fine-grained reactivity handles this automatically.
   *
   * Initialised to a blank character; replaced by StorageManager (Phase 4.1).
   */
  character = $state<Character>(createEmptyCharacter('default', 'New Character'));

  /**
   * The ID of the currently active character (for URL-based routing).
   * Used by the StorageManager to know which character to save/load.
   * Separated from `character.id` to allow "loading" state while the character
   * data is being fetched.
   */
  activeCharacterId = $state<ID | null>(null);

  /**
   * Global loading indicator.
   * Set to `true` when fetching character data from storage/API.
   * UI components use this to show loading states.
   */
  isLoading = $state<boolean>(false);

  /**
   * Global error state.
   * Set when the StorageManager encounters a load/save error.
   * Displayed as a toast or banner in the UI.
   */
  lastError = $state<string | null>(null);

  // ---------------------------------------------------------------------------
  // LANGUAGE SHORTCUT
  // ---------------------------------------------------------------------------

  /**
   * The active display language (shortcut to avoid `this.settings.language` everywhere).
   * Derived from settings so it stays in sync.
   * Components can also read `engine.settings.language` directly — this is equivalent.
   */
  get lang(): SupportedLanguage {
    return this.settings.language;
  }

  // ---------------------------------------------------------------------------
  // LOCALISATION HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Translates a `LocalizedString` (or plain string) to the active language.
   *
   * This is the primary localisation helper used throughout all components and
   * computed properties. Example:
   *   `engine.t(feature.label)` → "Strength" (en) or "Force" (fr)
   *
   * Falls back gracefully: requested language → English → first available → "??".
   *
   * @param textObj - A LocalizedString record or a plain string (returned as-is).
   * @returns The localised string.
   */
  t(textObj: LocalizedString | string): string {
    return translateString(textObj, this.settings.language);
  }

  /**
   * Converts a distance in feet to the locale-appropriate display string.
   *
   * All distances in the engine are stored in feet (the SRD reference unit).
   * This method converts to metres for French and displays with the appropriate unit suffix.
   *
   * @param feet - Distance in feet.
   * @returns Formatted string: "30 ft." (en) or "9 m" (fr).
   */
  formatDistance(feet: number): string {
    return fmtDistance(feet, this.settings.language);
  }

  /**
   * Converts a weight in pounds to the locale-appropriate display string.
   *
   * @param lbs - Weight in pounds.
   * @returns Formatted string: "10 lb." (en) or "5 kg" (fr).
   */
  formatWeight(lbs: number): string {
    return fmtWeight(lbs, this.settings.language);
  }

  // ---------------------------------------------------------------------------
  // CHARACTER MANAGEMENT
  // ---------------------------------------------------------------------------

  /**
   * Loads a character into the engine as the active character.
   *
   * Called by the StorageManager (Phase 4.1) after loading from localStorage/API.
   * Replaces the entire `character` $state object, triggering a full DAG re-evaluation.
   *
   * @param char - The full Character object to activate.
   */
  loadCharacter(char: Character): void {
    this.character = char;
    this.activeCharacterId = char.id;
  }

  /**
   * Creates and activates a new blank character with the given ID and name.
   *
   * Used by the Character Vault "Create New" button (Phase 7.4).
   *
   * @param id   - Unique character ID (UUID).
   * @param name - Character display name.
   */
  createNewCharacter(id: ID, name: string): void {
    this.character = createEmptyCharacter(id, name);
    this.activeCharacterId = id;
  }

  /**
   * Updates the character's display name.
   * Triggers the StorageManager auto-save via $effect.
   *
   * @param name - The new name.
   */
  setCharacterName(name: string): void {
    this.character.name = name;
  }

  /**
   * Sets the base value of a specific attribute pipeline.
   * This is the primary way to change ability scores during character creation.
   *
   * When called, the `character.attributes[pipelineId].baseValue` $state updates,
   * which causes all $derived DAG phases that depend on this attribute to re-evaluate,
   * cascading through STR → BAB, CON → Saves and Max HP, etc.
   *
   * @param pipelineId - The attribute ID (e.g., "stat_str").
   * @param baseValue  - The new base score value.
   */
  setAttributeBase(pipelineId: ID, baseValue: number): void {
    if (this.character.attributes[pipelineId]) {
      this.character.attributes[pipelineId].baseValue = baseValue;
    } else {
      console.warn(`[GameEngine] setAttributeBase: pipeline "${pipelineId}" not found on character.`);
    }
  }

  /**
   * Sets the invested ranks for a specific skill pipeline.
   * Triggers re-evaluation of the skill's total value and any synergy bonuses.
   *
   * @param skillId - The skill ID (e.g., "skill_climb").
   * @param ranks   - The new rank count (must be validated against max ranks by caller).
   */
  setSkillRanks(skillId: ID, ranks: number): void {
    if (this.character.skills[skillId]) {
      this.character.skills[skillId].ranks = ranks;
    } else {
      console.warn(`[GameEngine] setSkillRanks: skill "${skillId}" not found on character.`);
    }
  }

  /**
   * Updates the current HP of the character's HP resource pool.
   * Called by the Health panel "Heal" and "Damage" buttons (Phase 10.1).
   *
   * DAMAGE RULE: Damage depletes temporary HP first, then current HP.
   *
   * @param delta - Positive = healing, Negative = damage.
   */
  adjustHP(delta: number): void {
    const hp = this.character.resources['resources.hp'];
    if (!hp) return;

    if (delta < 0) {
      // Damage: deplete temporary HP first
      const damage = Math.abs(delta);
      const tempAbsorbed = Math.min(hp.temporaryValue, damage);
      hp.temporaryValue -= tempAbsorbed;
      hp.currentValue -= (damage - tempAbsorbed);
    } else {
      // Healing: restore current HP (cannot exceed max, enforced by UI)
      hp.currentValue += delta;
    }
  }

  /**
   * Sets temporary HP, replacing old temporary HP only if the new value is higher.
   * (SRD rule: temporary HP does not stack — take the larger value.)
   *
   * @param amount - The temporary HP amount.
   */
  setTemporaryHP(amount: number): void {
    const hp = this.character.resources['resources.hp'];
    if (!hp) return;
    hp.temporaryValue = Math.max(hp.temporaryValue, amount);
  }

  /**
   * Activates or deactivates an `ActiveFeatureInstance` by its instanceId.
   * Used for toggling buffs like Rage, or equipment equip/unequip.
   *
   * @param instanceId - The feature instance to toggle.
   * @param isActive   - The new active state.
   */
  setFeatureActive(instanceId: ID, isActive: boolean): void {
    const instance = this.character.activeFeatures.find(f => f.instanceId === instanceId);
    if (instance) {
      instance.isActive = isActive;
    } else {
      console.warn(`[GameEngine] setFeatureActive: instance "${instanceId}" not found.`);
    }
  }

  /**
   * Adds a new `ActiveFeatureInstance` to the character's active features list.
   * Used when activating a feat, equipping an item, or applying a condition.
   *
   * @param instance - The feature instance to add.
   */
  addFeature(instance: ActiveFeatureInstance): void {
    // Prevent duplicate instanceIds
    if (this.character.activeFeatures.some(f => f.instanceId === instance.instanceId)) {
      console.warn(`[GameEngine] addFeature: instance "${instance.instanceId}" already exists.`);
      return;
    }
    this.character.activeFeatures.push(instance);
  }

  /**
   * Removes an `ActiveFeatureInstance` from the character by instanceId.
   * Used when deselecting a feat, removing a condition, or unequipping and discarding an item.
   *
   * @param instanceId - The instanceId of the feature to remove.
   */
  removeFeature(instanceId: ID): void {
    const index = this.character.activeFeatures.findIndex(f => f.instanceId === instanceId);
    if (index !== -1) {
      this.character.activeFeatures.splice(index, 1);
    } else {
      console.warn(`[GameEngine] removeFeature: instance "${instanceId}" not found.`);
    }
  }

  /**
   * Updates campaign settings. Triggers a full reactive re-evaluation if
   * settings that affect computation (like language or house rules) change.
   *
   * @param newSettings - Partial settings object with fields to update.
   */
  updateSettings(newSettings: Partial<CampaignSettings>): void {
    Object.assign(this.settings, newSettings);
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

/**
 * The single shared GameEngine instance used across the entire application.
 *
 * Import pattern in Svelte components:
 *   ```svelte
 *   <script>
 *     import { engine } from '$lib/engine/GameEngine.svelte';
 *     // Now use engine.character, engine.t(), etc.
 *   </script>
 *   ```
 *
 * In tests, create a fresh instance instead:
 *   ```typescript
 *   const engine = new GameEngine();
 *   ```
 */
export const engine = new GameEngine();
