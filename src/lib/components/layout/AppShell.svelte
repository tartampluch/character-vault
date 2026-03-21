<!--
  @file src/lib/components/layout/AppShell.svelte
  @description Application shell wrapper — Phase 19.4.

  PURPOSE:
    The AppShell provides the global layout structure for every page in
    Character Vault. It renders the sidebar, the mobile top bar, and the
    scrollable content area, wiring them together with state and event handling.

  LAYOUT MODEL:
    ┌────────────────────────────────────────────────────┐
    │                DESKTOP (≥1024px)                   │
    │  ┌──────────┬─────────────────────────────────┐    │
    │  │ Sidebar  │   Main content area             │    │
    │  │ (fixed   │   (scrollable, takes remaining  │    │
    │  │  height) │    width via flex-1)             │    │
    │  └──────────┴─────────────────────────────────┘    │
    └────────────────────────────────────────────────────┘

    ┌────────────────────────────────────────────────────┐
    │                 MOBILE (<1024px)                   │
    │  ┌──────────────────────────────────────────────┐  │
    │  │  Top bar: [≡ Menu]  [Page title] [breadcrumb]│  │
    │  ├──────────────────────────────────────────────┤  │
    │  │  Main content area (full width, scrollable)  │  │
    │  └──────────────────────────────────────────────┘  │
    │                                                    │
    │  When hamburger tapped:                            │
    │  ┌──────────┐─────────────────────────────────┐   │
    │  │ Sidebar  │ Semi-transparent backdrop        │   │
    │  │ (fixed   │ (clicking it closes the drawer)  │   │
    │  │ overlay) │                                  │   │
    │  └──────────┘─────────────────────────────────┘   │
    └────────────────────────────────────────────────────┘

  STATE MANAGEMENT:
    - `sidebarCollapsed`: whether the sidebar is in icon-only mode.
      On first render: read from the `sidebar_collapsed` cookie.
      If no cookie: default to `false` (expanded) on desktop.
        On tablet (768px–1023px), CSS always forces icon-only regardless
        since Sidebar uses `lg:w-64`/`lg:w-16` — the cookie only affects ≥1024px.
      Written back to cookie on every toggle.

    - `mobileOpen`: whether the slide-in drawer overlay is open on mobile.
      Resets to `false` on route changes (see `$effect` block).
      Never persisted — always starts closed.

  COOKIE MANAGEMENT:
    Cookie name:    `sidebar_collapsed`
    Cookie format:  `'true'` or `'false'` (strings)
    Max-age:        1 year (31536000 seconds)
    SameSite/Path:  `Lax`, `path=/`

    Reading (on mount via onMount — requires browser API):
      If the cookie is absent, default to `false` (expanded).
    Writing (on toggle):
      Immediately written when the user collapses/expands.

  BREADCRUMB GENERATION:
    The current URL pathname is parsed into human-readable segments:
      `/campaigns/campaign_001/vault/vault`  →  ["Campaigns", "Reign of Winter", "Vault"]
    Known IDs (campaign, character) are resolved to their names via stores.
    Unknown segments are title-cased and deduped.

  MOBILE TOP BAR:
    Shown only at < 1024px (hidden with `lg:hidden`).
    Contains:
      1. Hamburger button — opens the mobile sidebar drawer
      2. Current page title (last breadcrumb segment)
      3. Breadcrumb trail (all segments except last) — displayed as grey text

  BACKDROP:
    When the mobile drawer is open, a semi-transparent overlay covers the
    content area. Clicking it triggers `onClose`, which sets `mobileOpen = false`.
    The backdrop is `z-30`, the sidebar is `z-40` (rendered on top).

  SLOT / CHILDREN:
    The main scrollable area contains a single `{@render children()}` slot.
    The CONTENT does NOT provide padding — each page/route is responsible for
    its own internal padding to support full-bleed hero images where needed.
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import Sidebar from './Sidebar.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { IconMenu } from '$lib/components/ui/icons';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------

  interface Props {
    /** Page content rendered inside the scrollable main area. */
    children: import('svelte').Snippet;
  }

  let { children }: Props = $props();

  // ---------------------------------------------------------------------------
  // SIDEBAR STATE
  // ---------------------------------------------------------------------------

  /**
   * Whether the sidebar is in icon-only (collapsed) mode.
   * On desktop: true → 64px wide, false → 256px wide.
   * On tablet: always icon-only regardless of this value (CSS handles it via
   *   Tailwind breakpoint classes in Sidebar.svelte).
   * Persisted in the `sidebar_collapsed` cookie.
   */
  let sidebarCollapsed = $state(false);

  /**
   * Whether the mobile slide-in drawer is currently open.
   * Resets to false on route changes (see $effect for pathname tracking).
   * Never persisted — drawer should always start closed on navigation.
   */
  let mobileOpen = $state(false);

  // ---------------------------------------------------------------------------
  // COOKIE HELPERS
  // ---------------------------------------------------------------------------

  /** Cookie name for the sidebar collapsed state. */
  const SIDEBAR_COOKIE = 'sidebar_collapsed';

  /** Cookie lifetime in seconds: 1 year. */
  const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

  /**
   * Read the sidebar_collapsed cookie value.
   * Returns `true` (collapsed) only when the cookie explicitly stores `'true'`.
   * Defaults to `false` (expanded) when the cookie is absent or invalid.
   */
  function readSidebarCookie(): boolean {
    if (typeof document === 'undefined') return false;
    const entries = document.cookie.split(';');
    for (const entry of entries) {
      const [key, value] = entry.trim().split('=');
      if (key === SIDEBAR_COOKIE) {
        return decodeURIComponent(value ?? '') === 'true';
      }
    }
    return false;
  }

  /**
   * Persist the sidebar collapsed state to a browser cookie.
   * @param collapsed - Whether the sidebar is now collapsed.
   */
  function writeSidebarCookie(collapsed: boolean): void {
    if (typeof document === 'undefined') return;
    document.cookie =
      `${SIDEBAR_COOKIE}=${encodeURIComponent(String(collapsed))}` +
      `; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  }

  // ---------------------------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------------------------

  /**
   * On mount (browser-only): read the cookie to restore the previous sidebar state.
   * Must happen in onMount because `document.cookie` is not available in SSR.
   */
  onMount(() => {
    sidebarCollapsed = readSidebarCookie();
  });

  // ---------------------------------------------------------------------------
  // EVENT HANDLERS
  // ---------------------------------------------------------------------------

  /**
   * Toggle the sidebar between expanded and collapsed.
   * Persists the new state to the cookie immediately.
   * Called by Sidebar's collapse button (desktop) and exposed as a prop.
   */
  function handleCollapse(): void {
    sidebarCollapsed = !sidebarCollapsed;
    writeSidebarCookie(sidebarCollapsed);
  }

  /**
   * Close the mobile sidebar drawer.
   * Called when:
   *   - The user taps the backdrop.
   *   - The user taps the X button inside the Sidebar.
   *   - Route navigation completes (see $effect below).
   */
  function handleClose(): void {
    mobileOpen = false;
  }

  /**
   * Open the mobile sidebar drawer (hamburger button).
   */
  function handleOpenMobile(): void {
    mobileOpen = true;
  }

  // ---------------------------------------------------------------------------
  // AUTO-CLOSE ON NAVIGATION
  // ---------------------------------------------------------------------------

  /**
   * Close the mobile drawer whenever the URL changes.
   *
   * WHY: When a user taps a link inside the sidebar drawer, the navigation
   * completes and the drawer should close automatically — just like standard
   * mobile navigation patterns (e.g., Bootstrap Offcanvas, Material Nav Drawer).
   *
   * SVELTE 5 NOTE: `$effect` with `$page.url.pathname` as a dependency runs
   * once when the component mounts (initial) and again on every pathname change.
   * We skip closing on the very first run by checking `mobileOpen` first.
   */
  $effect(() => {
    // Tracking the pathname registers it as a reactive dependency.
    const _path = $page.url.pathname;
    // Close only if it's actually open (avoids unnecessary state writes).
    if (mobileOpen) {
      mobileOpen = false;
    }
  });

  // ---------------------------------------------------------------------------
  // BREADCRUMB DERIVATION
  // ---------------------------------------------------------------------------

  /**
   * Segment display name mapping for well-known URL segments.
   * These are human-readable labels for non-ID path parts.
   */
  const SEGMENT_LABELS: Record<string, string> = {
    campaigns:    'Campaigns',
    vault:        'Vault',
    settings:     'Settings',
    'gm-dashboard': 'GM Dashboard',
    character:    'Character',
    rules:        'Rules',
  };

  /**
   * Convert a URL segment to a human-readable label.
   *
   * Resolution order:
   *   1. Known segment names → from SEGMENT_LABELS map above.
   *   2. If the segment looks like a campaign ID → resolve to campaign title.
   *   3. If the segment looks like a character ID → resolve to character name.
   *   4. Otherwise → title-case the raw segment (dash/underscore separators).
   *
   * @param segment - A single URL path segment (no slashes).
   * @returns Human-readable label.
   */
  function resolveSegment(segment: string): string {
    if (!segment) return '';
    // 1. Known static labels
    if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
    // 2. Campaign ID — try to look up in campaignStore
    const campaign = campaignStore.getCampaign(segment);
    if (campaign) return campaign.title;
    // 3. Character ID — check engine's active character
    if (engine.activeCharacterId === segment && engine.character.name) {
      return engine.character.name;
    }
    // 4. Fallback: title-case the raw segment
    return segment
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Build the breadcrumb array from the current URL.
   *
   * Steps:
   *   1. Split pathname on `/` → filter empty strings.
   *   2. Map each segment to a human-readable label via `resolveSegment`.
   *   3. Deduplicate consecutive identical labels (e.g., "/vault/vault" shouldn't
   *      show "Vault > Vault").
   *
   * Example:
   *   `/campaigns/campaign_001/vault`
   *   → ['Campaigns', 'Reign of Winter', 'Vault']
   */
  const breadcrumbs = $derived(
    $page.url.pathname
      .split('/')
      .filter(Boolean)
      .map(resolveSegment)
      .filter((label, i, arr) => label && label !== arr[i - 1]) // deduplicate
  );

  /** Current page title: the last breadcrumb segment. */
  const pageTitle = $derived(breadcrumbs[breadcrumbs.length - 1] ?? 'Character Vault');

  /** Ancestor breadcrumbs: all segments except the last. */
  const ancestorCrumbs = $derived(breadcrumbs.slice(0, -1));
</script>

<!--
  APP SHELL ROOT

  The outermost container is a full-viewport flex row (sidebar | content).
  `h-screen overflow-hidden` ensures the overall page does not scroll —
  only the content area inside scrolls.

  On mobile (< lg): the sidebar is a fixed overlay, so it doesn't participate
  in the flex layout. The content area fills the full width.
-->
<div class="flex h-screen overflow-hidden bg-surface">

  <!-- ========================================================================
       SIDEBAR
       Rendered as a flex-column child on desktop; fixed overlay on mobile.
       All state (collapsed, mobileOpen) and callbacks are passed as props.
  ======================================================================== -->
  <Sidebar
    collapsed={sidebarCollapsed}
    mobileOpen={mobileOpen}
    onCollapse={handleCollapse}
    onClose={handleClose}
  />

  <!-- ========================================================================
       MOBILE BACKDROP
       Semi-transparent overlay that appears BEHIND the open sidebar drawer
       but OVER the main content. Clicking it closes the drawer.

       Only rendered when the mobile drawer is open.
       `z-30` = below sidebar (z-40) but above content (no z-index).
       `transition-opacity duration-200` fades in/out smoothly.
  ======================================================================== -->
  {#if mobileOpen}
    <div
      class="fixed inset-0 z-30 bg-black/50 lg:hidden"
      onclick={handleClose}
      onkeydown={(e) => e.key === 'Escape' && handleClose()}
      role="button"
      tabindex="0"
      aria-label="Close navigation"
    ></div>
  {/if}

  <!-- ========================================================================
       MAIN CONTENT AREA
       Takes all remaining horizontal space via `flex-1 min-w-0`.
       `min-w-0` prevents the flex child from overflowing its container when
       the content is wide (without it, flex children default to `min-width: auto`
       which can cause horizontal scroll).
  ======================================================================== -->
  <div class="flex flex-col flex-1 min-w-0 overflow-hidden">

    <!-- ======================================================================
         MOBILE TOP BAR
         Shown only on mobile/tablet (hidden at lg+ breakpoint where the sidebar
         is visible and takes over the navigation role).

         Contains three zones (left / center / right):
           Left:   Hamburger button to open the sidebar drawer
           Center: Page title (last breadcrumb segment) + ancestor breadcrumbs
           Right:  Reserved for future actions (notifications, quick settings)
    ====================================================================== -->
    <header
      class="
        lg:hidden
        flex items-center gap-2 px-3 h-12
        bg-surface border-b border-border
        shrink-0
      "
      aria-label="Mobile navigation bar"
    >

      <!-- Hamburger: opens the mobile sidebar drawer -->
      <button
        class="btn-ghost p-2 -ml-1 shrink-0"
        onclick={handleOpenMobile}
        title="Open navigation"
        aria-label="Open navigation"
        aria-expanded={mobileOpen}
        aria-controls="sidebar"
        type="button"
      >
        <IconMenu size={20} aria-hidden="true" />
      </button>

      <!-- Page title + optional breadcrumb trail -->
      <div class="flex-1 min-w-0 flex items-baseline gap-1 overflow-hidden">
        {#if ancestorCrumbs.length > 0}
          <!--
            Ancestor breadcrumbs — shown before the current page title.
            Truncated with `overflow-hidden` to prevent horizontal overflow.
            Each segment ends with a › character separator.
          -->
          <nav class="flex items-center gap-1 text-xs text-text-muted truncate" aria-label="Breadcrumb">
            {#each ancestorCrumbs as crumb, i}
              <span class="truncate">{crumb}</span>
              {#if i < ancestorCrumbs.length - 1}
                <span class="shrink-0" aria-hidden="true">›</span>
              {/if}
              <span class="shrink-0" aria-hidden="true">›</span>
            {/each}
          </nav>
        {/if}
        <!-- Current page title -->
        <h1 class="text-sm font-semibold text-text-primary truncate">{pageTitle}</h1>
      </div>

    </header>

    <!-- ======================================================================
         SCROLLABLE CONTENT AREA
         `flex-1 overflow-y-auto` fills remaining height and enables vertical
         scrolling for long pages. Content components add their own padding.
         `focus:outline-none` prevents a focus ring on the container itself
         (the main element is not interactive).
    ====================================================================== -->
    <main class="flex-1 overflow-y-auto" id="main-content">
      {@render children()}
    </main>

  </div>

</div>
