<!--
  @file src/lib/components/abilities/SkillsMatrix.svelte
  @description Full interactive Skills Matrix for the Abilities tab.

  LAYOUT:
    Desktop (≥1024px): Full table layout, all columns visible, alternating rows.
    Tablet/Mobile (<1024px): The table is wrapped in a horizontal-scroll container.
      The skill NAME column is sticky (pinned left, `data-table-sticky-col`).
      Data columns (ranks, bonus, etc.) scroll horizontally.

  SKILL POINTS HEADER:
    Shows the correct D&D 3.5 multiclass skill point budget using
    engine.phase4_skillPointsBudget, which computes per-class contributions
    independently (Fighter 2 SP/level × 5 levels ≠ Rogue 8 SP/level × 5 levels).

  RANK ENFORCEMENT:
    - Ranks are clamped to [minimumRanks, maxRanks].
    - minimumRanks: the locked floor set by committed level-ups (from character.minimumSkillRanks).
      During character creation (no committed levels), floors are 0.
    - A "Lock Ranks" button commits the current ranks as the irreducible minimum,
      simulating finalising a level-up and permanently spending the skill points.

  LEVELING JOURNAL:
    A "Journal" button opens the LevelingJournalModal to explain which skill points
    came from which class and level — critical for multiclass characters.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { formatModifier } from '$lib/utils/formatters';
  import ModifierBreakdownModal from '$lib/components/ui/ModifierBreakdownModal.svelte';
  import HorizontalScroll from '$lib/components/ui/HorizontalScroll.svelte';
  import LevelingJournalModal from '$lib/components/abilities/LevelingJournalModal.svelte';
  import type { ID } from '$lib/types/primitives';
  import { IconSkills, IconChecked, IconUnchecked, IconInfo, IconJournal } from '$lib/components/ui/icons';

  // ── Skill points budget — from the new per-class engine computation ──────────
  //
  // phase4_skillPointsBudget correctly computes per-class contributions in D&D 3.5:
  //   Fighter 5 (2+INT) + Rogue 3 (8+INT) ≠ (2+8+INT)×8   (wrong: unified)
  //   Fighter 5 (2+INT)×5 + Rogue 3 (8+INT)×3             (right: per-class)
  //
  // The old approach of multiplying a SUMMED SP/level by total character level
  // is wrong for multiclassing — this component now reads the engine budget directly.
  const budget = $derived(engine.phase4_skillPointsBudget);

  const skillPointsAvailable = $derived(budget.totalAvailable);

  const skillPointsSpent = $derived.by(() => {
    let total = 0;
    for (const skill of Object.values(engine.phase4_skills)) {
      total += skill.ranks * (skill.isClassSkill ? 1 : 2);
    }
    return total;
  });

  const skillPointsRemaining = $derived(skillPointsAvailable - skillPointsSpent);
  const isOverBudget = $derived(skillPointsRemaining < 0);

  const spPct = $derived(
    skillPointsAvailable > 0
      ? Math.min(100, (skillPointsSpent / skillPointsAvailable) * 100)
      : 0
  );

  // ── Sorted skills ─────────────────────────────────────────────────────────────
  const sortedSkills = $derived.by(() => {
    const skills = Object.values(engine.phase4_skills);
    const cls  = skills.filter(s =>  s.isClassSkill).sort((a, b) => engine.t(a.label).localeCompare(engine.t(b.label)));
    const xCls = skills.filter(s => !s.isClassSkill).sort((a, b) => engine.t(a.label).localeCompare(engine.t(b.label)));
    return [...cls, ...xCls];
  });

  /**
   * Returns the maximum allowed ranks for a skill.
   *
   * D&D 3.5 SRD:
   *   Class skill:       max = characterLevel + 3
   *   Cross-class skill: max = floor((characterLevel + 3) / 2)
   *
   * @param isClassSkill - True if the skill is a class skill for any active class.
   */
  function getMaxRanks(isClassSkill: boolean): number {
    const base = engine.phase0_characterLevel + 3;
    return isClassSkill ? base : Math.floor(base / 2);
  }

  /**
   * Returns the minimum allowed ranks for a skill.
   * This is the floor set by committed level-ups (locked ranks).
   * Returns 0 during character creation (before any level-up is committed).
   */
  function getMinRanks(skillId: ID): number {
    return engine.character.minimumSkillRanks?.[skillId] ?? 0;
  }

  // ── Modal/panel state ─────────────────────────────────────────────────────────
  let breakdownSkillId = $state<ID | null>(null);
  let showJournal = $state(false);

  /**
   * Handles changes to the rank input.
   *
   * ENFORCEMENT:
   *   - Cannot go below the locked minimum (engine.character.minimumSkillRanks[skillId]).
   *   - Cannot go above maxRanks for the skill.
   *   - The engine.setSkillRanks() also enforces the minimum floor.
   *
   * @param skillId - The skill to update.
   * @param event   - The input change event.
   */
  function handleRanksChange(skillId: ID, event: Event) {
    const raw = parseInt((event.target as HTMLInputElement).value, 10);
    if (isNaN(raw)) return;
    const isClassSkill = engine.phase4_skills[skillId]?.isClassSkill ?? false;
    const maxRanks = getMaxRanks(isClassSkill);
    const minRanks = getMinRanks(skillId);
    // Clamp to [minRanks, maxRanks] — engine.setSkillRanks also enforces minRanks
    const clamped = Math.max(minRanks, Math.min(raw, maxRanks));
    engine.setSkillRanks(skillId, clamped);
    // Immediately sync the input's displayed value to the clamped result
    (event.target as HTMLInputElement).value = String(clamped);
  }
