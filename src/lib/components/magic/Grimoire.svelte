<!--
  @file src/lib/components/magic/Grimoire.svelte
  @description Spellbook/Grimoire — Learn or Add spells/powers to the character.
  Phase 19.10: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT:
    Header: title + caster level chip + max spell level chip.
    Search input (full-width).
    Spell list: scrollable (max-h-96), each row has meta chips + info + Learn button.
    Known spells: green-tinted row.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import type { MagicFeature } from '$lib/types/feature';
  import type { ID } from '$lib/types/primitives';
  import { IconSpells, IconSearch, IconInfo, IconAdd, IconChecked } from '$lib/components/ui/icons';

  let searchQuery  = $state('');
  let modalSpellId = $state<ID | null>(null);

  const activeSpellListIds = $derived.by(() => {
    const listIds = new Set<string>();
    for (const afi of engine.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feat = dataLoader.getFeature(afi.featureId);
      if (!feat || feat.category !== 'class') continue;
      const hasSpellSlots = (feat.grantedModifiers ?? [])
        .concat((feat.levelProgression ?? []).flatMap(e => e.grantedModifiers))
        .some(m => m.targetId.startsWith('resources.spell_slots_'));
      if (hasSpellSlots) listIds.add(`list_${feat.id.replace('class_', '')}`);
    }
    return listIds;
  });

  const maxSpellLevel = $derived(Math.max(0, Math.floor(engine.phase_casterLevel / 2)));

  const availableSpells = $derived.by(() => {
    const allMagic = dataLoader.queryFeatures('category:magic') as MagicFeature[];
    return allMagic.filter(spell => {
      const matches = Object.keys(spell.spellLists ?? {}).some(listId => activeSpellListIds.has(listId));
      if (!matches) return false;
      const spellLevel = Math.max(...Object.values(spell.spellLists ?? {}));
      if (spellLevel > maxSpellLevel) return false;
      if (searchQuery.trim()) {
        return engine.t(spell.label).toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  });

  const knownSpellIds = $derived(
    new Set(engine.character.activeFeatures.filter(afi => afi.isActive).map(afi => afi.featureId))
  );

  function learnSpell(spellId: ID) {
    if (knownSpellIds.has(spellId)) return;
    engine.addFeature({ instanceId: `afi_spell_${spellId}_${Date.now()}`, featureId: spellId, isActive: true });
  }

  /** Map magic type to a Tailwind badge class */
  function magicTypeBadgeClass(type: string): string {
    return type === 'arcane'  ? 'bg-purple-900/40 text-purple-400 border-purple-800/40'
         : type === 'divine'  ? 'bg-yellow-900/30 text-yellow-400 border-yellow-800/30'
         : type === 'psionic' ? 'bg-cyan-900/30 text-cyan-400 border-cyan-800/30'
         : 'bg-surface-alt text-text-muted border-border';
  }
</script>

<div class="card p-4 flex flex-col gap-3">

  <!-- Header -->
  <div class="flex items-center justify-between flex-wrap gap-2 border-b border-border pb-2">
    <div class="section-header">
      <IconSpells size={20} aria-hidden="true" />
      <span>Grimoire — Spell Catalog</span>
    </div>
    <div class="flex gap-1.5">
      <span class="badge-accent">CL {engine.phase_casterLevel}</span>
      <span class="badge-gray">Max Lvl {maxSpellLevel}</span>
    </div>
  </div>

  <!-- Search -->
  <div class="relative">
    <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
      <IconSearch size={14} aria-hidden="true" />
    </span>
    <input
      type="search"
      bind:value={searchQuery}
      placeholder="Search spells…"
      class="input pl-8 text-sm w-full"
      aria-label="Search spell catalog"
    />
  </div>

  <!-- Spell list / empty state -->
  {#if availableSpells.length === 0}
    <p class="text-sm text-text-muted italic text-center py-4">
      {activeSpellListIds.size === 0
        ? 'Select a spellcasting class to see its spell list.'
        : `Caster level ${engine.phase_casterLevel} — no spells match the current filters.`}
    </p>
  {:else}
    <div
      class="flex flex-col gap-1.5 overflow-y-auto max-h-96"
      style="scrollbar-width: thin; scrollbar-color: var(--theme-border) transparent;"
    >
      {#each availableSpells as spell}
        {@const sl    = Math.max(...Object.values(spell.spellLists))}
        {@const known = knownSpellIds.has(spell.id)}

        <div
          class="flex items-center gap-2 px-3 py-2 rounded-md border transition-colors duration-150
                 {known ? 'border-green-600/40 bg-green-950/10 dark:bg-green-950/20'
                        : 'border-border bg-surface-alt hover:border-accent/40'}"
        >
          <!-- Spell info -->
          <div class="flex-1 flex flex-col gap-0.5 min-w-0">
            <span class="text-sm font-medium text-text-primary truncate">{engine.t(spell.label)}</span>
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="badge-accent text-[10px]">Lvl {sl}</span>
              <span class="text-[10px] text-text-muted">{spell.school}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded border {magicTypeBadgeClass(spell.magicType)}">{spell.magicType}</span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex gap-1 shrink-0">
            <button
              class="btn-ghost p-1.5 text-accent hover:bg-accent/10"
              onclick={() => (modalSpellId = spell.id)}
              aria-label="Show {engine.t(spell.label)} details"
              type="button"
            ><IconInfo size={14} aria-hidden="true" /></button>
            <button
              class="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors duration-150
                     {known
                       ? 'bg-green-900/30 text-green-400 border border-green-700/30 cursor-default'
                       : 'bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20'}"
              onclick={() => learnSpell(spell.id)}
              disabled={known}
              aria-label="{known ? 'Already known' : 'Learn ' + engine.t(spell.label)}"
              type="button"
            >
              {#if known}
                <IconChecked size={12} aria-hidden="true" /> Known
              {:else}
                <IconAdd size={12} aria-hidden="true" /> Learn
              {/if}
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
