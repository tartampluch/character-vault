<!--
  @file src/lib/components/content-editor/ModifierTypePickerModal.svelte
  @description Modal for picking a ModifierType when building a Modifier.

  PURPOSE:
    GMs authoring homebrew modifiers must specify the bonus TYPE — "enhancement",
    "dodge", "luck", etc.  The type determines stacking behaviour: only the
    highest non-stacking bonus of a given type applies to a pipeline, while
    some types (dodge, circumstance, synergy, untyped, base) always stack.
    Without guidance, GMs unfamiliar with D&D 3.5 stacking rules would often
    choose "untyped" for everything, accidentally breaking game balance.

    This modal exposes all modifier types in a scannable grid, each annotated
    with:
      1. A stacking badge   — ALWAYS STACKS / BEST WINS / SPECIAL — drawn from
         the exact stacking rule in primitives.ts.
      2. A D&D plain-English tooltip  — one sentence explaining what the type
         models, when to use it, and a concrete example.

  STACKING BADGE CATEGORIES:
    ALWAYS STACKS  — base, untyped, dodge, circumstance, synergy, multiplier
    BEST WINS      — armor, deflection, enhancement, insight, luck, morale,
                     natural_armor, profane, racial, resistance, sacred,
                     shield, size, competence, inherent
    SPECIAL        — setAbsolute, damage_reduction, max_dex_cap

  LAYOUT:
    A two-column grid on desktop; single column on mobile.
    Each card shows: type ID (monospace), stacking badge, plain-English label,
    and a tooltip paragraph that expands on hover / focus (using a <details>
    element for keyboard and screen-reader access).

  CALLBACK PROP (Svelte 5):
    onModifierTypePicked(type: ModifierType) — called immediately on card click.
    onclose()                                — called on dismiss.

  @see src/lib/types/primitives.ts  for the ModifierType union and inline docs.
  @see ARCHITECTURE.md §4.x         for stacking rule specifications.
  @see ARCHITECTURE.md §21.4        for the picker modal design specification.
-->

