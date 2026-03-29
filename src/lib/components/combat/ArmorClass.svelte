<!--
  @file src/lib/components/combat/ArmorClass.svelte
  @description Armor Class panel (Normal, Touch, Flat-Footed) for the Combat tab.
  Phase 19.9: Migrated to Tailwind CSS — all scoped <style> removed.

  Three AC values displayed as prominent cards in a row.
  Each card has: short label, large value, breakdown button.
   Top border colour driven by inline style referencing CSS custom properties
   (--color-ac-normal / --color-ac-touch / --color-ac-flat defined in app.css).
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { formatModifier } from '$lib/utils/formatters';
  import {
    MAX_DEX_CAP_UNCAPPED_VALUE,
    COMBAT_STAT_AC_NORMAL_ID,
    COMBAT_STAT_AC_TOUCH_ID,
    COMBAT_STAT_AC_FLAT_FOOTED_ID,
    COMBAT_STAT_MAX_DEX_BONUS_ID,
  } from '$lib/utils/constants';
  import ModifierBreakdownModal from '$lib/components/ui/ModifierBreakdownModal.svelte';
  import type { ID } from '$lib/types/primitives';
  import { IconAC, IconInfo } from '$lib/components/ui/icons';

  // Each AC card uses a distinct CSS custom property for its accent colour.
  // The actual oklch() values live in app.css (:root) as --color-ac-* variables,
  // keeping all hardcoded colour literals out of .svelte files per Phase 19.
  const AC_PIPELINES = $derived([
    { id: COMBAT_STAT_AC_NORMAL_ID,      shortName: ui('combat.ac.normal', engine.settings.language),    description: ui('combat.ac.normal_desc', engine.settings.language), accentColor: 'var(--color-ac-normal)' },
    { id: COMBAT_STAT_AC_TOUCH_ID,       shortName: ui('combat.ac.touch', engine.settings.language),     description: ui('combat.ac.touch_desc', engine.settings.language),  accentColor: 'var(--color-ac-touch)'  },
    { id: COMBAT_STAT_AC_FLAT_FOOTED_ID, shortName: ui('combat.ac.flat', engine.settings.language),      description: ui('combat.ac.flat_desc', engine.settings.language),   accentColor: 'var(--color-ac-flat)'   },
  ] as const);

  let breakdownAcId = $state<ID | null>(null);
  let tempMod = $state('0');
  const tempModValue = $derived.by(() => { const v = parseInt(tempMod, 10); return isNaN(v) ? 0 : v; });

  // Effective DEX to AC respects the max_dexterity_bonus cap (ARCHITECTURE.md §4.17).
  // This is a D&D game mechanic — the formula min(dexMod, maxDexBonus) lives in the
  // engine as phase_effectiveDexToAC so no game logic appears in this component.
  const effectiveDexToAC = $derived(engine.phase_effectiveDexToAC);

  /**
   * True when a DEX cap modifier is actively reducing the max_dexterity_bonus below
   * the uncapped sentinel value (99). Used to conditionally show the cap badge.
   *
   * The comparison is moved here (script block) rather than inlined in the template
   * to comply with the zero-game-logic-in-Svelte rule (ARCHITECTURE.md §3):
   * all expressions involving engine pipeline values must live in $derived blocks,
   * not in template conditional expressions.
   */
  const isMaxDexCapped = $derived(
    (engine.phase3_combatStats[COMBAT_STAT_MAX_DEX_BONUS_ID]?.totalValue ?? MAX_DEX_CAP_UNCAPPED_VALUE)
      < MAX_DEX_CAP_UNCAPPED_VALUE
  );
</script>

<div class="card p-4 flex flex-col gap-4">

  <!-- Header + temp modifier -->
  <div class="flex items-center justify-between flex-wrap gap-2 border-b border-border pb-2">
    <div class="section-header">
      <IconAC size={24} aria-hidden="true" />
      <span>{ui('combat.ac.title', engine.settings.language)}</span>
    </div>
    <div class="flex items-center gap-2">
      <label for="ac-temp-input" class="text-xs text-text-muted shrink-0">{ui('combat.ac.temp_mod', engine.settings.language)}</label>
      <input
        id="ac-temp-input"
        type="number"
        bind:value={tempMod}
        class="input w-16 text-center px-1 text-sm text-yellow-500 dark:text-yellow-400"
        aria-label={ui('combat.ac.temp_mod_aria', engine.settings.language)}
        title={ui('combat.ac.temp_mod_tooltip', engine.settings.language)}
      />
    </div>
  </div>

  <!-- Effective DEX to AC row — shows capped DEX contribution to armor class -->
  <div class="flex items-center gap-2 text-xs text-text-muted">
    <span>{ui('combat.ac.effective_dex', engine.settings.language)}</span>
    <span
      class="font-semibold {effectiveDexToAC > 0 ? 'text-green-500 dark:text-green-400' : effectiveDexToAC < 0 ? 'text-red-500 dark:text-red-400' : 'text-text-muted'}"
      title="{ui('combat.ac.effective_dex_tooltip', engine.settings.language)}"
    >
      {#if effectiveDexToAC >= 0}+{/if}{effectiveDexToAC}
    </span>
    {#if isMaxDexCapped}
      <span class="text-amber-500 text-[10px]">
        ({ui('combat.ac.cap', engine.settings.language)}       {engine.phase3_combatStats[COMBAT_STAT_MAX_DEX_BONUS_ID]?.totalValue})
      </span>
    {/if}
  </div>

  <!-- Three AC cards in a row -->
  <div class="grid grid-cols-3 gap-2">
    {#each AC_PIPELINES as acConfig}
      {@const pipeline = engine.phase3_combatStats[acConfig.id]}
      {#if pipeline}
        <!-- engine.getDisplayAc() adds tempModValue to the pipeline total in the engine layer
             (zero-game-logic rule: arithmetic on pipeline values must not be in Svelte templates). -->
        {@const effectiveAc = engine.getDisplayAc(acConfig.id, tempModValue)}

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
              ({formatModifier(tempModValue)} {ui('combat.ac.temp_label', engine.settings.language)})
            </span>
          {/if}

          <!-- Breakdown button -->
          <button
            class="btn-ghost p-1 text-accent hover:bg-accent/10 rounded-full"
            onclick={() => (breakdownAcId = acConfig.id)}
            aria-label={ui('combat.ac.show_breakdown_aria', engine.settings.language).replace('{description}', acConfig.description)}
            title={ui('common.show_breakdown', engine.settings.language)}
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
