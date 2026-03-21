<!--
  @file src/lib/components/core/BasicInfo.svelte
  @description Basic Information panel for the Core tab of the character sheet.
  (Phase 8.3: Race/Class/Deity/Alignment selectors + Phase 8.4: FeatureChoice sub-selections)

  PURPOSE:
    Provides dropdown selectors for the character's fundamental choices:
      - Race (category: "race")
      - Class (category: "class")
      - Deity (category: "deity")
      - Alignment (category: "alignment" — loaded from config or predefined)

    Phase 8.4 — FeatureChoice sub-selections:
      When the active Class (or Race/Deity) feature has a `choices` array
      (e.g., Cleric Domains, Weapon Focus weapon type), additional dropdowns
      are dynamically rendered below the main selectors.
      The player's selection is stored in `ActiveFeatureInstance.selections`
      as a `Record<choiceId, string[]>`. This is the data read by the engine
      when evaluating conditional modifiers that reference `@selection.<choiceId>`.

  ARCHITECTURE NOTES:
    - Reads: `engine.character.activeFeatures`, `engine.phase0_activeTags`
    - Reads: `dataLoader.queryFeatures()` for dropdown populations
    - Writes: `engine.addFeature()`, `engine.removeFeature()`,
              direct mutation of `engine.character.classLevels`,
              direct mutation of `activeFeatureInstance.selections[choiceId]`
    - No D&D rules computed here — only feature lookup and engine dispatching.

  @see src/lib/engine/GameEngine.svelte.ts for the feature mutation methods.
  @see src/lib/types/feature.ts for FeatureChoice type definition.
  @see ARCHITECTURE.md Phase 8.4 for the FeatureChoice specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { formatModifier } from '$lib/utils/formatters';
  import type { Feature } from '$lib/types/feature';
  import type { ID } from '$lib/types/primitives';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import { IconInfo } from '$lib/components/ui/icons';

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
  // PHASE 8.4: FEATURE CHOICE SUB-SELECTIONS
  // ============================================================

  /**
   * Finds the `ActiveFeatureInstance` for the currently active class (or race/deity).
   * We need the INSTANCE (not just the Feature) to read and write `selections`.
   */
  function getActiveCategoryInstance(category: string) {
    return engine.character.activeFeatures.find(afi => {
      if (!afi.isActive) return false;
      const feature = dataLoader.getFeature(afi.featureId);
      return feature?.category === category;
    });
  }

  /**
   * Returns the `choices` array for the active class feature.
   * These are the FeatureChoice prompts that need sub-selector dropdowns.
   *
   * Example: Cleric has two domain choices; Weapon Focus has a weapon type choice.
   * The engine shows these choices dynamically — there are no hardcoded references
   * to specific class names like "Cleric" or "Wizard."
   */
  const activeClassChoices = $derived.by(() => {
    if (!activeClass?.choices?.length) return [];
    return activeClass.choices;
  });

  /**
   * The current selections for the active class instance.
   * Key: `choice.choiceId`, Value: array of selected Feature IDs (strings).
   */
  const activeClassSelections = $derived.by(() => {
    const instance = getActiveCategoryInstance('class');
    return instance?.selections ?? {};
  });

  /**
   * Handles a FeatureChoice selection change for the active class.
   *
   * How it works:
   *   1. Find the active class `ActiveFeatureInstance` by category.
   *   2. Ensure `instance.selections` exists (lazy-initialise on first choice).
   *   3. Set `selections[choiceId] = [selectedFeatureId]` (always maxSelections=1 for now;
   *      multi-select support can be added when needed).
   *
   * The `selections` mutation causes `engine.phase0_context` to read the new selection
   * in subsequent condition evaluations (e.g., Weapon Focus conditional modifier
   * checks `@selection.weapon_choice` against the equipped weapon's tags).
   *
   * @param choiceId  - The FeatureChoice.choiceId being set.
   * @param featureId - The selected option's Feature ID, or "" to clear.
   */
  function handleChoiceChange(choiceId: string, featureId: string) {
    const instance = getActiveCategoryInstance('class');
    if (!instance) return;

    // Lazy-initialise selections record
    if (!instance.selections) {
      instance.selections = {};
    }

    if (featureId) {
      instance.selections[choiceId] = [featureId];
    } else {
      delete instance.selections[choiceId];
    }

    // Force Svelte 5 to detect the mutation by reassigning the reference
    // (Svelte 5's deep reactivity should pick this up, but explicit re-emission is safer)
    engine.character.activeFeatures = [...engine.character.activeFeatures];
  }

  // ============================================================
  // FEATURE MODAL STATE
  // ============================================================

  /** ID of the feature currently shown in the FeatureModal. Null = modal closed. */
  let modalFeatureId = $state<ID | null>(null);
