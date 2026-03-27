<!--
  @file src/lib/components/magic/CastingPanel.svelte
  @description Spell preparation and casting panel for active spellcasters.
  Phase 19.10 + Checkpoint #2 fixes: Added augmentation picker, magic item casting
  (wand/staff/scroll/metamagic rod integration).

  LAYOUT:
    Section header.
    Magic items sub-panel: equipped wands, staves, and scrolls as casting options.
    Metamagic rod sub-panel: applies free metamagic to eligible spells.
    Known spells grouped by level in collapsible-like sections.
    Each spell row: name, school, display badges (psionic), augmentation picker,
    info, dice, cast buttons.

  MAGIC ITEM CASTING (ARCHITECTURE.md §12.3):
    - Wand: uses the ITEM'S casterLevel (not the wielder's).
    - Staff: shows per-spell charge costs from staffSpells array.
    - Scroll: enforces spellType restriction (arcane/divine);
              CL check DC = item.casterLevel + 1.
    - Metamagic rod: identified by metamagicEffect field; offers free metamagic
              to spells whose level ≤ rod.maxSpellLevel.

  AUGMENTATION PICKER (psionic powers — ARCHITECTURE.md §12.3):
    - Each psionic power may have augmentations[] entries.
    - Qualitative augmentations (empty grantedModifiers) show effectDescription.
    - A PP cost stepper lets the user choose how many augmentation increments to apply.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { ui, buildLocalizedString } from '$lib/i18n/ui-strings';
  import { formatModifier } from '$lib/utils/formatters';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import DiceRollModal from '$lib/components/ui/DiceRollModal.svelte';
  import type { ItemFeature, MagicFeature } from '$lib/types/feature';
  import type { StatisticPipeline } from '$lib/types/pipeline';
  import type { ID } from '$lib/types/primitives';
  import { IconTabMagic, IconInfo, IconDiceRoll, IconTabInventory, IconClose, IconMagicWand } from '$lib/components/ui/icons';
  import { SPELL_ROLL_LABEL_KEY } from '$lib/utils/constants';

  import type { PsionicDiscipline, PsionicDisplay } from '$lib/types/feature';

  let modalSpellId = $state<ID | null>(null);
  let diceSpellId  = $state<ID | null>(null);

  // ── Discipline filter (psionic mode — Extension D) ────────────────────────
  let activeDisciplineFilter = $state<PsionicDiscipline | 'all'>('all');

  // ── Augmentation picker state ─────────────────────────────────────────────
  // Track how many augmentation "increments" the player has selected per spell.
  // Key: spell ID, Value: number of PP increments committed to augmentation.
  let augSteps = $state<Record<ID, number>>({});

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
      // Delegate Math.min over spellLists to the engine (zero-game-logic-in-Svelte rule,
      // ARCHITECTURE.md §3). Grimoire.svelte already uses this pattern; aligning here.
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

  /** Short abbreviation badges for psionic displays */
  const DISPLAY_COLORS: Record<PsionicDisplay, string> = {
    auditory:  'bg-yellow-700/40 text-yellow-300',
    material:  'bg-slate-700/40  text-slate-300',
    mental:    'bg-purple-700/40 text-purple-300',
    olfactory: 'bg-lime-700/40   text-lime-300',
    visual:    'bg-sky-700/40    text-sky-300',
  };

  /**
   * Returns the Concentration check DC to suppress a psionic power's displays.
   * D&D formula: 15 + power level — delegated to the engine per zero-game-logic rule.
   */
  function suppressDC(spell: MagicFeature): number {
    return engine.getPsionicSuppressDC(spell.spellLists);
  }

  function getSpellDC(spellLevel: number): number {
    return engine.getSpellSaveDC(spellLevel);
  }

   function buildSpellPipeline(): StatisticPipeline {
     return {
       // buildLocalizedString(SPELL_ROLL_LABEL_KEY) builds the label from
       // ui-strings.ts (English) and all loaded locale files at call time.
       // No inline EN/FR translations in .svelte files (ARCHITECTURE.md §6).
       id: 'synthetic_spell_roll', label: buildLocalizedString(SPELL_ROLL_LABEL_KEY), baseValue: 0,
      activeModifiers: [], situationalModifiers: [],
      totalBonus: engine.phase_casterLevel, totalValue: engine.phase_casterLevel, derivedModifier: 0,
    };
  }

  const currentDiceSpell = $derived(
    diceSpellId ? dataLoader.getFeature(diceSpellId) as MagicFeature | undefined : undefined
  );

  // ── Augmentation helpers ─────────────────────────────────────────────────────

  /**
   * Returns the base PP cost for a spell before augmentation.
   * Used to pass to engine.getTotalManifestCost() and engine.canAddAugmentStep().
   */
  function spellBasePpCost(spell: MagicFeature): number {
    // basePpCost is the minimum PP to manifest before augmentation.
    return (spell as MagicFeature & { basePpCost?: number }).basePpCost ?? 1;
  }

  // ── Magic Items scanning ─────────────────────────────────────────────────────

  /**
   * All equipped items that can be used for casting.
   *
   * Scans the character's active features for item features with:
   *   - wandSpell
   *   - staffSpells
   *   - scrollSpells
   *   - metamagicEffect
   *
   * The checkpoint (CHECKPOINTS.md §2 §9) requires each of these to integrate
   * with the casting panel. They are collected here and rendered separately from
   * the known-spells list.
   */
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

  /** Equipped staves (items with staffSpells). */
  const equippedStaves = $derived(
    equippedCastingItems.filter(f => f.staffSpells?.length)
  );

  /** Equipped wands (items with wandSpell). */
  const equippedWands = $derived(
    equippedCastingItems.filter(f => f.wandSpell)
  );

  /** Equipped scrolls (items with scrollSpells). */
  const equippedScrolls = $derived(
    equippedCastingItems.filter(f => f.scrollSpells?.length)
  );

  /**
   * Active metamagic rod effects for the current character.
   *
   * A metamagic rod grants free metamagic application (without using a higher
   * spell slot) to spells whose level ≤ rod.maxSpellLevel.
   * Up to 3 uses per day per standard SRD rules.
   */
  const activeRodEffects = $derived(
    equippedMetamagicRods.map(rod => ({
      label: engine.t(rod.label),
      feat: rod.metamagicEffect!.feat,
      maxSpellLevel: rod.metamagicEffect!.maxSpellLevel,
    }))
  );

  /**
   * Returns a localised reason string for why a scroll cannot be cast.
   *
   * The engine's `getScrollUseInfo()` returns facts (wrongType flag, checkDC).
   * Translating those into user-facing strings is a UI concern — it stays here.
   * This complies with the zero-game-logic-in-Svelte rule (ARCHITECTURE.md §3):
   * the CL comparison and DC formula live in the engine; only the i18n lookup
   * is done in the component.
   *
   * @param result - Return value of `engine.getScrollUseInfo()`
   * @param spellType - 'arcane' or 'divine' (needed for the wrong-type message)
   */
  function scrollWrongTypeReason(spellType: 'arcane' | 'divine'): string {
    return ui('magic.scroll.wrong_type', engine.settings.language).replace('{type}', spellType);
  }

  /** Track which spell detail expansion is open (for augmentation picker). */
  let expandedSpellId = $state<ID | null>(null);

  function toggleSpellExpand(spellId: ID) {
    expandedSpellId = expandedSpellId === spellId ? null : spellId;
  }
