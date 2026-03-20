<!--
  @file src/lib/components/ui/FeatureModal.svelte
  @description A highly reusable modal dialog for displaying full Feature data.

  PURPOSE:
    Shows the complete details of any Feature (race, class, feat, item, spell, etc.):
      - Localised title and description (with @-path interpolation support).
      - Category badge.
      - Prerequisites (rendered as a list of requirement labels, green/red).
      - Granted modifiers (translated to readable strings: "+2 Strength", "-4 AC").
      - Granted features (listed by their localised names, linked to nested lookups).
      - FeatureChoice prompts (shown as "Choice: [optionsQuery]").

    This component is used wherever a player needs detailed information about
    a Feature before selecting or equipping it (e.g., feat catalog, item hover,
    class selection popover).

  PROPS:
    - `featureId: string | null` — The Feature ID to display. `null` → modal closes.
    - `onclose: () => void` — Callback when the player closes the modal.

  DATA LOADING:
    Reads from `dataLoader.getFeature(featureId)` — synchronous O(1) cache lookup.
    No async needed: the DataLoader cache is populated before any UI renders.

  ARCHITECTURE:
    "Dumb display component" — reads data, renders it, emits one event (`onclose`).
    No mutations, no game logic. The description text has @-path variables
    interpolated using `interpolateDescription()` → `engine.phase2_context`.

  MODIFIER DISPLAY:
    Modifiers are translated to human-readable strings:
      value > 0:  "+N <TargetId>" in green
      value < 0:  "N <TargetId>" in red
      value == 0: "0 <TargetId>" in neutral
    The `targetId` is shown as-is (e.g., "stat_str" → displayed as "stat_str").
    Future Phase 9 work will add full pipeline labelling to show "Strength" instead.

  PREREQUISITE DISPLAY:
    Reads `feature.prerequisitesNode` and evaluates it using `evaluateLogicNode()`.
    Each CONDITION node's `errorMessage` is shown:
      - Green checkmark if the current character meets it.
      - Red cross if not.

  @see src/lib/engine/DataLoader.ts for the feature cache.
  @see src/lib/utils/mathParser.ts for interpolateDescription().
  @see src/lib/utils/logicEvaluator.ts for prerequisite evaluation.
  @see ARCHITECTURE.md Phase 8.2 for the specification.
-->

<script lang="ts">
  import { dataLoader } from '$lib/engine/DataLoader';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { evaluateLogicNode } from '$lib/utils/logicEvaluator';
  import { interpolateDescription } from '$lib/utils/mathParser';
  import { formatModifier } from '$lib/utils/formatters';
  import type { ID } from '$lib/types/primitives';

  // ============================================================
  // PROPS
  // ============================================================

  interface Props {
    /**
     * The Feature ID to look up and display.
     * Pass `null` to indicate the modal should not be shown.
     */
    featureId: ID | null;
    /**
     * Called when the player closes the modal (click backdrop, press Escape,
     * or click the Close button).
     */
    onclose: () => void;
  }

  let { featureId, onclose }: Props = $props();

  // ============================================================
  // DERIVED DATA
  // ============================================================

  /**
   * The Feature object from the DataLoader cache.
   * `undefined` if not found (cache not loaded or unknown ID).
   */
  const feature = $derived(featureId ? dataLoader.getFeature(featureId) : undefined);

  /**
   * The localised title of the feature.
   */
  const title = $derived(feature ? engine.t(feature.label) : '???');

  /**
   * The description with @-path variables interpolated.
   * Uses Phase 2 context (fully resolved attributes) for accurate formula display.
   */
  const description = $derived.by(() => {
    if (!feature?.description) return '';
    try {
      return interpolateDescription(
        engine.t(feature.description),
        engine.phase2_context,
        engine.settings.language
      );
    } catch {
      return engine.t(feature.description);
    }
  });

  /**
   * Prerequisite evaluation result.
   * Evaluated against the current character context so the UI shows
   * which prerequisites the character currently meets (green) vs. doesn't (red).
   */
  const prereqResult = $derived.by(() => {
    if (!feature?.prerequisitesNode) return null;
    return evaluateLogicNode(feature.prerequisitesNode, engine.phase2_context);
  });

  /**
   * Lookup names of granted features (for display in the "Grants" section).
   * Displayed as their localised label, or the raw ID if not found in cache.
   */
  const grantedFeatureNames = $derived.by(() => {
    if (!feature?.grantedFeatures?.length) return [];
    return feature.grantedFeatures.map(id => {
      const f = dataLoader.getFeature(id);
      return { id, name: f ? engine.t(f.label) : id };
    });
  });

  // ============================================================
  // KEYBOARD HANDLER
  // ============================================================

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onclose();
    }
  }
