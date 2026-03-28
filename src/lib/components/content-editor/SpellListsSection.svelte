<!--
  @file src/lib/components/content-editor/SpellListsSection.svelte
  @description Spell Lists section (§2) for MagicDataEditor.
  Extracted from MagicDataEditor.svelte as part of F5a refactoring.
  Reads/writes via EditorContext (no props).
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import type { MagicFeature } from '$lib/types/feature';
  import { dataLoader } from '$lib/engine/DataLoader';
  import FeaturePickerModal from './FeaturePickerModal.svelte';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const magic = $derived(ctx.feature as unknown as MagicFeature);

  let showClassPicker = $state(false);

  /** Sorted entries from spellLists Record for stable table rendering. */
  const spellListEntries = $derived(
    Object.entries(magic.spellLists ?? {}).sort(([a], [b]) => a.localeCompare(b))
  );

  function addSpellListClass(classId: string): void {
    (ctx.feature as MagicFeature).spellLists = {
      ...(magic.spellLists ?? {}),
      [classId]: 0,
    };
  }
  function removeSpellListClass(classId: string): void {
    const { [classId]: _removed, ...rest } = magic.spellLists ?? {};
    (ctx.feature as MagicFeature).spellLists = rest;
  }
  function setSpellListLevel(classId: string, level: number): void {
    (ctx.feature as MagicFeature).spellLists = {
      ...(magic.spellLists ?? {}),
      [classId]: level,
    };
  }

  /** Returns the English label for a loaded feature (class), or the raw ID. */
  function classLabel(id: string): string {
    const f = dataLoader.getFeature(id);
    const lbl = f?.label as Record<string,string> | undefined;
    return lbl?.['en'] ?? id;
  }
</script>

{#if showClassPicker}
  <FeaturePickerModal
    filterCategory="class"
    onFeaturePicked={(ids) => {
      ids.forEach(id => addSpellListClass(id));
      showClassPicker = false;
    }}
    onclose={() => (showClassPicker = false)}
  />
{/if}

<!-- ======================================================================= -->
<!-- SECTION 2 — SPELL LISTS                                                   -->
<!-- ======================================================================= -->
<details class="group/sl rounded-lg border border-border overflow-hidden">
  <summary class="flex items-center justify-between px-4 py-2 bg-surface-alt cursor-pointer
                  select-none list-none hover:bg-accent/5 font-semibold text-sm text-text-primary">
    Spell Lists (Class → Level)
    <svg class="h-4 w-4 text-text-muted transition-transform group-open/sl:rotate-180"
         xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </summary>

  <div class="p-4 flex flex-col gap-3">
    <p class="text-[11px] text-text-muted">
      Defines which class spell lists include this spell and at what level.
      For psionic powers, list the manifester classes (Psion, Wilder, etc.) and the power level.
    </p>

    {#if spellListEntries.length === 0}
      <p class="text-xs text-text-muted italic">No spell lists assigned.</p>
    {:else}
      <table class="w-full text-xs border-collapse">
        <thead>
          <tr class="border-b border-border">
            <th class="text-left px-2 py-1 font-semibold text-text-muted">Class</th>
            <th class="text-center px-2 py-1 font-semibold text-text-muted w-20">Level</th>
            <th class="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {#each spellListEntries as [classId, level] (classId)}
            <tr class="border-b border-border/50 hover:bg-surface-alt/50">
              <td class="px-2 py-1">
                <span class="text-text-primary">{classLabel(classId)}</span>
                <code class="ml-1.5 font-mono text-[9px] text-text-muted">{classId}</code>
              </td>
              <td class="px-2 py-1 text-center">
                <input type="number" class="input text-xs text-center w-14 py-0.5" min="0" max="9"
                       value={level}
                       oninput={(e) => setSpellListLevel(classId, parseInt((e.currentTarget as HTMLInputElement).value) || 0)}
                       aria-label="Spell level for {classId}"/>
              </td>
              <td class="px-2 py-1 text-center">
                <button type="button" class="btn-ghost btn-icon h-6 w-6 p-0 text-text-muted hover:text-danger"
                        onclick={() => removeSpellListClass(classId)}
                        aria-label="Remove {classId}">
                  <svg class="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                       fill="none" stroke="currentColor" stroke-width="2"
                       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    <button type="button" class="btn-primary text-xs py-1 px-3 h-auto w-fit"
            onclick={() => (showClassPicker = true)}>
      + Add Class
    </button>
  </div>
</details>
