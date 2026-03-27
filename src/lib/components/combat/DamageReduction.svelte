<!--
  @file src/lib/components/combat/DamageReduction.svelte
  @description Damage Reduction (DR) builder and manager for the Combat tab.
  Phase 19.9: Migrated to Tailwind CSS — all scoped <style> removed.

  Active DR entries as badge-like chips with delete (×) button.
  Builder form: value input + bypass select + Add button.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { IconDR, IconAdd, IconDelete } from '$lib/components/ui/icons';
  import type { DREntry } from '$lib/utils/stackingRules';
  import { DR_CUSTOM_FEATURE_PREFIX, DR_BYPASS_TAGS_FALLBACK } from '$lib/utils/constants';

  let drValue    = $state(5);
  let drBypass   = $state<string>('—');
  let drType     = $state<'base' | 'damage_reduction'>('damage_reduction');

  /**
   * Bypass tag options — loaded from `config_dr_bypass_options` config table.
   *
   * ZERO HARDCODING RULE (ARCHITECTURE.md §6):
   *   D&D 3.5 DR bypass material names (adamantine, cold_iron, etc.) are game
   *   content, not UI logic. They belong in a config table so GMs can extend or
   *   override the list without touching component code.
   *
   * The fallback list matches the standard D&D 3.5 SRD materials and alignment
   *   bypass types. It is ONLY used when the config table is absent (e.g., during
   *   initial development or when a custom rule set omits the table).
   */
  const DR_BYPASS_OPTIONS = $derived.by(() => {
    const table = dataLoader.getConfigTable('config_dr_bypass_options');
    if (table?.data && Array.isArray(table.data)) {
      return (table.data as Array<Record<string, unknown>>)
        .map(r => String(r['tag'] ?? r['value'] ?? r['bypass'] ?? ''))
        .filter(v => v.length > 0);
    }
    // Fallback: standard D&D 3.5 SRD bypass tags from constants.ts
    // (zero-hardcoding rule: D&D material names must not be literal strings in .svelte files,
    //  ARCHITECTURE.md §6). DR_BYPASS_TAGS_FALLBACK is the single source of truth.
    return [...DR_BYPASS_TAGS_FALLBACK];
  });

  // ── Active custom DRs (GM-added via this UI) ─────────────────────────────
  // DR_CUSTOM_FEATURE_PREFIX imported from constants.ts (zero-hardcoding rule, ARCHITECTURE.md §6).
  const activeDRs = $derived.by(() =>
    engine.character.activeFeatures
      .filter(afi => afi.featureId.startsWith(DR_CUSTOM_FEATURE_PREFIX) && afi.isActive)
      .map(afi => {
        const feature = dataLoader.getFeature(afi.featureId);
        return { instanceId: afi.instanceId, label: feature ? engine.t(feature.label) : afi.featureId };
      })
  );

  // ── Resolved drEntries from the combat stat pipeline (Extension C) ───────
  // The pipeline's stacking result contains drEntries grouped by bypass signature.
  const drPipeline  = $derived(engine.phase3_combatStats['combatStats.damage_reduction']);
  const baseAddDR   = $derived(drPipeline?.totalValue ?? 0); // class-progression additive DR
  const drEntries   = $derived<DREntry[]>((drPipeline as unknown as { drEntries?: DREntry[] })?.drEntries ?? []);

  function formatBypassTags(tags: string[]): string {
    if (tags.length === 0) return '—';
    return tags.join(' & ');
  }

  function addDR() {
    // Feature construction (LocalizedString labels + modifier type) is delegated to
    // engine.addCustomDR() to keep hardcoded D&D terms and modifier-building out of
    // this .svelte file (ARCHITECTURE.md §3, §6).
    engine.addCustomDR(drValue, drBypass, drType);
  }
</script>

