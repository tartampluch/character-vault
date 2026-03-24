<!--
  @file src/lib/components/content-editor/EntityTypeSelector.svelte
  @description Card grid for picking a FeatureCategory when creating a new entity.

  Renders all 11 FeatureCategory values as clickable cards.
  Each card shows a category-appropriate SVG icon and a one-line D&D description.
  Clicking a card calls onCategorySelected(category).
-->

<script lang="ts">
  import type { FeatureCategory } from '$lib/types/feature';

  interface Props {
    onCategorySelected: (cat: FeatureCategory) => void;
  }

  let { onCategorySelected }: Props = $props();

  interface CategoryCard {
    category: FeatureCategory;
    label:    string;
    desc:     string;
    color:    string;  // Tailwind border + accent colour classes
  }

  const CARDS: CategoryCard[] = [
    { category: 'race',          label: 'Race',           color: 'border-green-700/50 hover:bg-green-900/20',
      desc: 'Species traits, ability score bonuses, racial class skills (Human, Elf, Dwarf…)' },
    { category: 'class',         label: 'Class',          color: 'border-blue-700/50 hover:bg-blue-900/20',
      desc: 'Hit die, skill points, BAB/save progressions, class feature grants (Fighter, Wizard…)' },
    { category: 'class_feature', label: 'Class Feature',  color: 'border-blue-600/40 hover:bg-blue-900/15',
      desc: 'Abilities granted by a class at specific levels (Sneak Attack, Barbarian Rage…)' },
    { category: 'feat',          label: 'Feat',           color: 'border-yellow-700/50 hover:bg-yellow-900/20',
      desc: 'Player-chosen abilities at character creation or bonus feat levels (Power Attack…)' },
    { category: 'magic',         label: 'Spell / Power',  color: 'border-purple-700/50 hover:bg-purple-900/20',
      desc: 'Arcane / divine spells or psionic powers with school, components, and spell lists' },
    { category: 'item',          label: 'Item',           color: 'border-cyan-700/40 hover:bg-cyan-900/15',
      desc: 'Equipment, weapons, armour, magic rings, charged items, wands, staves, scrolls…' },
    { category: 'deity',         label: 'Deity',          color: 'border-amber-700/40 hover:bg-amber-900/15',
      desc: 'Divine patron with domains, favoured weapon, and alignment-restriction modifiers' },
    { category: 'domain',        label: 'Domain',         color: 'border-teal-700/40 hover:bg-teal-900/15',
      desc: 'Cleric domain granting bonus spells per day and a domain power (Fire Domain…)' },
    { category: 'condition',     label: 'Condition',      color: 'border-red-700/40 hover:bg-red-900/15',
      desc: 'Status effects with stat penalties, action budget restrictions (Stunned, Blinded…)' },
    { category: 'monster_type',  label: 'Monster Type',   color: 'border-red-800/30 hover:bg-red-900/10',
      desc: 'Creature type traits shared across multiple monsters (Undead, Dragon, Construct…)' },
    { category: 'environment',   label: 'Environment',    color: 'border-amber-800/30 hover:bg-amber-900/10',
      desc: 'Terrain or environmental conditions granting modifiers (Arctic Cold, Underwater…)' },
  ];
</script>

<div class="flex flex-col gap-3">
  <p class="text-sm text-text-muted">
    Choose the entity type you want to create. This determines which editor sections are shown.
  </p>

  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
    {#each CARDS as card (card.category)}
      <button
        type="button"
        class="flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors
               cursor-pointer {card.color}
               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        onclick={() => onCategorySelected(card.category)}
      >
        <span class="text-sm font-bold text-text-primary">{card.label}</span>
        <span class="text-xs text-text-muted leading-snug">{card.desc}</span>
      </button>
    {/each}
  </div>
</div>
