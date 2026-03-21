<!--
  @file src/lib/components/abilities/SavingThrows.svelte
  @description Full interactive Saving Throws panel for the Abilities tab.

  PURPOSE:
    Displays and allows editing of Fortitude, Reflex, and Will saving throws.
    For each save:
      - Final Modifier (total computed value, read-only) ← from phase3_combatStats
      - Governing Ability Modifier block (CON for Fort, DEX for Ref, WIS for Will)
        color-coded with the modifier value
      - Miscellanous bonus display (from Features granted modifiers)
      - Temporary Modifier (editable, quick in-session adjustment)
      - ℹ button → ModifierBreakdownModal
      - 🎲 button → DiceRollModal (1d20 + save total)

  ARCHITECTURE:
    - Reads: `engine.phase3_combatStats` (saves.fort, saves.ref, saves.will)
    - Reads: `engine.phase2_attributes` (ability derivedModifiers for indicators)
    - No game logic — pure display + modal dispatch.

  @see src/lib/components/ui/ModifierBreakdownModal.svelte
  @see src/lib/components/ui/DiceRollModal.svelte
  @see ARCHITECTURE.md Phase 9.5 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { formatModifier } from '$lib/utils/formatters';
  import ModifierBreakdownModal from '$lib/components/ui/ModifierBreakdownModal.svelte';
  import DiceRollModal from '$lib/components/ui/DiceRollModal.svelte';
  import type { ID } from '$lib/types/primitives';
  import { IconSaves, IconInfo, IconDiceRoll } from '$lib/components/ui/icons';

  /**
   * Saving throw configuration read from engine.savingThrowConfig.
   * The D&D 3.5 save→ability mapping (CON → Fort, DEX → Ref, WIS → Will)
   * is centralised in the GameEngine, not hardcoded here.
   */
  const SAVES = engine.savingThrowConfig;

  // ============================================================
  // MODAL STATE
  // ============================================================

  let breakdownSaveId = $state<ID | null>(null);
  let diceRollSaveId = $state<ID | null>(null);

  // ============================================================
  // TEMPORARY MODIFIERS (local state)
  // ============================================================
  let tempMods = $state<Record<string, string>>({});

  function getTempMod(id: string): number {
    const v = parseInt(tempMods[id] ?? '0', 10);
    return isNaN(v) ? 0 : v;
  }
</script>

