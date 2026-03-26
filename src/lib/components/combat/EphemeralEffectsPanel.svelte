<!--
  @file src/lib/components/combat/EphemeralEffectsPanel.svelte
  @description Active Ephemeral Effects panel — shows temporary effects from consumed
               potions, oils, and one-shot items, with an "Expire" button on each card.

  D&D 3.5 CONTEXT:
    When a character drinks a Potion of Bull's Strength, the +4 STR enhancement
    modifier becomes active for approximately 3 minutes (real-time) or until the
    effect is manually dismissed. The engine does NOT auto-expire effects because
    it has no concept of wall-clock time or combat rounds in the persistent state.

    The player is responsible for ending effects when appropriate — this panel gives
    them the control to do so via the "Expire" button. This matches how D&D is
    actually played at the table: "Remember to remove your Bull's Strength when
    3 minutes are up."

  ARCHITECTURE:
    - Reads from `engine.getEphemeralEffects()` (a filter over `activeFeatures`).
    - Each "Expire" button calls `engine.expireEffect(instanceId)` which safely
      removes ONLY ephemeral instances (the guard prevents accidental deletion of
      permanent features).
    - This component is placed in the COMBAT TAB left column, above ActionBudgetBar
      and HealthAndXP, because active effects are most relevant during combat.
    - When no effects are active, the panel collapses to a single compact status row
      to save vertical space.

  DESIGN DECISIONS:
    - Effects are shown newest-first (appliedAtRound descending — from getEphemeralEffects()).
    - The "source item" name is shown via traceability (sourceItemInstanceId lookup).
    - Duration hint is shown as a badge, not as a countdown (no timer in this phase).
    - The Expire button uses a destructive red style to signal irreversibility.
    - Confirmation before expire: clicking once shows "Confirm?" text; second click expires.

  FUTURE IMPROVEMENTS (out of scope for this phase):
    - Auto-expire after N rounds via triggerRoundTick() integration.
    - Visual countdown timer on the duration badge.
    - "Extend" button for GM use.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { ui, uiN } from '$lib/i18n/ui-strings';
  import FeatureModal from '$lib/components/ui/FeatureModal.svelte';
  import {
    IconEphemeral,
    IconExpire,
    IconInfo,
    IconActiveEffect,
  } from '$lib/components/ui/icons';
  import type { ID } from '$lib/types/primitives';

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Feature ID to show in the detail modal. */
  let modalFeatureId = $state<ID | null>(null);

  /**
   * Tracks which effect cards are in "confirm expire" mode.
   * The player must click "Expire" twice to actually dismiss an effect.
   *
   * KEY: instanceId of the effect
   * VALUE: true = awaiting confirmation, false/absent = normal state
   *
   * WHY TWO-CLICK CONFIRMATION:
   *   Expiring an active buff is irreversible. A single accidental tap on mobile
   *   could remove a critical buff (e.g., Haste in the middle of combat).
   *   Two clicks is the minimum friction that prevents accidental dismissal while
   *   still being fast enough for urgent use.
   */
  let pendingExpire = $state<Record<ID, boolean>>({});

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  /**
   * All currently active ephemeral effects on the character.
   * Computed reactively — updates whenever `activeFeatures` changes.
   * Sorted newest-first by appliedAtRound (from GameEngine.getEphemeralEffects()).
   */
  const ephemeralEffects = $derived.by(() => {
    return engine.getEphemeralEffects().map(afi => {
      const feature = dataLoader.getFeature(afi.featureId);
      // Resolve source item name (if the effect came from a consumed item).
      // The source item has been removed from inventory, but we can still read
      // its feature definition to get the display name.
      const sourceFeature = afi.ephemeral?.sourceItemInstanceId
        ? null  // The source instance was removed — we can't look it up anymore.
              // We only have the featureId on the ephemeral instance, which IS
              // the same as the consumed item's featureId, so the name is identical.
        : null;

      return {
        instanceId: afi.instanceId,
        featureId: afi.featureId,
        feature,
        durationHint: afi.ephemeral?.durationHint,
        appliedAtRound: afi.ephemeral?.appliedAtRound ?? 0,
        // Count how many modifiers this effect is contributing (for display).
        modifierCount: feature?.grantedModifiers?.length ?? 0,
      };
    });
  });

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Handles the first click on "Expire": enters confirmation mode.
   * If already in confirmation mode, performs the actual expire.
   */
  function handleExpireClick(instanceId: ID) {
    if (pendingExpire[instanceId]) {
      // Second click: confirmed — perform the expire
      engine.expireEffect(instanceId);
      // Clean up the confirmation state (the instance no longer exists,
      // but clearing the entry is good hygiene)
      const { [instanceId]: _, ...rest } = pendingExpire;
      pendingExpire = rest;
    } else {
      // First click: enter confirmation mode
      pendingExpire = { ...pendingExpire, [instanceId]: true };
    }
  }

  /**
   * Cancels a pending expire confirmation when the user clicks elsewhere or
   * presses Escape. Called on blur of the expire button.
   */
  function cancelExpire(instanceId: ID) {
    if (!pendingExpire[instanceId]) return;
    const { [instanceId]: _, ...rest } = pendingExpire;
    pendingExpire = rest;
  }
