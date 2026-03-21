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

  const hpPool        = $derived(engine.character.resources['resources.hp']);
  const maxHp         = $derived(engine.phase3_maxHp);
  const currentHp     = $derived(hpPool?.currentValue ?? 0);
  const tempHp        = $derived(hpPool?.temporaryValue ?? 0);
  const effectiveMaxHp = $derived(maxHp + tempHp);
  const hpPercent     = $derived(maxHp > 0 ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0);
  const tempPercent   = $derived(effectiveMaxHp > 0 ? (tempHp / effectiveMaxHp) * 100 : 0);

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

  /* XP */
  let currentXp = $state(0);
  const nextLevelXp = $derived.by(() => {
    const level = engine.phase0_characterLevel;
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
    const level = engine.phase0_characterLevel;
    const table = dataLoader.getConfigTable('config_xp_thresholds');
    if (!table?.data) return 0;
    const rows = table.data as Array<Record<string,unknown>>;
    const row  = rows.find(r => r['level'] === level);
    return typeof row?.['xpRequired'] === 'number' ? row['xpRequired'] : 0;
  });
  const xpIntoLevel = $derived(currentXp - currentLevelXp);
  const xpNeeded    = $derived(nextLevelXp - currentLevelXp);
  const xpPercent   = $derived(xpNeeded > 0 ? Math.max(0, Math.min(100, (xpIntoLevel / xpNeeded) * 100)) : 0);
  const canLevelUp  = $derived(currentXp >= nextLevelXp);
  let xpToAdd = $state('');
  function addXp() {
    const n = parseInt(xpToAdd, 10);
    if (!isNaN(n)) { currentXp += n; xpToAdd = ''; }
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

  <!-- ── EXPERIENCE ──────────────────────────────────────────────────────── -->
  <section class="flex flex-col gap-2">
    <div class="section-header border-b border-border pb-2">
      <IconXP size={20} aria-hidden="true" />
      <span>{ui('combat.xp.title', engine.settings.language)}</span>
    </div>

    <!-- Level + XP numbers -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div class="flex flex-col items-center px-3 py-1.5 rounded-lg border border-border bg-surface-alt min-w-[3.5rem]">
        <span class="text-[10px] uppercase tracking-wider text-text-muted">{ui('combat.xp.level', engine.settings.language)}</span>
        <span class="text-2xl font-bold text-yellow-500 dark:text-yellow-400 leading-none">
          {engine.phase0_characterLevel}
        </span>
      </div>
      <div class="flex items-center gap-1.5 text-sm flex-wrap">
        <span class="font-bold text-yellow-500 dark:text-yellow-400">{currentXp.toLocaleString()}</span>
        <span class="text-text-muted">{ui('combat.xp.xp_separator', engine.settings.language)}</span>
        <span class="text-text-secondary">{nextLevelXp.toLocaleString()} {ui('combat.xp.xp', engine.settings.language)}</span>
      </div>
    </div>

    <!-- XP progress bar -->
    <div
      class="progress-bar"
      style="--progress-pct: {xpPercent}%; --progress-color: oklch(72% 0.17 88);"
      role="progressbar"
      aria-valuenow={xpIntoLevel}
      aria-valuemin={0}
      aria-valuemax={xpNeeded}
      aria-label="XP: {xpPercent.toFixed(0)}% to next level"
    >
      <div class="progress-bar__fill"></div>
    </div>
    <p class="text-xs text-text-muted">
      {xpIntoLevel.toLocaleString()} / {xpNeeded.toLocaleString()} {ui('combat.xp.to_next', engine.settings.language)} ({xpPercent.toFixed(0)}%)
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
