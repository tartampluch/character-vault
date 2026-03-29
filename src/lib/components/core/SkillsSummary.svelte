<!--
  @file src/lib/components/core/SkillsSummary.svelte
  @description Condensed read-only skills list for the Core tab.
  Phase 19.7: Migrated to Tailwind CSS — all scoped <style> removed.
              Uses HorizontalScroll for overflow on narrow viewports.

  LAYOUT:
    - Section header + Edit link.
    - Trained/untrained counts meta line.
    - Scrollable list capped at max-h-72 (≈280px).
      On mobile narrow screens, the list scrolls vertically within the card.
    - Each row: class-skill indicator | name | ranks badge | total modifier.

  SORTING: Trained skills (ranks > 0) first, then untrained — each group
  sorted alphabetically by localised name.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { formatModifier } from '$lib/utils/formatters';
  import { ui } from '$lib/i18n/ui-strings';
  import { IconSkills, IconChecked, IconUnchecked } from '$lib/components/ui/icons';

  const charId = $derived(engine.character.id);
  const lang   = $derived(engine.settings.language);

  /** Skills sorted: trained first, then untrained, each alphabetical. */
  const sortedSkills = $derived.by(() => {
    const skills = Object.values(engine.phase4_skills);
    const trained   = skills.filter(s => s.ranks > 0)
      .sort((a, b) => engine.t(a.label).localeCompare(engine.t(b.label)));
    const untrained = skills.filter(s => s.ranks === 0)
      .sort((a, b) => engine.t(a.label).localeCompare(engine.t(b.label)));
    return [...trained, ...untrained];
  });
</script>

<div class="card p-4 flex flex-col gap-3">

  <!-- Header -->
  <div class="flex items-center justify-between border-b border-border pb-2">
    <div class="section-header">
      <IconSkills size={24} aria-hidden="true" />
      <span>{ui('core.skills', lang)}</span>
    </div>
    <a
      href="/character/{charId}?tab=abilities"
      class="text-xs text-accent hover:text-accent-700 dark:hover:text-accent-300 transition-colors duration-150"
      aria-label="Open full Skills editor"
    >
      {ui('core.edit_link', lang)}
    </a>
  </div>

  {#if sortedSkills.length === 0}
    <!-- Empty state -->
    <div class="text-center py-4 text-text-muted">
      <p class="text-sm">{ui('core.skills_empty', lang)}</p>
      <p class="text-xs italic mt-1">
        {ui('core.skills_empty_hint', lang).replace('{key}', 'config_skill_definitions')}
      </p>
    </div>
  {:else}
    <!-- Meta count -->
    <p class="text-xs text-text-muted">
      {ui('core.skills_trained_total', lang)
        .replace('{trained}', String(sortedSkills.filter(s => s.ranks > 0).length))
        .replace('{total}', String(sortedSkills.length))}
    </p>

    <!-- Scrollable skill rows — capped height so the card doesn't grow indefinitely -->
    <ul
      class="flex flex-col overflow-y-auto max-h-72"
      style="scrollbar-width: thin; scrollbar-color: var(--theme-border) transparent;"
      role="list"
      aria-label="Skills list"
    >
      {#each sortedSkills as skill}
        <li
          class="flex items-center gap-2 px-2 py-1 rounded
                 hover:bg-surface-alt transition-colors duration-100
                 {skill.ranks === 0 ? 'opacity-50' : ''}"
          role="listitem"
          aria-label="{engine.t(skill.label)}: {formatModifier(skill.totalValue)}{skill.isClassSkill ? ' (' + ui('skills.class_skill', lang) + ')' : ''}"
        >
          <!-- Class-skill indicator: gold checkmark vs dim unchecked -->
          <span
            class="shrink-0 {skill.isClassSkill ? 'text-yellow-400' : 'text-text-muted/40'}"
            aria-hidden="true"
            title={skill.isClassSkill ? ui('skills.class_skill', lang) : ui('skills.cross_class', lang)}
          >
            {#if skill.isClassSkill}
              <IconChecked size={12} aria-label={ui('skills.class_skill', lang)} />
            {:else}
              <IconUnchecked size={12} aria-hidden="true" />
            {/if}
          </span>

          <!-- Skill name — bold when trained -->
          <span
            class="flex-1 text-xs truncate
                   {skill.ranks > 0 ? 'text-text-primary font-medium' : 'text-text-secondary'}"
          >
            {engine.t(skill.label)}
          </span>

          <!-- Ranks invested badge (only for trained skills) -->
          {#if skill.ranks > 0}
            <span
              class="shrink-0 badge-accent font-mono text-[10px]"
              title="{skill.ranks} ranks invested"
            >
              {skill.ranks}r
            </span>
          {/if}

          <!-- Total modifier — colour-coded -->
          <span
            class="shrink-0 text-xs font-semibold min-w-[2rem] text-right
                   {skill.totalValue > 0 ? 'text-green-500 dark:text-green-400'
                   : skill.totalValue < 0 ? 'text-red-500 dark:text-red-400'
                   : 'text-text-muted'}"
          >
            {formatModifier(skill.totalValue)}
          </span>
        </li>
      {/each}
    </ul>
  {/if}

</div>