<div class="saving-throws-panel">
   <h2 class="panel-title"><IconSaves size={24} aria-hidden="true" /> Saving Throws</h2>

  <div class="saves-grid">
    {#each SAVES as save}
      {@const pipeline = engine.phase3_combatStats[save.pipelineId]}
      {@const abilityMod = engine.phase2_attributes[save.keyAbilityId]?.derivedModifier ?? 0}

      {#if pipeline}
        {@const tempMod = getTempMod(save.pipelineId)}
        {@const effectiveTotal = pipeline.totalValue + tempMod}

        <div class="save-card" style="--accent: {save.accentColor};">

          <!-- Save name -->
          <h3 class="save-name">{engine.t(pipeline.label)}</h3>

          <!-- Total modifier (large, prominently displayed) -->
          <div class="save-total-block" aria-label="{engine.t(pipeline.label)}: {formatModifier(effectiveTotal)}">
            <span class="save-total" style="color: {save.accentColor};">
              {formatModifier(effectiveTotal)}
            </span>
          </div>

          <!-- Component breakdown row -->
          <div class="save-components">
            <!-- Governing ability modifier -->
            <div class="component-block ability-block">
              <span class="component-label">{save.keyAbilityAbbr}</span>
              <span
                class="component-value"
                class:positive={abilityMod > 0}
                class:negative={abilityMod < 0}
                title="{engine.t(engine.phase2_attributes[save.keyAbilityId]?.label ?? {})} modifier"
              >
                {formatModifier(abilityMod)}
              </span>
            </div>

            <!-- Base save (from class levels) -->
            <div class="component-block">
              <span class="component-label">Base</span>
              <span class="component-value">
                {formatModifier(pipeline.totalBonus - abilityMod)}
              </span>
            </div>

            <!-- Misc modifiers count -->
            {#if pipeline.activeModifiers.length > 0}
              <div class="component-block">
                <span class="component-label">Mods</span>
                <span class="component-value misc">
                  {pipeline.activeModifiers.length} active
                </span>
              </div>
            {/if}
          </div>

          <!-- Temporary modifier input -->
          <div class="temp-row">
            <label for="temp-{save.pipelineId}" class="temp-label">Temp</label>
            <input
              id="temp-{save.pipelineId}"
              type="number"
              value={tempMods[save.pipelineId] ?? '0'}
              class="temp-input"
              oninput={(e) => {
                tempMods[save.pipelineId] = (e.target as HTMLInputElement).value;
              }}
              aria-label="{engine.t(pipeline.label)} temporary modifier"
            />
          </div>

          <!-- Action buttons -->
          <div class="save-actions">
            <button
              class="action-btn info-btn"
              onclick={() => (breakdownSaveId = save.pipelineId)}
              aria-label="Show {engine.t(pipeline.label)} breakdown"
              title="Show breakdown"
            ><IconInfo size={16} aria-hidden="true" /></button>
            <button
              class="action-btn dice-btn"
              onclick={() => (diceRollSaveId = save.pipelineId)}
              aria-label="Roll {engine.t(pipeline.label)} save"
              title="Roll saving throw"
            ><IconDiceRoll size={16} aria-hidden="true" /></button>
          </div>
        </div>
      {/if}
    {/each}
  </div>
</div>

<!-- ============================================================ -->
<!-- BREAKDOWN MODAL -->
<!-- ============================================================ -->
{#if breakdownSaveId}
  {@const bp = engine.phase3_combatStats[breakdownSaveId]}
  {#if bp}
    <ModifierBreakdownModal
      label={engine.t(bp.label)}
      baseValue={bp.baseValue}
      activeModifiers={bp.activeModifiers}
      situationalModifiers={bp.situationalModifiers}
      totalValue={bp.totalValue}
      onclose={() => (breakdownSaveId = null)}
    />
  {/if}
{/if}

<!-- ============================================================ -->
<!-- DICE ROLL MODAL -->
<!-- ============================================================ -->
{#if diceRollSaveId}
  {@const dp = engine.phase3_combatStats[diceRollSaveId]}
  {#if dp}
    <DiceRollModal
      formula="1d20"
      pipeline={dp}
      label="{engine.t(dp.label)} Save"
      onclose={() => (diceRollSaveId = null)}
    />
  {/if}
{/if}

<style>
  .saving-throws-panel {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1.25rem;
  }

  .panel-title {
    margin: 0 0 1rem;
    font-size: 1rem;
    color: #c4b5fd;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.5rem;
  }

  /* ========================= SAVES GRID ========================= */
  .saves-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 1rem;
  }

  /* ========================= SAVE CARD ========================= */
  .save-card {
    background: #0d1117;
    border: 1px solid #21262d;
    border-top: 3px solid var(--accent, #7c3aed);
    border-radius: 8px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transition: border-color 0.15s;
  }

  .save-card:hover { border-color: var(--accent, #7c3aed); }

  .save-name {
    margin: 0;
    font-size: 0.85rem;
    color: var(--accent, #c4b5fd);
    font-weight: 600;
  }

  /* ========================= TOTAL ========================= */
  .save-total-block {
    text-align: center;
  }

  .save-total {
    font-size: 2rem;
    font-weight: bold;
    line-height: 1;
  }

  /* ========================= COMPONENTS ========================= */
  .save-components {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .component-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 4px;
    padding: 0.2rem 0.4rem;
    min-width: 2.5rem;
  }

  .ability-block {
    border-color: var(--accent, #4c35a0);
    background: #0d1117;
  }

  .component-label {
    font-size: 0.65rem;
    color: #4a4a6a;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .component-value {
    font-size: 0.82rem;
    font-weight: 600;
    color: #8080a0;
  }

  .component-value.positive { color: #86efac; }
  .component-value.negative { color: #f87171; }
  .component-value.misc { font-size: 0.7rem; color: #6080a0; }

  /* ========================= TEMP ========================= */
  .temp-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .temp-label {
    font-size: 0.72rem;
    color: #6080a0;
    flex-shrink: 0;
  }

  .temp-input {
    flex: 1;
    background: #0d1117;
    border: 1px solid #2d2d5e;
    border-radius: 4px;
    color: #fbbf24;
    padding: 0.2rem 0.3rem;
    font-size: 0.85rem;
    text-align: center;
    min-width: 0;
  }

  .temp-input:focus { outline: none; border-color: #fbbf24; }

  /* ========================= ACTIONS ========================= */
  .save-actions {
    display: flex;
    gap: 0.3rem;
    justify-content: flex-end;
  }

  .action-btn {
    background: transparent;
    border: 1px solid #30363d;
    border-radius: 4px;
    width: 1.8rem;
    height: 1.8rem;
    font-size: 0.8rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s;
  }

  .info-btn { color: #7c3aed; }
  .info-btn:hover { background: #1c1a3a; border-color: #7c3aed; }
  .dice-btn { color: #fbbf24; }
  .dice-btn:hover { background: #1a1a00; border-color: #fbbf24; }
</style>