</script>

<!-- Render only when featureId is set -->
{#if featureId && feature}
  <!-- ============================================================ -->
  <!-- MODAL OVERLAY -->
  <!-- ============================================================ -->
  <!-- svelte-ignore a11y-interactive-supports-focus -->
  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="feature-modal-title"
    onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) onclose(); }}
    onkeydown={handleKeyDown}
  >
    <div class="modal-panel">
      <!-- ========================================================= -->
      <!-- HEADER -->
      <!-- ========================================================= -->
      <header class="modal-header">
        <div class="modal-title-row">
          <h2 id="feature-modal-title" class="modal-title">{title}</h2>
          <span class="category-badge cat-{feature.category}">{feature.category}</span>
        </div>
        <button
          class="modal-close"
          onclick={onclose}
          aria-label="Close feature details"
        >×</button>
      </header>

      <!-- ========================================================= -->
      <!-- SCROLLABLE CONTENT -->
      <!-- ========================================================= -->
      <div class="modal-body">

        <!-- ---- DESCRIPTION ---- -->
        {#if description}
          <section class="section" aria-label="Description">
            <p class="description">{description}</p>
          </section>
        {/if}

        <!-- ---- PREREQUISITES ---- -->
        {#if feature.prerequisitesNode}
          <section class="section" aria-label="Prerequisites">
            <h3 class="section-title">📋 Prerequisites</h3>
            {#if prereqResult}
              <ul class="prereq-list">
                <!-- Met prerequisites (green) -->
                {#each prereqResult.metMessages as msg}
                  <li class="prereq-item met" aria-label="Met: {msg}">
                    <span class="prereq-icon" aria-hidden="true">✅</span>
                    <span>{msg}</span>
                  </li>
                {/each}
                <!-- Unmet prerequisites (red) -->
                {#each prereqResult.errorMessages as msg}
                  <li class="prereq-item unmet" aria-label="Not met: {msg}">
                    <span class="prereq-icon" aria-hidden="true">❌</span>
                    <span>{msg}</span>
                  </li>
                {/each}
                {#if prereqResult.metMessages.length === 0 && prereqResult.errorMessages.length === 0}
                  <li class="prereq-item neutral">No labelled prerequisites found.</li>
                {/if}
              </ul>
            {/if}
          </section>
        {/if}

        <!-- ---- GRANTED MODIFIERS ---- -->
        {#if feature.grantedModifiers?.length}
          <section class="section" aria-label="Granted modifiers">
            <h3 class="section-title">⚡ Modifiers</h3>
            <ul class="modifier-list">
              {#each feature.grantedModifiers as mod}
                {@const numericVal = typeof mod.value === 'number' ? mod.value : null}
                <li
                  class="modifier-item"
                  class:positive={numericVal !== null && numericVal > 0}
                  class:negative={numericVal !== null && numericVal < 0}
                  class:neutral={numericVal === null || numericVal === 0}
                >
                  <span class="mod-value">
                    {#if numericVal !== null}
                      {formatModifier(numericVal)}
                    {:else}
                      {mod.value}
                    {/if}
                  </span>
                  <span class="mod-target">{mod.targetId}</span>
                  <span class="mod-type">({mod.type})</span>
                  {#if mod.situationalContext}
                    <span class="mod-situational">vs. {mod.situationalContext}</span>
                  {/if}
                  {#if mod.conditionNode}
                    <span class="mod-conditional" aria-label="Conditional modifier">⚠️ Conditional</span>
                  {/if}
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        <!-- ---- GRANTED FEATURES ---- -->
        {#if grantedFeatureNames.length > 0}
          <section class="section" aria-label="Granted features">
            <h3 class="section-title">🎁 Grants</h3>
            <ul class="grant-list">
              {#each grantedFeatureNames as { id, name }}
                <li class="grant-item">
                  <span class="grant-name">{name}</span>
                  <code class="grant-id">{id}</code>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        <!-- ---- CHOICES ---- -->
        {#if feature.choices?.length}
          <section class="section" aria-label="Player choices">
            <h3 class="section-title">🎯 Choices</h3>
            <ul class="choice-list">
              {#each feature.choices as choice}
                <li class="choice-item">
                  <span class="choice-label">{engine.t(choice.label)}</span>
                  <span class="choice-query">Query: <code>{choice.optionsQuery}</code></span>
                  {#if choice.maxSelections > 1}
                    <span class="choice-max">(Pick up to {choice.maxSelections})</span>
                  {/if}
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        <!-- ---- METADATA ---- -->
        <section class="section section-meta" aria-label="Feature metadata">
          <div class="meta-row">
            <span class="meta-key">Source</span>
            <code class="meta-val">{feature.ruleSource}</code>
          </div>
          <div class="meta-row">
            <span class="meta-key">ID</span>
            <code class="meta-val">{feature.id}</code>
          </div>
          {#if feature.tags?.length}
            <div class="meta-row meta-tags">
              <span class="meta-key">Tags</span>
              <div class="tag-list">
                {#each feature.tags as tag}
                  <span class="tag">{tag}</span>
                {/each}
              </div>
            </div>
          {/if}
        </section>

      </div><!-- /modal-body -->
    </div><!-- /modal-panel -->
  </div><!-- /modal-backdrop -->

{:else if featureId && !feature}
  <!-- Feature ID provided but not in cache -->
  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-label="Feature not found"
    onclick={onclose}
    onkeydown={handleKeyDown}
  >
    <div class="modal-panel modal-panel--error">
      <header class="modal-header">
        <h2 class="modal-title">Feature not found</h2>
        <button class="modal-close" onclick={onclose} aria-label="Close">×</button>
      </header>
      <div class="modal-body">
        <p>No feature found with ID <code>{featureId}</code>.</p>
        <p class="hint">
          The DataLoader cache may not be loaded, or the rule source
          containing this feature may not be enabled.
        </p>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ========================= BACKDROP ========================= */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  /* ========================= PANEL ========================= */
  .modal-panel {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 12px;
    width: 100%;
    max-width: 580px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
  }

  .modal-panel--error {
    max-width: 420px;
  }

  /* ========================= HEADER ========================= */
  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 1.1rem 1.25rem 0.85rem;
    border-bottom: 1px solid #21262d;
    gap: 0.75rem;
    flex-shrink: 0;
  }

  .modal-title-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    flex: 1;
  }

  .modal-title {
    margin: 0;
    font-size: 1.15rem;
    color: #f0f0ff;
  }

  .modal-close {
    background: transparent;
    border: 1px solid #30363d;
    color: #8080a0;
    border-radius: 6px;
    width: 2rem;
    height: 2rem;
    cursor: pointer;
    font-size: 1.1rem;
    line-height: 1;
    flex-shrink: 0;
    transition: color 0.15s, border-color 0.15s;
  }
  .modal-close:hover { color: #f0f0ff; border-color: #7c3aed; }

  /* Category badge */
  .category-badge {
    font-size: 0.65rem;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: bold;
    border: 1px solid;
  }

  .cat-race     { background: #1a2a1a; color: #4ade80; border-color: #166534; }
  .cat-class    { background: #1a1a3a; color: #93c5fd; border-color: #1e4080; }
  .cat-feat     { background: #2a2a1a; color: #fbbf24; border-color: #854d0e; }
  .cat-item     { background: #1a2a2a; color: #67e8f9; border-color: #155e75; }
  .cat-condition{ background: #2a1a1a; color: #f87171; border-color: #7f1d1d; }
  .cat-magic    { background: #2a1a3a; color: #c084fc; border-color: #6b21a8; }
  .cat-domain   { background: #1a2a2a; color: #a7f3d0; border-color: #065f46; }
  .cat-class_feature { background: #1a1a3a; color: #7dd3fc; border-color: #1e3a6a; }
  .cat-environment { background: #2a2a1a; color: #fde68a; border-color: #854d0e; }
  .cat-monster_type { background: #2a1a1a; color: #fca5a5; border-color: #991b1b; }
  .cat-deity    { background: #2a2a1a; color: #fef08a; border-color: #713f12; }

  /* ========================= BODY ========================= */
  .modal-body {
    overflow-y: auto;
    padding: 1rem 1.25rem 1.25rem;
    flex: 1;
  }

  /* ========================= SECTIONS ========================= */
  .section {
    margin-bottom: 1.1rem;
  }

  .section-title {
    margin: 0 0 0.5rem;
    font-size: 0.8rem;
    color: #7c3aed;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.25rem;
  }

  /* ---- Description ---- */
  .description {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.65;
    color: #c0c0d0;
  }

  /* ---- Prerequisites ---- */
  .prereq-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .prereq-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }

  .prereq-item.met {
    background: #0f1e0f;
    color: #86efac;
  }

  .prereq-item.unmet {
    background: #1c0000;
    color: #fca5a5;
  }

  .prereq-item.neutral {
    color: #6080a0;
    font-style: italic;
  }

  .prereq-icon { flex-shrink: 0; }

  /* ---- Modifiers ---- */
  .modifier-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .modifier-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    padding: 0.2rem 0;
    flex-wrap: wrap;
  }

  .mod-value {
    font-weight: bold;
    min-width: 2.5rem;
    text-align: right;
  }

  .modifier-item.positive .mod-value { color: #86efac; }
  .modifier-item.negative .mod-value { color: #f87171; }
  .modifier-item.neutral .mod-value  { color: #8080a0; }

  .mod-target { color: #7dd3fc; }
  .mod-type   { font-size: 0.75rem; color: #4a4a6a; }
  .mod-situational {
    font-size: 0.75rem;
    background: #1c2540;
    color: #93c5fd;
    border-radius: 3px;
    padding: 0.05rem 0.35rem;
    border: 1px solid #1e4080;
  }
  .mod-conditional {
    font-size: 0.7rem;
    color: #fbbf24;
  }

  /* ---- Granted features ---- */
  .grant-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .grant-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.85rem;
    padding: 0.2rem 0;
  }

  .grant-name { color: #c4b5fd; }
  .grant-id {
    font-size: 0.7rem;
    color: #4a4a6a;
    background: #0d1117;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    flex-shrink: 0;
  }

  /* ---- Choices ---- */
  .choice-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .choice-item {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    font-size: 0.85rem;
    background: #0d1117;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    border: 1px solid #21262d;
  }

  .choice-label { color: #e0e0f0; font-weight: 500; }
  .choice-query { font-size: 0.75rem; color: #6080a0; }
  .choice-max   { font-size: 0.75rem; color: #7c3aed; }

  /* ---- Metadata ---- */
  .section-meta {
    border-top: 1px solid #21262d;
    padding-top: 0.75rem;
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    margin-bottom: 0.2rem;
    flex-wrap: wrap;
  }

  .meta-key {
    color: #4a4a6a;
    width: 3.5rem;
    flex-shrink: 0;
    text-align: right;
  }

  .meta-val {
    color: #6080a0;
    font-size: 0.75rem;
  }

  .meta-tags { align-items: flex-start; }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .tag {
    background: #1c1a3a;
    color: #7c3aed;
    border: 1px solid #2d1b69;
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-size: 0.7rem;
    font-family: monospace;
  }

  /* Error state */
  .hint {
    font-size: 0.8rem;
    color: #6080a0;
    font-style: italic;
  }
</style>
