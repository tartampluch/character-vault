<!--
  @file src/lib/components/feats/FeatSelectionModal.svelte
  @description Feat catalog modal with search, filtering, and prerequisite evaluation.

  PURPOSE:
    Fetches all features with category: "feat" from the DataLoader cache.
    Implements:
      - Text search bar (filters by title + description)
      - Tag badges display (fighter_bonus_feat, metamagic, general, etc.)
      - Phase 11.4 prerequisite evaluation inline (green = met, red = unmet)
      - "Select" button adds the feat as an ActiveFeatureInstance

  @see src/lib/utils/logicEvaluator.ts for prerequisite evaluation.
  @see ARCHITECTURE.md Phase 11.3-11.4 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { evaluateLogicNode } from '$lib/utils/logicEvaluator';
  import type { ID } from '$lib/types/primitives';
  import type { Feature } from '$lib/types/feature';

  // ============================================================
  // PROPS
  // ============================================================
  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  // ============================================================
  // STATE
  // ============================================================
  let searchQuery = $state('');
  let selectedTagFilter = $state('');

  // ============================================================
  // ALL FEAT FEATURES
  // ============================================================
  const allFeats = $derived(dataLoader.queryFeatures('category:feat'));

  /** Unique tag values across all feats for the filter dropdown. */
  const allTags = $derived.by(() => {
    const tagSet = new Set<string>();
    for (const feat of allFeats) {
      for (const tag of feat.tags) {
        // Skip the feat's own ID tag and generic "feat" tag
        if (tag !== 'feat' && !tag.startsWith('feat_') && tag.length > 2) {
          tagSet.add(tag);
        }
      }
    }
    return Array.from(tagSet).sort();
  });

  /** Filtered feat list based on search query and tag filter. */
  const filteredFeats = $derived.by(() => {
    const query = searchQuery.toLowerCase().trim();
    return allFeats.filter(feat => {
      // Tag filter
      if (selectedTagFilter && !feat.tags.includes(selectedTagFilter)) return false;

      // Text search: match label or description
      if (query) {
        const labelMatch = engine.t(feat.label).toLowerCase().includes(query);
        const descMatch = engine.t(feat.description).toLowerCase().includes(query);
        if (!labelMatch && !descMatch) return false;
      }

      return true;
    });
  });

  // ============================================================
  // PREREQUISITE EVALUATION
  // ============================================================

  /** Returns the prerequisite evaluation for a feat. */
  function evalPrereqs(feat: Feature) {
    return evaluateLogicNode(feat.prerequisitesNode, engine.phase2_context);
  }

  // ============================================================
  // FEAT SELECTION
  // ============================================================

  function selectFeat(feat: Feature) {
    const prereqResult = evalPrereqs(feat);
    if (!prereqResult.passed) return;

    const instanceId = `afi_feat_${feat.id}_${Date.now()}`;
    engine.addFeature({
      instanceId,
      featureId: feat.id,
      isActive: true,
    });
    onclose();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') onclose();
  }
</script>

<!-- svelte-ignore a11y-interactive-supports-focus -->
<div
  class="modal-backdrop"
  role="dialog"
  aria-modal="true"
  aria-label="Feat catalog"
  onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) onclose(); }}
  onkeydown={handleKeyDown}
