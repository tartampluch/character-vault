<!--
  @file src/lib/components/abilities/AbilityScores.svelte
  @description Full interactive Ability Scores editor for the Abilities tab.
  Phase 19.8: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT:
    Responsive 3-column grid on desktop (3×2), 2-column on tablet, 1-column on mobile.
    Each panel: stat name + abbr | base score input | total | modifier | temp | actions.
    Touch-friendly: all inputs ≥44px height via app.css @media (pointer: coarse).
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { formatModifier, previewWithTempMod } from '$lib/utils/formatters';
  import ModifierBreakdownModal from '$lib/components/ui/ModifierBreakdownModal.svelte';
  import DiceRollModal from '$lib/components/ui/DiceRollModal.svelte';
  import PointBuyModal from './PointBuyModal.svelte';
  import RollStatsModal from './RollStatsModal.svelte';
  import { IconStats, IconTabFeats, IconDiceRoll, IconInfo } from '$lib/components/ui/icons';
  import type { ID } from '$lib/types/primitives';
  import { MAIN_ABILITY_IDS, getAbilityAbbr, ABILITY_SCORE_MIN, ABILITY_SCORE_MAX } from '$lib/utils/constants';

  const recommendedIds = $derived.by(() => {
    for (const afi of engine.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feat = dataLoader.getFeature(afi.featureId);
      if (feat?.category === 'class' && feat.recommendedAttributes?.length) {
        return feat.recommendedAttributes as string[];
      }
    }
    return [] as string[];
  });

  let breakdownPipelineId = $state<ID | null>(null);
  let diceRollPipelineId  = $state<ID | null>(null);
  let showPointBuy        = $state(false);
  let showRollStats       = $state(false);
  let tempMods            = $state<Record<string, string>>({});

  function getTempMod(id: string): number {
    const v = parseInt(tempMods[id] ?? '0', 10);
    return isNaN(v) ? 0 : v;
  }

  function handleBaseScoreChange(pipelineId: ID, event: Event) {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(val) && val >= ABILITY_SCORE_MIN && val <= ABILITY_SCORE_MAX) {
      engine.setAttributeBase(pipelineId, val);
    }
  }
</script>

