<!--
  @file src/lib/components/core/SavingThrowsSummary.svelte
  @description Compact read-only summary of the three saving throws for the Core tab.

  PURPOSE:
    Displays Fortitude, Reflex, and Will saving throw total modifiers.
    Each saving throw shows:
      - A label (localised via engine.t())
      - The total modifier value with explicit sign (+N or -N)
      - The ability score that governs it (CON → Fort, DEX → Ref, WIS → Will)
        displayed as a small indicator

    Includes a link to the full Abilities tab (Phase 9) where the player can
    see the breakdown (class base + ability mod + misc bonuses).

  READ-ONLY DESIGN:
    This is a SUMMARY component — shows final computed values only.
    The full interactive editor with breakdown modals and dice roll buttons
    is in Phase 9: SavingThrows.svelte.

  D&D 3.5 SAVING THROW MECHANISM:
    Fortitude = Class base (CON type increments summed) + CON modifier + misc
    Reflex    = Class base (DEX type increments summed) + DEX modifier + misc
    Will      = Class base (WIS type increments summed) + WIS modifier + misc

    The `phase3_combatStats` $derived in GameEngine.svelte.ts resolves these
    complete totals. This component just reads the final `totalValue`.

  ARCHITECTURE:
    - Reads: `engine.phase3_combatStats` (saves.fort, saves.ref, saves.will)
    - Reads: `engine.phase2_attributes` (for ability score modifier indicator)
    - No mutations.

  @see src/lib/components/abilities/SavingThrows.svelte (Phase 9) for full editor.
  @see ARCHITECTURE.md Phase 8.6 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { formatModifier } from '$lib/utils/formatters';

  /**
   * Configuration for the three saving throws.
   *
   * KEY ABILITY PATTERN:
   *   Each save has a "key ability" that contributes its `derivedModifier` to the total.
   *   D&D 3.5:  Fortitude → Constitution (stat_con)
   *             Reflex    → Dexterity    (stat_dex)
   *             Will      → Wisdom       (stat_wis)
   *
   *   This mapping is DATA in this array, not hardcoded logic.
   *   The GameEngine has already baked the ability modifier into `totalValue`,
   *   so this component only needs the key ability ID for the "indicator" label.
   */
  const SAVES = [
    {
      pipelineId: 'saves.fort',
      keyAbilityId: 'stat_con',
      keyAbilityAbbr: 'CON',
      color: '#f87171', // Red — Fortitude
    },
    {
      pipelineId: 'saves.ref',
      keyAbilityId: 'stat_dex',
      keyAbilityAbbr: 'DEX',
      color: '#93c5fd', // Blue — Reflex
    },
    {
      pipelineId: 'saves.will',
      keyAbilityId: 'stat_wis',
      keyAbilityAbbr: 'WIS',
      color: '#c4b5fd', // Purple — Will
    },
  ] as const;

  const charId = $derived(engine.character.id);
</script>

<div class="saving-throws-summary">
  <div class="summary-header">
    <h3 class="summary-title">🛡️ Saving Throws</h3>
    <a
      href="/character/{charId}?tab=abilities"
      class="edit-link"
      aria-label="Open full Saving Throws editor"
    >
      Edit →
    </a>
  </div>

  <div class="saves-list" role="list" aria-label="Saving throws">
    {#each SAVES as save}
      {@const pipeline = engine.phase3_combatStats[save.pipelineId]}
      {@const keyAbilityMod = engine.phase2_attributes[save.keyAbilityId]?.derivedModifier ?? 0}

      {#if pipeline}
        <div
          class="save-row"
          role="listitem"
          aria-label="{engine.t(pipeline.label)}: {formatModifier(pipeline.totalValue)}"
        >
          <!-- Save label -->
          <span class="save-label">{engine.t(pipeline.label)}</span>

          <!-- Key ability indicator (CON, DEX, WIS) -->
          <span
            class="save-ability"
            title="Governed by {save.keyAbilityAbbr} ({formatModifier(keyAbilityMod)})"
            aria-hidden="true"
            style="color: {save.color};"
          >
            {save.keyAbilityAbbr}
          </span>

          <!-- Total modifier value -->
          <span
            class="save-total"
            class:positive={pipeline.totalValue > 0}
            class:negative={pipeline.totalValue < 0}
            style="color: {save.color};"
          >
            {formatModifier(pipeline.totalValue)}
          </span>
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .saving-throws-summary {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1rem 1.25rem;
  }

  /* ========================= HEADER ========================= */
  .summary-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.5rem;
  }

  .summary-title {
    margin: 0;
    font-size: 0.95rem;
    color: #c4b5fd;
  }

  .edit-link {
    font-size: 0.78rem;
    color: #7c3aed;
    text-decoration: none;
    transition: color 0.15s;
  }

  .edit-link:hover {
    color: #c4b5fd;
    text-decoration: underline;
  }

  /* ========================= SAVES LIST ========================= */
  .saves-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .save-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 6px;
    transition: border-color 0.15s;
  }

  .save-row:hover {
    border-color: #4c35a0;
  }

  .save-label {
    flex: 1;
    font-size: 0.9rem;
    color: #c0c0d0;
  }

  .save-ability {
    font-size: 0.72rem;
    font-weight: bold;
    letter-spacing: 0.05em;
    opacity: 0.7;
    cursor: help;
  }

  .save-total {
    font-size: 1.1rem;
    font-weight: bold;
    min-width: 2.5rem;
    text-align: right;
    color: #8080a0; /* Neutral default */
  }

  /* Color overriding via inline style (per save color in SAVES config) */
  /* The class modifiers further adjust when significant */
  .save-total.positive { /* Handled by inline style */ }
  .save-total.negative { /* Handled by inline style */ }
</style>
