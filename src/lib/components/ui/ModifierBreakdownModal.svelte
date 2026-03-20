<!--
  @file src/lib/components/ui/ModifierBreakdownModal.svelte
  @description Modal dialog displaying the math breakdown for a pipeline.

  PURPOSE:
    Shows the player exactly why their stat has a certain value:
      "Base 0 + Barbarian 3 (+3 base) + Belt of Strength (+2 enhancement) = Total 5"

    Structure:
      1. Displays the pipeline's label as the title.
      2. Shows `baseValue` on its own line.
      3. Lists all `activeModifiers` with their source name, value, and type.
      4. Lists suppressed modifiers (if any) greyed out (these lost to stacking rules).
      5. Shows the formula: Base + Total Bonus = Final Value.
      6. Optionally lists `situationalModifiers` as a separate section.

  PROPS:
    - `pipelineId: string | null` — the pipeline to display. `null` = modal closed.
    - `label: string` — display label for the modal title (e.g., "Strength", "AC").
    - `baseValue: number` — the base value BEFORE modifiers.
    - `activeModifiers: Modifier[]` — resolved, applied modifiers (with stacking applied).
    - `situationalModifiers: Modifier[]` — situational-only modifiers (shown separately).
    - `appliedModifiers: Modifier[]` — modifiers that COUNTED toward the total.
    - `suppressedModifiers: Modifier[]` — modifiers that did NOT count (stacking losers).
    - `totalValue: number` — the final computed value.
    - `derivedModifier: number` — the D&D 3.5 modifier for ability scores.
    - `onclose: () => void` — called when the player closes the modal.

  DESIGN NOTE on STACKING DISPLAY:
    This component receives pre-resolved data (after stacking rules have been applied).
    It does NOT run stacking rules itself — that is the GameEngine's job.
    For the full breakdown including suppressed modifiers, the caller should pass
    the result of `applyStackingRules()`.

  @see src/lib/utils/stackingRules.ts for StackingResult type.
  @see ARCHITECTURE.md Phase 9.2 for the specification.
-->

<script lang="ts">
  import { formatModifier } from '$lib/utils/formatters';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import type { Modifier } from '$lib/types/pipeline';

  // ============================================================
  // PROPS
  // ============================================================

  interface Props {
    /** Display label for the modal title. */
    label: string;
    /** The base value before any modifiers. */
    baseValue: number;
    /** Modifiers that actively contributed to the total (after stacking). */
    activeModifiers: Modifier[];
    /** Modifiers that were suppressed (lost to non-stacking rules). */
    suppressedModifiers?: Modifier[];
    /** Situational modifiers (not in the total, shown separately). */
    situationalModifiers?: Modifier[];
    /** The final computed total value. */
    totalValue: number;
    /** The D&D 3.5 ability modifier derived from totalValue (0 if not applicable). */
    derivedModifier?: number;
    /** Called when the modal is closed. */
    onclose: () => void;
  }

  let {
    label,
    baseValue,
    activeModifiers,
    suppressedModifiers = [],
    situationalModifiers = [],
    totalValue,
    derivedModifier = 0,
    onclose,
  }: Props = $props();

  // ============================================================
  // HELPERS
  // ============================================================

  function getModifierColor(value: number): string {
    if (value > 0) return '#86efac';
    if (value < 0) return '#f87171';
    return '#6080a0';
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
  aria-label="Modifier breakdown for {label}"
  onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) onclose(); }}
  onkeydown={handleKeyDown}
