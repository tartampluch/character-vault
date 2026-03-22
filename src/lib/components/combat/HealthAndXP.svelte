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
  import { dataLoader } from '$lib/engine/DataLoader';
  import { ui } from '$lib/i18n/ui-strings';
  import { IconHealth, IconXP, IconHeal, IconDamage } from '$lib/components/ui/icons';

  // ── Variant detection ────────────────────────────────────────────────────
  const isVWPMode  = $derived(engine.settings.variantRules?.vitalityWoundPoints === true);

  // ── Standard HP pool ─────────────────────────────────────────────────────
  const hpPool        = $derived(engine.character.resources['resources.hp']);
  const maxHp         = $derived(engine.phase3_maxHp);
  const currentHp     = $derived(hpPool?.currentValue ?? 0);
  const tempHp        = $derived(hpPool?.temporaryValue ?? 0);
  const effectiveMaxHp = $derived(maxHp + tempHp);
  const hpPercent     = $derived(maxHp > 0 ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0);
  const tempPercent   = $derived(effectiveMaxHp > 0 ? (tempHp / effectiveMaxHp) * 100 : 0);

  // ── Vitality / Wound Points pools (Extension H) ──────────────────────────
  const vpPool     = $derived(engine.character.resources['resources.vitality_points']);
  const wpPool     = $derived(engine.character.resources['resources.wound_points']);
  const maxVP      = $derived(vpPool ? (engine.phase3_combatStats['combatStats.max_vitality']?.totalValue ?? 0) : 0);
  const currentVP  = $derived(vpPool?.currentValue ?? 0);
  const currentWP  = $derived(wpPool?.currentValue ?? 0);
  const maxWP      = $derived(wpPool ? (engine.phase2_attributes['stat_con']?.totalValue ?? 10) : 10);
  const vpPercent  = $derived(maxVP > 0 ? Math.max(0, Math.min(100, (currentVP / maxVP) * 100)) : 0);
  const wpPercent  = $derived(maxWP > 0 ? Math.max(0, Math.min(100, (currentWP / maxWP) * 100)) : 0);

  /* Health status — colour stays inline since it's a runtime computed value */
  const hpStatus = $derived.by(() => {
    if (!hpPool || maxHp <= 0) return { label: ui('combat.hp.unknown', engine.settings.language), color: 'oklch(55% 0.010 264)' };
    if (currentHp <= -(engine.phase2_attributes['stat_con']?.totalValue ?? 10))
      return { label: ui('combat.hp.dead', engine.settings.language),        color: 'oklch(30% 0.18 28)' };
    if (currentHp <= -1) return { label: ui('combat.hp.dying', engine.settings.language),       color: 'oklch(40% 0.20 28)' };
    if (currentHp ===  0) return { label: ui('combat.hp.unconscious', engine.settings.language), color: 'oklch(40% 0.18 28)' };
    const frac = currentHp / maxHp;
    if (frac <= 0.25) return { label: ui('combat.hp.bloodied', engine.settings.language), color: 'oklch(55% 0.20 28)' };
    if (frac <= 0.50) return { label: ui('combat.hp.injured', engine.settings.language),  color: 'oklch(72% 0.17 88)' };
    return { label: ui('combat.hp.healthy', engine.settings.language), color: 'oklch(65% 0.17 145)' };
  });

  const conMod       = $derived(engine.phase2_attributes['stat_con']?.derivedModifier ?? 0);
  const conHpContrib = $derived(conMod * engine.phase0_characterLevel);

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
    if (!isNaN(val) && hpPool) hpPool.currentValue = Math.min(val, maxHp);
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

  const nextLevelXp = $derived.by(() => {
    // Use ECL (not characterLevel) for XP threshold table lookups
    const level = eclForXp;
    const table = dataLoader.getConfigTable('config_xp_thresholds');
    if (!table?.data) {
      const fb: Record<number, number> = { 1:1000,2:3000,3:6000,4:10000,5:15000,6:21000,7:28000,8:36000,9:45000,10:55000 };
      return fb[level + 1] ?? 999999;
    }
    const rows = table.data as Array<Record<string,unknown>>;
    const row  = rows.find(r => r['level'] === level + 1);
    return typeof row?.['xpRequired'] === 'number' ? row['xpRequired'] : 999999;
  });
  const currentLevelXp = $derived.by(() => {
    const level = eclForXp;
    const table = dataLoader.getConfigTable('config_xp_thresholds');
    if (!table?.data) return 0;
    const rows = table.data as Array<Record<string,unknown>>;
    const row  = rows.find(r => r['level'] === level);
    return typeof row?.['xpRequired'] === 'number' ? row['xpRequired'] : 0;
  });
  const currentXp   = $derived(engine.character.xp ?? 0);
  const xpIntoLevel = $derived(currentXp - currentLevelXp);
  const xpNeeded    = $derived(nextLevelXp - currentLevelXp);
  const xpPercent   = $derived(xpNeeded > 0 ? Math.max(0, Math.min(100, (xpIntoLevel / xpNeeded) * 100)) : 0);
  const canLevelUp  = $derived(currentXp >= nextLevelXp);

  /** Can reduce LA? Requires 3 × current LA class levels (SRD reducing LA variant) */
  const canReduceLA = $derived(
    levelAdj > 0 &&
    engine.phase0_characterLevel >= levelAdj * 3
  );

  let xpToAdd = $state('');
  function addXp() {
    const n = parseInt(xpToAdd, 10);
    if (!isNaN(n)) { engine.character.xp = (engine.character.xp ?? 0) + n; xpToAdd = ''; }
  }
  function reduceLA() {
    if (!canReduceLA) return;
    if (!confirm(
      ui('ecl.reduce_la_confirm', engine.settings.language)
        .replace('{current}', String(levelAdj))
        .replace('{next}', String(levelAdj - 1))
    )) return;
    engine.character.levelAdjustment = (engine.character.levelAdjustment ?? 1) - 1;
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
      <span class="text-xs text-text-muted" title="CON modifier × character level">
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
          aria-label="Current HP"
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
          aria-label="Healing amount"
          onkeydown={(e) => e.key === 'Enter' && doHeal()}
        />
        <button
          class="flex-1 flex items-center justify-center gap-1 rounded-md text-sm font-medium
                 px-2 py-2 bg-green-800/60 text-green-300 hover:bg-green-700/60 transition-colors duration-150"
          onclick={doHeal}
          aria-label="Apply healing"
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
          aria-label="Damage amount"
          onkeydown={(e) => e.key === 'Enter' && doDamage()}
        />
        <button
          class="flex-1 flex items-center justify-center gap-1 rounded-md text-sm font-medium
                 px-2 py-2 bg-red-800/60 text-red-300 hover:bg-red-700/60 transition-colors duration-150"
          onclick={doDamage}
          aria-label="Apply damage"
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
          aria-label="Temporary HP amount"
          onkeydown={(e) => e.key === 'Enter' && addTempHp()}
        />
        <button
          class="flex-1 flex items-center justify-center gap-1 rounded-md text-sm font-medium
                 px-2 py-2 bg-emerald-800/60 text-emerald-300 hover:bg-emerald-700/60 transition-colors duration-150"
          onclick={addTempHp}
          aria-label="Add temporary HP"
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
            {pool.label?.en ?? pool.id}: {ui('heal.per_turn_badge', engine.settings.language).replace('{n}', String(pool.rechargeAmount ?? '?'))}
          </span>
        {/each}
        {#each perRoundPools as pool}
          <span class="badge-accent text-xs px-2 py-0.5 rounded-full opacity-70">
            {pool.label?.en ?? pool.id}: {ui('heal.per_round_badge', engine.settings.language).replace('{n}', String(pool.rechargeAmount ?? '?'))}
          </span>
        {/each}
        <button
          class="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-sky-800/50 text-sky-300 hover:bg-sky-700/60 transition-colors duration-150"
          onclick={onStartTurn}
          title={ui('heal.tick_tooltip', engine.settings.language)}
          type="button"
          aria-label={ui('heal.tick_button', engine.settings.language)}
        >
          ⏱ {ui('heal.tick_button', engine.settings.language)}
        </button>
      </div>
    </section>
  {/if}

  <!-- ── REST / ENCOUNTER BUTTONS ─────────────────────────────────────── -->
  <section class="flex gap-2 flex-wrap">
    <button
      class="flex-1 rounded-md px-2 py-1.5 text-xs font-medium border border-border text-text-secondary hover:border-accent hover:text-accent transition-colors duration-150"
      onclick={onNewEncounter}
      title="Reset encounter-slot abilities"
      type="button"
    >⚔ {ui('heal.encounter_reset', engine.settings.language)}</button>
    <button
      class="flex-1 rounded-md px-2 py-1.5 text-xs font-medium border border-border text-text-secondary hover:border-sky-500 hover:text-sky-400 transition-colors duration-150"
      onclick={onLongRest}
      title="Restore all long-rest resources"
      type="button"
    >🌙 {ui('heal.long_rest', engine.settings.language)}</button>
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
      style="--progress-pct: {xpPercent}%; --progress-color: oklch(72% 0.17 88);"
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
      {#if levelAdj > 0}<span class="text-amber-400/80 ml-1">(ECL {eclForXp})</span>{/if}
    </p>

    <!-- Award XP + Level Up -->
    <div class="flex items-center gap-2 flex-wrap">
      <input
        type="number"
        bind:value={xpToAdd}
        placeholder={ui('combat.xp.add_placeholder', engine.settings.language)}
        class="input flex-1 min-w-[8rem]"
        aria-label="XP to add"
        onkeydown={(e) => e.key === 'Enter' && addXp()}
      />
      <button class="btn-secondary" onclick={addXp} aria-label="Award XP" type="button">
        {ui('combat.xp.award', engine.settings.language)}
      </button>
      {#if canLevelUp}
        <button
          class="level-up-btn flex items-center gap-1 px-3 py-2 rounded-md text-sm font-bold text-white"
          aria-label="Level Up"
          type="button"
        >
          <IconXP size={16} aria-hidden="true" /> {ui('combat.xp.level_up', engine.settings.language)}
        </button>
      {/if}
    </div>

    {#if dataLoader.getConfigTable('config_xp_thresholds') === undefined}
      <p class="text-xs text-text-muted italic">
        {ui('combat.xp.config_hint', engine.settings.language)}
      </p>
    {/if}
  </section>

</div>

<style>
  /*
   * Level-Up pulsing button gradient.
   * Kept here because CSS keyframe animations and gradient backgrounds cannot
   * be expressed as Tailwind utility classes (spec §19.14 exemption for keyframes).
   */
  .level-up-btn {
    background: linear-gradient(135deg, var(--color-accent-600), oklch(72% 0.17 88));
    animation: pulse-glow 1.5s ease infinite;
  }

  @keyframes pulse-glow {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.75; }
  }
</style>