<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';
  import type { ModifierType } from '$lib/types/primitives';

  // ===========================================================================
  // PROPS
  // ===========================================================================

  interface Props {
    /** Called as soon as the GM clicks a modifier type card. */
    onModifierTypePicked: (type: ModifierType) => void;
    /** Called when the GM dismisses without picking. */
    onclose: () => void;
  }

  let { onModifierTypePicked, onclose }: Props = $props();



  // ===========================================================================
  // STACKING BEHAVIOUR CATEGORIES
  // ===========================================================================

  type StackBehavior = 'always-stacks' | 'best-wins' | 'special';

  // ===========================================================================
  // MODIFIER TYPE CATALOG
  // ===========================================================================

  /**
   * Complete record for every ModifierType value, ordered so the most
   * commonly-used types appear first (base, untyped, enhancement, armor…).
   */
  interface ModifierTypeEntry {
    type:    ModifierType;
    /** Short human-readable label shown on the card */
    label:   string;
    stacking: StackBehavior;
    /**
     * One-to-two sentence plain English explanation.
     * Tells the GM: what it models in D&D 3.5, and one example.
     */
    tooltip: string;
  }

  const MODIFIER_TYPES: ModifierTypeEntry[] = [
    // ── ALWAYS STACKS ────────────────────────────────────────────────────────
    {
      type:     'base',
      label:    'Base',
      stacking: 'always-stacks',
      tooltip:  'Foundational value accumulated by class levels (e.g. BAB progression, save totals). '
              + 'Multiple base modifiers stack freely — use for class progression tables and racial HD.',
    },
    {
      type:     'untyped',
      label:    'Untyped',
      stacking: 'always-stacks',
      tooltip:  'A bonus with no declared type — always stacks with everything. '
              + 'Use sparingly: stacking untyped bonuses quickly become unbalanced. '
              + 'Common for minor situational bonuses that have no SRD type.',
    },
    {
      type:     'dodge',
      label:    'Dodge',
      stacking: 'always-stacks',
      tooltip:  'Dodge bonuses to AC always stack with each other — SRD explicit exception. '
              + 'Use for the Dodge feat (+1 AC), Tumble-based dodge, and monk AC bonus.',
    },
    {
      type:     'circumstance',
      label:    'Circumstance',
      stacking: 'always-stacks',
      tooltip:  'Circumstance bonuses (and penalties) always stack. '
              + 'Use for situational modifiers: flanking, higher ground, aid-another, '
              + 'or environmental obstacles.',
    },
    {
      type:     'synergy',
      label:    'Synergy',
      stacking: 'always-stacks',
      tooltip:  '5-rank skill-synergy bonus — always stacks with all other bonus types. '
              + 'Example: 5 ranks in Tumble grant a +2 synergy bonus to Balance.',
    },
    {
      type:     'multiplier',
      label:    'Multiplier',
      stacking: 'always-stacks',
      tooltip:  'Multiplicative factor applied AFTER all additive modifiers are summed. '
              + 'Use for effects like "double Strength to damage" or "half speed". '
              + 'Multiple multipliers stack multiplicatively.',
    },

    // ── BEST WINS ────────────────────────────────────────────────────────────
    {
      type:     'enhancement',
      label:    'Enhancement',
      stacking: 'best-wins',
      tooltip:  'Magic enhancement bonus to an item or natural attribute. '
              + 'Only the highest enhancement bonus applies. '
              + 'A +3 weapon and a +1 Bull\'s Strength cannot both give an enhancement bonus to STR.',
    },
    {
      type:     'armor',
      label:    'Armor',
      stacking: 'best-wins',
      tooltip:  'Armour bonus to AC granted by wearing physical armour. '
              + 'Only the highest armor bonus applies (you cannot benefit from two suits of armour).',
    },
    {
      type:     'shield',
      label:    'Shield',
      stacking: 'best-wins',
      tooltip:  'Shield bonus to AC from wielding a shield. '
              + 'Highest shield bonus wins — you cannot stack a buckler with a tower shield.',
    },
    {
      type:     'natural_armor',
      label:    'Natural Armor',
      stacking: 'best-wins',
      tooltip:  'Natural armour bonus (thick hide, carapace, Barkskin spell). '
              + 'Only the highest natural armor bonus applies. '
              + 'Barkskin does not stack with a creature\'s existing natural armor.',
    },
    {
      type:     'deflection',
      label:    'Deflection',
      stacking: 'best-wins',
      tooltip:  'Deflection bonus to AC from magical force effects. '
              + 'Highest wins — a Ring of Protection +3 and Shield of Faith +2 do not stack.',
    },
    {
      type:     'morale',
      label:    'Morale',
      stacking: 'best-wins',
      tooltip:  'Morale bonus from courage, bardic inspiration, or spells like Heroism. '
              + 'Only the highest morale bonus applies — Heroism and Good Hope do not stack.',
    },
    {
      type:     'luck',
      label:    'Luck',
      stacking: 'best-wins',
      tooltip:  'Luck bonus from divine sources (Divine Favor, Prayer). '
              + 'Highest luck bonus wins — a Cloak of Luck and Divine Favor do not stack on the same roll.',
    },
    {
      type:     'insight',
      label:    'Insight',
      stacking: 'best-wins',
      tooltip:  'Insight bonus to checks, representing knowledge or foresight (Guidance spell). '
              + 'Only the highest insight bonus applies.',
    },
    {
      type:     'sacred',
      label:    'Sacred',
      stacking: 'best-wins',
      tooltip:  'Sacred bonus from holy magic (Bless, Consecrate, divine domains). '
              + 'Only the highest sacred bonus applies to any single statistic.',
    },
    {
      type:     'profane',
      label:    'Profane',
      stacking: 'best-wins',
      tooltip:  'Profane bonus or penalty from unholy/dark magic (Desecrate, Death Knell). '
              + 'Only the highest (or most severe) profane modifier applies per statistic.',
    },
    {
      type:     'racial',
      label:    'Racial',
      stacking: 'best-wins',
      tooltip:  'Racial trait bonus inherent to the creature\'s lineage. '
              + 'Only the highest racial bonus applies per statistic. '
              + 'Do not use for template abilities — use "untyped" or "enhancement" instead.',
    },
    {
      type:     'competence',
      label:    'Competence',
      stacking: 'best-wins',
      tooltip:  'Competence bonus to skills and checks (Guidance, masterwork tools). '
              + 'Only the highest competence bonus to the same check applies.',
    },
    {
      type:     'size',
      label:    'Size',
      stacking: 'best-wins',
      tooltip:  'Size modifier to attack rolls and AC (small creatures get +1, large −1). '
              + 'Only one size modifier applies — size category is always singular.',
    },
    {
      type:     'inherent',
      label:    'Inherent',
      stacking: 'best-wins',
      tooltip:  'Permanent inherent bonus from Tomes, Manuals, Wish, or Miracle. '
              + 'Highest inherent bonus wins (max +5 to any ability score per SRD). '
              + 'Stacks with enhancement and all other types.',
    },
    {
      type:     'resistance',
      label:    'Resistance',
      stacking: 'best-wins',
      tooltip:  'Resistance bonus to saving throws (Cloak of Resistance, Resistance spell). '
              + 'Only the highest resistance bonus to the same save applies.',
    },

    // ── SPECIAL ──────────────────────────────────────────────────────────────
    {
      type:     'setAbsolute',
      label:    'Set Absolute',
      stacking: 'special',
      tooltip:  'Forces the pipeline to an exact value, overriding all other modifiers. '
              + 'Last-in-chain wins. Use for Undead (CON = 0), Shapechange (stat set to animal form), '
              + 'or GM fiat ("set HP to exactly 200").',
    },
    {
      type:     'damage_reduction',
      label:    'Damage Reduction',
      stacking: 'special',
      tooltip:  'D&D 3.5 DR — best-wins per bypass-tag group. '
              + 'Use for racial/innate/template DR; set drBypassTags to the bypass material. '
              + 'For class-progression DR that adds incrementally, use "base" instead.',
    },
    {
      type:     'max_dex_cap',
      label:    'Max DEX Cap',
      stacking: 'special',
      tooltip:  'Sets a maximum DEX-to-AC cap imposed by armor or conditions. '
              + 'Multiple caps compete with MINIMUM-WINS semantics (most restrictive wins). '
              + 'Meaningful only on the combatStats.max_dex_bonus pipeline.',
    },
  ];

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

  interface BadgeMeta { label: string; classes: string }

  const BADGE: Record<StackBehavior, BadgeMeta> = {
    'always-stacks': {
      label:   'ALWAYS STACKS',
      classes: 'bg-green-900/40 text-green-400 border-green-700/50',
    },
    'best-wins': {
      label:   'BEST WINS',
      classes: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
    },
    'special': {
      label:   'SPECIAL',
      classes: 'bg-purple-900/40 text-purple-300 border-purple-700/50',
    },
  };
</script>

<Modal
  open={true}
  onClose={onclose}
  title="Pick Modifier Type"
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
            {meta.label}
          </span>
        {/each}
        <span class="text-text-muted self-center">— stacking behaviour in the pipeline</span>
      </div>

      <!-- ================================================================ -->
      <!-- SEARCH                                                             -->
      <!-- ================================================================ -->
      <div class="relative">
        <label for="modtype-search" class="sr-only">Search modifier types</label>
        <input
          id="modtype-search"
          type="search"
          class="input w-full pl-9"
          placeholder="Search by name or description…"
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
          No modifier types match "{searchQuery}".
        </p>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          {#each filtered as entry (entry.type)}
            {@const badge = BADGE[entry.stacking]}

            <!--
              Each card is a <button> for full keyboard and pointer interactivity.
              Clicking anywhere on the card confirms the selection.
              The <details> tooltip inside does NOT confirm — its click is stopped.
            -->
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
                  {badge.label}
                </span>
              </div>

              <!-- Row 2: human-readable label -->
              <p class="text-xs font-medium text-text-secondary">
                {entry.label}
              </p>

              <!-- Row 3: tooltip — always visible (1–2 sentences; seeing all
                          descriptions at once is helpful in a reference grid) -->
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
