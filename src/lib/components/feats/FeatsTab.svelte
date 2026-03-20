<!--
  @file src/lib/components/feats/FeatsTab.svelte
  @description Feats management tab: slot tracking, granted feats list, manual feats list.

  PURPOSE:
    - Header showing "Feats Available" and "Feats Left" (from phase_featSlotsTotal/Remaining).
    - "Granted Feats" section: read-only, sorted by source (Race/Class label).
    - "Selected Feats" section: deletable, with "Add Feat" button → FeatSelectionModal.

  @see src/lib/engine/GameEngine.svelte.ts for phase_featSlots* derived values.
  @see ARCHITECTURE.md Phase 11.2 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import FeatSelectionModal from './FeatSelectionModal.svelte';
  import type { ID } from '$lib/types/primitives';

  // ============================================================
  // DERIVED FEAT LISTS
  // ============================================================

  /**
   * All active features of category "feat", split into granted vs manual.
   */
  const grantedFeatInstances = $derived.by(() => {
    const grantedIds = engine.phase_grantedFeatIds;
    return engine.character.activeFeatures.filter(afi => {
      if (!afi.isActive) return false;
      const feature = dataLoader.getFeature(afi.featureId);
      return feature?.category === 'feat' && grantedIds.has(afi.featureId);
    });
  });

  const manualFeatInstances = $derived.by(() => {
    const grantedIds = engine.phase_grantedFeatIds;
    return engine.character.activeFeatures.filter(afi => {
      if (!afi.isActive) return false;
      const feature = dataLoader.getFeature(afi.featureId);
      return feature?.category === 'feat' && !grantedIds.has(afi.featureId);
    });
  });

  /**
   * Finds the "source" label of a granted feat: the name of the parent feature
   * that grants it (e.g., "Fighter", "Human").
   */
  function getGrantSource(featId: string): string {
    for (const afi of engine.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feature = dataLoader.getFeature(afi.featureId);
      if (!feature) continue;
      if ((feature.grantedFeatures ?? []).includes(featId)) {
        return engine.t(feature.label);
      }
      if (feature.category === 'class' && feature.levelProgression) {
        const classLevel = engine.character.classLevels[feature.id] ?? 0;
        for (const entry of feature.levelProgression) {
          if (entry.level <= classLevel && entry.grantedFeatures.includes(featId)) {
            return `${engine.t(feature.label)} ${entry.level}`;
          }
        }
      }
    }
    return 'Unknown';
  }

  // ============================================================
  // MODAL STATE
  // ============================================================
  let modalFeatId = $state<ID | null>(null);
  let showAddModal = $state(false);

  const isOverBudget = $derived(engine.phase_featSlotsRemaining < 0);
</script>

