<!--
  @file src/lib/components/vault/CharacterCard.svelte
  @description A responsive character card for the Vault grid.
  Phase 19.12: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT (vertical stack):
    - Poster image (180px) or themed gradient placeholder with character/NPC/Monster icon.
    - NPC / Monster / Template badge (absolute, top-right overlay).
    - Card body: name, subtitle, level badge.

  NPC / Monster styling:
    - PC cards: accent hover border + purple shadow.
    - NPC cards: red hover border + red shadow.
    - Monster cards: orange hover border + orange shadow.
    - Template cards: indigo tint with "Template" badge.

  viewOnly mode:
    - Set when a player sees an NPC/Monster that they don't own.
    - No click-through to the character sheet.
    - No level badge (players cannot see NPC/Monster level).
    - Cursor is default (not pointer).
-->

<script lang="ts">
  import type { Character } from '$lib/types/character';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { getCharacterLevel } from '$lib/utils/formatters';
  import { ui } from '$lib/i18n/ui-strings';
  import {
    IconNPC, IconMonster, IconCharacter, IconDelete, IconPin, IconPinOff, IconTemplate,
  } from '$lib/components/ui/icons';

  const lang = $derived(engine.settings.language);

  interface Props {
    character: Character;
    onclick?: () => void;
    /** Called when the user confirms deletion. Undefined = no delete button shown. */
    ondelete?: () => void;
    /** Whether this character is currently pinned to the sidebar. */
    isPinned?: boolean;
    /** Called when the user clicks the pin button. Undefined = no pin button shown. */
    onpin?: () => void;
    /**
     * View-only mode: disables click-through and hides the level badge.
     * Used when a player sees an NPC/Monster they don't own in the campaign vault.
     * Also used for template cards in the global vault.
     */
    viewOnly?: boolean;
  }

  let { character, onclick, ondelete, isPinned = false, onpin, viewOnly = false }: Props = $props();

  // getCharacterLevel() from formatters.ts keeps the D&D character-level formula
  // (Object.values(classLevels).reduce) out of the .svelte file (ARCHITECTURE.md §3).
  const characterLevel = $derived(getCharacterLevel(character.classLevels));

  const subtitle = $derived.by(() => {
    if (character.customSubtitle) return character.customSubtitle;
    if (character.isNPC) {
      // For monsters, playerName stores the species name (e.g. "Wolf").
      // Show it as subtitle so the GM sees "Wolfie / Wolf" at a glance.
      if (character.npcType === 'monster' && character.playerName) {
        return character.playerName;
      }
      // For NPC instances, playerName is the GM who spawned it.
      if (character.npcType === 'npc' && character.playerName) {
        return character.playerName;
      }
      // Fall back to race label (for NPCs with a race feature active).
      const raceInstance = character.activeFeatures?.find(fi => {
        const feature = dataLoader.getFeature(fi.featureId);
        return feature?.category === 'race';
      });
      if (raceInstance) {
        const raceFeature = dataLoader.getFeature(raceInstance.featureId);
        if (raceFeature) return engine.t(raceFeature.label);
      }
      if (character.npcType === 'monster') return ui('common.monster', lang);
      return ui('common.npc', lang);
    }
    if (character.playerName) return character.playerName;
    return '';
  });

  const isNPC     = $derived(character.isNPC);
  const isMonster = $derived(character.npcType === 'monster');
  const isTemplate = $derived(!!character.isTemplate);

  // Zero-hardcoding rule: use ui() for all visible text including aria-labels.
  // In view-only mode: no level shown, no navigation affordance.
  const ariaLabel = $derived(
    viewOnly
      ? `${character.name}${subtitle ? ', ' + subtitle : ''}`
      : `${character.name}${subtitle ? ', ' + subtitle : ''}, ${ui('vault.level_abbr', lang)} ${characterLevel}`
  );

  // Effective click handler: null when viewOnly is true (no navigation for restricted cards).
  const effectiveOnclick = $derived(viewOnly ? undefined : onclick);
</script>

<!--
  Outer wrapper is a <div> so we can place the delete button as a true sibling
  of the main click target — avoids the invalid nested <button> HTML.
-->
<div
  class="group relative flex flex-col w-full rounded-xl border overflow-hidden
         transition-all duration-200
         {isMonster
           ? 'border-orange-900/50 bg-surface hover:border-orange-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-orange-500/15'
           : isNPC
             ? 'border-red-900/50 bg-surface hover:border-red-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-red-500/15'
             : 'border-border bg-surface hover:border-accent hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent/15'}"
