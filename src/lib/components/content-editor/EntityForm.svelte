<!--
  @file src/lib/components/content-editor/EntityForm.svelte
  @description Orchestrator form — composes all sub-editors for a single Feature draft.

  RESPONSIBILITIES:
    1. Creates the EditorContext ($state draft + setContext) so all child
       sub-forms can read/mutate the draft without prop-drilling.
    2. Renders sub-forms in the specified order (see layout below).
    3. Validates required fields and saves via HomebrewStore.
    4. Exposes a "Save" button with an isSaving spinner.

  PROPS:
    category     — FeatureCategory for the new/edited entity.
    initialData  — Optional Partial<Feature> to pre-populate the draft.
    mode         — 'create' | 'edit'.

  LAYOUT ORDER:
    CoreFieldsSection             (always)
    ConditionNodeBuilder          (prerequisitesNode — collapsed when absent)
    ModifierListEditor            (always)
    GrantedFeaturesEditor         (always)
    ChoicesEditor                 (always)
    LevelProgressionEditor        (class only)
    ActivationEditor              (always)
    ResourcePoolEditor            (always)
    ActionBudgetEditor            (always)
    ItemDataEditor                (item only)
    MagicDataEditor               (magic only)
    RaceClassExtrasEditor         (race / class only)
    RawJsonPanel                  (always — at bottom)
    Save button
-->

<script lang="ts">
  import { setContext, untrack } from 'svelte';
  import { EDITOR_CONTEXT_KEY, defaultFeature, type EditorContext } from './editorContext';
  import { homebrewStore } from '$lib/engine/HomebrewStore.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import type { Feature, FeatureCategory } from '$lib/types/feature';
  import type { LogicNode } from '$lib/types/logic';

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

  // ===========================================================================
  // PROPS
  // ===========================================================================

  interface Props {
    /** Category for the entity being authored. */
    category: FeatureCategory;
    /** Pre-populate the draft (clone / edit flows). */
    initialData?: Partial<Feature>;
    /** 'create': store.add() on save. 'edit': store.update() on save. */
    mode: 'create' | 'edit';
    /** Called after a successful save. Parent handles navigation. */
    onSaved?: (feature: Feature) => void;
  }

  let { category, initialData, mode, onSaved }: Props = $props();

  // ===========================================================================
  // DRAFT FEATURE ($state) + EDITOR CONTEXT
  // ===========================================================================

  /** Deep-clone the initial data to isolate the draft from any source object.
   *  untrack() snapshots props at mount — these are setup parameters, not live bindings. */
  const feature = $state<Feature>(
    untrack(() => structuredClone({ ...defaultFeature(category), ...(initialData ?? {}) }))
  );

  /**
   * Whether feature.id matches an existing SRD/file entity.
   * Re-computed reactively because it reads feature.id ($state).
   */
  const hasOverrideWarning = $derived(
    feature.id.length > 0 &&
    dataLoader.getAllFeatures().some(
      f => f.id === feature.id && f.ruleSource !== 'user_homebrew'
    )
  );

  /** EditorContext provided to all child sub-forms.
   *  mode is snapshotted — it doesn't change after the form mounts.
   *  dataLoader is the application singleton; tests can override via setContext
   *  with a pre-populated DataLoader instance for full isolation. */
  const ctx: EditorContext = {
    feature,
    mode:       untrack(() => mode),
    store:      homebrewStore,
    dataLoader: dataLoader,
    get hasOverrideWarning() { return hasOverrideWarning; },
  };

  setContext(EDITOR_CONTEXT_KEY, ctx);

  // ===========================================================================
  // PREREQUISITE NODE SECTION TOGGLE
  // ===========================================================================

  let prereqExpanded = $state(!!feature.prerequisitesNode);

  // ===========================================================================
  // VALIDATION + SAVE
  // ===========================================================================

  let saveError = $state('');
  let saveSuccess = $state(false);

  function validate(): string {
    if (!feature.id.trim()) return 'Entity ID is required.';
    if (!feature.category)  return 'Category is required.';
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
      saveSuccess = true;
      setTimeout(() => { saveSuccess = false; }, 3000);
      onSaved?.(structuredClone(feature));
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Save failed.';
    }
  }

  // ===========================================================================
  // RAW JSON SYNC
  // ===========================================================================

  function handleRawJsonChange(parsed: Feature): void {
    // Apply all parsed fields to the $state draft.
    Object.assign(feature, parsed);
  }
</script>

<form
  class="flex flex-col gap-5"
  onsubmit={(e) => { e.preventDefault(); handleSave(); }}
>

  <!-- STICKY OVERRIDE WARNING BANNER
       Shown at the top of the form (sticky, always visible while scrolling)
       whenever the entity id collides with a non-homebrew SRD entity already
       in the DataLoader cache.
       CoreFieldsSection also shows an inline amber banner near the ID field —
       this sticky version ensures the warning is visible throughout long forms.
       ARCHITECTURE.md §21.5.4 — "Sticky Override Warning banner driven by
       ctx.hasOverrideWarning". -->
  {#if hasOverrideWarning}
    <div
      class="sticky top-0 z-10 flex items-start gap-3 rounded-lg border border-amber-600/40
             bg-amber-900/20 px-4 py-3 text-sm text-amber-300 shadow-lg"
      role="alert"
      aria-live="polite"
      data-testid="override-warning-banner"
    >
      <span class="text-lg leading-none select-none" aria-hidden="true">⚠</span>
      <div class="flex flex-col gap-0.5">
        <p class="font-semibold">Override Warning</p>
        <p class="text-xs text-amber-400/80">
          The ID <code class="font-mono">{feature.id}</code> already exists in a loaded rule
          source. This entity will <strong>override</strong> the existing one for this campaign.
          Use <code class="font-mono">merge: "partial"</code> to extend it additively.
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
      Prerequisites / Activation Condition
      <span class="text-xs font-normal text-text-muted">(logic tree — feat chain, ability prereqs)</span>
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
      <p class="text-sm text-green-400 flex-1">✓ Saved successfully.</p>
    {:else}
      <p class="text-xs text-text-muted flex-1">
        {mode === 'create' ? 'Creating new entity' : 'Editing entity'}
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
        Saving…
      {:else}
        {mode === 'create' ? 'Create Entity' : 'Save Changes'}
      {/if}
    </button>

  </div>

</form>