</script>

<div class="basic-info-panel">
   <h2 class="panel-title"><IconInfo size={24} aria-hidden="true" /> Basic Information</h2>

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
  <!-- PHASE 8.4: FEATURE CHOICE SUB-SELECTIONS (dynamic) -->
  <!--
    These dropdowns appear ONLY when the active class (or other feature)
    has a `choices` array. They are derived directly from the Feature JSON —
    no hardcoded class names are needed.

    Examples:
      - Cleric:  Two domain dropdowns appear (domain_choice_1, domain_choice_2).
      - Weapon Focus: One weapon type dropdown appears (weapon_choice).
      - Dromite:  Energy type dropdown appears (chitin_energy_type).

    HOW OPTIONSQUERY IS RESOLVED:
      The `choice.optionsQuery` string (e.g., "tag:domain", "tag:weapon")
      is passed to `dataLoader.queryFeatures(optionsQuery)` which returns
      all matching Feature objects from the cache. The player selects from
      this filtered list. If the cache is empty or no matches, the dropdown
      shows "No options available."
  -->
  {#if activeClassChoices.length > 0}
    <div class="choices-section">
      <h3 class="choices-title">
        {engine.t(activeClass?.label ?? {})} — Choices
      </h3>
      <div class="choices-grid">
        {#each activeClassChoices as choice}
          {@const options = dataLoader.queryFeatures(choice.optionsQuery)}
          {@const currentSelection = activeClassSelections[choice.choiceId]?.[0] ?? ''}

          <div class="choice-group">
            <label
              for="choice-{choice.choiceId}"
              class="choice-label"
            >
              {engine.t(choice.label)}
              {#if choice.maxSelections > 1}
                <span class="choice-max-hint">(up to {choice.maxSelections})</span>
              {/if}
            </label>

            <div class="select-wrapper">
              <select
                id="choice-{choice.choiceId}"
                class="selector"
                value={currentSelection}
                onchange={(e) => handleChoiceChange(choice.choiceId, (e.target as HTMLSelectElement).value)}
                aria-label="{engine.t(choice.label)}"
              >
                <option value="">— Select —</option>
                {#each options as option}
                  <option value={option.id}>
                    {engine.t(option.label)}
                    {#if getModifierBadges(option).length}
                      ({getModifierBadges(option).join(', ')})
                    {/if}
                  </option>
                {/each}
              </select>
            </div>

            {#if options.length === 0}
              <p class="no-options-hint">
                No options matching <code>{choice.optionsQuery}</code>.
                Enable a rule source with this content.
              </p>
            {/if}

            <!-- Show selected feature's modal on info button -->
            {#if currentSelection}
              <button
                class="info-btn choice-info-btn"
                onclick={() => (modalFeatureId = currentSelection)}
                aria-label="Show selected option details"
                title="Show details for selected option"
              >ℹ</button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

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

  /* ========================= FEATURE CHOICES (Phase 8.4) ========================= */
  .choices-section {
    margin-top: 1.25rem;
    border-top: 1px solid #21262d;
    padding-top: 1rem;
  }

  .choices-title {
    margin: 0 0 0.75rem;
    font-size: 0.85rem;
    color: #7c3aed;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .choices-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.75rem;
  }

  .choice-group {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    position: relative;
  }

  .choice-label {
    font-size: 0.78rem;
    color: #9090c0;
    font-weight: 500;
  }

  .choice-max-hint {
    font-size: 0.68rem;
    color: #6080a0;
    margin-left: 0.2rem;
  }

  .choice-info-btn {
    position: absolute;
    top: 0;
    right: 0;
    width: 1.3rem;
    height: 1.3rem;
    font-size: 0.7rem;
  }
</style>
