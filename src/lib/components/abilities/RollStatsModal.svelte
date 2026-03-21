<!--
  @file src/lib/components/abilities/RollStatsModal.svelte
  @description Roll Stats (4d6 drop lowest) generation wizard modal.

  PURPOSE:
    Implements the D&D 3.5 rolled character generation (4d6 drop lowest):
      1. Generate 6 scores by rolling 4d6, dropping the lowest die.
      2. If `rerollOnes` setting is true, reroll any 1s before dropping.
      3. Display all 6 rolled values.
      4. Allow the player to assign each value to a desired ability score.
      5. On confirm, calls `engine.setAttributeBase()` for each assignment.

    The player can roll again (generates a fresh set of 6 values).

    The RNG is INJECTABLE: in tests (Phase 17.4), a deterministic RNG is passed.
    In this UI component, we use the default `Math.random()`-based RNG.

  @see src/lib/utils/diceEngine.ts for rollAllAbilityScores().
  @see src/lib/types/settings.ts for CampaignSettings.statGeneration.rerollOnes.
  @see ARCHITECTURE.md Phase 9.4 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { rollAllAbilityScores } from '$lib/utils/diceEngine';
  import { formatModifier } from '$lib/utils/formatters';
  import { IconDiceRoll, IconChecked, IconSuccess, IconTabFeats } from '$lib/components/ui/icons';

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

  // ============================================================
  // ROLLED SCORES STATE
  // ============================================================

  /** The 6 rolled values (unassigned). `null` = not yet rolled. */
  let rolledValues = $state<[number, number, number, number, number, number] | null>(null);

  /** Assignment map: ability ID → index into rolledValues (or -1 = unassigned). */
  let assignments = $state<Record<string, number>>(
    Object.fromEntries(MAIN_ABILITY_IDS.map(id => [id, -1]))
  );

  /** Scores assigned to each ability (computed from assignments + rolledValues). */
  const assignedScores = $derived.by(() => {
    const result: Record<string, number | null> = {};
    for (const id of MAIN_ABILITY_IDS) {
      const idx = assignments[id];
      result[id] = (rolledValues && idx >= 0) ? rolledValues[idx] : null;
    }
    return result;
  });

  /** Set of rolled value indices already assigned. */
  const usedIndices = $derived(
    new Set(Object.values(assignments).filter(i => i >= 0))
  );

  /** Whether all 6 abilities have been assigned a rolled value. */
  const allAssigned = $derived(
    rolledValues !== null &&
    MAIN_ABILITY_IDS.every(id => assignments[id] >= 0)
  );

  // Recommended attributes (synchronous DataLoader lookup — no async needed)
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

  function rollAll() {
    rolledValues = rollAllAbilityScores(
      engine.settings.statGeneration.rerollOnes
    );
    // Reset assignments
    for (const id of MAIN_ABILITY_IDS) {
      assignments[id] = -1;
    }
  }

  function assignValue(abilityId: string, rolledIndex: number) {
    // If this value is already assigned to another ability, unassign it first
    for (const [otherId, idx] of Object.entries(assignments)) {
      if (idx === rolledIndex) {
        assignments[otherId] = -1;
      }
    }
    assignments[abilityId] = rolledIndex;
  }

  function clearAssignment(abilityId: string) {
    assignments[abilityId] = -1;
  }

  function confirmAssignments() {
    if (!allAssigned || !rolledValues) return;
    for (const id of MAIN_ABILITY_IDS) {
      const idx = assignments[id];
      if (idx >= 0 && rolledValues) {
        engine.setAttributeBase(id, rolledValues[idx]);
      }
    }
    onclose();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') onclose();
  }

  function derivedMod(score: number | null): number {
    if (score === null) return 0;
    return Math.floor((score - 10) / 2);
  }
</script>

<!-- svelte-ignore a11y-interactive-supports-focus -->
<div
  class="modal-backdrop"
  role="dialog"
  aria-modal="true"
  aria-label="Roll Stats wizard"
  onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) onclose(); }}
  onkeydown={handleKeyDown}
