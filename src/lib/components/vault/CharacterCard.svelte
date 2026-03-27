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
  import { getCharacterLevel } from '$lib/utils/formatters';
  import { ui } from '$lib/i18n/ui-strings';
  import { IconNPC, IconCharacter, IconDelete } from '$lib/components/ui/icons';

  const lang = $derived(engine.settings.language);

  interface Props {
    character: Character;
    onclick?: () => void;
    /** Called when the user confirms deletion. Undefined = no delete button shown. */
    ondelete?: () => void;
  }

  let { character, onclick, ondelete }: Props = $props();

  // getCharacterLevel() from formatters.ts keeps the D&D character-level formula
  // (Object.values(classLevels).reduce) out of the .svelte file (ARCHITECTURE.md §3).
  const characterLevel = $derived(getCharacterLevel(character.classLevels));

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
      return ui('common.npc', lang);
    }
    if (character.playerName) return character.playerName;
    return '';
  });

  const isNPC = $derived(character.isNPC);

  // Zero-hardcoding rule: use ui() for all visible text including aria-labels.
  // ui('vault.level_abbr') = 'Lv.' (en) / 'Nv.' (fr).
  const ariaLabel = $derived(
    `${character.name}${subtitle ? ', ' + subtitle : ''}, ${ui('vault.level_abbr', lang)} ${characterLevel}`
  );
</script>

<!--
  Outer wrapper is a <div> so we can place the delete button as a true sibling
  of the main click target — avoids the invalid nested <button> HTML.
-->
<div
  class="group relative flex flex-col w-full rounded-xl border overflow-hidden
         transition-all duration-200
         {isNPC
           ? 'border-red-900/50 bg-surface hover:border-red-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-red-500/15'
           : 'border-border bg-surface hover:border-accent hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent/15'}"
>
  <!-- Main click target: opens the character sheet -->
  <button
    class="flex flex-col text-left w-full focus-visible:outline-none
           focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-inset"
    onclick={onclick}
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
        <!--
          Placeholder gradient (no poster URL): uses Tailwind light/dark utility
          classes so the background adapts correctly in both themes.
          Light mode: pale tint (accent-100→50 for PC; red-100→50 for NPC).
          Dark mode: deep atmospheric gradient (accent-950→900 / red-950→900).
          This replaces the previous inline style with hardcoded dark oklch values
          that were inappropriate in light mode.
        -->
        <div
          class="w-full h-full flex items-center justify-center bg-gradient-to-br
                 {isNPC
                   ? 'from-red-100 to-red-50 dark:from-red-950 dark:to-red-900'
                   : 'from-accent-100 to-accent-50 dark:from-accent-950 dark:to-accent-900'}"
          aria-hidden="true"
        >
          {#if isNPC}
            <IconNPC size={52} class="opacity-35 text-red-400" />
          {:else}
            <IconCharacter size={52} class="opacity-35 text-accent" />
          {/if}
        </div>
      {/if}

      <!-- NPC badge — text via ui-strings, never hardcoded (ARCHITECTURE.md §6) -->
      {#if isNPC}
        <span
          class="absolute top-2 right-2 bg-red-700/85 text-white text-[10px] font-bold
                 uppercase tracking-wider px-1.5 py-0.5 rounded pointer-events-none"
          aria-hidden="true"
        >{ui('common.npc', lang)}</span>
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

      <!-- Level badge — label from ui-strings (zero-hardcoding rule, ARCHITECTURE.md §6) -->
      <div class="flex items-baseline gap-1 mt-auto pt-2">
        <span class="text-[10px] uppercase tracking-wider text-text-muted">{ui('vault.level_abbr', lang)}</span>
        <span class="text-base font-bold {isNPC ? 'text-red-400' : 'text-accent'}">
          {characterLevel}
        </span>
      </div>
    </div>
  </button>

  <!-- Delete button — sibling of the main button, positioned top-right -->
  {#if ondelete}
    <button
      class="absolute top-2 left-2 z-10 p-1.5 rounded-md
             bg-surface/80 backdrop-blur-sm text-text-muted
             opacity-0 group-hover:opacity-100
             hover:text-red-400 hover:bg-red-950/60
             transition-all duration-150
             focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1
             focus-visible:ring-red-500"
      onclick={ondelete}
      aria-label={ui('vault.delete_aria', lang).replace('{name}', character.name)}
      title={ui('vault.delete_aria', lang).replace('{name}', character.name)}
      type="button"
    >
      <IconDelete size={14} aria-hidden="true" />
    </button>
  {/if}
</div>
