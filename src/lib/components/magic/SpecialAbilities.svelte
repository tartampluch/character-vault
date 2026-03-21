<!--
  @file src/lib/components/magic/SpecialAbilities.svelte
  @description Special Abilities and Domain Abilities panel.
  Phase 19.10: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT:
    Responsive card grid (auto-fill, min 200px). Each ability card:
      - Accent top border.
      - Name + activation type badge.
      - 100-char description snippet.
      - Resource cost indicator.
      - Info + Use action buttons.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import type { ID } from '$lib/types/primitives';
  import { IconAbilities, IconInfo } from '$lib/components/ui/icons';

  let modalId = $state<ID | null>(null);

  const specialAbilities = $derived.by(() =>
    engine.character.activeFeatures
      .filter(afi => {
        if (!afi.isActive) return false;
        const feat = dataLoader.getFeature(afi.featureId);
        if (!feat) return false;
        return (feat.category === 'class_feature' || feat.category === 'domain') && feat.activation !== undefined;
      })
      .map(afi => ({ instanceId: afi.instanceId, feature: dataLoader.getFeature(afi.featureId)! }))
  );
</script>

<div class="card p-4 flex flex-col gap-3">

  <div class="section-header border-b border-border pb-2">
    <IconAbilities size={20} aria-hidden="true" />
    <span>Special Abilities</span>
  </div>

  {#if specialAbilities.length === 0}
    <p class="text-sm text-text-muted italic">
      No special abilities found. Class and domain abilities with activation types will appear here.
    </p>
  {:else}
    <!-- Responsive card grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {#each specialAbilities as { instanceId, feature }}
        <div
          class="flex flex-col gap-2 p-3 rounded-lg border border-border bg-surface-alt"
          style="border-top: 3px solid var(--theme-accent);"
        >
          <!-- Header: name + action type badge -->
          <div class="flex items-start justify-between gap-2">
            <span class="text-sm font-semibold text-text-primary leading-tight">{engine.t(feature.label)}</span>
            <span class="badge-accent text-[10px] shrink-0">{feature.activation?.actionType ?? '—'}</span>
          </div>

          <!-- Description snippet -->
          <p class="text-xs text-text-secondary leading-snug line-clamp-2">
            {engine.t(feature.description).slice(0, 100)}…
          </p>

          <!-- Resource cost -->
          {#if feature.activation?.resourceCost}
            <span class="text-xs text-yellow-500 dark:text-yellow-400">
              Cost: {feature.activation.resourceCost.cost} × {feature.activation.resourceCost.targetId}
            </span>
          {/if}

          <!-- Action buttons -->
          <div class="flex gap-1.5 mt-auto pt-1">
            <button
              class="btn-ghost p-1.5 text-accent hover:bg-accent/10"
              onclick={() => (modalId = feature.id)}
              aria-label="Show details"
              type="button"
            ><IconInfo size={14} aria-hidden="true" /></button>
            <button
              class="flex-1 btn-primary text-xs py-1.5"
              aria-label="Use {engine.t(feature.label)}"
              type="button"
            >Use</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

</div>

{#if modalId}
  <FeatureModal featureId={modalId} onclose={() => (modalId = null)} />
{/if}