>
  <div class="modal-panel">
    <header class="modal-header">
       <h2 class="modal-title"><IconDiceRoll size={20} aria-hidden="true" /> Roll Stats (4d6 Drop Lowest)</h2>
      <button class="modal-close" onclick={onclose} aria-label="Close">×</button>
    </header>

    <div class="modal-body">
      <!-- Settings info -->
      <div class="settings-info">
        {#if engine.settings.statGeneration.rerollOnes}
          <span class="setting-chip active"><IconSuccess size={12} aria-hidden="true" /> Reroll 1s active</span>
        {:else}
          <span class="setting-chip">Reroll 1s: OFF</span>
        {/if}
        <span class="setting-desc">Method: 4d6 drop lowest × 6</span>
      </div>

      <!-- ROLL BUTTON -->
      <button class="roll-btn" onclick={rollAll}>
        <IconDiceRoll size={16} aria-hidden="true" /> {rolledValues ? 'Roll Again' : 'Roll!'}
      </button>

      {#if rolledValues}
        <!-- Rolled values pool -->
        <div class="rolled-pool">
          <span class="pool-label">Rolled values (click to assign):</span>
          <div class="pool-values">
            {#each rolledValues as val, index}
              {@const isUsed = usedIndices.has(index)}
              <button
                class="pool-chip"
                class:used={isUsed}
                onclick={() => {
                  // Clicking a chip assigns it to the first unassigned ability
                  if (!isUsed) {
                    const unassigned = MAIN_ABILITY_IDS.find(id => assignments[id] < 0);
                    if (unassigned) assignValue(unassigned, index);
                  }
                }}
                aria-label="Value {val}{isUsed ? ' (assigned)' : ''}"
              >
                {val}
                {#if isUsed}
                  <span class="used-mark" aria-hidden="true"><IconChecked size={12} /></span>
                {/if}
              </button>
            {/each}
          </div>
        </div>

        <!-- Assignment rows -->
        <div class="assignment-grid">
          {#each MAIN_ABILITY_IDS as abilityId}
            {@const abbr = ABILITY_ABBRS[abilityId]}
            {@const assignedIdx = assignments[abilityId]}
            {@const score = assignedScores[abilityId]}
            {@const isRec = recommendedIds.includes(abilityId)}

            <div class="assignment-row" class:recommended={isRec}>
              <span class="assign-abbr">{abbr}</span>

              <!-- Score dropdown: select from unassigned rolled values -->
              <select
                class="assign-select"
                value={assignedIdx}
                onchange={(e) => {
                  const idx = parseInt((e.target as HTMLSelectElement).value, 10);
                  if (idx >= 0) assignValue(abilityId, idx);
                  else clearAssignment(abilityId);
                }}
                aria-label="Assign a rolled value to {abbr}"
              >
                <option value="-1">— Not assigned —</option>
                {#each rolledValues as val, index}
                  {#if !usedIndices.has(index) || assignments[abilityId] === index}
                    <option value={index}>{val}</option>
                  {/if}
                {/each}
              </select>

              <!-- Modifier preview -->
              {#if score !== null}
                {@const dMod = derivedMod(score)}
                <span class="assign-score">{score}</span>
                <span class="assign-mod"
                  class:positive={dMod > 0}
                  class:negative={dMod < 0}
                >({formatModifier(dMod)})</span>
              {:else}
                <span class="assign-empty">—</span>
              {/if}

              {#if isRec}
                <span class="rec-star" aria-label="Recommended"><IconTabFeats size={12} /></span>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Actions -->
        <div class="modal-actions">
          <button
            class="btn-confirm"
            onclick={confirmAssignments}
            disabled={!allAssigned}
          >
             <IconChecked size={16} aria-hidden="true" /> Apply These Scores
          </button>
        </div>
      {:else}
        <p class="roll-hint">Click "Roll!" to generate 6 ability scores.</p>
      {/if}
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
    max-width: 460px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
    max-height: 90vh;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem 0.75rem;
    border-bottom: 1px solid #21262d;
  }

  .modal-title { margin: 0; font-size: 1rem; color: #f0f0ff; }

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

  .modal-body {
    padding: 1rem 1.25rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    overflow-y: auto;
  }

  .settings-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .setting-chip {
    background: #21262d;
    color: #6080a0;
    border-radius: 4px;
    padding: 0.15rem 0.5rem;
    font-size: 0.75rem;
  }

  .setting-chip.active {
    background: #0f2a0f;
    color: #4ade80;
    border: 1px solid #166534;
  }

  .setting-desc { font-size: 0.75rem; color: #4a4a6a; }

  .roll-btn {
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 0.7rem;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .roll-btn:hover { background: #6d28d9; }

  .rolled-pool { display: flex; flex-direction: column; gap: 0.3rem; }

  .pool-label { font-size: 0.75rem; color: #6080a0; }

  .pool-values { display: flex; flex-wrap: wrap; gap: 0.4rem; }

  .pool-chip {
    background: #0d1117;
    border: 1px solid #7c3aed;
    color: #c4b5fd;
    border-radius: 6px;
    padding: 0.3rem 0.7rem;
    font-size: 0.95rem;
    font-weight: bold;
    cursor: pointer;
    transition: background 0.15s;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .pool-chip:hover:not(.used) { background: #1c1a3a; }
  .pool-chip.used { opacity: 0.4; cursor: default; }
  .used-mark { font-size: 0.7rem; color: #4ade80; }

  .assignment-grid { display: flex; flex-direction: column; gap: 0.35rem; }

  .assignment-row {
    display: grid;
    grid-template-columns: 2.5rem 1fr 2.5rem 3rem auto;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.4rem;
    border-radius: 4px;
    border: 1px solid transparent;
  }

  .assignment-row:hover { background: #0d1117; }
  .assignment-row.recommended { border-color: #1a3a1a; background: #0f1a0f; }

  .assign-abbr { font-size: 0.75rem; font-weight: bold; color: #6080a0; letter-spacing: 0.06em; }

  .assign-select {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #e0e0f0;
    padding: 0.2rem 0.3rem;
    font-size: 0.85rem;
    font-family: inherit;
    width: 100%;
  }

  .assign-score { font-size: 1rem; font-weight: bold; color: #7dd3fc; text-align: center; }
  .assign-mod { font-size: 0.8rem; color: #6080a0; text-align: center; }
  .assign-mod.positive { color: #86efac; }
  .assign-mod.negative { color: #f87171; }
  .assign-empty { color: #3a3a5a; text-align: center; }
  .rec-star { color: #4ade80; font-size: 0.75rem; }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    padding-top: 0.5rem;
    border-top: 1px solid #21262d;
  }

  .btn-confirm {
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.4rem 1.1rem;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .btn-confirm:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-confirm:not(:disabled):hover { background: #6d28d9; }

  .roll-hint { font-size: 0.85rem; color: #4a4a6a; text-align: center; font-style: italic; margin: 0; }
</style>