</script>

<div class="card p-4 flex flex-col gap-3">

  <div class="section-header border-b border-border pb-2">
    <IconTabMagic size={20} aria-hidden="true" />
    <span>{ui('magic.casting.title', engine.settings.language)}</span>
  </div>

  <!-- ── METAMAGIC RODS (equipped rods that offer free metamagic) ──────── -->
  {#if equippedMetamagicRods.length > 0}
    <section class="flex flex-col gap-1.5">
      <span class="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
        {ui('magic.casting.metamagic_rods', engine.settings.language)}
      </span>
      {#each activeRodEffects as rod}
        <div class="flex items-center gap-2 px-2 py-1 rounded border border-purple-700/30 bg-purple-950/10 text-xs">
          <span class="text-purple-300 font-medium truncate">{rod.label}</span>
          <span class="badge-gray font-mono ml-auto shrink-0">
            {ui('magic.casting.rod_feat', engine.settings.language).replace('{feat}', rod.feat)}
          </span>
          <span class="text-[10px] text-text-muted shrink-0">
            {ui('magic.casting.rod_max_level', engine.settings.language).replace('{lvl}', String(rod.maxSpellLevel))}
          </span>
        </div>
      {/each}
    </section>
  {/if}

  <!-- ── STAVES (per-spell charge costs) ──────────────────────────────────── -->
  {#if equippedStaves.length > 0}
    <section class="flex flex-col gap-1.5">
      <span class="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
        {ui('magic.casting.staves', engine.settings.language)}
      </span>
      {#each equippedStaves as staff}
        <div class="flex flex-col gap-0.5 px-2 py-1.5 rounded border border-amber-700/30 bg-amber-950/10">
          <span class="text-xs font-medium text-amber-300">{engine.t(staff.label)}</span>
          <div class="flex flex-col gap-0.5 pl-2">
            {#each staff.staffSpells ?? [] as entry}
              {@const spellFeat = dataLoader.getFeature(entry.spellId)}
              <div class="flex items-center gap-2 text-[11px]">
                <span class="flex-1 truncate text-text-secondary">
                  {spellFeat ? engine.t(spellFeat.label) : entry.spellId}
                </span>
                <span class="badge-yellow shrink-0">
                  {ui('magic.casting.staff_charge_cost', engine.settings.language).replace('{n}', String(entry.chargeCost))}
                </span>
                <button
                  class="btn-ghost p-0.5 text-accent hover:bg-accent/10 shrink-0"
                  onclick={() => { if (spellFeat) modalSpellId = spellFeat.id; }}
                  aria-label="Staff spell details"
                  type="button"
                ><IconInfo size={11} aria-hidden="true" /></button>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </section>
  {/if}

  <!-- ── WANDS (item casterLevel used, not wielder's) ─────────────────────── -->
  {#if equippedWands.length > 0}
    <section class="flex flex-col gap-1.5">
      <span class="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
        {ui('magic.casting.wands', engine.settings.language)}
      </span>
      {#each equippedWands as wand}
        {@const ws = wand.wandSpell!}
        {@const spellFeat = dataLoader.getFeature(ws.spellId ?? '')}
        <div class="flex items-center gap-2 px-2 py-1 rounded border border-sky-700/30 bg-sky-950/10 text-xs">
          <span class="text-sky-300 font-medium truncate">
            {engine.t(wand.label)}
          </span>
          {#if spellFeat}
            <span class="text-text-secondary truncate">{engine.t(spellFeat.label)}</span>
          {/if}
          <!-- Item's casterLevel used (NOT wielder's CL) — ARCHITECTURE.md §12.3 -->
          <span class="badge-accent ml-auto shrink-0">
            {ui('magic.casting.wand_cl', engine.settings.language).replace('{cl}', String(ws.casterLevel))}
          </span>
          {#if ws.spellLevel !== undefined}
            <span class="badge-gray shrink-0">
              {ui('magic.casting.level', engine.settings.language)} {ws.spellLevel}
            </span>
          {/if}
        </div>
      {/each}
    </section>
  {/if}

  <!-- ── SCROLLS (arcane/divine restriction + CL check DC) ───────────────── -->
  {#if equippedScrolls.length > 0}
    <section class="flex flex-col gap-1.5">
      <span class="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
        {ui('magic.casting.scrolls', engine.settings.language)}
      </span>
      {#each equippedScrolls as scroll}
        <div class="flex flex-col gap-0.5 px-2 py-1.5 rounded border border-green-700/30 bg-green-950/10">
          <span class="text-xs font-medium text-green-300">{engine.t(scroll.label)}</span>
          <div class="flex flex-col gap-0.5 pl-2">
            {#each scroll.scrollSpells ?? [] as entry}
              {@const spellFeat    = dataLoader.getFeature(entry.spellId ?? '')}
              <!-- engine.getScrollUseInfo() enforces the D&D arcane/divine type check and
                   computes the CL check DC — no game logic in the template (ARCHITECTURE.md §3). -->
              {@const scrollCheck  = engine.getScrollUseInfo(entry.spellType, entry.casterLevel)}
              <div class="flex items-center gap-1.5 text-[11px]">
                <span class="flex-1 truncate {scrollCheck.canUse ? 'text-text-secondary' : 'text-text-muted/50 line-through'}">
                  {spellFeat ? engine.t(spellFeat.label) : (entry.spellId ?? '?')}
                </span>
                <!-- spellType badge (arcane/divine restriction) -->
                <span class="badge-gray shrink-0 capitalize">{entry.spellType}</span>
                <span class="badge-gray shrink-0">
                  {ui('magic.casting.level', engine.settings.language)} {entry.spellLevel}
                </span>
                <span class="badge-accent shrink-0">
                  CL {entry.casterLevel}
                </span>
                {#if !scrollCheck.canUse}
                  <!-- IconClose replaces ✗ symbol (zero-hardcoding rule: use icon barrel, not raw Unicode, ARCHITECTURE.md §6) -->
                  <span class="shrink-0" title={scrollWrongTypeReason(entry.spellType)}>
                    <IconClose size={10} class="text-red-400" aria-hidden="true" />
                  </span>
                {:else if scrollCheck.needsClCheck}
                  <!-- CL check required: DC = scroll.casterLevel + 1 (ARCHITECTURE.md §12.3) -->
                  <span
                    class="text-[10px] text-amber-400 shrink-0"
                    title={ui('magic.scroll.cl_check_tooltip', engine.settings.language).replace('{dc}', String(scrollCheck.checkDC))}
                  >
                    {ui('magic.scroll.cl_check', engine.settings.language).replace('{dc}', String(scrollCheck.checkDC))}
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </section>
  {/if}

  <!-- ── DISCIPLINE FILTER (psionic powers — Extension D) ──────────────── -->
  <!-- Show the discipline filter tab bar for ALL psionic characters (even single-discipline).
       A single-discipline character still benefits from the visual indicator of their
       discipline (e.g. Telepathy, Psychokinesis). Filter "All" is always shown.
       Previously required > 1 discipline — corrected per ARCHITECTURE.md §12. -->
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

        <!-- Spell/power rows within this level -->
        {#each spellsByLevel[level] ?? [] as spell}
          {@const isPsionic = spell.magicType === 'psionic'}
          {@const hasAugmentations = isPsionic && (spell.augmentations?.length ?? 0) > 0}
          {@const steps = augSteps[spell.id] ?? 0}
          {@const baseCost = spellBasePpCost(spell)}
          <!-- getTotalManifestCost() delegates PP addition to engine (zero-game-logic rule, ARCHITECTURE.md §3) -->
          {@const totalCost = engine.getTotalManifestCost(baseCost, spell.augmentations, steps)}
          {@const isExpanded = expandedSpellId === spell.id}

          <!-- Main spell row -->
          <div class="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-surface-alt transition-colors duration-100">
            <span class="flex-1 text-sm text-text-primary truncate">{engine.t(spell.label)}</span>

            <!-- School or psionic discipline (Extension D) -->
            {#if isPsionic && spell.discipline}
              <span class="text-[10px] text-purple-400/80 shrink-0">{disciplineLabel(spell.discipline)}</span>
            {:else}
              <span class="text-[10px] text-text-muted shrink-0">{spell.school}</span>
            {/if}

            <!-- Psionic display badges (Extension D) with suppress-DC tooltip -->
            {#if isPsionic && spell.displays && spell.displays.length > 0}
              <span class="flex gap-0.5 shrink-0" title="{ui('psi.displays_label', engine.settings.language)}: {spell.displays.join(', ')} — suppress {ui('psi.suppress_dc', engine.settings.language).replace('{dc}', String(suppressDC(spell)))}">
                {#each spell.displays as disp}
                  <span class="text-[9px] px-1 py-0.5 rounded font-bold {DISPLAY_COLORS[disp as PsionicDisplay] ?? 'bg-surface-alt text-text-muted'}">
                    {ui(`psi.display.${disp}`, engine.settings.language)}
                  </span>
                {/each}
              </span>
            {/if}

            <!-- Augmentation toggle (psionic only) -->
            {#if hasAugmentations}
              <button
                class="text-[10px] px-1.5 py-0.5 rounded border shrink-0 transition-colors duration-150
                       {isExpanded ? 'border-purple-500/60 bg-purple-700/20 text-purple-300' : 'border-border text-text-muted hover:border-purple-500/40'}"
                onclick={() => toggleSpellExpand(spell.id)}
                type="button"
                aria-expanded={isExpanded}
                title={ui('psi.augment_label', engine.settings.language)}
              >+PP</button>
            {/if}

            <!-- Metamagic rod applicability badge -->
            {#each activeRodEffects as rod}
              {#if level <= rod.maxSpellLevel}
                <!-- IconMagicWand replaces ⚗ symbol for metamagic rod applicability (zero-hardcoding rule, ARCHITECTURE.md §6) -->
                <span
                  class="inline-flex items-center px-1 py-0.5 rounded font-bold bg-purple-900/30 text-purple-400 border border-purple-800/40 shrink-0"
                  title="{rod.label} — {ui('magic.casting.rod_applies', engine.settings.language)}"
                ><IconMagicWand size={9} aria-hidden="true" /></span>
              {/if}
            {/each}

            <button
              class="btn-ghost p-1 text-accent hover:bg-accent/10 shrink-0"
              onclick={() => (modalSpellId = spell.id)}
              aria-label="Details"
              type="button"
            ><IconInfo size={13} aria-hidden="true" /></button>

            {#if engine.spellHasDamageRoll(spell)}
              <button
                class="btn-ghost p-1 text-yellow-500 dark:text-yellow-400 hover:bg-yellow-500/10 shrink-0"
                onclick={() => (diceSpellId = spell.id)}
                aria-label="Roll damage"
                type="button"
              ><IconDiceRoll size={13} aria-hidden="true" /></button>
            {/if}

            <!-- Cast / Manifest button -->
            <button
              class="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition-colors duration-150"
              aria-label="{isPsionic ? 'Manifest' : 'Cast'} {engine.t(spell.label)}"
              type="button"
            >
              {#if isPsionic}
                {ui('magic.casting.manifest', engine.settings.language)} ({totalCost} PP)
              {:else}
                {ui('magic.casting.cast', engine.settings.language)}
              {/if}
            </button>
          </div>

          <!-- ── AUGMENTATION PICKER (psionic powers, expanded state) ────── -->
          {#if isExpanded && hasAugmentations}
            <div class="flex flex-col gap-1.5 px-3 py-2 ml-4 rounded-b border-l border-b border-r border-purple-700/30 bg-purple-950/10">
              <span class="text-[10px] uppercase tracking-wider text-purple-400/80 font-semibold">
                {ui('psi.augment_label', engine.settings.language)}
                <span class="ml-2 text-text-muted">
                  {ui('psi.manifester_level', engine.settings.language)} {engine.phase_manifesterLevel}
                </span>
              </span>

              <!-- PP stepper -->
              <div class="flex items-center gap-2">
                <button
                  class="btn-secondary min-w-[1.5rem] min-h-[1.5rem] p-0 text-sm leading-none"
                  onclick={() => { augSteps[spell.id] = (augSteps[spell.id] ?? 0) - 1; }}
                   disabled={(augSteps[spell.id] ?? 0) <= 0}
                  type="button"
                >−</button>
                <span class="text-sm font-bold text-purple-300 w-6 text-center">{steps}</span>
                <!-- canAddAugmentStep() delegates the D&D PP-cap check to the engine (ARCHITECTURE.md §3) -->
                <button
                  class="btn-secondary min-w-[1.5rem] min-h-[1.5rem] p-0 text-sm leading-none"
                  onclick={() => { augSteps[spell.id] = (augSteps[spell.id] ?? 0) + 1; }}
                  disabled={!engine.canAddAugmentStep(baseCost, augSteps[spell.id] ?? 0, totalCost)}
                  type="button"
                >+</button>
                <span class="text-[10px] text-text-muted ml-2">
                  {ui('psi.pp_total', engine.settings.language).replace('{pp}', String(totalCost))}
                </span>
              </div>

              <!-- Augmentation entries -->
              {#each spell.augmentations ?? [] as aug, i}
                {@const isQualitative = (aug.grantedModifiers?.length ?? 0) === 0}
                <div class="flex flex-col gap-0.5 pl-1 border-l border-purple-700/30">
                  <div class="flex items-center gap-2 text-[11px]">
                    <span class="badge-gray shrink-0">+{aug.costIncrement} PP</span>
                    {#if isQualitative && aug.effectDescription}
                      <!--
                        Qualitative augmentation: no grantedModifiers — effect is described
                        in human-readable text. The effectDescription wins over sourceName per
                        ARCHITECTURE.md §12.3 and CHECKPOINTS.md §2 §9.
                      -->
                      <span class="text-text-secondary">{engine.t(aug.effectDescription)}</span>
                    {:else if aug.grantedModifiers?.length}
                      <!-- Mechanical augmentation: summarise modifiers.
                           engine.resolvePipelineLabel() converts raw targetIds
                           (e.g. "combatStats.attack_bonus") to localised labels.
                           Per ARCHITECTURE.md §6, raw pipeline IDs must never
                           appear as display text in .svelte templates. -->
                      <span class="text-text-secondary">
                        {aug.grantedModifiers.map(m =>
                          `${formatModifier(typeof m.value === 'number' ? m.value : 0)} ${engine.resolvePipelineLabel(m.targetId)}`
                        ).join(', ')}
                      </span>
                    {:else}
                      <span class="text-text-muted italic">{ui('psi.augment_no_desc', engine.settings.language)}</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}

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
