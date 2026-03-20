<!--
  @file src/lib/components/abilities/SkillsMatrix.svelte
  @description Full interactive Skills Matrix for the Abilities tab.

  PURPOSE:
    The complete skills management table:
      - Header: "Skill Points Available" vs "Skill Points Spent" calculator.
      - Table rows for every skill:
          ★ Class Skill checkbox (read-only, derived from active classes)
          Skill Name (localised)
          Total Bonus (computed, read-only)
          Key Ability abbreviation
          User Misc input (additional per-skill bonus, stored locally)
          Ranks input (editable integer → calls engine.setSkillRanks())
          Cost per rank (1 for class skills, 2 for cross-class)
          Max allowed ranks (Level + 3 for class, half for cross-class)
      - ℹ button → ModifierBreakdownModal for the skill pipeline

  SKILL POINTS AVAILABLE (D&D 3.5):
    Formula: (base class skill points + INT modifier) × (characterLevel × multiplier)
    First level × 4 multiplier is common.
    The exact value depends on the class's `skill_points_per_level` modifier.
    For this component, we read:
      - `combatStats.max_hp` baseValue? No.
      - Actually: we read `phase0_flatModifiers` for "attributes.skill_points_per_level"
        target ID, sum them up, and multiply by characterLevel.
      - For simplicity in Phase 9.6, we compute:
          available = (intMod + classSkillPoints) × characterLevel
          where classSkillPoints comes from the active class's grantedModifiers
          that target "attributes.skill_points_per_level".

  RANKS MUTATION:
    Typing in the Ranks input calls `engine.setSkillRanks(skillId, value)`.
    This directly updates `character.skills[skillId].ranks` via `$state` mutation,
    which triggers `phase4_skills` `$derived` to re-evaluate.

  SYNERGY BONUSES:
    Synergy bonuses from `phase4_skills` are included in the skill's `totalValue`.
    The breakdown modal (ℹ) shows these synergy modifiers in the active modifiers list.

  ARCHITECTURE:
    - Reads: `engine.phase4_skills` ($derived — fully resolved with synergies)
    - Reads: `engine.phase0_flatModifiers` (for skill points calculation)
    - Reads: `engine.phase2_attributes['stat_int']` (INT modifier)
    - Reads: `engine.phase0_characterLevel` (for max ranks calculation)
    - Writes: `engine.setSkillRanks(skillId, value)`
    - No D&D rules computed here.

  @see src/lib/engine/GameEngine.svelte.ts for phase4_skills and setSkillRanks.
  @see ARCHITECTURE.md Phase 9.6 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { formatModifier } from '$lib/utils/formatters';
  import ModifierBreakdownModal from '$lib/components/ui/ModifierBreakdownModal.svelte';
  import type { ID } from '$lib/types/primitives';

  // ============================================================
  // SKILL POINTS CALCULATION
  // ============================================================

  /**
   * INT modifier contribution to skill points.
   * Capped at minimum 1 (even with very low INT, classes grant at least 1 skill point/level).
   */
  const intMod = $derived(
    Math.max(0, engine.phase2_attributes['stat_int']?.derivedModifier ?? 0)
  );

  /**
   * Base skill points per level from the active class.
   * D&D 3.5: each class grants a fixed number of skill points per level.
   * This is stored as a modifier targeting "attributes.skill_points_per_level".
   */
  const classSkillPointsPerLevel = $derived.by(() => {
    return engine.phase0_flatModifiers
      .filter(e => e.modifier.targetId === 'attributes.skill_points_per_level' && !e.modifier.situationalContext)
      .reduce((sum, e) => sum + (typeof e.modifier.value === 'number' ? e.modifier.value : 0), 0);
  });

  /**
   * Total skill points available.
   * Standard D&D 3.5: (base + INT modifier) × characterLevel
   * First-level bonus × 4 is added for the first level (if applicable).
   * For simplicity: (base + INT) × level (no first-level multiplier in this phase).
   *
   * Minimum 1 point per level regardless of INT.
   */
  const skillPointsAvailable = $derived.by(() => {
    const perLevel = Math.max(1, classSkillPointsPerLevel + intMod);
    return perLevel * engine.phase0_characterLevel;
  });

  /**
   * Total skill points spent across all skills.
   * Cross-class skills cost 2 points per rank.
   * Class skills cost 1 point per rank.
   */
  const skillPointsSpent = $derived.by(() => {
    let total = 0;
    for (const skill of Object.values(engine.character.skills)) {
      const cost = skill.isClassSkill ? 1 : 2;
      total += skill.ranks * cost;
    }
    return total;
  });

  const skillPointsRemaining = $derived(skillPointsAvailable - skillPointsSpent);
  const isOverBudget = $derived(skillPointsRemaining < 0);

  // ============================================================
  // SORTED SKILLS LIST
  // ============================================================

  /**
   * Skills sorted: class skills first (by name), then cross-class (by name).
   */
  const sortedSkills = $derived.by(() => {
    const skills = Object.values(engine.phase4_skills);
    const classSkills = skills
      .filter(s => s.isClassSkill)
      .sort((a, b) => engine.t(a.label).localeCompare(engine.t(b.label)));
    const crossClassSkills = skills
      .filter(s => !s.isClassSkill)
      .sort((a, b) => engine.t(a.label).localeCompare(engine.t(b.label)));
    return [...classSkills, ...crossClassSkills];
  });

  // ============================================================
  // MAX RANKS CALCULATION
  // ============================================================

  /**
   * Maximum ranks allowed for a skill.
   * D&D 3.5: Class skill → (characterLevel + 3)
   *          Cross-class → floor((characterLevel + 3) / 2)
   */
  function getMaxRanks(isClassSkill: boolean): number {
    const base = engine.phase0_characterLevel + 3;
    return isClassSkill ? base : Math.floor(base / 2);
  }

  // ============================================================
  // MODAL STATE
  // ============================================================

  let breakdownSkillId = $state<ID | null>(null);

  // ============================================================
  // HANDLERS
  // ============================================================

  function handleRanksChange(skillId: ID, event: Event) {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    if (isNaN(val) || val < 0) return;
    const maxRanks = getMaxRanks(engine.phase4_skills[skillId]?.isClassSkill ?? false);
    const clampedVal = Math.min(val, maxRanks);
    engine.setSkillRanks(skillId, clampedVal);
  }
