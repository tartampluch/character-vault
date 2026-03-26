<!--
  @file src/lib/components/abilities/SavingThrows.svelte
  @description Full interactive Saving Throws panel for the Abilities tab.
  Phase 19.8: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT:
    Three cards in a responsive grid (1-col mobile, 3-col sm+).
    Each card: save name, large total, ability-mod block, base block, misc count, temp input, actions.
    The accent colour per save (from savingThrowConfig) is applied via inline style on the top border.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { formatModifier } from '$lib/utils/formatters';
  import ModifierBreakdownModal from '$lib/components/ui/ModifierBreakdownModal.svelte';
  import DiceRollModal from '$lib/components/ui/DiceRollModal.svelte';
  import type { ID } from '$lib/types/primitives';
  import { IconSaves, IconInfo, IconDiceRoll } from '$lib/components/ui/icons';

  // Use $derived so the component reacts when savingThrowConfig switches from
  // its bootstrap fallback to the JSON-driven values after the DataLoader loads.
  const SAVES = $derived(engine.savingThrowConfig);

  let breakdownSaveId = $state<ID | null>(null);
  let diceRollSaveId  = $state<ID | null>(null);
  let tempMods        = $state<Record<string, string>>({});

  function getTempMod(id: string): number {
    const v = parseInt(tempMods[id] ?? '0', 10);
    return isNaN(v) ? 0 : v;
  }
</script>

<div class="card p-4 flex flex-col gap-4">

  <!-- Header -->
  <div class="section-header border-b border-border pb-2">
    <IconSaves size={20} aria-hidden="true" />
    <span>{ui('saves.title', engine.settings.language)}</span>
  </div>

  <!-- 3-card grid -->
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
    {#each SAVES as save}
      {@const pipeline = engine.phase3_combatStats[save.pipelineId]}
      {@const abilityMod = engine.phase2_attributes[save.keyAbilityId]?.derivedModifier ?? 0}

      {#if pipeline}
        {@const tempMod = getTempMod(save.pipelineId)}
        {@const effectiveTotal = pipeline.totalValue + tempMod}

        <!--
          Top border uses the save's accent colour (runtime value from config).
          The rest uses semantic Tailwind tokens.
        -->
        <div
          class="flex flex-col gap-3 p-3 rounded-lg border border-border bg-surface-alt"
          style="border-top: 3px solid {save.accentColor};"
          aria-label="{engine.t(pipeline.label)}: {formatModifier(effectiveTotal)}"
        >
          <!-- Save name -->
          <p class="text-sm font-semibold" style="color: {save.accentColor};">
            {engine.t(pipeline.label)}
          </p>

          <!-- Large total modifier -->
          <div class="text-center">
            <span class="text-4xl font-bold leading-none" style="color: {save.accentColor};">
              {formatModifier(effectiveTotal)}
            </span>
          </div>

          <!-- Component breakdown chips -->
          <div class="flex flex-wrap gap-1.5">
            <!-- Key ability block (CON/DEX/WIS) -->
            <div
              class="flex flex-col items-center px-2 py-1 rounded border bg-surface min-w-[2.5rem]"
              style="border-color: {save.accentColor}40;"
            >
              <span class="text-[10px] uppercase tracking-wider text-text-muted">{engine.t(save.keyAbilityAbbr)}</span>
              <span
                class="text-sm font-semibold
                  {abilityMod > 0 ? 'text-green-500 dark:text-green-400'
                  : abilityMod < 0 ? 'text-red-500 dark:text-red-400'
                  : 'text-text-muted'}"
                title="{engine.t(engine.phase2_attributes[save.keyAbilityId]?.label ?? {})} modifier"
              >
                {formatModifier(abilityMod)}
              </span>
            </div>

            <!-- Base save bonus -->
            <div class="flex flex-col items-center px-2 py-1 rounded border border-border bg-surface min-w-[2.5rem]">
              <span class="text-[10px] uppercase tracking-wider text-text-muted">{ui('saves.base', engine.settings.language)}</span>
              <span class="text-sm font-semibold text-text-secondary">
                {formatModifier(pipeline.totalBonus - abilityMod)}
              </span>
            </div>

            <!-- Active modifier count (if any) -->
            {#if pipeline.activeModifiers.length > 0}
              <div class="flex flex-col items-center px-2 py-1 rounded border border-border bg-surface min-w-[2.5rem]">
                <span class="text-[10px] uppercase tracking-wider text-text-muted">{ui('saves.mods', engine.settings.language)}</span>
                <span class="text-xs text-text-muted">{pipeline.activeModifiers.length}</span>
              </div>
            {/if}
          </div>

          <!-- Temp modifier row -->
          <div class="flex items-center gap-2">
            <label for="temp-save-{save.pipelineId}" class="text-xs text-text-muted shrink-0">{ui('saves.temp', engine.settings.language)}</label>
            <input
              id="temp-save-{save.pipelineId}"
              type="number"
              value={tempMods[save.pipelineId] ?? '0'}
              class="input flex-1 text-center text-xs px-1 py-1 text-yellow-500 dark:text-yellow-400 min-w-0"
              oninput={(e) => { tempMods[save.pipelineId] = (e.target as HTMLInputElement).value; }}
              aria-label="{engine.t(pipeline.label)} temporary modifier"
            />
          </div>

          <!-- Action buttons -->
          <div class="flex gap-1 justify-end">
            <button
              class="btn-ghost p-1.5 text-accent hover:bg-accent/10"
              onclick={() => (breakdownSaveId = save.pipelineId)}
              aria-label="Show {engine.t(pipeline.label)} breakdown"
              title={ui('saves.show_breakdown', engine.settings.language)}
              type="button"
            ><IconInfo size={15} aria-hidden="true" /></button>
            <button
              class="btn-ghost p-1.5 text-yellow-500 dark:text-yellow-400 hover:bg-yellow-500/10"
              onclick={() => (diceRollSaveId = save.pipelineId)}
              aria-label="Roll {engine.t(pipeline.label)} save"
              title={ui('saves.roll', engine.settings.language)}
              type="button"
            ><IconDiceRoll size={15} aria-hidden="true" /></button>
          </div>

        </div>
      {/if}
    {/each}
  </div>

</div>

<!-- Breakdown Modal -->
{#if breakdownSaveId}
  {@const bp = engine.phase3_combatStats[breakdownSaveId]}
  {#if bp}
    <ModifierBreakdownModal
      label={engine.t(bp.label)}
      baseValue={bp.baseValue}
      activeModifiers={bp.activeModifiers}
      situationalModifiers={bp.situationalModifiers}
      totalValue={bp.totalValue}
      onclose={() => (breakdownSaveId = null)}
    />
  {/if}
{/if}

<!-- Dice Roll Modal -->
{#if diceRollSaveId}
  {@const dp = engine.phase3_combatStats[diceRollSaveId]}
  {#if dp}
    <DiceRollModal
      formula="1d20"
      pipeline={dp}
      label="{engine.t(dp.label)} {ui('saves.save', engine.settings.language)}"
      onclose={() => (diceRollSaveId = null)}
    />
  {/if}
{/if}
