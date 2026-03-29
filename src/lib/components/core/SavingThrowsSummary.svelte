<!--
  @file src/lib/components/core/SavingThrowsSummary.svelte
  @description Compact read-only summary of the three saving throws for the Core tab.
  Phase 19.7: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT:
    Three stacked rows (Fort / Ref / Will). Each row shows:
      - Save name label (flex-1)
      - Governing ability abbreviation (CON/DEX/WIS) in the save's accent colour
      - Total modifier value, colour-coded via inline style from savingThrowConfig

  NOTE: The save rows use `style` for the accent colour because it comes from the
  `engine.savingThrowConfig` data (dynamic, runtime value) — not from a static
  Tailwind class. This is the only intentional inline style in this file.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { formatModifier } from '$lib/utils/formatters';
  import { ui } from '$lib/i18n/ui-strings';
  import { IconSaves } from '$lib/components/ui/icons';

  // Use $derived so the component reacts when savingThrowConfig switches from
  // its bootstrap fallback to the JSON-driven values after the DataLoader loads.
  const SAVES = $derived(engine.savingThrowConfig);
  const charId = $derived(engine.character.id);
  const lang   = $derived(engine.settings.language);
</script>

<div class="card p-4 flex flex-col gap-3">

  <!-- Header -->
  <div class="flex items-center justify-between border-b border-border pb-2">
    <div class="section-header">
      <IconSaves size={24} aria-hidden="true" />
      <span>{ui('core.saving_throws', lang)}</span>
    </div>
    <a
      href="/character/{charId}?tab=abilities"
      class="text-xs text-accent hover:text-accent-700 dark:hover:text-accent-300 transition-colors duration-150"
      aria-label="Open full Saving Throws editor"
    >
      {ui('core.edit_link', lang)}
    </a>
  </div>

  <!-- Saves list -->
  <div class="flex flex-col gap-1.5" role="list" aria-label="Saving throws">
    {#each SAVES as save}
      {@const pipeline = engine.phase3_combatStats[save.pipelineId]}
      {@const keyAbilityMod = engine.phase2_attributes[save.keyAbilityId]?.derivedModifier ?? 0}

      {#if pipeline}
        <div
          class="flex items-center gap-2 px-3 py-2 bg-surface-alt border border-border rounded-md
                 hover:border-accent/40 transition-colors duration-150"
          role="listitem"
          aria-label="{engine.t(pipeline.label)}: {formatModifier(pipeline.totalValue)}"
        >
          <!-- Save name -->
          <span class="flex-1 text-sm text-text-primary">{engine.t(pipeline.label)}</span>

          <!-- Key ability abbreviation (CON, DEX, WIS) coloured per save -->
          <span
            class="text-xs font-bold tracking-wider opacity-75 cursor-help"
            title="Governed by {engine.t(save.keyAbilityAbbr)} ({formatModifier(keyAbilityMod)})"
            aria-hidden="true"
            style="color: {save.accentColor};"
          >
            {engine.t(save.keyAbilityAbbr)}
          </span>

          <!-- Total modifier value -->
          <span
            class="text-base font-bold min-w-[2.5rem] text-right"
            style="color: {save.accentColor};"
          >
            {formatModifier(pipeline.totalValue)}
          </span>
        </div>
      {/if}
    {/each}
  </div>

</div>
