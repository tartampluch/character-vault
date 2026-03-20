<!--
  @file src/lib/components/core/BasicInfo.svelte
  @description Basic Information panel for the Core tab of the character sheet.

  PURPOSE:
    Provides dropdown selectors for the character's fundamental choices:
      - Race (category: "race")
      - Class (category: "class")
      - Deity (category: "deity")
      - Alignment (category: "alignment" — loaded from config or predefined)
      - Size (category: "size" or direct pipeline modifier)

    When the player selects a Race or Class:
      1. Any previously active feature of that category is REMOVED from the engine.
      2. The new feature is added as an `ActiveFeatureInstance` via `engine.addFeature()`.
      3. For Classes: a `classLevels` entry is initialised to 1 (if not already present).
      4. The engine's DAG re-evaluates automatically (Svelte 5 reactivity).

    MODIFIER BADGES:
    For each feature in the dropdown options, we show key modifier badges:
      "+2 DEX", "-2 CON", "+30 ft Speed"
    This gives the player context when choosing. Badges come from `grantedModifiers`
    of the Feature's definition.

  ARCHITECTURE:
    - Reads: `engine.character.activeFeatures`, `engine.phase0_activeTags`
    - Reads: `dataLoader.queryFeatures()` for dropdown populations
    - Writes: `engine.addFeature()`, `engine.removeFeature()`,
              direct mutation of `engine.character.classLevels`
    - No D&D rules computed here — only feature lookup and engine dispatching.

  PHASE 8.4 INTEGRATION:
    `FeatureChoice` handling (Cleric domain selectors, Weapon Focus weapon picker)
    is added to this component in Phase 8.4. For now, we provide the structural
    foundation and a placeholder for choices rendering.

  @see src/lib/engine/GameEngine.svelte.ts for the feature mutation methods.
  @see src/lib/engine/DataLoader.ts for the feature catalog queries.
  @see ARCHITECTURE.md Phase 8.3 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { formatModifier } from '$lib/utils/formatters';
  import type { Feature } from '$lib/types/feature';
  import type { ID } from '$lib/types/primitives';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';

  // ============================================================
  // DROPDOWN POPULATIONS (from DataLoader cache)
  // ============================================================

  /** All race features available in the current rule sources. */
  const races = $derived(dataLoader.queryFeatures('category:race'));

  /** All class features available (PC and NPC classes). */
  const classes = $derived(dataLoader.queryFeatures('category:class'));

  /** All deity features available. */
  const deities = $derived(dataLoader.queryFeatures('category:deity'));

  /**
   * D&D 3.5 standard alignment options.
   * These are not conventional Features — they are static string choices
   * that apply a tag to the character for `forbiddenTags` checking.
   * They do not grant modifiers (alignment has no mechanical modifier in 3.5 SRD).
   *
   * The strings here are the canonical tag names used in `forbiddenTags`.
   * E.g., Barbarian has `forbiddenTags: ["alignment_lawful"]`.
   * A Paladin has `forbiddenTags: ["alignment_chaotic", "alignment_evil"]`.
   */
  const ALIGNMENTS = [
    { id: 'alignment_lawful_good',     label: { en: 'Lawful Good',      fr: 'Loyal Bon' } },
    { id: 'alignment_neutral_good',    label: { en: 'Neutral Good',     fr: 'Neutre Bon' } },
    { id: 'alignment_chaotic_good',    label: { en: 'Chaotic Good',     fr: 'Chaotique Bon' } },
    { id: 'alignment_lawful_neutral',  label: { en: 'Lawful Neutral',   fr: 'Loyal Neutre' } },
    { id: 'alignment_true_neutral',    label: { en: 'True Neutral',     fr: 'Vrai Neutre' } },
    { id: 'alignment_chaotic_neutral', label: { en: 'Chaotic Neutral',  fr: 'Chaotique Neutre' } },
    { id: 'alignment_lawful_evil',     label: { en: 'Lawful Evil',      fr: 'Loyal Mauvais' } },
    { id: 'alignment_neutral_evil',    label: { en: 'Neutral Evil',     fr: 'Neutre Mauvais' } },
    { id: 'alignment_chaotic_evil',    label: { en: 'Chaotic Evil',     fr: 'Chaotique Mauvais' } },
  ];

  // ============================================================
  // CURRENT SELECTIONS (read from active features)
  // ============================================================

  /**
   * Finds the currently active Feature of a given category in activeFeatures.
   * Returns `undefined` if no feature of that category is active.
   */
  function getActiveCategoryFeature(category: string): Feature | undefined {
    for (const afi of engine.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feature = dataLoader.getFeature(afi.featureId);
      if (feature?.category === category) return feature;
    }
    return undefined;
  }

  const activeRace = $derived(getActiveCategoryFeature('race'));
  const activeClass = $derived(getActiveCategoryFeature('class'));
  const activeDeity = $derived(getActiveCategoryFeature('deity'));

  /**
   * Currently active alignment tag (first tag starting with "alignment_" in activeTags).
   */
  const activeAlignment = $derived(
    engine.phase0_activeTags.find(tag => tag.startsWith('alignment_')) ?? ''
  );

  // ============================================================
  // MODIFIER BADGES HELPER
  // ============================================================

  /**
   * Extracts compact modifier labels from a feature for badge display.
   * E.g., "+2 stat_dex", "-2 stat_con"
   * Max 3 badges to avoid overflowing the dropdown label.
   */
  function getModifierBadges(feature: Feature): string[] {
    if (!feature.grantedModifiers?.length) return [];
    return feature.grantedModifiers
      .filter(mod => typeof mod.value === 'number' && mod.value !== 0)
      .slice(0, 3)
      .map(mod => {
        const valStr = formatModifier(mod.value as number);
        // Abbreviate the target id for the badge (stat_str → STR)
        const shortTarget = mod.targetId
          .replace('stat_', '')
          .replace('attributes.stat_', '')
          .toUpperCase()
          .slice(0, 5);
        return `${valStr} ${shortTarget}`;
      });
  }

  // ============================================================
  // SELECTION HANDLERS
  // ============================================================

  /**
   * Generates a stable `instanceId` for a category-based feature.
   * Uses the category as a prefix so that swapping races/classes
   * uses a predictable ID (making removal easy).
   */
  function makeCategoryInstanceId(category: string, featureId: ID): string {
    return `afi_${category}_${featureId}`;
  }

  /**
   * Removes all active features of a given category from the character.
   * Used before adding the new selection (race/class/deity swaps).
   */
  function removeAllOfCategory(category: string): void {
    const toRemove = engine.character.activeFeatures
      .filter(afi => {
        const f = dataLoader.getFeature(afi.featureId);
        return f?.category === category;
      })
      .map(afi => afi.instanceId);

    for (const id of toRemove) {
      engine.removeFeature(id);
    }
  }

  /**
   * Handles Race selection change.
   * Removes the current race feature (if any) and adds the new one.
   *
   * @param event - The `<select>` change event.
   */
  function handleRaceChange(event: Event) {
    const featureId = (event.target as HTMLSelectElement).value;
    removeAllOfCategory('race');

    if (featureId) {
      engine.addFeature({
        instanceId: makeCategoryInstanceId('race', featureId),
        featureId,
        isActive: true,
      });
    }
  }

  /**
   * Handles Class selection change.
   *
   * IMPORTANT CLASS LEVEL INITIALISATION:
   *   When adding a class for the first time, set `classLevels[featureId] = 1`.
   *   This ensures the engine's levelProgression gating activates at least Level 1
   *   features immediately after selection (BAB +1, saves, etc.).
   *   The GM/player can then adjust the level separately in a future level input.
   *
   * @param event - The `<select>` change event.
   */
  function handleClassChange(event: Event) {
    const featureId = (event.target as HTMLSelectElement).value;

    // Remove the old class (single-class selection for now)
    removeAllOfCategory('class');

    if (featureId) {
      // Initialise classLevels if this class is new
      if (!engine.character.classLevels[featureId]) {
        engine.character.classLevels[featureId] = 1;
      }

      engine.addFeature({
        instanceId: makeCategoryInstanceId('class', featureId),
        featureId,
        isActive: true,
      });
    } else {
      // Empty selection: remove the class level entry too
      // (Only removes the entry for the class that WAS active)
      if (activeClass) {
        delete engine.character.classLevels[activeClass.id];
      }
    }
  }

  /**
   * Handles Deity selection change.
   */
  function handleDeityChange(event: Event) {
    const featureId = (event.target as HTMLSelectElement).value;
    removeAllOfCategory('deity');

    if (featureId) {
      engine.addFeature({
        instanceId: makeCategoryInstanceId('deity', featureId),
        featureId,
        isActive: true,
      });
    }
  }

  /**
   * Handles Alignment selection change.
   *
   * WHY ALIGNMENT IS SPECIAL:
   *   Alignment is not a full Feature with modifiers — it's a tag applied to the character
   *   so that `forbiddenTags` checks on classes/feats can work (e.g., Barbarian checks
   *   for `has_tag: "alignment_lawful"`).
   *
   *   Since we don't have a real "alignment feature" in the rules files (alignments
   *   have no modifiers), we store the alignment as a special synthetic feature or
   *   simply as a tag. For simplicity, we inject a synthetic ActiveFeatureInstance
   *   with category "condition" whose Feature ID matches the alignment tag string.
   *   This means the alignment tag appears in `@activeTags` without needing a full
   *   Feature definition.
   *
   *   In a production game, a config table `config_alignments` would define these
   *   as Feature objects with the appropriate tags in their `tags` array.
   *   For now, we handle it as a synthetic in-memory feature.
   */
  function handleAlignmentChange(event: Event) {
    const alignmentId = (event.target as HTMLSelectElement).value;

    // Remove existing alignment instances
    const toRemove = engine.character.activeFeatures
      .filter(afi => afi.featureId.startsWith('alignment_'))
      .map(afi => afi.instanceId);
    for (const id of toRemove) {
      engine.removeFeature(id);
    }

    if (alignmentId) {
      // Inject a synthetic alignment feature into the DataLoader cache if not present
      // This creates a minimal Feature whose only purpose is to contribute the alignment tag
      if (!dataLoader.getFeature(alignmentId)) {
        const alignmentConfig = ALIGNMENTS.find(a => a.id === alignmentId);
        if (alignmentConfig) {
          dataLoader.cacheFeature({
            id: alignmentId,
            category: 'condition',
            label: alignmentConfig.label,
            description: alignmentConfig.label,
            tags: [alignmentId],
            grantedModifiers: [],
            grantedFeatures: [],
            ruleSource: 'core_system',
          });
        }
      }

      engine.addFeature({
        instanceId: `afi_alignment_${alignmentId}`,
        featureId: alignmentId,
        isActive: true,
      });
    }
  }

  // ============================================================
  // FEATURE MODAL STATE
  // ============================================================

  /** ID of the feature currently shown in the FeatureModal. Null = modal closed. */
  let modalFeatureId = $state<ID | null>(null);