<div class="feats-tab">

  <!-- ========================================================= -->
  <!-- HEADER: Feat Slot Budget -->
  <!-- ========================================================= -->
  <div class="feats-header">
    <h2 class="feats-title">🌟 Feats</h2>
    <div class="slot-display" class:over={isOverBudget}>
      <span class="slot-label">Feats Available:</span>
      <span class="slot-value">{engine.phase_featSlotsTotal}</span>
      <span class="slot-sep">|</span>
      <span class="slot-label">Remaining:</span>
      <span class="slot-remaining" class:over={isOverBudget}>
        {engine.phase_featSlotsRemaining}
      </span>
    </div>
    <button
      class="btn-add-feat"
      onclick={() => (showAddModal = true)}
      disabled={engine.phase_featSlotsRemaining <= 0}
      aria-label="Add a new feat ({engine.phase_featSlotsRemaining} slots remaining)"
    >
      ✚ Add Feat
    </button>
  </div>

  <!-- ========================================================= -->
  <!-- GRANTED FEATS (read-only) -->
  <!-- ========================================================= -->
  {#if grantedFeatInstances.length > 0}
    <section class="feats-section">
      <h3 class="section-title">🔒 Granted Feats (automatic)</h3>
      <div class="feat-list">
        {#each grantedFeatInstances as afi}
          {@const feat = dataLoader.getFeature(afi.featureId)}
          {#if feat}
            <div class="feat-card granted">
              <div class="feat-info">
                <span class="feat-name">{engine.t(feat.label)}</span>
                <span class="feat-source">from: {getGrantSource(feat.id)}</span>
              </div>
              <div class="feat-actions">
                <button
                  class="info-btn"
                  onclick={() => (modalFeatId = feat.id)}
                  aria-label="Show {engine.t(feat.label)} details"
                >ℹ</button>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </section>
  {/if}

  <!-- ========================================================= -->
  <!-- MANUALLY SELECTED FEATS (deletable) -->
  <!-- ========================================================= -->
  <section class="feats-section">
    <h3 class="section-title">🎯 Selected Feats</h3>
    {#if manualFeatInstances.length === 0}
      <p class="empty-note">
        No feats selected yet. Click "✚ Add Feat" to choose from the catalog.
        {engine.phase_featSlotsTotal - grantedFeatInstances.length} slot{engine.phase_featSlotsTotal - grantedFeatInstances.length !== 1 ? 's' : ''} available.
      </p>
    {:else}
      <div class="feat-list">
        {#each manualFeatInstances as afi}
          {@const feat = dataLoader.getFeature(afi.featureId)}
          {#if feat}
            <div class="feat-card manual">
              <div class="feat-info">
                <span class="feat-name">{engine.t(feat.label)}</span>
                {#if feat.tags.length > 0}
                  <div class="feat-tags">
                    {#each feat.tags.slice(0, 3) as tag}
                      <span class="feat-tag">{tag.replace('feat_', '')}</span>
                    {/each}
                  </div>
                {/if}
              </div>
              <div class="feat-actions">
                <button
                  class="info-btn"
                  onclick={() => (modalFeatId = feat.id)}
                  aria-label="Show {engine.t(feat.label)} details"
                >ℹ</button>
                <button
                  class="delete-btn"
                  onclick={() => engine.removeFeature(afi.instanceId)}
                  aria-label="Remove {engine.t(feat.label)}"
                  title="Remove this feat (frees a slot)"
                >×</button>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </section>

  {#if showAddModal}
    <FeatSelectionModal onclose={() => (showAddModal = false)} />
  {/if}

</div>

<!-- Feature Details Modal -->
{#if modalFeatId}
  <FeatureModal featureId={modalFeatId} onclose={() => (modalFeatId = null)} />
{/if}

<style>
  .feats-tab {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1.25rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  /* ========================= HEADER ========================= */
  .feats-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.75rem;
  }

  .feats-title { margin: 0; font-size: 1rem; color: #c4b5fd; }

  .slot-display {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.85rem;
    flex: 1;
  }

  .slot-label { color: #6080a0; }
  .slot-value { color: #c4b5fd; font-weight: bold; }
  .slot-sep   { color: #30363d; }
  .slot-remaining { color: #4ade80; font-weight: bold; }
  .slot-remaining.over { color: #f87171; }
  .slot-display.over { background: #1c0000; border-radius: 4px; padding: 0.1rem 0.4rem; }

  .btn-add-feat {
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.4rem 0.9rem;
    font-size: 0.85rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  }
  .btn-add-feat:hover:not(:disabled) { background: #6d28d9; }
  .btn-add-feat:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ========================= SECTIONS ========================= */
  .feats-section { display: flex; flex-direction: column; gap: 0.5rem; }

  .section-title {
    margin: 0;
    font-size: 0.85rem;
    color: #7c3aed;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.3rem;
  }

  .empty-note { font-size: 0.82rem; color: #4a4a6a; font-style: italic; margin: 0; }

  /* ========================= FEAT CARDS ========================= */
  .feat-list { display: flex; flex-direction: column; gap: 0.4rem; }

  .feat-card {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    transition: border-color 0.15s;
  }

  .feat-card:hover { border-color: #4c35a0; }

  .feat-card.granted {
    border-left: 3px solid #166534;
    opacity: 0.85;
  }

  .feat-card.manual {
    border-left: 3px solid #7c3aed;
  }

  .feat-info { flex: 1; display: flex; flex-direction: column; gap: 0.15rem; }
  .feat-name { font-size: 0.9rem; color: #e0e0f0; font-weight: 500; }
  .feat-source { font-size: 0.72rem; color: #4ade80; }

  .feat-tags { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .feat-tag {
    font-size: 0.68rem;
    background: #1c1a3a;
    color: #7c3aed;
    border: 1px solid #2d1b69;
    border-radius: 3px;
    padding: 0.05rem 0.3rem;
  }

  .feat-actions { display: flex; gap: 0.3rem; flex-shrink: 0; }

  .info-btn, .delete-btn {
    background: transparent;
    border: 1px solid #30363d;
    border-radius: 4px;
    width: 1.6rem;
    height: 1.6rem;
    font-size: 0.8rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }

  .info-btn { color: #7c3aed; }
  .info-btn:hover { background: #1c1a3a; border-color: #7c3aed; }
  .delete-btn { color: #f87171; }
  .delete-btn:hover { background: #1c0000; border-color: #dc2626; }

</style>
