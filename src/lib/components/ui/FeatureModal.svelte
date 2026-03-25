<!--
  @file src/lib/components/ui/FeatureModal.svelte
  @description A reusable modal dialog for displaying full Feature data.
  Phase 19.14: Migrated to use Modal.svelte + Tailwind CSS — all scoped <style> removed.

  Uses Modal.svelte (size="lg") for mobile bottom-sheet / desktop centered behaviour.
  Category badges use a helper function returning Tailwind class strings (static enough
  for Tailwind's scanner since all class strings are complete literals in the map).
-->

<script lang="ts">
  import { dataLoader } from '$lib/engine/DataLoader';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { evaluateLogicNode } from '$lib/utils/logicEvaluator';
  import { interpolateDescription } from '$lib/utils/mathParser';
  import { formatModifier } from '$lib/utils/formatters';
  import type { ID } from '$lib/types/primitives';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { IconInfo, IconSuccess, IconError, IconWarning, IconAbilities, IconTabFeats, IconAdd } from '$lib/components/ui/icons';

  interface Props {
    featureId: ID | null;
    onclose: () => void;
  }

  let { featureId, onclose }: Props = $props();

  const feature = $derived(featureId ? dataLoader.getFeature(featureId) : undefined);
  const title   = $derived(feature ? engine.t(feature.label) : '???');

  const description = $derived.by(() => {
    if (!feature?.description) return '';
    try {
      return interpolateDescription(engine.t(feature.description), engine.phase2_context, engine.settings.language);
    } catch {
      return engine.t(feature.description);
    }
  });

  const prereqResult = $derived.by(() => {
    if (!feature?.prerequisitesNode) return null;
    return evaluateLogicNode(feature.prerequisitesNode, engine.phase2_context);
  });

  const grantedFeatureNames = $derived.by(() => {
    if (!feature?.grantedFeatures?.length) return [];
    // Deduplicate by ID (grantedFeatures may contain duplicates from JSON)
    const seen = new Set<string>();
    return feature.grantedFeatures
      .filter(id => {
        if (id.startsWith('-') || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map(id => {
        const f = dataLoader.getFeature(id);
        // Prefer the feature's label; fall back to a prettified ID string
        const name = f
          ? engine.t(f.label)
          : id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return { id, name, hasData: !!f };
      });
  });

  function resolvePipelineLabel(targetId: string): string {
    const normalised = targetId.startsWith('attributes.') ? targetId.slice('attributes.'.length) : targetId;
    const attrPipeline   = engine.phase2_attributes[normalised];
    if (attrPipeline?.label) return engine.t(attrPipeline.label);
    const combatPipeline = engine.phase3_combatStats[targetId];
    if (combatPipeline?.label) return engine.t(combatPipeline.label);
    const skillPipeline  = engine.phase4_skills[targetId];
    if (skillPipeline?.label) return engine.t(skillPipeline.label);
    return targetId;
  }

  /**
   * Converts a machine-readable `situationalContext` string into a short,
   * readable English label for display in the modifiers list.
   *
   * Examples:
   *   "vs_enchantment"          → "vs. Enchantment spells"
   *   "vs_poison"               → "vs. Poison"
   *   "vs_giant"                → "vs. Giants"
   *   "vs_orc_goblinoid"        → "vs. Orcs & Goblinoids"
   *   "appraise_stone_metal_items" → "Appraising stone/metal items"
   */
  const SITUATIONAL_LABELS: Record<string, string> = {
    vs_enchantment:                      'vs. Enchantment',
    vs_poison:                           'vs. Poison',
    vs_spells_and_spell_like:            'vs. Spells & Spell-likes',
    vs_spells_and_spell_like_effects:    'vs. Spells & Spell-likes',
    vs_giant:                            'vs. Giants',
    vs_giant_type:                       'vs. Giant type',
    vs_orc_goblinoid:                    'vs. Orcs & Goblinoids',
    vs_orcs_and_goblinoids:              'vs. Orcs & Goblinoids',
    vs_kobold_goblinoid:                 'vs. Kobolds & Goblinoids',
    vs_evil:                             'vs. Evil',
    vs_good:                             'vs. Good',
    vs_chaotic:                          'vs. Chaos',
    vs_lawful:                           'vs. Law',
    vs_charm_or_fear:                    'vs. Charm or Fear',
    vs_fear:                             'vs. Fear',
    vs_illusion:                         'vs. Illusion',
    vs_mind_affecting_and_compulsion:    'vs. Mind-affecting & Compulsions',
    vs_mind_affecting_compulsion:        'vs. Mind-affecting & Compulsions',
    vs_compulsions_and_mind_affecting:   'vs. Compulsions & Mind-affecting',
    vs_divination:                       'vs. Divination',
    vs_trap:                             'vs. Traps',
    vs_traps:                            'vs. Traps (duplicate)',
    vs_bull_rush_or_trip:                'vs. Bull Rush / Trip',
    vs_bull_rush_or_trip_on_ground:      'vs. Bull Rush / Trip (while standing)',
    vs_charge_attacks:                   'vs. Charge attacks',
    vs_ranged_attacks:                   'vs. Ranged attacks',
    vs_fire_spells_and_effects:          'vs. Fire spells & effects',
    vs_fire_creature:                    'vs. Fire creatures',
    vs_fire_effects:                     'vs. Fire effects',
    vs_fire_elementals:                  'vs. Fire elementals',
    vs_cold_creature:                    'vs. Cold creatures',
    vs_air_or_electricity_effects:       'vs. Air / Electricity',
    vs_earth_effects:                    'vs. Earth effects',
    vs_water_or_cold_effects_dupe:       'vs. Water / Cold',
    vs_elemental:                        'vs. Elementals',
    vs_outsider:                         'vs. Outsiders',
    vs_construct:                        'vs. Constructs',
    vs_shapechanger:                     'vs. Shapechangers',
    vs_fey_spell_like:                   'vs. Fey spell-likes',
    vs_designated_foe:                   'vs. Designated foe',
    vs_designated_target:                'vs. Designated target',
    vs_favored_enemy_1:                  'vs. Favored Enemy 1',
    vs_favored_enemy_2:                  'vs. Favored Enemy 2',
    vs_favored_enemy_3:                  'vs. Favored Enemy 3',
    vs_favored_enemy_4:                  'vs. Favored Enemy 4',
    vs_favored_enemy_5:                  'vs. Favored Enemy 5',
    vs_sworn_enemy:                      'vs. Sworn Enemy',
    vs_unusual_stonework:                'vs. Unusual stonework',
    vs_attacks_of_opportunity_on_movement: 'vs. AoOs on movement',
    vs_attacks_of_opportunity_while_moving: 'vs. AoOs while moving',
    vs_power_resistance:                 'vs. Power Resistance',
    vs_powers_spells_and_spell_like_effects: 'vs. Powers & Spells',
    vs_spider_poison:                    'vs. Spider poison',
    appraise_stone_metal_items:          'Appraising stone/metal items',
    craft_stone_metal_items:             'Crafting stone/metal items',
    unusual_stonework:                   'Near unusual stonework',
    tracking:                            'While tracking',
    sneak_attack:                        'On sneak attack',
    on_hit:                              'On hit',
    on_hit_fire:                         'On hit (fire)',
    on_hit_cold:                         'On hit (cold)',
    on_hit_electricity:                  'On hit (electricity)',
    on_hit_nonlethal:                    'On hit (nonlethal)',
    casting_defensively_or_grappled:     'While casting defensively / grappled',
    fighting_defensively_or_total_defense: 'While fighting defensively',
    wielding_two_weapons:                'While two-weapon fighting',
    single_piercing_weapon_no_offhand:   'Single piercing weapon, no off-hand',
    using_bow:                           'While using a bow',
    thrown_weapons_and_slings:           'With thrown weapons & slings',
    ranged_within_30ft:                  'Ranged within 30 ft.',
    unarmed_or_natural:                  'Unarmed / natural attacks',
    shield_bash:                         'On shield bash',
    near_wall:                           'When adjacent to a wall',
    underwater:                          'While underwater',
    in_saltwater:                        'In saltwater',
    in_bright_or_absolute_darkness:      'In bright light or darkness',
    outdoors_temperate:                  'In temperate outdoors',
    becoming_psionically_focused:        'When becoming psionically focused',
    manifesting_on_defensive_or_grappling: 'When manifesting defensively',
    puncture_touch_attack:               'On puncture touch attack',
    target_flat_footed_or_flanked:       'vs. Flat-footed / flanked target',
    vs_opponent_already_damaged_this_turn: 'vs. Already-damaged opponent',
    when_casting_chaos_spells:           'When casting Chaos spells',
    when_casting_divination_spells:      'When casting Divination spells',
    when_casting_evil_spells:            'When casting Evil spells',
    when_casting_good_spells:            'When casting Good spells',
    when_casting_healing_spells:         'When casting Healing spells',
    when_casting_law_spells:             'When casting Law spells',
    wielded_by_paladin:                  'When wielded by a paladin',
    air_elemental:                       'While air elemental',
    earth_elemental:                     'While earth elemental',
    fire_elemental:                      'While fire elemental',
    water_elemental:                     'While water elemental',
    vs_aquatic_creature:                 'vs. Aquatic creatures',
    vs_forest_creature:                  'vs. Forest creatures',
    vs_desert_creature:                  'vs. Desert creatures',
    vs_hills_creature:                   'vs. Hills creatures',
    vs_marsh_creature:                   'vs. Marsh creatures',
    vs_mountain_creature:                'vs. Mountain creatures',
    vs_plains_creature:                  'vs. Plains creatures',
    vs_underground_creature:             'vs. Underground creatures',
    vs_air_planar_creature:              'vs. Air planar creatures',
    vs_cavernous_plane_creature:         'vs. Cavernous planar creatures',
    vs_shifting_plane_creature:          'vs. Shifting planar creatures',
    vs_aligned_plane_creature:           'vs. Aligned planar creatures',
    vs_air_elementals:                   'vs. Air elementals',
    vs_earth_elementals:                 'vs. Earth elementals',
    vs_water_elementals:                 'vs. Water elementals',
    vs_water_or_cold_effects:            'vs. Water / Cold effects',
  };

  function formatSituationalContext(ctx: string): string {
    return SITUATIONAL_LABELS[ctx]
      ?? ctx.replace(/_/g, ' ').replace(/\bvs\b/, 'vs.').replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Category badge Tailwind classes.
   * All strings are complete, static literals — safe for Tailwind's scanner.
   */
  function categoryBadgeClass(cat: string): string {
    const map: Record<string, string> = {
      race:         'bg-green-900/40 text-green-400 border-green-700/50',
      class:        'bg-blue-900/40 text-blue-300 border-blue-700/50',
      feat:         'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
      item:         'bg-cyan-900/30 text-cyan-300 border-cyan-700/30',
      condition:    'bg-red-900/30 text-red-400 border-red-700/30',
      magic:        'bg-purple-900/30 text-purple-300 border-purple-700/30',
      domain:       'bg-teal-900/30 text-teal-300 border-teal-700/30',
      class_feature:'bg-blue-900/30 text-blue-200 border-blue-700/30',
      environment:  'bg-amber-900/30 text-amber-300 border-amber-700/30',
      monster_type: 'bg-red-900/20 text-red-300 border-red-700/20',
      deity:        'bg-amber-900/20 text-amber-200 border-amber-700/20',
    };
    return `${map[cat] ?? 'bg-surface-alt text-text-muted border-border'} border text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded`;
  }
</script>

<!-- Render only when featureId is set -->
{#if featureId}
  <Modal
    open={true}
    onClose={onclose}
    size="lg"
    title={feature ? title : 'Feature not found'}
  >
    {#snippet children()}
      {#if !feature}
        <!-- Feature not in cache -->
        <div class="text-center py-4 flex flex-col gap-2">
          <p class="text-sm text-text-primary">
            No feature found with ID <code class="bg-surface-alt px-1.5 py-0.5 rounded text-xs">{featureId}</code>.
          </p>
          <p class="text-xs text-text-muted italic">
            The DataLoader cache may not be loaded, or the rule source containing this feature may not be enabled.
          </p>
        </div>

      {:else}
        <div class="flex flex-col gap-4">

          <!-- Category badge (below the modal title provided by Modal.svelte) -->
          <div>
            <span class={categoryBadgeClass(feature.category)}>{feature.category}</span>
          </div>

          <!-- ── DESCRIPTION ─────────────────────────────────────────── -->
          {#if description}
            <section>
              <p class="text-sm text-text-secondary leading-relaxed">{description}</p>
            </section>
          {/if}

          <!-- ── PREREQUISITES ───────────────────────────────────────── -->
          {#if feature.prerequisitesNode}
            <section class="flex flex-col gap-1.5">
              <h3 class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent border-b border-border pb-1">
                <IconInfo size={14} aria-hidden="true" /> Prerequisites
              </h3>
              {#if prereqResult}
                <ul class="flex flex-col gap-1">
                  {#each prereqResult.metMessages as msg}
                    <li class="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-green-950/20 text-green-400">
                      <IconSuccess size={13} class="shrink-0" aria-hidden="true" /> {msg}
                    </li>
                  {/each}
                  {#each prereqResult.errorMessages as msg}
                    <li class="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-red-950/20 text-red-400">
                      <IconError size={13} class="shrink-0" aria-hidden="true" /> {msg}
                    </li>
                  {/each}
                  {#if prereqResult.metMessages.length === 0 && prereqResult.errorMessages.length === 0}
                    <li class="text-xs text-text-muted italic">No labelled prerequisites found.</li>
                  {/if}
                </ul>
              {/if}
            </section>
          {/if}

          <!-- ── GRANTED MODIFIERS ───────────────────────────────────── -->
          {#if feature.grantedModifiers?.length}
            <section class="flex flex-col gap-1.5">
              <h3 class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent border-b border-border pb-1">
                <IconAbilities size={14} aria-hidden="true" /> Modifiers
              </h3>
              <ul class="flex flex-col gap-1">
                {#each feature.grantedModifiers as mod}
                  {@const numVal = typeof mod.value === 'number' ? mod.value : null}
                  <li class="flex items-center gap-2 text-sm flex-wrap py-0.5">
                    <!-- Value -->
                    <span class="font-bold min-w-[2.5rem] text-right font-mono
                      {numVal !== null && numVal > 0 ? 'text-green-500 dark:text-green-400'
                      : numVal !== null && numVal < 0 ? 'text-red-500 dark:text-red-400'
                      : 'text-text-muted'}">
                      {numVal !== null ? formatModifier(numVal) : mod.value}
                    </span>
                    <!-- Target -->
                    <span class="text-sky-400">{resolvePipelineLabel(mod.targetId)}</span>
                    <!-- Type -->
                    <span class="text-[10px] text-text-muted">({mod.type})</span>
                    <!-- Situational context — human-readable label -->
                    {#if mod.situationalContext}
                      <span class="badge-accent text-[10px]">{formatSituationalContext(mod.situationalContext)}</span>
                    {/if}
                    <!-- Conditional flag -->
                    {#if mod.conditionNode}
                      <span class="flex items-center gap-0.5 text-[10px] text-yellow-500 dark:text-yellow-400">
                        <IconWarning size={11} aria-hidden="true" /> Conditional
                      </span>
                    {/if}
                  </li>
                {/each}
              </ul>
            </section>
          {/if}

          <!-- ── GRANTED FEATURES ────────────────────────────────────── -->
          {#if grantedFeatureNames.length > 0}
            <section class="flex flex-col gap-1.5">
              <h3 class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent border-b border-border pb-1">
                <IconAdd size={14} aria-hidden="true" /> Grants
              </h3>
              <ul class="flex flex-col gap-1">
                {#each grantedFeatureNames as { id, name, hasData }}
                  <li class="flex items-center justify-between gap-3 text-sm py-0.5">
                    <!-- Human-readable name, dimmed if the feature isn't loaded -->
                    <span class="{hasData ? 'text-accent' : 'text-text-muted italic'}">{name}</span>
                    <!-- Show raw ID only when we couldn't resolve a label -->
                    {#if !hasData}
                      <code class="text-[10px] text-text-muted/60 bg-surface-alt px-1.5 py-0.5 rounded shrink-0">{id}</code>
                    {/if}
                  </li>
                {/each}
              </ul>
            </section>
          {/if}

          <!-- ── CHOICES ─────────────────────────────────────────────── -->
          {#if feature.choices?.length}
            <section class="flex flex-col gap-1.5">
              <h3 class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent border-b border-border pb-1">
                <IconTabFeats size={14} aria-hidden="true" /> Choices
              </h3>
              <ul class="flex flex-col gap-1.5">
                {#each feature.choices as choice}
                  <li class="flex flex-col gap-0.5 p-2.5 rounded-md border border-border bg-surface-alt text-sm">
                    <span class="font-medium text-text-primary">{engine.t(choice.label)}</span>
                    <span class="text-xs text-text-muted">Query: <code class="bg-surface px-1 rounded">{choice.optionsQuery}</code></span>
                    {#if choice.maxSelections > 1}
                      <span class="text-xs text-accent">(Pick up to {choice.maxSelections})</span>
                    {/if}
                  </li>
                {/each}
              </ul>
            </section>
          {/if}

          <!-- ── METADATA ────────────────────────────────────────────── -->
          <section class="flex flex-col gap-1.5 pt-3 border-t border-border">
            <div class="flex items-center gap-2 text-xs">
              <span class="text-text-muted w-12 text-right shrink-0">Source</span>
              <code class="text-text-secondary bg-surface-alt px-1.5 py-0.5 rounded">{feature.ruleSource}</code>
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="text-text-muted w-12 text-right shrink-0">ID</span>
              <code class="text-text-secondary bg-surface-alt px-1.5 py-0.5 rounded break-all">{feature.id}</code>
            </div>
            {#if feature.tags?.length}
              <div class="flex items-start gap-2 text-xs">
                <span class="text-text-muted w-12 text-right shrink-0 pt-0.5">Tags</span>
                <div class="flex flex-wrap gap-1">
                  {#each feature.tags as tag}
                    <span class="badge-accent font-mono text-[10px]">{tag}</span>
                  {/each}
                </div>
              </div>
            {/if}
          </section>

        </div>
      {/if}
    {/snippet}
  </Modal>
{/if}
