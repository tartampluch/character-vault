<!--
  @file src/lib/components/combat/MovementSpeeds.svelte
  @description Movement Speeds panel for the Combat tab.
  Phase 19.9: Migrated to Tailwind CSS — all scoped <style> removed.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { Footprints, Pickaxe, Mountain, Wind, Waves } from 'lucide-svelte';
  import { IconWarning } from '$lib/components/ui/icons';

  const SPEED_PIPELINES = [
    { id: 'combatStats.speed_land',   icon: Footprints },
    { id: 'combatStats.speed_burrow', icon: Pickaxe    },
    { id: 'combatStats.speed_climb',  icon: Mountain   },
    { id: 'combatStats.speed_fly',    icon: Wind       },
    { id: 'combatStats.speed_swim',   icon: Waves      },
  ];
</script>

<div class="card p-4 flex flex-col gap-3">

  <div class="section-header border-b border-border pb-2">
    <Footprints size={20} aria-hidden="true" />
    <span>Movement Speeds</span>
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
            <span class="flex items-center gap-0.5 text-[10px] text-red-400" title="Penalty from armor or encumbrance">
              <IconWarning size={10} aria-hidden="true" />
              {engine.formatDistance(pipeline.totalBonus)}
            </span>
          {/if}
        </div>
      {/if}
    {/each}
  </div>

  <p class="text-xs text-text-muted italic">
    Armor &amp; encumbrance penalties applied via pipeline modifiers.
  </p>

</div>
