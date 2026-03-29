<!--
  @file src/lib/components/combat/MovementSpeeds.svelte
  @description Movement Speeds panel for the Combat tab.
  Phase 19.9: Migrated to Tailwind CSS — all scoped <style> removed.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  // All icons from the centralized barrel (no direct lucide-svelte imports, ARCHITECTURE.md §6).
  // IconSpeedLand/Burrow/Climb/Fly/Swim are the semantic barrel aliases for the movement icons.
  import {
    IconWarning,
    IconSpeedLand, IconSpeedBurrow, IconSpeedClimb, IconSpeedFly, IconSpeedSwim,
  } from '$lib/components/ui/icons';
  import {
    COMBAT_STAT_SPEED_LAND_ID,
    COMBAT_STAT_SPEED_BURROW_ID,
    COMBAT_STAT_SPEED_CLIMB_ID,
    COMBAT_STAT_SPEED_FLY_ID,
    COMBAT_STAT_SPEED_SWIM_ID,
  } from '$lib/utils/constants';

  const SPEED_PIPELINES = [
    { id: COMBAT_STAT_SPEED_LAND_ID,   icon: IconSpeedLand   },
    { id: COMBAT_STAT_SPEED_BURROW_ID, icon: IconSpeedBurrow },
    { id: COMBAT_STAT_SPEED_CLIMB_ID,  icon: IconSpeedClimb  },
    { id: COMBAT_STAT_SPEED_FLY_ID,    icon: IconSpeedFly    },
    { id: COMBAT_STAT_SPEED_SWIM_ID,   icon: IconSpeedSwim   },
  ];
</script>

<div class="card p-4 flex flex-col gap-3">

  <div class="section-header border-b border-border pb-2">
    <IconSpeedLand size={24} aria-hidden="true" />
    <span>{ui('combat.movement.title', engine.settings.language)}</span>
  </div>

  <div class="flex flex-wrap gap-2">
    {#each SPEED_PIPELINES as sp}
      {@const pipeline = engine.phase3_combatStats[sp.id]}
      {#if pipeline && pipeline.totalValue > 0}
        <div class="flex flex-col items-center gap-1 px-3 py-2 rounded-lg border border-border bg-surface-alt min-w-[80px] text-center">
          <span class="text-text-muted" aria-hidden="true"><sp.icon size={16} /></span>
          <span class="text-[10px] uppercase tracking-wider text-text-muted">{engine.t(pipeline.label)}</span>
          <span class="text-base font-bold text-green-500 dark:text-green-400">
            {engine.formatDistance(pipeline.totalValue)}
          </span>
          {#if pipeline.totalBonus < 0}
            <span class="flex items-center gap-0.5 text-[10px] text-red-400" title={ui('combat.movement.penalty_title', engine.settings.language)}>
              <IconWarning size={10} aria-hidden="true" />
              {engine.formatDistance(pipeline.totalBonus)}
            </span>
          {/if}
        </div>
      {/if}
    {/each}
  </div>

  <p class="text-xs text-text-muted italic">
    {ui('combat.movement.penalty_note', engine.settings.language)}
  </p>

</div>
