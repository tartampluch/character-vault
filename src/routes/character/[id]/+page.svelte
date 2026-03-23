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
  import { storageManager } from '$lib/engine/StorageManager';

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
    IconBack,
  } from '$lib/components/ui/icons';

  // ===========================================================================
  // TABS DEFINITION
  // Data-driven tab list — zero hardcoded D&D terms (spec rule §6).
  // ===========================================================================

  const TABS = [
    { key: 'core',      label: 'Core',      icon: IconTabCore      },
    { key: 'abilities', label: 'Abilities', icon: IconTabAbilities },
    { key: 'combat',    label: 'Combat',    icon: IconTabCombat    },
    { key: 'feats',     label: 'Feats',     icon: IconTabFeats     },
    { key: 'magic',     label: 'Magic',     icon: IconTabMagic     },
    { key: 'inventory', label: 'Inventory', icon: IconTabInventory },
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
  // CHARACTER LOADING
  // ===========================================================================

  /**
   * Loads the character whenever the URL ID changes.
   *
   * Priority:
   *   1. In-memory vault list (already loaded — zero I/O, fastest path).
   *   2. StorageManager (localStorage / PHP API fallback).
   *   3. Blank character (graceful degradation for direct URL access).
   *
   * Phase 14.6 integration note: StorageManager already wraps both localStorage
   * and the PHP API. No changes needed here when switching to PHP.
   */
  $effect(() => {
    const id = characterId;
    if (!id) return;

    const fromVault = engine.allVaultCharacters.find(c => c.id === id);
    if (fromVault) {
      engine.loadCharacter(fromVault);
      return;
    }

    const fromStorage = storageManager.loadCharacter(id);
    if (fromStorage) {
      engine.loadCharacter(fromStorage);
      if (!engine.allVaultCharacters.some(c => c.id === id)) {
        engine.allVaultCharacters.push(fromStorage);
      }
      return;
    }

    console.warn(`[CharacterSheet] Character "${id}" not found. Creating blank.`);
    engine.loadCharacter(createEmptyCharacter(id, 'Unknown Character'));
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
   */
  const totalLevel = $derived(
    Object.values(engine.character.classLevels).reduce((a, b) => a + b, 0)
  );
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
          aria-label="Back to Character Vault"
        >
          <IconBack size={12} aria-hidden="true" />
          Vault
        </a>
      {:else}
        <a
          href="/campaigns"
          class="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors duration-150"
          aria-label="Back to campaigns"
        >
          <IconBack size={12} aria-hidden="true" />
          Campaigns
        </a>
      {/if}

      <!-- Character name + optional NPC badge -->
      <div class="flex items-center gap-2 min-w-0">
        <h1 class="text-xl font-bold text-text-primary truncate">
          {engine.character.name}
        </h1>
        {#if engine.character.isNPC}
          <span class="badge-red shrink-0" aria-label="Non-player character">NPC</span>
        {/if}
      </div>

      <!-- Level summary or placeholder when no class is selected -->
      {#if totalLevel > 0}
        <p class="text-xs text-text-muted">Level {totalLevel}</p>
      {:else}
        <p class="text-xs text-text-muted italic">No class selected yet</p>
      {/if}

    </div>

    <!-- Character ID chip (dev utility — always visible for debugging) -->
    <code
      class="shrink-0 self-start text-xs text-text-muted bg-surface-alt border border-border rounded px-2 py-0.5 font-mono"
      aria-label="Character ID"
      title="Character ID: {engine.character.id}"
    >
      {engine.character.id.slice(0, 10)}…
    </code>

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
    class="shrink-0 flex overflow-x-auto bg-surface border-b border-border"
    style="scrollbar-width: none; scroll-snap-type: x mandatory;"
    aria-label="Character sheet sections"
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
        Touch target: min-h-[44px] via the @media rule in app.css for coarse pointers.
      -->
      <button
        class="
          flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium
          border-b-2 whitespace-nowrap transition-colors duration-150
          min-h-[40px] snap-start
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
        title={tab.label}
      >
        <!--
          Icon: always shown (20px per nav convention).
          Label: hidden on mobile (<md), shown on tablet/desktop.
          This keeps each tab button ~44px wide on mobile (icon only)
          without cluttering the narrow screen.
        -->
        <tab.icon size={20} aria-hidden="true" />
        <span class="hidden md:inline">{tab.label}</span>
      </button>
    {/each}
  </div>

  <!-- =========================================================================
       TAB CONTENT AREA
       `flex-1 overflow-y-auto` — fills remaining height, scrolls internally.
       `p-4 xl:p-6` — consistent padding; slightly more generous on wide screens.
       On desktop ≥1280px (xl), individual tab layouts use multi-column grids
       within their own components.
  ========================================================================= -->
  <div
    class="flex-1 overflow-y-auto p-4 xl:p-6"
    id="tab-panel-{activeTab}"
    role="tabpanel"
    aria-labelledby="tab-btn-{activeTab}"
  >

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
        <p class="text-text-secondary font-medium">Unknown tab: <code class="bg-surface-alt px-2 py-0.5 rounded text-sm">{activeTab}</code></p>
        <button
          class="btn-secondary"
          onclick={() => switchTab('core')}
          type="button"
        >
          Go to Core tab
        </button>
      </div>
    {/if}

  </div>

</div>
