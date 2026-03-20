<!--
  @file src/lib/components/magic/CastingPanel.svelte
  @description Spell preparation and casting panel for active spellcasters.

  PURPOSE:
    Groups known spells by level (0-9). For each spell:
      - Prepare counter (Vancian: Wizard/Cleric) or Cast button (Sorcerer/Psion).
      - Clicking a spell name opens a spell detail modal.
      - Spell Save DC: 10 + spell level + key ability modifier.
      - "Dice Roll" button for damage/healing spells.

  @see ARCHITECTURE.md Phase 12.3 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import DiceRollModal from '$lib/components/ui/DiceRollModal.svelte';
  import type { MagicFeature } from '$lib/types/feature';
  import type { StatisticPipeline } from '$lib/types/pipeline';
  import type { ID } from '$lib/types/primitives';

  let modalSpellId = $state<ID | null>(null);
  let diceSpellId = $state<ID | null>(null);

  /** Known spells (magic features in activeFeatures). */
  const knownSpells = $derived.by(() => {
    return engine.character.activeFeatures
      .filter(afi => {
        if (!afi.isActive) return false;
        const feat = dataLoader.getFeature(afi.featureId);
        return feat?.category === 'magic';
      })
      .map(afi => dataLoader.getFeature(afi.featureId) as MagicFeature)
      .filter(Boolean);
  });

  /** Spells grouped by level. */
  const spellsByLevel = $derived.by(() => {
    const groups: Record<number, MagicFeature[]> = {};
    for (const spell of knownSpells) {
      const level = Math.min(...Object.values(spell.spellLists ?? { '?': 0 }));
      if (!groups[level]) groups[level] = [];
      groups[level].push(spell);
    }
    return groups;
  });

  const sortedLevels = $derived(Object.keys(spellsByLevel).map(Number).sort((a,b) => a-b));

  /**
   * Spell Save DC delegated to the GameEngine (no game logic in components).
   * GameEngine.getSpellSaveDC() implements D&D 3.5 formula: 10 + spell level + ability mod.
   */
  function getSpellDC(spellLevel: number): number {
    return engine.getSpellSaveDC(spellLevel);
  }

  /** Minimal pipeline for spell damage rolls. */
  function buildSpellPipeline(): StatisticPipeline {
    return {
      id: 'synthetic_spell_roll',
      label: { en: 'Spell' },
      baseValue: 0,
      activeModifiers: [],
      situationalModifiers: [],
      totalBonus: engine.phase_casterLevel,
      totalValue: engine.phase_casterLevel,
      derivedModifier: 0,
    };
  }

  const currentDiceSpell = $derived(
    diceSpellId ? dataLoader.getFeature(diceSpellId) as MagicFeature | undefined : undefined
  );
</script>

<div class="casting-panel">
  <h2 class="panel-title">✨ Spells & Powers</h2>

  {#if knownSpells.length === 0}
    <p class="empty-note">No spells known. Use the Grimoire to learn spells.</p>
  {:else}
    {#each sortedLevels as level}
      <div class="spell-level-group">
        <h3 class="level-header">
          {level === 0 ? 'Cantrips (0)' : `Level ${level}`}
          <span class="dc-hint">Save DC: {getSpellDC(level)}</span>
        </h3>
        {#each spellsByLevel[level] ?? [] as spell}
          <div class="spell-row">
            <span class="spell-name">{engine.t(spell.label)}</span>
            <span class="spell-school">{spell.school}</span>
            <button class="btn-icon info" onclick={() => (modalSpellId = spell.id)} aria-label="Details">ℹ</button>
            {#if spell.grantedModifiers?.some(m => m.targetId.includes('damage'))}
              <button class="btn-icon dice" onclick={() => (diceSpellId = spell.id)} aria-label="Roll damage">🎲</button>
            {/if}
            <button class="btn-cast" aria-label="Cast {engine.t(spell.label)}">Cast</button>
          </div>
        {/each}
      </div>
    {/each}
  {/if}
</div>

{#if modalSpellId}
  <FeatureModal featureId={modalSpellId} onclose={() => (modalSpellId = null)} />
{/if}

{#if diceSpellId && currentDiceSpell}
  <DiceRollModal
    formula={currentDiceSpell.grantedModifiers?.[0]?.targetId.includes('damage') ? '1d6' : '1d20'}
    pipeline={buildSpellPipeline()}
    label="{engine.t(currentDiceSpell.label)} Damage"
    onclose={() => (diceSpellId = null)}
  />
{/if}

<style>
  .casting-panel {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1.25rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
  }

  .panel-title { margin: 0 0 1rem; font-size: 1rem; color: #c4b5fd; border-bottom: 1px solid #21262d; padding-bottom: 0.5rem; }

  .empty-note { font-size: 0.82rem; color: #4a4a6a; font-style: italic; }

  .spell-level-group { margin-bottom: 1rem; }

  .level-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.82rem;
    color: #7c3aed;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.25rem;
    margin: 0 0 0.5rem;
  }

  .dc-hint { font-size: 0.72rem; color: #6080a0; }

  .spell-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.3rem;
    border-radius: 4px;
  }

  .spell-row:hover { background: #0d1117; }

  .spell-name { flex: 1; font-size: 0.85rem; color: #e0e0f0; }
  .spell-school { font-size: 0.72rem; color: #6080a0; }

  .btn-icon {
    background: transparent;
    border: 1px solid #30363d;
    border-radius: 4px;
    width: 1.4rem;
    height: 1.4rem;
    font-size: 0.7rem;
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-icon.info { color: #7c3aed; }
  .btn-icon.info:hover { background: #1c1a3a; }
  .btn-icon.dice { color: #fbbf24; }
  .btn-icon.dice:hover { background: #1a1a00; }

  .btn-cast {
    background: #1c1a3a;
    color: #c4b5fd;
    border: 1px solid #4c35a0;
    border-radius: 4px;
    padding: 0.15rem 0.5rem;
    font-size: 0.75rem;
    cursor: pointer;
    flex-shrink: 0;
  }
  .btn-cast:hover { background: #2d1b69; }
</style>
