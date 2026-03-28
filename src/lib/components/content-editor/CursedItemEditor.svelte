<!--
  @file src/lib/components/content-editor/CursedItemEditor.svelte
  @description Cursed Item section (Section 6) for ItemDataEditor.
  Extracted from ItemDataEditor.svelte as part of F2d refactoring.
  Reads/writes via EditorContext (no props).
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import type { ItemFeature } from '$lib/types/feature';
  import TagPickerModal from './TagPickerModal.svelte';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);

  function toggleCursed(on: boolean): void {
    (ctx.feature as ItemFeature).removalPrevention = on
      ? { isCursed: true, removableBy: [], preventionNote: '' }
      : undefined;
  }

  let showCursedTagPicker = $state(false);

  const uid = Math.random().toString(36).slice(2, 7);
  const fid = (name: string) => `crsed-${uid}-${name}`;
</script>

{#if showCursedTagPicker}
  <TagPickerModal
    initialSelected={((ctx.feature as ItemFeature).removalPrevention?.removableBy ?? []) as string[]}
    onTagsPicked={(tags) => {
      const rp = (ctx.feature as ItemFeature).removalPrevention;
      if (rp) rp.removableBy = tags as ('remove_curse'|'limited_wish'|'wish'|'miracle')[];
      showCursedTagPicker = false;
    }}
    onclose={() => (showCursedTagPicker = false)}
  />
{/if}

<!-- ======================================================================= -->
<!-- SECTION 6 — CURSED                                                        -->
<!-- ======================================================================= -->
<details class="group/crs rounded-lg border border-border overflow-hidden">
  <summary class="flex items-center justify-between px-4 py-2 bg-surface-alt cursor-pointer
                  select-none list-none hover:bg-accent/5 text-sm font-semibold text-text-primary">
    <label class="flex items-center gap-3 cursor-pointer select-none">
      <input type="checkbox" class="h-4 w-4 accent-accent"
             checked={!!(ctx.feature as ItemFeature).removalPrevention}
             onchange={(e) => toggleCursed((e.currentTarget as HTMLInputElement).checked)}
             onclick={(e) => e.stopPropagation()}/>
      Cursed (cannot be voluntarily removed)
    </label>
    <svg class="h-4 w-4 text-text-muted transition-transform group-open/crs:rotate-180"
         xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </summary>
  {#if (ctx.feature as ItemFeature).removalPrevention}
    {@const rp = (ctx.feature as ItemFeature).removalPrevention!}
    <div class="p-4 flex flex-col gap-3">
      <!-- Removable By chip list -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Removable By (tags)
          </span>
          <button type="button" class="btn-ghost text-xs py-0.5 px-2 h-auto"
                  onclick={() => (showCursedTagPicker = true)}>Edit</button>
        </div>
        <div class="flex flex-wrap gap-1.5 min-h-[2rem]">
          {#each (rp.removableBy ?? []) as tag (tag)}
            <span class="badge font-mono text-[10px] bg-red-900/20 text-red-300 border-red-700/30">{tag}</span>
          {:else}
            <span class="text-xs text-text-muted italic">Nothing — cannot be removed by any means.</span>
          {/each}
        </div>
        <p class="text-[10px] text-text-muted">
          SRD methods: <code class="font-mono">remove_curse</code>, <code class="font-mono">limited_wish</code>,
          <code class="font-mono">wish</code>, <code class="font-mono">miracle</code>
        </p>
      </div>
      <!-- Prevention note -->
      <div class="flex flex-col gap-1">
        <label for={fid('note')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Prevention Note <span class="font-normal text-[9px]">(optional flavour text)</span>
        </label>
        <input id={fid('note')} type="text" class="input text-sm"
               value={rp.preventionNote ?? ''}
               placeholder="e.g. Remains clasped even after death."
               oninput={(e) => {
                 rp.preventionNote = (e.currentTarget as HTMLInputElement).value || undefined;
               }}/>
      </div>
    </div>
  {:else}
    <div class="px-4 py-3 text-xs text-text-muted italic">
      Enable for items that cannot be voluntarily unequipped (Necklace of Strangulation, etc.).
    </div>
  {/if}
</details>
