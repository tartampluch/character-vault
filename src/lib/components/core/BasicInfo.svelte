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
              direct mutation of `engine.character.classLevels`,
              direct mutation of `activeFeatureInstance.selections[choiceId]`
    - No D&D rules computed here — only feature lookup and engine dispatching.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { formatModifier } from '$lib/utils/formatters';
  import type { Feature } from '$lib/types/feature';
  import type { ID } from '$lib/types/primitives';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import { IconInfo } from '$lib/components/ui/icons';

  // ── Dropdown populations ────────────────────────────────────────────────────
  const races   = $derived(dataLoader.queryFeatures('category:race'));
  const classes = $derived(dataLoader.queryFeatures('category:class'));
  const deities = $derived(dataLoader.queryFeatures('category:deity'));

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

  // ── Modifier badges helper ──────────────────────────────────────────────────
  function getModifierBadges(feature: Feature): string[] {
    if (!feature.grantedModifiers?.length) return [];
    return feature.grantedModifiers
      .filter(mod => typeof mod.value === 'number' && mod.value !== 0)
      .slice(0, 3)
      .map(mod => {
        const valStr = formatModifier(mod.value as number);
        const shortTarget = mod.targetId
          .replace('stat_', '')
          .replace('attributes.stat_', '')
          .toUpperCase()
          .slice(0, 5);
        return `${valStr} ${shortTarget}`;
      });
  }

  // ── Selection handlers ──────────────────────────────────────────────────────
  function makeCategoryInstanceId(category: string, featureId: ID): string {
    return `afi_${category}_${featureId}`;
  }

  function removeAllOfCategory(category: string): void {
    const toRemove = engine.character.activeFeatures
      .filter(afi => {
        const f = dataLoader.getFeature(afi.featureId);
        return f?.category === category;
      })
      .map(afi => afi.instanceId);
    for (const id of toRemove) engine.removeFeature(id);
  }

  function handleRaceChange(event: Event) {
    const featureId = (event.target as HTMLSelectElement).value;
    removeAllOfCategory('race');
    if (featureId) {
      engine.addFeature({ instanceId: makeCategoryInstanceId('race', featureId), featureId, isActive: true });
    }
  }

  function handleClassChange(event: Event) {
    const featureId = (event.target as HTMLSelectElement).value;
    removeAllOfCategory('class');
    if (featureId) {
      if (!engine.character.classLevels[featureId]) {
        engine.character.classLevels[featureId] = 1;
      }
      engine.addFeature({ instanceId: makeCategoryInstanceId('class', featureId), featureId, isActive: true });
    } else {
      if (activeClass) delete engine.character.classLevels[activeClass.id];
    }
  }

  function handleDeityChange(event: Event) {
    const featureId = (event.target as HTMLSelectElement).value;
    removeAllOfCategory('deity');
    if (featureId) {
      engine.addFeature({ instanceId: makeCategoryInstanceId('deity', featureId), featureId, isActive: true });
    }
  }

  function handleAlignmentChange(event: Event) {
    const alignmentId = (event.target as HTMLSelectElement).value;
    const toRemove = engine.character.activeFeatures
      .filter(afi => afi.featureId.startsWith('alignment_'))
      .map(afi => afi.instanceId);
    for (const id of toRemove) engine.removeFeature(id);

    if (alignmentId) {
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
      engine.addFeature({ instanceId: `afi_alignment_${alignmentId}`, featureId: alignmentId, isActive: true });
    }
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

  function handleChoiceChange(choiceId: string, featureId: string) {
    const instance = getActiveCategoryInstance('class');
    if (!instance) return;
    if (!instance.selections) instance.selections = {};
    if (featureId) {
      instance.selections[choiceId] = [featureId];
    } else {
      delete instance.selections[choiceId];
    }
    engine.character.activeFeatures = [...engine.character.activeFeatures];
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
    <span>Basic Information</span>
  </div>

  <!-- ========================================================= -->
  <!-- SELECTORS GRID — 2-col on sm+, 1-col on xs               -->
  <!-- ========================================================= -->
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">

    <!-- RACE -->
    <div class="flex flex-col gap-1">
      <div class="flex items-center gap-1.5">
        <label for="race-select" class="text-xs font-semibold uppercase tracking-wider text-text-muted flex-1">
          Race
        </label>
        {#if activeRace}
          <button
            class="btn-ghost p-1 rounded-full"
            onclick={() => (modalFeatureId = activeRace?.id ?? null)}
            title="Show race details"
            aria-label="Show {engine.t(activeRace.label)} details"
            type="button"
          >
            <IconInfo size={14} aria-hidden="true" />
          </button>
        {/if}
      </div>
      <select
        id="race-select"
        class="select"
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
      <!-- Active race modifier badges -->
      {#if activeRace}
        {@const badges = getModifierBadges(activeRace)}
        {#if badges.length}
          <div class="flex flex-wrap gap-1 mt-0.5">
            {#each badges as badge}
              <span class="badge-accent font-mono">{badge}</span>
            {/each}
          </div>
        {/if}
      {/if}
    </div>

    <!-- CLASS -->
    <div class="flex flex-col gap-1">
      <div class="flex items-center gap-1.5">
        <label for="class-select" class="text-xs font-semibold uppercase tracking-wider text-text-muted flex-1">
          Class
        </label>
        {#if activeClass}
          <button
            class="btn-ghost p-1 rounded-full"
            onclick={() => (modalFeatureId = activeClass?.id ?? null)}
            title="Show class details"
            aria-label="Show {engine.t(activeClass.label)} details"
            type="button"
          >
            <IconInfo size={14} aria-hidden="true" />
          </button>
        {/if}
      </div>
      <select
        id="class-select"
        class="select"
        value={activeClass?.id ?? ''}
        onchange={handleClassChange}
        aria-label="Select character class"
      >
        <option value="">— None —</option>
        {#each classes as cls}
          <option value={cls.id}>{engine.t(cls.label)}</option>
        {/each}
      </select>
      <!-- Class level input + recommended attrs -->
      {#if activeClass}
        {@const classLevel = engine.character.classLevels[activeClass.id] ?? 1}
        <div class="flex items-center gap-2 flex-wrap mt-0.5">
          <label for="class-level-input" class="text-xs text-text-muted flex-1 min-w-0 truncate">
            Level in {engine.t(activeClass.label)}:
          </label>
          <input
            id="class-level-input"
            type="number"
            min="1"
            max="20"
            value={classLevel}
            class="input w-14 text-center px-1"
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
          <div class="flex items-center gap-1 flex-wrap">
            <span class="text-xs text-text-muted">Recommended:</span>
            {#each activeClass.recommendedAttributes as attrId}
              <span class="badge-green font-mono">{attrId.replace('stat_', '').toUpperCase()}</span>
            {/each}
          </div>
        {/if}
      {/if}
    </div>

    <!-- DEITY -->
    <div class="flex flex-col gap-1">
      <div class="flex items-center gap-1.5">
        <label for="deity-select" class="text-xs font-semibold uppercase tracking-wider text-text-muted flex-1">
          Deity
        </label>
        {#if activeDeity}
          <button
            class="btn-ghost p-1 rounded-full"
            onclick={() => (modalFeatureId = activeDeity?.id ?? null)}
            title="Show deity details"
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
        <option value="">— None —</option>
        {#each deities as deity}
          <option value={deity.id}>{engine.t(deity.label)}</option>
        {/each}
      </select>
      {#if deities.length === 0}
        <p class="text-xs text-text-muted italic mt-0.5">
          No deities loaded. Enable a rule source with deity data.
        </p>
      {/if}
    </div>

    <!-- ALIGNMENT -->
    <div class="flex flex-col gap-1">
      <label for="alignment-select" class="text-xs font-semibold uppercase tracking-wider text-text-muted">
        Alignment
      </label>
      <select
        id="alignment-select"
        class="select"
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

  </div><!-- /selectors-grid -->

  <!-- ================================================================= -->
  <!-- PHASE 8.4: FEATURE CHOICE SUB-SELECTIONS                          -->
  <!-- Rendered only when the active class has choices (e.g., domains).  -->
  <!-- ================================================================= -->
  {#if activeClassChoices.length > 0}
    <div class="flex flex-col gap-3 pt-3 border-t border-border">

      <!-- Sub-header for the choices block -->
      <p class="text-xs font-semibold uppercase tracking-wider text-accent">
        {engine.t(activeClass?.label ?? {})} — Choices
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {#each activeClassChoices as choice}
          {@const options = dataLoader.queryFeatures(choice.optionsQuery)}
          {@const currentSelection = activeClassSelections[choice.choiceId]?.[0] ?? ''}

          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-1.5">
              <label
                for="choice-{choice.choiceId}"
                class="text-xs font-medium text-text-secondary flex-1"
              >
                {engine.t(choice.label)}
                {#if choice.maxSelections > 1}
                  <span class="text-text-muted ml-1">(up to {choice.maxSelections})</span>
                {/if}
              </label>
              {#if currentSelection}
                <button
                  class="btn-ghost p-1 rounded-full"
                  onclick={() => (modalFeatureId = currentSelection)}
                  aria-label="Show selected option details"
                  title="Show details for selected option"
                  type="button"
                >
                  <IconInfo size={14} aria-hidden="true" />
                </button>
              {/if}
            </div>

            <select
              id="choice-{choice.choiceId}"
              class="select"
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

            {#if options.length === 0}
              <p class="text-xs text-text-muted italic">
                No options matching <code class="bg-surface-alt px-1 rounded">{choice.optionsQuery}</code>.
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
