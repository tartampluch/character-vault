<!--
  @file src/lib/components/content-editor/EntityForm.svelte
  @description Orchestrator form — composes all sub-editors for a single Feature draft.
-->

<script lang="ts">
  import { setContext, untrack } from 'svelte';
  import { EDITOR_CONTEXT_KEY, defaultFeature, type EditorContext } from './editorContext';
  import { homebrewStore } from '$lib/engine/HomebrewStore.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import type { Feature, FeatureCategory } from '$lib/types/feature';
  import type { LogicNode } from '$lib/types/logic';
  import { IconWarning, IconSuccess } from '$lib/components/ui/icons';

  import CoreFieldsSection       from './CoreFieldsSection.svelte';
  import ConditionNodeBuilder    from './ConditionNodeBuilder.svelte';
  import ModifierListEditor      from './ModifierListEditor.svelte';
  import GrantedFeaturesEditor   from './GrantedFeaturesEditor.svelte';
  import ChoicesEditor           from './ChoicesEditor.svelte';
  import LevelProgressionEditor  from './LevelProgressionEditor.svelte';
  import ActivationEditor        from './ActivationEditor.svelte';
  import ResourcePoolEditor      from './ResourcePoolEditor.svelte';
  import ActionBudgetEditor      from './ActionBudgetEditor.svelte';
  import ItemDataEditor          from './ItemDataEditor.svelte';
  import MagicDataEditor         from './MagicDataEditor.svelte';
  import RaceClassExtrasEditor   from './RaceClassExtrasEditor.svelte';
  import RawJsonPanel            from './RawJsonPanel.svelte';

  interface Props {
    category: FeatureCategory;
    initialData?: Partial<Feature>;
    mode: 'create' | 'edit';
    onSaved?: (feature: Feature) => void;
  }

  let { category, initialData, mode, onSaved }: Props = $props();
  const lang = $derived(engine.settings.language);

  const feature = $state<Feature>(
    untrack(() => structuredClone({ ...defaultFeature(category), ...(initialData ?? {}) }))
  );

  const hasOverrideWarning = $derived(
    feature.id.length > 0 &&
    dataLoader.getAllFeatures().some(
      f => f.id === feature.id && f.ruleSource !== 'user_homebrew'
    )
  );

  const ctx: EditorContext = {
    feature,
    mode:       untrack(() => mode),
    store:      homebrewStore,
    dataLoader: dataLoader,
    get hasOverrideWarning() { return hasOverrideWarning; },
  };

  setContext(EDITOR_CONTEXT_KEY, ctx);

  let prereqExpanded = $state(!!feature.prerequisitesNode);

  let saveError = $state('');
  let saveSuccess = $state(false);

  function validate(): string {
    if (!feature.id.trim()) return ui('editor.form.validation_id_required', engine.settings.language);
    if (!feature.category)  return ui('editor.form.validation_category_required', engine.settings.language);
    return '';
  }

  async function handleSave(): Promise<void> {
    saveError   = '';
    saveSuccess = false;
    const err   = validate();
    if (err) { saveError = err; return; }

    try {
      if (mode === 'create') {
        homebrewStore.add(structuredClone(feature));
      } else {
        homebrewStore.update(feature.id, structuredClone(feature));
      }
      // Persist to the server immediately (no auto-save).
      await homebrewStore.save();
      saveSuccess = true;
      setTimeout(() => { saveSuccess = false; }, 3000);
      onSaved?.(structuredClone(feature));
    } catch (e) {
      saveError = e instanceof Error ? e.message : ui('editor.form.save_failed', engine.settings.language);
    }
  }

  function handleRawJsonChange(parsed: Feature): void {
    Object.assign(feature, parsed);
  }
</script>

<form
  class="flex flex-col gap-5"
  onsubmit={(e) => { e.preventDefault(); handleSave(); }}
