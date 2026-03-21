<!--
  @file src/lib/components/inventory/Encumbrance.svelte
  @description Encumbrance calculator and wealth tracker.
  Phase 19.11: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT (spec 19.11):
    Full-width encumbrance bar (.progress-bar from app.css) with three tier
    markers overlaid (Light / Medium / Heavy) at their corresponding percentage
    positions. Current weight displayed numerically + load tier badge.

    Wealth section: compact 4-column grid (CP / SP / GP / PP) + total GP display.
    Coin labels are colour-coded (PP = silver-white, GP = gold, SP = gray,
    CP = amber/bronze). Uses `.input` component class, compact sizing.

  ENCUMBRANCE BAR DESIGN:
    The bar fill is driven by `--progress-pct` CSS custom property.
    Color changes: green (light) → yellow (medium) → red (heavy/overloaded).
    Tier marker lines: three absolutely-positioned hairlines at the Light,
    Medium, and Heavy percentage thresholds.

  COIN COLOURS:
    These are purely decorative/semantic — the inline `style` attribute is
    the only way to use runtime coin colours (PP is a special rarity colour
    not in the Tailwind palette). The accent theme colour is used for GP.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import type { ItemFeature } from '$lib/types/feature';
  import { IconEncumbrance, IconWealth } from '$lib/components/ui/icons';

  // ── Total weight ───────────────────────────────────────────────────────────
  const totalWeightLbs = $derived.by(() => {
    let total = 0;
    for (const afi of engine.character.activeFeatures) {
      const feat = dataLoader.getFeature(afi.featureId);
      if (!feat || feat.category !== 'item') continue;
      total += (feat as ItemFeature).weightLbs ?? 0;
    }
    return total;
  });

  // ── Carrying capacity (from config table) ─────────────────────────────────
  const carryingCapacity = $derived.by(() => {
    const strTotal = engine.phase2_attributes['stat_str']?.totalValue ?? 10;
    const table    = dataLoader.getConfigTable('config_carrying_capacity');
    if (table?.data) {
      const rows = table.data as Array<Record<string, unknown>>;
      const row  = rows.find(r => r['strength'] === strTotal);
      if (row) return {
        light:  row['lightLoad']  as number,
        medium: row['mediumLoad'] as number,
        heavy:  row['heavyLoad']  as number,
      };
    }
    console.warn('[Encumbrance] config_carrying_capacity not loaded.');
    return { light: 0, medium: 0, heavy: 0 };
  });

  // ── Load tier ─────────────────────────────────────────────────────────────
  const loadTier = $derived.by(() => {
    const w = totalWeightLbs;
    const c = carryingCapacity;
    if (c.heavy === 0) return { label: 'Unknown',     color: 'oklch(55% 0.010 264)', severity: -1 };
    if (w > c.heavy)  return { label: 'Overloaded',   color: 'oklch(40% 0.20 28)',   severity: 3 };
    if (w > c.medium) return { label: 'Heavy Load',   color: 'oklch(55% 0.20 28)',   severity: 2 };
    if (w > c.light)  return { label: 'Medium Load',  color: 'oklch(72% 0.17 88)',   severity: 1 };
    return               { label: 'Light Load',   color: 'oklch(65% 0.17 145)',  severity: 0 };
  });

  // ── Progress bar values ────────────────────────────────────────────────────
  /**
   * Percentage of the Heavy threshold that has been filled.
   * The bar maxes out at 100% even if overloaded.
   */
  const barPct = $derived.by(() => {
    const cap = carryingCapacity.heavy;
    if (cap <= 0) return 0;
    return Math.min(100, (totalWeightLbs / cap) * 100);
  });

  /**
   * Where the Light and Medium tier markers sit on the bar as percentages.
   * These are rendered as thin vertical hairlines.
   */
  const lightPct  = $derived(carryingCapacity.heavy > 0 ? (carryingCapacity.light  / carryingCapacity.heavy) * 100 : 33);
  const mediumPct = $derived(carryingCapacity.heavy > 0 ? (carryingCapacity.medium / carryingCapacity.heavy) * 100 : 66);

  // ── Wealth ─────────────────────────────────────────────────────────────────
  let cp = $state(0);
  let sp = $state(0);
  let gp = $state(0);
  let pp = $state(0);

  const coinWeightLbs = $derived(Math.floor((cp + sp + gp + pp) / 50));
  const totalGoldValue = $derived(cp / 100 + sp / 10 + gp + pp * 10);

  /**
   * Coin definitions — colour-coded labels.
   * Using inline style for coin label colour because these are semantic
   * fantasy-coin colours not available in the standard Tailwind palette.
   */
  const COINS = [
    { key: 'pp', label: 'PP', color: '#e2e8f0', title: 'Platinum Pieces' },
    { key: 'gp', label: 'GP', color: '#fbbf24', title: 'Gold Pieces'     },
    { key: 'sp', label: 'SP', color: '#9ca3af', title: 'Silver Pieces'   },
    { key: 'cp', label: 'CP', color: '#d97706', title: 'Copper Pieces'   },
  ] as const;

  function getCoin(key: string): number {
    return key === 'pp' ? pp : key === 'gp' ? gp : key === 'sp' ? sp : cp;
  }
  function setCoin(key: string, val: number) {
    if (key === 'pp') pp = val;
    else if (key === 'gp') gp = val;
    else if (key === 'sp') sp = val;
    else cp = val;
  }
</script>

