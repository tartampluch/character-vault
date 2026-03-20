<!--
  @file src/lib/components/ui/DiceRollModal.svelte
  @description Modal dialog for rolling dice against a specific pipeline.

  PURPOSE:
    Provides an interactive dice rolling interface. Given a pipeline and a
    dice formula, the player can:
      1. See the dice formula to be rolled.
      2. Optionally specify target tags (for situational bonus evaluation).
      3. Click "Roll!" to trigger `parseAndRoll()`.
      4. See the full breakdown of the result:
           Natural Roll: [17] + Static Bonus: +5 + Situational: +2 = TOTAL: 24
      5. Re-roll without closing the modal.

    Handles crit/fumble indicators and explosion badges.

  PROPS:
    - `formula: string` — Dice expression to roll (e.g., "1d20", "2d6 + 3").
    - `pipeline: StatisticPipeline` — The pipeline to roll for (provides staticBonus
      and situationalModifiers).
    - `targetTags?: string[]` — Optional target tags for situational evaluation.
    - `label: string` — Display label for the roll (e.g., "Strength Check", "Attack Roll").
    - `onclose: () => void` — Called when the player closes the modal.

  @see src/lib/utils/diceEngine.ts for parseAndRoll() and RollResult.
  @see ARCHITECTURE.md Phase 9.2 for the specification.
-->

<script lang="ts">
  import { parseAndRoll } from '$lib/utils/diceEngine';
  import { formatModifier } from '$lib/utils/formatters';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import type { StatisticPipeline } from '$lib/types/pipeline';
  import type { RollResult } from '$lib/utils/diceEngine';

  // ============================================================
  // PROPS
  // ============================================================

  interface Props {
    /** Dice formula to roll (pre-computed, e.g., "1d20"). */
    formula: string;
    /** The pipeline providing static bonus and situational modifiers. */
    pipeline: StatisticPipeline;
    /** Optional target creature tags for situational modifier matching. */
    targetTags?: string[];
    /** Human-readable label for the roll context. */
    label: string;
    /** Called when the modal is closed. */
    onclose: () => void;
  }

  let {
    formula,
    pipeline,
    targetTags = [],
    label,
    onclose,
  }: Props = $props();

  // ============================================================
  // ROLL STATE
  // ============================================================

  /** The most recent roll result (null before first roll). */
  let lastResult = $state<RollResult | null>(null);

  /** Whether a roll is currently being animated (brief visual delay). */
  let isRolling = $state(false);

  /** Custom target tag input (comma-separated, appended to the provided targetTags). */
  let customTargetTags = $state('');

  // ============================================================
  // DERIVED
  // ============================================================

  /** Effective target tags: provided + custom input. */
  const effectiveTargetTags = $derived.by(() => {
    const custom = customTargetTags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);
    return [...targetTags, ...custom];
  });

  // ============================================================
  // ROLL ACTION
  // ============================================================

  /**
   * Executes the dice roll using the Dice Engine.
   * Uses a brief visual delay to simulate actual rolling animation.
   */
  async function roll() {
    isRolling = true;
    lastResult = null;

    // Brief visual delay for rolling effect
    await new Promise(resolve => setTimeout(resolve, 150));

    lastResult = parseAndRoll(
      formula,
      pipeline,
      {
        targetTags: effectiveTargetTags,
        isAttackOfOpportunity: false,
      },
      engine.settings
    );

    isRolling = false;
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') onclose();
    if (event.key === 'Enter' && !isRolling) roll();
  }
</script>

<!-- svelte-ignore a11y-interactive-supports-focus -->
<div
  class="modal-backdrop"
  role="dialog"
  aria-modal="true"
  aria-label="Dice roll for {label}"
  onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) onclose(); }}
  onkeydown={handleKeyDown}
