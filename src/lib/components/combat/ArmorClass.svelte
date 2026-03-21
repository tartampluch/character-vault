<!--
  @file src/lib/components/combat/ArmorClass.svelte
  @description Armor Class panel (Normal, Touch, Flat-Footed) for the Combat tab.

  PURPOSE:
    Displays the three distinct AC pipelines:
      - Normal AC   : all modifiers apply (armor, shield, DEX, dodge, etc.)
      - Touch AC    : only DEX, dodge, deflection — ignores armor/shield/natural armor
      - Flat-Footed : ignores DEX and dodge bonuses (caught off-guard)

    Each AC type has:
      - The computed total (read-only, from phase3_combatStats)
      - An ℹ button → ModifierBreakdownModal showing exactly why Touch AC
        ignores armor/shield (provable via the modifier list)

    Includes a shared "Temporary Modifier" input that applies a quick untyped
    adjustment to all three AC pipelines simultaneously (for buff/curse spells).

  D&D 3.5 AC FORMULA:
    Normal AC     = 10 + Armor + Shield + DEX + Size + Deflection + Dodge + Natural + Misc
    Touch AC      = 10 + DEX + Size + Deflection + Dodge + Misc (NO Armor/Shield/Natural)
    Flat-Footed   = 10 + Armor + Shield + Size + Deflection + Natural + Misc (NO DEX/Dodge)

    IMPORTANT: The engine already handles this via the modifier `targetId` fields.
    Features grant modifiers specifically to `combatStats.ac_normal`, `combatStats.ac_touch`,
    or `combatStats.ac_flat_footed`. The breakdown modal proves which modifiers go where.

  @see src/lib/components/ui/ModifierBreakdownModal.svelte for the breakdown.
  @see ARCHITECTURE.md Phase 10.2 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { formatModifier } from '$lib/utils/formatters';
  import ModifierBreakdownModal from '$lib/components/ui/ModifierBreakdownModal.svelte';
  import type { ID } from '$lib/types/primitives';
  import { IconAC, IconInfo } from '$lib/components/ui/icons';

  /**
   * The three AC pipeline configurations.
   * All data-driven — the IDs come from the engine's combatStats.
   */
  const AC_PIPELINES = [
    {
      id: 'combatStats.ac_normal',
      shortName: 'AC',
      description: 'Normal Armor Class',
      accentColor: '#7dd3fc',
    },
    {
      id: 'combatStats.ac_touch',
      shortName: 'Touch',
      description: 'Touch AC (ignores armor/shield/natural armor)',
      accentColor: '#86efac',
    },
    {
      id: 'combatStats.ac_flat_footed',
      shortName: 'Flat',
      description: 'Flat-Footed AC (ignores DEX/dodge bonuses)',
      accentColor: '#fbbf24',
    },
  ] as const;

  // ============================================================
  // MODAL STATE
  // ============================================================
  let breakdownAcId = $state<ID | null>(null);

  // ============================================================
  // TEMPORARY MODIFIER (applied to all three AC types)
  // ============================================================
  let tempMod = $state('0');

  const tempModValue = $derived.by(() => {
    const v = parseInt(tempMod, 10);
    return isNaN(v) ? 0 : v;
  });
</script>

