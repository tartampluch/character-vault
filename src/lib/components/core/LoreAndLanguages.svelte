<!--
  @file src/lib/components/core/LoreAndLanguages.svelte
  @description Lore (Personal Story, Appearance) and Language selection panel.

  PURPOSE:
    Provides text areas and inputs for the character's narrative and physical description:
      - Personal Story / Background
      - Physical Appearance (Height, Weight, Age, Eye Color, Hair Color, Skin)

    Implements the Language selection system:
      - Calculates the number of AVAILABLE bonus languages:
          D&D 3.5: INT modifier additional languages (above and beyond racial grants).
          Plus any ranks in "Speak Language" skill (each rank = 1 additional language).
      - Shows AUTOMATIC languages (granted by Race or Class features in `activeFeatures`).
        These cannot be removed (they have a lock icon and no delete button).
      - Shows MANUALLY SELECTED languages (up to the available count).
        The player can add from a dropdown and remove any manual selection.

  LANGUAGE MECHANICS (D&D 3.5 SRD):
    Base languages: 2 (from Race/background — typically Common + racial language)
    Bonus languages: INT modifier (min 0) + "Speak Language" skill ranks
    Total max = automatic_count + bonus_languages

    The feature grants automatic languages. If the Race feature has
    `grantedFeatures: ["language_common", "language_elven"]`, those are automatic.
    The engine processes these as granted features just like any other Feature.
    We detect them by querying features that have `tags: ["language"]`.

  AUTOMATIC LANGUAGE DETECTION:
    We find automatic languages by scanning `character.activeFeatures` recursively
    for any grantedFeature with `tags.includes("language")`. These are read-only.

  MANUAL LANGUAGE SELECTION:
    Stored as items in `character.activeFeatures` with category "condition" (or
    a convention we use for synthetic non-mechanic features). The `featureId`
    starts with "language_" for easy identification.

  DATA STORAGE:
    - Personal story & appearance: stored as a JSON object in `character.resources`
      or better as custom fields on the Character object. For simplicity in these
      early phases, we use Svelte 5 $state for UI state and persist via:
      `engine.character.customSubtitle` for the subtitle, and we add a `lore` field
      conceptually (stored as a synthetic `condition` feature with textual data).
      
      PRACTICAL NOTE: Since Character doesn't yet have `lore` fields, we use
      component-local $state bound to attributes for the text areas. In Phase 14
      (PHP API), these will be persisted as part of the character JSON payload.

  @see src/lib/types/character.ts for character data structure.
  @see ARCHITECTURE.md Phase 8.8 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import type { ID } from '$lib/types/primitives';

  // ============================================================
  // LORE STATE (local, synced to character on change)
  // Note: These fields will be persisted to `character.lore` once
  // the Character type is extended in Phase 8.8 or later.
  // For now they are stored in engine.character as part of
  // a synthetic "lore" feature or directly on the character.
  // ============================================================

  /**
   * Personal story / background text.
   * Bound two-way to local state and auto-dispatches to the character.
   */
  let personalStory = $state(engine.character.customSubtitle ?? '');

  /**
   * Physical appearance fields.
   */
  let height = $state('');
  let weight = $state('');
  let age    = $state('');
  let eyes   = $state('');
  let hair   = $state('');
  let skin   = $state('');

  // Sync personal story changes back to character
  $effect(() => {
    engine.character.customSubtitle = personalStory || undefined;
  });

  // ============================================================
  // LANGUAGE SYSTEM
  // ============================================================

  /**
   * The INT modifier, used to calculate bonus language slots.
   * D&D 3.5: INT mod >= 0 grants bonus languages to learn.
   * A negative INT mod does NOT reduce language count below the racial base.
   */
  const intModifier = $derived(
    Math.max(0, engine.phase2_attributes['stat_int']?.derivedModifier ?? 0)
  );

  /**
   * Ranks in the "Speak Language" skill (if the skill exists in the character).
   * Each rank grants 1 additional language known.
   * The skill ID convention: "skill_speak_language".
   */
  const speakLanguageRanks = $derived(
    engine.character.skills['skill_speak_language']?.ranks ?? 0
  );

  /**
   * Total bonus language slots (beyond automatic racial grants).
   * Formula: max(0, INT modifier) + Speak Language ranks
   */
  const bonusLanguageSlots = $derived(intModifier + speakLanguageRanks);

  /**
   * Finds all language-tagged features in the character's active features
   * (both directly active and granted by other features like Race).
   *
   * A "language" feature is identified by having the tag "language" in its tags array.
   * Examples: "language_common", "language_elvish", "language_orc"
   *
   * Returns two arrays:
   *   - `automatic`: granted by a parent feature (not directly in activeFeatures)
   *   - `manual`: directly added by the player (starts with "language_" and is in activeFeatures)
   */
  const languages = $derived.by(() => {
    const automatic: Array<{ id: ID; name: string }> = [];
    const manual: Array<{ id: ID; name: string; instanceId: ID }> = [];

    for (const afi of engine.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feature = dataLoader.getFeature(afi.featureId);
      if (!feature) continue;

      // Check if this feature is itself a language
      if (feature.tags.includes('language')) {
        // It's directly in activeFeatures → manual selection
        manual.push({
          id: feature.id,
          name: engine.t(feature.label),
          instanceId: afi.instanceId,
        });
      }

      // Check if this feature GRANTS language features
      // We check up to 1 level of grantedFeatures (racial/class language grants)
      for (const grantedId of (feature.grantedFeatures ?? [])) {
        if (grantedId.startsWith('-')) continue;
        const grantedFeature = dataLoader.getFeature(grantedId);
        if (grantedFeature?.tags.includes('language')) {
          // Check it's not already listed
          if (!automatic.some(l => l.id === grantedId) &&
              !manual.some(l => l.id === grantedId)) {
            automatic.push({
              id: grantedId,
              name: engine.t(grantedFeature.label),
            });
          }
        }
      }
    }

    return { automatic, manual };
  });

  /**
   * Total automatically-granted languages count.
   */
  const autoCount = $derived(languages.automatic.length);

  /**
   * How many additional (manual) languages the player has selected.
   */
  const manualCount = $derived(languages.manual.length);

  /**
   * How many MORE languages the player can still add.
   */
  const remainingSlots = $derived(Math.max(0, bonusLanguageSlots - manualCount));

  /**
   * All available language features from the DataLoader cache.
   * Filtered to remove ones already selected.
   */
  const availableLanguages = $derived.by(() => {
    const selectedIds = new Set([
      ...languages.automatic.map(l => l.id),
      ...languages.manual.map(l => l.id),
    ]);
    return dataLoader.queryFeatures('tag:language')
      .filter(f => !selectedIds.has(f.id))
      .sort((a, b) => engine.t(a.label).localeCompare(engine.t(b.label)));
  });

  // ============================================================
  // LANGUAGE ACTIONS
  // ============================================================

  /**
   * Adds a language to the character's active features.
   * Creates a new `ActiveFeatureInstance` with the selected language feature ID.
   *
   * @param featureId - The language feature ID to add (e.g., "language_draconic").
   */
  function addLanguage(featureId: ID): void {
    if (!featureId || remainingSlots <= 0) return;

    // Ensure the language feature exists in the cache
    const languageFeature = dataLoader.getFeature(featureId);
    if (!languageFeature) return;

    engine.addFeature({
      instanceId: `afi_lang_${featureId}_${Date.now()}`,
      featureId,
      isActive: true,
    });
  }

  /**
   * Removes a manually selected language from the character.
   * Only manual languages (NOT automatic ones) can be removed.
   *
   * @param instanceId - The `ActiveFeatureInstance.instanceId` to remove.
   */
  function removeLanguage(instanceId: ID): void {
    engine.removeFeature(instanceId);
  }

  /** Handles the language dropdown selection change. */
  function handleLanguageSelect(event: Event) {
    const featureId = (event.target as HTMLSelectElement).value;
    if (featureId) {
      addLanguage(featureId);
      // Reset the dropdown to "— Add language —" after selection
      (event.target as HTMLSelectElement).value = '';
    }
  }
