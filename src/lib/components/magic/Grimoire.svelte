<!--
  @file src/lib/components/magic/Grimoire.svelte
  @description Spellbook/Grimoire — Learn or Add spells/powers to the character.

  PURPOSE:
    Displays available spells/powers from the DataLoader cache, filtered by
    the character's active spell lists and caster level.

    The filter logic:
      1. Query all features with category "magic" from DataLoader.
      2. Check if the character has an active class that matches any spellList key.
      3. Only show spells where the spell level ≤ floor(casterLevel / 2) (half caster level rule).

    Allows "learning" spells: adds them as ActiveFeatureInstances {category: "magic"}.

  @see src/lib/engine/GameEngine.svelte.ts for phase_casterLevel.
  @see ARCHITECTURE.md Phase 12.2 for the specification.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import type { MagicFeature } from '$lib/types/feature';
  import type { ID } from '$lib/types/primitives';

  let searchQuery = $state('');
  let modalSpellId = $state<ID | null>(null);

  /**
   * Active spell list IDs (from active class features' spellLists keys).
   * A class feature can have grantedModifiers that include a list_* tag.
   * Simplified detection: we check class levelProgression for any modifier
   * targeting a "resources.spell_slots_*" pipeline.
   */
  const activeSpellListIds = $derived.by(() => {
    const listIds = new Set<string>();
    for (const afi of engine.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feat = dataLoader.getFeature(afi.featureId);
      if (!feat || feat.category !== 'class') continue;
      // Check if class has any spell slot resources
      const hasSpellSlots = (feat.grantedModifiers ?? [])
        .concat((feat.levelProgression ?? []).flatMap(e => e.grantedModifiers))
        .some(m => m.targetId.startsWith('resources.spell_slots_'));
      if (hasSpellSlots) {
        // Use the class id as a proxy for the spellList id: list_<classId_suffix>
        // This is approximate — real implementation reads the MagicFeature.spellLists keys
        listIds.add(`list_${feat.id.replace('class_', '')}`);
      }
    }
    return listIds;
  });

  const maxSpellLevel = $derived(Math.max(0, Math.floor(engine.phase_casterLevel / 2)));

  /**
   * Available spells/powers matching the character's spell lists and caster level.
   */
  const availableSpells = $derived.by(() => {
    const allMagic = dataLoader.queryFeatures('category:magic') as MagicFeature[];
    return allMagic.filter(spell => {
      // Check if any of the spell's spellLists matches an active list
      const matches = Object.keys(spell.spellLists ?? {}).some(listId =>
        activeSpellListIds.has(listId)
      );
      if (!matches) return false;

      // Filter by caster level: only show spells <= maxSpellLevel
      const spellLevel = Math.max(...Object.values(spell.spellLists ?? {}));
      if (spellLevel > maxSpellLevel) return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return engine.t(spell.label).toLowerCase().includes(q);
      }

      return true;
    });
  });

  const knownSpellIds = $derived(
    new Set(engine.character.activeFeatures
      .filter(afi => afi.isActive)
      .map(afi => afi.featureId)
    )
  );

  function learnSpell(spellId: ID) {
    if (knownSpellIds.has(spellId)) return;
    engine.addFeature({
      instanceId: `afi_spell_${spellId}_${Date.now()}`,
      featureId: spellId,
      isActive: true,
    });
  }
</script>

