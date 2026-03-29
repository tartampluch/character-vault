<!--
  @file src/lib/components/content-editor/LevelModifierModal.svelte
  @description Modal wrapper that lets ModifierListEditor edit the grantedModifiers
  of a single LevelProgressionEntry without polluting the parent EntityForm context.
-->

<script lang="ts">
  import { setContext, untrack } from 'svelte';
  import { EDITOR_CONTEXT_KEY } from './editorContext';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import type { HomebrewStore } from '$lib/engine/HomebrewStore.svelte';
  import type { Modifier } from '$lib/types/pipeline';
  import Modal from '$lib/components/ui/Modal.svelte';
  import ModifierListEditor from './ModifierListEditor.svelte';

  interface Props {
    levelNumber: number;
    initialModifiers: Modifier[];
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

  const lang = $derived(engine.settings.language);

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

  setContext(EDITOR_CONTEXT_KEY, {
    feature: mockFeature,
    mode: 'edit' as const,
    store: null as unknown as HomebrewStore,
    get hasOverrideWarning() { return false; },
  });

  function apply(): void {
    onModifiersSaved(mockFeature.grantedModifiers);
  }
</script>

<Modal
  open={true}
  onClose={onclose}
  title={ui('editor.level_modifier.title', lang).replace('{n}', String(levelNumber))}
  size="xl"
  fullscreen={true}
>
  {#snippet children()}
    <div class="flex flex-col gap-4">
      <p class="text-xs text-text-muted">
        {ui('editor.level_modifier.desc', lang).replace(/\{n\}/g, String(levelNumber))}
      </p>

      <ModifierListEditor />

      <div class="flex justify-end gap-2 pt-3 border-t border-border">
        <button type="button" class="btn-ghost" onclick={onclose}>{ui('common.cancel', lang)}</button>
        <button type="button" class="btn-primary" onclick={apply}>{ui('common.apply', lang)}</button>
      </div>
    </div>
  {/snippet}
</Modal>
