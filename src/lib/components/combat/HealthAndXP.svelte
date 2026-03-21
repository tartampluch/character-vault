<!--
  @file src/lib/components/combat/HealthAndXP.svelte
  @description Health (HP) and Experience Points panel for the Combat tab.

  PURPOSE:
    Manages the character's health state and experience progression:

    HEALTH:
      - Visual HP bar showing Current / Temporary / Max HP.
      - "Heal" button: adds to currentValue (respects max cap).
      - "Damage" button: depletes temporaryValue first, then currentValue.
      - Status indicator: Healthy / Injured / Bloodied / Down / Dead.
      - CON modifier contribution display.

    EXPERIENCE:
      - XP progress bar showing current XP toward next level.
      - XP thresholds loaded from `config_xp_thresholds` (not hardcoded).
      - "Level Up" button (enabled when XP reaches the threshold).
      - Manual XP input for awarding experience.

  D&D 3.5 DAMAGE RULES:
    1. Damage depletes temporary HP first.
    2. If temporary HP is exhausted, regular HP is reduced.
    3. HP can go negative (unconscious at 0, dying at -1 to -9, dead at -10 or below CON score).
    4. All of this is handled by `engine.adjustHP()` which follows the SRD rules.

  XP TABLE:
    Loaded from `dataLoader.getConfigTable("config_xp_thresholds")`.
    Each row: `{ level: number, xpRequired: number }`.
    The component reads the threshold for `currentLevel + 1` to find the next level XP.

  @see src/lib/engine/GameEngine.svelte.ts for adjustHP(), setTemporaryHP().
  @see ANNEXES.md B.1 for the XP threshold table data.
  @see ARCHITECTURE.md Phase 10.1 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { IconHealth, IconXP, IconHeal, IconDamage } from '$lib/components/ui/icons';

  // ============================================================
  // HP STATE
  // ============================================================

  const hpPool = $derived(engine.character.resources['resources.hp']);
  const maxHp = $derived(engine.phase3_maxHp);
  const currentHp = $derived(hpPool?.currentValue ?? 0);
  const tempHp = $derived(hpPool?.temporaryValue ?? 0);

  /** Total effective HP including temporary (for bar width calculation). */
  const effectiveMaxHp = $derived(maxHp + tempHp);

  /** Current HP as percentage of max (capped 0-100). */
  const hpPercent = $derived(
    maxHp > 0 ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0
  );

  /** Temp HP width as percentage of effective max. */
  const tempPercent = $derived(
    effectiveMaxHp > 0 ? (tempHp / effectiveMaxHp) * 100 : 0
  );

  /** Health status label based on HP fraction. */
  const hpStatus = $derived.by(() => {
    if (!hpPool || maxHp <= 0) return { label: 'Unknown', color: '#6080a0' };
    if (currentHp <= -(engine.phase2_attributes['stat_con']?.totalValue ?? 10)) {
      return { label: 'Dead', color: '#4a0000' };
    }
    if (currentHp <= -1) return { label: 'Dying', color: '#7f0000' };
    if (currentHp === 0) return { label: 'Unconscious', color: '#7f1d1d' };
    const frac = currentHp / maxHp;
    if (frac <= 0.25) return { label: 'Bloodied', color: '#dc2626' };
    if (frac <= 0.5)  return { label: 'Injured', color: '#d97706' };
    return { label: 'Healthy', color: '#4ade80' };
  });

  /** CON modifier contribution to HP shown informatively. */
  const conMod = $derived(engine.phase2_attributes['stat_con']?.derivedModifier ?? 0);
  const conHpContrib = $derived(conMod * engine.phase0_characterLevel);

  // ============================================================
  // HEAL / DAMAGE UI
  // ============================================================

  let healAmount = $state('');
  let damageAmount = $state('');
  let tempHpAmount = $state('');

  function doHeal() {
    const amount = parseInt(healAmount, 10);
    if (isNaN(amount) || amount <= 0) return;
    engine.adjustHP(amount);
    healAmount = '';
  }

  function doDamage() {
    const amount = parseInt(damageAmount, 10);
    if (isNaN(amount) || amount <= 0) return;
    engine.adjustHP(-amount);
    damageAmount = '';
  }

  function addTempHp() {
    const amount = parseInt(tempHpAmount, 10);
    if (isNaN(amount) || amount <= 0) return;
    engine.setTemporaryHP(amount);
    tempHpAmount = '';
  }

  function setCurrentHpDirectly(event: Event) {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(val) && hpPool) {
      hpPool.currentValue = Math.min(val, maxHp);
    }
  }

  // ============================================================
  // XP STATE (local for session, not persisted in this phase)
  // ============================================================

  /** Player's current XP (stored locally for now). */
  let currentXp = $state(0);

  /**
   * XP required to reach the next level.
   * Read from config_xp_thresholds table (ANNEXES B.1).
   */
  const nextLevelXp = $derived.by(() => {
    const level = engine.phase0_characterLevel;
    const table = dataLoader.getConfigTable('config_xp_thresholds');
    if (!table?.data) {
      // Fallback for levels 1-5 without the config table loaded
      const fallback: Record<number, number> = {
        1: 1000, 2: 3000, 3: 6000, 4: 10000, 5: 15000,
        6: 21000, 7: 28000, 8: 36000, 9: 45000, 10: 55000,
      };
      return fallback[level + 1] ?? 999999;
    }
    const rows = table.data as Array<Record<string, unknown>>;
    const nextRow = rows.find(r => r['level'] === level + 1);
    return typeof nextRow?.['xpRequired'] === 'number' ? nextRow['xpRequired'] : 999999;
  });

  const currentLevelXp = $derived.by(() => {
    const level = engine.phase0_characterLevel;
    const table = dataLoader.getConfigTable('config_xp_thresholds');
    if (!table?.data) return 0;
    const rows = table.data as Array<Record<string, unknown>>;
    const currentRow = rows.find(r => r['level'] === level);
    return typeof currentRow?.['xpRequired'] === 'number' ? currentRow['xpRequired'] : 0;
  });

  const xpIntoLevel = $derived(currentXp - currentLevelXp);
  const xpNeeded = $derived(nextLevelXp - currentLevelXp);
  const xpPercent = $derived(
    xpNeeded > 0 ? Math.max(0, Math.min(100, (xpIntoLevel / xpNeeded) * 100)) : 0
  );

  const canLevelUp = $derived(currentXp >= nextLevelXp);

  let xpToAdd = $state('');

  function addXp() {
    const amount = parseInt(xpToAdd, 10);
    if (isNaN(amount)) return;
    currentXp += amount;
    xpToAdd = '';
  }