</script>

<div class="lore-languages-panel">

  <!-- ========================================================= -->
  <!-- PERSONAL STORY -->
  <!-- ========================================================= -->
  <section class="section">
    <h3 class="section-title">📖 Personal Story</h3>
    <textarea
      class="lore-textarea"
      bind:value={personalStory}
      placeholder="The character's backstory, motivation, personality traits, ideals, bonds, and flaws..."
      rows="4"
      aria-label="Personal story and background"
    ></textarea>
  </section>

  <!-- ========================================================= -->
  <!-- APPEARANCE -->
  <!-- ========================================================= -->
  <section class="section">
    <h3 class="section-title">🪞 Appearance</h3>
    <div class="appearance-grid">
      <div class="field-group">
        <label for="char-height" class="field-label">Height</label>
        <input
          id="char-height"
          type="text"
          bind:value={height}
          placeholder="e.g. 5'8&quot;"
          class="field-input"
          maxlength="20"
        />
      </div>
      <div class="field-group">
        <label for="char-weight" class="field-label">Weight</label>
        <input
          id="char-weight"
          type="text"
          bind:value={weight}
          placeholder="e.g. 160 lb."
          class="field-input"
          maxlength="20"
        />
      </div>
      <div class="field-group">
        <label for="char-age" class="field-label">Age</label>
        <input
          id="char-age"
          type="text"
          bind:value={age}
          placeholder="e.g. 24"
          class="field-input"
          maxlength="10"
        />
      </div>
      <div class="field-group">
        <label for="char-eyes" class="field-label">Eye Color</label>
        <input
          id="char-eyes"
          type="text"
          bind:value={eyes}
          placeholder="e.g. Brown"
          class="field-input"
          maxlength="30"
        />
      </div>
      <div class="field-group">
        <label for="char-hair" class="field-label">Hair Color</label>
        <input
          id="char-hair"
          type="text"
          bind:value={hair}
          placeholder="e.g. Dark brown"
          class="field-input"
          maxlength="30"
        />
      </div>
      <div class="field-group">
        <label for="char-skin" class="field-label">Skin</label>
        <input
          id="char-skin"
          type="text"
          bind:value={skin}
          placeholder="e.g. Olive"
          class="field-input"
          maxlength="30"
        />
      </div>
    </div>
  </section>

  <!-- ========================================================= -->
  <!-- LANGUAGES -->
  <!-- ========================================================= -->
  <section class="section" aria-label="Languages known">
    <div class="lang-header">
      <h3 class="section-title">🗣️ Languages</h3>
      <div class="lang-slots">
        <span
          class="slots-remaining"
          class:full={remainingSlots === 0}
          aria-label="{remainingSlots} language slots remaining"
        >
          {#if bonusLanguageSlots > 0}
            {manualCount}/{bonusLanguageSlots} bonus slots used
          {:else}
            No bonus slots (INT {engine.phase2_attributes['stat_int']?.totalValue ?? 10})
          {/if}
        </span>
      </div>
    </div>

    <!-- Automatic languages (locked, read-only) -->
    {#if languages.automatic.length > 0}
      <div class="lang-group">
        <span class="lang-group-label">Automatic (from race/class)</span>
        <div class="lang-list">
          {#each languages.automatic as lang}
            <span class="lang-chip lang-chip--auto" aria-label="{lang.name} (automatic)">
              <span class="lang-name">{lang.name}</span>
              <span class="lang-lock" aria-hidden="true" title="Automatic — cannot be removed">🔒</span>
            </span>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Manual languages (removable) -->
    {#if languages.manual.length > 0}
      <div class="lang-group">
        <span class="lang-group-label">Learned languages</span>
        <div class="lang-list">
          {#each languages.manual as lang}
            <span class="lang-chip" aria-label="{lang.name} (remove button available)">
              <span class="lang-name">{lang.name}</span>
              <button
                class="lang-remove"
                onclick={() => removeLanguage(lang.instanceId)}
                aria-label="Remove {lang.name}"
                title="Remove language"
              >×</button>
            </span>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Add language dropdown (only shown if slots remain) -->
    {#if remainingSlots > 0 && availableLanguages.length > 0}
      <div class="lang-add">
        <select
          class="lang-select"
          value=""
          onchange={handleLanguageSelect}
          aria-label="Add a language"
        >
          <option value="">— Add a language ({remainingSlots} slot{remainingSlots !== 1 ? 's' : ''} left) —</option>
          {#each availableLanguages as lang}
            <option value={lang.id}>{engine.t(lang.label)}</option>
          {/each}
        </select>
      </div>
    {:else if remainingSlots === 0}
      <p class="lang-hint">
        All bonus language slots filled.
        Increase INT or add Speak Language ranks for more.
      </p>
    {:else if bonusLanguageSlots > 0 && availableLanguages.length === 0}
      <p class="lang-hint">
        No additional languages available. Enable a rule source with language features.
      </p>
    {/if}
  </section>

</div>

<style>
  .lore-languages-panel {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  /* ========================= SECTIONS ========================= */
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section-title {
    margin: 0;
    font-size: 0.88rem;
    color: #c4b5fd;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.35rem;
  }

  /* ========================= TEXTAREA ========================= */
  .lore-textarea {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #e0e0f0;
    padding: 0.5rem 0.75rem;
    font-size: 0.85rem;
    font-family: inherit;
    line-height: 1.55;
    resize: vertical;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }

  .lore-textarea:focus {
    outline: none;
    border-color: #7c3aed;
  }

  .lore-textarea::placeholder { color: #3a3a5a; }

  /* ========================= APPEARANCE GRID ========================= */
  .appearance-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 0.5rem;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .field-label {
    font-size: 0.72rem;
    color: #6080a0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .field-input {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #e0e0f0;
    padding: 0.3rem 0.5rem;
    font-size: 0.85rem;
    font-family: inherit;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }

  .field-input:focus {
    outline: none;
    border-color: #7c3aed;
  }

  .field-input::placeholder { color: #3a3a5a; }

  /* ========================= LANGUAGES ========================= */
  .lang-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.35rem;
  }

  .lang-header .section-title {
    border: none;
    padding: 0;
  }

  .slots-remaining {
    font-size: 0.75rem;
    color: #6080a0;
  }

  .slots-remaining.full {
    color: #4ade80;
  }

  .lang-group {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .lang-group-label {
    font-size: 0.72rem;
    color: #6080a0;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .lang-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .lang-chip {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    background: #1c1a3a;
    border: 1px solid #4c35a0;
    border-radius: 12px;
    padding: 0.2rem 0.6rem;
    font-size: 0.8rem;
  }

  .lang-chip--auto {
    background: #0f1e0f;
    border-color: #166534;
  }

  .lang-name {
    color: #c4b5fd;
  }

  .lang-chip--auto .lang-name {
    color: #86efac;
  }

  .lang-lock {
    font-size: 0.65rem;
    opacity: 0.6;
  }

  .lang-remove {
    background: transparent;
    border: none;
    color: #f87171;
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    transition: color 0.15s;
  }

  .lang-remove:hover { color: #dc2626; }

  .lang-add {
    display: flex;
    align-items: center;
  }

  .lang-select {
    width: 100%;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #e0e0f0;
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
    font-family: inherit;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .lang-select:focus {
    outline: none;
    border-color: #7c3aed;
  }

  .lang-hint {
    font-size: 0.78rem;
    color: #4a4a6a;
    font-style: italic;
    margin: 0.25rem 0 0;
  }
</style>
