/**
 * @file src/lib/utils/classProgressionPresets.ts
 * @description Standard D&D 3.5 SRD class progression preset arrays.
 *
 * Each export is an array of 20 increment values (index 0 = level 1) encoding
 * the per-level gain for BAB and saving-throw progressions.
 *
 * DERIVATION (ARCHITECTURE.md §5.4):
 *   Full BAB   : cumulative(n) = n              → always +1 per level
 *   3/4 BAB    : cumulative(n) = floor(3n/4)    → Rogue, Bard, Cleric
 *   1/2 BAB    : cumulative(n) = floor(n/2)     → Wizard, Sorcerer, Druid
 *   Good Save  : cumulative(n) = 2 + floor(n/2) → starts at +2, alternates +1/0
 *   Poor Save  : cumulative(n) = floor(n/3)     → gains roughly every 3 levels
 *
 * Extracted from src/lib/components/content-editor/LevelProgressionEditor.svelte
 * to satisfy the Critical Coding Guideline: no D&D game logic in .svelte files
 * (ARCHITECTURE.md §3).
 *
 * @see src/lib/components/content-editor/LevelProgressionEditor.svelte
 * @see ARCHITECTURE.md §5.4
 */

/**
 * Builds a 20-element increment array from a cumulative total function.
 * increment[i] = totalFn(i+1) − totalFn(i)
 *
 * @param totalFn - Maps level number (1-based) to cumulative total at that level.
 * @returns Array of 20 per-level increments (index 0 = level 1).
 */
function buildIncrements(totalFn: (n: number) => number): number[] {
  return Array.from({ length: 20 }, (_, i) => {
    const lvl = i + 1;
    return totalFn(lvl) - totalFn(lvl - 1);
  });
}

/** Full BAB (+1 every level): Fighter, Paladin, Ranger, Barbarian. */
export const BAB_FULL: readonly number[] = buildIncrements(n => n);

/** ¾ BAB (floor(3n/4)): Rogue, Bard, Cleric, Druid, Monk. */
export const BAB_3_4: readonly number[] = buildIncrements(n => Math.floor(n * 3 / 4));

/** ½ BAB (floor(n/2)): Wizard, Sorcerer, Psion, Wilder, and most spellcasters. */
export const BAB_1_2: readonly number[] = buildIncrements(n => Math.floor(n / 2));

/** Good save progression (2 + floor(n/2)): strong save category. */
export const SAVE_GOOD: readonly number[] = buildIncrements(n => 2 + Math.floor(n / 2));

/** Poor save progression (floor(n/3)): weak save category. */
export const SAVE_POOR: readonly number[] = buildIncrements(n => Math.floor(n / 3));
