<!--
  @file src/lib/components/combat/DamageReduction.svelte
  @description Damage Reduction (DR) builder and manager for the Combat tab.

  PURPOSE:
    Allows the GM/player to construct DR rules graphically:
      - DR value (e.g., 5)
      - Rule type: "Bypassed by" or "Excepted from"
      - Material type: Adamantine, Magic, Cold Iron, Silver, Slashing, Bludgeoning, etc.
    
    When "Add DR" is clicked, a synthetic `ActiveFeatureInstance` (category: condition)
    with a `combatStats.damage_reduction` modifier is injected into the engine.
    The list shows all active DR entries with a delete button.

  @see ARCHITECTURE.md Phase 10.7 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';

  // DR builder form state
  let drValue = $state(5);
  let drBypass = $state('—');     // e.g., "magic", "adamantine"
  let drRuleType = $state<'bypassed' | 'excepted'>('bypassed');

  const DR_BYPASS_OPTIONS = [
    '—', 'magic', 'adamantine', 'cold_iron', 'silver', 'mithral',
    'slashing', 'bludgeoning', 'piercing', 'good', 'evil', 'lawful', 'chaotic',
  ];

  /**
   * All active DR instances (synthetic features with id starting with "dr_custom_").
   */
  const activeDRs = $derived.by(() => {
    return engine.character.activeFeatures
      .filter(afi => afi.featureId.startsWith('dr_custom_') && afi.isActive)
      .map(afi => {
        const feature = dataLoader.getFeature(afi.featureId);
        return { instanceId: afi.instanceId, label: feature ? engine.t(feature.label) : afi.featureId };
      });
  });

  /**
   * Adds a new DR to the character as a synthetic condition feature.
   */
  function addDR() {
    if (drValue <= 0) return;
    const drId = `dr_custom_${drValue}_${drBypass}_${Date.now()}`;
    const drLabel = `DR ${drValue}/${drBypass === '—' ? '—' : drBypass}`;

    // Cache a minimal feature definition for this DR
    dataLoader.cacheFeature({
      id: drId,
      category: 'condition',
      label: { en: drLabel, fr: drLabel },
      description: { en: `Damage Reduction ${drValue}/${drBypass}`, fr: `Réduction de dégâts ${drValue}/${drBypass}` },
      tags: ['condition', 'damage_reduction', drId],
      grantedModifiers: [
        {
          id: `${drId}_mod`,
          sourceId: drId,
          sourceName: { en: drLabel, fr: drLabel },
          targetId: 'combatStats.damage_reduction',
          value: drValue,
          type: 'base',
        },
      ],
      grantedFeatures: [],
      ruleSource: 'gm_override',
    });

    engine.addFeature({
      instanceId: `afi_${drId}`,
      featureId: drId,
      isActive: true,
    });
  }
</script>

<div class="dr-panel">
  <h2 class="panel-title">🗡️ Damage Reduction</h2>

  <!-- Active DRs -->
  {#if activeDRs.length === 0}
    <p class="empty-note">No Damage Reduction configured.</p>
  {:else}
    <ul class="dr-list">
      {#each activeDRs as dr}
        <li class="dr-item">
          <span class="dr-label">{dr.label}</span>
          <button
            class="dr-delete"
            onclick={() => engine.removeFeature(dr.instanceId)}
            aria-label="Remove {dr.label}"
          >×</button>
        </li>
      {/each}
    </ul>
  {/if}

  <!-- DR Builder -->
  <div class="dr-builder">
    <h3 class="builder-title">Add DR</h3>
    <div class="builder-row">
      <label class="field-label">Value</label>
      <input type="number" min="1" max="50" bind:value={drValue} class="dr-input small" />
    </div>
    <div class="builder-row">
      <label class="field-label">Bypassed By</label>
      <select bind:value={drBypass} class="dr-select">
        {#each DR_BYPASS_OPTIONS as opt}
          <option value={opt}>{opt}</option>
        {/each}
      </select>
    </div>
    <button class="btn-add" onclick={addDR}>+ Add DR {drValue}/{drBypass}</button>
  </div>
</div>

<style>
  .dr-panel {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1.25rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
  }

  .panel-title { margin: 0 0 1rem; font-size: 1rem; color: #c4b5fd; border-bottom: 1px solid #21262d; padding-bottom: 0.5rem; }

  .empty-note { font-size: 0.82rem; color: #4a4a6a; font-style: italic; margin: 0 0 0.75rem; }

  .dr-list { list-style: none; padding: 0; margin: 0 0 0.75rem; display: flex; flex-direction: column; gap: 0.3rem; }

  .dr-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 4px;
    padding: 0.25rem 0.6rem;
    font-size: 0.85rem;
  }

  .dr-label { color: #c4b5fd; font-family: monospace; }

  .dr-delete {
    background: transparent;
    border: none;
    color: #f87171;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0 0.2rem;
  }
  .dr-delete:hover { color: #dc2626; }

  .dr-builder {
    border-top: 1px solid #21262d;
    padding-top: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .builder-title { margin: 0 0 0.25rem; font-size: 0.82rem; color: #6080a0; text-transform: uppercase; letter-spacing: 0.05em; }
  .builder-row { display: flex; align-items: center; gap: 0.5rem; }
  .field-label { font-size: 0.75rem; color: #6080a0; width: 5rem; flex-shrink: 0; }

  .dr-input {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #7dd3fc;
    padding: 0.25rem 0.35rem;
    font-size: 0.85rem;
    text-align: center;
  }
  .dr-input.small { width: 4rem; }

  .dr-select {
    flex: 1;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #e0e0f0;
    padding: 0.25rem 0.35rem;
    font-size: 0.85rem;
    font-family: inherit;
  }

  .btn-add {
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.4rem 0.9rem;
    font-size: 0.82rem;
    cursor: pointer;
    margin-top: 0.25rem;
  }
  .btn-add:hover { background: #6d28d9; }
</style>
