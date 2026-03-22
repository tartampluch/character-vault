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
  import { ui } from '$lib/i18n/ui-strings';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import DiceRollModal from '$lib/components/ui/DiceRollModal.svelte';
  import type { MagicFeature } from '$lib/types/feature';
  import type { StatisticPipeline } from '$lib/types/pipeline';
  import type { ID } from '$lib/types/primitives';
  import { IconTabMagic, IconInfo, IconDiceRoll } from '$lib/components/ui/icons';

  import type { PsionicDiscipline, PsionicDisplay } from '$lib/types/feature';

  let modalSpellId = $state<ID | null>(null);
  let diceSpellId  = $state<ID | null>(null);

  // ── Discipline filter (psionic mode — Extension D) ────────────────────────
  let activeDisciplineFilter = $state<PsionicDiscipline | 'all'>('all');

  const knownSpells = $derived.by(() =>
    engine.character.activeFeatures
      .filter(afi => {
        if (!afi.isActive) return false;
        return dataLoader.getFeature(afi.featureId)?.category === 'magic';
      })
      .map(afi => dataLoader.getFeature(afi.featureId) as MagicFeature)
      .filter(Boolean)
  );

  /** True if any known power is psionic — enables discipline filter UI */
  const hasPsionicPowers = $derived(knownSpells.some(s => s.magicType === 'psionic'));

  /** All disciplines present in known psionic powers */
  const presentDisciplines = $derived<PsionicDiscipline[]>(
    [...new Set(knownSpells
      .filter(s => s.magicType === 'psionic' && s.discipline)
      .map(s => s.discipline!))]
  );

  const filteredSpells = $derived(
    activeDisciplineFilter === 'all'
      ? knownSpells
      : knownSpells.filter(s =>
          s.magicType !== 'psionic' || s.discipline === activeDisciplineFilter
        )
  );

  const spellsByLevel = $derived.by(() => {
    const groups: Record<number, MagicFeature[]> = {};
    for (const spell of filteredSpells) {
      const level = Math.min(...Object.values(spell.spellLists ?? { '?': 0 }));
      if (!groups[level]) groups[level] = [];
      groups[level].push(spell);
    }
    return groups;
  });

  const sortedLevels = $derived(Object.keys(spellsByLevel).map(Number).sort((a, b) => a - b));

  /** Localised display name for a discipline */
  function disciplineLabel(d: PsionicDiscipline): string {
    const key = `psi.discipline.${d}` as const;
    return ui(key, engine.settings.language);
  }

  /** Short abbreviation badges for psionic displays */
  const DISPLAY_COLORS: Record<PsionicDisplay, string> = {
    auditory:  'bg-yellow-700/40 text-yellow-300',
    material:  'bg-slate-700/40  text-slate-300',
    mental:    'bg-purple-700/40 text-purple-300',
    olfactory: 'bg-lime-700/40   text-lime-300',
    visual:    'bg-sky-700/40    text-sky-300',
  };

  /** Suppress-display Concentration DC = 15 + power level */
  function suppressDC(spell: MagicFeature): number {
    const lvl = Math.min(...Object.values(spell.spellLists ?? { '?': 0 }));
    return 15 + (isFinite(lvl) ? lvl : 0);
  }

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
    <span>{ui('magic.casting.title', engine.settings.language)}</span>
  </div>

  <!-- ── DISCIPLINE FILTER (psionic powers — Extension D) ──────────────── -->
  {#if hasPsionicPowers && presentDisciplines.length > 1}
    <div class="flex flex-wrap gap-1.5 pb-1">
      <button
        class="px-2 py-0.5 rounded-full text-xs border transition-colors duration-150
               {activeDisciplineFilter === 'all' ? 'bg-accent/20 text-accent border-accent/40' : 'border-border text-text-muted hover:border-accent/40'}"
        onclick={() => (activeDisciplineFilter = 'all')}
        type="button"
      >{ui('psi.all_disciplines', engine.settings.language)}</button>
      {#each presentDisciplines as disc}
        <button
          class="px-2 py-0.5 rounded-full text-xs border transition-colors duration-150
                 {activeDisciplineFilter === disc ? 'bg-purple-700/30 text-purple-300 border-purple-600/40' : 'border-border text-text-muted hover:border-purple-500/40'}"
          onclick={() => (activeDisciplineFilter = disc)}
          type="button"
        >{disciplineLabel(disc)}</button>
      {/each}
    </div>
  {/if}

  {#if knownSpells.length === 0}
    <p class="text-sm text-text-muted italic">{ui('magic.casting.empty', engine.settings.language)}</p>
  {:else if filteredSpells.length === 0}
    <p class="text-sm text-text-muted italic">{ui('psi.filter_discipline', engine.settings.language)}: {disciplineLabel(activeDisciplineFilter as PsionicDiscipline)} — no powers known.</p>
  {:else}
    {#each sortedLevels as level}
      <div class="flex flex-col gap-1">

        <!-- Level header with DC -->
        <div class="flex items-center justify-between px-2 py-1 rounded bg-accent/10 border border-accent/20">
          <span class="text-xs font-semibold uppercase tracking-wider text-accent">
            {level === 0 ? ui('magic.casting.cantrips', engine.settings.language) : `${ui('magic.casting.level', engine.settings.language)} ${level}`}
          </span>
          <span class="text-[10px] text-text-muted">{ui('magic.casting.save_dc', engine.settings.language)} {getSpellDC(level)}</span>
        </div>

        <!-- Spell/power rows within this level -->
        {#each spellsByLevel[level] ?? [] as spell}
          <div class="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-surface-alt transition-colors duration-100">
            <span class="flex-1 text-sm text-text-primary truncate">{engine.t(spell.label)}</span>

            <!-- School or psionic discipline (Extension D) -->
            {#if spell.magicType === 'psionic' && spell.discipline}
              <span class="text-[10px] text-purple-400/80 shrink-0">{disciplineLabel(spell.discipline)}</span>
            {:else}
              <span class="text-[10px] text-text-muted shrink-0">{spell.school}</span>
            {/if}

            <!-- Psionic display badges (Extension D) -->
            {#if spell.magicType === 'psionic' && spell.displays && spell.displays.length > 0}
              <span class="flex gap-0.5 shrink-0" title="Displays: {spell.displays.join(', ')} — suppress DC {suppressDC(spell)}">
                {#each spell.displays as disp}
                  <span class="text-[9px] px-1 py-0.5 rounded font-bold {DISPLAY_COLORS[disp as PsionicDisplay] ?? 'bg-surface-alt text-text-muted'}">
                    {ui(`psi.display.${disp}`, engine.settings.language)}
                  </span>
                {/each}
              </span>
            {/if}

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
              aria-label="{spell.magicType === 'psionic' ? 'Manifest' : 'Cast'} {engine.t(spell.label)}"
              type="button"
            >{spell.magicType === 'psionic' ? ui('psi.pp_cost', engine.settings.language).replace('{pp}', '?') : ui('magic.casting.cast', engine.settings.language)}</button>
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
    label="{engine.t(currentDiceSpell.label)} {ui('magic.casting.damage', engine.settings.language)}"
    onclose={() => (diceSpellId = null)}
  />
{/if}