>
  <div class="modal-panel">
    <header class="modal-header">
      <h2 class="modal-title">🌟 Feat Catalog</h2>
      <div class="header-meta">
        <span class="slots-left">
          {engine.phase_featSlotsRemaining} slot{engine.phase_featSlotsRemaining !== 1 ? 's' : ''} left
        </span>
      </div>
      <button class="modal-close" onclick={onclose} aria-label="Close catalog">×</button>
    </header>

    <!-- Search & Filter bar -->
    <div class="search-bar">
      <input
        type="search"
        bind:value={searchQuery}
        placeholder="Search feats..."
        class="search-input"
        autofocus
        aria-label="Search feats by name or description"
      />
      <select
        bind:value={selectedTagFilter}
        class="tag-filter"
        aria-label="Filter by tag"
      >
        <option value="">All tags</option>
        {#each allTags as tag}
          <option value={tag}>{tag}</option>
        {/each}
      </select>
    </div>

    <!-- Results count -->
    <p class="results-count">
      {filteredFeats.length} feat{filteredFeats.length !== 1 ? 's' : ''} found
      {#if allFeats.length === 0}
        — load a rule source with feats to populate this catalog.
      {/if}
    </p>

    <!-- Feat list -->
    <div class="feat-catalog" role="list">
      {#each filteredFeats as feat}
        {@const prereq = evalPrereqs(feat)}
        {@const canSelect = prereq.passed && engine.phase_featSlotsRemaining > 0}
        {@const alreadyHave = engine.character.activeFeatures.some(afi => afi.featureId === feat.id)}

        <div
          class="feat-entry"
          class:prereq-met={prereq.passed}
          class:prereq-unmet={!prereq.passed}
          class:already-have={alreadyHave}
          role="listitem"
          aria-label="{engine.t(feat.label)}: {prereq.passed ? 'prerequisites met' : 'prerequisites not met'}"
        >
          <!-- Left: Name and tags -->
          <div class="entry-info">
            <div class="entry-name-row">
              <span class="entry-name">{engine.t(feat.label)}</span>
              {#if alreadyHave}
                <span class="already-badge">✓ Have</span>
              {/if}
            </div>
            <p class="entry-desc">{engine.t(feat.description).slice(0, 120)}...</p>
            <!-- Tag badges -->
            <div class="entry-tags">
              {#each feat.tags.filter(t => t !== 'feat' && !t.startsWith('feat_')) as tag}
                <span class="entry-tag">{tag}</span>
              {/each}
            </div>

            <!-- Prerequisite display (Phase 11.4) -->
            {#if feat.prerequisitesNode}
              <div class="prereq-list">
                {#each prereq.metMessages as msg}
                  <span class="prereq-met-msg">✅ {msg}</span>
                {/each}
                {#each prereq.errorMessages as msg}
                  <span class="prereq-err-msg">❌ {msg}</span>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Right: Select button -->
          <button
            class="btn-select"
            onclick={() => selectFeat(feat)}
            disabled={!canSelect || alreadyHave}
            aria-label="{alreadyHave ? 'Already have this feat' : canSelect ? 'Select ' + engine.t(feat.label) : 'Cannot select: prerequisites not met'}"
          >
            {#if alreadyHave}
              ✓
            {:else if !prereq.passed}
              🔒
            {:else}
              Select
            {/if}
          </button>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .modal-panel {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 12px;
    width: 100%;
    max-width: 640px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
  }

  /* ========================= HEADER ========================= */
  .modal-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.25rem 0.75rem;
    border-bottom: 1px solid #21262d;
    flex-shrink: 0;
  }

  .modal-title { margin: 0; font-size: 1rem; color: #f0f0ff; }

  .header-meta { flex: 1; }

  .slots-left {
    font-size: 0.8rem;
    background: #1c1a3a;
    color: #c4b5fd;
    border: 1px solid #4c35a0;
    border-radius: 4px;
    padding: 0.15rem 0.5rem;
  }

  .modal-close {
    background: transparent;
    border: 1px solid #30363d;
    color: #8080a0;
    border-radius: 4px;
    width: 1.8rem;
    height: 1.8rem;
    cursor: pointer;
    font-size: 1rem;
    flex-shrink: 0;
  }
  .modal-close:hover { color: #f0f0ff; }

  /* ========================= SEARCH ========================= */
  .search-bar {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid #21262d;
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #e0e0f0;
    padding: 0.4rem 0.6rem;
    font-size: 0.9rem;
    font-family: inherit;
  }
  .search-input:focus { outline: none; border-color: #7c3aed; }

  .tag-filter {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #e0e0f0;
    padding: 0.4rem 0.5rem;
    font-size: 0.82rem;
    font-family: inherit;
    max-width: 140px;
  }

  .results-count {
    font-size: 0.75rem;
    color: #4a4a6a;
    padding: 0.2rem 1.25rem;
    margin: 0;
    border-bottom: 1px solid #21262d;
    flex-shrink: 0;
  }

  /* ========================= CATALOG ========================= */
  .feat-catalog {
    overflow-y: auto;
    flex: 1;
    padding: 0.5rem 1.25rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .feat-entry {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 8px;
    padding: 0.6rem 0.75rem;
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    transition: border-color 0.15s;
  }

  .feat-entry.prereq-met { border-left: 3px solid #166534; }
  .feat-entry.prereq-unmet { border-left: 3px solid #7f1d1d; opacity: 0.75; }
  .feat-entry.already-have { background: #0f1a0f; border-color: #1a3a1a; }

  .entry-info { flex: 1; display: flex; flex-direction: column; gap: 0.2rem; }

  .entry-name-row { display: flex; align-items: center; gap: 0.4rem; }
  .entry-name { font-size: 0.9rem; font-weight: 500; color: #e0e0f0; }

  .already-badge {
    font-size: 0.68rem;
    background: #0f2a0f;
    color: #4ade80;
    border: 1px solid #166534;
    border-radius: 3px;
    padding: 0.05rem 0.3rem;
  }

  .entry-desc {
    font-size: 0.78rem;
    color: #6080a0;
    margin: 0;
    line-height: 1.4;
  }

  .entry-tags { display: flex; flex-wrap: wrap; gap: 0.2rem; }
  .entry-tag {
    font-size: 0.65rem;
    background: #1c1a3a;
    color: #7c3aed;
    border: 1px solid #2d1b69;
    border-radius: 3px;
    padding: 0.03rem 0.3rem;
    font-family: monospace;
  }

  /* ========================= PREREQS ========================= */
  .prereq-list { display: flex; flex-direction: column; gap: 0.1rem; margin-top: 0.2rem; }
  .prereq-met-msg { font-size: 0.72rem; color: #86efac; }
  .prereq-err-msg { font-size: 0.72rem; color: #f87171; }

  /* ========================= SELECT BUTTON ========================= */
  .btn-select {
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 0.25rem 0.75rem;
    font-size: 0.8rem;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s;
    white-space: nowrap;
    align-self: flex-start;
    margin-top: 0.15rem;
  }

  .btn-select:hover:not(:disabled) { background: #6d28d9; }
  .btn-select:disabled { background: #21262d; color: #4a4a6a; cursor: not-allowed; }
</style>
