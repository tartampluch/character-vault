<!--
  @file src/lib/components/combat/MovementSpeeds.svelte
  @description Movement Speeds panel for the Combat tab.

  PURPOSE:
    Displays all movement speed pipelines with localised formatted values.
    Shows armor and encumbrance penalty contributions to make speed reductions visible.

  @see ARCHITECTURE.md Phase 10.5 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { Footprints, Pickaxe, Mountain, Wind, Waves } from 'lucide-svelte';

  const SPEED_PIPELINES = [
    { id: 'combatStats.speed_land',    icon: Footprints },
    { id: 'combatStats.speed_burrow',  icon: Pickaxe    },
    { id: 'combatStats.speed_climb',   icon: Mountain   },
    { id: 'combatStats.speed_fly',     icon: Wind       },
    { id: 'combatStats.speed_swim',    icon: Waves      },
  ];
</script>

<div class="movement-panel">
   <h2 class="panel-title"><Footprints size={24} aria-hidden="true" /> Movement Speeds</h2>
  <div class="speeds-grid">
    {#each SPEED_PIPELINES as sp}
      {@const pipeline = engine.phase3_combatStats[sp.id]}
      {#if pipeline && pipeline.totalValue > 0}
        <div class="speed-card">
          <span class="speed-icon" aria-hidden="true"><sp.icon size={16} /></span>
          <span class="speed-label">{engine.t(pipeline.label)}</span>
          <span class="speed-value">{engine.formatDistance(pipeline.totalValue)}</span>
          {#if pipeline.totalBonus < 0}
            <span class="speed-penalty" title="Penalty from armor or encumbrance">
              ({engine.formatDistance(pipeline.totalBonus)} penalty)
            </span>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
  <p class="speed-note">
    Armor & encumbrance penalties are applied via the engine's pipeline modifiers.
  </p>
</div>

<style>
  .movement-panel {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1.25rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
  }

  .panel-title { margin: 0 0 1rem; font-size: 1rem; color: #c4b5fd; border-bottom: 1px solid #21262d; padding-bottom: 0.5rem; }

  .speeds-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .speed-card {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 8px;
    padding: 0.6rem 0.9rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    min-width: 100px;
  }

  .speed-icon { font-size: 1.4rem; }
  .speed-label { font-size: 0.72rem; color: #6080a0; text-transform: uppercase; letter-spacing: 0.05em; }
  .speed-value { font-size: 1.1rem; font-weight: bold; color: #86efac; }
  .speed-penalty { font-size: 0.72rem; color: #f87171; }

  .speed-note {
    font-size: 0.75rem;
    color: #4a4a6a;
    font-style: italic;
    margin: 0.5rem 0 0;
  }
</style>
