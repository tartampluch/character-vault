<!--
  @file src/routes/character/[id]/+page.svelte
  @description Character sheet container — Phase 19.6 (Full-Height Layout & Tab Redesign).

  LAYOUT ARCHITECTURE:
    The character sheet occupies the full height available inside the AppShell's
    scrollable content area. Internally it uses a flex-column layout:

      ┌───────────────────────────────────────────────┐
      │  CHARACTER HEADER (name, back-link, level)    │  shrink-0
      ├───────────────────────────────────────────────┤
      │  TAB BAR (Core | Abilities | Combat | …)      │  shrink-0, overflow-x-auto
      ├───────────────────────────────────────────────┤
      │                                               │
      │  TAB CONTENT AREA (flex-1, overflow-y-auto)  │  scrolls internally
      │                                               │
      └───────────────────────────────────────────────┘

    The outer div is `h-full flex flex-col` — it stretches to fill the AppShell's
    `<main>` element (which itself is `flex-1 overflow-y-auto`).

    CRITICAL REQUIREMENT (from Phase 19 spec):
      "The user must NEVER need to scroll the page to reach the tabs."
      The tab bar is `shrink-0`, meaning it never scrolls off-screen. Only the
      content area below the tab bar scrolls.

  TAB BAR DESIGN:
    Desktop: Horizontal row showing icon (20px) + label for each tab. Adequate
             padding. Active tab: `font-bold text-accent border-b-2 border-accent
             bg-accent/5` (underline + subtle tint).
    Mobile (<768px):  Labels hidden — only icons shown. Each tab button is minimum
             44px tall (touch target requirement). The tab bar itself has
             `overflow-x: auto` with `scroll-snap-type: x mandatory` so the
             user can swipe the bar left/right on very narrow screens (6 tabs
             fit fine on 375px but wider button text can overflow on 320px).
    Touch target: `min-h-[44px]` on `pointer: coarse` via the media query below.

  MULTI-COLUMN CONTENT ON WIDE SCREENS:
    On desktop wide screens (≥1280px), the Core and Abilities tabs arrange their
    panels into a 2-column grid. The Combat tab uses a 2-column grid as well.
    This is implemented inside the individual tab components using Tailwind
    responsive grid utilities (`xl:grid xl:grid-cols-2 gap-4`).
    The +page.svelte itself only provides the outer container padding.

  TAB ROUTING:
    Tab state is driven by the `?tab=` URL query parameter so tabs are deep-linkable.
    `replaceState: true` prevents a new browser history entry on each tab switch.

  CHARACTER LOADING:
    On mount, reads `[id]` from URL params. Load priority:
      1. `engine.allVaultCharacters` in-memory list (fast, no I/O).
      2. `storageManager.loadCharacter(id)` (localStorage / API fallback).
      3. `createEmptyCharacter(id)` (graceful degradation for direct URL access).

  ALL PHASE 8-13 COMPONENTS ARE NOW WIRED UP:
    - Core tab:      BasicInfo, AbilityScoresSummary, SavingThrowsSummary,
                     SkillsSummary, LoreAndLanguages
    - Abilities tab: AbilityScores, SavingThrows, SkillsMatrix
    - Combat tab:    HealthAndXP, ArmorClass, CoreCombat, Attacks,
                     MovementSpeeds, Resistances, DamageReduction
    - Feats tab:     FeatsTab
    - Magic tab:     CastingPanel, Grimoire, SpecialAbilities
    - Inventory tab: InventoryTab (which internally includes Encumbrance)
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { engine, createEmptyCharacter } from '$lib/engine/GameEngine.svelte';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { storageManager, ApiError } from '$lib/engine/StorageManager';
  import type { Character } from '$lib/types/character';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { getGmGlobalOverrides } from '$lib/api/serverSettingsApi';
  import GmCharacterOverridesPanel from '$lib/components/gm/GmCharacterOverridesPanel.svelte';

  // ── Core tab components (Phase 8) ──────────────────────────────────────────
  import BasicInfo             from '$lib/components/core/BasicInfo.svelte';
  import AbilityScoresSummary  from '$lib/components/core/AbilityScoresSummary.svelte';
  import SavingThrowsSummary   from '$lib/components/core/SavingThrowsSummary.svelte';
  import SkillsSummary         from '$lib/components/core/SkillsSummary.svelte';
  import LoreAndLanguages      from '$lib/components/core/LoreAndLanguages.svelte';

  // ── Abilities & Skills tab components (Phase 9) ────────────────────────────
  import AbilityScores         from '$lib/components/abilities/AbilityScores.svelte';
  import SavingThrows          from '$lib/components/abilities/SavingThrows.svelte';
  import SkillsMatrix          from '$lib/components/abilities/SkillsMatrix.svelte';

  // ── Combat tab components (Phase 10) ──────────────────────────────────────
  import HealthAndXP           from '$lib/components/combat/HealthAndXP.svelte';
  import ArmorClass            from '$lib/components/combat/ArmorClass.svelte';
  import CoreCombat            from '$lib/components/combat/CoreCombat.svelte';
  import Attacks               from '$lib/components/combat/Attacks.svelte';
  import MovementSpeeds        from '$lib/components/combat/MovementSpeeds.svelte';
  import Resistances           from '$lib/components/combat/Resistances.svelte';
  import DamageReduction       from '$lib/components/combat/DamageReduction.svelte';
  import ActionBudgetBar       from '$lib/components/combat/ActionBudgetBar.svelte';
  import EphemeralEffectsPanel from '$lib/components/combat/EphemeralEffectsPanel.svelte';

  // ── Feats tab components (Phase 11) ───────────────────────────────────────
  import FeatsTab              from '$lib/components/feats/FeatsTab.svelte';

  // ── Magic tab components (Phase 12) ───────────────────────────────────────
  import CastingPanel          from '$lib/components/magic/CastingPanel.svelte';
  import Grimoire              from '$lib/components/magic/Grimoire.svelte';
  import SpecialAbilities      from '$lib/components/magic/SpecialAbilities.svelte';

  // ── Inventory tab components (Phase 13) ───────────────────────────────────
  import InventoryTab          from '$lib/components/inventory/InventoryTab.svelte';
  // NOTE: Encumbrance is rendered internally by InventoryTab — do NOT import it separately here.

  // ── Lucide icons ───────────────────────────────────────────────────────────
  import {
    IconTabCore, IconTabAbilities, IconTabCombat,
    IconTabFeats, IconTabMagic, IconTabInventory,
    IconBack, IconSuccess,
  } from '$lib/components/ui/icons';

  // ===========================================================================
  // TABS DEFINITION
  // Data-driven tab list — zero hardcoded D&D terms (spec rule §6).
  // ===========================================================================

  const TABS = [
    { key: 'core',      labelKey: 'tab.core',      icon: IconTabCore      },
    { key: 'abilities', labelKey: 'tab.abilities', icon: IconTabAbilities },
    { key: 'combat',    labelKey: 'tab.combat',    icon: IconTabCombat    },
    { key: 'feats',     labelKey: 'tab.feats',     icon: IconTabFeats     },
    { key: 'magic',     labelKey: 'tab.magic',     icon: IconTabMagic     },
    { key: 'inventory', labelKey: 'tab.inventory', icon: IconTabInventory },
  ] as const;

  type TabKey = (typeof TABS)[number]['key'];

  // ===========================================================================
  // DERIVED STATE FROM THE URL
  // ===========================================================================

  /** Character ID from the SvelteKit route parameter `/character/[id]`. */
  const characterId = $derived($page.params.id);

  /**
   * Active tab from the `?tab=` query parameter. Defaults to 'core'.
   * We cast to TabKey — invalid values fall through to the "unknown tab" branch.
   */
  const activeTab = $derived<TabKey>(
    ($page.url.searchParams.get('tab') as TabKey) ?? 'core'
  );

  // ===========================================================================
  // CHARACTER LOADING — Server-first
  // ===========================================================================

  /**
   * Loading state for the character fetch from the server.
   * 'loading'   — awaiting GET /api/characters/{id}
   * 'ready'     — character loaded successfully
   * 'not_found' — server returned 404 / 403
   * 'error'     — network or unexpected server error
   */
  let loadState = $state<'loading' | 'ready' | 'not_found' | 'error'>('loading');

  /**
   * Guard flag — plain boolean so it never creates a reactive dependency.
   * Prevents rule sources from being loaded more than once per page visit.
   */
  let rulesLoadInitiated = false;

  /**
   * Loads the character from the server whenever the URL ID changes.
   *
   * STRATEGY:
   *   1. Always fetch fresh data from GET /api/characters/{id}.
   *      This guarantees the UI shows the authoritative server version on
   *      every page load or direct URL navigation — no stale localStorage data.
   *   2. While the fetch is in flight, show a loading skeleton.
   *   3. On success: engine.loadCharacter(serverChar), then load rule sources.
   *   4. On 404/403: show a "character not found" message.
   *   5. On other error: show a generic error message.
   *
   * REACTIVE-CYCLE GUARD:
   *   engine.loadCharacter() writes engine.character ($state). We do NOT read
   *   engine.character inside this effect — doing so would register it as a
   *   reactive dependency and cause an infinite re-run loop.
   */
  $effect(() => {
    const id = characterId;
    if (!id) return;

    loadState        = 'loading';
    rulesLoadInitiated = false; // allow rule sources to reload when ID changes

    storageManager.loadCharacterFromApi(id)
      .then(serverChar => {
        if (!serverChar) {
          // 404 / 403 — character does not exist or is not accessible.
          loadState = 'not_found';
          return;
        }

        engine.loadCharacter(serverChar);
        engine.registerCharacterInVault(serverChar);
        loadState = 'ready';

        // Load rule sources if not already loaded. Uses the character's campaign
        // sources when available (the campaign may enable extra rule files).
        if (!dataLoader.isLoaded && !rulesLoadInitiated) {
          rulesLoadInitiated = true;
          const camp = serverChar.campaignId
            ? campaignStore.getCampaign(serverChar.campaignId)
            : undefined;
          const enabledSources = camp?.enabledRuleSources ?? engine.settings.enabledRuleSources;
          getGmGlobalOverrides()
            .then(gmOverrides => dataLoader.loadRuleSources(enabledSources, gmOverrides))
            .then(() => engine.bumpDataLoaderVersion())
            .catch(err => {
              console.warn('[CharacterSheet] Failed to load rule sources:', err);
              rulesLoadInitiated = false;
            });
        }
      })
      .catch(err => {
        console.error('[CharacterSheet] Failed to load character:', err);
        loadState = 'error';
      });
  });

  // ===========================================================================
  // TAB NAVIGATION
  // ===========================================================================

  /**
   * Navigate to a tab by updating the `?tab=` query parameter in the URL.
   * `replaceState: true` avoids polluting browser history with tab switches.
   */
  function switchTab(tabKey: TabKey): void {
    goto(`/character/${characterId}?tab=${tabKey}`, { replaceState: true });
  }

  // ===========================================================================
  // DERIVED: Character level display
  // ===========================================================================

  /**
   * Total character level — sum of all class levels.
   * E.g. Fighter 5 / Wizard 3 → Level 8.
   *
   * Uses engine.phase0_characterLevel (which is the canonical reduce of classLevels)
   * rather than duplicating the formula here. Zero-game-logic-in-Svelte rule
   * (ARCHITECTURE.md §3).
   */
  const totalLevel = $derived(engine.phase0_characterLevel);

  // ===========================================================================
  // EXPLICIT SAVE
  // ===========================================================================

  /**
   * Save status for the Save button.
   * 'idle'         — waiting for user action
   * 'saving'       — PUT in flight
   * 'saved'        — last save succeeded
   * 'error'        — last save failed (message in saveErrorMessage)
   * 'conflict'     — server has a newer version (reload required)
   * 'rate_limited' — too many requests (try again later)
   */
  let saveStatus       = $state<'idle' | 'saving' | 'saved' | 'error' | 'conflict' | 'rate_limited'>('idle');
  let saveErrorMessage = $state('');

  async function handleManualSave() {
    saveStatus       = 'saving';
    saveErrorMessage = '';

    try {
      const newUpdatedAt = await storageManager.saveCharacterToApi(engine.character);
      // Update the in-memory character's updatedAt so the next save passes the
      // concurrency check without requiring a full reload.
      engine.setUpdatedAt(newUpdatedAt);
      saveStatus = 'saved';
      setTimeout(() => { saveStatus = 'idle'; }, 3000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          saveStatus = 'conflict';
        } else if (err.status === 429) {
          saveStatus = 'rate_limited';
          setTimeout(() => { saveStatus = 'idle'; }, 5000);
        } else {
          saveStatus       = 'error';
          saveErrorMessage = err.message;
          setTimeout(() => { saveStatus = 'idle'; }, 5000);
        }
      } else {
        saveStatus       = 'error';
        saveErrorMessage = err instanceof Error ? err.message : '';
        setTimeout(() => { saveStatus = 'idle'; }, 5000);
      }
    }
  }

  /** Reloads fresh data from the server. Used after a 409 Conflict. */
  function handleReload() {
    loadState  = 'loading';
    saveStatus = 'idle';
    const id   = characterId;
    if (!id) return;
    storageManager.loadCharacterFromApi(id)
      .then(char => {
        if (!char) { loadState = 'not_found'; return; }
        engine.loadCharacter(char);
        engine.registerCharacterInVault(char);
        loadState = 'ready';
      })
      .catch(() => { loadState = 'error'; });
  }
