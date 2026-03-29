<!--
  @file src/lib/components/content-editor/ModifierTypePickerModal.svelte
  @description Modal for picking a ModifierType when building a Modifier.
-->

<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import type { ModifierType } from '$lib/types/primitives';

  interface Props {
    onModifierTypePicked: (type: ModifierType) => void;
    onclose: () => void;
  }

  let { onModifierTypePicked, onclose }: Props = $props();
  const lang = $derived(engine.settings.language);

  type StackBehavior = 'always-stacks' | 'best-wins' | 'special';

  interface ModifierTypeEntry {
    type:    ModifierType;
    labelKey: string;
    stacking: StackBehavior;
    tooltipKey: string;
  }

  // Static structure — labels and tooltips resolved reactively via $derived below
  const MODIFIER_TYPE_DEFS: ModifierTypeEntry[] = [
    // ── ALWAYS STACKS ────────────────────────────────────────────────────────
    { type: 'base',             stacking: 'always-stacks', labelKey: 'editor.modtype.base.label',             tooltipKey: 'editor.modtype.base.tooltip' },
    { type: 'untyped',          stacking: 'always-stacks', labelKey: 'editor.modtype.untyped.label',          tooltipKey: 'editor.modtype.untyped.tooltip' },
    { type: 'dodge',            stacking: 'always-stacks', labelKey: 'editor.modtype.dodge.label',            tooltipKey: 'editor.modtype.dodge.tooltip' },
    { type: 'circumstance',     stacking: 'always-stacks', labelKey: 'editor.modtype.circumstance.label',     tooltipKey: 'editor.modtype.circumstance.tooltip' },
    { type: 'synergy',          stacking: 'always-stacks', labelKey: 'editor.modtype.synergy.label',          tooltipKey: 'editor.modtype.synergy.tooltip' },
    { type: 'multiplier',       stacking: 'always-stacks', labelKey: 'editor.modtype.multiplier.label',       tooltipKey: 'editor.modtype.multiplier.tooltip' },
    // ── BEST WINS ────────────────────────────────────────────────────────────
    { type: 'enhancement',      stacking: 'best-wins',     labelKey: 'editor.modtype.enhancement.label',      tooltipKey: 'editor.modtype.enhancement.tooltip' },
    { type: 'armor',            stacking: 'best-wins',     labelKey: 'editor.modtype.armor.label',            tooltipKey: 'editor.modtype.armor.tooltip' },
    { type: 'shield',           stacking: 'best-wins',     labelKey: 'editor.modtype.shield.label',           tooltipKey: 'editor.modtype.shield.tooltip' },
    { type: 'natural_armor',    stacking: 'best-wins',     labelKey: 'editor.modtype.natural_armor.label',    tooltipKey: 'editor.modtype.natural_armor.tooltip' },
    { type: 'deflection',       stacking: 'best-wins',     labelKey: 'editor.modtype.deflection.label',       tooltipKey: 'editor.modtype.deflection.tooltip' },
    { type: 'morale',           stacking: 'best-wins',     labelKey: 'editor.modtype.morale.label',           tooltipKey: 'editor.modtype.morale.tooltip' },
    { type: 'luck',             stacking: 'best-wins',     labelKey: 'editor.modtype.luck.label',             tooltipKey: 'editor.modtype.luck.tooltip' },
    { type: 'insight',          stacking: 'best-wins',     labelKey: 'editor.modtype.insight.label',          tooltipKey: 'editor.modtype.insight.tooltip' },
    { type: 'sacred',           stacking: 'best-wins',     labelKey: 'editor.modtype.sacred.label',           tooltipKey: 'editor.modtype.sacred.tooltip' },
    { type: 'profane',          stacking: 'best-wins',     labelKey: 'editor.modtype.profane.label',          tooltipKey: 'editor.modtype.profane.tooltip' },
    { type: 'racial',           stacking: 'best-wins',     labelKey: 'editor.modtype.racial.label',           tooltipKey: 'editor.modtype.racial.tooltip' },
    { type: 'competence',       stacking: 'best-wins',     labelKey: 'editor.modtype.competence.label',       tooltipKey: 'editor.modtype.competence.tooltip' },
    { type: 'size',             stacking: 'best-wins',     labelKey: 'editor.modtype.size.label',             tooltipKey: 'editor.modtype.size.tooltip' },
    { type: 'inherent',         stacking: 'best-wins',     labelKey: 'editor.modtype.inherent.label',         tooltipKey: 'editor.modtype.inherent.tooltip' },
    { type: 'resistance',       stacking: 'best-wins',     labelKey: 'editor.modtype.resistance.label',       tooltipKey: 'editor.modtype.resistance.tooltip' },
    // ── SPECIAL ──────────────────────────────────────────────────────────────
    { type: 'setAbsolute',      stacking: 'special',       labelKey: 'editor.modtype.setAbsolute.label',      tooltipKey: 'editor.modtype.setAbsolute.tooltip' },
    { type: 'damage_reduction', stacking: 'special',       labelKey: 'editor.modtype.damage_reduction.label', tooltipKey: 'editor.modtype.damage_reduction.tooltip' },
    { type: 'max_dex_cap',      stacking: 'special',       labelKey: 'editor.modtype.max_dex_cap.label',      tooltipKey: 'editor.modtype.max_dex_cap.tooltip' },
  ];

  // Resolve translated strings reactively
  const MODIFIER_TYPES = $derived(
    MODIFIER_TYPE_DEFS.map(d => ({
      type:    d.type,
      stacking: d.stacking,
      label:   ui(d.labelKey, lang),
      tooltip: ui(d.tooltipKey, lang),
    }))
  );

  // ===========================================================================
  // SEARCH
  // ===========================================================================

  let searchQuery = $state('');
  const searchLower = $derived(searchQuery.toLowerCase().trim());

  const filtered = $derived(
    searchLower
      ? MODIFIER_TYPES.filter(
          e =>
            e.type.toLowerCase().includes(searchLower) ||
            e.label.toLowerCase().includes(searchLower) ||
            e.tooltip.toLowerCase().includes(searchLower)
        )
      : MODIFIER_TYPES
  );

  // ===========================================================================
  // STACKING BADGE STYLE
  // ===========================================================================

  interface BadgeMeta { labelKey: string; classes: string }

  const BADGE: Record<StackBehavior, BadgeMeta> = {
    'always-stacks': {
      labelKey: 'editor.modtype_picker.badge_always_stacks',
      classes:  'bg-green-900/40 text-green-400 border-green-700/50',
    },
    'best-wins': {
      labelKey: 'editor.modtype_picker.badge_best_wins',
      classes:  'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
    },
    'special': {
      labelKey: 'editor.modtype_picker.badge_special',
      classes:  'bg-purple-900/40 text-purple-300 border-purple-700/50',
    },
  };
