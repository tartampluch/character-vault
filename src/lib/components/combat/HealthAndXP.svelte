<!--
  @file src/lib/components/combat/HealthAndXP.svelte
  @description Health (HP) and Experience Points panel for the Combat tab.
  Phase 19.9: Migrated to Tailwind CSS — all scoped <style> removed except
  the Level Up pulse animation keyframe (justified by spec §19.14).

  HP BAR: Uses `.hp-bar` / `.hp-bar__fill` from app.css (gradient green→yellow→red).
  XP BAR: Uses `.progress-bar` / `.progress-bar__fill` from app.css (accent colour).
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { IconHealth, IconXP, IconHeal, IconDamage, IconStartTurn, IconEncounterReset, IconLongRest } from '$lib/components/ui/icons';
  import {
    RESOURCE_HP_ID,
    RESOURCE_VITALITY_POINTS_ID,
    RESOURCE_WOUND_POINTS_ID,
    COMBAT_STAT_MAX_VITALITY_ID,
  } from '$lib/utils/constants';

  // ── Variant detection ────────────────────────────────────────────────────
  const isVWPMode  = $derived(engine.settings.variantRules?.vitalityWoundPoints === true);

  // ── Standard HP pool ─────────────────────────────────────────────────────
  const hpPool        = $derived(engine.character.resources[RESOURCE_HP_ID]);
  const maxHp         = $derived(engine.phase3_maxHp);
  const currentHp     = $derived(hpPool?.currentValue ?? 0);
  const tempHp        = $derived(hpPool?.temporaryValue ?? 0);
  // HP bar percentages are computed in the engine (zero-game-logic-in-Svelte rule,
  // ARCHITECTURE.md §3). Math.max / Math.min / division are forbidden in .svelte files.
  // @see GameEngine.svelte.ts — phase_hpPercent, phase_tempHpPercent
  const hpPercent     = $derived(engine.phase_hpPercent);
  const tempPercent   = $derived(engine.phase_tempHpPercent);

  // ── Vitality / Wound Points pools (Extension H) ──────────────────────────
  const vpPool     = $derived(engine.character.resources[RESOURCE_VITALITY_POINTS_ID]);
  const wpPool     = $derived(engine.character.resources[RESOURCE_WOUND_POINTS_ID]);
  const maxVP      = $derived(vpPool ? (engine.phase3_combatStats[COMBAT_STAT_MAX_VITALITY_ID]?.totalValue ?? 0) : 0);
  const currentVP  = $derived(vpPool?.currentValue ?? 0);
  const currentWP  = $derived(wpPool?.currentValue ?? 0);
  // Max Wound Points = CON score. Use engine.phase_maxWoundPoints to avoid
  // hard-coding the 'stat_constitution' pipeline ID in this component
  // (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
  const maxWP      = $derived(wpPool ? engine.phase_maxWoundPoints : 10);
  // VP/WP bar percentages delegated to engine (same pattern as phase_hpPercent).
  const vpPercent  = $derived(engine.phase_vpPercent);
  const wpPercent  = $derived(engine.phase_wpPercent);

  // CON HP contribution (CON modifier × character level) is a D&D formula that
  // belongs in the engine, not in the component. Read from the engine-derived property.
  const conHpContrib = $derived(engine.phase3_conHpContrib);

  // HP status key — D&D threshold logic (dead at −CON, dying, etc.) lives in the engine.
  // The engine exposes a string key; this component maps it to a ui() label + color.
  const hpStatusKey = $derived(engine.phase_hpStatusKey);

	/**
	 * Map status key → { label (i18n key), color (CSS variable) }.
	 * Colors reference CSS custom properties so they resolve correctly in both
	 * light and dark themes without hardcoding oklch values here.
	 * The inline `style="color: {hpStatus.color}"` accepts CSS variable strings
	 * such as `"var(--color-red-600)"` — browsers resolve them at render time.
	 */
	const HP_STATUS_MAP: Record<string, { labelKey: string; color: string }> = {
		dead:        { labelKey: 'combat.hp.dead',        color: 'var(--color-red-900)'    },
		dying:       { labelKey: 'combat.hp.dying',       color: 'var(--color-red-800)'    },
		unconscious: { labelKey: 'combat.hp.unconscious', color: 'var(--color-red-800)'    },
		bloodied:    { labelKey: 'combat.hp.bloodied',    color: 'var(--color-red-600)'    },
		injured:     { labelKey: 'combat.hp.injured',     color: 'var(--color-gold)'       },
		healthy:     { labelKey: 'combat.hp.healthy',     color: 'var(--color-green-500)'  },
		unknown:     { labelKey: 'combat.hp.unknown',     color: 'var(--theme-text-muted)' },
	};
  const hpStatus = $derived.by(() => {
    const entry = HP_STATUS_MAP[hpStatusKey] ?? HP_STATUS_MAP['unknown'];
    return { label: ui(entry.labelKey as Parameters<typeof ui>[0], engine.settings.language), color: entry.color };
  });

  let healAmount   = $state('');
  let damageAmount = $state('');
  let tempHpAmount = $state('');

  function doHeal() {
    const n = parseInt(healAmount, 10);
    if (!isNaN(n) && n > 0) { engine.adjustHP(n); healAmount = ''; }
  }
  function doDamage() {
    const n = parseInt(damageAmount, 10);
    if (!isNaN(n) && n > 0) { engine.adjustHP(-n); damageAmount = ''; }
  }
  function addTempHp() {
    const n = parseInt(tempHpAmount, 10);
    if (!isNaN(n) && n > 0) { engine.setTemporaryHP(n); tempHpAmount = ''; }
  }
  function setCurrentHpDirectly(event: Event) {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    // Delegate to the engine which enforces the D&D "cannot exceed maxHP" cap rule.
    // Direct mutation of hpPool.currentValue would violate zero-game-logic-in-Svelte.
    if (!isNaN(val)) engine.setCurrentHP(val);
  }

  // ── Per-turn healing (Extension B) ───────────────────────────────────────
  /** All resource pools with resetCondition "per_turn" — Fast Healing / Regeneration */
  const perTurnPools = $derived(
    Object.values(engine.character.resources).filter(p => p.resetCondition === 'per_turn')
  );
  const perRoundPools = $derived(
    Object.values(engine.character.resources).filter(p => p.resetCondition === 'per_round')
  );

  function onStartTurn() { engine.triggerTurnTick(); }
  function onNewEncounter() { engine.triggerEncounterReset(); }
  function onLongRest() { engine.triggerLongRest(); }

  // ── XP — bound to engine.character.xp (Extension A) ─────────────────────
  /** ECL: class levels + level adjustment */
  const eclForXp = $derived(engine.phase0_eclForXp);
  const levelAdj = $derived(engine.character.levelAdjustment ?? 0);

  // LA reduction eligibility — D&D rule (3×LA class levels) lives in the engine.
  const canReduceLA = $derived(engine.phase_canReduceLA);

  // XP threshold data is computed by the engine (zero-game-logic-in-Svelte rule).
  // The engine exposes phase_nextLevelXp, phase_currentLevelXp, phase_xpIntoLevel,
  // phase_xpNeeded, phase_xpPercent, and phase_canLevelUp as $derived properties.
  // HealthAndXP.svelte reads them directly — no config table queries or arithmetic here.
  const nextLevelXp = $derived(engine.phase_nextLevelXp);
  const currentXp   = $derived(engine.character.xp ?? 0);
  const xpIntoLevel = $derived(engine.phase_xpIntoLevel);
  const xpNeeded    = $derived(engine.phase_xpNeeded);
  const xpPercent   = $derived(engine.phase_xpPercent);
  const canLevelUp  = $derived(engine.phase_canLevelUp);

  let xpToAdd = $state('');
  function addXp() {
    const n = parseInt(xpToAdd, 10);
    // Delegate to engine.addXp() to keep character state mutations out of the component.
    if (!isNaN(n)) { engine.addXp(n); xpToAdd = ''; }
  }
  function reduceLA() {
    if (!canReduceLA) return;
    if (!confirm(
      ui('ecl.reduce_la_confirm', engine.settings.language)
        .replace('{current}', String(levelAdj))
        .replace('{next}', String(levelAdj - 1))
    )) return;
    // Delegate to engine.reduceLA() — direct mutation of levelAdjustment would violate
    // the zero-game-logic-in-Svelte rule (ARCHITECTURE.md §3).
    engine.reduceLA();
  }
