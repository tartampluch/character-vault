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
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { interpolateDescription } from '$lib/utils/mathParser';
  import { formatModifier } from '$lib/utils/formatters';
  import { ui } from '$lib/i18n/ui-strings';
  import { FEATURE_ID_CATEGORY_PREFIXES } from '$lib/utils/constants';
  import type { ID } from '$lib/types/primitives';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { IconInfo, IconSuccess, IconError, IconWarning, IconAbilities, IconTabFeats, IconAdd, IconChecked } from '$lib/components/ui/icons';

  interface Props {
    featureId: ID | null;
    onclose: () => void;
  }

  let { featureId, onclose }: Props = $props();

  const lang    = $derived(engine.settings.language);
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

  // Prerequisite evaluation is game logic (ARCHITECTURE.md §3). Delegate to the
  // engine method rather than calling the logicEvaluator utility directly.
  const prereqResult = $derived.by(() => {
    if (!feature) return null;
    return engine.evaluateFeaturePrerequisites(feature);
  });

  const grantedFeatureNames = $derived.by(() => {
    if (!feature?.grantedFeatures?.length) return [];
    // Deduplicate by ID (grantedFeatures may contain duplicates from JSON)
    const seen = new Set<string>();
    return feature.grantedFeatures
      .filter(id => {
        if (id.startsWith('-') || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map(id => {
        const f = dataLoader.getFeature(id);
        // Prefer the feature's label; fall back to a prettified ID string
        const name = f
          ? engine.t(f.label)
          : id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return { id, name, hasData: !!f, category: f?.category ?? guessGrantCategory(id) };
      });
  });

  /**
   * Guess a grant category from the ID when the feature is not loaded,
   * for pill display purposes.
   *
   * ZERO-HARDCODING RULE (ARCHITECTURE.md §6):
   *   The ID prefix → category mapping is centralised in `FEATURE_ID_CATEGORY_PREFIXES`
   *   in `constants.ts` so that D&D category name strings do not appear as string
   *   literals inside this .svelte file. Any new category prefix requires only a
   *   change in constants.ts, not a search across components.
   */
  function guessGrantCategory(id: string): string {
    for (const { prefix, category } of FEATURE_ID_CATEGORY_PREFIXES) {
      if (id.startsWith(prefix)) return category;
    }
    return 'feature';
  }

  /**
   * Returns an i18n key for a grant category label.
   */
  function grantCategoryKey(category: string): string {
    const keyMap: Record<string, string> = {
      language:      'feature.grant_type.language',
      sense:         'feature.grant_type.sense',
      proficiency:   'feature.grant_type.proficiency',
      immunity:      'feature.grant_type.immunity',
      class_feature: 'feature.grant_type.class_feature',
      racial:        'feature.grant_type.racial',
      feat:          'feature.grant_type.feat',
      spell:         'feature.grant_type.spell',
      item:          'feature.grant_type.item',
      condition:     'feature.grant_type.condition',
    };
    return keyMap[category] ?? 'feature.grant_type.feature';
  }

  /**
   * Tailwind classes for a grant-type pill badge.
   * Uses explicit light/dark pairs for readability in both themes.
   */
  function grantPillClass(category: string): string {
    const map: Record<string, string> = {
      language:      'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700/50',
      sense:         'bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-900/50 dark:text-cyan-300 dark:border-cyan-700/50',
      proficiency:   'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700/50',
      immunity:      'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700/50',
      class_feature: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/50 dark:text-sky-300 dark:border-sky-700/50',
      racial:        'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/50 dark:text-teal-300 dark:border-teal-700/50',
      feat:          'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/50 dark:text-yellow-300 dark:border-yellow-700/50',
      spell:         'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/50 dark:text-purple-300 dark:border-purple-700/50',
      item:          'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-600/50',
      condition:     'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700/50',
    };
    return `${map[category] ?? 'bg-surface-alt text-text-secondary border-border'} border text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0`;
  }

  // Pipeline label resolution is delegated to engine.resolvePipelineLabel()
  // (ARCHITECTURE.md §3, §6 — zero game logic and zero hardcoding in .svelte files).
  // The fallback map of D&D stat names and pipeline labels lives in GameEngine as
  // GameEngine.PIPELINE_FALLBACK_LABELS; it is never embedded in this component.

  /**
   * Category badge Tailwind classes.
   * All strings are complete, static literals — safe for Tailwind's scanner.
   */
  function categoryBadgeClass(cat: string): string {
    const map: Record<string, string> = {
      race:         'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700/50',
      class:        'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700/50',
      feat:         'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/50 dark:text-yellow-300 dark:border-yellow-700/50',
      item:         'bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-900/50 dark:text-cyan-300 dark:border-cyan-700/50',
      condition:    'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700/50',
      magic:        'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/50 dark:text-purple-300 dark:border-purple-700/50',
      domain:       'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/50 dark:text-teal-300 dark:border-teal-700/50',
      class_feature:'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/50 dark:text-sky-300 dark:border-sky-700/50',
      environment:  'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700/50',
      monster_type: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/50 dark:text-orange-300 dark:border-orange-700/50',
      deity:        'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700/50',
    };
    return `${map[cat] ?? 'bg-surface-alt text-text-secondary border-border'} border text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded`;
  }
</script>

<!-- Render only when featureId is set -->
{#if featureId}
  <Modal
    open={true}
    onClose={onclose}
    size="lg"
    title={feature ? title : ui('feature.not_found', lang)}
  >
    {#snippet children()}
      {#if !feature}
        <!-- Feature not in cache -->
        <div class="text-center py-4 flex flex-col gap-2">
          <p class="text-sm text-text-primary">
            {ui('feature.not_found_desc', lang)} <code class="bg-surface-alt px-1.5 py-0.5 rounded text-xs">{featureId}</code>.
          </p>
          <p class="text-xs text-text-muted italic">
            {ui('feature.cache_hint', lang)}
          </p>
        </div>

      {:else}
        <div class="flex flex-col gap-4">

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
                <IconInfo size={14} aria-hidden="true" /> {ui('feature.section_prerequisites', lang)}
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
                    <li class="text-xs text-text-muted italic">{ui('feature.no_prereqs', lang)}</li>
                  {/if}
                </ul>
              {/if}
            </section>
          {/if}

          <!-- ── GRANTED MODIFIERS ───────────────────────────────────── -->
          {#if feature.grantedModifiers?.length}
            <section class="flex flex-col gap-1.5">
              <h3 class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent border-b border-border pb-1">
                <IconAbilities size={14} aria-hidden="true" /> {ui('feature.section_modifiers', lang)}
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
                    <!-- Target — label resolved by the engine (ARCHITECTURE.md §6: no hardcoded stat names in .svelte) -->
                    <span class="text-sky-400">{engine.resolvePipelineLabel(mod.targetId)}</span>
                    <!-- Type -->
                    <span class="text-[10px] text-text-muted">({mod.type})</span>
                    <!-- Situational context — human-readable label -->
                    {#if mod.situationalContext}
                      <span class="badge-accent text-[10px]">{mod.situationalContext}</span>
                    {/if}
                    <!-- Conditional flag -->
                    {#if mod.conditionNode}
                      <span class="flex items-center gap-0.5 text-[10px] text-yellow-500 dark:text-yellow-400">
                        <IconWarning size={11} aria-hidden="true" /> {ui('feature.conditional', lang)}
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
                <IconAdd size={14} aria-hidden="true" /> {ui('feature.section_grants', lang)}
              </h3>
              <ul class="flex flex-col gap-1">
                {#each grantedFeatureNames as { id, name, hasData, category }}
                  <li class="flex items-center gap-2 text-sm py-0.5">
                    <!-- Category pill -->
                    <span class={grantPillClass(category)}>
                      {ui(grantCategoryKey(category), lang)}
                    </span>
                    <!-- Human-readable name, dimmed if the feature isn't loaded -->
                    <span class="{hasData ? 'text-accent' : 'text-text-muted italic'} flex-1 min-w-0 truncate">{name}</span>
                    <!-- Show raw ID only when we couldn't resolve a label -->
                    {#if !hasData}
                      <code class="text-[10px] text-text-muted/60 bg-surface-alt px-1.5 py-0.5 rounded shrink-0">{id}</code>
                    {/if}
                  </li>
                {/each}
              </ul>
            </section>
          {/if}

          <!-- ── CHOICES (interactive) ───────────────────────────────── -->
          {#if feature.choices?.length}
            {@const parentInstance = engine.character.activeFeatures.find(
              afi => afi.featureId === feature.id && afi.isActive
            )}
            {#each feature.choices as choice}
              {@const options    = dataLoader.queryFeatures(choice.optionsQuery)}
              {@const currentSel = parentInstance?.selections?.[choice.choiceId] ?? []}
              {@const maxSel     = choice.maxSelections ?? 1}

              <section class="flex flex-col gap-2">
                <div class="flex items-center justify-between border-b border-border pb-1">
                  <h3 class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
                    <IconTabFeats size={14} aria-hidden="true" /> {engine.t(choice.label)}
                  </h3>
                  <span class="text-[10px] text-text-muted">
                    {maxSel === 1
                      ? ui('feature.choice_pick_one', lang)
                      : ui('feature.choice_pick_up_to', lang).replace('{n}', String(maxSel))}
                    — {currentSel.length}/{maxSel}
                  </span>
                </div>

                {#if options.length === 0}
                  <p class="text-xs text-text-muted italic">{ui('feature.choice_no_options', lang)}</p>
                {:else}
                  <ul class="flex flex-col gap-1.5">
                    {#each options as opt}
                      {@const isSelected = currentSel.includes(opt.id)}
                      <li class="flex items-start gap-2 px-2.5 py-2 rounded-md border transition-colors
                                 {isSelected
                                   ? 'border-accent/60 bg-accent/5 dark:bg-accent/10'
                                   : 'border-border bg-surface-alt hover:border-accent/30'}">

                        <!-- Option name + description -->
                        <div class="flex-1 min-w-0">
                          <span class="text-sm font-medium {isSelected ? 'text-accent' : 'text-text-primary'}">
                            {engine.t(opt.label)}
                          </span>
                          {#if opt.description}
                            <p class="text-xs text-text-muted mt-0.5 leading-relaxed line-clamp-2">
                              {engine.t(opt.description)}
                            </p>
                          {/if}
                        </div>

                        <!-- Select / Remove button -->
                        <div class="shrink-0 flex items-center gap-1.5 mt-0.5">
                          {#if isSelected}
                            <span class="flex items-center gap-1 text-[10px] font-bold text-accent uppercase tracking-wide">
                              <IconChecked size={11} aria-hidden="true" /> {ui('feature.choice_selected', lang)}
                            </span>
                            {#if parentInstance}
                              <button
                                type="button"
                                class="text-[10px] px-1.5 py-0.5 rounded border border-red-600/40
                                       bg-red-100 text-red-700 dark:bg-red-950/20 dark:text-red-400
                                       hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors"
                                onclick={() => {
                                  engine.setFeatureSelection(
                                    feature.id, choice.choiceId,
                                    currentSel.filter((id: string) => id !== opt.id)
                                  );
                                }}
                              >{ui('feature.choice_remove', lang)}</button>
                            {/if}
                          {:else if parentInstance && currentSel.length < maxSel}
                            <button
                              type="button"
                              class="text-[10px] px-1.5 py-0.5 rounded border border-accent/50
                                     bg-accent/10 text-accent hover:bg-accent/20 transition-colors font-medium"
                              onclick={() => {
                                engine.setFeatureSelection(
                                  feature.id, choice.choiceId,
                                  maxSel === 1 ? [opt.id] : [...currentSel, opt.id]
                                );
                              }}
                            >{ui('feature.choice_select', lang)}</button>
                          {:else if currentSel.length >= maxSel}
                            <span class="text-[10px] text-text-muted/40">—</span>
                          {/if}
                        </div>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </section>
            {/each}
          {/if}

          <!-- ── METADATA (GM-only) ───────────────────────────────────── -->
          <!-- Internal IDs, ruleSource, and tags are only relevant to GMs
               authoring homebrew or debugging rule sources. Players see
               only the user-facing label and description. -->
          {#if sessionContext.isGameMaster}
            <section class="flex flex-col gap-1.5 pt-3 border-t border-border">
              <div class="flex items-center gap-2 text-xs">
                <span class="text-text-muted w-12 text-right shrink-0">{ui('feature.label_source', lang)}</span>
                <code class="text-text-secondary bg-surface-alt px-1.5 py-0.5 rounded">{feature.ruleSource}</code>
              </div>
              <div class="flex items-center gap-2 text-xs">
                <span class="text-text-muted w-12 text-right shrink-0">{ui('feature.label_id', lang)}</span>
                <code class="text-text-secondary bg-surface-alt px-1.5 py-0.5 rounded break-all">{feature.id}</code>
              </div>
              <div class="flex items-start gap-2 text-xs">
                <span class="text-text-muted w-12 text-right shrink-0 pt-0.5">{ui('feature.label_category', lang)}</span>
                <span class={categoryBadgeClass(feature.category)}>{feature.category}</span>
              </div>
              {#if feature.tags?.length}
                <div class="flex items-start gap-2 text-xs">
                  <span class="text-text-muted w-12 text-right shrink-0 pt-0.5">{ui('feature.label_tags', lang)}</span>
                  <div class="flex flex-wrap gap-1">
                    {#each feature.tags as tag}
                      <span class="badge-accent font-mono text-[10px]">{tag}</span>
                    {/each}
                  </div>
                </div>
              {/if}
            </section>
          {/if}

        </div>
      {/if}
    {/snippet}
  </Modal>
{/if}
