<!--
  @file src/lib/components/ui/FeatureModal.svelte
  @description A reusable modal dialog for displaying full Feature data.
  Phase 19.14: Migrated to use Modal.svelte + Tailwind CSS — all scoped <style> removed.

  Uses Modal.svelte (size="lg") for mobile bottom-sheet / desktop centered behaviour.
  Category badges use a helper function returning Tailwind class strings (static enough
  for Tailwind's scanner since all class strings are complete literals in the map).
-->

<script lang="ts">
  import { dataLoader } from '$lib/engine/DataLoader';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { evaluateLogicNode } from '$lib/utils/logicEvaluator';
  import { interpolateDescription } from '$lib/utils/mathParser';
  import { formatModifier } from '$lib/utils/formatters';
  import type { ID } from '$lib/types/primitives';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { IconInfo, IconSuccess, IconError, IconWarning, IconAbilities, IconTabFeats, IconAdd } from '$lib/components/ui/icons';

  interface Props {
    featureId: ID | null;
    onclose: () => void;
  }

  let { featureId, onclose }: Props = $props();

  const feature = $derived(featureId ? dataLoader.getFeature(featureId) : undefined);
  const title   = $derived(feature ? engine.t(feature.label) : '???');

  const description = $derived.by(() => {
    if (!feature?.description) return '';
    try {
      return interpolateDescription(engine.t(feature.description), engine.phase2_context, engine.settings.language);
    } catch {
      return engine.t(feature.description);
    }
  });

  const prereqResult = $derived.by(() => {
    if (!feature?.prerequisitesNode) return null;
    return evaluateLogicNode(feature.prerequisitesNode, engine.phase2_context);
  });

  const grantedFeatureNames = $derived.by(() => {
    if (!feature?.grantedFeatures?.length) return [];
    return feature.grantedFeatures.map(id => {
      const f = dataLoader.getFeature(id);
      return { id, name: f ? engine.t(f.label) : id };
    });
  });

  function resolvePipelineLabel(targetId: string): string {
    const normalised = targetId.startsWith('attributes.') ? targetId.slice('attributes.'.length) : targetId;
    const attrPipeline   = engine.phase2_attributes[normalised];
    if (attrPipeline?.label) return engine.t(attrPipeline.label);
    const combatPipeline = engine.phase3_combatStats[targetId];
    if (combatPipeline?.label) return engine.t(combatPipeline.label);
    const skillPipeline  = engine.phase4_skills[targetId];
    if (skillPipeline?.label) return engine.t(skillPipeline.label);
    return targetId;
  }

  /**
   * Category badge Tailwind classes.
   * All strings are complete, static literals — safe for Tailwind's scanner.
   */
  function categoryBadgeClass(cat: string): string {
    const map: Record<string, string> = {
      race:         'bg-green-900/40 text-green-400 border-green-700/50',
      class:        'bg-blue-900/40 text-blue-300 border-blue-700/50',
      feat:         'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
      item:         'bg-cyan-900/30 text-cyan-300 border-cyan-700/30',
      condition:    'bg-red-900/30 text-red-400 border-red-700/30',
      magic:        'bg-purple-900/30 text-purple-300 border-purple-700/30',
      domain:       'bg-teal-900/30 text-teal-300 border-teal-700/30',
      class_feature:'bg-blue-900/30 text-blue-200 border-blue-700/30',
      environment:  'bg-amber-900/30 text-amber-300 border-amber-700/30',
      monster_type: 'bg-red-900/20 text-red-300 border-red-700/20',
      deity:        'bg-amber-900/20 text-amber-200 border-amber-700/20',
    };
    return `${map[cat] ?? 'bg-surface-alt text-text-muted border-border'} border text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded`;
  }
</script>

<!-- Render only when featureId is set -->
{#if featureId}
  <Modal
    open={true}
    onClose={onclose}
    size="lg"
    title={feature ? title : 'Feature not found'}
  >
    {#snippet children()}
      {#if !feature}
        <!-- Feature not in cache -->
        <div class="text-center py-4 flex flex-col gap-2">
          <p class="text-sm text-text-primary">
            No feature found with ID <code class="bg-surface-alt px-1.5 py-0.5 rounded text-xs">{featureId}</code>.
          </p>
          <p class="text-xs text-text-muted italic">
            The DataLoader cache may not be loaded, or the rule source containing this feature may not be enabled.
          </p>
        </div>

      {:else}
        <div class="flex flex-col gap-4">

          <!-- Category badge (below the modal title provided by Modal.svelte) -->
          <div>
            <span class={categoryBadgeClass(feature.category)}>{feature.category}</span>
          </div>

          <!-- ── DESCRIPTION ─────────────────────────────────────────── -->
          {#if description}
            <section>
              <p class="text-sm text-text-secondary leading-relaxed">{description}</p>
            </section>
          {/if}

          <!-- ── PREREQUISITES ───────────────────────────────────────── -->
          {#if feature.prerequisitesNode}
            <section class="flex flex-col gap-1.5">
              <h3 class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent border-b border-border pb-1">
                <IconInfo size={14} aria-hidden="true" /> Prerequisites
              </h3>
              {#if prereqResult}
                <ul class="flex flex-col gap-1">
                  {#each prereqResult.metMessages as msg}
                    <li class="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-green-950/20 text-green-400">
                      <IconSuccess size={13} class="shrink-0" aria-hidden="true" /> {msg}
                    </li>
                  {/each}
                  {#each prereqResult.errorMessages as msg}
                    <li class="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-red-950/20 text-red-400">
                      <IconError size={13} class="shrink-0" aria-hidden="true" /> {msg}
                    </li>
                  {/each}
                  {#if prereqResult.metMessages.length === 0 && prereqResult.errorMessages.length === 0}
                    <li class="text-xs text-text-muted italic">No labelled prerequisites found.</li>
                  {/if}
                </ul>
              {/if}
            </section>
          {/if}

          <!-- ── GRANTED MODIFIERS ───────────────────────────────────── -->
          {#if feature.grantedModifiers?.length}
            <section class="flex flex-col gap-1.5">
              <h3 class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent border-b border-border pb-1">
                <IconAbilities size={14} aria-hidden="true" /> Modifiers
              </h3>
              <ul class="flex flex-col gap-1">
                {#each feature.grantedModifiers as mod}
                  {@const numVal = typeof mod.value === 'number' ? mod.value : null}
                  <li class="flex items-center gap-2 text-sm flex-wrap py-0.5">
                    <!-- Value -->
                    <span class="font-bold min-w-[2.5rem] text-right font-mono
                      {numVal !== null && numVal > 0 ? 'text-green-500 dark:text-green-400'
                      : numVal !== null && numVal < 0 ? 'text-red-500 dark:text-red-400'
                      : 'text-text-muted'}">
                      {numVal !== null ? formatModifier(numVal) : mod.value}
                    </span>
                    <!-- Target -->
                    <span class="text-sky-400">{resolvePipelineLabel(mod.targetId)}</span>
                    <!-- Type -->
                    <span class="text-[10px] text-text-muted">({mod.type})</span>
                    <!-- Situational context -->
                    {#if mod.situationalContext}
                      <span class="badge-accent text-[10px]">vs. {mod.situationalContext}</span>
                    {/if}
                    <!-- Conditional flag -->
                    {#if mod.conditionNode}
                      <span class="flex items-center gap-0.5 text-[10px] text-yellow-500 dark:text-yellow-400">
                        <IconWarning size={11} aria-hidden="true" /> Conditional
                      </span>
                    {/if}
                  </li>
                {/each}
              </ul>
            </section>
          {/if}

          <!-- ── GRANTED FEATURES ────────────────────────────────────── -->
          {#if grantedFeatureNames.length > 0}
            <section class="flex flex-col gap-1.5">
              <h3 class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent border-b border-border pb-1">
                <IconAdd size={14} aria-hidden="true" /> Grants
              </h3>
              <ul class="flex flex-col gap-1">
                {#each grantedFeatureNames as { id, name }}
                  <li class="flex items-center justify-between gap-3 text-sm py-0.5">
                    <span class="text-accent">{name}</span>
                    <code class="text-[10px] text-text-muted bg-surface-alt px-1.5 py-0.5 rounded shrink-0">{id}</code>
                  </li>
                {/each}
              </ul>
            </section>
          {/if}

          <!-- ── CHOICES ─────────────────────────────────────────────── -->
          {#if feature.choices?.length}
            <section class="flex flex-col gap-1.5">
              <h3 class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent border-b border-border pb-1">
                <IconTabFeats size={14} aria-hidden="true" /> Choices
              </h3>
              <ul class="flex flex-col gap-1.5">
                {#each feature.choices as choice}
                  <li class="flex flex-col gap-0.5 p-2.5 rounded-md border border-border bg-surface-alt text-sm">
                    <span class="font-medium text-text-primary">{engine.t(choice.label)}</span>
                    <span class="text-xs text-text-muted">Query: <code class="bg-surface px-1 rounded">{choice.optionsQuery}</code></span>
                    {#if choice.maxSelections > 1}
                      <span class="text-xs text-accent">(Pick up to {choice.maxSelections})</span>
                    {/if}
                  </li>
                {/each}
              </ul>
            </section>
          {/if}

          <!-- ── METADATA ────────────────────────────────────────────── -->
          <section class="flex flex-col gap-1.5 pt-3 border-t border-border">
            <div class="flex items-center gap-2 text-xs">
              <span class="text-text-muted w-12 text-right shrink-0">Source</span>
              <code class="text-text-secondary bg-surface-alt px-1.5 py-0.5 rounded">{feature.ruleSource}</code>
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="text-text-muted w-12 text-right shrink-0">ID</span>
              <code class="text-text-secondary bg-surface-alt px-1.5 py-0.5 rounded break-all">{feature.id}</code>
            </div>
            {#if feature.tags?.length}
              <div class="flex items-start gap-2 text-xs">
                <span class="text-text-muted w-12 text-right shrink-0 pt-0.5">Tags</span>
                <div class="flex flex-wrap gap-1">
                  {#each feature.tags as tag}
                    <span class="badge-accent font-mono text-[10px]">{tag}</span>
                  {/each}
                </div>
              </div>
            {/if}
          </section>

        </div>
      {/if}
    {/snippet}
  </Modal>
{/if}
