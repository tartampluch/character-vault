<!--
  @file src/lib/components/magic/SpellRowItem.svelte
  @description A single spell/power row in CastingPanel — name, school badge,
  psionic display badges, augmentation stepper, info/dice/cast buttons.
  Extracted from CastingPanel.svelte as part of F3b refactoring.

  Props:
    spell         — MagicFeature being displayed
    augStep       — current augmentation increment count (managed by parent)
    isExpanded    — whether the augmentation picker is expanded (managed by parent)
    spellLevel    — the resolved spell level (for the Cast/save-DC context)
    onAugChange   — callback when augmentation steps change
    onToggleExpand — callback to toggle augmentation picker expansion
    onCast        — callback when Cast/Manifest button is clicked
    onInfo        — callback when Info button is clicked
    onDice        — callback when Dice button is clicked
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { formatModifier } from '$lib/utils/formatters';
  import { IconInfo, IconDiceRoll, IconMagicWand } from '$lib/components/ui/icons';
  import type { MagicFeature, PsionicDisplay } from '$lib/types/feature';
  import { MAGIC_TYPE_PSIONIC } from '$lib/utils/constants';

  let {
    spell,
    augStep      = 0,
    isExpanded   = false,
    spellLevel,
    activeRodEffects = [],
    onAugChange,
    onToggleExpand,
    onCast,
    onInfo,
    onDice,
  }: {
    spell:            MagicFeature;
    augStep:          number;
    isExpanded:       boolean;
    spellLevel:       number;
    activeRodEffects: Array<{ label: string; feat: string; maxSpellLevel: number }>;
    onAugChange:      (n: number) => void;
    onToggleExpand:   () => void;
    onCast:           () => void;
    onInfo:           () => void;
    onDice?:          () => void;
  } = $props();

  const isPsionic        = $derived(spell.magicType === MAGIC_TYPE_PSIONIC);
  const hasAugmentations = $derived(isPsionic && (spell.augmentations?.length ?? 0) > 0);

  /** Short abbreviation badges for psionic displays */
  const DISPLAY_COLORS: Record<PsionicDisplay, string> = {
    auditory:  'bg-yellow-700/40 text-yellow-300',
    material:  'bg-slate-700/40  text-slate-300',
    mental:    'bg-purple-700/40 text-purple-300',
    olfactory: 'bg-lime-700/40   text-lime-300',
    visual:    'bg-sky-700/40    text-sky-300',
  };

  /** Localised display name for a discipline */
  function disciplineLabel(d: MagicFeature['discipline']): string {
    if (!d) return '';
    const key = `psi.discipline.${d}` as const;
    return ui(key, engine.settings.language);
  }

  /**
   * Returns a localized, comma-separated list of psionic display mode names.
   */
  function displayNamesLocalized(displays: PsionicDisplay[]): string {
    return displays.map(d => ui(`psi.display.${d}`, engine.settings.language)).join(', ');
  }

  /**
   * Returns the Concentration check DC to suppress a psionic power's displays.
   */
  function suppressDC(s: MagicFeature): number {
    return engine.getPsionicSuppressDC(s.spellLists);
  }

  function spellBasePpCost(s: MagicFeature): number {
    return (s as MagicFeature & { basePpCost?: number }).basePpCost ?? 1;
  }

  const baseCost  = $derived(spellBasePpCost(spell));
  const totalCost = $derived(engine.getTotalManifestCost(baseCost, spell.augmentations, augStep));
</script>

