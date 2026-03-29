<!--
  @file src/lib/components/settings/CharacterCreationPanel.svelte
  @description Character Creation panel — Dice Rules (§2) + Stat Generation (§3).
  Extracted from settings/+page.svelte as part of F1b refactoring.

  Props (all $bindable):
    bind:explodingTwenties  — boolean
    bind:rerollOnes         — boolean
    bind:pointBuyBudget     — number
    bind:allowedRoll        — boolean
    bind:allowedPointBuy    — boolean
    bind:allowedStdArray    — boolean
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { IconDiceRoll, IconStats } from '$lib/components/ui/icons';

  let {
    explodingTwenties = $bindable(false),
    rerollOnes        = $bindable(false),
    pointBuyBudget    = $bindable(25),
    allowedRoll       = $bindable(true),
    allowedPointBuy   = $bindable(true),
    allowedStdArray   = $bindable(true),
  } = $props();
</script>

<!-- ── SECTION 2: DICE RULES ────────────────────────────────────────────── -->
<section class="card p-5 flex flex-col gap-4">
  <div>
    <h2 class="section-header text-base border-b border-border pb-2">
      <IconDiceRoll size={24} aria-hidden="true" /> {ui('settings.dice_rules.title', engine.settings.language)}
    </h2>
    <p class="mt-2 text-xs text-text-muted leading-relaxed">
      {ui('settings.dice_rules.desc', engine.settings.language)}
    </p>
  </div>

  <!-- Exploding Twenties -->
  <label class="flex items-start gap-3 cursor-pointer group">
    <div class="mt-0.5 shrink-0">
      <input
        type="checkbox"
        bind:checked={explodingTwenties}
        class="w-4 h-4 accent-accent rounded"
        aria-labelledby="dice-exploding-twenties-label"
      />
    </div>
    <div class="flex flex-col gap-0.5">
      <span id="dice-exploding-twenties-label" class="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
        {ui('settings.exploding_twenties', engine.settings.language)}
      </span>
      <span class="text-xs text-text-muted leading-relaxed">
        {ui('settings.exploding_twenties_desc', engine.settings.language)}
      </span>
    </div>
  </label>
</section>

<!-- ── SECTION 3: STAT GENERATION ───────────────────────────────────────── -->
<section class="card p-5 flex flex-col gap-4">
  <div>
    <h2 class="section-header text-base border-b border-border pb-2">
      <IconStats size={24} aria-hidden="true" /> {ui('settings.stat_gen.title', engine.settings.language)}
    </h2>
    <p class="mt-2 text-xs text-text-muted leading-relaxed">
      {ui('settings.stat_gen.desc', engine.settings.language)}
    </p>
  </div>

  <!-- Allowed Methods (checkboxes) -->
  <div class="flex flex-col gap-2">
    <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">
      {ui('settings.stat_gen.allowed_methods', engine.settings.language)}
    </span>
    <div class="flex flex-col gap-2">

      <!-- Roll (4d6 drop lowest) -->
      <div class="flex flex-col gap-1.5">
        <label class="flex items-center gap-2.5 cursor-pointer group">
          <input type="checkbox" bind:checked={allowedRoll} class="w-4 h-4 accent-accent rounded shrink-0" />
          <span class="text-sm text-text-primary group-hover:text-accent transition-colors">
            {ui('settings.stat_gen.roll', engine.settings.language)}
          </span>
        </label>
        <!-- Reroll Ones — sub-option for roll -->
        {#if allowedRoll}
          <label class="flex items-start gap-2.5 cursor-pointer group ml-6">
            <input type="checkbox" bind:checked={rerollOnes} class="w-3.5 h-3.5 accent-accent rounded shrink-0 mt-0.5" />
            <div class="flex flex-col gap-0">
              <span class="text-xs font-medium text-text-primary group-hover:text-accent transition-colors">
                {ui('settings.stat_gen.reroll_ones', engine.settings.language)}
              </span>
              <span class="text-[10px] text-text-muted">{ui('settings.stat_gen.reroll_ones_desc', engine.settings.language)}</span>
            </div>
          </label>
        {/if}
      </div>

      <!-- Point Buy -->
      <label class="flex items-center gap-2.5 cursor-pointer group">
        <input type="checkbox" bind:checked={allowedPointBuy} class="w-4 h-4 accent-accent rounded shrink-0" />
        <span class="text-sm text-text-primary group-hover:text-accent transition-colors">
          {ui('settings.stat_gen.point_buy', engine.settings.language)}
        </span>
      </label>

      <!-- Standard Array -->
      <label class="flex items-center gap-2.5 cursor-pointer group">
        <input type="checkbox" bind:checked={allowedStdArray} class="w-4 h-4 accent-accent rounded shrink-0" />
        <span class="text-sm text-text-primary group-hover:text-accent transition-colors">
          {ui('settings.stat_gen.standard_array', engine.settings.language)}
        </span>
      </label>

    </div>
  </div>

  <!-- Point Buy Budget — only relevant when point_buy is allowed -->
  {#if allowedPointBuy}
    <div class="flex flex-col gap-2">
      <label for="point-buy-budget" class="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {ui('settings.stat_gen.budget', engine.settings.language)}
      </label>
      <p class="text-xs text-text-muted -mt-1">
        {ui('settings.stat_gen.budget_desc', engine.settings.language)}
      </p>

      <!-- Preset buttons -->
      <div class="flex flex-wrap gap-2">
        {#each ([
          [15, 'settings.stat_gen.preset_low'],
          [25, 'settings.stat_gen.preset_std'],
          [32, 'settings.stat_gen.preset_high'],
          [40, 'settings.stat_gen.preset_epic'],
        ] as const) as [pts, key]}
          <button
            type="button"
            class="text-xs px-3 py-1 rounded border transition-colors
                   {pointBuyBudget === pts
                     ? 'border-accent bg-accent/15 text-accent'
                     : 'border-border text-text-muted hover:border-accent/50 hover:text-text-primary'}"
            onclick={() => { pointBuyBudget = pts; }}
          >
            {ui(key, engine.settings.language)}
          </button>
        {/each}
      </div>

      <!-- Custom budget input -->
      <div class="flex items-center gap-2">
        <input
          id="point-buy-budget"
          type="number"
          min="1"
          max="999"
          bind:value={pointBuyBudget}
          class="input w-24 text-center text-sm font-bold text-sky-500 dark:text-sky-400"
          aria-label="Point buy budget"
        />
        <span class="text-xs text-text-muted">{ui('settings.stat_gen.points_unit', engine.settings.language)}</span>
      </div>
    </div>
  {/if}
</section>
