<!--
  @file src/lib/components/core/AbilityScoresSummary.svelte
  @description Compact read-only summary of the 6 main ability scores for the Core tab.
  Phase 19.7: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT:
    Compact 3×2 grid of stat-block cards. Each card shows:
      - Abbreviated name (STR, DEX…) — always visible
      - Total value (18, 10…) — large number
      - Derived modifier (+4, 0, -2) — colour-coded green/neutral/red
    Desktop: 6 cells in a single row (grid-cols-6).
    Mobile: 3×2 grid (grid-cols-3).
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { formatModifier } from '$lib/utils/formatters';
  import { IconStats } from '$lib/components/ui/icons';

  const MAIN_ABILITY_IDS = [
    'stat_str', 'stat_dex', 'stat_con',
    'stat_int', 'stat_wis', 'stat_cha',
  ] as const;

  const charId = $derived(engine.character.id);
</script>

<div class="card p-4 flex flex-col gap-3">

  <!-- Header -->
  <div class="flex items-center justify-between border-b border-border pb-2">
    <div class="section-header">
      <IconStats size={20} aria-hidden="true" />
      <span>Ability Scores</span>
    </div>
    <a
      href="/character/{charId}?tab=abilities"
      class="text-xs text-accent hover:text-accent-700 dark:hover:text-accent-300 transition-colors duration-150"
      aria-label="Open full Ability Scores editor"
    >
      Edit →
    </a>
  </div>

  <!-- 3-column grid on mobile, 6-column on sm+ -->
  <div class="grid grid-cols-3 sm:grid-cols-6 gap-2" role="list" aria-label="Ability scores">
    {#each MAIN_ABILITY_IDS as abilityId}
      {@const pipeline = engine.phase2_attributes[abilityId]}
      {#if pipeline}
        <div
          class="stat-block hover:border-accent/50 transition-colors duration-150 cursor-default"
          role="listitem"
          title="{engine.t(pipeline.label)}: {pipeline.totalValue} ({formatModifier(pipeline.derivedModifier)})"
          aria-label="{engine.t(pipeline.label)}: {pipeline.totalValue} ({formatModifier(pipeline.derivedModifier)})"
        >
          <!-- Abbreviated label: STR, DEX, etc. -->
          <span class="stat-label">
            {abilityId.replace('stat_', '').toUpperCase()}
          </span>

          <!-- Numeric total value -->
          <span class="stat-value">
            {pipeline.totalValue}
          </span>

          <!-- Derived modifier — green/neutral/red -->
          <span
            class="stat-modifier {pipeline.derivedModifier > 0 ? 'text-green-500 dark:text-green-400' : pipeline.derivedModifier < 0 ? 'text-red-500 dark:text-red-400' : ''}"
            aria-label="Modifier: {formatModifier(pipeline.derivedModifier)}"
          >
            {formatModifier(pipeline.derivedModifier)}
          </span>
        </div>
      {/if}
    {/each}
  </div>

  <!-- Empty state -->
  {#if Object.keys(engine.phase2_attributes).length === 0}
    <p class="text-xs text-text-muted italic text-center py-2">
      No attributes loaded. Load rule sources to initialise.
    </p>
  {/if}

</div>