>
  <!-- Main click target: opens the character sheet (disabled in viewOnly mode) -->
  {#if effectiveOnclick}
    <button
      class="flex flex-col text-left w-full focus-visible:outline-none
             focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-inset"
      onclick={effectiveOnclick}
      aria-label={ariaLabel}
      type="button"
    >
      {@render cardContent()}
    </button>
  {:else}
    <!-- Non-interactive wrapper when viewOnly (player sees NPC/Monster name only) -->
    <div
      class="flex flex-col text-left w-full cursor-default"
      aria-label={ariaLabel}
      role="article"
    >
      {@render cardContent()}
    </div>
  {/if}

  <!-- Delete button — sibling of the main button, positioned top-left -->
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

  <!-- Pin button — top-right overlay, always visible when pinned, on hover otherwise -->
  <!-- Only shown when not in viewOnly mode (pinning requires sheet access) -->
  {#if onpin && !viewOnly}
    <button
      class="absolute top-2 right-2 z-10 p-1.5 rounded-md
             bg-surface/80 backdrop-blur-sm
             {isPinned ? 'text-accent opacity-100' : 'text-text-muted opacity-0 group-hover:opacity-100'}
             hover:text-accent hover:bg-accent/10
             transition-all duration-150
             focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1
             focus-visible:ring-accent"
      onclick={(e) => { e.stopPropagation(); onpin!(); }}
      aria-label={isPinned
        ? ui('nav.unpin_character', lang) + ': ' + character.name
        : ui('nav.pin_character', lang) + ': ' + character.name}
      title={isPinned ? ui('nav.unpin_character', lang) : ui('nav.pin_character', lang)}
      type="button"
    >
      {#if isPinned}
        <IconPinOff size={14} aria-hidden="true" />
      {:else}
        <IconPin size={14} aria-hidden="true" />
      {/if}
    </button>
  {/if}
</div>

<!--
  Shared card body rendered via Svelte 5 snippet to avoid duplication between
  the interactive <button> and the non-interactive viewOnly <div>.
-->
{#snippet cardContent()}
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
        Light mode: pale tint.  Dark mode: deep atmospheric gradient.
        Monster: orange tint.  NPC: red tint.  PC: accent (indigo) tint.
        Template: indigo tint.
      -->
      <div
        class="w-full h-full flex items-center justify-center bg-gradient-to-br
               {isMonster
                 ? 'from-orange-100 to-orange-50 dark:from-orange-950 dark:to-orange-900'
                 : isNPC
                   ? 'from-red-100 to-red-50 dark:from-red-950 dark:to-red-900'
                   : 'from-accent-100 to-accent-50 dark:from-accent-950 dark:to-accent-900'}"
        aria-hidden="true"
      >
        {#if isMonster}
          <IconMonster size={52} class="opacity-35 text-orange-400" />
        {:else if isNPC}
          <IconNPC size={52} class="opacity-35 text-red-400" />
        {:else if isTemplate}
          <IconTemplate size={52} class="opacity-35 text-accent" />
        {:else}
          <IconCharacter size={52} class="opacity-35 text-accent" />
        {/if}
      </div>
    {/if}

    <!-- Type badge — top-right overlay. Zero-hardcoding: ui() only. -->
    {#if isTemplate}
      <span
        class="absolute top-2 right-2 bg-accent/80 text-white text-[10px] font-bold
               uppercase tracking-wider px-1.5 py-0.5 rounded pointer-events-none"
        aria-hidden="true"
      >{ui('vault.template_badge', lang)}</span>
    {:else if isMonster}
      <span
        class="absolute top-2 right-2 bg-orange-700/85 text-white text-[10px] font-bold
               uppercase tracking-wider px-1.5 py-0.5 rounded pointer-events-none"
        aria-hidden="true"
      >{ui('common.monster', lang)}</span>
    {:else if isNPC}
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

    <!-- Level badge — hidden in viewOnly mode (players cannot see NPC/Monster levels). -->
    {#if !viewOnly}
      <div class="flex items-baseline gap-1 mt-auto pt-2">
        <span class="text-[10px] uppercase tracking-wider text-text-muted">{ui('vault.level_abbr', lang)}</span>
        <span class="text-base font-bold {isMonster ? 'text-orange-400' : isNPC ? 'text-red-400' : 'text-accent'}">
          {characterLevel}
        </span>
      </div>
    {:else}
      <!-- Spacer to keep card height consistent when level is hidden. -->
      <div class="mt-auto pt-2"></div>
    {/if}
  </div>
{/snippet}
