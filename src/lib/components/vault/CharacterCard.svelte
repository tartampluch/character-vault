<!--
  @file src/lib/components/vault/CharacterCard.svelte
  @description A responsive, information-dense card for a single character in the Vault.

  PROPS:
    - `character: Character` — the character to display (REQUIRED).
    - `onclick?: () => void` — callback when the card is clicked (optional).

  LAYOUT (vertical stack):
    1. Poster image (300×200 fallback placeholder if `posterUrl` is undefined).
    2. Character name.
    3. Subtitle line (priority: customSubtitle → race label for NPCs → playerRealName for PCs).
    4. Level badge: sum of `Object.values(classLevels)`.

  SUBTITLE LOGIC (ARCHITECTURE.md Phase 7.2):
    - If `customSubtitle` exists → display it.
    - Else if `character.isNPC === true` → display the Race label from `activeFeatures`
      (look for a Feature of category "race" in the character's activeFeatures).
    - Else (Player Character) → display `playerRealName`.
    - If none of these are available → show nothing (no subtitle).

  LEVEL BADGE:
    Character Level = Object.values(classLevels).reduce((a, b) => a + b, 0)
    Displayed as "Lv. N". Level 0 characters (no class) show "Lv. 0".

  NOTE ON ARCHITECTURE:
    This component is deliberately "dumb":
      - All data comes from the `character` prop.
      - No direct store reads (stores are accessed by the parent Vault page).
      - No game logic (no D&D rule evaluation).
    The parent page is responsible for fetching the race feature label.
    For performance, the race lookup is done with a DataLoader call here since
    it only reads from the in-memory cache (no async needed).

  @see src/routes/campaigns/[id]/vault/+page.svelte for usage context.
  @see src/lib/types/character.ts for the Character type.
  @see ARCHITECTURE.md Phase 7 for the full Vault specification.
-->

<script lang="ts">
  import type { Character } from '$lib/types/character';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { engine } from '$lib/engine/GameEngine.svelte';

  // ============================================================
  // PROPS (Svelte 5 runes syntax)
  // ============================================================

  interface Props {
    /** The character to display. Required. */
    character: Character;
    /** Optional click handler (called when the card is activated). */
    onclick?: () => void;
  }

  let { character, onclick }: Props = $props();

  // ============================================================
  // DERIVED VALUES
  // ============================================================

  /**
   * Computes the character's total level from all class levels.
   * Formula: Object.values(classLevels).reduce((a, b) => a + b, 0)
   */
  const characterLevel = $derived(
    Object.values(character.classLevels).reduce((sum, lvl) => sum + lvl, 0)
  );

  /**
   * Resolves the subtitle according to the three-tier priority:
   *   1. customSubtitle (if present)
   *   2. Race label for NPCs (looked up from DataLoader cache)
   *   3. playerRealName for PCs
   *   4. Empty string if none available
   *
   * WHY SYNCHRONOUS?
   *   The DataLoader cache is populated BEFORE the Vault renders.
   *   Reading from `dataLoader.getFeature()` is O(1) Map lookup — no async needed.
   *
   * WHY NOT JUST LOOK FOR "race" IN activeFeatures?
   *   The subtitle only needs to be a simple human-readable string.
   *   We find the first Feature of category "race" and return its localised label.
   *   This is the most direct and readable approach.
   */
  const subtitle = $derived.by(() => {
    // Priority 1: Custom subtitle (player-assigned)
    if (character.customSubtitle) {
      return character.customSubtitle;
    }

    // Priority 2: Race label for NPCs
    if (character.isNPC) {
      const raceInstance = character.activeFeatures.find(fi => {
        const feature = dataLoader.getFeature(fi.featureId);
        return feature?.category === 'race';
      });

      if (raceInstance) {
        const raceFeature = dataLoader.getFeature(raceInstance.featureId);
        if (raceFeature) {
          return engine.t(raceFeature.label);
        }
      }

      // Fallback localised label when race feature is not in cache
      return engine.t({ en: 'NPC', fr: 'PNJ' });
    }

    // Priority 3: Player's real name for PCs
    if (character.playerRealName) {
      return character.playerRealName;
    }

    return '';
  });

  /**
   * Whether this character is an NPC or monster (for visual differentiation).
   * NPCs/monsters get a subtle badge indicator in the card.
   */
  const isNPC = $derived(character.isNPC);

  /**
   * The card's accessible label for screen readers.
   */
  const ariaLabel = $derived(
    `${character.name}${subtitle ? ', ' + subtitle : ''}, Level ${characterLevel}`
  );
</script>

<!-- ============================================================ -->
<!-- CHARACTER CARD -->
<!-- ============================================================ -->
<button
  class="character-card"
  class:npc={isNPC}
  onclick={onclick}
  aria-label={ariaLabel}
  role="button"
  tabindex="0"
>
  <!-- ---------------------------------------------------------- -->
  <!-- POSTER IMAGE -->
  <!-- ---------------------------------------------------------- -->
  <div class="card-poster">
    {#if character.posterUrl}
      <img
        src={character.posterUrl}
        alt={character.name}
        class="poster-img"
        loading="lazy"
        width="300"
        height="200"
      />
    {:else}
      <!-- Fallback placeholder (300×200) -->
      <div class="poster-placeholder" aria-hidden="true">
        <span class="poster-icon">
          {isNPC ? '👹' : '🧙'}
        </span>
      </div>
    {/if}

    <!-- NPC badge overlay -->
    {#if isNPC}
      <span class="npc-badge" aria-hidden="true">NPC</span>
    {/if}
  </div>

  <!-- ---------------------------------------------------------- -->
  <!-- CARD BODY -->
  <!-- ---------------------------------------------------------- -->
  <div class="card-body">
    <!-- Character name -->
    <h3 class="char-name">{character.name}</h3>

    <!-- Subtitle (customSubtitle → race → playerRealName) -->
    {#if subtitle}
      <p class="char-subtitle">{subtitle}</p>
    {/if}

    <!-- Level badge -->
    <div class="level-badge" aria-label="Level {characterLevel}">
      <span class="level-label">Lv.</span>
      <span class="level-value">{characterLevel}</span>
    </div>
  </div>
</button>

<style>
  /* ========================= CARD BASE ========================= */
  .character-card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    text-align: left;
    padding: 0;
    transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s;
    display: flex;
    flex-direction: column;
    width: 100%;
    color: inherit;
    font-family: inherit;
  }

  .character-card:hover,
  .character-card:focus-visible {
    border-color: #7c3aed;
    transform: translateY(-3px);
    box-shadow: 0 8px 24px rgba(124, 58, 237, 0.2);
    outline: none;
  }

  /* NPC cards get a slightly different color to distinguish them */
  .character-card.npc {
    border-color: #3a2020;
  }

  .character-card.npc:hover,
  .character-card.npc:focus-visible {
    border-color: #c0392b;
    box-shadow: 0 8px 24px rgba(192, 57, 43, 0.2);
  }

  /* ========================= POSTER ========================= */
  .card-poster {
    position: relative;
    width: 100%;
    height: 180px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .poster-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .poster-placeholder {
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #1e1b4b 0%, #2d1b69 60%, #1c1033 100%);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .character-card.npc .poster-placeholder {
    background: linear-gradient(135deg, #2a1010 0%, #4a1010 60%, #1a0808 100%);
  }

  .poster-icon {
    font-size: 3.5rem;
    opacity: 0.45;
  }

  /* NPC badge (top-right overlay) */
  .npc-badge {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    background: rgba(192, 57, 43, 0.85);
    color: #fff;
    font-size: 0.65rem;
    font-weight: bold;
    letter-spacing: 0.08em;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    text-transform: uppercase;
    pointer-events: none;
  }

  /* ========================= BODY ========================= */
  .card-body {
    padding: 0.9rem 1rem 1rem;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .char-name {
    margin: 0;
    font-size: 1rem;
    color: #f0f0ff;
    font-weight: 600;
    line-height: 1.3;
    /* Prevent very long names from overflowing */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .char-subtitle {
    margin: 0;
    font-size: 0.8rem;
    color: #8080a0;
    line-height: 1.4;
    /* Clamp to one line */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ========================= LEVEL BADGE ========================= */
  .level-badge {
    margin-top: auto;
    padding-top: 0.5rem;
    display: flex;
    align-items: baseline;
    gap: 0.2rem;
  }

  .level-label {
    font-size: 0.72rem;
    color: #6060a0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .level-value {
    font-size: 1.05rem;
    font-weight: bold;
    color: #c4b5fd;
  }

  .character-card.npc .level-value {
    color: #f87171;
  }
</style>
