<!--
  @file src/lib/components/combat/Resistances.svelte
  @description Energy Resistances and Special Resistances panel.

  PURPOSE:
    Displays Fire/Cold/Acid/Electricity/Sonic resistance, SR, PR, Fortification.
    Each resistance reads from a combatStats pipeline with a matching targetId.
    The player can add a misc modifier via a direct input.

  @see ARCHITECTURE.md Phase 10.6 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { formatModifier } from '$lib/utils/formatters';
  import { Flame, Snowflake, FlaskConical, Zap, Volume2, Sparkles, BrainCircuit, ShieldAlert } from 'lucide-svelte';
  import { IconSaves } from '$lib/components/ui/icons';

  /**
   * Data-driven list of resistance pipelines.
   * Icons are Lucide component references (not emoji strings).
   * If the pipeline has no value (0 or absent), it is shown as "—" (no resistance).
   */
  const RESISTANCES = [
    { id: 'combatStats.resist_fire',        icon: Flame,         label: 'Fire' },
    { id: 'combatStats.resist_cold',        icon: Snowflake,     label: 'Cold' },
    { id: 'combatStats.resist_acid',        icon: FlaskConical,  label: 'Acid' },
    { id: 'combatStats.resist_electricity', icon: Zap,           label: 'Electricity' },
    { id: 'combatStats.resist_sonic',       icon: Volume2,       label: 'Sonic' },
    { id: 'combatStats.spell_resistance',   icon: Sparkles,      label: 'SR' },
    { id: 'combatStats.power_resistance',   icon: BrainCircuit,  label: 'PR' },
    { id: 'combatStats.fortification',      icon: ShieldAlert,   label: 'Fort.' },
  ];

  /** Misc modifiers entered by the player (stored locally). */
  let miscMods = $state<Record<string, string>>({});

  function getMisc(id: string): number {
    const v = parseInt(miscMods[id] ?? '0', 10);
    return isNaN(v) ? 0 : v;
  }
</script>

<div class="resistances-panel">
   <h2 class="panel-title"><IconSaves size={24} aria-hidden="true" /> Resistances</h2>

  <div class="resist-grid">
    {#each RESISTANCES as res}
      {@const pipeline = engine.phase3_combatStats[res.id]}
      {@const baseVal = pipeline?.totalValue ?? 0}
      {@const misc = getMisc(res.id)}
      {@const total = baseVal + misc}

      <div class="resist-row">
        <span class="resist-icon" aria-hidden="true"><res.icon size={16} /></span>
        <span class="resist-label">{res.label}</span>
        <span class="resist-value" class:has-value={total > 0}>
          {total > 0 ? total : '—'}
        </span>
        <input
          type="number"
          class="misc-input"
          value={miscMods[res.id] ?? '0'}
          aria-label="{res.label} misc modifier"
          title="Misc modifier"
          oninput={(e) => (miscMods[res.id] = (e.target as HTMLInputElement).value)}
        />
      </div>
    {/each}
  </div>
</div>

<style>
  .resistances-panel {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1.25rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
  }

  .panel-title { margin: 0 0 1rem; font-size: 1rem; color: #c4b5fd; border-bottom: 1px solid #21262d; padding-bottom: 0.5rem; }

  .resist-grid { display: flex; flex-direction: column; gap: 0.3rem; }

  .resist-row {
    display: grid;
    grid-template-columns: 1.5rem 5rem 3rem 3rem;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
  }

  .resist-row:hover { background: #0d1117; }

  .resist-icon { font-size: 0.85rem; }
  .resist-label { font-size: 0.82rem; color: #c0c0d0; }
  .resist-value { font-size: 0.92rem; font-weight: bold; color: #4a4a6a; text-align: right; }
  .resist-value.has-value { color: #86efac; }

  .misc-input {
    width: 100%;
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 3px;
    color: #fbbf24;
    padding: 0.1rem 0.2rem;
    font-size: 0.78rem;
    text-align: center;
  }
</style>