>

  <!-- STICKY OVERRIDE WARNING BANNER -->
  {#if hasOverrideWarning}
    <div
      class="sticky top-0 z-10 flex items-start gap-3 rounded-lg border border-amber-600/40
             bg-amber-900/20 px-4 py-3 text-sm text-amber-300 shadow-lg"
      role="alert"
      aria-live="polite"
      data-testid="override-warning-banner"
    >
      <IconWarning size={18} class="shrink-0" aria-hidden="true" />
      <div class="flex flex-col gap-0.5">
        <p class="font-semibold">{ui('editor.form.override_warning_title', lang)}</p>
        <p class="text-xs text-amber-400/80">
          {ui('editor.form.override_warning_desc', lang).replace('{id}', feature.id)}
        </p>
      </div>
    </div>
  {/if}

  <!-- CORE FIELDS (always) -->
  <CoreFieldsSection />

  <!-- PREREQUISITES (collapsible) -->
  <div class="flex flex-col gap-2">
    <label class="flex items-center gap-2 cursor-pointer text-sm font-semibold text-text-primary select-none">
      <input
        type="checkbox"
        class="h-4 w-4 accent-accent"
        checked={prereqExpanded}
        onchange={(e) => {
          prereqExpanded = (e.currentTarget as HTMLInputElement).checked;
          if (!prereqExpanded) feature.prerequisitesNode = undefined;
        }}
      />
      {ui('editor.form.prerequisites_label', lang)}
      <span class="text-xs font-normal text-text-muted">{ui('editor.form.prerequisites_hint', lang)}</span>
    </label>

    {#if prereqExpanded}
      <div class="ml-6">
        <ConditionNodeBuilder
          node={feature.prerequisitesNode}
          onNodeChanged={(n: LogicNode | undefined) => { feature.prerequisitesNode = n; }}
        />
      </div>
    {/if}
  </div>

  <!-- MODIFIERS -->
  <ModifierListEditor />

  <!-- GRANTED FEATURES -->
  <GrantedFeaturesEditor />

  <!-- CHOICES -->
  <ChoicesEditor />

  <!-- LEVEL PROGRESSION (class only) -->
  {#if feature.category === 'class'}
    <LevelProgressionEditor />
  {/if}

  <!-- ACTIVATION -->
  <ActivationEditor />

  <!-- RESOURCE POOLS -->
  <ResourcePoolEditor />

  <!-- ACTION BUDGET -->
  <ActionBudgetEditor />

  <!-- ITEM DATA (item only) -->
  {#if feature.category === 'item'}
    <ItemDataEditor />
  {/if}

  <!-- MAGIC DATA (magic only) -->
  {#if feature.category === 'magic'}
    <MagicDataEditor />
  {/if}

  <!-- RACE / CLASS EXTRAS -->
  {#if feature.category === 'race' || feature.category === 'class'}
    <RaceClassExtrasEditor />
  {/if}

  <!-- RAW JSON PANEL -->
  <RawJsonPanel onRawJsonChange={handleRawJsonChange} />

  <!-- ── SAVE BAR ───────────────────────────────────────────────────────────── -->
  <div class="sticky bottom-0 left-0 right-0 flex items-center gap-3
              border-t border-border bg-surface/95 backdrop-blur px-4 py-3 -mx-4 md:-mx-6">

    <!-- Validation / save error -->
    {#if saveError}
      <p class="text-sm text-red-400 flex-1" role="alert">{saveError}</p>
    {:else if saveSuccess}
      <p class="flex items-center gap-1.5 text-sm text-green-400 flex-1">
        <IconSuccess size={14} aria-hidden="true" />
        {ui('editor.form.saved_successfully', lang)}
      </p>
    {:else}
      <p class="text-xs text-text-muted flex-1">
        {mode === 'create' ? ui('editor.form.creating_entity', lang) : ui('editor.form.editing_entity', lang)}
        {#if feature.id}— <code class="font-mono">{feature.id}</code>{/if}
      </p>
    {/if}

    <!-- Save button -->
    <button
      type="submit"
      class="btn-primary flex items-center gap-2"
      disabled={homebrewStore.isSaving}
    >
      {#if homebrewStore.isSaving}
        <span class="inline-block h-4 w-4 rounded-full border-2 border-white/50
                     border-t-white animate-spin" aria-hidden="true"></span>
        {ui('editor.form.saving_spinner', lang)}
      {:else}
        {mode === 'create' ? ui('editor.form.create_entity_btn', lang) : ui('editor.form.save_changes_btn', lang)}
      {/if}
    </button>

  </div>

</form>