</script>

<div class="basic-info-panel">
  <h2 class="panel-title">📋 Basic Information</h2>

  <div class="selectors-grid">

    <!-- ========================================================= -->
    <!-- RACE SELECTOR -->
    <!-- ========================================================= -->
    <div class="selector-group">
      <div class="label-row">
        <label for="race-select" class="selector-label">Race</label>
        {#if activeRace}
          <button
            class="info-btn"
            onclick={() => (modalFeatureId = activeRace?.id ?? null)}
            title="Show race details"
            aria-label="Show {engine.t(activeRace.label)} details"
          >ℹ</button>
        {/if}
      </div>

      <div class="select-wrapper">
        <select
          id="race-select"
          class="selector"
          value={activeRace?.id ?? ''}
          onchange={handleRaceChange}
          aria-label="Select character race"
        >
          <option value="">— None —</option>
          {#each races as race}
            {@const badges = getModifierBadges(race)}
            <option value={race.id}>
              {engine.t(race.label)}{badges.length ? ' (' + badges.join(', ') + ')' : ''}
            </option>
          {/each}
        </select>
      </div>

      <!-- Active race modifier badges -->
      {#if activeRace}
        {@const badges = getModifierBadges(activeRace)}
        {#if badges.length}
          <div class="modifier-badges">
            {#each badges as badge}
              <span class="mod-badge">{badge}</span>
            {/each}
          </div>
        {/if}
      {/if}
    </div>

    <!-- ========================================================= -->
    <!-- CLASS SELECTOR -->
    <!-- ========================================================= -->
    <div class="selector-group">
      <div class="label-row">
        <label for="class-select" class="selector-label">Class</label>
        {#if activeClass}
          <button
            class="info-btn"
            onclick={() => (modalFeatureId = activeClass?.id ?? null)}
            title="Show class details"
            aria-label="Show {engine.t(activeClass.label)} details"
          >ℹ</button>
        {/if}
      </div>

      <div class="select-wrapper">
        <select
          id="class-select"
          class="selector"
          value={activeClass?.id ?? ''}
          onchange={handleClassChange}
          aria-label="Select character class"
        >
          <option value="">— None —</option>
          {#each classes as cls}
            <option value={cls.id}>{engine.t(cls.label)}</option>
          {/each}
        </select>
      </div>

      <!-- Class level indicator (if class is selected) -->
      {#if activeClass}
        {@const classLevel = engine.character.classLevels[activeClass.id] ?? 1}
        <div class="class-level-row">
          <label for="class-level-input" class="level-label">Level in {engine.t(activeClass.label)}:</label>
          <input
            id="class-level-input"
            type="number"
            min="1"
            max="20"
            value={classLevel}
            class="level-input"
            onchange={(e) => {
              const lvl = parseInt((e.target as HTMLInputElement).value, 10);
              if (!isNaN(lvl) && lvl >= 1 && lvl <= 20 && activeClass) {
                engine.character.classLevels[activeClass.id] = lvl;
              }
            }}
            aria-label="Class level"
          />
        </div>
        {#if activeClass.recommendedAttributes?.length}
          <div class="recommended-attrs">
            <span class="rec-label">Recommended:</span>
            {#each activeClass.recommendedAttributes as attrId}
              <span class="rec-attr">{attrId.replace('stat_', '').toUpperCase()}</span>
            {/each}
          </div>
        {/if}
      {/if}
    </div>

    <!-- ========================================================= -->
    <!-- DEITY SELECTOR  -->
    <!-- ========================================================= -->
    <div class="selector-group">
      <div class="label-row">
        <label for="deity-select" class="selector-label">Deity</label>
        {#if activeDeity}
          <button
            class="info-btn"
            onclick={() => (modalFeatureId = activeDeity?.id ?? null)}
            title="Show deity details"
            aria-label="Show {engine.t(activeDeity.label)} details"
          >ℹ</button>
        {/if}
      </div>
      <div class="select-wrapper">
        <select
          id="deity-select"
          class="selector"
          value={activeDeity?.id ?? ''}
          onchange={handleDeityChange}
          aria-label="Select deity"
        >
          <option value="">— None —</option>
          {#each deities as deity}
            <option value={deity.id}>{engine.t(deity.label)}</option>
          {/each}
        </select>
      </div>
      {#if deities.length === 0}
        <p class="no-options-hint">No deities loaded. Enable a rule source with deity data.</p>
      {/if}
    </div>

    <!-- ========================================================= -->
    <!-- ALIGNMENT SELECTOR -->
    <!-- ========================================================= -->
    <div class="selector-group">
      <label for="alignment-select" class="selector-label">Alignment</label>
      <div class="select-wrapper">
        <select
          id="alignment-select"
          class="selector"
          value={activeAlignment}
          onchange={handleAlignmentChange}
          aria-label="Select alignment"
        >
          <option value="">— None —</option>
          {#each ALIGNMENTS as alignment}
            <option value={alignment.id}>{engine.t(alignment.label)}</option>
          {/each}
        </select>
      </div>
    </div>

  </div><!-- /selectors-grid -->

  <!-- ========================================================= -->
  <!-- PHASE 8.4 PLACEHOLDER: FeatureChoice Sub-selections -->
  <!-- Dynamic domains, weapon choices, etc. will appear here.  -->
  <!-- ========================================================= -->
  <!-- [Phase 8.4 will inject FeatureChoice dropdowns here based on
       the active Class feature's `choices` array] -->

</div>

<!-- ============================================================ -->
<!-- FEATURE MODAL (shown on ℹ button click) -->
<!-- ============================================================ -->
{#if modalFeatureId}
  <FeatureModal
    featureId={modalFeatureId}
    onclose={() => (modalFeatureId = null)}
  />
{/if}

<style>
  .basic-info-panel {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1.25rem;
  }

  .panel-title {
    margin: 0 0 1rem;
    font-size: 1rem;
    color: #c4b5fd;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.5rem;
  }

  /* ========================= GRID ========================= */
  .selectors-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
  }

  /* ========================= SELECTOR GROUP ========================= */
  .selector-group {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .label-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .selector-label {
    font-size: 0.78rem;
    color: #6080a0;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }

  .info-btn {
    background: transparent;
    border: 1px solid #30363d;
    color: #7c3aed;
    border-radius: 50%;
    width: 1.3rem;
    height: 1.3rem;
    font-size: 0.7rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    flex-shrink: 0;
  }

  .info-btn:hover {
    background: #2d1b69;
    border-color: #7c3aed;
  }

  /* ========================= SELECT ========================= */
  .select-wrapper {
    position: relative;
  }

  .selector {
    width: 100%;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #e0e0f0;
    padding: 0.4rem 0.6rem;
    font-size: 0.9rem;
    font-family: inherit;
    appearance: none;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .selector:focus {
    outline: none;
    border-color: #7c3aed;
  }

  .selector:hover {
    border-color: #4c35a0;
  }

  /* ========================= MODIFIER BADGES ========================= */
  .modifier-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .mod-badge {
    background: #1c1a3a;
    color: #c4b5fd;
    border: 1px solid #4c35a0;
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-size: 0.72rem;
    font-family: monospace;
  }

  /* ========================= CLASS LEVEL ========================= */
  .class-level-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .level-label {
    font-size: 0.75rem;
    color: #6080a0;
    flex: 1;
  }

  .level-input {
    width: 3.5rem;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #e0e0f0;
    padding: 0.2rem 0.4rem;
    font-size: 0.9rem;
    text-align: center;
  }

  .level-input:focus {
    outline: none;
    border-color: #7c3aed;
  }

  /* ========================= RECOMMENDED ATTRS ========================= */
  .recommended-attrs {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  .rec-label {
    font-size: 0.72rem;
    color: #6080a0;
  }

  .rec-attr {
    background: #0f1e0f;
    color: #4ade80;
    border: 1px solid #166534;
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-size: 0.72rem;
    font-family: monospace;
  }

  /* ========================= HINTS ========================= */
  .no-options-hint {
    font-size: 0.75rem;
    color: #4a4a6a;
    font-style: italic;
    margin: 0.2rem 0 0;
  }
</style>
