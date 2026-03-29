<!--
  @file src/lib/components/content-editor/LevelModifierModal.svelte
  @description Modal wrapper that lets ModifierListEditor edit the grantedModifiers
  of a single LevelProgressionEntry without polluting the parent EntityForm context.

  WHY A SEPARATE CONTEXT?
    ModifierListEditor reads ctx.feature.grantedModifiers from the EditorContext
    provided by EntityForm.  For per-level modifiers we need a DIFFERENT list —
    the modifiers for level N, not the top-level feature's modifiers.

    This component creates its own EditorContext (via setContext) backed by a
    mock $state feature whose grantedModifiers is the level's modifier list.
    ModifierListEditor mounts inside this scope and modifies the mock feature.
    When the GM clicks "Apply", we call onModifiersSaved with the updated list.

  The mock feature's other fields (id, label, category) are copied from the
  real feature so ModifierListEditor's "auto-fill source" defaults are meaningful.
-->

<script lang="ts">
  import { setContext, untrack } from 'svelte';
  import { EDITOR_CONTEXT_KEY } from './editorContext';
  import type { HomebrewStore } from '$lib/engine/HomebrewStore.svelte';
  import type { Modifier } from '$lib/types/pipeline';
  import Modal from '$lib/components/ui/Modal.svelte';
  import ModifierListEditor from './ModifierListEditor.svelte';

  interface Props {
    levelNumber: number;
    initialModifiers: Modifier[];
    /** How to identify the source in modifier rows (copied from parent feature). */
    parentFeatureId: string;
    parentFeatureLabelEn: string;
    onModifiersSaved: (mods: Modifier[]) => void;
    onclose: () => void;
  }

  let {
    levelNumber,
    initialModifiers,
    parentFeatureId,
    parentFeatureLabelEn,
    onModifiersSaved,
    onclose,
  }: Props = $props();

  // ── Build a mock $state feature for the scoped context ─────────────────────
  // All prop reads are wrapped in untrack() so Svelte doesn't warn about
  // "captures only initial value" — these are intentionally snapshotted at mount.
  const mockFeature = $state(untrack(() => ({
    id:               parentFeatureId,
    category:         'class' as const,
    label:            { en: parentFeatureLabelEn },
    description:      { en: '' },
    ruleSource:       'user_homebrew',
    tags:             [] as string[],
    forbiddenTags:    [] as string[],
    grantedModifiers: structuredClone(initialModifiers) as Modifier[],
    grantedFeatures:  [] as string[],
    merge:            'replace' as const,
  })));

  // ── Provide the scoped context — called at component initialisation ─────────
  // setContext must be called synchronously during component setup.
  setContext(EDITOR_CONTEXT_KEY, {
    feature: mockFeature,
    mode: 'edit' as const,
    store: null as unknown as HomebrewStore,
    get hasOverrideWarning() { return false; },
  });

  // ── Apply: copy working copy back to parent ─────────────────────────────────
  function apply(): void {
    onModifiersSaved(mockFeature.grantedModifiers);
  }
</script>

<Modal
  open={true}
  onClose={onclose}
  title="Level {levelNumber} — Modifiers"
  size="xl"
  fullscreen={true}
>
  {#snippet children()}
    <div class="flex flex-col gap-4">
      <p class="text-xs text-text-muted">
        These are <strong>incremental</strong> modifiers applied at exactly level {levelNumber}.
        The engine SUMS all <code class="font-mono">type: "base"</code> modifiers from every
        level entry up to the character's current level.
        Use <code class="font-mono">type: "base"</code> for BAB / save increments.
      </p>

      <ModifierListEditor />

      <div class="flex justify-end gap-2 pt-3 border-t border-border">
        <button type="button" class="btn-ghost" onclick={onclose}>Cancel</button>
        <button type="button" class="btn-primary" onclick={apply}>Apply</button>
      </div>
    </div>
  {/snippet}
</Modal>
