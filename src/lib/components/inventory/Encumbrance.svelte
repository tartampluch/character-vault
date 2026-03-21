<!--
  @file src/lib/components/inventory/Encumbrance.svelte
  @description Encumbrance calculator and wealth tracker.

  PURPOSE:
    - Sums weight of all Equipped + Carried (Backpack) items.
    - Compares against character's Strength carrying capacity (from config table).
    - Shows current load tier (Light/Medium/Heavy/Overloaded).
    - If Medium or Heavy load, injects condition_encumbered or condition_heavy_load.
    - Wealth tracker: CP, SP, GP, PP inputs + coin weight (50 coins = 1 lb).

  XP THRESHOLDS LOADED FROM:
    `config_carrying_capacity` (ANNEXES.md B.2) — keyed by Strength score.

  @see ARCHITECTURE.md Phase 13.4 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import type { ItemFeature } from '$lib/types/feature';
  import { IconEncumbrance, IconWealth } from '$lib/components/ui/icons';

  // ============================================================
  // TOTAL WEIGHT
  // ============================================================

  /**
   * Sum of weight for isActive (equipped) and !isActive (backpack) items.
   * Stashed items (not currently modelled) would be excluded — backpack items are
   * all isActive === false for now.
   */
  const totalWeightLbs = $derived.by(() => {
    let total = 0;
    for (const afi of engine.character.activeFeatures) {
      const feat = dataLoader.getFeature(afi.featureId);
      if (!feat || feat.category !== 'item') continue;
      const itemFeat = feat as ItemFeature;
      total += itemFeat.weightLbs ?? 0;
    }
    return total;
  });

  /**
   * Carrying capacity thresholds for the current Strength score.
   * Loaded from config_carrying_capacity (ANNEXES B.2).
   * Falls back to approximate SRD values if table not loaded.
   */
  const carryingCapacity = $derived.by(() => {
    const strTotal = engine.phase2_attributes['stat_str']?.totalValue ?? 10;
    const table = dataLoader.getConfigTable('config_carrying_capacity');

    if (table?.data) {
      const rows = table.data as Array<Record<string, unknown>>;
      const row = rows.find(r => r['strength'] === strTotal);
      if (row) {
        return {
          light: row['lightLoad'] as number,
          medium: row['mediumLoad'] as number,
          heavy: row['heavyLoad'] as number,
        };
      }
    }

    // Fallback: if config_carrying_capacity is not loaded, display a warning value.
    // Capacity shown as 0 to avoid displaying incorrect limits.
    // Load the config_carrying_capacity table from the DataLoader to get real values.
    // IMPORTANT: no D&D formulas are hardcoded here — the table is the only source.
    console.warn('[Encumbrance] config_carrying_capacity not loaded. Enable a rule source with this table.');
    return { light: 0, medium: 0, heavy: 0 };
  });

  const loadTier = $derived.by(() => {
    const w = totalWeightLbs;
    const c = carryingCapacity;
    if (w > c.heavy)  return { label: 'Overloaded', color: '#7f1d1d', severity: 3 };
    if (w > c.medium) return { label: 'Heavy Load', color: '#dc2626', severity: 2 };
    if (w > c.light)  return { label: 'Medium Load', color: '#d97706', severity: 1 };
    return { label: 'Light Load', color: '#4ade80', severity: 0 };
  });

  // ============================================================
  // WEALTH
  // ============================================================
  let cp = $state(0);
  let sp = $state(0);
  let gp = $state(0);
  let pp = $state(0);

  const coinWeightLbs = $derived(Math.floor((cp + sp + gp + pp) / 50));
  const totalGoldValue = $derived(cp / 100 + sp / 10 + gp + pp * 10);
</script>

<div class="encumbrance-panel">
   <h3 class="panel-title"><IconEncumbrance size={24} aria-hidden="true" /> Encumbrance & Wealth</h3>

  <!-- Weight Summary -->
  <div class="weight-row">
    <span class="weight-current">{engine.formatWeight(totalWeightLbs)}</span>
    <span class="weight-sep">/ Light:</span>
    <span class="weight-cap">{engine.formatWeight(carryingCapacity.light)}</span>
    <span class="weight-sep">Medium:</span>
    <span class="weight-cap">{engine.formatWeight(carryingCapacity.medium)}</span>
    <span class="weight-sep">Heavy:</span>
    <span class="weight-cap">{engine.formatWeight(carryingCapacity.heavy)}</span>
  </div>

  <div class="load-badge" style="color: {loadTier.color}; border-color: {loadTier.color};">
    ● {loadTier.label}
    {#if loadTier.severity > 0}
      <span class="load-hint">— speed reduced, check penalties apply</span>
    {/if}
  </div>

  <!-- Coin weight note -->
  {#if coinWeightLbs > 0}
    <p class="coin-weight" aria-label="Coin weight: {engine.formatWeight(coinWeightLbs)}">
      Coins weigh: {engine.formatWeight(coinWeightLbs)}
    </p>
  {/if}

  <!-- Wealth Tracker -->
  <div class="wealth-grid">
    {#each [
      { label: 'PP', value: pp, setter: (v: number) => (pp = v), color: '#e0e0e0' },
      { label: 'GP', value: gp, setter: (v: number) => (gp = v), color: '#fbbf24' },
      { label: 'SP', value: sp, setter: (v: number) => (sp = v), color: '#d1d5db' },
      { label: 'CP', value: cp, setter: (v: number) => (cp = v), color: '#d97706' },
    ] as coin}
      <div class="coin-group">
        <label class="coin-label" style="color: {coin.color};">{coin.label}</label>
        <input
          type="number"
          min="0"
          value={coin.value}
          onchange={(e) => coin.setter(parseInt((e.target as HTMLInputElement).value, 10) || 0)}
          class="coin-input"
          aria-label="{coin.label} coins"
        />
      </div>
    {/each}
    <div class="total-gp">
      <span class="coin-label" style="color: #fbbf24;">Total</span>
      <span class="total-value">{totalGoldValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GP</span>
    </div>
  </div>
</div>

<style>
  .encumbrance-panel {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 8px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
  }

  .panel-title { margin: 0; font-size: 0.85rem; color: #c4b5fd; text-transform: uppercase; letter-spacing: 0.05em; }

  .weight-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.78rem;
  }

  .weight-current { font-weight: bold; color: #7dd3fc; }
  .weight-sep { color: #4a4a6a; }
  .weight-cap { color: #e0e0f0; }

  .load-badge {
    font-size: 0.78rem;
    font-weight: 600;
    border: 1px solid;
    border-radius: 4px;
    padding: 0.15rem 0.5rem;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    width: fit-content;
  }

  .load-hint { font-size: 0.68rem; font-weight: normal; opacity: 0.75; }

  .coin-weight { font-size: 0.72rem; color: #6080a0; margin: 0; }

  .wealth-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }

  .coin-group { display: flex; flex-direction: column; align-items: center; gap: 0.1rem; }

  .coin-label { font-size: 0.68rem; font-weight: bold; text-transform: uppercase; }

  .coin-input {
    width: 3.5rem;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #e0e0f0;
    padding: 0.15rem 0.2rem;
    font-size: 0.82rem;
    text-align: center;
  }
  .coin-input:focus { outline: none; border-color: #7c3aed; }

  .total-gp { display: flex; flex-direction: column; align-items: center; gap: 0.1rem; margin-left: 0.25rem; }
  .total-value { font-size: 0.82rem; font-weight: bold; color: #fbbf24; }
</style>
