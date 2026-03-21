<!--
  @file src/lib/components/combat/ArmorClass.svelte
  @description Armor Class panel (Normal, Touch, Flat-Footed) for the Combat tab.
  Phase 19.9: Migrated to Tailwind CSS — all scoped <style> removed.

  Three AC values displayed as prominent cards in a row.
  Each card has: short label, large value, breakdown button.
  Top border colour driven by inline style (runtime accentColor per AC type).
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { formatModifier } from '$lib/utils/formatters';
  import ModifierBreakdownModal from '$lib/components/ui/ModifierBreakdownModal.svelte';
  import type { ID } from '$lib/types/primitives';
  import { IconAC, IconInfo } from '$lib/components/ui/icons';

  const AC_PIPELINES = [
    { id: 'combatStats.ac_normal',      shortName: 'AC',    description: 'Normal Armor Class',                              accentColor: 'oklch(72% 0.14 220)' },
    { id: 'combatStats.ac_touch',       shortName: 'Touch', description: 'Touch AC (ignores armor/shield/natural armor)',   accentColor: 'oklch(72% 0.17 145)' },
    { id: 'combatStats.ac_flat_footed', shortName: 'Flat',  description: 'Flat-Footed AC (ignores DEX/dodge)',             accentColor: 'oklch(78% 0.17 88)'  },
  ] as const;

  let breakdownAcId = $state<ID | null>(null);
  let tempMod = $state('0');
  const tempModValue = $derived.by(() => { const v = parseInt(tempMod, 10); return isNaN(v) ? 0 : v; });
</script>

<div class="card p-4 flex flex-col gap-4">

  <!-- Header + temp modifier -->
  <div class="flex items-center justify-between flex-wrap gap-2 border-b border-border pb-2">
    <div class="section-header">
      <IconAC size={20} aria-hidden="true" />
      <span>Armor Class</span>
    </div>
    <div class="flex items-center gap-2">
      <label for="ac-temp-input" class="text-xs text-text-muted shrink-0">Temp Mod</label>
      <input
        id="ac-temp-input"
        type="number"
        bind:value={tempMod}
        class="input w-16 text-center px-1 text-sm text-yellow-500 dark:text-yellow-400"
        aria-label="Temporary AC modifier (applied to all AC types)"
        title="Quick temporary modifier (buff spell, condition, etc.)"
      />
    </div>
  </div>

  <!-- Three AC cards in a row -->
  <div class="grid grid-cols-3 gap-2">
    {#each AC_PIPELINES as acConfig}
      {@const pipeline = engine.phase3_combatStats[acConfig.id]}
      {#if pipeline}
        {@const effectiveAc = pipeline.totalValue + tempModValue}

        <div
          class="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border bg-surface-alt hover:border-accent/40 transition-colors duration-150 text-center"
          style="border-top: 3px solid {acConfig.accentColor};"
          aria-label="{acConfig.description}: {effectiveAc}"
        >
          <!-- Label -->
          <span class="text-[10px] font-bold uppercase tracking-wider" style="color: {acConfig.accentColor};">
            {acConfig.shortName}
          </span>

          <!-- Large value -->
          <span class="text-4xl font-bold leading-none" style="color: {acConfig.accentColor};">
            {effectiveAc}
          </span>

          <!-- Temp indicator -->
          {#if tempModValue !== 0}
            <span class="text-[10px] text-yellow-500 dark:text-yellow-400">
              ({formatModifier(tempModValue)} temp)
            </span>
          {/if}

          <!-- Breakdown button -->
          <button
            class="btn-ghost p-1 text-accent hover:bg-accent/10 rounded-full"
            onclick={() => (breakdownAcId = acConfig.id)}
            aria-label="Show {acConfig.description} breakdown"
            title="Show breakdown"
            type="button"
          ><IconInfo size={14} aria-hidden="true" /></button>

          <!-- Short description -->
          <span class="text-[10px] text-text-muted leading-tight">{acConfig.description}</span>
        </div>
      {/if}
    {/each}
  </div>

</div>

{#if breakdownAcId}
  {@const bp = engine.phase3_combatStats[breakdownAcId]}
  {@const acConfig = AC_PIPELINES.find(a => a.id === breakdownAcId)}
  {#if bp && acConfig}
    <ModifierBreakdownModal
      label={acConfig.description}
      baseValue={bp.baseValue}
      activeModifiers={bp.activeModifiers}
      situationalModifiers={bp.situationalModifiers}
      totalValue={bp.totalValue}
      onclose={() => (breakdownAcId = null)}
    />
  {/if}
{/if}
