<!--
  @file src/lib/components/content-editor/PipelinePickerModal.svelte
  @description Modal for picking a pipeline ID when building a Modifier's `targetId`.

  PURPOSE:
    GMs authoring homebrew modifiers need to specify which pipeline a modifier
    targets (e.g. "Strength score", "AC", "Fortitude save"). Without a picker,
    they would have to know internal pipeline IDs like `"attributes.stat_strength"` or
    `"combatStats.base_attack_bonus"` by heart — a prohibitive friction point.

    This modal exposes:
      1. All STATIC pipeline IDs grouped by namespace (attributes, combatStats,
         saves, resources) — fully defined at design time.
      2. The SKILL pipelines — populated dynamically from the
         `config_skill_definitions` config table (loaded by DataLoader) so new
         skill sources added by GMs automatically appear here.
      3. A CUSTOM ID input — for homebrew pipelines that are not in the default
         set (e.g. a custom resource pool a GM defined in a homebrew class).

  USAGE (parent component):
    ```svelte
    let showPicker = $state(false);
    let chosenPipeline = $state('');

    {#if showPicker}
      <PipelinePickerModal
        onPipelinePicked={(id) => { chosenPipeline = id; showPicker = false; }}
        onclose={() => (showPicker = false)}
      />
    {/if}
    ```

  EVENT MODEL:
    This component uses the Svelte 5 callback-prop pattern (no createEventDispatcher).
    - `onPipelinePicked(id: string)` — called when the user confirms a pipeline.
    - `onclose()` — called when the user dismisses without picking.

  SECTIONS:
    Each namespace group is a collapsible `<details>` element. Sections open by
    default if their namespace matches the current search query (or all are open
    when there is no query). This lets the GM quickly scan the full catalog or
    narrow it with a search term.

  SEARCH:
    Live text search (case-insensitive) over pipeline IDs and labels.
    Matching rows are highlighted; non-matching rows are hidden.
    The "Custom Pipeline" section is always visible regardless of the search filter.

  @see ARCHITECTURE.md §21.4 for the picker modal design specification.
  @see src/lib/engine/GameEngine.svelte.ts for the full default pipeline list.
  @see static/rules/00_d20srd_core/04_d20srd_core_skills_config.json for skill IDs.
-->

