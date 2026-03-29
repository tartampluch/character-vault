<!--
  @file src/lib/components/content-editor/LevelProgressionEditor.svelte
  @description Editor for Feature.levelProgression (class entities only).
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
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
  import { IconClose } from '$lib/components/ui/icons';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const lang = $derived(engine.settings.language);

  const MAX_LEVELS = 20;

  const rows = $derived.by((): LevelProgressionEntry[] => {
    const existing = ctx.feature.levelProgression ?? [];
    return Array.from({ length: MAX_LEVELS }, (_, i) => {
      const lvl  = i + 1;
      const found = existing.find(e => e.level === lvl);
      return found ?? { level: lvl, grantedFeatures: [], grantedModifiers: [] };
    });
  });

  const BAB_TARGET  = BAB_PIPELINE_ID;
  const FORT_TARGET = SAVE_FORT_PIPELINE_ID;
  const REF_TARGET  = SAVE_REFLEX_PIPELINE_ID;
  const WILL_TARGET = SAVE_WILL_PIPELINE_ID;

  function getIncrement(entry: LevelProgressionEntry, targetId: string): number {
    const mod = entry.grantedModifiers.find(m => m.targetId === targetId && m.type === 'base');
    return typeof mod?.value === 'number' ? mod.value : 0;
  }

  function withIncrement(
    entry: LevelProgressionEntry,
    targetId: string,
    value: number
  ): Modifier[] {
    const existing = entry.grantedModifiers.filter(
      m => !(m.targetId === targetId && m.type === 'base')
    );
    if (value === 0) return existing;

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

    const sorted = existing.sort((a, b) => a.level - b.level);
    ctx.feature.levelProgression = sorted;
  }

  function setIncrement(levelNumber: number, targetId: string, value: number): void {
    const entry = rows.find(r => r.level === levelNumber)!;
    const newMods = withIncrement(entry, targetId, value);
    patchLevelEntry(levelNumber, { grantedModifiers: newMods });
  }

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
    <span class="text-sm font-semibold text-text-primary">{ui('editor.level_prog.section_title', lang)}</span>
    <span class="text-[11px] text-text-muted">
      {ui('editor.level_prog.section_hint', lang)}
    </span>
  </div>

  <!-- ── PRESET BUTTONS ──────────────────────────────────────────────────── -->
  <div class="flex flex-wrap gap-2 p-3 rounded-lg border border-border bg-surface-alt">
    <span class="text-[11px] font-semibold text-text-muted self-center mr-1 w-full md:w-auto">
      {ui('editor.level_prog.fill_column_hint', lang)}
    </span>

    <!-- BAB presets -->
    <span class="text-[10px] text-text-muted self-center">{ui('editor.level_prog.bab_prefix', lang)}</span>
    <button type="button" class="btn-ghost text-xs py-0.5 px-2 h-auto"
            onclick={() => applyColumnPreset(BAB_TARGET, BAB_FULL)}
            title={ui('editor.level_prog.full_bab_title', lang)}>
      {ui('editor.level_prog.full_bab_btn', lang)}
    </button>
    <button type="button" class="btn-ghost text-xs py-0.5 px-2 h-auto"
            onclick={() => applyColumnPreset(BAB_TARGET, BAB_3_4)}
            title={ui('editor.level_prog.3_4_bab_title', lang)}>
      {ui('editor.level_prog.3_4_bab_btn', lang)}
    </button>
    <button type="button" class="btn-ghost text-xs py-0.5 px-2 h-auto"
            onclick={() => applyColumnPreset(BAB_TARGET, BAB_1_2)}
            title={ui('editor.level_prog.1_2_bab_title', lang)}>
      {ui('editor.level_prog.1_2_bab_btn', lang)}
    </button>

    <span class="text-[10px] text-text-muted self-center ml-2">{ui('editor.level_prog.save_prefix', lang)}</span>
    <button type="button" class="btn-ghost text-xs py-0.5 px-2 h-auto text-green-400"
            onclick={() => {
              const save = prompt(ui('editor.level_prog.good_save_prompt', lang));
              if (!save) return;
              const t = save.trim().toLowerCase();
              if (t === 'fort') applyColumnPreset(FORT_TARGET, SAVE_GOOD);
              else if (t === 'ref') applyColumnPreset(REF_TARGET, SAVE_GOOD);
              else if (t === 'will') applyColumnPreset(WILL_TARGET, SAVE_GOOD);
            }}
            title={ui('editor.level_prog.good_save_title', lang)}>
      {ui('editor.level_prog.good_save_btn', lang)}
    </button>
    <button type="button" class="btn-ghost text-xs py-0.5 px-2 h-auto text-amber-400"
            onclick={() => {
              const save = prompt(ui('editor.level_prog.poor_save_prompt', lang));
              if (!save) return;
              const t = save.trim().toLowerCase();
              if (t === 'fort') applyColumnPreset(FORT_TARGET, SAVE_POOR);
              else if (t === 'ref') applyColumnPreset(REF_TARGET, SAVE_POOR);
              else if (t === 'will') applyColumnPreset(WILL_TARGET, SAVE_POOR);
            }}
            title={ui('editor.level_prog.poor_save_title', lang)}>
      {ui('editor.level_prog.poor_save_btn', lang)}
    </button>

    <!-- Per-save preset buttons (no prompt) -->
    <div class="flex flex-wrap gap-1 w-full mt-1 text-[10px] text-text-muted">
      <span class="self-center">{ui('editor.level_prog.quick_fill_label', lang)}</span>
      {#each ['fort', 'ref', 'will'] as save}
        {@const target = save === 'fort' ? FORT_TARGET : save === 'ref' ? REF_TARGET : WILL_TARGET}
        <button type="button" class="btn-ghost text-[10px] py-0 px-1.5 h-auto text-green-400"
                onclick={() => applyColumnPreset(target, SAVE_GOOD)}>
          {save} {ui('editor.level_prog.good_save_btn', lang).toLowerCase()}
        </button>
        <button type="button" class="btn-ghost text-[10px] py-0 px-1.5 h-auto text-amber-400"
                onclick={() => applyColumnPreset(target, SAVE_POOR)}>
          {save} {ui('editor.level_prog.poor_save_btn', lang).toLowerCase()}
        </button>
      {/each}
    </div>
  </div>

  <!-- ── TABLE ─────────────────────────────────────────────────────────────── -->
  <div class="overflow-x-auto rounded-lg border border-border">
    <table class="w-full text-xs border-collapse min-w-[640px]">
      <thead>
        <tr class="bg-surface-alt border-b border-border">
          <th class="px-3 py-2 text-left font-semibold text-text-muted w-10">{ui('editor.level_prog.col_lvl', lang)}</th>
          <th class="px-2 py-2 text-center font-semibold text-text-muted w-12">{ui('editor.level_prog.col_bab', lang)}</th>
          <th class="px-2 py-2 text-center font-semibold text-text-muted w-12">{ui('editor.level_prog.col_fort', lang)}</th>
          <th class="px-2 py-2 text-center font-semibold text-text-muted w-12">{ui('editor.level_prog.col_ref', lang)}</th>
          <th class="px-2 py-2 text-center font-semibold text-text-muted w-12">{ui('editor.level_prog.col_will', lang)}</th>
          <th class="px-3 py-2 text-left font-semibold text-text-muted">{ui('editor.level_prog.col_features', lang)}</th>
          <th class="px-3 py-2 text-left font-semibold text-text-muted w-28">{ui('editor.level_prog.col_modifiers', lang)}</th>
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
                aria-label={ui('editor.level_prog.bab_aria', lang).replace('{n}', String(entry.level))}
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
                aria-label={ui('editor.level_prog.fort_aria', lang).replace('{n}', String(entry.level))}
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
                aria-label={ui('editor.level_prog.ref_aria', lang).replace('{n}', String(entry.level))}
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
                aria-label={ui('editor.level_prog.will_aria', lang).replace('{n}', String(entry.level))}
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
                      aria-label={ui('editor.level_prog.remove_feature_aria', lang).replace('{id}', fid).replace('{n}', String(entry.level))}
                    ><IconClose size={12} aria-hidden="true" /></button>
                  </span>
                {/each}
                <button
                  type="button"
                  class="text-[10px] text-text-muted hover:text-accent transition-colors
                         border border-dashed border-border/60 rounded-full px-1.5 py-0.5"
                  onclick={() => (modalState = { kind: 'feature-picker', levelNumber: entry.level })}
                  title={ui('editor.level_prog.add_feature_title', lang).replace('{n}', String(entry.level))}
                >
                  {ui('common.add', lang)}
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
                  {nonIncMods.length > 0 ? ui('common.edit', lang) : ui('common.add', lang)}
                </button>
              </div>
            </td>

          </tr>
        {/each}
      </tbody>
    </table>
  </div>

</div>