>
  <div class="modal-panel" class:critical={lastResult?.isCriticalThreat} class:fumble={lastResult?.isAutomaticMiss}>
    <!-- ===================================================== -->
    <!-- HEADER -->
    <!-- ===================================================== -->
    <header class="modal-header">
      <div class="header-left">
        <h2 class="modal-title">🎲 {label}</h2>
        <code class="formula-display">{formula}</code>
      </div>
      <button class="modal-close" onclick={onclose} aria-label="Close dice roll">×</button>
    </header>

    <!-- ===================================================== -->
    <!-- BODY -->
    <!-- ===================================================== -->
    <div class="modal-body">

      <!-- Target tags input (for situational bonuses) -->
      {#if pipeline.situationalModifiers.length > 0}
        <div class="target-row">
          <label for="target-tags-input" class="target-label">
            Target Tags
            <span class="target-hint">
              ({pipeline.situationalModifiers.length} situational bonus{pipeline.situationalModifiers.length !== 1 ? 'es' : ''} available)
            </span>
          </label>
          <input
            id="target-tags-input"
            type="text"
            bind:value={customTargetTags}
            placeholder="e.g. orc, evil, undead"
            class="target-input"
            aria-label="Target creature tags for situational bonuses"
          />
          <!-- Show available situational contexts as hints -->
          <div class="situational-hints">
            {#each pipeline.situationalModifiers as mod}
              <button
                class="hint-chip"
                onclick={() => {
                  const tag = mod.situationalContext ?? '';
                  if (tag && !customTargetTags.includes(tag)) {
                    customTargetTags = customTargetTags ? `${customTargetTags}, ${tag}` : tag;
                  }
                }}
                title="Add '{mod.situationalContext}' to target tags"
                aria-label="Add {mod.situationalContext} tag"
              >
                + {mod.situationalContext}
                ({formatModifier(typeof mod.value === 'number' ? mod.value : 0)})
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- ROLL BUTTON -->
      <button
        class="roll-btn"
        onclick={roll}
        disabled={isRolling}
        aria-label="Roll {formula}"
      >
        {#if isRolling}
          🎲 Rolling...
        {:else if lastResult}
          🎲 Roll Again
        {:else}
          🎲 Roll!
        {/if}
      </button>

      <!-- ===================================================== -->
      <!-- RESULT DISPLAY -->
      <!-- ===================================================== -->
      {#if isRolling}
        <div class="rolling-animation" aria-live="polite" aria-label="Rolling dice...">
          <span class="rolling-dice">🎲</span>
        </div>

      {:else if lastResult}
        <div
          class="result-panel"
          class:result-crit={lastResult.isCriticalThreat}
          class:result-fumble={lastResult.isAutomaticMiss}
          aria-live="polite"
        >
          <!-- Result headline -->
          <div class="result-headline">
            {#if lastResult.isCriticalThreat}
              <span class="result-badge crit">⚔️ CRITICAL THREAT!</span>
            {:else if lastResult.isAutomaticMiss}
              <span class="result-badge fumble">💀 FUMBLE!</span>
            {:else}
              <span class="result-badge normal" aria-label="Final result">Result</span>
            {/if}
            {#if lastResult.numberOfExplosions > 0}
              <span class="explosion-badge" aria-label="{lastResult.numberOfExplosions} explosions">
                💥 EXPLOSION ×{lastResult.numberOfExplosions}
              </span>
            {/if}
          </div>

          <!-- Breakdown grid -->
          <div class="result-breakdown">
            <div class="result-row">
              <span class="result-label">Dice rolls</span>
              <span class="result-value dice-rolls">[{lastResult.diceRolls.join(', ')}]</span>
            </div>
            <div class="result-row">
              <span class="result-label">Natural total</span>
              <span class="result-value natural">{lastResult.naturalTotal}</span>
            </div>
            {#if lastResult.staticBonus !== 0}
              <div class="result-row">
                <span class="result-label">Static bonus</span>
                <span class="result-value static">{formatModifier(lastResult.staticBonus)}</span>
              </div>
            {/if}
            {#if lastResult.situationalBonusApplied !== 0}
              <div class="result-row situational-result">
                <span class="result-label">Situational bonus</span>
                <span class="result-value situational">{formatModifier(lastResult.situationalBonusApplied)}</span>
              </div>
            {/if}
          </div>

          <!-- FINAL TOTAL -->
          <div class="final-total-row" aria-label="Final total: {lastResult.finalTotal}">
            <span class="final-label">Final Total</span>
            <span
              class="final-total"
              class:crit-total={lastResult.isCriticalThreat}
              class:fumble-total={lastResult.isAutomaticMiss}
            >
              {lastResult.finalTotal}
            </span>
          </div>

        </div><!-- /result-panel -->
      {/if}

      <!-- Settings display -->
      {#if engine.settings.diceRules.explodingTwenties}
        <p class="setting-active">⚡ Exploding 20s active</p>
      {/if}

    </div><!-- /modal-body -->
  </div><!-- /modal-panel -->
</div>

<style>
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

  .modal-panel {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 12px;
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
    transition: border-color 0.3s;
  }

  .modal-panel.critical { border-color: #d97706; }
  .modal-panel.fumble   { border-color: #dc2626; }

  /* ========================= HEADER ========================= */
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem 0.75rem;
    border-bottom: 1px solid #21262d;
    gap: 0.75rem;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
  }

  .modal-title {
    margin: 0;
    font-size: 1rem;
    color: #f0f0ff;
    white-space: nowrap;
  }

  .formula-display {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 4px;
    padding: 0.1rem 0.5rem;
    font-size: 0.85rem;
    color: #7dd3fc;
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
    transition: color 0.15s;
  }
  .modal-close:hover { color: #f0f0ff; border-color: #7c3aed; }

  /* ========================= BODY ========================= */
  .modal-body {
    padding: 1rem 1.25rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* ========================= TARGET TAGS ========================= */
  .target-row { display: flex; flex-direction: column; gap: 0.3rem; }

  .target-label {
    font-size: 0.75rem;
    color: #6080a0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .target-hint { color: #4c35a0; font-style: italic; }

  .target-input {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #e0e0f0;
    padding: 0.35rem 0.6rem;
    font-size: 0.85rem;
    font-family: inherit;
    width: 100%;
    box-sizing: border-box;
  }

  .target-input:focus { outline: none; border-color: #7c3aed; }

  .situational-hints {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .hint-chip {
    background: #1c1a3a;
    color: #c4b5fd;
    border: 1px solid #4c35a0;
    border-radius: 4px;
    padding: 0.15rem 0.5rem;
    font-size: 0.72rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .hint-chip:hover { background: #2d1b69; }

  /* ========================= ROLL BUTTON ========================= */
  .roll-btn {
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 0.75rem;
    font-size: 1.1rem;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
    width: 100%;
  }

  .roll-btn:hover:not(:disabled) { background: #6d28d9; }
  .roll-btn:active:not(:disabled) { transform: scale(0.98); }
  .roll-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  /* ========================= ROLLING ANIMATION ========================= */
  .rolling-animation {
    text-align: center;
    padding: 1rem;
    font-size: 2rem;
    animation: spin 0.3s ease infinite;
  }

  @keyframes spin {
    0%   { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* ========================= RESULT PANEL ========================= */
  .result-panel {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .result-panel.result-crit { border-color: #d97706; background: #1c1000; }
  .result-panel.result-fumble { border-color: #dc2626; background: #1c0000; }

  .result-headline {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .result-badge {
    font-size: 0.85rem;
    font-weight: bold;
    padding: 0.2rem 0.6rem;
    border-radius: 4px;
  }

  .result-badge.crit   { background: #7c4800; color: #fbbf24; }
  .result-badge.fumble { background: #7c0000; color: #f87171; }
  .result-badge.normal { background: #1a1a3a; color: #c4b5fd; }

  .explosion-badge {
    background: #d97706;
    color: #000;
    font-size: 0.8rem;
    font-weight: bold;
    padding: 0.15rem 0.6rem;
    border-radius: 12px;
  }

  .result-breakdown {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .result-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.85rem;
  }

  .result-label { color: #6080a0; }
  .result-value { font-weight: 600; }
  .dice-rolls   { color: #7dd3fc; font-family: monospace; }
  .natural      { color: #e0e0f0; }
  .static       { color: #c4b5fd; }
  .situational  { color: #4ade80; }
  .situational-result { background: #0a0f1a; border-radius: 4px; padding: 0.15rem 0.3rem; }

  .final-total-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 0.5rem;
    border-top: 1px solid #21262d;
  }

  .final-label { font-size: 0.9rem; color: #8080a0; font-weight: 500; }

  .final-total {
    font-size: 1.8rem;
    font-weight: bold;
    color: #fbbf24;
  }

  .final-total.crit-total   { color: #fbbf24; }
  .final-total.fumble-total { color: #f87171; }

  /* ========================= SETTINGS ========================= */
  .setting-active {
    font-size: 0.72rem;
    color: #7c3aed;
    background: #1c1a3a;
    border: 1px solid #4c35a0;
    border-radius: 4px;
    padding: 0.2rem 0.6rem;
    text-align: center;
    margin: 0;
  }
</style>
