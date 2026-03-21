<!--
  @file src/lib/components/vault/CharacterCard.svelte
  @description A responsive character card for the Vault grid.
  Phase 19.12: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT (vertical stack):
    - Poster image (180px) or themed gradient placeholder with character/NPC icon.
    - NPC badge (absolute, top-right overlay).
    - Card body: name, subtitle, level badge.

  NPC styling:
    - PC cards: accent hover border + purple shadow.
    - NPC cards: red hover border + red shadow.
    - NPC placeholder: red-tinted gradient instead of purple.
-->

<script lang="ts">
  import type { Character } from '$lib/types/character';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { IconNPC, IconCharacter } from '$lib/components/ui/icons';

  interface Props {
    character: Character;
    onclick?: () => void;
  }

  let { character, onclick }: Props = $props();

  const characterLevel = $derived(
    Object.values(character.classLevels).reduce((sum, lvl) => sum + lvl, 0)
  );

  const subtitle = $derived.by(() => {
    if (character.customSubtitle) return character.customSubtitle;
    if (character.isNPC) {
      const raceInstance = character.activeFeatures.find(fi => {
        const feature = dataLoader.getFeature(fi.featureId);
        return feature?.category === 'race';
      });
      if (raceInstance) {
        const raceFeature = dataLoader.getFeature(raceInstance.featureId);
        if (raceFeature) return engine.t(raceFeature.label);
      }
      return engine.t({ en: 'NPC', fr: 'PNJ' });
    }
    if (character.playerRealName) return character.playerRealName;
    return '';
  });

  const isNPC = $derived(character.isNPC);

  const ariaLabel = $derived(
    `${character.name}${subtitle ? ', ' + subtitle : ''}, Level ${characterLevel}`
  );
</script>

<button
  class="group flex flex-col text-left w-full rounded-xl border overflow-hidden
         transition-all duration-200
         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50
         {isNPC
           ? 'border-red-900/50 bg-surface hover:border-red-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-red-500/15'
           : 'border-border bg-surface hover:border-accent hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent/15'}"
  {onclick}
  aria-label={ariaLabel}
  type="button"
>
  <!-- Poster image / placeholder -->
  <div class="relative w-full h-44 shrink-0 overflow-hidden">
    {#if character.posterUrl}
      <img
        src={character.posterUrl}
        alt={character.name}
        class="w-full h-full object-cover"
        loading="lazy"
        width="300"
        height="176"
      />
    {:else}
      <div
        class="w-full h-full flex items-center justify-center"
        style="background: {isNPC
          ? 'linear-gradient(135deg, oklch(22% 0.08 28) 0%, oklch(28% 0.14 28) 60%, oklch(18% 0.08 28) 100%)'
          : 'linear-gradient(135deg, oklch(25% 0.08 280) 0%, oklch(30% 0.15 280) 60%, oklch(20% 0.10 280) 100%)'};"
        aria-hidden="true"
      >
        {#if isNPC}
          <IconNPC size={52} class="opacity-35 text-red-400" />
        {:else}
          <IconCharacter size={52} class="opacity-35 text-accent" />
        {/if}
      </div>
    {/if}

    <!-- NPC badge -->
    {#if isNPC}
      <span
        class="absolute top-2 right-2 bg-red-700/85 text-white text-[10px] font-bold
               uppercase tracking-wider px-1.5 py-0.5 rounded pointer-events-none"
        aria-hidden="true"
      >NPC</span>
    {/if}
  </div>

  <!-- Card body -->
  <div class="flex flex-col gap-1 p-3 flex-1">
    <!-- Character name -->
    <h3 class="text-sm font-semibold text-text-primary truncate">
      {character.name}
    </h3>

    <!-- Subtitle -->
    {#if subtitle}
      <p class="text-xs text-text-muted truncate">{subtitle}</p>
    {/if}

    <!-- Level badge (pinned to bottom via mt-auto) -->
    <div class="flex items-baseline gap-1 mt-auto pt-2">
      <span class="text-[10px] uppercase tracking-wider text-text-muted">Lv.</span>
      <span class="text-base font-bold {isNPC ? 'text-red-400' : 'text-accent'}">
        {characterLevel}
      </span>
    </div>
  </div>
</button>
