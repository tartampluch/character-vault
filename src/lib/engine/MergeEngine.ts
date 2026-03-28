/**
 * @file MergeEngine.ts
 * @description The Merge Engine — implements the Data Override System for JSON features.
 *
 * Extracted from DataLoader.ts. Handles partial feature merges for the homebrew
 * override system defined in ARCHITECTURE.md section 18.
 *
 * PARTIAL MERGE RULES:
 *   Arrays: new items APPENDED; items prefixed with "-" are REMOVED.
 *   levelProgression: merged by level — same level REPLACES, new levels ADDED.
 *   choices: merged by choiceId — same choiceId REPLACES; "-" prefix REMOVES.
 *   Scalars: overwritten only if defined in the partial entity.
 *   id, category: NOT modifiable (ignored if present in partial).
 *   prerequisitesNode: fully replaced if present.
 *
 * @see ARCHITECTURE.md §18 for data override engine specification.
 */

import type { MergeStrategy, LevelProgressionEntry, FeatureChoice } from '../types/feature';
import type { ID } from '../types/primitives';

// =============================================================================
// RAW JSON ENTITY — The raw parsed JSON before type narrowing
// =============================================================================

/**
 * Represents any entity parsed from a JSON rules file before being categorised.
 * The `tableId` field distinguishes config tables from feature entities.
 */
export interface RawEntity {
  // Feature fields
  id?: ID;
  category?: string;
  ruleSource?: ID;
  merge?: MergeStrategy;
  tags?: string[];
  grantedFeatures?: ID[];
  grantedModifiers?: unknown[];
  levelProgression?: LevelProgressionEntry[];
  choices?: FeatureChoice[];
  forbiddenTags?: string[];
  recommendedAttributes?: ID[];
  classSkills?: ID[];
  // Config table fields
  tableId?: string;
  data?: Record<string, unknown>[];
  // Any other fields (spread for flexible merging)
  [key: string]: unknown;
}

// =============================================================================
// MERGE ENGINE — Implementation
// =============================================================================

/**
 * Merges a partial Feature update into an existing Feature.
 *
 * @param existing - The base entity already in the cache.
 * @param partial  - The new partial entity to merge into the existing one.
 * @returns The merged entity.
 */
export function mergePartial(existing: RawEntity, partial: RawEntity): RawEntity {
  // Start with a shallow copy of the existing entity
  const result: RawEntity = { ...existing };

  for (const [key, partialValue] of Object.entries(partial)) {
    // Skip non-modifiable fields
    if (key === 'id' || key === 'category') continue;

    // Skip undefined/null values in the partial
    if (partialValue === undefined || partialValue === null) continue;

    // --- Special handling for levelProgression ---
    if (key === 'levelProgression' && Array.isArray(partialValue) && Array.isArray(existing.levelProgression)) {
      result.levelProgression = mergeLevelProgression(existing.levelProgression, partialValue);
      continue;
    }

    // --- Special handling for choices ---
    if (key === 'choices' && Array.isArray(partialValue) && Array.isArray(existing.choices)) {
      result.choices = mergeChoices(existing.choices as FeatureChoice[], partialValue as FeatureChoice[]);
      continue;
    }

    // --- Special handling for arrays with -prefix deletion ---
    if (Array.isArray(partialValue) && Array.isArray(existing[key])) {
      const existingArray = existing[key] as unknown[];
      result[key] = mergeArray(existingArray, partialValue);
      continue;
    }

    // --- Scalar fields: overwrite with partial value ---
    result[key] = partialValue;
  }

  return result;
}

/**
 * Merges two arrays with the -prefix deletion convention.
 * Items prefixed with "-" are removed from the existing array.
 * New items (not prefixed with "-") are appended.
 *
 * @param existing   - The existing array in the base entity.
 * @param partialArr - The new array from the partial entity.
 * @returns The merged array.
 */
export function mergeArray(existing: unknown[], partialArr: unknown[]): unknown[] {
  // Start with existing items
  let result = [...existing];

  for (const item of partialArr) {
    if (typeof item === 'string' && item.startsWith('-')) {
      // Remove the item (strip the "-" prefix to get the actual value)
      const targetValue = item.slice(1);
      result = result.filter(existingItem => existingItem !== targetValue);
    } else {
      // Append the new item (only if not already present)
      if (!result.includes(item)) {
        result.push(item);
      }
    }
  }

  return result;
}

/**
 * Merges level progression tables by level number.
 * Entries with the same level number from the partial REPLACE the existing entry.
 * New levels are ADDED.
 *
 * @param existing      - Existing levelProgression entries.
 * @param partialLevels - New levelProgression entries from the partial.
 * @returns Merged levelProgression array.
 */
export function mergeLevelProgression(
  existing: LevelProgressionEntry[],
  partialLevels: LevelProgressionEntry[]
): LevelProgressionEntry[] {
  // Build a map from level → entry for fast lookup
  const levelMap = new Map<number, LevelProgressionEntry>(
    existing.map(entry => [entry.level, entry])
  );

  // Apply partial levels (same level = replace, new level = add)
  for (const partialEntry of partialLevels) {
    levelMap.set(partialEntry.level, partialEntry);
  }

  // Convert map back to sorted array
  return Array.from(levelMap.values()).sort((a, b) => a.level - b.level);
}

/**
 * Merges feature choices by choiceId.
 * Choices with the same choiceId from the partial REPLACE the existing choice.
 * Choices with a "-" prefix in choiceId are REMOVED.
 * New choiceIds are ADDED.
 *
 * @param existing       - Existing FeatureChoice entries.
 * @param partialChoices - New FeatureChoice entries from the partial.
 * @returns Merged choices array.
 */
export function mergeChoices(existing: FeatureChoice[], partialChoices: FeatureChoice[]): FeatureChoice[] {
  // Build a map from choiceId → choice for fast lookup
  const choiceMap = new Map<string, FeatureChoice>(
    existing.map(choice => [choice.choiceId, choice])
  );

  for (const partialChoice of partialChoices) {
    if (partialChoice.choiceId.startsWith('-')) {
      // Remove the choice with the matching ID
      const targetId = partialChoice.choiceId.slice(1);
      choiceMap.delete(targetId);
    } else {
      // Replace or add the choice
      choiceMap.set(partialChoice.choiceId, partialChoice);
    }
  }

  return Array.from(choiceMap.values());
}