<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';

  // ===========================================================================
  // PROPS
  // ===========================================================================

  interface Props {
    /**
     * Called when the user clicks a pipeline row or confirms the custom input.
     * The parent is responsible for closing the modal after handling the event.
     * @param pipelineId - The fully-qualified pipeline ID (e.g. "attributes.stat_strength").
     */
    onPipelinePicked: (pipelineId: string) => void;
    /** Called when the user dismisses the modal without selecting a pipeline. */
    onclose: () => void;
  }

  let { onPipelinePicked, onclose }: Props = $props();

  // ===========================================================================
  // SEARCH FILTER
  // ===========================================================================

  /** Current text in the search input. Updates reactively on every keystroke. */
  let searchQuery = $state('');

  /**
   * Normalised lower-case search term — derived so we only lower-case once per
   * render rather than once per row comparison.
   */
  const searchLower = $derived(searchQuery.toLowerCase().trim());

  // ===========================================================================
  // CUSTOM PIPELINE ID
  // ===========================================================================

  /**
   * Text in the "Custom Pipeline ID" input.
   * Allows GMs to target a homebrew pipeline that is not in the static catalog.
   * Example: "resources.barbarian_rage" for a custom barbarian resource pool.
   */
  let customPipelineId = $state('');

  /**
   * True when customPipelineId contains a syntactically plausible pipeline ID.
   * A minimal validation: non-empty after trim, no spaces, and not starting with "@".
   * We do NOT validate existence — the pipeline may not exist yet in the engine
   * (it is legal to target a pipeline from a feature that creates the pool).
   */
  const customIdIsValid = $derived(
    customPipelineId.trim().length > 0 &&
    !customPipelineId.includes(' ')      &&
    !customPipelineId.startsWith('@')
  );

  // ===========================================================================
  // STATIC PIPELINE CATALOG
  // ===========================================================================

  /**
   * A single entry in the pipeline catalog.
   * `baseValue` provides quick context — "this pipeline starts at 10" reassures
   * the GM that e.g. a +4 Enhancement bonus to Strength is correctly expressed.
   */
  interface PipelineEntry {
    /** Fully-qualified pipeline ID written into Modifier.targetId. */
    id: string;
    /** Human-readable English label for the table row. */
    label: string;
    /**
     * The engine's default base value before any modifiers are applied.
     * Shown in the "Base" column of the table.
     * `null` means "varies / data-driven" (used for skill rows).
     */
    baseValue: number | null;
  }

  /**
   * A named group of pipelines, rendered as one collapsible section.
   */
  interface PipelineGroup {
    /** Section heading (e.g. "Ability Scores"). */
    label: string;
    /** Unique string used as the `<details>` open state key. */
    key: string;
    /** All pipelines in this group. */
    entries: PipelineEntry[];
  }

  /**
   * The complete static pipeline catalog.
   *
   * WHY HARDCODED HERE?
   *   These pipelines are initialised unconditionally in GameEngine.svelte.ts
   *   (`initDefaultPipelines()`) and are always present regardless of which
   *   rule sources are enabled. Deriving them from engine state at render time
   *   would introduce a reactive dependency on the entire engine, which is
   *   heavier than necessary for a lookup table that never changes at runtime.
   *
   *   The skill group (below) is the only group that IS data-driven because
   *   skill IDs depend on loaded config tables and can be extended by homebrew.
   */
  const STATIC_GROUPS: PipelineGroup[] = [
    {
      label: 'Ability Scores',
      key:   'attributes',
      entries: [
        { id: 'attributes.stat_strength', label: 'Strength',          baseValue: 10 },
        { id: 'attributes.stat_dexterity', label: 'Dexterity',         baseValue: 10 },
        { id: 'attributes.stat_constitution', label: 'Constitution',      baseValue: 10 },
        { id: 'attributes.stat_intelligence', label: 'Intelligence',      baseValue: 10 },
        { id: 'attributes.stat_wisdom', label: 'Wisdom',            baseValue: 10 },
        { id: 'attributes.stat_charisma', label: 'Charisma',          baseValue: 10 },
        { id: 'attributes.stat_size',              label: 'Size Modifier',       baseValue:  0 },
        { id: 'attributes.stat_caster_level',      label: 'Caster Level',        baseValue:  0 },
        { id: 'attributes.stat_manifester_level',  label: 'Manifester Level',    baseValue:  0 },
      ],
    },
    {
      label: 'Combat Statistics',
      key:   'combatStats',
      entries: [
        { id: 'combatStats.ac_normal',            label: 'Armor Class (Normal)',        baseValue: 10 },
        { id: 'combatStats.ac_touch',             label: 'Touch Armor Class',           baseValue: 10 },
        { id: 'combatStats.ac_flat_footed',       label: 'Flat-Footed Armor Class',     baseValue: 10 },
        { id: 'combatStats.base_attack_bonus',                  label: 'Base Attack Bonus',           baseValue:  0 },
        { id: 'combatStats.initiative',                 label: 'Initiative',                  baseValue:  0 },
        { id: 'combatStats.grapple',              label: 'Grapple Check',               baseValue:  0 },
        { id: 'combatStats.max_hp',               label: 'Maximum Hit Points',          baseValue:  0 },
        { id: 'combatStats.speed_land',           label: 'Land Speed (ft.)',            baseValue: 30 },
        { id: 'combatStats.speed_burrow',         label: 'Burrow Speed (ft.)',          baseValue:  0 },
        { id: 'combatStats.speed_climb',          label: 'Climb Speed (ft.)',           baseValue:  0 },
        { id: 'combatStats.speed_fly',            label: 'Fly Speed (ft.)',             baseValue:  0 },
        { id: 'combatStats.speed_swim',           label: 'Swim Speed (ft.)',            baseValue:  0 },
        { id: 'combatStats.armor_check_penalty',  label: 'Armor Check Penalty',         baseValue:  0 },
        { id: 'combatStats.fortification',        label: 'Fortification (%)',           baseValue:  0 },
        { id: 'combatStats.arcane_spell_failure', label: 'Arcane Spell Failure (%)',    baseValue:  0 },
        { id: 'combatStats.max_dexterity_bonus',        label: 'Max Dex Bonus to AC',         baseValue: 99 },
      ],
    },
    {
      label: 'Saving Throws',
      key:   'saves',
      entries: [
        { id: 'saves.fortitude', label: 'Fortitude Save', baseValue: 0 },
        { id: 'saves.reflex',  label: 'Reflex Save',    baseValue: 0 },
        { id: 'saves.will', label: 'Will Save',      baseValue: 0 },
      ],
    },
    {
      label: 'Resources & Pools',
      key:   'resources',
      entries: [
        { id: 'resources.hp', label: 'Hit Points (current)', baseValue: null },
      ],
    },
  ];

  // ===========================================================================
  // DYNAMIC SKILL PIPELINES (from DataLoader config tables)
  // ===========================================================================

  /**
   * Interface for a single row from `config_skill_definitions.data`.
   * The data object is keyed by skill ID; each value is a skill definition.
   */
  interface SkillDefinition {
    id: string;
    label?: { en?: string; fr?: string };
    keyAbility?: string;
  }

  /**
   * Skill pipeline entries derived from the loaded `config_skill_definitions` table.
   *
   * WHY DYNAMIC?
   *   Skills have a fixed SRD set (Acrobatics, Bluff, Climb, etc.) but GMs can add
   *   homebrew skills by writing new entries into their rule source JSON. The pipeline
   *   IDs for these new skills (e.g. `"skills.skill_rune_reading"`) will not be in any
   *   static catalog, so we read the authoritative source — the DataLoader cache.
   *
   * CONFIG TABLE STRUCTURE (`config_skill_definitions`):
   *   Unlike most config tables (which have `data` as an array of records), the
   *   skill definitions table uses `data` as a plain OBJECT keyed by skill ID.
   *   This provides O(1) lookup by skill ID from the GameEngine.
   *   Here we simply `Object.values()` the data object to iterate all skills.
   *
   * FALLBACK:
   *   If the DataLoader hasn't loaded yet or the config table is absent, this
   *   derived array is empty and the skills section shows a loading hint.
   */
  const skillEntries = $derived.by((): PipelineEntry[] => {
    const table = dataLoader.getConfigTable('config_skill_definitions');
    if (!table || !table.data) return [];

    // The data is a plain object keyed by skill ID (not an array).
    const rawData = table.data as unknown as Record<string, SkillDefinition>;

    return Object.values(rawData)
      .map((def): PipelineEntry => ({
        id:         `skills.${def.id}`,
        label:      (def.label?.en ?? def.id),
        baseValue:  0,  // all skills start at 0 before ranks and ability mods
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  // ===========================================================================
  // SEARCH FILTERING
  // ===========================================================================

  /**
   * Returns true when a pipeline entry matches the current search query.
   * Matches if the query appears in the pipeline ID or its label (case-insensitive).
   * Always true when the query is empty (show everything).
   */
  function matchesSearch(entry: PipelineEntry): boolean {
    if (!searchLower) return true;
    return (
      entry.id.toLowerCase().includes(searchLower) ||
      entry.label.toLowerCase().includes(searchLower)
    );
  }

  /**
   * Returns true when at least one entry in the group matches the search query.
   * Used to auto-open / collapse sections based on relevance.
   */
  function groupHasMatch(entries: PipelineEntry[]): boolean {
    if (!searchLower) return true;
    return entries.some(matchesSearch);
  }

  /** Whether the skills section has any match for the current search query. */
  const skillsHaveMatch = $derived(!searchLower || skillEntries.some(matchesSearch));

  // ===========================================================================
  // SELECTION HANDLER
  // ===========================================================================

  /**
   * Called when the user clicks a pipeline row or confirms the custom ID.
   * Invokes the `onPipelinePicked` callback with the chosen pipeline ID.
   * The parent component is expected to close the modal in response.
   *
   * @param id - The pipeline ID to emit.
   */
  function pick(id: string): void {
    const trimmed = id.trim();
    if (!trimmed) return;
    onPipelinePicked(trimmed);
  }
</script>

<!--
  MODAL WRAPPER
  Modal is always `open={true}` — the parent controls mounting with `{#if ...}`.
  Size `lg` gives enough width for the three-column table (ID | Label | Base).
  `fullscreen` on mobile because the catalog has many rows.
-->
<Modal
  open={true}
  onClose={onclose}
  title="Pick a Pipeline"
  size="lg"
  fullscreen={true}
>
  {#snippet children()}
    <div class="flex flex-col gap-4">

      <!-- ------------------------------------------------------------------ -->
      <!-- SEARCH BAR                                                          -->
      <!-- ------------------------------------------------------------------ -->
      <div class="relative">
        <label for="pipeline-search" class="sr-only">Search pipelines</label>
        <input
          id="pipeline-search"
          type="search"
          class="input w-full pl-9"
          placeholder="Search by ID or label…"
          bind:value={searchQuery}
          autocomplete="off"
          spellcheck="false"
        />
        <!-- Search icon -->
        <svg
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted"
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>

      <!-- ------------------------------------------------------------------ -->
      <!-- STATIC + DYNAMIC PIPELINE GROUPS                                    -->
      <!-- ------------------------------------------------------------------ -->

      <!--
        Each group is a collapsible <details> element.
        When a search query is active, we force-open groups that have matches
        and leave others closed so the GM can see relevant results immediately.
        When there is no query, only the first group is open by default (avoids
        an overwhelming wall of rows on initial open).
      -->

      {#each STATIC_GROUPS as group, groupIndex (group.key)}
        {#if groupHasMatch(group.entries)}
          <details
            class="group/details border border-border rounded-lg overflow-hidden"
            open={searchLower ? true : groupIndex === 0}
          >
            <summary
              class="flex items-center justify-between px-4 py-2 cursor-pointer
                     bg-surface-alt text-sm font-semibold text-text-primary
                     hover:bg-accent/10 select-none list-none"
            >
              <span>{group.label}</span>
              <!-- Chevron — rotates when open -->
              <svg
                class="h-4 w-4 text-text-muted transition-transform
                       group-open/details:rotate-180"
                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </summary>

            <table class="w-full text-sm">
              <thead class="sr-only">
                <tr>
                  <th>Pipeline ID</th>
                  <th>Label</th>
                  <th>Default base value</th>
                </tr>
              </thead>
              <tbody>
                {#each group.entries.filter(matchesSearch) as entry (entry.id)}
                  <tr
                    class="border-t border-border hover:bg-accent/10 cursor-pointer
                           transition-colors"
                    onclick={() => pick(entry.id)}
                    onkeydown={(e) => e.key === 'Enter' && pick(entry.id)}
                    tabindex="0"
                    role="button"
                    aria-label="Select pipeline {entry.id}"
                  >
                    <!-- Pipeline ID (monospace, muted) -->
                    <td class="px-4 py-2 font-mono text-xs text-text-muted w-1/2 break-all">
                      {entry.id}
                    </td>
                    <!-- Human-readable label -->
                    <td class="px-4 py-2 text-text-primary">
                      {entry.label}
                    </td>
                    <!-- Default base value -->
                    <td class="px-4 py-2 text-right text-text-muted tabular-nums">
                      {#if entry.baseValue !== null}
                        {entry.baseValue}
                      {:else}
                        <span class="text-xs italic">—</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </details>
        {/if}
      {/each}

      <!-- ------------------------------------------------------------------ -->
      <!-- SKILLS GROUP (data-driven from DataLoader)                          -->
      <!-- ------------------------------------------------------------------ -->
      {#if skillsHaveMatch}
        <details
          class="group/details border border-border rounded-lg overflow-hidden"
          open={!!searchLower}
        >
          <summary
            class="flex items-center justify-between px-4 py-2 cursor-pointer
                   bg-surface-alt text-sm font-semibold text-text-primary
                   hover:bg-accent/10 select-none list-none"
          >
            <span>
              Skills
              {#if skillEntries.length > 0}
                <span class="ml-2 text-xs font-normal text-text-muted badge">
                  {skillEntries.length}
                </span>
              {/if}
            </span>
            <svg
              class="h-4 w-4 text-text-muted transition-transform
                     group-open/details:rotate-180"
              xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </summary>

          {#if skillEntries.length === 0}
            <!--
              Skill definitions are loaded from config_skill_definitions.
              If this message appears it means rule sources haven't been loaded yet.
            -->
            <p class="px-4 py-3 text-sm text-text-muted italic">
              Skills load automatically from rule sources. Enable a rule source
              in Campaign Settings to populate this list.
            </p>
          {:else}
            <table class="w-full text-sm">
              <thead class="sr-only">
                <tr><th>Pipeline ID</th><th>Skill Name</th><th>Base</th></tr>
              </thead>
              <tbody>
                {#each skillEntries.filter(matchesSearch) as entry (entry.id)}
                  <tr
                    class="border-t border-border hover:bg-accent/10 cursor-pointer
                           transition-colors"
                    onclick={() => pick(entry.id)}
                    onkeydown={(e) => e.key === 'Enter' && pick(entry.id)}
                    tabindex="0"
                    role="button"
                    aria-label="Select pipeline {entry.id}"
                  >
                    <td class="px-4 py-2 font-mono text-xs text-text-muted w-1/2 break-all">
                      {entry.id}
                    </td>
                    <td class="px-4 py-2 text-text-primary">{entry.label}</td>
                    <td class="px-4 py-2 text-right text-text-muted tabular-nums">0</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </details>
      {/if}

      <!-- ------------------------------------------------------------------ -->
      <!-- CUSTOM PIPELINE ID                                                   -->
      <!-- ------------------------------------------------------------------ -->
      <!--
        GMs can target pipelines that are not in the default set.
        Common cases:
          • A custom resource pool defined in a homebrew class feature
            (e.g. "resources.shadow_points" added by a Shadow Dancer class).
          • A homebrew statistic the GM defined as a new pipeline in their
            rule source JSON.
        The custom input is always visible regardless of the search filter so
        the GM can always fall through to it when the catalog comes up empty.
      -->
      <div class="border border-border rounded-lg p-4 bg-surface-alt space-y-3">
        <p class="text-sm font-semibold text-text-primary">Custom Pipeline ID</p>
        <p class="text-xs text-text-muted">
          For homebrew pipelines not listed above (e.g.&nbsp;
          <code class="font-mono">resources.shadow_points</code>).
          Enter the exact ID as it appears in your rule source JSON.
        </p>

        <div class="flex gap-2">
          <label for="custom-pipeline-id" class="sr-only">Custom pipeline ID</label>
          <input
            id="custom-pipeline-id"
            type="text"
            class="input flex-1 font-mono text-sm"
            placeholder="e.g. resources.shadow_points"
            bind:value={customPipelineId}
            autocomplete="off"
            spellcheck="false"
            onkeydown={(e) => {
              if (e.key === 'Enter' && customIdIsValid) {
                pick(customPipelineId);
              }
            }}
          />
          <button
            type="button"
            class="btn-primary"
            disabled={!customIdIsValid}
            onclick={() => pick(customPipelineId)}
          >
            Use this ID
          </button>
        </div>

        {#if customPipelineId.trim() && !customIdIsValid}
          <p class="text-xs text-danger" role="alert">
            Pipeline IDs cannot contain spaces or start with "@".
          </p>
        {/if}
      </div>

    </div>
  {/snippet}
</Modal>
