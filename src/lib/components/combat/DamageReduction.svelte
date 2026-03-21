<!--
  @file src/lib/components/combat/DamageReduction.svelte
  @description Damage Reduction (DR) builder and manager for the Combat tab.
  Phase 19.9: Migrated to Tailwind CSS — all scoped <style> removed.

  Active DR entries as badge-like chips with delete (×) button.
  Builder form: value input + bypass select + Add button.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { IconDR, IconAdd, IconDelete } from '$lib/components/ui/icons';

  let drValue    = $state(5);
  let drBypass   = $state('—');
  let drRuleType = $state<'bypassed' | 'excepted'>('bypassed');

  const DR_BYPASS_OPTIONS = [
    '—', 'magic', 'adamantine', 'cold_iron', 'silver', 'mithral',
    'slashing', 'bludgeoning', 'piercing', 'good', 'evil', 'lawful', 'chaotic',
  ];

  const activeDRs = $derived.by(() =>
    engine.character.activeFeatures
      .filter(afi => afi.featureId.startsWith('dr_custom_') && afi.isActive)
      .map(afi => {
        const feature = dataLoader.getFeature(afi.featureId);
        return { instanceId: afi.instanceId, label: feature ? engine.t(feature.label) : afi.featureId };
      })
  );

  function addDR() {
    if (drValue <= 0) return;
    const drId    = `dr_custom_${drValue}_${drBypass}_${Date.now()}`;
    const drLabel = `DR ${drValue}/${drBypass === '—' ? '—' : drBypass}`;
    dataLoader.cacheFeature({
      id: drId, category: 'condition',
      label: { en: drLabel, fr: drLabel },
      description: { en: `Damage Reduction ${drValue}/${drBypass}`, fr: `Réduction de dégâts ${drValue}/${drBypass}` },
      tags: ['condition', 'damage_reduction', drId],
      grantedModifiers: [{
        id: `${drId}_mod`, sourceId: drId, sourceName: { en: drLabel, fr: drLabel },
        targetId: 'combatStats.damage_reduction', value: drValue, type: 'base',
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
    <span>Damage Reduction</span>
  </div>

  <!-- Active DRs list -->
  {#if activeDRs.length === 0}
    <p class="text-sm text-text-muted italic">No Damage Reduction configured.</p>
  {:else}
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

  <!-- Builder form -->
  <div class="flex flex-col gap-2 pt-2 border-t border-border">
    <span class="text-xs text-text-muted uppercase tracking-wider">Add DR</span>
    <div class="flex items-center gap-2 flex-wrap">
      <div class="flex items-center gap-1.5">
        <label for="dr-value-input" class="text-xs text-text-muted shrink-0">Value</label>
        <input
          id="dr-value-input"
          type="number" min="1" max="50"
          bind:value={drValue}
          class="input w-14 text-center text-sm text-sky-500 dark:text-sky-400 px-1"
        />
      </div>
      <div class="flex items-center gap-1.5 flex-1 min-w-[140px]">
        <label for="dr-bypass-select" class="text-xs text-text-muted shrink-0">Bypassed By</label>
        <select id="dr-bypass-select" bind:value={drBypass} class="select flex-1 text-sm py-1">
          {#each DR_BYPASS_OPTIONS as opt}
            <option value={opt}>{opt}</option>
          {/each}
        </select>
      </div>
    </div>
    <button
      class="btn-primary gap-1 self-start"
      onclick={addDR}
      type="button"
    >
      <IconAdd size={14} aria-hidden="true" /> Add DR {drValue}/{drBypass}
    </button>
  </div>

</div>