</script>

<div class="card p-4 flex flex-col gap-3">

  <!-- ── Header with skill points budget ─────────────────────────────────── -->
  <div class="flex items-center justify-between flex-wrap gap-2 border-b border-border pb-3">
    <div class="flex items-center gap-2">
      <div class="section-header">
        <IconSkills size={20} aria-hidden="true" />
        <span>{ui('skills.title', engine.settings.language)}</span>
      </div>
    </div>

    <!-- Skill points budget summary + journal button -->
    <div class="flex items-center gap-2 flex-wrap">
      <div class="flex items-center gap-1.5 text-sm">
        <span class="text-text-muted text-xs">{ui('skills.sp', engine.settings.language)}</span>
        <span class="{isOverBudget ? 'text-red-500 dark:text-red-400' : 'text-accent'} font-bold">{skillPointsSpent}</span>
        <span class="text-text-muted">/</span>
        <span class="text-green-500 dark:text-green-400 font-bold">{skillPointsAvailable}</span>
        <span class="text-xs {isOverBudget ? 'text-red-500 dark:text-red-400' : 'text-text-muted'}">
          ({skillPointsRemaining >= 0 ? '+' : ''}{skillPointsRemaining})
        </span>
      </div>

      <!-- Leveling Journal button — opens the per-class SP breakdown modal -->
      <button
        class="btn-ghost p-1.5 text-accent hover:bg-accent/10 flex items-center gap-1 rounded text-xs"
        onclick={() => (showJournal = true)}
        title={ui('skills.journal_tooltip', engine.settings.language)}
        aria-label={ui('skills.journal_tooltip', engine.settings.language)}
        type="button"
      >
        <IconJournal size={14} aria-hidden="true" />
        <span class="hidden sm:inline">{ui('skills.journal_btn', engine.settings.language)}</span>
      </button>
    </div>
  </div>

  <!-- Progress bar for skill points -->
  <div
    class="progress-bar"
    style="--progress-pct: {spPct}%; --progress-color: {isOverBudget ? 'oklch(55% 0.20 28)' : 'var(--theme-accent)'};"
    role="progressbar"
    aria-valuenow={skillPointsSpent}
    aria-valuemin={0}
    aria-valuemax={skillPointsAvailable}
    aria-label="Skill points: {skillPointsSpent} of {skillPointsAvailable}"
  >
    <div class="progress-bar__fill"></div>
  </div>

  {#if sortedSkills.length === 0}
    <div class="text-center py-6 text-text-muted">
      <p class="text-sm">{ui('skills.no_skills', engine.settings.language)}</p>
      <p class="text-xs italic mt-1">{ui('skills.enable_source', engine.settings.language)}</p>
    </div>
  {:else}

    <!--
      HorizontalScroll wraps the table for mobile overflow.
      On mobile, the skill name column is sticky via data-table-sticky-col.
    -->
    <HorizontalScroll ariaLabel="Skills matrix table">
      <table class="data-table w-full min-w-[480px]" aria-label="Skills matrix">
        <thead>
          <tr class="data-table-header-row">
            <th class="w-6 text-center" aria-label="Class skill"><IconChecked size={12} /></th>
            <th class="text-left min-w-[120px]">{ui('skills.col_skill', engine.settings.language)}</th>
            <th class="text-center">{ui('skills.col_total', engine.settings.language)}</th>
            <th class="text-center">{ui('skills.col_ability', engine.settings.language)}</th>
            <th class="text-center">{ui('skills.col_ranks', engine.settings.language)}</th>
            <th class="text-center">{ui('skills.col_cost', engine.settings.language)}</th>
            <th class="text-center">{ui('skills.col_max', engine.settings.language)}</th>
            <th class="w-8 text-center"><IconInfo size={12} /></th>
          </tr>
        </thead>
        <tbody>
          {#each sortedSkills as skill, i}
            {@const maxRanks    = getMaxRanks(skill.isClassSkill)}
            {@const minRanks    = getMinRanks(skill.id)}
            {@const costPerRank = skill.isClassSkill ? 1 : 2}
            {@const isAtMax     = skill.ranks >= maxRanks}
            {@const isAtMin     = skill.ranks <= minRanks && minRanks > 0}

            <tr
              class="data-table-row {i % 2 === 0 ? 'data-table-row--even' : 'data-table-row--odd'}
                     {skill.ranks > 0 ? 'bg-green-950/10 dark:bg-green-950/20' : ''}"
              aria-label="{engine.t(skill.label)}: {formatModifier(skill.totalValue)}"
            >
              <!-- Class-skill indicator -->
              <td class="text-center">
                <span
                  class="{skill.isClassSkill ? 'text-yellow-400' : 'text-text-muted/30'}"
                  title={skill.isClassSkill ? ui('skills.class_skill', engine.settings.language) : ui('skills.cross_class', engine.settings.language)}
                  aria-label={skill.isClassSkill ? ui('skills.class_skill', engine.settings.language) : ui('skills.cross_class_short', engine.settings.language)}
                >
                  {#if skill.isClassSkill}<IconChecked size={12} />{:else}<IconUnchecked size={12} />{/if}
                </span>
              </td>

              <!-- Skill name (sticky on mobile) -->
              <td class="data-table-sticky-col text-left bg-inherit">
                <span class="text-sm {skill.ranks > 0 ? 'text-text-primary font-medium' : 'text-text-secondary'} whitespace-nowrap">
                  {engine.t(skill.label)}
                </span>
                {#if !skill.canBeUsedUntrained && skill.ranks === 0}
                  <span class="badge-yellow ml-1 text-[10px]" aria-label="Requires training">{ui('skills.training_required', engine.settings.language)}</span>
                {/if}
                {#if isAtMin}
                  <!-- Rank is at the locked minimum — visually signal the floor -->
                  <span
                    class="badge-yellow ml-1 text-[10px]"
                    title={ui('skills.rank_locked_tooltip', engine.settings.language)}
                    aria-label={ui('skills.rank_locked_tooltip', engine.settings.language)}
                  >{ui('skills.rank_locked', engine.settings.language)}</span>
                {/if}
              </td>

              <!-- Total bonus -->
              <td class="text-center">
                <span class="font-semibold text-sm
                  {skill.totalValue > 0 ? 'text-green-500 dark:text-green-400'
                  : skill.totalValue < 0 ? 'text-red-500 dark:text-red-400'
                  : 'text-text-muted'}">
                  {formatModifier(skill.totalValue)}
                </span>
              </td>

              <!-- Key ability -->
              <td class="text-center">
                <span class="text-xs font-bold text-text-muted font-mono">
                  {skill.keyAbility.replace('stat_', '').toUpperCase().slice(0, 3)}
                </span>
              </td>

              <!-- Ranks input -->
              <td class="text-center">
                <input
                  type="number"
                  min={minRanks}
                  max={maxRanks}
                  value={skill.ranks}
                  class="w-12 text-center text-sm font-medium rounded border px-1 py-0.5
                         bg-surface text-accent border-border
                         focus:outline-none focus:ring-1 focus:ring-accent/50
                         {isAtMax ? 'border-yellow-400 text-yellow-500 dark:text-yellow-400' : ''}
                         {isAtMin ? 'border-amber-700 cursor-not-allowed' : ''}"
                  aria-label="{engine.t(skill.label)} ranks (min {minRanks}, max {maxRanks})"
                  title={isAtMin ? ui('skills.rank_locked_tooltip', engine.settings.language) : undefined}
                  onchange={(e) => handleRanksChange(skill.id, e)}
                />
              </td>

              <!-- Cost per rank -->
              <td class="text-center">
                <span class="text-xs {!skill.isClassSkill ? 'text-red-500 dark:text-red-400' : 'text-text-muted'} font-mono">
                  {costPerRank}
                </span>
              </td>

              <!-- Max ranks -->
              <td class="text-center">
                <span class="text-xs text-text-muted">{maxRanks}</span>
              </td>

              <!-- Breakdown button -->
              <td class="text-center">
                <button
                  class="btn-ghost p-1 text-accent hover:bg-accent/10 mx-auto"
                  onclick={() => (breakdownSkillId = skill.id)}
                  aria-label="Show {engine.t(skill.label)} breakdown"
                  title={ui('abilities.show_breakdown', engine.settings.language)}
                  type="button"
                ><IconInfo size={14} aria-hidden="true" /></button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </HorizontalScroll>
  {/if}

</div>

<!-- Breakdown Modal -->
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

<!-- Leveling Journal Modal -->
{#if showJournal}
  <LevelingJournalModal onclose={() => (showJournal = false)} />
{/if}
