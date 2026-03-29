<!--
  @file src/lib/components/magic/MagicItemsCastingSubpanel.svelte
  @description Magic Items sub-panel for CastingPanel — shows equipped wands, staves,
  scrolls, and metamagic rods with their casting info.
  Extracted from CastingPanel.svelte as part of F3a refactoring.

  Props:
    equippedItems: ItemFeature[]  — equipped casting items (derived by parent)
    onCastWand?   — optional callback for future wand-cast button
    onCastStaff?  — optional callback for future staff-cast button
    onCastScroll? — optional callback for future scroll-cast button
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { ui } from '$lib/i18n/ui-strings';
  import { IconInfo, IconClose, IconMagicWand } from '$lib/components/ui/icons';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import type { ItemFeature } from '$lib/types/feature';
  import type { ID } from '$lib/types/primitives';

  let {
    equippedItems,
    onCastWand   = undefined,
    onCastStaff  = undefined,
    onCastScroll = undefined,
  }: {
    equippedItems: ItemFeature[];
    onCastWand?:   (wandId: ID) => void;
    onCastStaff?:  (staffId: ID, spellIndex: number) => void;
    onCastScroll?: (scrollId: ID, spellIndex: number) => void;
  } = $props();

  // Derive sub-lists from equippedItems
  const equippedMetamagicRods = $derived(equippedItems.filter(f => f.metamagicEffect));
  const equippedStaves        = $derived(equippedItems.filter(f => f.staffSpells?.length));
  const equippedWands         = $derived(equippedItems.filter(f => f.wandSpell));
  const equippedScrolls       = $derived(equippedItems.filter(f => f.scrollSpells?.length));

  const activeRodEffects = $derived(
    equippedMetamagicRods.map(rod => ({
      label: engine.t(rod.label),
      feat: rod.metamagicEffect!.feat,
      maxSpellLevel: rod.metamagicEffect!.maxSpellLevel,
    }))
  );

  /**
   * Returns a localised reason string for why a scroll cannot be cast.
   */
  function scrollWrongTypeReason(spellType: 'arcane' | 'divine'): string {
    return ui('magic.scroll.wrong_type', engine.settings.language).replace('{type}', spellType);
  }

  let modalSpellId = $state<ID | null>(null);
</script>

{#if modalSpellId}
  <FeatureModal featureId={modalSpellId} onclose={() => (modalSpellId = null)} />
{/if}

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
                aria-label={ui('magic.casting.staff_details_aria', engine.settings.language)}
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
              <!-- spellType badge (arcane/divine restriction) — resolved via ui() so
                   raw identifiers ('arcane'/'divine') never appear as display text
                   (zero-hardcoding rule, ARCHITECTURE.md §6). -->
              <span class="badge-gray shrink-0">{ui(`magic.type.${entry.spellType}`, engine.settings.language)}</span>
              <span class="badge-gray shrink-0">
                {ui('magic.casting.level', engine.settings.language)} {entry.spellLevel}
              </span>
              <!-- Caster level badge re-uses magic.casting.wand_cl ('CL {cl}') key;
                   'CL' is a universal D&D magic abbreviation (ARCHITECTURE.md §6). -->
              <span class="badge-accent shrink-0">
                {ui('magic.casting.wand_cl', engine.settings.language).replace('{cl}', String(entry.casterLevel))}
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
