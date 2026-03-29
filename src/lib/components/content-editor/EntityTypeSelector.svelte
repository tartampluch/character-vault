<!--
  @file src/lib/components/content-editor/EntityTypeSelector.svelte
  @description Card grid for picking a FeatureCategory when creating a new entity.
-->

<script lang="ts">
  import type { FeatureCategory } from '$lib/types/feature';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';

  interface Props {
    onCategorySelected: (cat: FeatureCategory) => void;
  }

  let { onCategorySelected }: Props = $props();
  const lang = $derived(engine.settings.language);

  interface CategoryCard {
    category:  FeatureCategory;
    labelKey:  string;
    descKey:   string;
    color:     string;
  }

  const CARDS: CategoryCard[] = [
    { category: 'race',          labelKey: 'editor.category.race',          color: 'border-green-700/50 hover:bg-green-900/20',
      descKey: 'editor.type_selector.race_desc' },
    { category: 'class',         labelKey: 'editor.category.class',         color: 'border-blue-700/50 hover:bg-blue-900/20',
      descKey: 'editor.type_selector.class_desc' },
    { category: 'class_feature', labelKey: 'editor.category.class_feature', color: 'border-blue-600/40 hover:bg-blue-900/15',
      descKey: 'editor.type_selector.class_feature_desc' },
    { category: 'feat',          labelKey: 'editor.category.feat',          color: 'border-yellow-700/50 hover:bg-yellow-900/20',
      descKey: 'editor.type_selector.feat_desc' },
    { category: 'magic',         labelKey: 'editor.category.magic',         color: 'border-purple-700/50 hover:bg-purple-900/20',
      descKey: 'editor.type_selector.magic_desc' },
    { category: 'item',          labelKey: 'editor.category.item',          color: 'border-cyan-700/40 hover:bg-cyan-900/15',
      descKey: 'editor.type_selector.item_desc' },
    { category: 'deity',         labelKey: 'editor.category.deity',         color: 'border-amber-700/40 hover:bg-amber-900/15',
      descKey: 'editor.type_selector.deity_desc' },
    { category: 'domain',        labelKey: 'editor.category.domain',        color: 'border-teal-700/40 hover:bg-teal-900/15',
      descKey: 'editor.type_selector.domain_desc' },
    { category: 'condition',     labelKey: 'editor.category.condition',     color: 'border-red-700/40 hover:bg-red-900/15',
      descKey: 'editor.type_selector.condition_desc' },
    { category: 'monster_type',  labelKey: 'editor.category.monster_type',  color: 'border-red-800/30 hover:bg-red-900/10',
      descKey: 'editor.type_selector.monster_type_desc' },
    { category: 'environment',   labelKey: 'editor.category.environment',   color: 'border-amber-800/30 hover:bg-amber-900/10',
      descKey: 'editor.type_selector.environment_desc' },
  ];
</script>

<div class="flex flex-col gap-3">
  <p class="text-sm text-text-muted">
    {ui('editor.type_selector.choose_hint', lang)}
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
        <span class="text-sm font-bold text-text-primary">{ui(card.labelKey, lang)}</span>
        <span class="text-xs text-text-muted leading-snug">{ui(card.descKey, lang)}</span>
      </button>
    {/each}
  </div>
</div>
