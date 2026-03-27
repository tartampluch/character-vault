<!--
  @file src/lib/components/combat/CoreCombat.svelte
  @description Core Combat Statistics panel (BAB, Initiative, Grapple).
  Phase 19.9: Migrated to Tailwind CSS — all scoped <style> removed.

  Responsive stat-block grid using app.css .stat-block pattern.
  BAB: info button only. Initiative & Grapple: info + dice roll buttons.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { formatModifier } from '$lib/utils/formatters';
  import ModifierBreakdownModal from '$lib/components/ui/ModifierBreakdownModal.svelte';
  import DiceRollModal from '$lib/components/ui/DiceRollModal.svelte';
  import type { ID } from '$lib/types/primitives';
  import { IconTabCombat, IconInfo, IconDiceRoll } from '$lib/components/ui/icons';
  import {
    BAB_PIPELINE_ID,
    COMBAT_STAT_INITIATIVE_ID,
    COMBAT_STAT_GRAPPLE_ID,
    COMBAT_STAT_FORTIFICATION_ID,
    COMBAT_STAT_ARCANE_SPELL_FAILURE_ID,
  } from '$lib/utils/constants';

  const CORE_STATS = $derived([
    { id: BAB_PIPELINE_ID,                    shortName: ui('combat.core.bab', engine.settings.language),        description: ui('combat.core.bab_desc', engine.settings.language),                 showDice: false,                      color: 'oklch(65% 0.20 28)'  },
    { id: COMBAT_STAT_INITIATIVE_ID,           shortName: ui('combat.core.initiative', engine.settings.language), description: ui('combat.core.initiative_desc', engine.settings.language),  showDice: true, diceLabel: ui('combat.core.initiative_roll', engine.settings.language),   color: 'oklch(78% 0.17 88)'  },
    { id: COMBAT_STAT_GRAPPLE_ID,              shortName: ui('combat.core.grapple', engine.settings.language),    description: ui('combat.core.grapple_desc', engine.settings.language), showDice: true, diceLabel: ui('combat.core.grapple_check', engine.settings.language), color: 'oklch(70% 0.17 300)' },
    // Fortification: percentage chance to negate a confirmed critical hit (ARCHITECTURE.md §4.7).
    // baseValue = 0 (no fortification by default). Light=25%, Moderate=75%, Heavy=100%.
    { id: COMBAT_STAT_FORTIFICATION_ID,        shortName: ui('combat.core.fort', engine.settings.language),       description: ui('combat.core.fort_desc', engine.settings.language),                showDice: false,                      color: 'oklch(78% 0.14 200)' },
    // Arcane Spell Failure: accumulated % from equipped armour/shields (ARCHITECTURE.md §4.8).
    // baseValue = 0 (unarmoured casters have 0% ASF by default).
    { id: COMBAT_STAT_ARCANE_SPELL_FAILURE_ID, shortName: ui('combat.core.asf', engine.settings.language),        description: ui('combat.core.asf_desc', engine.settings.language),                 showDice: false,                      color: 'oklch(75% 0.12 280)' },
  ] as const);

  let breakdownId = $state<ID | null>(null);
  let diceRollId  = $state<ID | null>(null);
</script>

<div class="card p-4 flex flex-col gap-4">

  <div class="section-header border-b border-border pb-2">
    <IconTabCombat size={20} aria-hidden="true" />
    <span>{ui('combat.core.title', engine.settings.language)}</span>
  </div>

  <div class="grid grid-cols-3 gap-2">
    {#each CORE_STATS as stat}
      {@const pipeline = engine.phase3_combatStats[stat.id]}
      {#if pipeline}
        <div
          class="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border bg-surface-alt text-center"
          style="border-top: 3px solid {stat.color};"
        >
          <!-- Label -->
          <span class="text-[10px] font-bold uppercase tracking-wider" style="color: {stat.color};">
            {stat.shortName}
          </span>

          <!-- Value -->
          <span class="text-3xl font-bold leading-none" style="color: {stat.color};">
            {formatModifier(pipeline.totalValue)}
          </span>

          <!-- Action buttons -->
          <div class="flex gap-1">
            <button
              class="btn-ghost p-1 text-accent hover:bg-accent/10"
              onclick={() => (breakdownId = stat.id)}
              aria-label="Show {stat.description} breakdown"
              title={ui('combat.core.breakdown', engine.settings.language)}
              type="button"
            ><IconInfo size={14} aria-hidden="true" /></button>
            {#if stat.showDice}
              <button
                class="btn-ghost p-1 text-yellow-500 dark:text-yellow-400 hover:bg-yellow-500/10"
                onclick={() => (diceRollId = stat.id)}
                aria-label={ui('combat.core.roll_dice_aria', engine.settings.language)}
                title={ui('combat.core.roll', engine.settings.language)}
                type="button"
              ><IconDiceRoll size={14} aria-hidden="true" /></button>
            {/if}
          </div>

          <!-- Description -->
          <span class="text-[10px] text-text-muted leading-tight">{stat.description}</span>
        </div>
      {/if}
    {/each}
  </div>

</div>

{#if breakdownId}
  {@const bp = engine.phase3_combatStats[breakdownId]}
  {@const sc = CORE_STATS.find(s => s.id === breakdownId)}
  {#if bp && sc}
    <ModifierBreakdownModal
      label={sc.description}
      baseValue={bp.baseValue}
      activeModifiers={bp.activeModifiers}
      situationalModifiers={bp.situationalModifiers}
      totalValue={bp.totalValue}
      onclose={() => (breakdownId = null)}
    />
  {/if}
{/if}

{#if diceRollId}
  {@const dp = engine.phase3_combatStats[diceRollId]}
  {@const sc = CORE_STATS.find(s => s.id === diceRollId)}
  {#if dp && sc}
    <DiceRollModal
      formula="1d20"
      pipeline={dp}
      label={'diceLabel' in sc ? sc.diceLabel : sc.description}
      onclose={() => (diceRollId = null)}
    />
  {/if}
{/if}