</script>

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- PANEL WRAPPER                                                              -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
<div class="card overflow-hidden">

  <!-- ─── PANEL HEADER ───────────────────────────────────────────────────── -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-border">
    <div class="flex items-center gap-2">
      <IconEphemeral size={20} class="text-accent" aria-hidden="true" />
      <span class="text-sm font-semibold text-text-primary">
        {ui('effects.panel.title', engine.settings.language)}
      </span>
      {#if ephemeralEffects.length > 0}
        <!-- Count badge: shows how many effects are currently active -->
        <span
          class="inline-flex items-center justify-center
                 min-w-[1.25rem] h-5 px-1.5 rounded-full
                 bg-accent/20 text-accent text-xs font-bold"
          aria-label="{ephemeralEffects.length} active effects"
        >
          {ephemeralEffects.length}
        </span>
      {/if}
    </div>
  </div>

  <!-- ─── EMPTY STATE ────────────────────────────────────────────────────── -->
  {#if ephemeralEffects.length === 0}
    <p class="px-4 py-3 text-xs text-text-muted italic">
      {ui('effects.panel.empty', engine.settings.language)}
    </p>

  {:else}
    <!-- ─── EFFECT CARDS LIST ──────────────────────────────────────────── -->
    <ul class="divide-y divide-border" role="list" aria-label="Active effects">
      {#each ephemeralEffects as effect (effect.instanceId)}
        {@const isPendingExpire = pendingExpire[effect.instanceId] ?? false}
        <li
          class="flex items-start gap-3 px-4 py-3
                 transition-colors duration-150
                 {isPendingExpire ? 'bg-red-50 dark:bg-red-950/20' : 'hover:bg-surface-alt'}"
        >
          <!-- Left: icon indicating an active magical effect -->
          <div class="shrink-0 mt-0.5">
            <IconActiveEffect
              size={16}
              class="text-accent"
              aria-hidden="true"
            />
          </div>

          <!-- Center: effect name, duration, modifier count -->
          <div class="flex-1 min-w-0">
            <!-- Effect name -->
            <p class="text-sm font-medium text-text-primary truncate">
              {#if effect.feature}
                {engine.t(effect.feature.label)}
              {:else if sessionContext.isGameMaster}
                <!-- Fallback (GM-only): show raw featureId when feature data is not loaded -->
                <span class="text-text-muted">{effect.featureId}</span>
              {:else}
                <!-- Fallback (players): show a generic label instead of internal ID -->
                <span class="text-text-muted">{ui('common.unknown', engine.settings.language)}</span>
              {/if}
            </p>

            <!-- Metadata row: duration hint + modifier count + round info -->
            <div class="flex flex-wrap items-center gap-1.5 mt-1">

              <!-- Duration badge (e.g., "3 min", "10 rounds") -->
              {#if effect.durationHint}
                <span
                  class="inline-flex items-center gap-1
                         px-1.5 py-0.5 rounded-full
                         bg-amber-100 dark:bg-amber-900/30
                         text-amber-700 dark:text-amber-300
                         text-[10px] font-medium"
                  title={ui('effects.panel.duration', engine.settings.language)}
                >
                  <IconEphemeral size={10} aria-hidden="true" />
                  {effect.durationHint}
                </span>
              {/if}

              <!-- Active badge -->
              <span
                class="inline-flex items-center
                       px-1.5 py-0.5 rounded-full
                       bg-green-100 dark:bg-green-900/30
                       text-green-700 dark:text-green-300
                       text-[10px] font-medium"
              >
                {ui('effects.panel.active_badge', engine.settings.language)}
              </span>

              <!-- Modifier count hint (e.g., "2 modifiers") — localized via uiN() -->
              {#if effect.modifierCount > 0}
                <span class="text-[10px] text-text-muted">
                  {uiN('effects.panel.modifiers', effect.modifierCount, engine.settings.language)}
                </span>
              {/if}

              <!-- Round indicator (e.g., "round 3") -->
              {#if effect.appliedAtRound > 0}
                <span class="text-[10px] text-text-muted">
                  {ui('effects.panel.applied_round', engine.settings.language)} {effect.appliedAtRound}
                </span>
              {/if}
            </div>

            <!-- Confirmation prompt (shown only while in pending-expire state) -->
            {#if isPendingExpire}
              <p class="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400 animate-pulse">
                {ui('effects.panel.confirm_expire', engine.settings.language)}
              </p>
            {/if}
          </div>

          <!-- Right: Info + Expire action buttons -->
          <div class="shrink-0 flex items-center gap-1">

            <!-- Info button: opens the Feature detail modal -->
            {#if effect.feature}
              <button
                class="btn-ghost p-1.5 text-text-muted hover:text-accent
                       rounded-md transition-colors"
                onclick={() => (modalFeatureId = effect.featureId)}
                title="Show effect details"
                aria-label="Show details for {effect.feature ? engine.t(effect.feature.label) : effect.featureId}"
                type="button"
              >
                <IconInfo size={14} aria-hidden="true" />
              </button>
            {/if}

            <!--
              Expire button — two-click confirmation pattern.
              First click: turns red, shows "Confirm?" text on the card.
              Second click: expires the effect.
              Blur / focus-out: cancels the confirmation.
            -->
            <button
              class="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium
                     transition-colors duration-150
                     {isPendingExpire
                       ? 'bg-red-600 text-white hover:bg-red-700'
                       : 'bg-surface-alt border border-border text-text-secondary hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400'}"
              onclick={() => handleExpireClick(effect.instanceId)}
              onblur={() => {
                // Cancel confirmation if user tabs away without confirming.
                // Small timeout allows the second click to register before blur fires.
                setTimeout(() => cancelExpire(effect.instanceId), 200);
              }}
              title={ui('effects.panel.expire_tooltip', engine.settings.language)}
              aria-label="{isPendingExpire ? 'Confirm expire' : 'Expire'} {effect.feature ? engine.t(effect.feature.label) : effect.featureId}"
              aria-pressed={isPendingExpire}
              type="button"
            >
              <IconExpire size={12} aria-hidden="true" />
              {ui('effects.panel.expire', engine.settings.language)}
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

</div>

<!-- Feature detail modal -->
{#if modalFeatureId}
  <FeatureModal featureId={modalFeatureId} onclose={() => (modalFeatureId = null)} />
{/if}
