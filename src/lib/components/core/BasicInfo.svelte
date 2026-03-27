<!--
  @file src/lib/components/core/BasicInfo.svelte
  @description Basic Information panel for the Core tab of the character sheet.
  (Phase 8.3: Race/Class/Deity/Alignment selectors + Phase 8.4: FeatureChoice sub-selections)
  Phase 19.7: Migrated to Tailwind CSS — all scoped <style> removed.

  PURPOSE:
    Provides dropdown selectors for the character's fundamental choices:
      - Race (category: "race")
      - Class (category: "class")
      - Deity (category: "deity")
      - Alignment (alignment tag injection)

    Phase 8.4 — FeatureChoice sub-selections:
      When the active Class (or Race/Deity) feature has a `choices` array
      (e.g., Cleric Domains, Weapon Focus weapon type), additional dropdowns
      are dynamically rendered below the main selectors.

  ARCHITECTURE NOTES:
    - Reads: `engine.character.activeFeatures`, `engine.phase0_activeTags`
    - Reads: `dataLoader.queryFeatures()` for dropdown populations
    - Writes: `engine.addFeature()`, `engine.removeFeature()`,
              `engine.setClassLevel()`, `engine.deleteClassLevel()` (never direct
              mutation of `character.classLevels`),
              `engine.setFeatureSelection()` (never direct mutation of
              `activeFeatureInstance.selections`)
    - No D&D rules computed here — only feature lookup and engine dispatching.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { ui } from '$lib/i18n/ui-strings';
  import { getAbilityAbbr, ALIGNMENTS, MAX_CLASS_LEVEL } from '$lib/utils/constants';
  import type { Feature } from '$lib/types/feature';
  import type { ID } from '$lib/types/primitives';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import { IconInfo } from '$lib/components/ui/icons';

  // ── Dropdown populations ────────────────────────────────────────────────────
  const races   = $derived(dataLoader.queryFeatures('category:race'));
  const classes = $derived(dataLoader.queryFeatures('category:class'));
  const deities = $derived(dataLoader.queryFeatures('category:deity'));

  // ALIGNMENTS is imported from constants.ts (zero-hardcoding rule, ARCHITECTURE.md §6).
  // The 9 standard D&D 3.5 alignments are centralized as game content, not embedded here.

  // ── Current selections ──────────────────────────────────────────────────────
  function getActiveCategoryFeature(category: string): Feature | undefined {
    for (const afi of engine.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feature = dataLoader.getFeature(afi.featureId);
      if (feature?.category === category) return feature;
    }
    return undefined;
  }

  const activeRace      = $derived(getActiveCategoryFeature('race'));
  const activeClass     = $derived(getActiveCategoryFeature('class'));
  const activeDeity     = $derived(getActiveCategoryFeature('deity'));
  const activeAlignment = $derived(
    engine.phase0_activeTags.find(tag => tag.startsWith('alignment_')) ?? ''
  );

  // ── Selection handlers ──────────────────────────────────────────────────────

  function handleRaceChange(event: Event) {
    const featureId = (event.target as HTMLSelectElement).value;
    // Delegate the full race-replacement lifecycle to the engine:
    //   remove old race instances → add new race instance.
    // engine.replaceRace() owns all coordination so this component stays a
    // dumb dispatcher (zero-game-logic-in-Svelte, ARCHITECTURE.md §3).
    engine.replaceRace(featureId);
  }

  function handleClassChange(event: Event) {
    const featureId = (event.target as HTMLSelectElement).value;
    // Delegate the full class-replacement lifecycle to the engine:
    //   remove old instances + classLevels entries → add new class at level 1.
    // The engine.replaceClass() method owns all multi-step coordination so this
    // component stays a dumb dispatcher (zero-game-logic-in-Svelte, ARCHITECTURE.md §3).
    engine.replaceClass(featureId);
  }

  function handleDeityChange(event: Event) {
    const featureId = (event.target as HTMLSelectElement).value;
    // Delegate the full deity-replacement lifecycle to the engine:
    //   remove old deity instances → add new deity instance.
    // engine.replaceDeity() owns all coordination (zero-game-logic-in-Svelte, ARCHITECTURE.md §3).
    engine.replaceDeity(featureId);
  }

  function handleAlignmentChange(event: Event) {
    const alignmentId = (event.target as HTMLSelectElement).value;
    // Delegate all alignment logic (removal, feature synthesis, instance addition) to the
    // engine. Previously this function called dataLoader.cacheFeature() directly, which
    // violated the zero-game-logic-in-Svelte rule (ARCHITECTURE.md §3). The engine method
    // engine.setAlignment() now owns the full alignment lifecycle.
    engine.setAlignment(alignmentId);
  }

  // ── Phase 8.4: FeatureChoice sub-selections ─────────────────────────────────
  function getActiveCategoryInstance(category: string) {
    return engine.character.activeFeatures.find(afi => {
      if (!afi.isActive) return false;
      const feature = dataLoader.getFeature(afi.featureId);
      return feature?.category === category;
    });
  }

  const activeClassChoices    = $derived.by(() => activeClass?.choices?.length ? activeClass.choices : []);
  const activeClassSelections = $derived.by(() => getActiveCategoryInstance('class')?.selections ?? {});

  /**
   * Called when the player selects or clears a single-select class choice
   * (e.g. Cleric domains, Sorcerer bloodline, Wizard school).
   *
   * ZERO-GAME-LOGIC RULE (ARCHITECTURE.md §3):
   *   Direct mutation of `instance.selections` from a Svelte component violates
   *   the dumb-UI contract. We delegate all character state writes to the engine
   *   via `engine.setFeatureSelection()`, which handles reactivity internally.
   */
  function handleChoiceChange(choiceId: string, featureId: string) {
    const instance = getActiveCategoryInstance('class');
    if (!instance) return;
    engine.setFeatureSelection(instance.featureId, choiceId, featureId ? [featureId] : []);
  }

  /**
   * Returns the set of option IDs that must be excluded from a given choice.
   *
   * Exclusion sources:
   *   1. `choice.excludedBy` — sibling choiceId whose current selection is blocked.
   *      A domain already picked for "domain_1" cannot also be picked for "domain_2".
   *   2. The choice's own current selection — you can't re-pick the same domain
   *      (this is implicit: if domain_1 is in domain_2's excludedBy, the same
   *      ID is blocked; but we guard it explicitly too for single-choice lists).
   */
  function getExcludedOptionIds(choice: typeof activeClassChoices[number]): Set<string> {
    const excluded = new Set<string>();
    if (!choice.excludedBy?.length) return excluded;

    const selections = activeClassSelections;
    for (const siblingChoiceId of choice.excludedBy) {
      const siblingSelection = selections[siblingChoiceId];
      if (siblingSelection?.length) {
        for (const id of siblingSelection) excluded.add(id);
      }
    }
    return excluded;
  }

  // ── Feature modal ────────────────────────────────────────────────────────────
  let modalFeatureId = $state<ID | null>(null);
