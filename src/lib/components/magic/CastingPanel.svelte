<!--
  @file src/lib/components/magic/CastingPanel.svelte
  @description Spell preparation and casting panel for active spellcasters.
  Phase 19.10: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT:
    Section header.
    Known spells grouped by level in collapsible-like sections.
    Each level group: accent header with DC. Each spell row: name, school, info, dice, cast buttons.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import DiceRollModal from '$lib/components/ui/DiceRollModal.svelte';
  import type { MagicFeature } from '$lib/types/feature';
  import type { StatisticPipeline } from '$lib/types/pipeline';
  import type { ID } from '$lib/types/primitives';
  import { IconTabMagic, IconInfo, IconDiceRoll } from '$lib/components/ui/icons';

  let modalSpellId = $state<ID | null>(null);
  let diceSpellId  = $state<ID | null>(null);

  const knownSpells = $derived.by(() =>
    engine.character.activeFeatures
      .filter(afi => {
        if (!afi.isActive) return false;
        return dataLoader.getFeature(afi.featureId)?.category === 'magic';
      })
      .map(afi => dataLoader.getFeature(afi.featureId) as MagicFeature)
      .filter(Boolean)
  );

  const spellsByLevel = $derived.by(() => {
    const groups: Record<number, MagicFeature[]> = {};
    for (const spell of knownSpells) {
      const level = Math.min(...Object.values(spell.spellLists ?? { '?': 0 }));
      if (!groups[level]) groups[level] = [];
      groups[level].push(spell);
    }
    return groups;
  });

  const sortedLevels = $derived(Object.keys(spellsByLevel).map(Number).sort((a, b) => a - b));

  function getSpellDC(spellLevel: number): number {
    return engine.getSpellSaveDC(spellLevel);
  }

  function buildSpellPipeline(): StatisticPipeline {
    return {
      id: 'synthetic_spell_roll', label: { en: 'Spell' }, baseValue: 0,
      activeModifiers: [], situationalModifiers: [],
      totalBonus: engine.phase_casterLevel, totalValue: engine.phase_casterLevel, derivedModifier: 0,
    };
  }

  const currentDiceSpell = $derived(
    diceSpellId ? dataLoader.getFeature(diceSpellId) as MagicFeature | undefined : undefined
  );
</script>

<div class="card p-4 flex flex-col gap-3">

  <div class="section-header border-b border-border pb-2">
    <IconTabMagic size={20} aria-hidden="true" />
    <span>Spells &amp; Powers</span>
  </div>

  {#if knownSpells.length === 0}
    <p class="text-sm text-text-muted italic">No spells known. Use the Grimoire to learn spells.</p>
  {:else}
    {#each sortedLevels as level}
      <div class="flex flex-col gap-1">

        <!-- Level header with DC -->
        <div class="flex items-center justify-between px-2 py-1 rounded bg-accent/10 border border-accent/20">
          <span class="text-xs font-semibold uppercase tracking-wider text-accent">
            {level === 0 ? 'Cantrips (0)' : `Level ${level}`}
          </span>
          <span class="text-[10px] text-text-muted">Save DC: {getSpellDC(level)}</span>
        </div>

        <!-- Spell rows within this level -->
        {#each spellsByLevel[level] ?? [] as spell}
          <div class="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-surface-alt transition-colors duration-100">
            <span class="flex-1 text-sm text-text-primary truncate">{engine.t(spell.label)}</span>
            <span class="text-[10px] text-text-muted shrink-0">{spell.school}</span>

            <button
              class="btn-ghost p-1 text-accent hover:bg-accent/10 shrink-0"
              onclick={() => (modalSpellId = spell.id)}
              aria-label="Details"
              type="button"
            ><IconInfo size={13} aria-hidden="true" /></button>

            {#if spell.grantedModifiers?.some(m => m.targetId.includes('damage'))}
              <button
                class="btn-ghost p-1 text-yellow-500 dark:text-yellow-400 hover:bg-yellow-500/10 shrink-0"
                onclick={() => (diceSpellId = spell.id)}
                aria-label="Roll damage"
                type="button"
              ><IconDiceRoll size={13} aria-hidden="true" /></button>
            {/if}

            <button
              class="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition-colors duration-150"
              aria-label="Cast {engine.t(spell.label)}"
              type="button"
            >Cast</button>
          </div>
        {/each}
      </div>
    {/each}
  {/if}

</div>

{#if modalSpellId}
  <FeatureModal featureId={modalSpellId} onclose={() => (modalSpellId = null)} />
{/if}

{#if diceSpellId && currentDiceSpell}
  <DiceRollModal
    formula={currentDiceSpell.grantedModifiers?.[0]?.targetId.includes('damage') ? '1d6' : '1d20'}
    pipeline={buildSpellPipeline()}
    label="{engine.t(currentDiceSpell.label)} Damage"
    onclose={() => (diceSpellId = null)}
  />
{/if}
