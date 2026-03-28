<!--
  @file src/lib/components/content-editor/LevelProgressionEditor.svelte
  @description Editor for Feature.levelProgression (class entities only).

  ────────────────────────────────────────────────────────────────────────────
  PURPOSE
  ────────────────────────────────────────────────────────────────────────────
  Displayed only when ctx.feature.category === 'class', this component renders
  a 20-row progression table and lets GMs configure per-level grants:

    COLUMNS:
      Level       — read-only label (1–20)
      BAB         — base attack bonus increment (0 or 1 per D&D 3.5)
      Fort        — Fortitude save increment
      Ref         — Reflex save increment
      Will        — Will save increment
      Features    — feature ID chips; "+ Add" opens FeaturePickerModal
      Modifiers   — compact count badge; "Edit" opens LevelModifierModal

  The BAB and save columns are backed by base-type `Modifier` objects inside
  `LevelProgressionEntry.grantedModifiers`.  The human-readable 0/1 inputs
  are translated to/from those modifier objects by helper functions.

  ────────────────────────────────────────────────────────────────────────────
  PRESET FILL BUTTONS (ARCHITECTURE.md §5.4)
  ────────────────────────────────────────────────────────────────────────────
  Buttons above the table fill an entire column with a standard D&D 3.5 pattern:

  BAB presets:
    Full BAB    +1 every level        [1,1,1,1,1,…] (Fighter, Paladin, Ranger)
    3/4 BAB     floor(level × 3/4)    Rogue, Bard, Cleric
    1/2 BAB     floor(level / 2)      Wizard, Sorcerer, Druid (spellcasters)

  Save presets (per save column):
    Good Save   2 + floor(level / 2)  [2,1,0,1,0,…] (starting +2 at level 1)
    Poor Save   floor(level / 3)      [0,0,1,0,0,…]

  ────────────────────────────────────────────────────────────────────────────
  DATA MODEL
  ────────────────────────────────────────────────────────────────────────────
  ctx.feature.levelProgression?: LevelProgressionEntry[]

  The array may be sparse (class defined 10 levels instead of 20) or absent.
  The editor normalises it to a full 20-entry array for display; unused tail
  entries with no data are trimmed before saving to keep the JSON compact.

  Each LevelProgressionEntry.grantedModifiers contains:
    { targetId: 'combatStats.base_attack_bonus', type: 'base', value: 1 }  for the BAB incr.
    { targetId: 'saves.fortitude',      type: 'base', value: 1 }  for the Fort incr.
    etc.

  ────────────────────────────────────────────────────────────────────────────
  @see src/lib/types/feature.ts          for LevelProgressionEntry
  @see LevelModifierModal.svelte         for per-level modifier editing
  @see FeaturePickerModal.svelte         for per-level feature selection
  @see ARCHITECTURE.md §5.4             for preset progressions
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { dataLoader } from '$lib/engine/DataLoader';
  import type { LevelProgressionEntry } from '$lib/types/feature';
  import type { Modifier } from '$lib/types/pipeline';
  import type { ID } from '$lib/types/primitives';
  import FeaturePickerModal   from './FeaturePickerModal.svelte';
  import LevelModifierModal   from './LevelModifierModal.svelte';
  import {
    BAB_FULL,
    BAB_3_4,
    BAB_1_2,
    SAVE_GOOD,
    SAVE_POOR,
  } from '$lib/utils/classProgressionPresets';
  import {
    BAB_PIPELINE_ID,
    SAVE_FORT_PIPELINE_ID,
    SAVE_REFLEX_PIPELINE_ID,
    SAVE_WILL_PIPELINE_ID,
  } from '$lib/utils/constants';

  // ===========================================================================
  // CONTEXT
  // ===========================================================================

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);

  // ===========================================================================
  // PRESET PROGRESSIONS  (ARCHITECTURE.md §5.4)
  // ===========================================================================
  //
  // The 20-element increment arrays live in src/lib/utils/classProgressionPresets.ts
  // per the Critical Coding Guideline: no D&D game logic in .svelte files
  // (ARCHITECTURE.md §3).  They are imported above and used directly below.

  // ===========================================================================
  // LEVEL PROGRESSION NORMALISATION
  // ===========================================================================

  const MAX_LEVELS = 20;

  /**
   * Returns the 20-entry normalised array for display.
   * Missing entries are created as blank (no modifiers, no features).
   */
  const rows = $derived.by((): LevelProgressionEntry[] => {
    const existing = ctx.feature.levelProgression ?? [];
    return Array.from({ length: MAX_LEVELS }, (_, i) => {
      const lvl  = i + 1;
      const found = existing.find(e => e.level === lvl);
      return found ?? { level: lvl, grantedFeatures: [], grantedModifiers: [] };
    });
  });

  // ===========================================================================
  // INCREMENT HELPERS
  // ===========================================================================

  // Pipeline IDs are imported from constants.ts — never hardcoded as magic strings
  // in .svelte files (zero-hardcoding rule, ARCHITECTURE.md §6).
  const BAB_TARGET  = BAB_PIPELINE_ID;
  const FORT_TARGET = SAVE_FORT_PIPELINE_ID;
  const REF_TARGET  = SAVE_REFLEX_PIPELINE_ID;
  const WILL_TARGET = SAVE_WILL_PIPELINE_ID;

  function getIncrement(entry: LevelProgressionEntry, targetId: string): number {
    const mod = entry.grantedModifiers.find(m => m.targetId === targetId && m.type === 'base');
    return typeof mod?.value === 'number' ? mod.value : 0;
  }

  /**
   * Returns a new grantedModifiers array with the base modifier for `targetId`
   * set to `value`.  Creates a new Modifier if one doesn't exist.
   * Removes the modifier if value === 0 and there was one (keeps data tidy).
   */
  function withIncrement(
    entry: LevelProgressionEntry,
    targetId: string,
    value: number
  ): Modifier[] {
    const existing = entry.grantedModifiers.filter(
      m => !(m.targetId === targetId && m.type === 'base')
    );
    if (value === 0) return existing; // removes the modifier

    const id = `base_${targetId.replace(/\./g, '_')}_${entry.level}`;
    const newMod: Modifier = {
      id,
      sourceId:   ctx.feature.id || 'class_id',
      sourceName: ctx.feature.label as Record<string, string>,
      targetId,
      value,
      type: 'base',
    };
    return [...existing, newMod];
  }

  // ===========================================================================
  // LEVEL ENTRY MUTATIONS
  // ===========================================================================

  /**
   * Updates one level entry in the progression array.
   * Keeps the array sorted by level; removes trailing empty entries to keep
   * the JSON compact (unless they have data).
   */
  function patchLevelEntry(
    levelNumber: number,
    patch: Partial<LevelProgressionEntry>
  ): void {
    const existing = [...(ctx.feature.levelProgression ?? [])];
    const idx = existing.findIndex(e => e.level === levelNumber);

    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...patch };
    } else {
      existing.push({ level: levelNumber, grantedFeatures: [], grantedModifiers: [], ...patch });
    }

    // Sort and trim truly empty trailing entries
    const sorted = existing.sort((a, b) => a.level - b.level);
    ctx.feature.levelProgression = sorted;
  }

  function setIncrement(levelNumber: number, targetId: string, value: number): void {
    const entry = rows.find(r => r.level === levelNumber)!;
    const newMods = withIncrement(entry, targetId, value);
    patchLevelEntry(levelNumber, { grantedModifiers: newMods });
  }

  // ===========================================================================
  // PRESET APPLICATION
  // ===========================================================================

  function applyColumnPreset(targetId: string, increments: readonly number[]): void {
    const updated = [...(ctx.feature.levelProgression ?? [])];

    increments.forEach((inc, i) => {
      const lvl   = i + 1;
      const entry = rows.find(r => r.level === lvl) ?? { level: lvl, grantedFeatures: [], grantedModifiers: [] };
      const newMods = withIncrement(entry, targetId, inc);

      const existing = updated.findIndex(e => e.level === lvl);
      if (existing >= 0) {
        updated[existing] = { ...updated[existing], grantedModifiers: newMods };
      } else {
        updated.push({ level: lvl, grantedFeatures: [], grantedModifiers: newMods });
      }
    });

    ctx.feature.levelProgression = updated.sort((a, b) => a.level - b.level);
  }

  // ===========================================================================
  // FEATURE CHIP HELPERS
  // ===========================================================================

  function featureLabelFor(id: ID): string {
    const f = dataLoader.getFeature(id);
    const lbl = f?.label as Record<string, string> | undefined;
    return lbl?.['en'] ?? id;
  }

  function addFeaturesAtLevel(levelNumber: number, ids: ID[]): void {
    const entry = rows.find(r => r.level === levelNumber)!;
    const existing = new Set(entry.grantedFeatures);
    const toAdd = ids.filter(id => !existing.has(id));
    if (toAdd.length === 0) return;
    patchLevelEntry(levelNumber, {
      grantedFeatures: [...entry.grantedFeatures, ...toAdd],
    });
  }

  function removeFeatureAtLevel(levelNumber: number, id: ID): void {
    const entry = rows.find(r => r.level === levelNumber)!;
    patchLevelEntry(levelNumber, {
      grantedFeatures: entry.grantedFeatures.filter(f => f !== id),
    });
  }

  // ===========================================================================
  // MODAL STATE
  // ===========================================================================

  type ModalState =
    | { kind: 'feature-picker'; levelNumber: number }
    | { kind: 'modifier-modal'; levelNumber: number; modifiers: Modifier[] }
    | null;

  let modalState = $state<ModalState>(null);
