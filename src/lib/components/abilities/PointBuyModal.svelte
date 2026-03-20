<!--
  @file src/lib/components/abilities/PointBuyModal.svelte
  @description Point Buy stat generation wizard modal.

  PURPOSE:
    Implements the D&D 3.5 point buy system for character creation:
      - Each ability score starts at 8 (cost 0).
      - The player distributes a budget of points (default: 25, configurable).
      - Cost curve is non-linear (scores 15+ cost more — see ANNEXES.md B.3).
      - Scores are capped at 7 (minimum) to 18 (maximum) during point buy.
      - `recommendedAttributes` from the active class are highlighted green.

    When the player confirms, `engine.setAttributeBase(id, value)` is called
    for each of the 6 main ability scores.

  COST TABLE:
    Loaded from `dataLoader.getConfigTable("config_point_buy_costs")`.
    Fallback to hardcoded if the table is not loaded (for standalone test use).

  @see src/lib/utils/stackingRules.ts for the D&D 3.5 cost reference.
  @see ANNEXES.md B.3 for the point buy cost table data.
  @see ARCHITECTURE.md Phase 9.4 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { formatModifier } from '$lib/utils/formatters';

  // ============================================================
  // PROPS
  // ============================================================

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  // ============================================================
  // CONSTANTS
  // ============================================================

  const MAIN_ABILITY_IDS = [
    'stat_str', 'stat_dex', 'stat_con',
    'stat_int', 'stat_wis', 'stat_cha',
  ] as const;

  const ABILITY_ABBRS: Record<string, string> = {
    stat_str: 'STR', stat_dex: 'DEX', stat_con: 'CON',
    stat_int: 'INT', stat_wis: 'WIS', stat_cha: 'CHA',
  };

  /**
   * Fallback point buy cost table (matches ANNEXES.md B.3).
   * Used when config_point_buy_costs is not in the DataLoader cache.
   */
  const FALLBACK_COSTS: Record<number, number> = {
    7: -4, 8: 0, 9: 1, 10: 2, 11: 3, 12: 4,
    13: 5, 14: 6, 15: 8, 16: 10, 17: 13, 18: 16,
  };

  const MIN_SCORE = 7;
  const MAX_SCORE = 18;

  // ============================================================
  // POINT BUY BUDGET (from CampaignSettings)
  // ============================================================

  const budget = $derived(engine.settings.statGeneration.pointBuyBudget);

  // ============================================================
  // COST TABLE (from DataLoader or fallback)
  // ============================================================

  /**
   * Returns the cumulative point cost to reach a given score from 8.
   * Reads from the config table if available, otherwise uses the fallback.
   */
  function getCumulativeCost(score: number): number {
    const table = dataLoader.getConfigTable('config_point_buy_costs');
    if (table?.data) {
      const row = (table.data as Array<Record<string, unknown>>)
        .find(r => r['score'] === score);
      if (row) return typeof row['cost'] === 'number' ? row['cost'] : 0;
    }
    return FALLBACK_COSTS[score] ?? 0;
  }

  /**
   * Returns the marginal cost to go from (score - 1) to score.
   * Example: going from 14 to 15 costs 2 (8 - 6).
   */
  function getMarginalCost(score: number): number {
    if (score <= 8) return getCumulativeCost(score) - getCumulativeCost(score - 1);
    return getCumulativeCost(score) - getCumulativeCost(score - 1);
  }

  // ============================================================
  // WORKING SCORES STATE (local copy, not committed until "Confirm")
  // ============================================================

  /**
   * Working copy of scores. Initialized from current character base values.
   * Only applied to the engine when the player clicks "Confirm".
   */
  let workingScores = $state<Record<string, number>>(
    Object.fromEntries(
      MAIN_ABILITY_IDS.map(id => [
        id,
        Math.min(MAX_SCORE, Math.max(MIN_SCORE, engine.character.attributes[id]?.baseValue ?? 8)),
      ])
    )
  );

  /**
   * Total points spent across all scores.
   * Formula: sum of getCumulativeCost(score) for each ability.
   */
  const pointsSpent = $derived(
    MAIN_ABILITY_IDS.reduce((total, id) => total + getCumulativeCost(workingScores[id] ?? 8), 0)
  );

  const pointsRemaining = $derived(budget - pointsSpent);
  const isOverBudget = $derived(pointsRemaining < 0);

  // ============================================================
  // RECOMMENDED ATTRIBUTES (from active class)
  // ============================================================

  const recommendedIds = $derived.by(() => {
    for (const afi of engine.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feat = dataLoader.getFeature(afi.featureId);
      if (feat?.category === 'class' && feat.recommendedAttributes?.length) {
        return feat.recommendedAttributes as string[];
      }
    }
    return [] as string[];
  });

  // ============================================================
  // ACTIONS
  // ============================================================

  function increaseScore(abilityId: string) {
    const current = workingScores[abilityId] ?? 8;
    if (current >= MAX_SCORE) return;
    const nextCost = getMarginalCost(current + 1);
    if (pointsRemaining < nextCost) return;
    workingScores[abilityId] = current + 1;
  }

  function decreaseScore(abilityId: string) {
    const current = workingScores[abilityId] ?? 8;
    if (current <= MIN_SCORE) return;
    workingScores[abilityId] = current - 1;
  }

  function resetAll() {
    for (const id of MAIN_ABILITY_IDS) {
      workingScores[id] = 8;
    }
  }

  function confirmBuy() {
    if (isOverBudget) return;
    for (const id of MAIN_ABILITY_IDS) {
      engine.setAttributeBase(id, workingScores[id] ?? 8);
    }
    onclose();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') onclose();
  }

  function derivedMod(score: number): number {
    return Math.floor((score - 10) / 2);
  }
