<!--
  @file src/lib/components/content-editor/ModifierListEditor.svelte
  @description CRUD editor for a Feature's grantedModifiers array.
  F4 refactoring: each modifier row is now a ModifierRow component.
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import type { Modifier } from '$lib/types/pipeline';
  import ModifierRow from './ModifierRow.svelte';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const lang = $derived(engine.settings.language);

  function defaultSourceId(): string {
    return ctx.feature.id || 'feature_id';
  }

  function defaultSourceName(): string {
    const lbl = ctx.feature.label as Record<string, string>;
    return lbl?.['en'] || ctx.feature.id || ui('editor.modifier.fallback_feature', lang);
  }

  function makeBlankModifier(): Modifier {
    return {
      id:         crypto.getRandomValues(new Uint8Array(4)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''),
      sourceId:   defaultSourceId(),
      sourceName: { en: defaultSourceName() },
      targetId:   '',
      value:      0,
      type:       'untyped',
    };
  }

  function addModifier(): void {
    ctx.feature.grantedModifiers = [...ctx.feature.grantedModifiers, makeBlankModifier()];
  }

  function duplicateModifier(index: number): void {
    const src = ctx.feature.grantedModifiers[index];
    const clone: Modifier = {
      ...structuredClone(src),
      id: crypto.getRandomValues(new Uint8Array(4)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''),
    };
    const arr = [...ctx.feature.grantedModifiers];
    arr.splice(index + 1, 0, clone);
    ctx.feature.grantedModifiers = arr;
  }

  function deleteModifier(index: number): void {
    ctx.feature.grantedModifiers = ctx.feature.grantedModifiers.filter((_, i) => i !== index);
  }

  function updateModifier(index: number, updated: Modifier): void {
    const arr = [...ctx.feature.grantedModifiers];
    arr[index] = updated;
    ctx.feature.grantedModifiers = arr;
  }
</script>

<!-- ============================================================ -->
<!-- MODIFIER LIST                                                 -->
<!-- ============================================================ -->
<div class="flex flex-col gap-3">

  <!-- Header row -->
  <div class="flex items-center justify-between">
    <span class="text-sm font-semibold text-text-primary">
      {ui('editor.modifier_list.section_title', lang)}
      {#if ctx.feature.grantedModifiers.length > 0}
        <span class="ml-1.5 text-xs font-normal text-text-muted badge">
          {ctx.feature.grantedModifiers.length}
        </span>
      {/if}
    </span>
    <button type="button" class="btn-primary text-xs py-1 px-3 h-auto" onclick={addModifier}>
      {ui('editor.modifier_list.add_modifier_btn', lang)}
    </button>
  </div>

  <!-- Empty state -->
  {#if ctx.feature.grantedModifiers.length === 0}
    <div class="rounded-lg border border-dashed border-border px-4 py-6 text-center">
      <p class="text-sm text-text-muted italic">{ui('editor.modifier_list.no_modifiers', lang)}</p>
      <p class="text-xs text-text-muted mt-1">
        {ui('editor.modifier_list.empty_hint', lang)}
      </p>
    </div>

  {:else}
    <!-- Modifier rows -->
    {#each ctx.feature.grantedModifiers as mod, i (mod.id)}
      <ModifierRow
        modifier={mod}
        index={i}
        onchange={(updated) => updateModifier(i, updated)}
        ondelete={() => deleteModifier(i)}
        onduplicate={() => duplicateModifier(i)}
      />
    {/each}
  {/if}

  <!-- Bottom "+ Add Modifier" when list is non-empty (saves scrolling) -->
  {#if ctx.feature.grantedModifiers.length > 0}
    <button type="button" class="btn-ghost text-sm w-full py-2" onclick={addModifier}>
      {ui('editor.modifier_list.add_modifier_btn', lang)}
    </button>
  {/if}

</div>