</script>

<!-- Feature picker for a level row -->
{#if modalState?.kind === 'feature-picker'}
  {@const lvl = modalState.levelNumber}
  <FeaturePickerModal
    multiple={true}
    onFeaturePicked={(ids) => { addFeaturesAtLevel(lvl, ids); modalState = null; }}
    onclose={() => (modalState = null)}
  />
{/if}

<!-- Per-level modifier editor -->
{#if modalState?.kind === 'modifier-modal'}
  {@const lvl  = modalState.levelNumber}
  {@const mods = modalState.modifiers}
  <LevelModifierModal
    levelNumber={lvl}
    initialModifiers={mods}
    parentFeatureId={ctx.feature.id}
    parentFeatureLabelEn={(ctx.feature.label as Record<string,string>)?.['en'] ?? ''}
    onModifiersSaved={(updated) => {
      patchLevelEntry(lvl, { grantedModifiers: updated });
      modalState = null;
    }}
    onclose={() => (modalState = null)}
  />
{/if}

<!-- ======================================================================= -->
<!-- MAIN RENDER                                                               -->
<!-- ======================================================================= -->
<div class="flex flex-col gap-3">

  <!-- Section header -->
  <div class="flex flex-col gap-0.5">
    <span class="text-sm font-semibold text-text-primary">Level Progression</span>
    <span class="text-[11px] text-text-muted">
      Defines what each class level grants. BAB and save values are
      <strong>increments</strong> accumulated by the engine — not totals.
    </span>
  </div>

  <!-- ── PRESET BUTTONS ──────────────────────────────────────────────────── -->
  <div class="flex flex-wrap gap-2 p-3 rounded-lg border border-border bg-surface-alt">
    <span class="text-[11px] font-semibold text-text-muted self-center mr-1 w-full md:w-auto">
      Fill entire column with preset:
    </span>

    <!-- BAB presets -->
    <span class="text-[10px] text-text-muted self-center">BAB:</span>
    <button type="button" class="btn-ghost text-xs py-0.5 px-2 h-auto"
            onclick={() => applyColumnPreset(BAB_TARGET, BAB_FULL)}
            title="BAB = +1 every level">
      Full BAB
    </button>
    <button type="button" class="btn-ghost text-xs py-0.5 px-2 h-auto"
            onclick={() => applyColumnPreset(BAB_TARGET, BAB_3_4)}
            title="BAB = floor(level × 3/4)">
      ¾ BAB
    </button>
    <button type="button" class="btn-ghost text-xs py-0.5 px-2 h-auto"
            onclick={() => applyColumnPreset(BAB_TARGET, BAB_1_2)}
            title="BAB = floor(level / 2)">
      ½ BAB
    </button>

    <span class="text-[10px] text-text-muted self-center ml-2">Fort / Ref / Will:</span>
    <button type="button" class="btn-ghost text-xs py-0.5 px-2 h-auto text-green-400"
            onclick={() => {
              const save = prompt('Apply Good Save to which save? Enter: fort, ref, or will');
              if (!save) return;
              const t = save.trim().toLowerCase();
              if (t === 'fort') applyColumnPreset(FORT_TARGET, SAVE_GOOD);
              else if (t === 'ref') applyColumnPreset(REF_TARGET, SAVE_GOOD);
              else if (t === 'will') applyColumnPreset(WILL_TARGET, SAVE_GOOD);
            }}
            title="Good Save = 2 + floor(level / 2). Prompts for Fort, Ref, or Will.">
      Good Save
    </button>
    <button type="button" class="btn-ghost text-xs py-0.5 px-2 h-auto text-amber-400"
            onclick={() => {
              const save = prompt('Apply Poor Save to which save? Enter: fort, ref, or will');
              if (!save) return;
              const t = save.trim().toLowerCase();
              if (t === 'fort') applyColumnPreset(FORT_TARGET, SAVE_POOR);
              else if (t === 'ref') applyColumnPreset(REF_TARGET, SAVE_POOR);
              else if (t === 'will') applyColumnPreset(WILL_TARGET, SAVE_POOR);
            }}
            title="Poor Save = floor(level / 3). Prompts for Fort, Ref, or Will.">
      Poor Save
    </button>

    <!-- Per-save preset buttons (no prompt) -->
    <div class="flex flex-wrap gap-1 w-full mt-1 text-[10px] text-text-muted">
      <span class="self-center">Quick fill:</span>
      {#each ['fort', 'ref', 'will'] as save}
        {@const target = save === 'fort' ? FORT_TARGET : save === 'ref' ? REF_TARGET : WILL_TARGET}
        <button type="button" class="btn-ghost text-[10px] py-0 px-1.5 h-auto text-green-400"
                onclick={() => applyColumnPreset(target, SAVE_GOOD)}>
          {save} good
        </button>
        <button type="button" class="btn-ghost text-[10px] py-0 px-1.5 h-auto text-amber-400"
                onclick={() => applyColumnPreset(target, SAVE_POOR)}>
          {save} poor
        </button>
      {/each}
    </div>
  </div>

  <!-- ── TABLE ─────────────────────────────────────────────────────────────── -->
  <!-- Scrolls horizontally on narrow viewports -->
  <div class="overflow-x-auto rounded-lg border border-border">
    <table class="w-full text-xs border-collapse min-w-[640px]">
      <thead>
        <tr class="bg-surface-alt border-b border-border">
          <th class="px-3 py-2 text-left font-semibold text-text-muted w-10">Lvl</th>
          <th class="px-2 py-2 text-center font-semibold text-text-muted w-12">BAB</th>
          <th class="px-2 py-2 text-center font-semibold text-text-muted w-12">Fort</th>
          <th class="px-2 py-2 text-center font-semibold text-text-muted w-12">Ref</th>
          <th class="px-2 py-2 text-center font-semibold text-text-muted w-12">Will</th>
          <th class="px-3 py-2 text-left font-semibold text-text-muted">Features granted</th>
          <th class="px-3 py-2 text-left font-semibold text-text-muted w-28">Modifiers</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as entry (entry.level)}
          {@const bab  = getIncrement(entry, BAB_TARGET)}
          {@const fort = getIncrement(entry, FORT_TARGET)}
          {@const ref  = getIncrement(entry, REF_TARGET)}
          {@const will = getIncrement(entry, WILL_TARGET)}
          {@const nonIncMods = entry.grantedModifiers.filter(
            m => !(m.type === 'base' && ([BAB_TARGET, FORT_TARGET, REF_TARGET, WILL_TARGET] as string[]).includes(m.targetId))
          )}

          <tr class="border-b border-border/50 hover:bg-surface-alt/50 transition-colors">

            <!-- Level label -->
            <td class="px-3 py-1.5 text-center font-bold text-text-muted">
              {entry.level}
            </td>

            <!-- BAB increment -->
            <td class="px-2 py-1.5 text-center">
              <input
                type="number"
                class="w-10 text-center input text-xs py-0.5 px-1"
                min="0"
                max="1"
                value={bab}
                oninput={(e) => setIncrement(entry.level, BAB_TARGET, parseInt((e.currentTarget as HTMLInputElement).value) || 0)}
                aria-label="BAB increment at level {entry.level}"
              />
            </td>

            <!-- Fort increment -->
            <td class="px-2 py-1.5 text-center">
              <input
                type="number"
                class="w-10 text-center input text-xs py-0.5 px-1"
                min="0"
                max="2"
                value={fort}
                oninput={(e) => setIncrement(entry.level, FORT_TARGET, parseInt((e.currentTarget as HTMLInputElement).value) || 0)}
                aria-label="Fortitude increment at level {entry.level}"
              />
            </td>

            <!-- Ref increment -->
            <td class="px-2 py-1.5 text-center">
              <input
                type="number"
                class="w-10 text-center input text-xs py-0.5 px-1"
                min="0"
                max="2"
                value={ref}
                oninput={(e) => setIncrement(entry.level, REF_TARGET, parseInt((e.currentTarget as HTMLInputElement).value) || 0)}
                aria-label="Reflex increment at level {entry.level}"
              />
            </td>

            <!-- Will increment -->
            <td class="px-2 py-1.5 text-center">
              <input
                type="number"
                class="w-10 text-center input text-xs py-0.5 px-1"
                min="0"
                max="2"
                value={will}
                oninput={(e) => setIncrement(entry.level, WILL_TARGET, parseInt((e.currentTarget as HTMLInputElement).value) || 0)}
                aria-label="Will increment at level {entry.level}"
              />
            </td>

            <!-- Granted features -->
            <td class="px-3 py-1.5">
              <div class="flex flex-wrap gap-1 items-center">
                {#each entry.grantedFeatures as fid (fid)}
                  <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full
                               bg-surface border border-border text-[10px] font-mono text-text-primary">
                    {featureLabelFor(fid)}
                    <button
                      type="button"
                      class="text-text-muted hover:text-danger leading-none"
                      onclick={() => removeFeatureAtLevel(entry.level, fid)}
                      aria-label="Remove {fid} from level {entry.level}"
                    >×</button>
                  </span>
                {/each}
                <button
                  type="button"
                  class="text-[10px] text-text-muted hover:text-accent transition-colors
                         border border-dashed border-border/60 rounded-full px-1.5 py-0.5"
                  onclick={() => (modalState = { kind: 'feature-picker', levelNumber: entry.level })}
                  title="Add feature at level {entry.level}"
                >
                  + Add
                </button>
              </div>
            </td>

            <!-- Granted modifiers (non-increment) -->
            <td class="px-3 py-1.5">
              <div class="flex items-center gap-1.5">
                {#if nonIncMods.length > 0}
                  <span class="badge text-[10px]">{nonIncMods.length}</span>
                {/if}
                <button
                  type="button"
                  class="text-[10px] text-text-muted hover:text-accent transition-colors underline"
                  onclick={() => (modalState = {
                    kind: 'modifier-modal',
                    levelNumber: entry.level,
                    modifiers: entry.grantedModifiers,
                  })}
                >
                  {nonIncMods.length > 0 ? 'Edit' : '+ Add'}
                </button>
              </div>
            </td>

          </tr>
        {/each}
      </tbody>
    </table>
  </div>

</div>
