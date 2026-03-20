<!--
  @file src/lib/components/core/SkillsSummary.svelte
  @description Condensed read-only skills list for the Core tab.

  PURPOSE:
    Displays a compact list of all skills with:
      - Skill name (localised via engine.t())
      - Total bonus (formatted with sign: +N or -N)
      - Class skill indicator (★ if `isClassSkill`)
      - Invested ranks indicator

    Sorted by name alphabetically within two groups:
      1. Trained skills (ranks > 0) — shown first
      2. Untrained skills (ranks == 0) — shown below, dimmed

    Includes a link to the full Abilities tab (Phase 9) for editing.

  NOTE ON EMPTY SKILLS:
    Until Phase 4.2 populates `character.skills` from the `config_skill_definitions`
    config table, this list will be empty. The component handles this gracefully
    with an informational message.

  READ-ONLY DESIGN:
    This is a SUMMARY — no rank inputs. Full interactive editing (including
    rank allocation, synergy bonuses, class skill detection) is in Phase 9:
    SkillsMatrix.svelte.

  ARCHITECTURE:
    - Reads: `engine.phase4_skills` ($derived — fully resolved with synergies)
    - No mutations.

  @see src/lib/components/abilities/SkillsMatrix.svelte (Phase 9) for full editor.
  @see ARCHITECTURE.md Phase 8.7 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { formatModifier } from '$lib/utils/formatters';

  const charId = $derived(engine.character.id);

  /**
   * Sorts skills into two groups: trained (ranks > 0) then untrained.
   * Within each group, sorted alphabetically by localised label.
   */
  const sortedSkills = $derived.by(() => {
    const skills = Object.values(engine.phase4_skills);

    const trained   = skills.filter(s => s.ranks > 0)
      .sort((a, b) => engine.t(a.label).localeCompare(engine.t(b.label)));
    const untrained = skills.filter(s => s.ranks === 0)
      .sort((a, b) => engine.t(a.label).localeCompare(engine.t(b.label)));

    return [...trained, ...untrained];
  });
</script>

<div class="skills-summary">
  <div class="summary-header">
    <h3 class="summary-title">📚 Skills</h3>
    <a
      href="/character/{charId}?tab=abilities"
      class="edit-link"
      aria-label="Open full Skills editor"
    >
      Edit →
    </a>
  </div>

  {#if sortedSkills.length === 0}
    <!-- Empty state: skills not yet loaded from config tables -->
    <div class="skills-empty">
      <p>No skills loaded.</p>
      <p class="empty-hint">
        Skills will appear once <code>config_skill_definitions</code> is loaded
        by the DataLoader (Phase 4.2).
      </p>
    </div>
  {:else}
    <!-- Summary showing total count -->
    <p class="skills-meta">
      {sortedSkills.filter(s => s.ranks > 0).length} trained •
      {sortedSkills.length} total
    </p>

    <ul class="skills-list" role="list" aria-label="Skills list">
      {#each sortedSkills as skill}
        <li
          class="skill-row"
          class:trained={skill.ranks > 0}
          class:untrained={skill.ranks === 0}
          class:class-skill={skill.isClassSkill}
          role="listitem"
          aria-label="{engine.t(skill.label)}: {formatModifier(skill.totalValue)}{skill.isClassSkill ? ' (class skill)' : ''}"
        >
          <!-- Class skill star indicator -->
          <span
            class="class-skill-star"
            aria-hidden="true"
            title={skill.isClassSkill ? 'Class skill' : 'Cross-class skill'}
          >
            {skill.isClassSkill ? '★' : '·'}
          </span>

          <!-- Skill name -->
          <span class="skill-name">{engine.t(skill.label)}</span>

          <!-- Ranks invested (compact) -->
          {#if skill.ranks > 0}
            <span class="skill-ranks" title="{skill.ranks} ranks invested">
              {skill.ranks}r
            </span>
          {/if}

          <!-- Total bonus -->
          <span
            class="skill-total"
            class:positive={skill.totalValue > 0}
            class:negative={skill.totalValue < 0}
          >
            {formatModifier(skill.totalValue)}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .skills-summary {
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
    margin-bottom: 0.5rem;
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

  /* ========================= META ========================= */
  .skills-meta {
    font-size: 0.75rem;
    color: #4a4a6a;
    margin: 0 0 0.5rem;
  }

  /* ========================= EMPTY ========================= */
  .skills-empty {
    padding: 0.75rem;
    text-align: center;
    color: #4a4a6a;
    font-size: 0.85rem;
  }

  .empty-hint {
    font-size: 0.75rem;
    font-style: italic;
    margin-top: 0.25rem;
  }

  /* ========================= SKILLS LIST ========================= */
  .skills-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    max-height: 280px;
    overflow-y: auto;
    scrollbar-width: thin;
    /* Faint scrollbar color for dark UI */
    scrollbar-color: #30363d transparent;
  }

  .skills-list::-webkit-scrollbar {
    width: 4px;
  }
  .skills-list::-webkit-scrollbar-thumb {
    background: #30363d;
    border-radius: 2px;
  }

  .skill-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    transition: background 0.1s;
  }

  .skill-row:hover {
    background: #0d1117;
  }

  .skill-row.untrained {
    opacity: 0.55;
  }

  /* Class skill star indicator */
  .class-skill-star {
    font-size: 0.7rem;
    width: 0.8rem;
    text-align: center;
    flex-shrink: 0;
  }

  .skill-row.class-skill .class-skill-star {
    color: #fbbf24; /* Gold star for class skills */
  }

  .skill-row:not(.class-skill) .class-skill-star {
    color: #3a3a5a;
  }

  /* Skill name */
  .skill-name {
    flex: 1;
    font-size: 0.82rem;
    color: #c0c0d0;
    /* Prevent overflow */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .skill-row.trained .skill-name {
    color: #e0e0f0;
    font-weight: 500;
  }

  /* Ranks indicator */
  .skill-ranks {
    font-size: 0.7rem;
    color: #7c3aed;
    background: #1c1a3a;
    border: 1px solid #2d1b69;
    border-radius: 3px;
    padding: 0.05rem 0.3rem;
    flex-shrink: 0;
  }

  /* Total modifier */
  .skill-total {
    font-size: 0.85rem;
    font-weight: 600;
    min-width: 2.5rem;
    text-align: right;
    color: #8080a0;
    flex-shrink: 0;
  }

  .skill-total.positive { color: #86efac; }
  .skill-total.negative { color: #f87171; }
</style>