>
  <div class="modal-panel">
    <!-- ========================================================= -->
    <!-- HEADER -->
    <!-- ========================================================= -->
    <header class="modal-header">
      <h2 class="modal-title">📊 {label} — Breakdown</h2>
      <button class="modal-close" onclick={onclose} aria-label="Close breakdown">×</button>
    </header>

    <!-- ========================================================= -->
    <!-- BODY -->
    <!-- ========================================================= -->
    <div class="modal-body">

      <!-- BASE VALUE -->
      <div class="breakdown-row base-row">
        <span class="breakdown-source">Base value</span>
        <span class="breakdown-type">—</span>
        <span class="breakdown-value neutral">{formatModifier(baseValue)}</span>
      </div>

      <!-- ACTIVE MODIFIERS (applied) -->
      {#each activeModifiers as mod}
        {@const numVal = typeof mod.value === 'number' ? mod.value : 0}
        <div class="breakdown-row">
          <span class="breakdown-source">{engine.t(mod.sourceName)}</span>
          <span class="breakdown-type mod-type-badge type-{mod.type}">{mod.type}</span>
          <span class="breakdown-value" style="color: {getModifierColor(numVal)}">
            {formatModifier(numVal)}
            {#if mod.conditionNode}
              <span class="conditional-tag" title="Conditional modifier" aria-label="Conditional">⚡</span>
            {/if}
          </span>
        </div>
      {/each}

      <!-- SUPPRESSED MODIFIERS (greyed out — lost to stacking rules) -->
      {#if suppressedModifiers.length > 0}
        <div class="separator suppressed-separator">
          <span>Suppressed (stacking rules)</span>
        </div>
        {#each suppressedModifiers as mod}
          {@const numVal = typeof mod.value === 'number' ? mod.value : 0}
          <div class="breakdown-row suppressed-row">
            <span class="breakdown-source">{engine.t(mod.sourceName)}</span>
            <span class="breakdown-type mod-type-badge type-{mod.type} suppressed-type">{mod.type}</span>
            <span class="breakdown-value suppressed-value">{formatModifier(numVal)}</span>
          </div>
        {/each}
      {/if}

      <!-- FORMULA LINE -->
      <div class="formula-line">
        <span class="formula-label">Base</span>
        <span class="formula-op">+</span>
        <span class="formula-label">Modifiers</span>
        <span class="formula-op">=</span>
        <span class="formula-total">{totalValue}</span>
        {#if derivedModifier !== 0}
          <span class="formula-derived">
            → Modifier: <strong style="color: {getModifierColor(derivedModifier)}">{formatModifier(derivedModifier)}</strong>
          </span>
        {/if}
      </div>

      <!-- SITUATIONAL MODIFIERS (not counted in total) -->
      {#if situationalModifiers.length > 0}
        <div class="separator situational-separator">
          <span>Situational (not in total — applied at roll time)</span>
        </div>
        {#each situationalModifiers as mod}
          {@const numVal = typeof mod.value === 'number' ? mod.value : 0}
          <div class="breakdown-row situational-row">
            <span class="breakdown-source">{engine.t(mod.sourceName)}</span>
            <span class="breakdown-type situational-tag">vs. {mod.situationalContext}</span>
            <span class="breakdown-value" style="color: {getModifierColor(numVal)}">{formatModifier(numVal)}</span>
          </div>
        {/each}
      {/if}

    </div><!-- /modal-body -->
  </div><!-- /modal-panel -->
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
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
    max-width: 480px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem 0.75rem;
    border-bottom: 1px solid #21262d;
    flex-shrink: 0;
  }

  .modal-title {
    margin: 0;
    font-size: 1rem;
    color: #f0f0ff;
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
    transition: color 0.15s;
  }

  .modal-close:hover { color: #f0f0ff; border-color: #7c3aed; }

  .modal-body {
    overflow-y: auto;
    padding: 0.75rem 1.25rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  /* ========================= BREAKDOWN ROWS ========================= */
  .breakdown-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 0.5rem;
    align-items: center;
    padding: 0.25rem 0.4rem;
    border-radius: 4px;
    font-size: 0.85rem;
  }

  .breakdown-row:hover { background: #0d1117; }

  .base-row { border-top: none; }

  .breakdown-source {
    color: #c0c0d0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .breakdown-type {
    font-size: 0.7rem;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    background: #21262d;
    color: #6080a0;
    white-space: nowrap;
  }

  /* Different type badge colours */
  .type-untyped   { background: #1a1a2a; color: #8080a0; }
  .type-racial    { background: #0f1e0f; color: #6abe6a; }
  .type-enhancement { background: #1a0f2a; color: #c084fc; }
  .type-morale    { background: #2a1a0a; color: #fbbf24; }
  .type-base      { background: #0a1a2a; color: #60a0f0; }
  .type-armor     { background: #1a1a0a; color: #e0e060; }
  .type-dodge     { background: #0a1a1a; color: #60d0d0; }
  .type-deflection { background: #1a0a0a; color: #f08060; }
  .type-size      { background: #100a1a; color: #b08060; }
  .type-natural_armor { background: #0a1a0a; color: #60c080; }

  .breakdown-value {
    font-weight: 600;
    font-size: 0.9rem;
    text-align: right;
    min-width: 2.5rem;
  }

  .neutral { color: #6080a0; }

  .conditional-tag {
    font-size: 0.7rem;
    margin-left: 0.2rem;
    vertical-align: middle;
  }

  /* ========================= SUPPRESSED ========================= */
  .suppressed-row { opacity: 0.45; }
  .suppressed-value { color: #3a3a5a; }
  .suppressed-type { opacity: 0.5; }

  /* ========================= SEPARATORS ========================= */
  .separator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.5rem 0 0.25rem;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .separator span { white-space: nowrap; }
  .separator::before, .separator::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #21262d;
  }

  .suppressed-separator { color: #3a3a5a; }
  .situational-separator { color: #4c35a0; }

  /* ========================= FORMULA ========================= */
  .formula-line {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.4rem 0;
    border-top: 1px solid #21262d;
    margin-top: 0.25rem;
    flex-wrap: wrap;
  }

  .formula-label { font-size: 0.75rem; color: #6080a0; }
  .formula-op    { font-size: 0.85rem; color: #4060a0; }
  .formula-total { font-size: 1.1rem; font-weight: bold; color: #fbbf24; }
  .formula-derived { font-size: 0.8rem; color: #6080a0; margin-left: 0.5rem; }

  /* ========================= SITUATIONAL ========================= */
  .situational-row { background: #0a0f1a; }

  .situational-tag {
    background: #1c2540;
    color: #93c5fd;
    border: 1px solid #1e4080;
    font-size: 0.7rem;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    white-space: nowrap;
  }
</style>
