<!--
  @file src/lib/components/abilities/SkillsMatrix.svelte
  @description Full interactive Skills Matrix for the Abilities tab.
  Phase 19.8: Migrated to Tailwind CSS — all scoped <style> removed.
              Uses HorizontalScroll + sticky first column for mobile.

  LAYOUT:
    Desktop (≥1024px): Full table layout, all columns visible, alternating rows.
    Tablet/Mobile (<1024px): The table is wrapped in a horizontal-scroll container.
      The skill NAME column is sticky (pinned left, `data-table-sticky-col`).
      Data columns (ranks, bonus, etc.) scroll horizontally.

  SKILL POINTS HEADER:
    Displayed as a progress-bar-style indicator (`.progress-bar` from app.css).
    Over-budget state turns the bar red.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { formatModifier } from '$lib/utils/formatters';
  import ModifierBreakdownModal from '$lib/components/ui/ModifierBreakdownModal.svelte';
  import HorizontalScroll from '$lib/components/ui/HorizontalScroll.svelte';
  import type { ID } from '$lib/types/primitives';
  import { IconSkills, IconChecked, IconUnchecked, IconInfo } from '$lib/components/ui/icons';

  // ── Skill points calculation ─────────────────────────────────────────────────
  const intMod = $derived(
    Math.max(0, engine.phase2_attributes['stat_int']?.derivedModifier ?? 0)
  );

  const classSkillPointsPerLevel = $derived.by(() =>
    engine.phase0_flatModifiers
      .filter(e => e.modifier.targetId === 'attributes.skill_points_per_level' && !e.modifier.situationalContext)
      .reduce((sum, e) => sum + (typeof e.modifier.value === 'number' ? e.modifier.value : 0), 0)
  );

  const skillPointsAvailable = $derived.by(() => {
    const perLevel = Math.max(1, classSkillPointsPerLevel + intMod);
    return perLevel * engine.phase0_characterLevel;
  });

  const skillPointsSpent = $derived.by(() => {
    let total = 0;
    for (const skill of Object.values(engine.character.skills)) {
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

  function getMaxRanks(isClassSkill: boolean): number {
    const base = engine.phase0_characterLevel + 3;
    return isClassSkill ? base : Math.floor(base / 2);
  }

  // ── Modal ─────────────────────────────────────────────────────────────────────
  let breakdownSkillId = $state<ID | null>(null);

  function handleRanksChange(skillId: ID, event: Event) {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    if (isNaN(val) || val < 0) return;
    const maxRanks = getMaxRanks(engine.phase4_skills[skillId]?.isClassSkill ?? false);
    engine.setSkillRanks(skillId, Math.min(val, maxRanks));
  }
</script>

<div class="card p-4 flex flex-col gap-3">

  <!-- ── Header with skill points budget ─────────────────────────────────── -->
  <div class="flex items-center justify-between flex-wrap gap-2 border-b border-border pb-3">
    <div class="section-header">
      <IconSkills size={20} aria-hidden="true" />
      <span>{ui('skills.title', engine.settings.language)}</span>
    </div>
    <div class="flex items-center gap-1.5 text-sm">
      <span class="text-text-muted text-xs">{ui('skills.sp', engine.settings.language)}</span>
      <span class="{isOverBudget ? 'text-red-500 dark:text-red-400' : 'text-accent'} font-bold">{skillPointsSpent}</span>
      <span class="text-text-muted">/</span>
      <span class="text-green-500 dark:text-green-400 font-bold">{skillPointsAvailable}</span>
      <span class="text-xs {isOverBudget ? 'text-red-500 dark:text-red-400' : 'text-text-muted'}">
        ({skillPointsRemaining >= 0 ? '+' : ''}{skillPointsRemaining})
      </span>
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
            {@const costPerRank = skill.isClassSkill ? 1 : 2}
            {@const isAtMax     = skill.ranks >= maxRanks}

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
                  min="0"
                  max={maxRanks}
                  value={skill.ranks}
                  class="w-12 text-center text-sm font-medium rounded border px-1 py-0.5
                         bg-surface text-accent border-border
                         focus:outline-none focus:ring-1 focus:ring-accent/50
                         {isAtMax ? 'border-yellow-400 text-yellow-500 dark:text-yellow-400' : ''}"
                  aria-label="{engine.t(skill.label)} ranks (max {maxRanks})"
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
