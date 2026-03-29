<!--
  @file src/lib/components/content-editor/PipelinePickerModal.svelte
  @description Modal for picking a pipeline ID when building a Modifier's `targetId`.
-->

<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';

  interface Props {
    onPipelinePicked: (pipelineId: string) => void;
    onclose: () => void;
  }

  let { onPipelinePicked, onclose }: Props = $props();
  const lang = $derived(engine.settings.language);

  let searchQuery = $state('');
  const searchLower = $derived(searchQuery.toLowerCase().trim());

  let customPipelineId = $state('');

  const customIdIsValid = $derived(
    customPipelineId.trim().length > 0 &&
    !customPipelineId.includes(' ')      &&
    !customPipelineId.startsWith('@')
  );

  interface PipelineEntry {
    id: string;
    label: string;
    baseValue: number | null;
  }

  interface PipelineGroup {
    label: string;
    key: string;
    entries: PipelineEntry[];
  }

  const STATIC_GROUPS = $derived.by((): PipelineGroup[] => {
    const rpl = (id: string) => engine.resolvePipelineLabel(id);
    return [
      {
        label: ui('content_editor.group.ability_scores', lang),
        key:   'attributes',
        entries: [
          { id: 'attributes.stat_strength',         label: rpl('attributes.stat_strength'),        baseValue: 10 },
          { id: 'attributes.stat_dexterity',         label: rpl('attributes.stat_dexterity'),       baseValue: 10 },
          { id: 'attributes.stat_constitution',      label: rpl('attributes.stat_constitution'),    baseValue: 10 },
          { id: 'attributes.stat_intelligence',      label: rpl('attributes.stat_intelligence'),    baseValue: 10 },
          { id: 'attributes.stat_wisdom',            label: rpl('attributes.stat_wisdom'),          baseValue: 10 },
          { id: 'attributes.stat_charisma',          label: rpl('attributes.stat_charisma'),        baseValue: 10 },
          { id: 'attributes.stat_size',              label: rpl('attributes.stat_size'),            baseValue:  0 },
          { id: 'attributes.stat_caster_level',      label: rpl('attributes.stat_caster_level'),    baseValue:  0 },
          { id: 'attributes.stat_manifester_level',  label: rpl('attributes.stat_manifester_level'),baseValue:  0 },
        ],
      },
      {
        label: ui('content_editor.group.combat_stats', lang),
        key:   'combatStats',
        entries: [
          { id: 'combatStats.ac_normal',            label: rpl('combatStats.ac_normal'),            baseValue: 10 },
          { id: 'combatStats.ac_touch',             label: rpl('combatStats.ac_touch'),             baseValue: 10 },
          { id: 'combatStats.ac_flat_footed',       label: rpl('combatStats.ac_flat_footed'),       baseValue: 10 },
          { id: 'combatStats.base_attack_bonus',    label: rpl('combatStats.base_attack_bonus'),    baseValue:  0 },
          { id: 'combatStats.initiative',           label: rpl('combatStats.initiative'),           baseValue:  0 },
          { id: 'combatStats.grapple',              label: rpl('combatStats.grapple'),              baseValue:  0 },
          { id: 'combatStats.max_hp',               label: rpl('combatStats.max_hp'),               baseValue:  0 },
          { id: 'combatStats.speed_land',           label: rpl('combatStats.speed_land'),           baseValue: 30 },
          { id: 'combatStats.speed_burrow',         label: rpl('combatStats.speed_burrow'),         baseValue:  0 },
          { id: 'combatStats.speed_climb',          label: rpl('combatStats.speed_climb'),          baseValue:  0 },
          { id: 'combatStats.speed_fly',            label: rpl('combatStats.speed_fly'),            baseValue:  0 },
          { id: 'combatStats.speed_swim',           label: rpl('combatStats.speed_swim'),           baseValue:  0 },
          { id: 'combatStats.armor_check_penalty',  label: rpl('combatStats.armor_check_penalty'),  baseValue:  0 },
          { id: 'combatStats.fortification',        label: rpl('combatStats.fortification'),        baseValue:  0 },
          { id: 'combatStats.arcane_spell_failure', label: rpl('combatStats.arcane_spell_failure'), baseValue:  0 },
          { id: 'combatStats.max_dexterity_bonus',  label: rpl('combatStats.max_dexterity_bonus'),  baseValue: 99 },
        ],
      },
      {
        label: ui('content_editor.group.saves', lang),
        key:   'saves',
        entries: [
          { id: 'saves.fortitude', label: rpl('saves.fortitude'), baseValue: 0 },
          { id: 'saves.reflex',    label: rpl('saves.reflex'),    baseValue: 0 },
          { id: 'saves.will',      label: rpl('saves.will'),      baseValue: 0 },
        ],
      },
      {
        label: ui('content_editor.group.resources', lang),
        key:   'resources',
        entries: [
          { id: 'resources.hp', label: rpl('resources.hp'), baseValue: null },
        ],
      },
    ];
  });

  interface SkillDefinition {
    id: string;
    label?: { en?: string; fr?: string };
    keyAbility?: string;
  }

  const skillEntries = $derived.by((): PipelineEntry[] => {
    const table = dataLoader.getConfigTable('config_skill_definitions');
    if (!table || !table.data) return [];
    const rawData = table.data as unknown as Record<string, SkillDefinition>;
    return Object.values(rawData)
      .map((def): PipelineEntry => ({
        id:         `skills.${def.id}`,
        label:      (engine.t(def.label as Record<string, string>) ?? def.id),
        baseValue:  0,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  function matchesSearch(entry: PipelineEntry): boolean {
    if (!searchLower) return true;
    return (
      entry.id.toLowerCase().includes(searchLower) ||
      entry.label.toLowerCase().includes(searchLower)
    );
  }

  function groupHasMatch(entries: PipelineEntry[]): boolean {
    if (!searchLower) return true;
    return entries.some(matchesSearch);
  }

  const skillsHaveMatch = $derived(!searchLower || skillEntries.some(matchesSearch));

  function pick(id: string): void {
    const trimmed = id.trim();
    if (!trimmed) return;
    onPipelinePicked(trimmed);
  }
</script>

<Modal
  open={true}
  onClose={onclose}
  title={ui('editor.pipeline_picker.title', lang)}
  size="lg"
  fullscreen={true}
>
  {#snippet children()}
    <div class="flex flex-col gap-4">

      <!-- ------------------------------------------------------------------ -->
      <!-- SEARCH BAR                                                          -->
      <!-- ------------------------------------------------------------------ -->
      <div class="relative">
        <label for="pipeline-search" class="sr-only">{ui('editor.pipeline_picker.search_aria', lang)}</label>
        <input
          id="pipeline-search"
          type="search"
          class="input w-full pl-9"
          placeholder={ui('editor.pipeline_picker.search_placeholder', lang)}
          bind:value={searchQuery}
          autocomplete="off"
          spellcheck="false"
        />
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
                  <th>{ui('editor.pipeline_picker.col_pipeline_id', lang)}</th>
                  <th>{ui('editor.pipeline_picker.col_label', lang)}</th>
                  <th>{ui('editor.pipeline_picker.col_base_value', lang)}</th>
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
                    aria-label={ui('editor.pipeline_picker.select_pipeline_aria', lang).replace('{id}', entry.id)}
                  >
                    <td class="px-4 py-2 font-mono text-xs text-text-muted w-1/2 break-all">
                      {entry.id}
                    </td>
                    <td class="px-4 py-2 text-text-primary">
                      {entry.label}
                    </td>
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
              {ui('editor.pipeline_picker.skills_section', lang)}
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
            <p class="px-4 py-3 text-sm text-text-muted italic">
              {ui('editor.pipeline_picker.skills_load_hint', lang)}
            </p>
          {:else}
            <table class="w-full text-sm">
              <thead class="sr-only">
                <tr>
                  <th>{ui('editor.pipeline_picker.col_pipeline_id', lang)}</th>
                  <th>{ui('editor.pipeline_picker.col_skill_name', lang)}</th>
                  <th>{ui('editor.pipeline_picker.col_base', lang)}</th>
                </tr>
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
                    aria-label={ui('editor.pipeline_picker.select_pipeline_aria', lang).replace('{id}', entry.id)}
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
      <div class="border border-border rounded-lg p-4 bg-surface-alt space-y-3">
        <p class="text-sm font-semibold text-text-primary">{ui('editor.pipeline_picker.custom_section_title', lang)}</p>
        <p class="text-xs text-text-muted">
          {ui('editor.pipeline_picker.custom_section_desc', lang)}
        </p>

        <div class="flex gap-2">
          <label for="custom-pipeline-id" class="sr-only">{ui('editor.pipeline_picker.custom_id_aria', lang)}</label>
          <input
            id="custom-pipeline-id"
            type="text"
            class="input flex-1 font-mono text-sm"
            placeholder={ui('editor.pipeline_picker.custom_id_placeholder', lang)}
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
            {ui('editor.pipeline_picker.use_this_id_btn', lang)}
          </button>
        </div>

        {#if customPipelineId.trim() && !customIdIsValid}
          <p class="text-xs text-danger" role="alert">
            {ui('editor.pipeline_picker.invalid_id_error', lang)}
          </p>
        {/if}
      </div>

    </div>
  {/snippet}
</Modal>