</script>

<!--
  BASIC INFORMATION PANEL
  card from app.css: bg-surface rounded-lg border border-border shadow-sm
-->
<div class="card p-4 flex flex-col gap-4">

  <!-- Section header -->
  <div class="section-header border-b border-border pb-2">
    <IconInfo size={20} aria-hidden="true" />
    <span>{ui('core.basic_info', engine.settings.language)}</span>
  </div>

  <!-- ========================================================= -->
  <!-- NAME FIELDS — character name + player name               -->
  <!-- ========================================================= -->
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">

    <!-- CHARACTER NAME -->
    <div class="flex flex-col gap-1">
      <label for="character-name-input" class="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {ui('core.character_name', engine.settings.language)}
      </label>
      <input
        id="character-name-input"
        type="text"
        class="input"
        value={engine.character.name}
        placeholder={ui('core.character_name_placeholder', engine.settings.language)}
        maxlength="80"
        oninput={(e) => engine.setCharacterName((e.target as HTMLInputElement).value)}
        aria-label={ui('core.character_name', engine.settings.language)}
      />
    </div>

    <!-- PLAYER NAME (PCs only) -->
    {#if !engine.character.isNPC}
      <div class="flex flex-col gap-1">
        <label for="player-name-input" class="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {ui('core.player_name', engine.settings.language)}
        </label>
        <input
          id="player-name-input"
          type="text"
          class="input"
          value={engine.character.playerName ?? ''}
          placeholder={ui('core.player_name_placeholder', engine.settings.language)}
          maxlength="80"
          oninput={(e) => engine.setPlayerName((e.target as HTMLInputElement).value)}
          aria-label={ui('core.player_name', engine.settings.language)}
        />
      </div>
    {/if}

  </div>

  <!-- ========================================================= -->
  <!-- SELECTORS GRID — 2-col on sm+, 1-col on xs               -->
  <!-- ========================================================= -->
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">

    <!-- RACE -->
    <div class="flex flex-col gap-1">
      <label for="race-select" class="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {ui('core.race', engine.settings.language)}
      </label>
      <!-- dropdown + (i) button side by side -->
      <div class="flex items-center gap-1.5">
        <select
          id="race-select"
          class="select flex-1"
          value={activeRace?.id ?? ''}
          onchange={handleRaceChange}
          aria-label="Select character race"
        >
          <option value="">{ui('core.none', engine.settings.language)}</option>
          {#each races as race}
            <option value={race.id}>{engine.t(race.label)}</option>
          {/each}
        </select>
        {#if activeRace}
          <button
            class="btn-ghost p-1 rounded-full shrink-0"
            onclick={() => (modalFeatureId = activeRace?.id ?? null)}
            title={ui('core.show_details', engine.settings.language)}
            aria-label="Show {engine.t(activeRace.label)} details"
            type="button"
          ><IconInfo size={14} aria-hidden="true" /></button>
        {/if}
      </div>
      <!-- Stat modifier pills — same style as class recommended-attrs badges.
           Delegated to engine.getFeatureAbilityModifierPills() per the
           zero-game-logic-in-Svelte rule (ARCHITECTURE.md §3): filtering
           grantedModifiers by ability-score pipeline IDs is game-domain logic. -->
      {#if activeRace}
        {@const pills = engine.getFeatureAbilityModifierPills(activeRace, engine.settings.language)}
        {#if pills.length}
          <div class="flex flex-wrap gap-1 mt-0.5">
            {#each pills as pill}
              <span class="font-mono {pill.positive ? 'badge-green' : pill.zero ? 'badge-gray' : 'badge-red'}"
              >{pill.label}</span>
            {/each}
          </div>
        {/if}
      {/if}
    </div>

    <!-- CLASS -->
    <div class="flex flex-col gap-1">
      <label for="class-select" class="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {ui('core.class', engine.settings.language)}
      </label>
      <!-- dropdown + (i) button side by side -->
      <div class="flex items-center gap-1.5">
        <select
          id="class-select"
          class="select flex-1"
          value={activeClass?.id ?? ''}
          onchange={handleClassChange}
          aria-label="Select character class"
        >
          <option value="">{ui('core.none', engine.settings.language)}</option>
          {#each classes as cls}
            <option value={cls.id}>{engine.t(cls.label)}</option>
          {/each}
        </select>
        {#if activeClass}
          <button
            class="btn-ghost p-1 rounded-full shrink-0"
            onclick={() => (modalFeatureId = activeClass?.id ?? null)}
            title={ui('core.show_details', engine.settings.language)}
            aria-label="Show {engine.t(activeClass.label)} details"
            type="button"
          ><IconInfo size={14} aria-hidden="true" /></button>
        {/if}
      </div>
      <!-- Class level input + recommended attrs -->
      {#if activeClass}
        {@const classLevel = engine.character.classLevels[activeClass.id] ?? 1}
        <div class="flex items-center gap-2 flex-wrap mt-0.5">
          <label for="class-level-input" class="text-xs text-text-muted flex-1 min-w-0 truncate">
            {ui('core.level_in', engine.settings.language)} {engine.t(activeClass.label)}:
          </label>
          <input
            id="class-level-input"
            type="number"
            min="1"
            max={MAX_CLASS_LEVEL}
            value={classLevel}
            class="input w-14 text-center px-1"
            onchange={(e) => {
              const lvl = parseInt((e.target as HTMLInputElement).value, 10);
              // Delegate to engine.setClassLevel() — all bounds clamping (≥ 1,
              // ≤ MAX_CLASS_LEVEL) is validated inside the engine method, not here
              // (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
              if (!isNaN(lvl) && activeClass) {
                engine.setClassLevel(activeClass.id, lvl);
              }
            }}
            aria-label="Class level"
          />
        </div>
        {#if activeClass.recommendedAttributes?.length}
          <div class="flex items-center gap-1 flex-wrap">
            <span class="text-xs text-text-muted">{ui('core.recommended', engine.settings.language)}</span>
            {#each activeClass.recommendedAttributes as attrId}
              <span class="badge-green font-mono">{getAbilityAbbr(attrId, engine.settings.language)}</span>
            {/each}
          </div>
        {/if}
      {/if}
    </div>

    <!-- DEITY -->
    <div class="flex flex-col gap-1">
      <div class="flex items-center gap-1.5">
        <label for="deity-select" class="text-xs font-semibold uppercase tracking-wider text-text-muted flex-1">
          {ui('core.deity', engine.settings.language)}
        </label>
        {#if activeDeity}
          <button
            class="btn-ghost p-1 rounded-full"
            onclick={() => (modalFeatureId = activeDeity?.id ?? null)}
            title={ui('core.show_details', engine.settings.language)}
            aria-label="Show {engine.t(activeDeity.label)} details"
            type="button"
          >
            <IconInfo size={14} aria-hidden="true" />
          </button>
        {/if}
      </div>
      <select
        id="deity-select"
        class="select"
        value={activeDeity?.id ?? ''}
        onchange={handleDeityChange}
        aria-label="Select deity"
      >
        <option value="">{ui('core.none', engine.settings.language)}</option>
        {#each deities as deity}
          <option value={deity.id}>{engine.t(deity.label)}</option>
        {/each}
      </select>
      {#if deities.length === 0}
        <p class="text-xs text-text-muted italic mt-0.5">
          {ui('core.no_deities', engine.settings.language)}
        </p>
      {/if}
    </div>

    <!-- ALIGNMENT -->
    <div class="flex flex-col gap-1">
      <label for="alignment-select" class="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {ui('core.alignment', engine.settings.language)}
      </label>
      <select
        id="alignment-select"
        class="select"
        value={activeAlignment}
        onchange={handleAlignmentChange}
        aria-label="Select alignment"
      >
        <option value="">{ui('core.none', engine.settings.language)}</option>
        {#each ALIGNMENTS as alignment}
          <!-- alignment.ui_key (e.g. 'alignment.lawful_good') resolves via
               ui-strings.ts baseline and loaded locale JSON files. No inline
               translations in constants.ts (ARCHITECTURE.md §6). -->
          <option value={alignment.id}>{ui(alignment.ui_key, engine.settings.language)}</option>
        {/each}
      </select>
    </div>

  </div><!-- /selectors-grid -->

  <!-- ================================================================= -->
  <!-- PHASE 8.4: FEATURE CHOICE SUB-SELECTIONS                          -->
  <!-- Rendered only when the active class has choices (e.g., domains).  -->
  <!-- ================================================================= -->
  {#if activeClassChoices.length > 0}
    <div class="flex flex-col gap-3 pt-3 border-t border-border">

      <!-- Sub-header for the choices block -->
      <p class="text-xs font-semibold uppercase tracking-wider text-accent">
        {engine.t(activeClass?.label ?? {})} — {ui('core.choices', engine.settings.language)}
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {#each activeClassChoices as choice}
          {@const allOptions     = dataLoader.queryFeatures(choice.optionsQuery)}
          {@const excludedIds    = getExcludedOptionIds(choice)}
          {@const options        = allOptions.filter(o => !excludedIds.has(o.id))}
          {@const currentSelection = activeClassSelections[choice.choiceId]?.[0] ?? ''}

          <div class="flex flex-col gap-1">
            <!-- Label row (no info button here — it moves to the right of the dropdown) -->
            <label
              for="choice-{choice.choiceId}"
              class="text-xs font-medium text-text-secondary"
            >
              {engine.t(choice.label)}
              {#if choice.maxSelections > 1}
                <span class="text-text-muted ml-1">({ui('core.up_to', engine.settings.language)} {choice.maxSelections})</span>
              {/if}
            </label>

            <!-- Dropdown + (i) button side by side — same pattern as race/class dropdowns -->
            <div class="flex items-center gap-1.5">
              <select
                id="choice-{choice.choiceId}"
                class="select flex-1"
                value={currentSelection}
                onchange={(e) => handleChoiceChange(choice.choiceId, (e.target as HTMLSelectElement).value)}
                aria-label="{engine.t(choice.label)}"
              >
              <option value="">{ui('core.select', engine.settings.language)}</option>
              {#each options as option}
                <option value={option.id}>{engine.t(option.label)}</option>
              {/each}
              </select>
              {#if currentSelection}
                <button
                  class="btn-ghost p-1 rounded-full shrink-0"
                  onclick={() => (modalFeatureId = currentSelection)}
                  aria-label={ui('core.show_option_details_aria', engine.settings.language)}
                  title={ui('core.show_details', engine.settings.language)}
                  type="button"
                ><IconInfo size={14} aria-hidden="true" /></button>
              {/if}
            </div><!-- /dropdown+info row -->

            {#if allOptions.length === 0}
              <p class="text-xs text-text-muted italic">
                {ui('core.no_options', engine.settings.language)} <code class="bg-surface-alt px-1 rounded">{choice.optionsQuery}</code>.
              </p>
            {/if}
          </div>
        {/each}
      </div>

    </div>
  {/if}

</div>

<!-- Feature Modal -->
{#if modalFeatureId}
  <FeatureModal
    featureId={modalFeatureId}
    onclose={() => (modalFeatureId = null)}
  />
{/if}