<!-- Main spell row -->
<div class="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-surface-alt transition-colors duration-100">
  <span class="flex-1 text-sm text-text-primary truncate">{engine.t(spell.label)}</span>

  <!-- School or psionic discipline (Extension D) -->
  {#if isPsionic && spell.discipline}
    <span class="text-[10px] text-purple-400/80 shrink-0">{disciplineLabel(spell.discipline)}</span>
  {:else}
    <!-- magic.school.* keys translate the school identifier to a localised label
         (zero-hardcoding rule, ARCHITECTURE.md §6 — same pattern as magic.type.* in
         Grimoire.svelte). Falls back to the raw string for custom/unknown schools. -->
    <span class="text-[10px] text-text-muted shrink-0">{ui(`magic.school.${spell.school}`, engine.settings.language) || spell.school}</span>
  {/if}

  <!-- Psionic display badges (Extension D) with suppress-DC tooltip -->
  {#if isPsionic && spell.displays && spell.displays.length > 0}
    <span class="flex gap-0.5 shrink-0" title="{ui('psi.displays_label', engine.settings.language)}: {displayNamesLocalized(spell.displays)} — suppress {ui('psi.suppress_dc', engine.settings.language).replace('{dc}', String(suppressDC(spell)))}">
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
       onclick={onToggleExpand}
       type="button"
       aria-expanded={isExpanded}
       title={ui('psi.augment_label', engine.settings.language)}
     >{ui('psi.augment_label', engine.settings.language)}</button>
  {/if}

  <!-- Metamagic rod applicability badge -->
  {#each activeRodEffects as rod}
    {#if spellLevel <= rod.maxSpellLevel}
      <!-- IconMagicWand replaces ⚗ symbol for metamagic rod applicability (zero-hardcoding rule, ARCHITECTURE.md §6) -->
      <span
        class="inline-flex items-center px-1 py-0.5 rounded font-bold bg-purple-900/30 text-purple-400 border border-purple-800/40 shrink-0"
        title="{rod.label} — {ui('magic.casting.rod_applies', engine.settings.language)}"
      ><IconMagicWand size={9} aria-hidden="true" /></span>
    {/if}
  {/each}

  <button
    class="btn-ghost p-1 text-accent hover:bg-accent/10 shrink-0"
    onclick={onInfo}
    aria-label={ui('magic.casting.details_short', engine.settings.language)}
    type="button"
  ><IconInfo size={13} aria-hidden="true" /></button>

  {#if onDice && engine.spellHasDamageRoll(spell)}
    <button
      class="btn-ghost p-1 text-yellow-500 dark:text-yellow-400 hover:bg-yellow-500/10 shrink-0"
      onclick={onDice}
      aria-label={ui('magic.casting.roll_damage_aria', engine.settings.language)}
      type="button"
    ><IconDiceRoll size={13} aria-hidden="true" /></button>
  {/if}

  <!-- Cast / Manifest button -->
  <button
    class="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition-colors duration-150"
    aria-label={isPsionic
      ? ui('magic.casting.manifest_aria', engine.settings.language).replace('{name}', engine.t(spell.label)).replace('{pp}', String(totalCost))
      : ui('magic.casting.cast_aria', engine.settings.language).replace('{name}', engine.t(spell.label))}
    onclick={onCast}
    type="button"
  >
    {#if isPsionic}
      <!-- psi.pp_cost = '{pp} PP' — keeps "PP" out of template as a hardcoded D&D abbreviation (ARCHITECTURE.md §6) -->
      {ui('magic.casting.manifest', engine.settings.language)} ({ui('psi.pp_cost', engine.settings.language).replace('{pp}', String(totalCost))})
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
        onclick={() => onAugChange(augStep - 1)}
         disabled={augStep <= 0}
        type="button"
      >−</button>
      <span class="text-sm font-bold text-purple-300 w-6 text-center">{augStep}</span>
      <!-- canAddAugmentStep() delegates the D&D PP-cap check to the engine (ARCHITECTURE.md §3) -->
      <button
        class="btn-secondary min-w-[1.5rem] min-h-[1.5rem] p-0 text-sm leading-none"
        onclick={() => onAugChange(augStep + 1)}
        disabled={!engine.canAddAugmentStep(baseCost, augStep, totalCost)}
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
          <!-- psi.pp_cost replaces hardcoded "PP" abbreviation (ARCHITECTURE.md §6 zero-hardcoding rule) -->
          <span class="badge-gray shrink-0">{ui('psi.pp_cost', engine.settings.language).replace('{pp}', `+${aug.costIncrement}`)}</span>
          {#if isQualitative && aug.effectDescription}
            <!--
              Qualitative augmentation: no grantedModifiers — effect is described
              in human-readable text. The effectDescription wins over sourceName per
              ARCHITECTURE.md §12.3 and CHECKPOINTS.md §2 §9.
            -->
            <span class="text-text-secondary">{engine.t(aug.effectDescription)}</span>
          {:else if aug.grantedModifiers?.length}
            <!-- Mechanical augmentation: summarise modifiers. -->
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