</script>

<!-- svelte-ignore a11y-interactive-supports-focus -->
<div
  class="modal-backdrop"
  role="dialog"
  aria-modal="true"
  aria-label="Point Buy stat generation"
  onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) onclose(); }}
  onkeydown={handleKeyDown}
>
  <div class="modal-panel">
    <header class="modal-header">
      <h2 class="modal-title">🎯 Point Buy</h2>
      <div class="budget-display" class:over-budget={isOverBudget}>
        <span class="budget-label">Budget:</span>
        <span class="budget-value">{pointsSpent}/{budget}</span>
        <span class="budget-remaining" class:over={isOverBudget}>
          ({pointsRemaining >= 0 ? '+' : ''}{pointsRemaining} remaining)
        </span>
      </div>
      <button class="modal-close" onclick={onclose} aria-label="Close">×</button>
    </header>

    <div class="modal-body">
      <!-- Budget progress bar -->
      <div class="budget-bar-container">
        <div
          class="budget-bar"
          class:over={isOverBudget}
          style="width: {Math.min(100, (pointsSpent / budget) * 100)}%"
          role="progressbar"
          aria-valuenow={pointsSpent}
          aria-valuemin={0}
          aria-valuemax={budget}
        ></div>
      </div>

      <!-- Score rows -->
      <div class="scores-grid">
        {#each MAIN_ABILITY_IDS as abilityId}
          {@const score = workingScores[abilityId] ?? 8}
          {@const cost = getCumulativeCost(score)}
          {@const isRec = recommendedIds.includes(abilityId)}
          {@const abbr = ABILITY_ABBRS[abilityId]}
          {@const dMod = derivedMod(score)}

          <div class="score-row" class:recommended={isRec}>
            <span class="score-abbr" title={engine.t(engine.character.attributes[abilityId]?.label ?? {})}>{abbr}</span>

            <button
              class="arrow-btn"
              onclick={() => decreaseScore(abilityId)}
              disabled={score <= MIN_SCORE}
              aria-label="Decrease {abbr}"
            >−</button>

            <span class="score-value">{score}</span>
            <span class="mod-value" class:positive={dMod > 0} class:negative={dMod < 0}>
              ({formatModifier(dMod)})
            </span>

            <button
              class="arrow-btn"
              onclick={() => increaseScore(abilityId)}
              disabled={score >= MAX_SCORE || pointsRemaining < getMarginalCost(score + 1)}
              aria-label="Increase {abbr}"
            >+</button>

            <span class="cost-display" aria-label="{cost} points">
              {cost >= 0 ? '+' : ''}{cost} pts
            </span>

            {#if isRec}
              <span class="rec-indicator" aria-label="Recommended" title="Recommended for your class">★</span>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Actions -->
      <div class="modal-actions">
        <button class="btn-reset" onclick={resetAll}>Reset All (8s)</button>
        <button
          class="btn-confirm"
          onclick={confirmBuy}
          disabled={isOverBudget}
        >
          ✓ Confirm Point Buy
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
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
    display: flex;
    flex-direction: column;
    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.25rem 0.75rem;
    border-bottom: 1px solid #21262d;
    flex-wrap: wrap;
  }

  .modal-title { margin: 0; font-size: 1rem; color: #f0f0ff; flex: 0 0 auto; }

  .budget-display {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex: 1;
    font-size: 0.85rem;
  }

  .budget-label { color: #6080a0; }
  .budget-value { color: #c4b5fd; font-weight: bold; }
  .budget-remaining { color: #4ade80; }
  .budget-remaining.over { color: #f87171; }
  .budget-display.over-budget .budget-value { color: #f87171; }

  .modal-close {
    background: transparent;
    border: 1px solid #30363d;
    color: #8080a0;
    border-radius: 4px;
    width: 1.8rem;
    height: 1.8rem;
    cursor: pointer;
    font-size: 1rem;
  }
  .modal-close:hover { color: #f0f0ff; }

  .modal-body { padding: 1rem 1.25rem 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }

  .budget-bar-container { height: 6px; background: #21262d; border-radius: 3px; overflow: hidden; }
  .budget-bar { height: 100%; background: linear-gradient(90deg, #7c3aed, #a855f7); border-radius: 3px; transition: width 0.2s; }
  .budget-bar.over { background: linear-gradient(90deg, #dc2626, #f87171); }

  .scores-grid { display: flex; flex-direction: column; gap: 0.4rem; }

  .score-row {
    display: grid;
    grid-template-columns: 2.5rem 1.8rem 2.5rem 3rem 1.8rem 4.5rem auto;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.5rem;
    border-radius: 6px;
    border: 1px solid transparent;
  }

  .score-row:hover { background: #0d1117; }
  .score-row.recommended { border-color: #1a3a1a; background: #0f1a0f; }

  .score-abbr { font-size: 0.75rem; color: #6080a0; font-weight: bold; letter-spacing: 0.06em; }
  .arrow-btn {
    background: #0d1117;
    border: 1px solid #30363d;
    color: #c4b5fd;
    border-radius: 4px;
    width: 1.6rem;
    height: 1.6rem;
    cursor: pointer;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .arrow-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .arrow-btn:not(:disabled):hover { background: #2d1b69; }

  .score-value { font-size: 1rem; font-weight: bold; color: #7dd3fc; text-align: center; }
  .mod-value { font-size: 0.8rem; color: #8080a0; text-align: center; }
  .mod-value.positive { color: #86efac; }
  .mod-value.negative { color: #f87171; }
  .cost-display { font-size: 0.75rem; color: #6080a0; text-align: right; }
  .rec-indicator { color: #4ade80; font-size: 0.75rem; }

  .modal-actions { display: flex; gap: 0.75rem; justify-content: flex-end; padding-top: 0.5rem; border-top: 1px solid #21262d; }
  .btn-reset { background: transparent; border: 1px solid #30363d; color: #6080a0; border-radius: 6px; padding: 0.4rem 0.9rem; font-size: 0.85rem; cursor: pointer; }
  .btn-reset:hover { background: #0d1117; }
  .btn-confirm { background: #7c3aed; color: #fff; border: none; border-radius: 6px; padding: 0.4rem 1.1rem; font-size: 0.9rem; cursor: pointer; }
  .btn-confirm:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-confirm:not(:disabled):hover { background: #6d28d9; }
</style>