</script>

<!--
  CHARACTER SHEET ROOT

  `h-full` — fills the height of AppShell's <main> element exactly.
  `flex flex-col` — stacks header, tab-bar, and content vertically.
  `bg-surface` — theme-aware background (respects dark/light mode).
  `overflow-hidden` — prevents the sheet itself from scrolling; only the
    inner content area scrolls.
-->
<div class="h-full flex flex-col bg-surface overflow-hidden">

  <!-- =========================================================================
       CHARACTER HEADER
       Contains back navigation, character name, level, and NPC badge.
       `shrink-0` prevents this from being compressed when content is tall.
  ========================================================================= -->
  <header class="shrink-0 flex items-start justify-between gap-3 px-4 py-3 bg-surface border-b border-border">

    <div class="flex flex-col gap-0.5 min-w-0">

      <!-- Back link: returns to vault (if campaign known) or campaigns hub -->
      {#if engine.character.campaignId}
        <a
          href="/campaigns/{engine.character.campaignId}/vault"
          class="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors duration-150"
          aria-label={ui('character.back_vault_aria', engine.settings.language)}
        >
          <IconBack size={12} aria-hidden="true" />
          {ui('character.back_vault', engine.settings.language)}
        </a>
      {:else}
        <a
          href="/campaigns"
          class="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors duration-150"
          aria-label={ui('character.back_campaigns_aria', engine.settings.language)}
        >
          <IconBack size={12} aria-hidden="true" />
          {ui('character.back_campaigns', engine.settings.language)}
        </a>
      {/if}

      <!-- Character name + optional NPC badge -->
      <div class="flex items-center gap-2 min-w-0">
        <h1 class="text-xl font-bold text-text-primary truncate">
          {engine.character.name}
        </h1>
        {#if engine.character.isNPC}
          <span class="badge-red shrink-0" aria-label={ui('common.npc_aria', engine.settings.language)}>{ui('common.npc', engine.settings.language)}</span>
        {/if}
      </div>

      <!-- Level summary or placeholder when no class is selected -->
      {#if totalLevel > 0}
        <p class="text-xs text-text-muted">{ui('common.level', engine.settings.language)} {totalLevel}</p>
      {:else}
        <p class="text-xs text-text-muted italic">{ui('character.no_class', engine.settings.language)}</p>
      {/if}

    </div>

    <!-- Right side: save button + character ID chip -->
    <div class="flex items-start gap-2 shrink-0">
      {#if saveStatus === 'conflict'}
        <!-- Conflict banner: server has newer data — must reload before saving -->
        <div class="flex items-center gap-2">
          <span class="text-xs text-warning font-medium">{ui('common.save_conflict', engine.settings.language)}</span>
          <button
            class="btn-secondary text-xs px-3 py-2.5 min-h-[44px]"
            onclick={handleReload}
            type="button"
          >
            {ui('common.reload', engine.settings.language)}
          </button>
        </div>
      {:else}
        <button
          class="btn-primary text-xs px-3 py-2.5 gap-1 disabled:opacity-50 min-h-[44px]"
          class:btn-danger={saveStatus === 'error' || saveStatus === 'rate_limited'}
          onclick={handleManualSave}
          disabled={saveStatus === 'saving' || loadState !== 'ready'}
          aria-label={ui('character.save_aria', engine.settings.language)}
          type="button"
        >
          {#if saveStatus === 'saving'}{ui('common.saving', engine.settings.language)}
          {:else if saveStatus === 'saved'}<IconSuccess size={14} aria-hidden="true" />{ui('common.saved', engine.settings.language)}
          {:else if saveStatus === 'rate_limited'}{ui('common.save_rate_limited', engine.settings.language)}
          {:else if saveStatus === 'error'}{ui('common.save_error', engine.settings.language)}{#if saveErrorMessage} — {saveErrorMessage}{/if}
          {:else}{ui('common.save', engine.settings.language)}{/if}
        </button>
      {/if}

      <!-- Character ID chip (dev utility) -->
      <code
        class="self-start text-xs text-text-muted bg-surface-alt border border-border rounded px-2 py-0.5 font-mono"
        aria-label={ui('character.character_id_aria', engine.settings.language)}
        title="{ui('character.character_id_aria', engine.settings.language)}: {engine.character.id}"
      >{engine.character.id.slice(0, 10)}…</code>
    </div>

  </header>

  <!-- =========================================================================
       TAB NAVIGATION BAR
       `shrink-0` — always visible, never scrolls off screen.
       `overflow-x-auto scrollbar-none` — tabs scroll horizontally on narrow
         screens instead of wrapping or overflowing the layout.
  ========================================================================= -->
  <!--
    Tab bar: `scroll-snap-type: x mandatory` with `scroll-snap-align: start` on
    each button allows the user to swipe between tabs on mobile. The bar itself
    scrolls horizontally so all 6 tabs are reachable on small screens (320px).
  -->
  <div
    class="shrink-0 flex overflow-x-auto bg-surface border-b border-border snap-x snap-mandatory scrollbar-none"
    aria-label={ui('character.sheet_sections_aria', engine.settings.language)}
    role="tablist"
  >
    {#each TABS as tab}
      <!--
        TAB BUTTON
        Active state: accent underline (border-b-2 border-accent) + subtle
          accent background tint (bg-accent/5) + bold text.
        Inactive state: muted text, transparent border.
        Mobile: `md:gap-2` — icon + label on desktop, `md:` prefix shows label;
          on mobile (<md), the label is hidden (`hidden md:inline`) leaving only
          the icon. This keeps touch targets compact but still clear.
        Touch target: min-h-[44px] explicitly set (utility class takes precedence over
          the @layer base coarse-pointer rule in app.css, so we must set it directly
          here to guarantee 44px on touch devices per WCAG 2.1 SC 2.5.5).
      -->
      <button
        class="
          flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium
          border-b-2 whitespace-nowrap transition-colors duration-150
          min-h-[44px] snap-start
          {activeTab === tab.key
            ? 'border-accent text-accent bg-accent/5'
            : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-surface-alt'}
        "
        onclick={() => switchTab(tab.key)}
        role="tab"
        aria-selected={activeTab === tab.key}
        aria-controls="tab-panel-{tab.key}"
        id="tab-btn-{tab.key}"
        type="button"
        title={ui(tab.labelKey, engine.settings.language)}
      >
        <!--
          Icon: always shown (20px per nav convention).
          Label: hidden on mobile (<md), shown on tablet/desktop.
          This keeps each tab button ~44px wide on mobile (icon only)
          without cluttering the narrow screen.
        -->
        <tab.icon size={20} aria-hidden="true" />
        <span class="hidden md:inline">{ui(tab.labelKey, engine.settings.language)}</span>
      </button>
    {/each}
  </div>

  <!-- =========================================================================
       TAB CONTENT AREA
       `flex-1 overflow-y-auto` — fills remaining height, scrolls internally.
       `p-4 xl:p-6` — consistent padding; slightly more generous on wide screens.
       On desktop ≥1280px (xl), individual tab layouts use multi-column grids
       within their own components.

       The div is always present. Its contents switch between a loading/error
       placeholder and the real character sheet depending on `loadState`.
  ========================================================================= -->
  <div
    class="flex-1 overflow-y-auto p-4 xl:p-6"
    id="tab-panel-{activeTab}"
    role="tabpanel"
    aria-labelledby="tab-btn-{activeTab}"
  >

    <!-- Loading / not-found / error placeholders -->
    {#if loadState === 'loading'}
      <div class="flex items-center justify-center py-20 text-text-muted" aria-live="polite">
        <p class="text-sm">{ui('common.loading', engine.settings.language)}</p>
      </div>
    {:else if loadState === 'not_found'}
      <div class="flex flex-col items-center justify-center gap-2 py-20 text-center">
        <p class="font-semibold text-text-primary">{ui('character.not_found', engine.settings.language)}</p>
        <p class="text-sm text-text-muted">{ui('character.not_found_desc', engine.settings.language)}</p>
      </div>
    {:else if loadState === 'error'}
      <div class="flex flex-col items-center justify-center gap-2 py-20 text-center">
        <p class="font-semibold text-warning">{ui('common.error_unexpected', engine.settings.language)}</p>
      </div>
    {:else}
    <!-- loadState === 'ready' — show the character sheet tabs -->

    <!-- -----------------------------------------------------------------------
         CORE TAB (Phase 8)
         Single-column on mobile/tablet; 2-column grid on xl+ screens.
         Each sub-component is wrapped in a .card for consistent surface styling.
    ----------------------------------------------------------------------- -->
    {#if activeTab === 'core'}
      <div class="flex flex-col gap-4 xl:grid xl:grid-cols-2 xl:items-start">

        <!-- Left column on xl: BasicInfo + LoreAndLanguages -->
        <div class="flex flex-col gap-4">
          <BasicInfo />
          <LoreAndLanguages />
        </div>

        <!-- Right column on xl: Stats summaries stacked -->
        <div class="flex flex-col gap-4">
          <AbilityScoresSummary />
          <SavingThrowsSummary />
          <SkillsSummary />
        </div>

      </div>

    <!-- -----------------------------------------------------------------------
         ABILITIES & SKILLS TAB (Phase 9)
         Single-column on mobile; 2-column grid on xl+ (Ability Scores left,
         Saving Throws right, Skills Matrix full-width below).
    ----------------------------------------------------------------------- -->
    {:else if activeTab === 'abilities'}
      <div class="flex flex-col gap-4">

        <!-- Abilities + Saves in a responsive side-by-side on xl -->
        <div class="flex flex-col gap-4 xl:grid xl:grid-cols-2 xl:items-start">
          <AbilityScores />
          <SavingThrows />
        </div>

        <!-- Skills Matrix spans full width (needs horizontal scroll on mobile) -->
        <SkillsMatrix />

      </div>

    <!-- -----------------------------------------------------------------------
         COMBAT TAB (Phase 10)
         Mobile: single column.
         xl: 2-column grid — left (Health, AC, Core Combat),
                              right (Attacks, Movement, Resistances, DR).
    ----------------------------------------------------------------------- -->
    {:else if activeTab === 'combat'}
      <div class="flex flex-col gap-4 xl:grid xl:grid-cols-2 xl:items-start">

        <!-- Left column: vital stats -->
        <div class="flex flex-col gap-4">
          <!-- Action Budget Bar — shown only when conditions restrict actions (Extension F) -->
          <ActionBudgetBar />
          <!--
            Ephemeral Effects Panel (Phase E-3):
            Shows active effects from consumed potions/oils/one-shot items.
            Each card has an "Expire" button to dismiss the effect manually.
            Placed above HealthAndXP because active buffs are combat-critical info.
          -->
          <EphemeralEffectsPanel />
          <HealthAndXP />
          <ArmorClass />
          <CoreCombat />
        </div>

        <!-- Right column: offensive + movement + defenses -->
        <div class="flex flex-col gap-4">
          <Attacks />
          <MovementSpeeds />
          <Resistances />
          <DamageReduction />
        </div>

      </div>

    <!-- -----------------------------------------------------------------------
         FEATS TAB (Phase 11)
         FeatsTab is a self-contained component that handles its own layout.
    ----------------------------------------------------------------------- -->
    {:else if activeTab === 'feats'}
      <FeatsTab />

    <!-- -----------------------------------------------------------------------
         MAGIC TAB (Phase 12)
         Three stacked panels; each manages its own internal layout.
         On xl: Grimoire (catalog) left, CastingPanel right; SpecialAbilities below.
    ----------------------------------------------------------------------- -->
    {:else if activeTab === 'magic'}
      <div class="flex flex-col gap-4">

        <div class="flex flex-col gap-4 xl:grid xl:grid-cols-2 xl:items-start">
          <Grimoire />
          <CastingPanel />
        </div>

        <SpecialAbilities />

      </div>

    <!-- -----------------------------------------------------------------------
         INVENTORY TAB (Phase 13)
         InventoryTab is self-contained: it renders Equipped, Backpack sections
         AND internally includes <Encumbrance /> at the bottom. No need to
         render Encumbrance separately here — doing so would display it twice.
    ----------------------------------------------------------------------- -->
    {:else if activeTab === 'inventory'}
      <InventoryTab />

    <!-- -----------------------------------------------------------------------
         FALLBACK: Unknown tab key
         Defensive case: if someone navigates to ?tab=unknown, show a clear error.
    ----------------------------------------------------------------------- -->
    {:else}
      <div class="flex flex-col items-center justify-center gap-3 py-16 text-center text-text-muted">
        <!-- ui('character.unknown_tab_prefix') = 'Unknown tab:' / 'Onglet inconnu :' (zero-hardcoding rule, ARCHITECTURE.md §6) -->
        <p class="text-text-secondary font-medium">{ui('character.unknown_tab_prefix', engine.settings.language)} <code class="bg-surface-alt px-2 py-0.5 rounded text-sm">{activeTab}</code></p>
        <button
          class="btn-secondary"
          onclick={() => switchTab('core')}
          type="button"
        >
          {ui('character.go_to_core_tab', engine.settings.language)}
        </button>
      </div>
    {/if}

    <!--
      GM PER-CHARACTER OVERRIDES PANEL
      Visible only to GMs and Admins. Placed at the bottom of the scrollable
      tab content area so it is accessible regardless of which tab is active,
      without taking up prime real estate at the top of the sheet.
    -->
    {#if sessionContext.isGameMaster}
      <div class="mt-6 border-t border-border pt-4">
        <GmCharacterOverridesPanel />
      </div>
    {/if}

    {/if}
    <!-- end loadState === 'ready' -->

  </div>

</div>
