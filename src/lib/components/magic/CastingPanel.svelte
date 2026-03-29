<!--
  @file src/lib/components/magic/CastingPanel.svelte
  @description Spell preparation and casting panel for active spellcasters.
  Phase 19.10 + Checkpoint #2 fixes + F3 refactoring: extracted magic-item sub-panel
  and spell-row into dedicated components.

  LAYOUT:
    Section header.
    MagicItemsCastingSubpanel: equipped wands, staves, scrolls, metamagic rods.
    Discipline filter (psionic mode — Extension D).
    Known spells grouped by level; each row = SpellRowItem.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { ui, buildLocalizedString } from '$lib/i18n/ui-strings';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import DiceRollModal from '$lib/components/ui/DiceRollModal.svelte';
  import type { ItemFeature, MagicFeature } from '$lib/types/feature';
  import type { StatisticPipeline } from '$lib/types/pipeline';
  import type { ID } from '$lib/types/primitives';
  import { IconTabMagic } from '$lib/components/ui/icons';
  import { SPELL_ROLL_LABEL_KEY, MAGIC_TYPE_PSIONIC } from '$lib/utils/constants';
  import type { PsionicDiscipline } from '$lib/types/feature';

  import MagicItemsCastingSubpanel from './MagicItemsCastingSubpanel.svelte';
  import SpellRowItem              from './SpellRowItem.svelte';

  let modalSpellId = $state<ID | null>(null);
  let diceSpellId  = $state<ID | null>(null);

  // ── Discipline filter (psionic mode — Extension D) ────────────────────────
  let activeDisciplineFilter = $state<PsionicDiscipline | 'all'>('all');

  // ── Augmentation picker state ─────────────────────────────────────────────
  // Track how many augmentation "increments" the player has selected per spell.
  let augSteps = $state<Record<ID, number>>({});

  // ── Track which spell detail expansion is open (one at a time) ────────────
  let expandedSpellId = $state<ID | null>(null);

  function toggleSpellExpand(spellId: ID) {
    expandedSpellId = expandedSpellId === spellId ? null : spellId;
  }

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
  const hasPsionicPowers = $derived(knownSpells.some(s => s.magicType === MAGIC_TYPE_PSIONIC));

  /** All disciplines present in known psionic powers */
  const presentDisciplines = $derived<PsionicDiscipline[]>(
    [...new Set(knownSpells
      .filter(s => s.magicType === MAGIC_TYPE_PSIONIC && s.discipline)
      .map(s => s.discipline!))]
  );

  const filteredSpells = $derived(
    activeDisciplineFilter === 'all'
      ? knownSpells
      : knownSpells.filter(s =>
          s.magicType !== MAGIC_TYPE_PSIONIC || s.discipline === activeDisciplineFilter
        )
  );

  const spellsByLevel = $derived.by(() => {
    const groups: Record<number, MagicFeature[]> = {};
    for (const spell of filteredSpells) {
      const level = engine.getSpellEffectiveLevel(spell.spellLists);
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

  function getSpellDC(spellLevel: number): number {
    return engine.getSpellSaveDC(spellLevel);
  }

  function buildSpellPipeline(): StatisticPipeline {
    return {
      id: 'synthetic_spell_roll', label: buildLocalizedString(SPELL_ROLL_LABEL_KEY), baseValue: 0,
      activeModifiers: [], situationalModifiers: [],
      totalBonus: engine.phase_casterLevel, totalValue: engine.phase_casterLevel, derivedModifier: 0,
    };
  }

  const currentDiceSpell = $derived(
    diceSpellId ? dataLoader.getFeature(diceSpellId) as MagicFeature | undefined : undefined
  );

  /**
   * Handles the Cast button for a known arcane/divine spell.
   *
   * ZERO-GAME-LOGIC RULE (ARCHITECTURE.md §3):
   *   The slot deduction and pool validation are delegated entirely to the engine.
   */
  function handleCast(spell: MagicFeature, spellLevel: number): void {
    const ok = engine.useSpellSlot(spellLevel);
    if (!ok) {
      alert(ui('magic.casting.no_slot_available', engine.settings.language));
    }
  }

  /**
   * Handles the Manifest button for a psionic power.
   *
   * ZERO-GAME-LOGIC RULE (ARCHITECTURE.md §3):
   *   PP validation and deduction are entirely within the engine method.
   */
  function handleManifest(spell: MagicFeature, ppCost: number): void {
    const ok = engine.spendPowerPoints(ppCost);
    if (!ok) {
      alert(ui('magic.casting.insufficient_pp', engine.settings.language));
    } else {
      augSteps[spell.id] = 0;
    }
  }

  // ── Magic Items scanning ─────────────────────────────────────────────────────
  const equippedCastingItems = $derived.by(() => {
    return engine.character.activeFeatures
      .filter(afi => afi.isActive)
      .map(afi => dataLoader.getFeature(afi.featureId))
      .filter((f): f is ItemFeature =>
        !!f &&
        f.category === 'item' &&
        !!(
          (f as ItemFeature).wandSpell ||
          (f as ItemFeature).staffSpells?.length ||
          (f as ItemFeature).scrollSpells?.length ||
          (f as ItemFeature).metamagicEffect
        )
      ) as ItemFeature[];
  });

  /** Equipped metamagic rods (items with metamagicEffect). */
  const equippedMetamagicRods = $derived(
    equippedCastingItems.filter(f => f.metamagicEffect)
  );

  /**
   * Active metamagic rod effects for the current character.
   */
  const activeRodEffects = $derived(
    equippedMetamagicRods.map(rod => ({
      label: engine.t(rod.label),
      feat: rod.metamagicEffect!.feat,
      maxSpellLevel: rod.metamagicEffect!.maxSpellLevel,
    }))
  );
</script>

<div class="card p-4 flex flex-col gap-3">

  <div class="section-header border-b border-border pb-2">
    <IconTabMagic size={24} aria-hidden="true" />
    <span>{ui('magic.casting.title', engine.settings.language)}</span>
  </div>

  <!-- ── MAGIC ITEMS SUB-PANEL (extracted to MagicItemsCastingSubpanel) ── -->
  <MagicItemsCastingSubpanel equippedItems={equippedCastingItems} />

  <!-- ── DISCIPLINE FILTER (psionic powers — Extension D) ──────────────── -->
  {#if hasPsionicPowers && presentDisciplines.length >= 1}
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
    <p class="text-sm text-text-muted italic">{disciplineLabel(activeDisciplineFilter as PsionicDiscipline)} — {ui('psi.no_powers_in_filter', engine.settings.language)}</p>
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

        <!-- Spell/power rows via SpellRowItem -->
        {#each spellsByLevel[level] ?? [] as spell}
          {@const isPsionic = spell.magicType === MAGIC_TYPE_PSIONIC}
          {@const steps = augSteps[spell.id] ?? 0}
          <SpellRowItem
            {spell}
            augStep={steps}
            isExpanded={expandedSpellId === spell.id}
            spellLevel={level}
            {activeRodEffects}
            onAugChange={(n) => { augSteps[spell.id] = n; }}
            onToggleExpand={() => toggleSpellExpand(spell.id)}
            onCast={() => isPsionic
              ? handleManifest(spell, engine.getTotalManifestCost(
                  (spell as MagicFeature & { basePpCost?: number }).basePpCost ?? 1,
                  spell.augmentations,
                  steps
                ))
              : handleCast(spell, level)
            }
            onInfo={() => { modalSpellId = spell.id; }}
            onDice={engine.spellHasDamageRoll(spell) ? () => { diceSpellId = spell.id; } : undefined}
          />
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
    formula={engine.spellHasDamageRoll(currentDiceSpell) ? engine.getSpellDiceFormula(currentDiceSpell) : '1d20'}
    pipeline={buildSpellPipeline()}
    label="{engine.t(currentDiceSpell.label)} {ui('magic.casting.damage', engine.settings.language)}"
    onclose={() => (diceSpellId = null)}
  />
{/if}
