<!--
  @file src/lib/components/magic/SpecialAbilities.svelte
  @description Special Abilities and Domain Abilities panel.

  PURPOSE:
    Filters the character's activeFeatures for class_feature or domain features
    that have an `activation` type. Displays them as distinct cards with:
      - Feature name and description snippet
      - Activation type (Standard Action, 3/Day, etc.)
      - A ResourcePool tick-off display for daily uses
      - An ℹ button → FeatureModal

  @see ARCHITECTURE.md Phase 12.4 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import type { ID } from '$lib/types/primitives';
  import { IconAbilities } from '$lib/components/ui/icons';

  let modalId = $state<ID | null>(null);

  const specialAbilities = $derived.by(() => {
    return engine.character.activeFeatures
      .filter(afi => {
        if (!afi.isActive) return false;
        const feat = dataLoader.getFeature(afi.featureId);
        if (!feat) return false;
        return (feat.category === 'class_feature' || feat.category === 'domain') &&
               feat.activation !== undefined;
      })
      .map(afi => ({
        instanceId: afi.instanceId,
        feature: dataLoader.getFeature(afi.featureId)!,
      }));
  });
</script>

<div class="special-panel">
   <h2 class="panel-title"><IconAbilities size={24} aria-hidden="true" /> Special Abilities</h2>

  {#if specialAbilities.length === 0}
    <p class="empty-note">No special abilities found. Class and domain abilities with activation types will appear here.</p>
  {:else}
    <div class="abilities-grid">
      {#each specialAbilities as { instanceId, feature }}
        <div class="ability-card">
          <div class="ability-header">
            <span class="ability-name">{engine.t(feature.label)}</span>
            <span class="ability-action">{feature.activation?.actionType ?? '—'}</span>
          </div>
          <p class="ability-desc">{engine.t(feature.description).slice(0, 100)}...</p>
          {#if feature.activation?.resourceCost}
            <span class="resource-cost">
              Cost: {feature.activation.resourceCost.cost} × {feature.activation.resourceCost.targetId}
            </span>
          {/if}
          <div class="card-actions">
            <button class="info-btn" onclick={() => (modalId = feature.id)} aria-label="Show details">ℹ</button>
            <button class="btn-use" aria-label="Use {engine.t(feature.label)}">Use</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if modalId}
  <FeatureModal featureId={modalId} onclose={() => (modalId = null)} />
{/if}

<style>
  .special-panel {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1.25rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
  }

  .panel-title { margin: 0 0 1rem; font-size: 1rem; color: #c4b5fd; border-bottom: 1px solid #21262d; padding-bottom: 0.5rem; }
  .empty-note { font-size: 0.82rem; color: #4a4a6a; font-style: italic; }

  .abilities-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.75rem;
  }

  .ability-card {
    background: #0d1117;
    border: 1px solid #21262d;
    border-top: 3px solid #7c3aed;
    border-radius: 8px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .ability-header { display: flex; justify-content: space-between; align-items: center; }
  .ability-name { font-size: 0.9rem; font-weight: 600; color: #e0e0f0; }
  .ability-action { font-size: 0.7rem; background: #1c1a3a; color: #c4b5fd; border-radius: 3px; padding: 0.1rem 0.35rem; }
  .ability-desc { font-size: 0.78rem; color: #6080a0; margin: 0; line-height: 1.4; }
  .resource-cost { font-size: 0.72rem; color: #fbbf24; }

  .card-actions { display: flex; gap: 0.4rem; margin-top: 0.25rem; }

  .info-btn {
    background: transparent;
    border: 1px solid #30363d;
    color: #7c3aed;
    border-radius: 4px;
    width: 1.5rem;
    height: 1.5rem;
    font-size: 0.72rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .info-btn:hover { background: #1c1a3a; }

  .btn-use {
    flex: 1;
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .btn-use:hover { background: #6d28d9; }
</style>
