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
  import { ui } from '$lib/i18n/ui-strings';
  import { computeCoinWeight, computeWealthInGP, toDisplayPct } from '$lib/utils/formatters';
  import { IconEncumbrance, IconWealth } from '$lib/components/ui/icons';
  import {
    CONDITION_ENCUMBERED_FEATURE_ID,
    CONDITION_ENCUMBERED_INSTANCE_ID,
  } from '$lib/utils/constants';

  // ── condition_encumbered dispatch ─────────────────────────────────────────
  // D&D 3.5 RULE: A Medium or heavier load imposes the Encumbered condition,
  // which applies armor check penalty to Dex- and Str-based skill checks and
  // attack rolls and reduces movement speed. We model this by adding/removing
  // the `condition_encumbered` feature instance on the engine reactively.
  //
  // NOTE: The engine already auto-manages `condition_medium_load` and
  //   `condition_heavy_load` (for conditionNode gating) via its internal
  //   `#encumbranceEffect`. This component adds the separate `condition_encumbered`
  //   feature which grants the actual penalty modifiers (movement reduction, etc.).
  //   The two systems are complementary, not duplicates.
  //
  // WHY USE $effect (not $derived)?
  //   We need to mutate engine state in response to the computed loadTier severity.
  //   A $derived cannot produce side effects — $effect is the correct rune.
  //
  // ARCHITECTURE NOTE:
  //   The engine.addFeature / removeFeature calls are fire-and-forget. The
  //   condition_encumbered feature in the rule files grants the appropriate
  //   modifiers (movement speed reduction, skill check penalties) via its
  //   grantedModifiers array — no hardcoded values appear in this component.
  // Use named constants (zero-hardcoding rule, ARCHITECTURE.md §6).
  // Imported from constants.ts so a rename stays safe across the whole codebase.
  const ENCUMBERED_INSTANCE_ID = CONDITION_ENCUMBERED_INSTANCE_ID;
  const ENCUMBERED_FEATURE_ID  = CONDITION_ENCUMBERED_FEATURE_ID;

  $effect(() => {
    // Use engine.phase_isEncumbered — the "Medium load or heavier" threshold check
    // is a D&D game rule that belongs in the engine (ARCHITECTURE.md §3).
    const isEncumbered = engine.phase_isEncumbered;

    const alreadyActive = engine.character.activeFeatures.some(
      afi => afi.instanceId === ENCUMBERED_INSTANCE_ID && afi.isActive
    );

    if (isEncumbered && !alreadyActive) {
      // Only add the condition if the feature exists in the loaded data to avoid
      // phantom instances when no rule sources define condition_encumbered.
      if (dataLoader.getFeature(ENCUMBERED_FEATURE_ID)) {
        engine.addFeature({
          instanceId: ENCUMBERED_INSTANCE_ID,
          featureId:  ENCUMBERED_FEATURE_ID,
          isActive:   true,
        });
      }
    } else if (!isEncumbered && alreadyActive) {
      // Remove the auto-dispatched instance when load drops below Medium.
      engine.removeFeature(ENCUMBERED_INSTANCE_ID);
    }
  });

  // ── Total weight — read from engine (avoids duplicating game logic) ────────
  //
  // WHY NOT COMPUTED HERE:
  //   Iterating active features and summing item weights is D&D game logic that
  //   belongs in the engine (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
  //   The engine exposes `phase2b_totalCarriedWeight` for this purpose.
  const totalWeightLbs = $derived(engine.phase2b_totalCarriedWeight);

  // ── Carrying capacity (from engine) ───────────────────────────────────────
  //
  // WHY NOT COMPUTED HERE:
  //   Looking up a config table using a resolved STR score is D&D game logic.
  //   The engine exposes `phase_carryingCapacity` which performs the lookup.
  const carryingCapacity = $derived(engine.phase_carryingCapacity);

  // ── Load tier display — UI label/color from engine severity ───────────────
  //
  // The severity number (0-3 or -1) is a D&D game value — read from the engine.
  // The label/color mapping is purely a UI concern — kept in this component.
  const loadTier = $derived.by(() => {
    const severity = engine.phase2b_encumbranceTier;
    const c = carryingCapacity;
    // -1 = config table not loaded
    if (c.heavy === 0 || severity === -1) return { label: ui('inventory.encumbrance.tier_unknown', engine.settings.language),    color: 'oklch(55% 0.010 264)', severity: -1 };
    if (severity >= 3)                    return { label: ui('inventory.encumbrance.tier_overloaded', engine.settings.language), color: 'oklch(40% 0.20 28)',   severity: 3  };
    if (severity >= 2)                    return { label: ui('inventory.encumbrance.tier_heavy', engine.settings.language),      color: 'oklch(55% 0.20 28)',   severity: 2  };
    if (severity >= 1)                    return { label: ui('inventory.encumbrance.tier_medium', engine.settings.language),     color: 'oklch(72% 0.17 88)',   severity: 1  };
    return                                       { label: ui('inventory.encumbrance.tier_light', engine.settings.language),      color: 'oklch(65% 0.17 145)',  severity: 0  };
  });

  // ── Progress bar values ────────────────────────────────────────────────────
  /**
   * Percentage of the Heavy threshold that has been filled.
   * The bar maxes out at 100% even if overloaded.
   */
  // toDisplayPct centralises Math.min/division arithmetic (ARCHITECTURE.md §3).
  const barPct = $derived(toDisplayPct(totalWeightLbs, carryingCapacity.heavy));

  /**
   * Where the Light and Medium tier markers sit on the bar as percentages.
   * These are rendered as thin vertical hairlines.
   * Defaults to 33%/66% when the heavy cap is 0 (character has no STR data yet).
   */
  const lightPct  = $derived(toDisplayPct(carryingCapacity.light,  carryingCapacity.heavy) || 33);
  const mediumPct = $derived(toDisplayPct(carryingCapacity.medium, carryingCapacity.heavy) || 66);

  // ── Wealth ─────────────────────────────────────────────────────────────────
  let cp = $state(0);
  let sp = $state(0);
  let gp = $state(0);
  let pp = $state(0);

  // D&D 3.5 coin weight and exchange rate formulas are in formatters.ts
  // (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3). The Math.floor and
  // hardcoded exchange constants (50 coins/lb, 100 cp/gp, etc.) may not appear
  // directly in .svelte files.
  const coinWeightLbs  = $derived(computeCoinWeight(cp, sp, gp, pp));
  const totalGoldValue = $derived(computeWealthInGP(cp, sp, gp, pp));

  /**
   * Coin definitions — colour-coded labels using Tailwind utility class names.
   * Using a `colorClass` per coin so Tailwind's static scanner sees all complete
   * class strings at build time (no dynamic string construction).
   * PP = slate-200 (platinum shimmer), GP = yellow-400 (gold), SP = slate-400
   * (silver), CP = amber-600 (copper/bronze).
   */
  const COINS = $derived([
    { key: 'pp', label: ui('inventory.coins.pp', engine.settings.language), colorClass: 'text-slate-200  dark:text-slate-300',  title: ui('inventory.coins.pp_title', engine.settings.language) },
    { key: 'gp', label: ui('inventory.coins.gp', engine.settings.language), colorClass: 'text-yellow-400 dark:text-yellow-300', title: ui('inventory.coins.gp_title', engine.settings.language) },
    { key: 'sp', label: ui('inventory.coins.sp', engine.settings.language), colorClass: 'text-slate-400  dark:text-slate-300',  title: ui('inventory.coins.sp_title', engine.settings.language) },
    { key: 'cp', label: ui('inventory.coins.cp', engine.settings.language), colorClass: 'text-amber-600  dark:text-amber-400',  title: ui('inventory.coins.cp_title', engine.settings.language) },
  ]);

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
    <span>{ui('inventory.encumbrance.title', engine.settings.language)}</span>
  </div>

  <!-- ── Weight summary row ───────────────────────────────────────────────── -->
  <div class="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm">
    <span class="font-bold text-sky-500 dark:text-sky-400">{engine.formatWeight(totalWeightLbs)}</span>
    <span class="text-text-muted text-xs">{ui('inventory.encumbrance.carried', engine.settings.language)}</span>

    <span class="text-text-muted/40 hidden sm:inline">|</span>

    <!-- Tier thresholds -->
    <div class="flex items-center gap-2 text-xs text-text-muted flex-wrap">
      <span>{ui('inventory.encumbrance.light_lte', engine.settings.language)} <strong class="text-text-secondary">{engine.formatWeight(carryingCapacity.light)}</strong></span>
      <span>{ui('inventory.encumbrance.medium_lte', engine.settings.language)} <strong class="text-text-secondary">{engine.formatWeight(carryingCapacity.medium)}</strong></span>
      <span>{ui('inventory.encumbrance.heavy_lte', engine.settings.language)} <strong class="text-text-secondary">{engine.formatWeight(carryingCapacity.heavy)}</strong></span>
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
        <span class="absolute left-0">{ui('inventory.encumbrance.light', engine.settings.language)}</span>
        <span class="absolute" style="left: {lightPct}%; transform: translateX(-50%);">{ui('inventory.encumbrance.medium', engine.settings.language)}</span>
        <span class="absolute" style="left: {mediumPct}%; transform: translateX(-50%);">{ui('inventory.encumbrance.heavy', engine.settings.language)}</span>
        <span class="absolute right-0">{ui('inventory.encumbrance.max', engine.settings.language)}</span>
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
      <span class="text-xs text-text-muted italic">{ui('inventory.encumbrance.speed_warning', engine.settings.language)}</span>
    {/if}
  </div>

  <!-- Coin weight note -->
  {#if coinWeightLbs > 0}
    <p class="text-xs text-text-muted">
      {ui('inventory.encumbrance.coin_weight', engine.settings.language)} <strong>{engine.formatWeight(coinWeightLbs)}</strong>
    </p>
  {/if}

  <!-- ── Wealth tracker ───────────────────────────────────────────────────── -->
  <div class="flex flex-col gap-2 pt-2 border-t border-border">
    <div class="section-header">
      <IconWealth size={16} aria-hidden="true" />
      <span class="text-xs">{ui('inventory.encumbrance.wealth', engine.settings.language)}</span>
    </div>

    <!-- Coin inputs: 4-column grid + total -->
    <div class="flex items-end gap-2 flex-wrap">
      {#each COINS as coin}
        <div class="flex flex-col items-center gap-0.5">
          <label
            for="coin-{coin.key}"
            class="text-[10px] font-bold uppercase {coin.colorClass}"
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
        <span class="text-[10px] font-bold uppercase text-yellow-500 dark:text-yellow-400">{ui('inventory.encumbrance.total', engine.settings.language)}</span>
        <div class="flex items-center justify-center h-9 px-2 rounded-md border border-border bg-surface min-w-[5rem]">
          <span class="text-sm font-bold text-yellow-500 dark:text-yellow-400">
            {totalGoldValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {ui('inventory.encumbrance.gp', engine.settings.language)}
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- Config hint when carrying capacity table is missing -->
  {#if carryingCapacity.heavy === 0}
    <p class="text-xs text-text-muted italic">
      {ui('inventory.encumbrance.config_hint', engine.settings.language)}
    </p>
  {/if}

</div>
