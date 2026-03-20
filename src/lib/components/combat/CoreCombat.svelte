<!--
  @file src/lib/components/combat/CoreCombat.svelte
  @description Core Combat Statistics panel (BAB, Initiative, Grapple).

  PURPOSE:
    Displays the three core combat roll statistics:
      - BAB (Base Attack Bonus): accumulated from class levelProgression.
      - Initiative: DEX modifier + feat modifiers.
      - Grapple: BAB + STR modifier + size modifier.

    Initiative and Grapple have both ℹ (breakdown) and 🎲 (dice roll) buttons.
    BAB is informational (no dice roll button since it's used as a component by attacks).

  @see ARCHITECTURE.md Phase 10.3 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { formatModifier } from '$lib/utils/formatters';
  import ModifierBreakdownModal from '$lib/components/ui/ModifierBreakdownModal.svelte';
  import DiceRollModal from '$lib/components/ui/DiceRollModal.svelte';
  import type { ID } from '$lib/types/primitives';

  const CORE_STATS = [
    {
      id: 'combatStats.bab',
      shortName: 'BAB',
      description: 'Base Attack Bonus',
      showDice: false,
      color: '#f87171',
    },
    {
      id: 'combatStats.init',
      shortName: 'Initiative',
      description: 'Initiative modifier (DEX + misc)',
      showDice: true,
      diceLabel: 'Initiative Roll',
      color: '#fbbf24',
    },
    {
      id: 'combatStats.grapple',
      shortName: 'Grapple',
      description: 'Grapple modifier (BAB + STR + size)',
      showDice: true,
      diceLabel: 'Grapple Check',
      color: '#c084fc',
    },
  ] as const;

  let breakdownId = $state<ID | null>(null);
  let diceRollId = $state<ID | null>(null);
</script>

<div class="core-combat-panel">
  <h2 class="panel-title">⚔️ Core Combat</h2>

  <div class="stats-row">
    {#each CORE_STATS as stat}
      {@const pipeline = engine.phase3_combatStats[stat.id]}
      {#if pipeline}
        <div class="stat-block" style="--color: {stat.color};">
          <span class="stat-label">{stat.shortName}</span>
          <span class="stat-value" style="color: {stat.color};">
            {formatModifier(pipeline.totalValue)}
          </span>
          <div class="stat-actions">
            <button
              class="action-btn"
              onclick={() => (breakdownId = stat.id)}
              aria-label="Show {stat.description} breakdown"
              title="Breakdown"
            >ℹ</button>
            {#if stat.showDice}
              <button
                class="action-btn dice"
                onclick={() => (diceRollId = stat.id)}
                aria-label="Roll {stat.diceLabel ?? stat.description}"
                title="Roll"
              >🎲</button>
            {/if}
          </div>
          <span class="stat-desc">{stat.description}</span>
        </div>
      {/if}
    {/each}
  </div>
</div>

{#if breakdownId}
  {@const bp = engine.phase3_combatStats[breakdownId]}
  {@const sc = CORE_STATS.find(s => s.id === breakdownId)}
  {#if bp && sc}
    <ModifierBreakdownModal
      label={sc.description}
      baseValue={bp.baseValue}
      activeModifiers={bp.activeModifiers}
      situationalModifiers={bp.situationalModifiers}
      totalValue={bp.totalValue}
      onclose={() => (breakdownId = null)}
    />
  {/if}
{/if}

{#if diceRollId}
  {@const dp = engine.phase3_combatStats[diceRollId]}
  {@const sc = CORE_STATS.find(s => s.id === diceRollId)}
  {#if dp && sc}
    <DiceRollModal
      formula="1d20"
      pipeline={dp}
      label={sc.diceLabel ?? sc.description}
      onclose={() => (diceRollId = null)}
    />
  {/if}
{/if}

<style>
  .core-combat-panel {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1.25rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
  }

  .panel-title { margin: 0 0 1rem; font-size: 1rem; color: #c4b5fd; border-bottom: 1px solid #21262d; padding-bottom: 0.5rem; }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.75rem;
  }

  .stat-block {
    background: #0d1117;
    border: 1px solid #21262d;
    border-top: 3px solid var(--color, #7c3aed);
    border-radius: 8px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    text-align: center;
  }

  .stat-label { font-size: 0.72rem; font-weight: bold; color: var(--color, #c4b5fd); letter-spacing: 0.06em; text-transform: uppercase; }
  .stat-value { font-size: 1.8rem; font-weight: bold; line-height: 1; }
  .stat-desc  { font-size: 0.64rem; color: #4a4a6a; line-height: 1.3; }

  .stat-actions { display: flex; gap: 0.3rem; }

  .action-btn {
    background: transparent;
    border: 1px solid #30363d;
    color: #7c3aed;
    border-radius: 4px;
    width: 1.5rem;
    height: 1.5rem;
    font-size: 0.72rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .action-btn:hover { background: #1c1a3a; border-color: #7c3aed; }
  .action-btn.dice { color: #fbbf24; }
  .action-btn.dice:hover { background: #1a1a00; border-color: #fbbf24; }
</style>