<div class="armor-class-panel">
  <div class="panel-header">
     <h2 class="panel-title"><IconAC size={24} aria-hidden="true" /> Armor Class</h2>
    <!-- Temporary modifier applies to all AC types -->
    <div class="temp-row">
      <label for="ac-temp-input" class="temp-label">Temp Mod</label>
      <input
        id="ac-temp-input"
        type="number"
        bind:value={tempMod}
        class="temp-input"
        aria-label="Temporary AC modifier (applied to all AC types)"
        title="Quick temporary modifier (buff spell, condition, etc.)"
      />
    </div>
  </div>

  <!-- ========================================================= -->
  <!-- THREE AC CARDS -->
  <!-- ========================================================= -->
  <div class="ac-grid">
    {#each AC_PIPELINES as acConfig}
      {@const pipeline = engine.phase3_combatStats[acConfig.id]}

      {#if pipeline}
        {@const effectiveAc = pipeline.totalValue + tempModValue}

        <div
          class="ac-card"
          style="--accent: {acConfig.accentColor};"
          aria-label="{acConfig.description}: {effectiveAc}"
        >
          <!-- Short label -->
          <h3 class="ac-label">{acConfig.shortName}</h3>

          <!-- Total value (large) -->
          <span class="ac-value" style="color: {acConfig.accentColor};">
            {effectiveAc}
          </span>

          {#if tempModValue !== 0}
            <span class="temp-indicator">
              ({formatModifier(tempModValue)} temp)
            </span>
          {/if}

          <!-- Info button → breakdown -->
          <button
            class="info-btn"
            onclick={() => (breakdownAcId = acConfig.id)}
            aria-label="Show {acConfig.description} breakdown"
            title="Show breakdown — proves why {acConfig.shortName} ignores certain modifier types"
          >ℹ</button>

          <!-- Brief description -->
          <span class="ac-desc">{acConfig.description}</span>
        </div>
      {/if}
    {/each}
  </div>
</div>

<!-- ============================================================ -->
<!-- BREAKDOWN MODAL -->
<!-- ============================================================ -->
{#if breakdownAcId}
  {@const bp = engine.phase3_combatStats[breakdownAcId]}
  {@const acConfig = AC_PIPELINES.find(a => a.id === breakdownAcId)}
  {#if bp && acConfig}
    <ModifierBreakdownModal
      label="{acConfig.description}"
      baseValue={bp.baseValue}
      activeModifiers={bp.activeModifiers}
      situationalModifiers={bp.situationalModifiers}
      totalValue={bp.totalValue}
      onclose={() => (breakdownAcId = null)}
    />
  {/if}
{/if}

<style>
  .armor-class-panel {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1.25rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
  }

  /* ========================= HEADER ========================= */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
    gap: 0.75rem;
    flex-wrap: wrap;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.5rem;
  }

  .panel-title { margin: 0; font-size: 1rem; color: #c4b5fd; }

  .temp-row { display: flex; align-items: center; gap: 0.4rem; }
  .temp-label { font-size: 0.75rem; color: #6080a0; }
  .temp-input {
    width: 3.5rem;
    background: #0d1117;
    border: 1px solid #2d2d5e;
    border-radius: 4px;
    color: #fbbf24;
    padding: 0.2rem 0.3rem;
    font-size: 0.85rem;
    text-align: center;
  }
  .temp-input:focus { outline: none; border-color: #fbbf24; }

  /* ========================= AC GRID ========================= */
  .ac-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }

  /* ========================= AC CARD ========================= */
  .ac-card {
    background: #0d1117;
    border: 1px solid #21262d;
    border-top: 3px solid var(--accent, #7c3aed);
    border-radius: 8px;
    padding: 0.75rem 0.6rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    text-align: center;
    transition: border-color 0.15s;
  }

  .ac-card:hover { border-color: var(--accent, #4c35a0); }

  .ac-label {
    margin: 0;
    font-size: 0.75rem;
    color: var(--accent, #c4b5fd);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .ac-value {
    font-size: 2.2rem;
    font-weight: bold;
    line-height: 1;
  }

  .temp-indicator {
    font-size: 0.7rem;
    color: #fbbf24;
    margin-top: -0.2rem;
  }

  .info-btn {
    background: transparent;
    border: 1px solid #30363d;
    color: #7c3aed;
    border-radius: 50%;
    width: 1.4rem;
    height: 1.4rem;
    font-size: 0.7rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }
  .info-btn:hover { background: #1c1a3a; border-color: #7c3aed; }

  .ac-desc {
    font-size: 0.65rem;
    color: #4a4a6a;
    line-height: 1.3;
  }
</style>
