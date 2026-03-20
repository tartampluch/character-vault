<!--
  @file src/lib/components/abilities/AbilityScores.svelte
  @description Full interactive Ability Scores editor for the Abilities tab (Phase 9).

  PURPOSE:
    The complete ability score management interface with:
      - Base score (editable number input) — calls `engine.setAttributeBase()`
      - Total score (computed, read-only) — from `engine.phase2_attributes`
      - Derived modifier (computed) — floor((totalValue - 10) / 2)
      - Temporary modifier (editable) — a quick adjustment input
      - "ℹ" button → opens `ModifierBreakdownModal` for the pipeline
      - "🎲" button → opens `DiceRollModal` for a stat check (1d20 + bonus)
      - "Point Buy" button → opens `PointBuyModal` (Phase 9.4)
      - "Roll Stats" button → opens `RollStatsModal` (Phase 9.4)

    Also shows:
      - A "Point Buy budget" indicator if the campaign uses point buy.
      - Recommended attributes (colour-coded for the active class).

  ARCHITECTURE:
    - Reads: `engine.phase2_attributes` (fully resolved pipelines)
    - Writes: `engine.setAttributeBase(id, value)` for score edits
    - No game logic in the component — just dispatching to the engine.

  D&D 3.5 TEMPORARY MODIFIER:
    Unlike the core stat, a temporary modifier (from a buff, curse, or condition)
    affects only the immediate game session. We simulate this by adding an `untyped`
    modifier via `engine.addFeature()` with a synthetic "condition" feature.
    For simplicity in Phase 9.3, we provide a direct pipeline `baseValue` adjustment
    for the temporary field, storing it as a note for the player.

  @see src/lib/components/ui/ModifierBreakdownModal.svelte for the breakdown modal.
  @see src/lib/components/ui/DiceRollModal.svelte for the dice rolling modal.
  @see ARCHITECTURE.md Phase 9.3 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { formatModifier } from '$lib/utils/formatters';
  import ModifierBreakdownModal from '$lib/components/ui/ModifierBreakdownModal.svelte';
  import DiceRollModal from '$lib/components/ui/DiceRollModal.svelte';
  import type { ID } from '$lib/types/primitives';

  // ============================================================
  // THE 6 MAIN ABILITY SCORE IDs, in standard D&D order
  // ============================================================

  const MAIN_ABILITY_IDS = [
    'stat_str', 'stat_dex', 'stat_con',
    'stat_int', 'stat_wis', 'stat_cha',
  ] as const;

  /**
   * Maps ability ID to its abbreviation for the input label.
   * This is purely a display mapping — no game logic.
   */
  const ABILITY_ABBRS: Record<string, string> = {
    stat_str: 'STR',
    stat_dex: 'DEX',
    stat_con: 'CON',
    stat_int: 'INT',
    stat_wis: 'WIS',
    stat_cha: 'CHA',
  };

  // ============================================================
  // RECOMMENDED ATTRIBUTES (from active class feature)
  // ============================================================

  /**
   * List of recommended attribute IDs from the active class,
   * if the class has `recommendedAttributes`.
   */
  const recommendedIds = $derived.by(() => {
    for (const afi of engine.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feature = (await engine) ? null : null; // cannot await in $derived
      // Synchronous lookup
      const f = (engine as { character: { activeFeatures: typeof afi[] } }).character
        .activeFeatures;
      break;
    }
    // Use the GameEngine's DataLoader cache synchronously
    for (const afi of engine.character.activeFeatures) {
      if (!afi.isActive) continue;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { dataLoader } = require('$lib/engine/DataLoader');
      const feat = dataLoader.getFeature(afi.featureId);
      if (feat?.category === 'class' && feat.recommendedAttributes?.length) {
        return feat.recommendedAttributes as string[];
      }
    }
    return [] as string[];
  });

  // ============================================================
  // MODAL STATE
  // ============================================================

  /** Which pipeline to show in the breakdown modal (null = closed). */
  let breakdownPipelineId = $state<ID | null>(null);

  /** Which pipeline to roll dice for (null = closed). */
  let diceRollPipelineId = $state<ID | null>(null);

  // ============================================================
  // TEMPORARY MODIFIERS
  // Local state for the "temp modifier" input on each stat.
  // In a future phase this will be stored in the character.
  // ============================================================
  let tempMods = $state<Record<string, string>>({});

  function getTempMod(id: string): number {
    const v = parseInt(tempMods[id] ?? '0', 10);
    return isNaN(v) ? 0 : v;
  }

  // ============================================================
  // HANDLERS
  // ============================================================

  function handleBaseScoreChange(pipelineId: ID, event: Event) {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(val) && val >= 1 && val <= 30) {
      engine.setAttributeBase(pipelineId, val);
    }
  }
