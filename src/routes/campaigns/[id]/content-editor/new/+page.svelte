<!--
  @file src/routes/campaigns/[id]/content-editor/new/+page.svelte
  @description New Entity Page — 3-step wizard for authoring a homebrew entity.

  ────────────────────────────────────────────────────────────────────────────
  STEP 1 — Entity Type Selector (EntityTypeSelector.svelte)
    Card grid of all 11 FeatureCategory values.
    Selecting a category advances to Step 2.
    Skipped when cloneFrom param is present (category inferred from the clone).

  STEP 2 — Origin Toggle
    "Start from Scratch" vs "Clone an existing entity"
    Cloning opens EntitySearchModal; the selected entity pre-fills EntityForm.
    "Start from Scratch" proceeds directly to Step 3 with an empty draft.
    This step is also skipped when cloneFrom param is present.

  STEP 3 — EntityForm
    Full orchestrator form for the chosen category.
    On save: HomebrewStore.add() then redirect to the library.
  ────────────────────────────────────────────────────────────────────────────
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { homebrewStore } from '$lib/engine/HomebrewStore.svelte';
  import type { Feature, FeatureCategory } from '$lib/types/feature';
  import EntityTypeSelector from '$lib/components/content-editor/EntityTypeSelector.svelte';
  import EntitySearchModal from '$lib/components/content-editor/EntitySearchModal.svelte';
  import EntityForm from '$lib/components/content-editor/EntityForm.svelte';

  // ===========================================================================
  // ROUTE + AUTH GUARD
  // ===========================================================================

  const campaignId = $derived($page.params.id ?? '');

  $effect(() => {
    if (!sessionContext.isGameMaster) goto(`/campaigns/${campaignId}`);
  });

  $effect(() => {
    if (campaignId) sessionContext.setActiveCampaign(campaignId);
  });

  // ===========================================================================
  // LOAD DATA (cloneFrom URL param)
  // ===========================================================================

  const cloneFrom: string | undefined = $page.data?.cloneFrom;

  // ===========================================================================
  // WIZARD STATE
  // ===========================================================================

  type Step = 'type' | 'origin' | 'form';

  let step            = $state<Step>(cloneFrom ? 'form' : 'type');
  let selectedCategory = $state<FeatureCategory | null>(null);
  let initialData     = $state<Partial<Feature> | undefined>(undefined);
  let showClonePicker = $state(false);

  // ── If cloneFrom param is set, resolve the entity from the store ──────────
  $effect(() => {
    if (cloneFrom) {
      const entity =
        homebrewStore.getById(cloneFrom) ??
        // Fall back to DataLoader (cloning an SRD entity)
        (() => {
          // Import dynamically to avoid circular issues in this scope
          const { dataLoader } = homebrewStore as unknown as { dataLoader?: { getFeature: (id: string) => Feature | undefined } };
          return dataLoader?.getFeature(cloneFrom);
        })();

      if (entity) {
        selectedCategory = entity.category as FeatureCategory;
        initialData = { ...entity, id: '' };  // clear ID so user sets a new one
      }
    }
  });

  // ===========================================================================
  // STEP HANDLERS
  // ===========================================================================

  function selectCategory(cat: FeatureCategory): void {
    selectedCategory = cat;
    step = 'origin';
  }

  function startScratch(): void {
    initialData = undefined;
    step = 'form';
  }

  function handleCloneSelected(entity: Feature): void {
    selectedCategory = entity.category as FeatureCategory;
    initialData = { ...entity, id: '' };
    showClonePicker = false;
    step = 'form';
  }

  function handleSaved(saved: Feature): void {
    goto(`/campaigns/${campaignId}/content-editor`);
  }
</script>

<!-- Clone picker modal -->
{#if showClonePicker}
  <EntitySearchModal
    onEntityCloneSelected={handleCloneSelected}
    onclose={() => { showClonePicker = false; }}
  />
{/if}

<!-- ======================================================================== -->
<!-- PAGE                                                                      -->
<!-- ======================================================================== -->
<div class="flex flex-col gap-6 p-4 md:p-6 max-w-4xl mx-auto">

  <!-- Back link + title -->
  <div class="flex items-center gap-3">
    <a href="/campaigns/{campaignId}/content-editor"
       class="text-text-muted hover:text-text-primary transition-colors"
       aria-label="Back to Content Library">
      <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </a>
    <div>
      <h1 class="text-xl font-bold text-text-primary">New Entity</h1>
      {#if step !== 'type' && selectedCategory}
        <p class="text-xs text-text-muted">Category: <code class="font-mono">{selectedCategory}</code></p>
      {/if}
    </div>
  </div>

  <!-- ── STEP INDICATOR ──────────────────────────────────────────────────── -->
  {#if !cloneFrom}
    <ol class="flex items-center gap-2 text-xs text-text-muted">
      {#each ([['type','Choose Type'],['origin','Starting point'],['form','Author']] as const) as [s, lbl], i (s)}
        <li class="flex items-center gap-2">
          <span class="rounded-full h-5 w-5 flex items-center justify-center text-[10px] font-bold
                       {step === s ? 'bg-accent text-white' :
                        (i < ['type','origin','form'].indexOf(step)) ? 'bg-accent/30 text-accent' :
                        'bg-surface-alt text-text-muted'}">
            {i + 1}
          </span>
          <span class="{step === s ? 'text-text-primary font-medium' : ''}">{lbl}</span>
          {#if i < 2}
            <svg class="h-3 w-3 text-text-muted/50" xmlns="http://www.w3.org/2000/svg"
                 viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}

  <!-- ── STEP 1: ENTITY TYPE SELECTOR ─────────────────────────────────────── -->
  {#if step === 'type'}
    <EntityTypeSelector onCategorySelected={selectCategory} />

  <!-- ── STEP 2: ORIGIN TOGGLE ─────────────────────────────────────────────── -->
  {:else if step === 'origin'}
    <div class="flex flex-col gap-4">
      <p class="text-sm text-text-primary font-semibold">
        How would you like to start?
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <!-- Start from scratch -->
        <button
          type="button"
          class="flex flex-col gap-2 rounded-lg border border-border p-5 text-left
                 hover:border-accent/50 hover:bg-accent/5 transition-colors cursor-pointer"
          onclick={startScratch}
        >
          <span class="text-sm font-bold text-text-primary">Start from Scratch</span>
          <span class="text-xs text-text-muted leading-snug">
            Open an empty form for a brand-new entity. All fields start at their defaults.
          </span>
        </button>

        <!-- Clone an existing entity -->
        <button
          type="button"
          class="flex flex-col gap-2 rounded-lg border border-border p-5 text-left
                 hover:border-accent/50 hover:bg-accent/5 transition-colors cursor-pointer"
          onclick={() => (showClonePicker = true)}
        >
          <span class="text-sm font-bold text-text-primary">Clone an Existing Entity</span>
          <span class="text-xs text-text-muted leading-snug">
            Search the full SRD + homebrew catalog, copy a record as a starting point,
            and give it a new ID.
          </span>
        </button>
      </div>

      <button
        type="button"
        class="btn-ghost text-xs w-fit"
        onclick={() => { step = 'type'; selectedCategory = null; }}
      >
        ← Back to category selection
      </button>
    </div>

  <!-- ── STEP 3: ENTITY FORM ────────────────────────────────────────────────── -->
  {:else if step === 'form' && selectedCategory}
    <EntityForm
      category={selectedCategory}
      initialData={initialData}
      mode="create"
      onSaved={handleSaved}
    />
  {/if}

</div>
