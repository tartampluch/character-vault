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

  let drValue    = $state(5);
  let drBypass   = $state<string>('—');
  let drType     = $state<'base' | 'damage_reduction'>('damage_reduction');

  const DR_BYPASS_OPTIONS = [
    '—', 'magic', 'adamantine', 'cold_iron', 'silver', 'mithral',
    'slashing', 'bludgeoning', 'piercing', 'good', 'evil', 'lawful', 'chaotic', 'epic',
  ];

  // ── Active custom DRs (GM-added via this UI) ─────────────────────────────
  const activeDRs = $derived.by(() =>
    engine.character.activeFeatures
      .filter(afi => afi.featureId.startsWith('dr_custom_') && afi.isActive)
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
    if (drValue <= 0) return;
    const tags     = drBypass === '—' ? [] : [drBypass];
    const drId     = `dr_custom_${drValue}_${drBypass}_${Date.now()}`;
    const drLabel  = `DR ${drValue}/${drBypass === '—' ? '—' : drBypass}`;
    dataLoader.cacheFeature({
      id: drId, category: 'condition',
      label: { en: drLabel, fr: drLabel },
      description: { en: `Damage Reduction ${drValue}/${drBypass}`, fr: `Réduction de dégâts ${drValue}/${drBypass}` },
      tags: ['condition', 'damage_reduction', drId],
      grantedModifiers: [{
        id: `${drId}_mod`, sourceId: drId, sourceName: { en: drLabel, fr: drLabel },
        targetId: 'combatStats.damage_reduction', value: drValue,
        type: drType,
        drBypassTags: drType === 'damage_reduction' ? tags : undefined,
      }],
      grantedFeatures: [],
      ruleSource: 'gm_override',
    });
    engine.addFeature({ instanceId: `afi_${drId}`, featureId: drId, isActive: true });
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
          <span class="text-sm font-mono font-bold text-accent">DR {baseAddDR}/—</span>
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
              DR {entry.amount}/{formatBypassTags(entry.bypassTags)}
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
                  DR {sup.value}/{formatBypassTags((sup as {drBypassTags?: string[]}).drBypassTags ?? [])}
                  ({sup.sourceName?.en ?? sup.sourceId})
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
        <label for="dr-type-select" class="text-xs text-text-muted shrink-0">Type</label>
        <select id="dr-type-select" bind:value={drType} class="select text-xs py-1">
          <option value="damage_reduction">Innate (best-wins)</option>
          <option value="base">Class (additive)</option>
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
