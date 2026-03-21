<!--
  @file src/lib/components/core/AbilityScoresSummary.svelte
  @description Compact read-only summary of the 6 main ability scores for the Core tab.

  PURPOSE:
    Displays the six main ability scores (STR, DEX, CON, INT, WIS, CHA) in a compact
    grid with:
      - The ability score label (localised via engine.t())
      - The `totalValue` (e.g., 18)
      - The `derivedModifier` formatted with sign (e.g., "+4")

    Includes a navigation link/button to the full Abilities tab (Phase 9)
    where the player can edit scores, use Point Buy, or roll stats.

  READ-ONLY DESIGN:
    This is a SUMMARY component — it shows final computed values, not editors.
    The full interactive editor (with base score inputs, temporary modifiers,
    breakdown modals, dice roll buttons) is in Phase 9: AbilityScores.svelte.

    Reading directly from `engine.phase2_attributes` (the fully resolved pipelines)
    ensures this component always shows up-to-date values after any change.

  ARCHITECTURE:
    - Reads: `engine.phase2_attributes` ($derived — fully resolved)
    - No mutations.
    - Link to `?tab=abilities` for full editor navigation.

  @see src/lib/components/abilities/AbilityScores.svelte (Phase 9) for the full editor.
  @see src/lib/engine/GameEngine.svelte.ts for phase2_attributes.
  @see ARCHITECTURE.md Phase 8.5 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { formatModifier } from '$lib/utils/formatters';
  import { IconStats } from '$lib/components/ui/icons';

  // ============================================================
  // ABILITY SCORE IDs — the 6 main ability scores
  // These are data-driven: the IDs come from the character's attribute
  // pipeline keys. We define them as an ordered display list.
  // Zero hardcoding of stat names in logic — only in this display constant.
  // ============================================================

  /**
   * The 6 core ability score pipeline IDs in standard D&D display order.
   * The labels are read from the pipeline's `label: LocalizedString` field,
   * not hardcoded here, so they correctly localise to French/English.
   */
  const MAIN_ABILITY_IDS = [
    'stat_str', 'stat_dex', 'stat_con',
    'stat_int', 'stat_wis', 'stat_cha',
  ] as const;

  /**
   * The character's current URL parameter context.
   * Used to construct the "Go to Abilities" navigation link.
   * Read from the character's ID or current URL.
   */
  const charId = $derived(engine.character.id);
</script>

<div class="ability-scores-summary">
  <div class="summary-header">
     <h3 class="summary-title"><IconStats size={20} aria-hidden="true" /> Ability Scores</h3>
    <a
      href="/character/{charId}?tab=abilities"
      class="edit-link"
      aria-label="Open full Ability Scores editor"
    >
      Edit →
    </a>
  </div>

  <!-- ========================================================= -->
  <!-- SCORE GRID — one cell per ability score -->
  <!-- ========================================================= -->
  <div class="scores-grid" role="list" aria-label="Ability scores">
    {#each MAIN_ABILITY_IDS as abilityId}
      {@const pipeline = engine.phase2_attributes[abilityId]}
      {#if pipeline}
        <div
          class="score-cell"
          role="listitem"
          aria-label="{engine.t(pipeline.label)}: {pipeline.totalValue} ({formatModifier(pipeline.derivedModifier)})"
        >
          <!-- Abbreviated score label (STR, DEX, etc.) -->
          <span class="score-abbr" aria-hidden="true">
            {abilityId.replace('stat_', '').toUpperCase()}
          </span>

          <!-- Full localised name on hover (tooltip via title) -->
          <span class="score-name" title={engine.t(pipeline.label)}>
            {engine.t(pipeline.label)}
          </span>

          <!-- Total value (the "18" in "STR 18") -->
          <span class="score-total" aria-hidden="true">
            {pipeline.totalValue}
          </span>

          <!-- Derived modifier (the "+4" in "STR 18 (+4)") -->
          <span
            class="score-modifier"
            class:positive={pipeline.derivedModifier > 0}
            class:negative={pipeline.derivedModifier < 0}
            aria-label="Modifier: {formatModifier(pipeline.derivedModifier)}"
          >
            {formatModifier(pipeline.derivedModifier)}
          </span>
        </div>
      {/if}
    {/each}
  </div>

  <!-- ========================================================= -->
  <!-- FOOTER NOTE (if no stats are set yet) -->
  <!-- ========================================================= -->
  {#if Object.keys(engine.phase2_attributes).length === 0}
    <p class="empty-note">No attributes loaded. Load rule sources to initialise.</p>
  {/if}
</div>

<style>
  .ability-scores-summary {
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

  /* ========================= SCORE GRID ========================= */
  .scores-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  /* ========================= SCORE CELL ========================= */
  .score-cell {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 8px;
    padding: 0.5rem 0.6rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    text-align: center;
    transition: border-color 0.15s;
  }

  .score-cell:hover {
    border-color: #4c35a0;
  }

  /* Abbreviated label (STR, DEX, etc.) */
  .score-abbr {
    font-size: 0.65rem;
    font-weight: bold;
    color: #6080a0;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  /* Full localised name (hidden visually, shown on hover via title attribute) */
  .score-name {
    display: none; /* Shown via .score-abbr title tooltip instead */
  }

  /* The numeric score (e.g., 18) */
  .score-total {
    font-size: 1.2rem;
    font-weight: bold;
    color: #7dd3fc;
    line-height: 1.1;
  }

  /* The derived modifier (e.g., +4, -2) */
  .score-modifier {
    font-size: 0.8rem;
    font-weight: 600;
    color: #8080a0; /* Neutral: zero modifier */
    line-height: 1;
  }

  .score-modifier.positive {
    color: #86efac; /* Green for positive modifiers */
  }

  .score-modifier.negative {
    color: #f87171; /* Red for negative modifiers */
  }

  /* ========================= EMPTY STATE ========================= */
  .empty-note {
    font-size: 0.8rem;
    color: #4a4a6a;
    font-style: italic;
    text-align: center;
    margin: 0.5rem 0 0;
  }
</style>