</script>

<Modal
  open={true}
  onClose={onclose}
  title={ui('editor.modtype_picker.title', lang)}
  size="2xl"
  fullscreen={true}
>
  {#snippet children()}
    <div class="flex flex-col gap-4">

      <!-- ================================================================ -->
      <!-- LEGEND                                                             -->
      <!-- ================================================================ -->
      <div class="flex flex-wrap gap-2 text-[10px]">
        {#each Object.entries(BADGE) as [, meta]}
          <span class="border {meta.classes} font-bold uppercase tracking-wider px-2 py-0.5 rounded">
            {ui(meta.labelKey, lang)}
          </span>
        {/each}
        <span class="text-text-muted self-center">{ui('editor.modtype_picker.stacking_hint', lang)}</span>
      </div>

      <!-- ================================================================ -->
      <!-- SEARCH                                                             -->
      <!-- ================================================================ -->
      <div class="relative">
        <label for="modtype-search" class="sr-only">{ui('editor.modtype_picker.search_aria', lang)}</label>
        <input
          id="modtype-search"
          type="search"
          class="input w-full pl-9"
          placeholder={ui('editor.modtype_picker.search_placeholder', lang)}
          bind:value={searchQuery}
          autocomplete="off"
          spellcheck="false"
        />
        <svg
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted"
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>

      <!-- ================================================================ -->
      <!-- GRID                                                               -->
      <!-- ================================================================ -->
      {#if filtered.length === 0}
        <p class="py-6 text-center text-sm text-text-muted italic">
          {ui('editor.modtype_picker.no_match', lang).replace('{query}', searchQuery)}
        </p>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          {#each filtered as entry (entry.type)}
            {@const badge = BADGE[entry.stacking]}

            <button
              type="button"
              class="group flex flex-col gap-2 rounded-lg border border-border bg-surface
                     p-4 text-left transition-colors
                     hover:border-accent/60 hover:bg-accent/5
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              onclick={() => onModifierTypePicked(entry.type)}
            >
              <!-- Row 1: type ID + stacking badge -->
              <div class="flex items-center gap-2 flex-wrap">
                <code class="font-mono text-sm font-semibold text-text-primary group-hover:text-accent
                             transition-colors">
                  {entry.type}
                </code>
                <span class="border {badge.classes} text-[9px] font-bold uppercase
                             tracking-wider px-1.5 py-0.5 rounded shrink-0">
                  {ui(badge.labelKey, lang)}
                </span>
              </div>

              <!-- Row 2: human-readable label -->
              <p class="text-xs font-medium text-text-secondary">
                {entry.label}
              </p>

              <!-- Row 3: tooltip -->
              <p class="text-xs text-text-muted leading-relaxed">
                {entry.tooltip}
              </p>
            </button>
          {/each}
        </div>
      {/if}

    </div>
  {/snippet}
</Modal>