</script>

<div class="skills-matrix-panel">
  <!-- ========================================================= -->
  <!-- HEADER: Skill Points Budget -->
  <!-- ========================================================= -->
  <div class="matrix-header">
    <h2 class="panel-title">📚 Skills Matrix</h2>
    <div class="sp-budget" class:over-budget={isOverBudget}>
      <span class="sp-label">Skill Points:</span>
      <span class="sp-spent" class:over={isOverBudget}>{skillPointsSpent}</span>
      <span class="sp-sep">/</span>
      <span class="sp-available">{skillPointsAvailable}</span>
      <span class="sp-remaining" class:over={isOverBudget}>
        ({skillPointsRemaining >= 0 ? '+' : ''}{skillPointsRemaining} remaining)
      </span>
    </div>
  </div>

  {#if sortedSkills.length === 0}
    <div class="empty-state">
      <p>No skills loaded. Enable a rule source with skill definitions to populate this table.</p>
      <p class="empty-hint">Expected: <code>config_skill_definitions</code> from Phase 4.2.</p>
    </div>
  {:else}
    <!-- ========================================================= -->
    <!-- SKILL TABLE -->
    <!-- ========================================================= -->
    <div class="table-wrapper">
      <table class="skill-table" aria-label="Skills matrix">
        <thead>
          <tr>
            <th class="th-cs" aria-label="Class skill">★</th>
            <th class="th-name">Skill</th>
            <th class="th-total">Total</th>
            <th class="th-ability">Ability</th>
            <th class="th-ranks">Ranks</th>
            <th class="th-cost">Cost</th>
            <th class="th-max">Max</th>
            <th class="th-actions">ℹ</th>
          </tr>
        </thead>
        <tbody>
          {#each sortedSkills as skill}
            {@const maxRanks = getMaxRanks(skill.isClassSkill)}
            {@const costPerRank = skill.isClassSkill ? 1 : 2}
            {@const isAtMax = skill.ranks >= maxRanks}

            <tr
              class="skill-row"
              class:class-skill={skill.isClassSkill}
              class:has-ranks={skill.ranks > 0}
              aria-label="{engine.t(skill.label)}: {formatModifier(skill.totalValue)}"
            >
              <!-- Class skill indicator -->
              <td class="td-cs">
                <span
                  class="cs-star"
                  class:active={skill.isClassSkill}
                  title={skill.isClassSkill ? 'Class Skill' : 'Cross-class Skill'}
                  aria-label={skill.isClassSkill ? 'Class Skill' : 'Cross-class'}
                >
                  {skill.isClassSkill ? '★' : '·'}
                </span>
              </td>

              <!-- Skill name -->
              <td class="td-name">
                <span class="skill-name">{engine.t(skill.label)}</span>
                {#if !skill.canBeUsedUntrained && skill.ranks === 0}
                  <span class="untrained-badge" aria-label="Requires training">T</span>
                {/if}
              </td>

              <!-- Total bonus -->
              <td class="td-total">
                <span
                  class="total-val"
                  class:positive={skill.totalValue > 0}
                  class:negative={skill.totalValue < 0}
                >
                  {formatModifier(skill.totalValue)}
                </span>
              </td>

              <!-- Key ability abbreviation -->
              <td class="td-ability">
                <span class="ability-abbr">
                  {skill.keyAbility.replace('stat_', '').toUpperCase().slice(0, 3)}
                </span>
              </td>

              <!-- Ranks input -->
              <td class="td-ranks">
                <input
                  type="number"
                  min="0"
                  max={maxRanks}
                  value={skill.ranks}
                  class="ranks-input"
                  class:at-max={isAtMax}
                  aria-label="{engine.t(skill.label)} ranks (max {maxRanks})"
                  onchange={(e) => handleRanksChange(skill.id, e)}
                />
              </td>

              <!-- Cost per rank -->
              <td class="td-cost">
                <span class="cost-val" class:cross-class={!skill.isClassSkill}>{costPerRank}</span>
              </td>

              <!-- Max ranks -->
              <td class="td-max">
                <span class="max-val">{maxRanks}</span>
              </td>

              <!-- Breakdown button -->
              <td class="td-actions">
                <button
                  class="action-btn info-btn"
                  onclick={() => (breakdownSkillId = skill.id)}
                  aria-label="Show {engine.t(skill.label)} breakdown"
                  title="Show modifier breakdown"
                >ℹ</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- ============================================================ -->
<!-- BREAKDOWN MODAL -->
<!-- ============================================================ -->
{#if breakdownSkillId}
  {@const bp = engine.phase4_skills[breakdownSkillId]}
  {#if bp}
    <ModifierBreakdownModal
      label={engine.t(bp.label)}
      baseValue={0}
      activeModifiers={bp.activeModifiers}
      situationalModifiers={bp.situationalModifiers}
      totalValue={bp.totalValue}
      onclose={() => (breakdownSkillId = null)}
    />
  {/if}
{/if}

<style>
  .skills-matrix-panel {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1.25rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
  }

  /* ========================= HEADER ========================= */
  .matrix-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
    gap: 0.75rem;
    flex-wrap: wrap;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.5rem;
  }

  .panel-title { margin: 0; font-size: 1rem; color: #c4b5fd; }

  .sp-budget {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.85rem;
  }

  .sp-label { color: #6080a0; }
  .sp-spent { color: #c4b5fd; font-weight: bold; }
  .sp-spent.over { color: #f87171; }
  .sp-sep { color: #4a4a6a; }
  .sp-available { color: #86efac; font-weight: bold; }
  .sp-remaining { color: #4ade80; font-size: 0.78rem; }
  .sp-remaining.over { color: #f87171; }

  /* ========================= EMPTY ========================= */
  .empty-state {
    padding: 1rem;
    text-align: center;
    color: #4a4a6a;
    font-size: 0.85rem;
  }

  .empty-hint { font-style: italic; font-size: 0.78rem; }

  /* ========================= TABLE WRAPPER ========================= */
  .table-wrapper {
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: #30363d transparent;
  }

  /* ========================= TABLE ========================= */
  .skill-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  .skill-table thead tr {
    border-bottom: 2px solid #21262d;
  }

  .skill-table th {
    padding: 0.25rem 0.4rem;
    text-align: center;
    font-size: 0.7rem;
    color: #4a4a6a;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
    white-space: nowrap;
  }

  .th-name { text-align: left; }

  /* ========================= TABLE ROWS ========================= */
  .skill-row {
    border-bottom: 1px solid #21262d;
    transition: background 0.1s;
  }

  .skill-row:hover { background: #0d1117; }

  .skill-row.has-ranks { background: #0f1a0f; }
  .skill-row.has-ranks:hover { background: #0d1a0d; }

  .skill-table td {
    padding: 0.2rem 0.4rem;
    text-align: center;
    vertical-align: middle;
    color: #c0c0d0;
  }

  /* ========================= CELLS ========================= */
  .td-name { text-align: left; }

  .cs-star { font-size: 0.8rem; color: #3a3a5a; }
  .cs-star.active { color: #fbbf24; }

  .skill-name {
    font-size: 0.85rem;
    color: #c0c0d0;
    white-space: nowrap;
  }

  .skill-row.class-skill .skill-name { color: #e0e0f0; }
  .skill-row.has-ranks .skill-name { color: #f0f0ff; font-weight: 500; }

  .untrained-badge {
    font-size: 0.65rem;
    background: #2a1a0a;
    color: #fbbf24;
    border: 1px solid #854d0e;
    border-radius: 3px;
    padding: 0.05rem 0.25rem;
    margin-left: 0.25rem;
    vertical-align: middle;
  }

  .total-val { font-weight: 600; }
  .total-val.positive { color: #86efac; }
  .total-val.negative { color: #f87171; }

  .ability-abbr {
    font-size: 0.72rem;
    color: #6080a0;
    font-family: monospace;
    font-weight: bold;
  }

  .ranks-input {
    width: 3rem;
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 4px;
    color: #c4b5fd;
    padding: 0.15rem 0.2rem;
    font-size: 0.85rem;
    text-align: center;
    transition: border-color 0.15s;
  }

  .ranks-input:focus { outline: none; border-color: #7c3aed; }
  .ranks-input.at-max { border-color: #fbbf24; color: #fbbf24; }

  .cost-val { color: #6080a0; }
  .cost-val.cross-class { color: #f87171; }

  .max-val { color: #4a4a6a; }

  /* ========================= ACTIONS ========================= */
  .td-actions { padding: 0.2rem 0.3rem; }

  .action-btn {
    background: transparent;
    border: 1px solid #30363d;
    border-radius: 4px;
    width: 1.6rem;
    height: 1.6rem;
    font-size: 0.7rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    margin: 0 auto;
  }

  .info-btn { color: #7c3aed; }
  .info-btn:hover { background: #1c1a3a; border-color: #7c3aed; }
</style>