</script>

<div class="card p-4 flex flex-col gap-5">

  <!-- ── HIT POINTS ──────────────────────────────────────────────────────── -->
  <section class="flex flex-col gap-2">
    <div class="section-header border-b border-border pb-2">
      <IconHealth size={20} aria-hidden="true" />
      <span>{ui('combat.hp.title', engine.settings.language)}</span>
    </div>

    <!-- Status badge + CON contribution -->
    <div class="flex items-center justify-between flex-wrap gap-2">
      <span
        class="text-xs font-semibold border rounded px-2 py-0.5"
        style="color: {hpStatus.color}; border-color: {hpStatus.color};"
      >
        ● {hpStatus.label}
      </span>
      <span class="text-xs text-text-muted" title="{ui('combat.hp.con_contrib_tooltip', engine.settings.language)}">
        {ui('combat.hp.con_contrib', engine.settings.language)} {conHpContrib >= 0 ? '+' : ''}{conHpContrib}
      </span>
    </div>

    <!-- HP numbers row -->
    <div class="flex items-end gap-3 flex-wrap">
      <div class="flex flex-col items-center gap-0.5">
        <span class="text-[10px] uppercase tracking-wider text-text-muted">{ui('combat.hp.current', engine.settings.language)}</span>
        <input
          type="number"
          class="w-16 text-center text-xl font-bold rounded border border-border bg-surface px-1 py-0.5 text-red-400 focus:outline-none focus:border-red-400"
          value={currentHp}
          onchange={setCurrentHpDirectly}
          aria-label={ui('combat.hp.current_aria', engine.settings.language)}
        />
      </div>
      <span class="text-xl text-text-muted self-center">/</span>
      <div class="flex flex-col items-center gap-0.5">
        <span class="text-[10px] uppercase tracking-wider text-text-muted">{ui('combat.hp.max', engine.settings.language)}</span>
        <span class="text-xl font-bold text-sky-400">{maxHp}</span>
      </div>
      {#if tempHp > 0}
        <div class="flex flex-col items-center gap-0.5">
          <span class="text-[10px] uppercase tracking-wider text-text-muted">{ui('combat.hp.temp', engine.settings.language)}</span>
          <span class="text-lg font-bold text-green-400">+{tempHp}</span>
        </div>
      {/if}
    </div>

    <!-- HP visual bar — using app.css .hp-bar classes with --hp-pct -->
    <div
      class="hp-bar relative"
      role="progressbar"
      aria-valuenow={currentHp}
      aria-valuemin={-100}
      aria-valuemax={maxHp}
      aria-label="HP: {currentHp} / {maxHp}"
    >
      <!-- Temp HP overlay (right-aligned, semi-transparent green) -->
      {#if tempHp > 0}
        <div
          class="absolute top-0 right-0 h-full rounded-full bg-green-400/40"
          style="width: {tempPercent}%;"
          aria-hidden="true"
        ></div>
      {/if}
      <!-- Current HP fill using the gradient from app.css -->
      <div
        class="hp-bar__fill"
        style="--hp-pct: {hpPercent}%;"
      ></div>
    </div>

    <!-- Heal / Damage / Temp HP controls -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <!-- Heal -->
      <div class="flex gap-1.5">
        <input
          type="number"
          bind:value={healAmount}
          placeholder="0"
          min="1"
          class="input w-14 text-center px-1"
          aria-label={ui('combat.hp.heal_amount_aria', engine.settings.language)}
          onkeydown={(e) => e.key === 'Enter' && doHeal()}
        />
        <button
          class="flex-1 flex items-center justify-center gap-1 rounded-md text-sm font-medium
                 px-2 py-2 bg-green-800/60 text-green-300 hover:bg-green-700/60 transition-colors duration-150"
          onclick={doHeal}
          aria-label={ui('combat.hp.apply_heal_aria', engine.settings.language)}
          type="button"
        >
          <IconHeal size={14} aria-hidden="true" /> {ui('combat.hp.heal', engine.settings.language)}
        </button>
      </div>

      <!-- Damage -->
      <div class="flex gap-1.5">
        <input
          type="number"
          bind:value={damageAmount}
          placeholder="0"
          min="1"
          class="input w-14 text-center px-1"
          aria-label={ui('combat.hp.damage_amount_aria', engine.settings.language)}
          onkeydown={(e) => e.key === 'Enter' && doDamage()}
        />
        <button
          class="flex-1 flex items-center justify-center gap-1 rounded-md text-sm font-medium
                 px-2 py-2 bg-red-800/60 text-red-300 hover:bg-red-700/60 transition-colors duration-150"
          onclick={doDamage}
          aria-label={ui('combat.hp.apply_damage_aria', engine.settings.language)}
          type="button"
        >
          <IconDamage size={14} aria-hidden="true" /> {ui('combat.hp.damage', engine.settings.language)}
        </button>
      </div>

      <!-- Temp HP -->
      <div class="flex gap-1.5">
        <input
          type="number"
          bind:value={tempHpAmount}
          placeholder="0"
          min="1"
          class="input w-14 text-center px-1"
          aria-label={ui('combat.hp.temp_amount_aria', engine.settings.language)}
          onkeydown={(e) => e.key === 'Enter' && addTempHp()}
        />
        <button
          class="flex-1 flex items-center justify-center gap-1 rounded-md text-sm font-medium
                 px-2 py-2 bg-emerald-800/60 text-emerald-300 hover:bg-emerald-700/60 transition-colors duration-150"
          onclick={addTempHp}
          aria-label={ui('combat.hp.add_temp_aria', engine.settings.language)}
          type="button"
        >
          {ui('combat.hp.add_temp', engine.settings.language)}
        </button>
      </div>
    </div>
  </section>

  <!-- ── VITALITY / WOUND POINTS (Extension H — VWP variant) ────────────── -->
  {#if isVWPMode}
    <section class="flex flex-col gap-2">
      <!-- Vitality Points -->
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-sky-400">{ui('vwp.vitality_label', engine.settings.language)}</span>
          <span class="text-text-muted">{currentVP} / {maxVP}</span>
        </div>
        <div class="h-2.5 rounded-full bg-surface-alt overflow-hidden border border-border">
          <div class="h-full rounded-full bg-sky-500 transition-all duration-300" style="width: {vpPercent}%;" aria-hidden="true"></div>
        </div>
      </div>
      <!-- Wound Points -->
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-red-400">{ui('vwp.wound_label', engine.settings.language)}</span>
          <span class="text-text-muted">{currentWP} / {maxWP}</span>
        </div>
        <div class="h-2.5 rounded-full bg-surface-alt overflow-hidden border border-border">
          <div class="h-full rounded-full bg-red-600 transition-all duration-300" style="width: {wpPercent}%;" aria-hidden="true"></div>
        </div>
        <p class="text-[10px] text-text-muted">{ui('vwp.fatigued_note', engine.settings.language)}</p>
      </div>
    </section>
  {/if}

  <!-- ── FAST HEALING / PER-TURN POOLS (Extension B) ──────────────────── -->
  {#if perTurnPools.length > 0 || perRoundPools.length > 0}
    <section class="flex flex-col gap-2">
      <div class="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
        {ui('heal.fast_healing', engine.settings.language)}
      </div>
      <div class="flex flex-wrap gap-2 items-center">
        {#each perTurnPools as pool}
          <span class="badge-accent text-xs px-2 py-0.5 rounded-full">
            {engine.t(pool.label) ?? pool.id}: {ui('heal.per_turn_badge', engine.settings.language).replace('{n}', String(pool.rechargeAmount ?? '?'))}
          </span>
        {/each}
        {#each perRoundPools as pool}
          <span class="badge-accent text-xs px-2 py-0.5 rounded-full opacity-70">
            {engine.t(pool.label) ?? pool.id}: {ui('heal.per_round_badge', engine.settings.language).replace('{n}', String(pool.rechargeAmount ?? '?'))}
          </span>
        {/each}
        <button
          class="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-sky-800/50 text-sky-300 hover:bg-sky-700/60 transition-colors duration-150"
          onclick={onStartTurn}
          title={ui('heal.tick_tooltip', engine.settings.language)}
          type="button"
          aria-label={ui('heal.tick_button', engine.settings.language)}
        >
          <IconStartTurn size={12} aria-hidden="true" /> {ui('heal.tick_button', engine.settings.language)}
        </button>
      </div>
    </section>
  {/if}

  <!-- ── REST / ENCOUNTER BUTTONS ─────────────────────────────────────── -->
  <section class="flex gap-2 flex-wrap">
    <button
      class="flex items-center justify-center gap-1 flex-1 rounded-md px-2 py-1.5 text-xs font-medium border border-border text-text-secondary hover:border-accent hover:text-accent transition-colors duration-150"
      onclick={onNewEncounter}
      title="Reset encounter-slot abilities"
      type="button"
    ><IconEncounterReset size={12} aria-hidden="true" /> {ui('heal.encounter_reset', engine.settings.language)}</button>
    <button
      class="flex items-center justify-center gap-1 flex-1 rounded-md px-2 py-1.5 text-xs font-medium border border-border text-text-secondary hover:border-sky-500 hover:text-sky-400 transition-colors duration-150"
      onclick={onLongRest}
      title="Restore all long-rest resources"
      type="button"
    ><IconLongRest size={12} aria-hidden="true" /> {ui('heal.long_rest', engine.settings.language)}</button>
  </section>

  <!-- ── EXPERIENCE ──────────────────────────────────────────────────────── -->
  <section class="flex flex-col gap-2">
    <div class="section-header border-b border-border pb-2">
      <IconXP size={20} aria-hidden="true" />
      <span>{ui('combat.xp.title', engine.settings.language)}</span>
    </div>

    <!-- Level + ECL row (Extension A) -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div class="flex gap-2">
        <!-- Character level (class levels only — for feats/HP) -->
        <div class="flex flex-col items-center px-3 py-1.5 rounded-lg border border-border bg-surface-alt min-w-[3.5rem]">
          <span class="text-[10px] uppercase tracking-wider text-text-muted">{ui('combat.xp.level', engine.settings.language)}</span>
          <span class="text-2xl font-bold text-yellow-500 dark:text-yellow-400 leading-none">
            {engine.phase0_characterLevel}
          </span>
        </div>
        <!-- ECL and LA — shown only when LA > 0 (monster PCs) -->
        {#if levelAdj > 0}
          <div class="flex flex-col items-center px-3 py-1.5 rounded-lg border border-amber-600/40 bg-amber-950/20 min-w-[3.5rem]"
               title={ui('ecl.ecl_tooltip', engine.settings.language)}>
            <span class="text-[10px] uppercase tracking-wider text-amber-400/80">{ui('ecl.ecl_label', engine.settings.language)}</span>
            <span class="text-2xl font-bold text-amber-400 leading-none">{eclForXp}</span>
          </div>
          <div class="flex flex-col items-center px-2 py-1.5 rounded-lg border border-orange-600/30 bg-orange-950/15 min-w-[2.5rem]"
               title={ui('ecl.la_tooltip', engine.settings.language)}>
            <span class="text-[10px] uppercase tracking-wider text-orange-400/80">{ui('ecl.la_label', engine.settings.language)}</span>
            <span class="text-lg font-bold text-orange-400 leading-none">+{levelAdj}</span>
          </div>
        {/if}
      </div>
      <div class="flex items-center gap-1.5 text-sm flex-wrap">
        <span class="font-bold text-yellow-500 dark:text-yellow-400">{currentXp.toLocaleString()}</span>
        <span class="text-text-muted">{ui('combat.xp.xp_separator', engine.settings.language)}</span>
        <span class="text-text-secondary">{nextLevelXp.toLocaleString()} {ui('combat.xp.xp', engine.settings.language)}</span>
      </div>
    </div>

    <!-- Reduce LA button (SRD variant — available when 3×LA class levels accumulated) -->
    {#if canReduceLA}
      <button
        class="self-start flex items-center gap-1.5 px-2.5 py-1 rounded border border-orange-600/40 text-orange-400 text-xs hover:bg-orange-950/30 transition-colors duration-150"
        onclick={reduceLA}
        title={ui('ecl.reduce_la_tooltip', engine.settings.language)}
        type="button"
      >
        ↓ {ui('ecl.reduce_la', engine.settings.language)}
      </button>
    {/if}

    <!-- XP progress bar — uses ECL for threshold lookup -->
    <div
      class="progress-bar"
      style="--progress-pct: {xpPercent}%; --progress-color: var(--color-gold);"
      role="progressbar"
      aria-valuenow={xpIntoLevel}
      aria-valuemin={0}
      aria-valuemax={xpNeeded}
      aria-label="XP: {xpPercent.toFixed(0)}% to next level (ECL {eclForXp})"
    >
      <div class="progress-bar__fill"></div>
    </div>
    <p class="text-xs text-text-muted">
      {xpIntoLevel.toLocaleString()} / {xpNeeded.toLocaleString()} {ui('combat.xp.to_next', engine.settings.language)} ({xpPercent.toFixed(0)}%)
      {#if levelAdj > 0}<span class="text-amber-400/80 ml-1">({ui('ecl.ecl_label', engine.settings.language)} {eclForXp})</span>{/if}
    </p>

    <!-- Award XP + Level Up -->
    <div class="flex items-center gap-2 flex-wrap">
      <input
        type="number"
        bind:value={xpToAdd}
        placeholder={ui('combat.xp.add_placeholder', engine.settings.language)}
        class="input flex-1 min-w-[8rem]"
        aria-label={ui('combat.xp.add_aria', engine.settings.language)}
        onkeydown={(e) => e.key === 'Enter' && addXp()}
      />
      <button class="btn-secondary" onclick={addXp} aria-label={ui('combat.xp.award_aria', engine.settings.language)} type="button">
        {ui('combat.xp.award', engine.settings.language)}
      </button>
      {#if canLevelUp}
        <button
          class="level-up-btn flex items-center gap-1 px-3 py-2 rounded-md text-sm font-bold text-white"
          aria-label={ui('combat.xp.level_up_aria', engine.settings.language)}
          type="button"
        >
          <IconXP size={16} aria-hidden="true" /> {ui('combat.xp.level_up', engine.settings.language)}
        </button>
      {/if}
    </div>

    {#if !engine.phase_xpTableLoaded}
      <p class="text-xs text-text-muted italic">
        {ui('combat.xp.config_hint', engine.settings.language)}
      </p>
    {/if}
  </section>

</div>

<!--
  NOTE: The .level-up-btn gradient and @keyframes pulse-glow are defined in
  src/app.css (@layer components + global @keyframes block) so this component
  has no <style> block — in compliance with Phase 19.14 Tailwind migration
  completeness requirement. The --color-gold CSS token (oklch 72% 0.17 88) is
  declared in :root in app.css and reused by the level-up button gradient,
  the hp-bar gradient midpoint, and the XP progress bar fill color.
-->
