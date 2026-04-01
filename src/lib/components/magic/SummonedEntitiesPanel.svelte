<!--
  @file src/lib/components/magic/SummonedEntitiesPanel.svelte
  @description Panel for spell-summoned entities — Spiritual Weapon, Summon Nature's Ally,
               and any other linked entity created via a spell's castEffect.summon_entity.

  DESIGN:
    Summoned entities are temporary linked entities (entityType: 'summon') attached to the
    character. Unlike familiars and animal companions (which are permanent bonds), summons
    last only for a spell duration and must be manually dismissed when the spell ends.

    This panel:
      - Lists all currently active summoned entities from engine.getSummonedEntities()
      - Shows the entity name, source spell, and duration hint
      - Provides a "Dismiss" button (two-click confirmation) to remove the entity

  ARCHITECTURE:
    - Reads: engine.getSummonedEntities() — filtered view of character.linkedEntities
    - Writes: engine.dismissLinkedEntity(instanceId) — removes from linkedEntities
    - Zero game logic in this component (ARCHITECTURE.md §3)

  PLACEMENT:
    Rendered in the Magic tab (SpecialAbilities section) and in the Combat tab
    through EphemeralEffectsPanel-adjacent placement.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { ui } from '$lib/i18n/ui-strings';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import { IconSummon, IconExpire, IconInfo } from '$lib/components/ui/icons';
  import type { ID } from '$lib/types/primitives';

  // ── State ──────────────────────────────────────────────────────────────────
  let modalFeatureId      = $state<ID | null>(null);
  /** Map of instanceId → true when "Confirm dismiss?" is showing. */
  let pendingDismiss = $state<Record<ID, boolean>>({});

  // ── Data ───────────────────────────────────────────────────────────────────
  const summonedEntities = $derived(engine.getSummonedEntities());

  // ── Actions ────────────────────────────────────────────────────────────────

  /**
   * Two-click confirmation dismiss pattern (mirrors EphemeralEffectsPanel).
   * First click enters confirm mode; second click dismisses.
   */
  function handleDismissClick(instanceId: ID): void {
    if (pendingDismiss[instanceId]) {
      engine.dismissLinkedEntity(instanceId);
      const { [instanceId]: _, ...rest } = pendingDismiss;
      pendingDismiss = rest;
    } else {
      pendingDismiss = { ...pendingDismiss, [instanceId]: true };
    }
  }

  function cancelDismiss(instanceId: ID): void {
    if (!pendingDismiss[instanceId]) return;
    const { [instanceId]: _, ...rest } = pendingDismiss;
    pendingDismiss = rest;
  }
</script>

{#if summonedEntities.length > 0}
<div class="card overflow-hidden">

  <!-- Header -->
  <div class="flex items-center gap-2 px-4 py-3 border-b border-border">
    <IconSummon size={18} class="text-purple-400" aria-hidden="true" />
    <span class="text-sm font-semibold text-text-primary">
      {ui('magic.summon.panel_title', engine.settings.language)}
    </span>
    <span
      class="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full
             bg-purple-500/20 text-purple-300 text-xs font-bold"
      aria-label={ui('magic.summon.panel_count_aria', engine.settings.language).replace('{n}', String(summonedEntities.length))}
    >
      {summonedEntities.length}
    </span>
  </div>

  <!-- Entity list -->
  <ul class="divide-y divide-border" role="list">
    {#each summonedEntities as entity (entity.instanceId)}
      {@const isPendingDismiss = pendingDismiss[entity.instanceId] ?? false}
      {@const bondFeature = dataLoader.getFeature(entity.bondingFeatureId)}

      <li
        class="flex items-start gap-3 px-4 py-3 transition-colors duration-150
               {isPendingDismiss ? 'bg-red-950/20' : 'hover:bg-surface-alt'}"
      >
        <!-- Icon -->
        <div class="shrink-0 mt-0.5">
          <IconSummon size={16} class="text-purple-400" aria-hidden="true" />
        </div>

        <!-- Entity info -->
        <div class="flex-1 min-w-0">
          <!-- Entity name -->
          <p class="text-sm font-medium text-text-primary truncate">
            {entity.characterData.name}
          </p>

          <!-- Metadata: source spell + duration hint -->
          <div class="flex flex-wrap items-center gap-1.5 mt-1">

            <!-- Source spell badge -->
            {#if bondFeature}
              <span class="text-[10px] text-purple-400/80">
                {ui('magic.summon.from_spell', engine.settings.language)}
                {engine.t(bondFeature.label)}
              </span>
            {/if}

            <!-- Entity type badge -->
            <span
              class="inline-flex items-center px-1.5 py-0.5 rounded-full
                     bg-purple-900/30 text-purple-300 text-[10px] font-medium"
            >
              {ui(`magic.summon.entity_type.${entity.entityType}`, engine.settings.language)}
            </span>

          </div>

          <!-- Confirmation prompt -->
          {#if isPendingDismiss}
            <p class="mt-1.5 text-xs font-semibold text-red-400 animate-pulse">
              {ui('magic.summon.confirm_dismiss', engine.settings.language)}
            </p>
          {/if}
        </div>

        <!-- Action buttons -->
        <div class="shrink-0 flex items-center gap-1">

          <!-- Info button — opens the bonding spell's feature modal -->
          {#if bondFeature}
            <button
              class="btn-ghost p-1.5 text-text-muted hover:text-accent rounded-md transition-colors"
              onclick={() => (modalFeatureId = entity.bondingFeatureId)}
              title={ui('magic.summon.info_title', engine.settings.language)}
              aria-label={ui('magic.summon.info_aria', engine.settings.language).replace('{name}', entity.characterData.name)}
              type="button"
            >
              <IconInfo size={14} aria-hidden="true" />
            </button>
          {/if}

          <!-- Dismiss button — two-click confirmation -->
          <button
            class="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium
                   transition-colors duration-150
                   {isPendingDismiss
                     ? 'bg-red-600 text-white hover:bg-red-700'
                     : 'bg-surface-alt border border-border text-text-secondary hover:bg-red-950/30 hover:border-red-800 hover:text-red-400'}"
            onclick={() => handleDismissClick(entity.instanceId)}
            onblur={() => { setTimeout(() => cancelDismiss(entity.instanceId), 200); }}
            title={ui('magic.summon.dismiss_tooltip', engine.settings.language)}
            aria-label="{isPendingDismiss
              ? ui('magic.summon.confirm_dismiss', engine.settings.language)
              : ui('magic.summon.dismiss', engine.settings.language)} {entity.characterData.name}"
            aria-pressed={isPendingDismiss}
            type="button"
          >
            <IconExpire size={12} aria-hidden="true" />
            {ui('magic.summon.dismiss', engine.settings.language)}
          </button>
        </div>
      </li>
    {/each}
  </ul>

</div>
{/if}

{#if modalFeatureId}
  <FeatureModal featureId={modalFeatureId} onclose={() => (modalFeatureId = null)} />
{/if}
