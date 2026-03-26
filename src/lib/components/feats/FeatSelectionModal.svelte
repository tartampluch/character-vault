<!--
  @file src/lib/components/feats/FeatSelectionModal.svelte
  @description Feat catalog modal — search, filter, prerequisite evaluation, select.
  Phase 19.10: Migrated to use Modal.svelte (fullscreen on mobile) + Tailwind CSS.
  All scoped <style> removed.

  LAYOUT:
    Mobile: full-screen modal (fullscreen prop on Modal.svelte).
    Desktop: large centered modal (size="xl").
    Sticky search + filter bar at top of the scrollable feat list.
    Each feat entry:
      - Name + "Have" badge if already owned.
      - 120-char description snippet.
      - Tag badges (accent colour, monospace).
      - Prerequisite messages: green check (met) or red X (unmet).
      - "Select" / lock / check button on the right.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { evaluateLogicNode } from '$lib/utils/logicEvaluator';
  import { ui } from '$lib/i18n/ui-strings';
  import type { Feature } from '$lib/types/feature';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { IconTabFeats, IconSearch, IconSuccess, IconError, IconLocked, IconChecked } from '$lib/components/ui/icons';

  interface Props { onclose: () => void; }
  let { onclose }: Props = $props();

  let searchQuery       = $state('');
  let selectedTagFilter = $state('');

  const allFeats = $derived(dataLoader.queryFeatures('category:feat'));

  const allTags = $derived.by(() => {
    const tagSet = new Set<string>();
    for (const feat of allFeats) {
      for (const tag of feat.tags) {
        if (tag !== 'feat' && !tag.startsWith('feat_') && tag.length > 2) tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  });

  const filteredFeats = $derived.by(() => {
    const query = searchQuery.toLowerCase().trim();
    return allFeats.filter(feat => {
      if (selectedTagFilter && !feat.tags.includes(selectedTagFilter)) return false;
      if (query) {
        const labelMatch = engine.t(feat.label).toLowerCase().includes(query);
        const descMatch  = engine.t(feat.description).toLowerCase().includes(query);
        if (!labelMatch && !descMatch) return false;
      }
      return true;
    });
  });

  function evalPrereqs(feat: Feature) {
    return evaluateLogicNode(feat.prerequisitesNode, engine.phase2_context);
  }

  function selectFeat(feat: Feature) {
    const prereqResult = evalPrereqs(feat);
    if (!prereqResult.passed) return;
    engine.addFeature({
      instanceId: `afi_feat_${feat.id}_${Date.now()}`,
      featureId:  feat.id,
      isActive:   true,
    });
    onclose();
  }
</script>

<Modal open={true} onClose={onclose} size="xl" fullscreen={true} title={ui('feat_catalog.title', engine.settings.language)}>
  {#snippet children()}
    <div class="flex flex-col gap-3 -mt-2">

      <!-- Slots remaining badge -->
      <div class="flex items-center gap-2">
        <span class="badge-accent">{engine.phase4_featSlotsRemaining} {ui('feat_catalog.slots_left', engine.settings.language)}</span>
        <span class="text-xs text-text-muted">{filteredFeats.length} {ui('feat_catalog.feats_found', engine.settings.language)}</span>
      </div>

      <!-- Search + tag filter row (sticky within the scrollable modal body) -->
      <div class="flex gap-2 sticky top-0 bg-surface pb-2 pt-1 z-10 border-b border-border -mx-4 px-4">
        <div class="relative flex-1">
          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
            <IconSearch size={14} aria-hidden="true" />
          </span>
          <input
            type="search"
            bind:value={searchQuery}
            placeholder={ui('feat_catalog.search', engine.settings.language)}
            class="input pl-8 text-sm w-full"
            aria-label="Search feats by name or description"
          />
        </div>
        <select
          bind:value={selectedTagFilter}
          class="select text-sm max-w-[140px]"
          aria-label="Filter by tag"
        >
          <option value="">{ui('feat_catalog.all_tags', engine.settings.language)}</option>
          {#each allTags as tag}
            <option value={tag}>{tag}</option>
          {/each}
        </select>
      </div>

      <!-- Empty state -->
      {#if allFeats.length === 0}
        <p class="text-sm text-text-muted italic text-center py-6">
          {ui('feat_catalog.empty', engine.settings.language)}
        </p>
      {/if}

      <!-- Feat list -->
      <div class="flex flex-col gap-2" role="list">
        {#each filteredFeats as feat}
          {@const prereq      = evalPrereqs(feat)}
          {@const canSelect   = prereq.passed && engine.phase4_featSlotsRemaining > 0}
          {@const alreadyHave = engine.character.activeFeatures.some(afi => afi.featureId === feat.id)}

          <div
            class="flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors duration-150
                   {alreadyHave
                     ? 'border-green-600/40 bg-green-950/10 dark:bg-green-950/20'
                     : prereq.passed
                       ? 'border-l-4 border-l-green-600 border-border hover:border-accent/40 bg-surface-alt'
                       : 'border-l-4 border-l-red-700 border-border opacity-70 bg-surface-alt'}"
            role="listitem"
            aria-label="{engine.t(feat.label)}: {prereq.passed ? ui('feat_catalog.prereqs_met', engine.settings.language) : ui('feat_catalog.prereqs_not_met', engine.settings.language)}"
          >
            <!-- Left: name, description, tags, prereqs -->
            <div class="flex-1 flex flex-col gap-1 min-w-0">

              <!-- Name row + "Have" badge -->
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-medium text-text-primary">{engine.t(feat.label)}</span>
                {#if alreadyHave}
                  <span class="badge-green flex items-center gap-1 text-[10px]">
                    <IconChecked size={10} aria-hidden="true" /> {ui('feat_catalog.have', engine.settings.language)}
                  </span>
                {/if}
              </div>

              <!-- Description snippet -->
              <p class="text-xs text-text-secondary leading-snug line-clamp-2">
                {engine.t(feat.description).slice(0, 120)}…
              </p>

              <!-- Tag badges -->
              {#if feat.tags.filter(t => t !== 'feat' && !t.startsWith('feat_')).length > 0}
                <div class="flex flex-wrap gap-1">
                  {#each feat.tags.filter(t => t !== 'feat' && !t.startsWith('feat_')) as tag}
                    <span class="badge-accent font-mono text-[10px]">{tag}</span>
                  {/each}
                </div>
              {/if}

              <!-- Prerequisite messages (Phase 11.4) -->
              {#if feat.prerequisitesNode}
                <div class="flex flex-col gap-0.5 mt-0.5">
                  {#each prereq.metMessages as msg}
                    <span class="flex items-center gap-1 text-[11px] text-green-500 dark:text-green-400">
                      <IconSuccess size={10} aria-hidden="true" /> {msg}
                    </span>
                  {/each}
                  {#each prereq.errorMessages as msg}
                    <span class="flex items-center gap-1 text-[11px] text-red-500 dark:text-red-400">
                      <IconError size={10} aria-hidden="true" /> {msg}
                    </span>
                  {/each}
                </div>
              {/if}

            </div>

            <!-- Right: select button -->
            <button
              class="shrink-0 self-start mt-0.5 {canSelect && !alreadyHave ? 'btn-primary' : 'btn-secondary opacity-50 cursor-not-allowed'} px-3 py-1.5 text-xs"
              onclick={() => selectFeat(feat)}
              disabled={!canSelect || alreadyHave}
              aria-label="{alreadyHave ? ui('feat_catalog.already_have', engine.settings.language) : canSelect ? ui('feat_catalog.select', engine.settings.language) + ' ' + engine.t(feat.label) : ui('feat_catalog.cannot_select', engine.settings.language)}"
              type="button"
            >
              {#if alreadyHave}
                <IconChecked size={13} aria-hidden="true" />
              {:else if !prereq.passed}
                <IconLocked size={13} aria-hidden="true" />
              {:else}
                {ui('feat_catalog.select', engine.settings.language)}
              {/if}
            </button>
          </div>
        {/each}
      </div>

    </div>
  {/snippet}
</Modal>
