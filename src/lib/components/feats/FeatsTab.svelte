<!--
  @file src/lib/components/feats/FeatsTab.svelte
  @description Feats management tab: slot tracking, granted feats, manual feats.
  Phase 19.10: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT:
    Header: section title + feat slot budget badges + "Add Feat" button.
    Granted feats section: green-left-border cards, lock icon, info button only.
    Selected feats section: accent-left-border cards, tag badges, info + delete buttons.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { ui } from '$lib/i18n/ui-strings';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import FeatSelectionModal from './FeatSelectionModal.svelte';
  import type { ID } from '$lib/types/primitives';
  import { IconTabFeats, IconLocked, IconInfo, IconAdd, IconDelete } from '$lib/components/ui/icons';

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

  function getGrantSource(featId: string): string {
    for (const afi of engine.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feature = dataLoader.getFeature(afi.featureId);
      if (!feature) continue;
      if ((feature.grantedFeatures ?? []).includes(featId)) return engine.t(feature.label);
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

  let modalFeatId  = $state<ID | null>(null);
  let showAddModal = $state(false);
  const isOverBudget = $derived(engine.phase_featSlotsRemaining < 0);
</script>

<div class="card p-4 flex flex-col gap-4">

  <!-- Header: title + slot budget + add button -->
  <div class="flex items-center flex-wrap gap-2 border-b border-border pb-3">
    <div class="section-header flex-1">
      <IconTabFeats size={20} aria-hidden="true" />
      <span>{ui('feats.title', engine.settings.language)}</span>
    </div>

    <!-- Slot budget badges -->
    <div class="flex items-center gap-1.5 text-sm">
      <span class="text-text-muted text-xs">{ui('feats.available', engine.settings.language)}</span>
      <span class="badge-accent">{engine.phase_featSlotsTotal}</span>
      <span class="text-text-muted">|</span>
      <span class="text-xs text-text-muted">{ui('feats.remaining', engine.settings.language)}</span>
      <span class="{isOverBudget ? 'badge-red' : 'badge-green'}">{engine.phase_featSlotsRemaining}</span>
    </div>

    <button
      class="btn-primary gap-1"
      onclick={() => (showAddModal = true)}
      disabled={engine.phase_featSlotsRemaining <= 0}
      aria-label="Add a new feat ({engine.phase_featSlotsRemaining} slots remaining)"
      type="button"
    >
      <IconAdd size={14} aria-hidden="true" /> {ui('feats.add', engine.settings.language)}
    </button>
  </div>

  <!-- Granted feats (read-only, green left border) -->
  {#if grantedFeatInstances.length > 0}
    <section class="flex flex-col gap-2">
      <div class="flex items-center gap-1.5 border-b border-border pb-1">
        <IconLocked size={14} class="text-green-500" aria-hidden="true" />
        <span class="text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">
          {ui('feats.granted', engine.settings.language)}
        </span>
      </div>
      <div class="flex flex-col gap-1.5">
        {#each grantedFeatInstances as afi}
          {@const feat = dataLoader.getFeature(afi.featureId)}
          {#if feat}
            <div class="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-surface-alt
                        border-l-4 border-l-green-600 dark:border-l-green-500 opacity-90
                        hover:border-border transition-colors duration-150">
              <div class="flex-1 flex flex-col gap-0.5 min-w-0">
                <span class="text-sm font-medium text-text-primary truncate">{engine.t(feat.label)}</span>
                <span class="text-xs text-green-500 dark:text-green-400">{ui('feats.from', engine.settings.language)} {getGrantSource(feat.id)}</span>
              </div>
              <button
                class="btn-ghost p-1.5 text-accent hover:bg-accent/10 shrink-0"
                onclick={() => (modalFeatId = feat.id)}
                aria-label="Show {engine.t(feat.label)} details"
                type="button"
              ><IconInfo size={14} aria-hidden="true" /></button>
            </div>
          {/if}
        {/each}
      </div>
    </section>
  {/if}

  <!-- Manually selected feats (deletable, accent left border) -->
  <section class="flex flex-col gap-2">
    <div class="flex items-center gap-1.5 border-b border-border pb-1">
      <IconTabFeats size={14} class="text-accent" aria-hidden="true" />
      <span class="text-xs font-semibold uppercase tracking-wider text-accent">{ui('feats.selected', engine.settings.language)}</span>
    </div>

    {#if manualFeatInstances.length === 0}
      <p class="text-sm text-text-muted italic">
        {ui('feats.empty', engine.settings.language)}
        {engine.phase_featSlotsTotal - grantedFeatInstances.length} {ui('feats.slots_available', engine.settings.language)}
      </p>
    {:else}
      <div class="flex flex-col gap-1.5">
        {#each manualFeatInstances as afi}
          {@const feat = dataLoader.getFeature(afi.featureId)}
          {#if feat}
            <div class="flex items-start gap-3 px-3 py-2 rounded-md border border-border bg-surface-alt
                        border-l-4 border-l-accent hover:border-border transition-colors duration-150">
              <div class="flex-1 flex flex-col gap-1 min-w-0">
                <span class="text-sm font-medium text-text-primary">{engine.t(feat.label)}</span>
                {#if feat.tags.length > 0}
                  <div class="flex flex-wrap gap-1">
                    {#each feat.tags.filter(t => t !== 'feat' && !t.startsWith('feat_')).slice(0, 4) as tag}
                      <span class="badge-accent font-mono text-[10px]">{tag}</span>
                    {/each}
                  </div>
                {/if}
              </div>
              <div class="flex gap-1 shrink-0">
                <button
                  class="btn-ghost p-1.5 text-accent hover:bg-accent/10"
                  onclick={() => (modalFeatId = feat.id)}
                  aria-label="Show {engine.t(feat.label)} details"
                  type="button"
                ><IconInfo size={14} aria-hidden="true" /></button>
                <button
                  class="btn-ghost p-1.5 text-red-400 hover:bg-red-500/10"
                  onclick={() => engine.removeFeature(afi.instanceId)}
                  aria-label="Remove {engine.t(feat.label)}"
                  title={ui('feats.remove_tooltip', engine.settings.language)}
                  type="button"
                ><IconDelete size={14} aria-hidden="true" /></button>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </section>

</div>

{#if showAddModal}
  <FeatSelectionModal onclose={() => (showAddModal = false)} />
{/if}

{#if modalFeatId}
  <FeatureModal featureId={modalFeatId} onclose={() => (modalFeatId = null)} />
{/if}