<div class="grimoire-panel">
  <div class="panel-header">
    <h2 class="panel-title">📖 Grimoire — Spell Catalog</h2>
    <div class="caster-info">
      <span class="info-chip">CL {engine.phase_casterLevel}</span>
      <span class="info-chip">Max spell level: {maxSpellLevel}</span>
    </div>
  </div>

  <input
    type="search"
    bind:value={searchQuery}
    placeholder="Search spells..."
    class="search-input"
    aria-label="Search spell catalog"
  />

  {#if availableSpells.length === 0}
    <p class="empty-note">
      No spells available. {activeSpellListIds.size === 0
        ? 'Select a spellcasting class to see its spell list.'
        : `Caster level ${engine.phase_casterLevel} — no spells match the current filters.`}
    </p>
  {:else}
    <div class="spell-list">
      {#each availableSpells as spell}
        {@const sl = Math.max(...Object.values(spell.spellLists))}
        {@const known = knownSpellIds.has(spell.id)}

        <div class="spell-entry" class:known>
          <div class="spell-info">
            <span class="spell-name">{engine.t(spell.label)}</span>
            <div class="spell-meta">
              <span class="spell-level">Lvl {sl}</span>
              <span class="spell-school">{spell.school}</span>
              <span class="spell-type type-{spell.magicType}">{spell.magicType}</span>
            </div>
          </div>
          <div class="spell-actions">
            <button
              class="info-btn"
              onclick={() => (modalSpellId = spell.id)}
              aria-label="Show {engine.t(spell.label)} details"
            >ℹ</button>
            <button
              class="btn-learn"
              onclick={() => learnSpell(spell.id)}
              disabled={known}
              aria-label="{known ? 'Already known' : 'Learn ' + engine.t(spell.label)}"
            >
              {known ? '✓ Known' : '+ Learn'}
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if modalSpellId}
  <FeatureModal featureId={modalSpellId} onclose={() => (modalSpellId = null)} />
{/if}

<style>
  .grimoire-panel {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1.25rem;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.5rem;
  }

  .panel-title { margin: 0; font-size: 1rem; color: #c4b5fd; }

  .caster-info { display: flex; gap: 0.4rem; }
  .info-chip {
    font-size: 0.75rem;
    background: #1c1a3a;
    color: #c4b5fd;
    border: 1px solid #4c35a0;
    border-radius: 4px;
    padding: 0.15rem 0.5rem;
  }

  .search-input {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #e0e0f0;
    padding: 0.4rem 0.6rem;
    font-size: 0.9rem;
    font-family: inherit;
    width: 100%;
    box-sizing: border-box;
  }
  .search-input:focus { outline: none; border-color: #7c3aed; }

  .empty-note { font-size: 0.82rem; color: #4a4a6a; font-style: italic; margin: 0; }

  .spell-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    max-height: 400px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #30363d transparent;
  }

  .spell-entry {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 6px;
    padding: 0.45rem 0.65rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .spell-entry.known { border-color: #166534; background: #0f1a0f; }

  .spell-info { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; }
  .spell-name { font-size: 0.88rem; font-weight: 500; color: #e0e0f0; }

  .spell-meta { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
  .spell-level { font-size: 0.72rem; background: #1c1a3a; color: #c4b5fd; border-radius: 3px; padding: 0.05rem 0.3rem; }
  .spell-school { font-size: 0.72rem; color: #6080a0; }
  .spell-type { font-size: 0.68rem; border-radius: 3px; padding: 0.05rem 0.3rem; }
  .type-arcane { background: #1c0c1c; color: #c084fc; }
  .type-divine { background: #1c1a0a; color: #fbbf24; }
  .type-psionic { background: #0a1c1c; color: #67e8f9; }

  .spell-actions { display: flex; gap: 0.3rem; flex-shrink: 0; }

  .info-btn, .btn-learn {
    border: 1px solid #30363d;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.78rem;
    padding: 0.2rem 0.5rem;
    transition: background 0.15s;
  }

  .info-btn { background: transparent; color: #7c3aed; }
  .info-btn:hover { background: #1c1a3a; }
  .btn-learn { background: #1c1a3a; color: #c4b5fd; border-color: #4c35a0; }
  .btn-learn:hover:not(:disabled) { background: #2d1b69; }
  .btn-learn:disabled { background: #0f1a0f; color: #4ade80; border-color: #166534; cursor: default; }
</style>