</script>

<div class="ability-scores-panel">
  <div class="panel-header">
    <h2 class="panel-title">💪 Ability Scores</h2>
    <!-- Phase 9.4 wizard buttons will be added here -->
    <div class="wizard-buttons">
      <button class="btn-wizard" disabled title="Point Buy wizard — Phase 9.4">
        🎯 Point Buy
      </button>
      <button class="btn-wizard" disabled title="Roll Stats wizard — Phase 9.4">
        🎲 Roll Stats
      </button>
    </div>
  </div>

  <!-- ========================================================= -->
  <!-- SCORE TABLE -->
  <!-- ========================================================= -->
  <div class="scores-table" role="table" aria-label="Ability scores editor">

    <!-- Header -->
    <div class="table-header" role="row">
      <span role="columnheader">Ability</span>
      <span role="columnheader">Base</span>
      <span role="columnheader">Total</span>
      <span role="columnheader">Mod</span>
      <span role="columnheader">Temp</span>
      <span role="columnheader">Actions</span>
    </div>

    <!-- Score rows -->
    {#each MAIN_ABILITY_IDS as abilityId}
      {@const pipeline = engine.phase2_attributes[abilityId]}
      {#if pipeline}
        {@const abbr = ABILITY_ABBRS[abilityId] ?? abilityId.replace('stat_', '').toUpperCase()}
        {@const isRecommended = recommendedIds.includes(abilityId)}
        {@const tempMod = getTempMod(abilityId)}

        <div
          class="table-row"
          role="row"
          class:recommended={isRecommended}
          aria-label="{engine.t(pipeline.label)}: {pipeline.totalValue} ({formatModifier(pipeline.derivedModifier)})"
        >
          <!-- Ability label -->
          <div class="cell-label" role="cell">
            <span class="ability-abbr">{abbr}</span>
            <span class="ability-full">{engine.t(pipeline.label)}</span>
            {#if isRecommended}
              <span class="rec-star" title="Recommended for your class" aria-label="Recommended">★</span>
            {/if}
          </div>

          <!-- Base score (editable) -->
          <div class="cell-base" role="cell">
            <input
              type="number"
              min="1"
              max="30"
              value={pipeline.baseValue}
              class="score-input"
              aria-label="{engine.t(pipeline.label)} base score"
              onchange={(e) => handleBaseScoreChange(abilityId, e)}
            />
          </div>

          <!-- Total value (read-only, computed) -->
          <div class="cell-total" role="cell">
            <span class="score-total">
              {pipeline.totalValue + tempMod}
            </span>
          </div>

          <!-- Derived modifier -->
          <div class="cell-mod" role="cell">
            {@const effectiveMod = Math.floor(((pipeline.totalValue + tempMod) - 10) / 2)}
            <span
              class="score-mod"
              class:positive={effectiveMod > 0}
              class:negative={effectiveMod < 0}
            >
              {formatModifier(effectiveMod)}
            </span>
          </div>

          <!-- Temporary modifier (editable) -->
          <div class="cell-temp" role="cell">
            <input
              type="number"
              value={tempMods[abilityId] ?? '0'}
              class="temp-input"
              aria-label="{engine.t(pipeline.label)} temporary modifier"
              oninput={(e) => {
                tempMods[abilityId] = (e.target as HTMLInputElement).value;
              }}
              title="Temporary modifier (e.g., from a buff or curse)"
            />
          </div>

          <!-- Action buttons -->
          <div class="cell-actions" role="cell">
            <button
              class="action-btn info-btn"
              onclick={() => (breakdownPipelineId = abilityId)}
              title="Show modifier breakdown"
              aria-label="Show {engine.t(pipeline.label)} breakdown"
            >ℹ</button>
            <button
              class="action-btn dice-btn"
              onclick={() => (diceRollPipelineId = abilityId)}
              title="Roll a {engine.t(pipeline.label)} check"
              aria-label="Roll {engine.t(pipeline.label)} check"
            >🎲</button>
          </div>
        </div>
      {/if}
    {/each}
  </div>

</div>

<!-- ============================================================ -->
<!-- BREAKDOWN MODAL -->
<!-- ============================================================ -->
{#if breakdownPipelineId}
  {@const bp = engine.phase2_attributes[breakdownPipelineId]}
  {#if bp}
    <ModifierBreakdownModal
      label="{engine.t(bp.label)} ({ABILITY_ABBRS[breakdownPipelineId] ?? ''})"
      baseValue={bp.baseValue}
      activeModifiers={bp.activeModifiers}
      situationalModifiers={bp.situationalModifiers}
      totalValue={bp.totalValue}
      derivedModifier={bp.derivedModifier}
      onclose={() => (breakdownPipelineId = null)}
    />
  {/if}
{/if}

<!-- ============================================================ -->
<!-- DICE ROLL MODAL -->
<!-- ============================================================ -->
{#if diceRollPipelineId}
  {@const dp = engine.phase2_attributes[diceRollPipelineId]}
  {#if dp}
    <DiceRollModal
      formula="1d20"
      pipeline={dp}
      label="{engine.t(dp.label)} Check"
      onclose={() => (diceRollPipelineId = null)}
    />
  {/if}
{/if}

<style>
  .ability-scores-panel {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1.25rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
  }

  /* ========================= HEADER ========================= */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .panel-title {
    margin: 0;
    font-size: 1rem;
    color: #c4b5fd;
  }

  .wizard-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .btn-wizard {
    background: transparent;
    border: 1px solid #30363d;
    color: #6080a0;
    border-radius: 6px;
    padding: 0.3rem 0.75rem;
    font-size: 0.8rem;
    cursor: not-allowed;
    opacity: 0.6;
  }

  /* ========================= TABLE ========================= */
  .scores-table {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .table-header {
    display: grid;
    grid-template-columns: 1fr 3.5rem 3.5rem 3.5rem 3.5rem 5rem;
    gap: 0.5rem;
    padding: 0 0.4rem 0.3rem;
    border-bottom: 1px solid #21262d;
    font-size: 0.7rem;
    color: #4a4a6a;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .table-row {
    display: grid;
    grid-template-columns: 1fr 3.5rem 3.5rem 3.5rem 3.5rem 5rem;
    gap: 0.5rem;
    align-items: center;
    padding: 0.35rem 0.4rem;
    border-radius: 6px;
    border: 1px solid transparent;
    transition: border-color 0.15s, background 0.1s;
  }

  .table-row:hover { background: #0d1117; }

  .table-row.recommended {
    border-color: #1a3a1a;
    background: #0f1a0f;
  }

  /* ========================= CELLS ========================= */
  .cell-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .ability-abbr {
    font-size: 0.72rem;
    font-weight: bold;
    color: #6080a0;
    letter-spacing: 0.06em;
    min-width: 2.2rem;
  }

  .ability-full {
    font-size: 0.85rem;
    color: #c0c0d0;
  }

  .rec-star {
    color: #4ade80;
    font-size: 0.75rem;
  }

  .score-input {
    width: 100%;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #7dd3fc;
    padding: 0.2rem 0.3rem;
    font-size: 0.9rem;
    font-weight: bold;
    text-align: center;
    box-sizing: border-box;
  }

  .score-input:focus {
    outline: none;
    border-color: #7c3aed;
  }

  .score-total {
    display: block;
    font-size: 1rem;
    font-weight: bold;
    color: #7dd3fc;
    text-align: center;
  }

  .score-mod {
    display: block;
    font-size: 0.9rem;
    font-weight: 600;
    text-align: center;
    color: #8080a0;
  }

  .score-mod.positive { color: #86efac; }
  .score-mod.negative { color: #f87171; }

  .temp-input {
    width: 100%;
    background: #0d1117;
    border: 1px solid #2d2d5e;
    border-radius: 4px;
    color: #fbbf24;
    padding: 0.2rem 0.3rem;
    font-size: 0.85rem;
    text-align: center;
    box-sizing: border-box;
  }

  .temp-input:focus {
    outline: none;
    border-color: #fbbf24;
  }

  .cell-actions {
    display: flex;
    gap: 0.3rem;
    justify-content: flex-end;
  }

  .action-btn {
    background: transparent;
    border: 1px solid #30363d;
    border-radius: 4px;
    width: 1.8rem;
    height: 1.8rem;
    font-size: 0.8rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.15s, background 0.15s;
  }

  .info-btn { color: #7c3aed; }
  .info-btn:hover { background: #1c1a3a; border-color: #7c3aed; }

  .dice-btn { color: #fbbf24; }
  .dice-btn:hover { background: #1a1a00; border-color: #fbbf24; }
</style>