</script>

<div class="health-xp-panel">

  <!-- ========================================================= -->
  <!-- HEALTH SECTION -->
  <!-- ========================================================= -->
  <section class="section health-section">
     <h2 class="section-title"><IconHealth size={24} aria-hidden="true" /> Hit Points</h2>

    <!-- HP Status Badge -->
    <div class="hp-status-row">
      <span class="hp-status-badge" style="color: {hpStatus.color}; border-color: {hpStatus.color};">
        ● {hpStatus.label}
      </span>
      <span class="con-contrib" title="CON modifier × character level">
        CON contribution: {conHpContrib >= 0 ? '+' : ''}{conHpContrib}
      </span>
    </div>

    <!-- HP Numbers -->
    <div class="hp-numbers">
      <div class="hp-group">
        <span class="hp-label">Current</span>
        <input
          type="number"
          class="hp-input"
          value={currentHp}
          onchange={setCurrentHpDirectly}
          aria-label="Current HP"
        />
      </div>
      <span class="hp-slash">/</span>
      <div class="hp-group">
        <span class="hp-label">Max</span>
        <span class="hp-max">{maxHp}</span>
      </div>
      {#if tempHp > 0}
        <div class="hp-group temp-group">
          <span class="hp-label">+Temp</span>
          <span class="hp-temp">+{tempHp}</span>
        </div>
      {/if}
    </div>

    <!-- HP Visual Bar -->
    <div
      class="hp-bar-container"
      role="progressbar"
      aria-valuenow={currentHp}
      aria-valuemin={-100}
      aria-valuemax={maxHp}
      aria-label="HP: {currentHp} / {maxHp}"
    >
      <!-- Temp HP portion -->
      {#if tempHp > 0}
        <div class="hp-bar temp-bar" style="width: {tempPercent}%; right: 0;"></div>
      {/if}
      <!-- Regular HP portion -->
      <div
        class="hp-bar current-bar"
        style="width: {hpPercent}%; background: {hpStatus.color};"
      ></div>
    </div>

    <!-- Heal / Damage Controls -->
    <div class="hp-controls">
      <div class="control-group">
        <input
          type="number"
          bind:value={healAmount}
          placeholder="0"
          min="1"
          class="amount-input heal-input"
          aria-label="Healing amount"
          onkeydown={(e) => e.key === 'Enter' && doHeal()}
        />
        <button class="btn-heal" onclick={doHeal} aria-label="Apply healing">
          + Heal
        </button>
      </div>
      <div class="control-group">
        <input
          type="number"
          bind:value={damageAmount}
          placeholder="0"
          min="1"
          class="amount-input damage-input"
          aria-label="Damage amount"
          onkeydown={(e) => e.key === 'Enter' && doDamage()}
        />
        <button class="btn-damage" onclick={doDamage} aria-label="Apply damage">
          − Damage
        </button>
      </div>
      <div class="control-group">
        <input
          type="number"
          bind:value={tempHpAmount}
          placeholder="0"
          min="1"
          class="amount-input temp-input"
          aria-label="Temporary HP amount"
          onkeydown={(e) => e.key === 'Enter' && addTempHp()}
        />
        <button class="btn-temp" onclick={addTempHp} aria-label="Add temporary HP">
          + Temp HP
        </button>
      </div>
    </div>
  </section>

  <!-- ========================================================= -->
  <!-- EXPERIENCE SECTION -->
  <!-- ========================================================= -->
  <section class="section xp-section">
    <h2 class="section-title">⭐ Experience</h2>

    <div class="xp-numbers">
      <div class="xp-level">
        <span class="xp-level-label">Level</span>
        <span class="xp-level-value">{engine.phase0_characterLevel}</span>
      </div>
      <div class="xp-progress-numbers">
        <span class="xp-current">{currentXp.toLocaleString()}</span>
        <span class="xp-sep">XP /</span>
        <span class="xp-next">{nextLevelXp.toLocaleString()} XP</span>
      </div>
    </div>

    <!-- XP Progress Bar -->
    <div
      class="xp-bar-container"
      role="progressbar"
      aria-valuenow={xpIntoLevel}
      aria-valuemin={0}
      aria-valuemax={xpNeeded}
      aria-label="XP progress: {xpPercent.toFixed(0)}% to next level"
    >
      <div class="xp-bar" style="width: {xpPercent}%;"></div>
    </div>

    <p class="xp-label-line">
      {xpIntoLevel.toLocaleString()} / {xpNeeded.toLocaleString()} XP to next level
      ({xpPercent.toFixed(0)}%)
    </p>

    <!-- XP Add and Level Up Controls -->
    <div class="xp-controls">
      <input
        type="number"
        bind:value={xpToAdd}
        placeholder="Add XP..."
        class="amount-input xp-input"
        aria-label="XP to add"
        onkeydown={(e) => e.key === 'Enter' && addXp()}
      />
      <button class="btn-add-xp" onclick={addXp} aria-label="Award XP">
        + Award XP
      </button>
      {#if canLevelUp}
        <button class="btn-level-up" aria-label="Level Up (stub — full UI in future phase)">
          <IconXP size={16} aria-hidden="true" /> Level Up!
        </button>
      {/if}
    </div>

    {#if dataLoader.getConfigTable('config_xp_thresholds') === undefined}
      <p class="config-hint">
        Load <code>config_xp_thresholds</code> for accurate XP thresholds.
      </p>
    {/if}
  </section>

</div>

<style>
  .health-xp-panel {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1.25rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  /* ========================= SECTIONS ========================= */
  .section { display: flex; flex-direction: column; gap: 0.6rem; }

  .section-title {
    margin: 0;
    font-size: 0.95rem;
    color: #c4b5fd;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.4rem;
  }

  /* ========================= HP STATUS ROW ========================= */
  .hp-status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .hp-status-badge {
    font-size: 0.82rem;
    font-weight: 600;
    border: 1px solid;
    border-radius: 4px;
    padding: 0.15rem 0.6rem;
  }

  .con-contrib { font-size: 0.75rem; color: #6080a0; }

  /* ========================= HP NUMBERS ========================= */
  .hp-numbers {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .hp-group { display: flex; flex-direction: column; align-items: center; gap: 0; }
  .hp-label { font-size: 0.65rem; color: #4a4a6a; text-transform: uppercase; }
  .hp-input {
    width: 4rem;
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 4px;
    color: #f87171;
    font-size: 1.2rem;
    font-weight: bold;
    text-align: center;
    padding: 0.1rem 0.2rem;
  }
  .hp-input:focus { outline: none; border-color: #f87171; }
  .hp-max { font-size: 1.2rem; font-weight: bold; color: #7dd3fc; }
  .hp-slash { font-size: 1.2rem; color: #4a4a6a; align-self: center; }
  .temp-group .hp-temp { font-size: 1rem; font-weight: bold; color: #4ade80; }

  /* ========================= HP BAR ========================= */
  .hp-bar-container {
    position: relative;
    height: 10px;
    background: #21262d;
    border-radius: 5px;
    overflow: hidden;
  }

  .hp-bar { position: absolute; height: 100%; transition: width 0.3s ease; border-radius: 5px; }
  .current-bar { left: 0; }
  .temp-bar { background: #4ade80; opacity: 0.5; }

  /* ========================= HP CONTROLS ========================= */
  .hp-controls {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .control-group {
    display: flex;
    gap: 0.3rem;
    align-items: center;
    flex: 1;
    min-width: 120px;
  }

  .amount-input {
    width: 4rem;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #e0e0f0;
    padding: 0.25rem 0.3rem;
    font-size: 0.85rem;
    text-align: center;
  }

  .amount-input:focus { outline: none; border-color: #7c3aed; }

  .btn-heal, .btn-damage, .btn-temp {
    flex: 1;
    border: none;
    border-radius: 4px;
    padding: 0.3rem 0.5rem;
    font-size: 0.8rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-heal   { background: #166534; color: #4ade80; }
  .btn-heal:hover { background: #14532d; }
  .btn-damage { background: #7f1d1d; color: #f87171; }
  .btn-damage:hover { background: #6d1717; }
  .btn-temp   { background: #1c4a2a; color: #86efac; }
  .btn-temp:hover { background: #15402a; }

  /* ========================= XP SECTION ========================= */
  .xp-numbers {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .xp-level {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 8px;
    padding: 0.4rem 0.75rem;
  }

  .xp-level-label { font-size: 0.65rem; color: #4a4a6a; text-transform: uppercase; }
  .xp-level-value { font-size: 1.5rem; font-weight: bold; color: #fbbf24; }

  .xp-progress-numbers {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.85rem;
  }

  .xp-current { color: #fbbf24; font-weight: bold; }
  .xp-sep { color: #4a4a6a; }
  .xp-next { color: #6080a0; }

  .xp-bar-container {
    height: 8px;
    background: #21262d;
    border-radius: 4px;
    overflow: hidden;
  }

  .xp-bar {
    height: 100%;
    background: linear-gradient(90deg, #fbbf24, #f59e0b);
    border-radius: 4px;
    transition: width 0.4s ease;
  }

  .xp-label-line { font-size: 0.75rem; color: #6080a0; margin: 0; }

  .xp-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .xp-input { width: 7rem; }

  .btn-add-xp {
    background: #1c1a3a;
    color: #c4b5fd;
    border: 1px solid #4c35a0;
    border-radius: 4px;
    padding: 0.3rem 0.75rem;
    font-size: 0.82rem;
    cursor: pointer;
  }
  .btn-add-xp:hover { background: #2d1b69; }

  .btn-level-up {
    background: linear-gradient(135deg, #7c3aed, #d97706);
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.35rem 1rem;
    font-size: 0.9rem;
    cursor: pointer;
    font-weight: bold;
    animation: pulse 1.5s ease infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.75; }
  }

  .config-hint { font-size: 0.75rem; color: #4a4a6a; font-style: italic; margin: 0; }
</style>