<div class="card p-4 flex flex-col gap-4">

  <!-- Header with wizard buttons -->
  <div class="flex items-center justify-between flex-wrap gap-2 border-b border-border pb-3">
    <div class="section-header">
      <IconStats size={24} aria-hidden="true" />
      <span>{ui('abilities.title', engine.settings.language)}</span>
    </div>
    <div class="flex gap-2">
      <button
        class="btn-secondary text-xs gap-1"
        onclick={() => (showPointBuy = true)}
        title={ui('abilities.point_buy_tooltip', engine.settings.language)}
        type="button"
      >
        <IconTabFeats size={14} aria-hidden="true" /> {ui('abilities.point_buy', engine.settings.language)}
      </button>
      <button
        class="btn-secondary text-xs gap-1"
        onclick={() => (showRollStats = true)}
        title={ui('abilities.roll_stats_tooltip', engine.settings.language)}
        type="button"
      >
        <IconDiceRoll size={14} aria-hidden="true" /> {ui('abilities.roll_stats', engine.settings.language)}
      </button>
    </div>
  </div>

  <!-- 3-col grid on lg, 2-col on sm, 1-col on mobile -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="table" aria-label={ui('abilities.title', engine.settings.language)}>

    {#each MAIN_ABILITY_IDS as abilityId}
      {@const pipeline = engine.phase2_attributes[abilityId]}
      {#if pipeline}
        {@const abbr = getAbilityAbbr(abilityId, engine.settings.language)}
        {@const isRecommended = recommendedIds.includes(abilityId)}
        {@const tempMod = getTempMod(abilityId)}

        <!--
          Each stat panel uses bg-surface-alt (slightly elevated) with an
          accent left border when recommended for the active class.
        -->
        <div
          class="flex flex-col gap-2 p-3 rounded-lg border
                 {isRecommended
                   ? 'border-green-500/40 bg-green-950/10 dark:bg-green-950/20'
                   : 'border-border bg-surface-alt'}"
          role="row"
          aria-label="{engine.t(pipeline.label)}: {pipeline.totalValue} ({formatModifier(pipeline.derivedModifier)})"
        >

          <!-- Row 1: Abbr + full name + recommended star -->
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-bold tracking-wider text-text-muted min-w-[2rem]">{abbr}</span>
            <span class="text-sm text-text-primary flex-1 truncate">{engine.t(pipeline.label)}</span>
            {#if isRecommended}
              <span class="text-green-500" title={ui('abilities.recommended_for', engine.settings.language)} aria-label={ui('abilities.recommended_badge_aria', engine.settings.language)}>
                <IconTabFeats size={12} />
              </span>
            {/if}
          </div>

          <!-- Row 2: Base (editable) | Total | Modifier — key numbers -->
          <div class="grid grid-cols-3 gap-1.5 text-center">
            <!-- Base score input -->
            <div class="flex flex-col gap-0.5">
              <span class="text-[10px] uppercase tracking-wider text-text-muted">{ui('abilities.base', engine.settings.language)}</span>
              <input
                type="number"
                min={ABILITY_SCORE_MIN}
                max={ABILITY_SCORE_MAX}
                value={pipeline.baseValue}
                class="input text-center text-sm font-bold px-1 py-1 text-sky-500 dark:text-sky-400"
                aria-label={ui('abilities.base_score_aria', engine.settings.language).replace('{name}', engine.t(pipeline.label))}
                onchange={(e) => handleBaseScoreChange(abilityId, e)}
              />
            </div>

            <!-- Total value (computed) -->
            <div class="flex flex-col gap-0.5">
              <span class="text-[10px] uppercase tracking-wider text-text-muted">{ui('abilities.total', engine.settings.language)}</span>
              <div class="flex items-center justify-center h-9 rounded-md bg-surface border border-border">
                <span class="text-lg font-bold text-sky-500 dark:text-sky-400">
                  {previewWithTempMod(pipeline.totalValue, tempMod)}
                </span>
              </div>
            </div>

            <!-- Derived modifier -->
            <div class="flex flex-col gap-0.5">
              <span class="text-[10px] uppercase tracking-wider text-text-muted">{ui('abilities.mod', engine.settings.language)}</span>
              <div class="flex items-center justify-center h-9 rounded-md bg-surface border border-border">
                <span class="text-base font-semibold
                  {pipeline.derivedModifier > 0 ? 'text-green-500 dark:text-green-400'
                  : pipeline.derivedModifier < 0 ? 'text-red-500 dark:text-red-400'
                  : 'text-text-muted'}">
                  {formatModifier(pipeline.derivedModifier)}
                </span>
              </div>
            </div>
          </div>

          <!-- Row 3: Temp modifier + action buttons -->
          <div class="flex items-center gap-2">
            <label for="temp-{abilityId}" class="text-xs text-text-muted shrink-0">{ui('abilities.temp', engine.settings.language)}</label>
            <input
              id="temp-{abilityId}"
              type="number"
              value={tempMods[abilityId] ?? '0'}
              class="input flex-1 text-center text-xs px-1 py-1 text-yellow-500 dark:text-yellow-400 min-w-0"
              style="border-color: color-mix(in oklch, var(--color-border) 70%, transparent);"
              aria-label={ui('abilities.temp_mod_aria', engine.settings.language).replace('{name}', engine.t(pipeline.label))}
               title={ui('abilities.temp_tooltip', engine.settings.language)}
              oninput={(e) => { tempMods[abilityId] = (e.target as HTMLInputElement).value; }}
            />
            <div class="flex gap-1 shrink-0">
              <button
                class="btn-ghost p-1.5 text-accent hover:bg-accent/10"
                onclick={() => (breakdownPipelineId = abilityId)}
                title={ui('abilities.show_breakdown', engine.settings.language)}
                aria-label={ui('abilities.show_breakdown_aria', engine.settings.language).replace('{name}', engine.t(pipeline.label))}
                type="button"
              ><IconInfo size={16} aria-hidden="true" /></button>
              <button
                class="btn-ghost p-1.5 text-yellow-500 dark:text-yellow-400 hover:bg-yellow-500/10"
                onclick={() => (diceRollPipelineId = abilityId)}
                title={ui('abilities.roll_check_aria', engine.settings.language).replace('{name}', engine.t(pipeline.label)).replace('{check}', ui('abilities.check', engine.settings.language))}
                aria-label={ui('abilities.roll_check_aria', engine.settings.language).replace('{name}', engine.t(pipeline.label)).replace('{check}', ui('abilities.check', engine.settings.language))}
                type="button"
              ><IconDiceRoll size={16} aria-hidden="true" /></button>
            </div>
          </div>

        </div>
      {/if}
    {/each}

  </div>
</div>

<!-- Modals -->
{#if breakdownPipelineId}
  {@const bp = engine.phase2_attributes[breakdownPipelineId]}
  {#if bp}
    <ModifierBreakdownModal
      label="{engine.t(bp.label)} ({getAbilityAbbr(breakdownPipelineId, engine.settings.language)})"
      baseValue={bp.baseValue}
      activeModifiers={bp.activeModifiers}
      situationalModifiers={bp.situationalModifiers}
      totalValue={bp.totalValue}
      derivedModifier={bp.derivedModifier}
      onclose={() => (breakdownPipelineId = null)}
    />
  {/if}
{/if}

{#if diceRollPipelineId}
  {@const dp = engine.phase2_attributes[diceRollPipelineId]}
  {#if dp}
    <DiceRollModal
      formula="1d20"
      pipeline={{ ...dp, totalBonus: dp.derivedModifier }}
      label="{engine.t(dp.label)} {ui('abilities.check', engine.settings.language)}"
      onclose={() => (diceRollPipelineId = null)}
    />
  {/if}
{/if}

{#if showPointBuy}
  <PointBuyModal onclose={() => (showPointBuy = false)} />
{/if}

{#if showRollStats}
  <RollStatsModal onclose={() => (showRollStats = false)} />
{/if}