<div class="card p-4 flex flex-col gap-3">

  <!-- ── Header ──────────────────────────────────────────────────────────── -->
  <div class="section-header border-b border-border pb-2">
    <IconEncumbrance size={20} aria-hidden="true" />
    <span>Encumbrance &amp; Wealth</span>
  </div>

  <!-- ── Weight summary row ───────────────────────────────────────────────── -->
  <div class="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm">
    <span class="font-bold text-sky-500 dark:text-sky-400">{engine.formatWeight(totalWeightLbs)}</span>
    <span class="text-text-muted text-xs">carried</span>

    <span class="text-text-muted/40 hidden sm:inline">|</span>

    <!-- Tier thresholds -->
    <div class="flex items-center gap-2 text-xs text-text-muted flex-wrap">
      <span>Light ≤ <strong class="text-text-secondary">{engine.formatWeight(carryingCapacity.light)}</strong></span>
      <span>Medium ≤ <strong class="text-text-secondary">{engine.formatWeight(carryingCapacity.medium)}</strong></span>
      <span>Heavy ≤ <strong class="text-text-secondary">{engine.formatWeight(carryingCapacity.heavy)}</strong></span>
    </div>
  </div>

  <!-- ── Encumbrance bar with tier markers ────────────────────────────────── -->
  <div class="flex flex-col gap-1">
    <!--
      Outer container: relative so tier hairlines can be absolutely positioned.
      `progress-bar` from app.css provides the track; we override fill color
      via the CSS custom property --progress-color.
    -->
    <div class="relative">
      <div
        class="progress-bar"
        style="--progress-pct: {barPct}%; --progress-color: {loadTier.color};"
        role="progressbar"
        aria-valuenow={totalWeightLbs}
        aria-valuemin={0}
        aria-valuemax={carryingCapacity.heavy || 100}
        aria-label="Encumbrance: {loadTier.label}"
      >
        <div class="progress-bar__fill"></div>
      </div>

      <!-- Tier marker hairlines -->
      {#if carryingCapacity.heavy > 0}
        <!-- Light / Medium boundary -->
        <div
          class="absolute top-0 h-full w-px bg-border/70 pointer-events-none"
          style="left: {lightPct}%;"
          aria-hidden="true"
        ></div>
        <!-- Medium / Heavy boundary -->
        <div
          class="absolute top-0 h-full w-px bg-border/70 pointer-events-none"
          style="left: {mediumPct}%;"
          aria-hidden="true"
        ></div>
      {/if}
    </div>

    <!-- Tier labels beneath the bar -->
    {#if carryingCapacity.heavy > 0}
      <div class="relative h-4 text-[10px] text-text-muted select-none">
        <span class="absolute left-0">Light</span>
        <span class="absolute" style="left: {lightPct}%; transform: translateX(-50%);">Medium</span>
        <span class="absolute" style="left: {mediumPct}%; transform: translateX(-50%);">Heavy</span>
        <span class="absolute right-0">Max</span>
      </div>
    {/if}
  </div>

  <!-- ── Load tier badge ──────────────────────────────────────────────────── -->
  <div class="flex items-center gap-2">
    <span
      class="text-xs font-semibold border rounded px-2 py-0.5 inline-flex items-center gap-1.5"
      style="color: {loadTier.color}; border-color: {loadTier.color};"
    >
      ● {loadTier.label}
    </span>
    {#if loadTier.severity > 0}
      <span class="text-xs text-text-muted italic">— speed reduced, check penalties apply</span>
    {/if}
  </div>

  <!-- Coin weight note -->
  {#if coinWeightLbs > 0}
    <p class="text-xs text-text-muted">
      Coins add: <strong>{engine.formatWeight(coinWeightLbs)}</strong>
    </p>
  {/if}

  <!-- ── Wealth tracker ───────────────────────────────────────────────────── -->
  <div class="flex flex-col gap-2 pt-2 border-t border-border">
    <div class="section-header">
      <IconWealth size={16} aria-hidden="true" />
      <span class="text-xs">Wealth</span>
    </div>

    <!-- Coin inputs: 4-column grid + total -->
    <div class="flex items-end gap-2 flex-wrap">
      {#each COINS as coin}
        <div class="flex flex-col items-center gap-0.5">
          <label
            for="coin-{coin.key}"
            class="text-[10px] font-bold uppercase"
            style="color: {coin.color};"
            title={coin.title}
          >{coin.label}</label>
          <input
            id="coin-{coin.key}"
            type="number"
            min="0"
            value={getCoin(coin.key)}
            onchange={(e) => setCoin(coin.key, parseInt((e.target as HTMLInputElement).value, 10) || 0)}
            class="input w-16 text-center text-sm px-1 py-1.5"
            aria-label="{coin.title}"
          />
        </div>
      {/each}

      <!-- Total GP equivalent -->
      <div class="flex flex-col items-center gap-0.5 ml-2">
        <span class="text-[10px] font-bold uppercase text-yellow-500 dark:text-yellow-400">Total</span>
        <div class="flex items-center justify-center h-9 px-2 rounded-md border border-border bg-surface min-w-[5rem]">
          <span class="text-sm font-bold text-yellow-500 dark:text-yellow-400">
            {totalGoldValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GP
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- Config hint when carrying capacity table is missing -->
  {#if carryingCapacity.heavy === 0}
    <p class="text-xs text-text-muted italic">
      Load <code class="bg-surface-alt px-1 rounded">config_carrying_capacity</code> for accurate weight limits.
    </p>
  {/if}

</div>