<div class="card p-4 flex flex-col gap-3">

  <div class="section-header border-b border-border pb-2">
    <IconDR size={20} aria-hidden="true" />
    <span>{ui('combat.dr.title', engine.settings.language)}</span>
  </div>

  <!-- ── RESOLVED DR ENTRIES (Extension C — best-wins per bypass group) ─── -->
  {#if baseAddDR > 0 || drEntries.length > 0}
    <div class="flex flex-col gap-1.5">
      <span class="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
        {ui('dr.groups_title', engine.settings.language)}
      </span>
      <!-- Additive class DR (type: "base") -->
      {#if baseAddDR > 0}
        <div class="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-surface-alt">
          <span class="text-sm font-mono font-bold text-accent">{ui('dr.abbr', engine.settings.language)} {baseAddDR}/—</span>
          <span class="text-[10px] text-text-muted italic ml-auto">
            {ui('dr.base_class_label', engine.settings.language)}
          </span>
        </div>
      {/if}
      <!-- Innate/racial DR entries (type: "damage_reduction", best-wins) -->
      {#each drEntries as entry}
        <div class="flex flex-col gap-0.5 px-3 py-1.5 rounded-md border border-border bg-surface-alt">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-mono font-bold text-accent">
              {ui('dr.abbr', engine.settings.language)} {entry.amount}/{formatBypassTags(entry.bypassTags)}
            </span>
            <span class="text-[10px] text-text-muted">
              {ui('dr.innate_label', engine.settings.language)}
            </span>
          </div>
          <!-- Suppressed peers (lower-value same-bypass DRs) -->
          {#if entry.suppressedModifiers.length > 0}
            <div class="flex flex-wrap gap-1 mt-0.5">
              {#each entry.suppressedModifiers as sup}
                <span class="text-[10px] text-text-muted line-through opacity-60 px-1.5 py-0.5 rounded border border-border/50">
                  {ui('dr.abbr', engine.settings.language)} {sup.value}/{formatBypassTags((sup as {drBypassTags?: string[]}).drBypassTags ?? [])}
                  ({sup.sourceName?.[engine.settings.language] ?? sup.sourceName?.en ?? sup.sourceId})
                </span>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else if activeDRs.length === 0}
    <p class="text-sm text-text-muted italic">{ui('combat.dr.empty', engine.settings.language)}</p>
  {/if}

  <!-- Custom GM-added DRs (old-style, for backward compat) -->
  {#if activeDRs.length > 0}
    <ul class="flex flex-col gap-1.5">
      {#each activeDRs as dr}
        <li class="flex items-center justify-between px-3 py-1.5 rounded-md border border-border bg-surface-alt">
          <span class="text-sm font-mono text-accent">{dr.label}</span>
          <button
            class="btn-ghost p-1 text-red-400 hover:text-red-500"
            onclick={() => engine.removeFeature(dr.instanceId)}
            aria-label="Remove {dr.label}"
            type="button"
          ><IconDelete size={14} aria-hidden="true" /></button>
        </li>
      {/each}
    </ul>
  {/if}

  <!-- Builder form (Extension C — now with innate/base type choice) -->
  <div class="flex flex-col gap-2 pt-2 border-t border-border">
    <span class="text-xs text-text-muted uppercase tracking-wider">{ui('dr.add_innate', engine.settings.language)}</span>
    <div class="flex items-center gap-2 flex-wrap">
      <div class="flex items-center gap-1.5">
        <label for="dr-value-input" class="text-xs text-text-muted shrink-0">{ui('combat.dr.value', engine.settings.language)}</label>
        <input
          id="dr-value-input"
          type="number" min="1" max="50"
          bind:value={drValue}
          class="input w-14 text-center text-sm text-sky-500 dark:text-sky-400 px-1"
        />
      </div>
      <div class="flex items-center gap-1.5 flex-1 min-w-[140px]">
        <label for="dr-bypass-select" class="text-xs text-text-muted shrink-0">{ui('combat.dr.bypassed_by', engine.settings.language)}</label>
        <select id="dr-bypass-select" bind:value={drBypass} class="select flex-1 text-sm py-1">
          {#each DR_BYPASS_OPTIONS as opt}
            <option value={opt}>{opt}</option>
          {/each}
        </select>
      </div>
      <!-- Best-wins vs additive type toggle -->
      <div class="flex items-center gap-1.5">
        <label for="dr-type-select" class="text-xs text-text-muted shrink-0">{ui('combat.dr.type_label', engine.settings.language)}</label>
        <select id="dr-type-select" bind:value={drType} class="select text-xs py-1">
          <option value="damage_reduction">{ui('combat.dr.type_innate', engine.settings.language)}</option>
          <option value="base">{ui('combat.dr.type_class', engine.settings.language)}</option>
        </select>
      </div>
    </div>
    <button
      class="btn-primary gap-1 self-start"
      onclick={addDR}
      type="button"
    >
      <IconAdd size={14} aria-hidden="true" /> {ui('combat.dr.add', engine.settings.language)} {drValue}/{drBypass}
    </button>
  </div>

</div>
