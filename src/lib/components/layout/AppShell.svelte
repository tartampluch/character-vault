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
  import { afterNavigate } from '$app/navigation';
  import Sidebar from './Sidebar.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { loadUiLocale, loadUiLocaleFromCache, ui } from '$lib/i18n/ui-strings';
  import { readLanguageCookie } from '$lib/utils/languageCookie';
  import { IconMenu, IconLoading } from '$lib/components/ui/icons';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------

  interface Props {
    /** Page content rendered inside the scrollable main area. */
    children: import('svelte').Snippet;
  }

  let { children }: Props = $props();

  // ---------------------------------------------------------------------------
  // LOCALE INITIALISATION — synchronous pre-render restore
  // ---------------------------------------------------------------------------
  //
  // SSR is disabled for this app (see src/routes/+layout.ts). This script block
  // therefore always runs in a real browser, where document.cookie and
  // localStorage are both available.
  //
  // The block runs once, synchronously, before Svelte produces the first paint.
  // AppShell wraps every page component AND the Sidebar, so setting
  // engine.settings.language here means ALL child components' initial render
  // already uses the correct language.
  //
  // Warm cache  (cv_locale_<code> in localStorage, < 24 h old):
  //   loadUiLocaleFromCache() restores the locale synchronously →
  //   localeReady = true → first paint is in the user's language, zero flash.
  //
  // Cold cache  (first ever load, or expired):
  //   localeReady = false → spinner shown → onMount fetches the locale file →
  //   sets language → localeReady = true → content renders in correct language.
  //
  const _storedLang = readLanguageCookie();
  const _cacheHit   = _storedLang === 'en' || loadUiLocaleFromCache(_storedLang);
  if (_cacheHit && _storedLang !== 'en') {
    engine.settings.language = _storedLang;
  }

  /**
   * Gates all content rendering until locale strings are loaded.
   * Starts `true` on a warm cache hit; `false` on a cold start (shows spinner).
   */
  let localeReady = $state(_cacheHit);

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
   * On mount (browser-only): restore sidebar state and ensure the correct locale
   * is applied before releasing the rendering gate.
   *
   * SEQUENCE (SSR is disabled, so this always runs in a real browser):
   *
   *   1. Sidebar cookie — fast synchronous read, no async needed.
   *
   *   2. Locale gate — cold start only (warm start already set language + gate
   *      in the synchronous script block above via loadUiLocaleFromCache):
   *        • fetch /locales/{code}.json
   *        • set engine.settings.language
   *
   *   3. localeReady = true — releases the {#if !localeReady} spinner gate so
   *      content renders for the first time (cold) or is already visible (warm,
   *      this is a no-op state write).
   *
   *   4. External locales (background, fire-and-forget) — discovers server-dropped
   *      locale files so they appear in the language dropdown.  This does NOT block
   *      content rendering; the dropdown just updates a moment later.
   *      Also triggers a stale-while-revalidate refresh of the active locale cache.
   */
  onMount(async () => {
    sidebarCollapsed = readSidebarCookie();

    // Cold start only: locale wasn't in localStorage cache — fetch it first so
    // the first render is in the correct language, not English.
    if (_storedLang !== 'en' && !_cacheHit) {
      await loadUiLocale(_storedLang);
      engine.settings.language = _storedLang;
    }

    // Release the rendering gate.
    localeReady = true;

    // Background: discover server-dropped locale files (populates the language
    // dropdown) and silently revalidate the active locale cache.
    // Fire-and-forget — content is already rendering above.
    dataLoader.loadExternalLocales().then(() => {
      engine.bumpLocalesVersion();
      // Stale-while-revalidate: refresh the cached locale strings quietly.
      if (_storedLang !== 'en') loadUiLocale(_storedLang);
    });
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
  //   AUTO-CLOSE AND SCROLL RESET ON NAVIGATION
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

  /**
   * Reset the main content scroll position to the top after every navigation.
   *
   * WHY: SvelteKit's built-in scroll restoration targets `window.scrollY`, but
   * this app uses a custom scroll container (`<main id="main-content">` with
   * `overflow-y-auto`) instead of body scroll. Without this hook, navigating
   * between pages leaves `main.scrollTop` at its previous value, making the
   * new page's content appear "below" the visible area rather than replacing it.
   *
   * WHY SYNCHRONOUS (no await tick())?
   *   afterNavigate fires AFTER the new page has been fully mounted and all
   *   synchronous Svelte effects have run. Resetting scrollTop synchronously
   *   here means the reset happens BEFORE the browser has a chance to paint the
   *   intermediate scroll state. If the callback were async (await tick()), the
   *   async suspension would let the browser paint one frame at the old scroll
   *   position — visually showing the new page "below" the old content — before
   *   the reset fires. The synchronous version is paint-safe.
   */
  afterNavigate(() => {
    const mainEl = document.getElementById('main-content');
    if (mainEl) mainEl.scrollTop = 0;
  });

  // ---------------------------------------------------------------------------
  // BREADCRUMB DERIVATION
  // ---------------------------------------------------------------------------

  /**
   * Segment display name mapping for well-known URL segments.
   * These are human-readable labels for non-ID path parts.
   */
  const SEGMENT_LABELS = $derived<Record<string, string>>({
    campaigns:    ui('nav.campaigns',   engine.settings.language),
    vault:        ui('nav.vault',       engine.settings.language),
    settings:     ui('nav.settings',    engine.settings.language),
    'gm-dashboard': ui('nav.gm_dashboard', engine.settings.language),
    character:    ui('nav.character',   engine.settings.language),
    rules:        ui('nav.rules',       engine.settings.language),
  });

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

  /**
   * Whether the current page is an authentication page (/login, /setup-password).
   * On auth pages, the sidebar is hidden — users are not yet logged in.
   */
  const isAuthPage = $derived(
    $page.url.pathname.startsWith('/login') ||
    $page.url.pathname.startsWith('/setup-password')
  );
</script>

<!--
  APP SHELL ROOT

  When the locale is not yet loaded (cold start — no localStorage cache),
  the entire UI is replaced with a centred spinner so the user never sees a
  flash of untranslated English content.

  On a warm cache hit (subsequent page loads), localeReady is already true
  when this component first renders, so the spinner is never painted.
-->
{#if !localeReady}
  <!-- ── LOCALE LOADING SPINNER ───────────────────────────────────────────── -->
  <!--
    Uses IconLoading (Lucide's LoaderCircle) per Phase 19.3 icon convention:
    all icons must be imported as Svelte components, not raw SVG strings.
    animate-spin applies a CSS rotation animation; text-accent sets the stroke
    color via currentColor inheritance.
  -->
  <div class="flex h-screen items-center justify-center bg-surface" aria-label="Loading…" aria-live="polite">
    <IconLoading size={36} class="animate-spin text-accent" aria-hidden="true" />
  </div>
{:else}

<!--
  The outermost container is a full-viewport flex row (sidebar | content).
  `h-screen overflow-hidden` ensures the overall page does not scroll —
  only the content area inside scrolls.

  On mobile (< lg): the sidebar is a fixed overlay, so it doesn't participate
  in the flex layout. The content area fills the full width.
-->
<div class="flex h-screen overflow-hidden bg-surface">

  <!-- ========================================================================
       SIDEBAR
       Hidden on auth pages (/login, /setup-password).
       Rendered as a flex-column child on desktop; fixed overlay on mobile.
       All state (collapsed, mobileOpen) and callbacks are passed as props.
  ======================================================================== -->
  {#if !isAuthPage}
  <Sidebar
    collapsed={sidebarCollapsed}
    mobileOpen={mobileOpen}
    onCollapse={handleCollapse}
    onClose={handleClose}
  />
  {/if}

  <!-- ========================================================================
       MOBILE BACKDROP
       Semi-transparent overlay that appears BEHIND the open sidebar drawer
       but OVER the main content. Clicking it closes the drawer.

       Only rendered when the mobile drawer is open.
       `z-30` = below sidebar (z-40) but above content (no z-index).
       `transition-opacity duration-200` fades in/out smoothly.
  ======================================================================== -->
  {#if mobileOpen}
    <!-- Backdrop is only rendered on mobile (<768px). At tablet (768–1023px) the
         sidebar is always visible as an inline column, so no backdrop is needed. -->
    <div
      class="fixed inset-0 z-30 bg-black/50 md:hidden"
      onclick={handleClose}
      onkeydown={(e) => e.key === 'Escape' && handleClose()}
      role="button"
      tabindex="0"
      aria-label={ui('nav.close_navigation', engine.settings.language)}
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
         Shown only on mobile (<768px) and only when NOT on an auth page.
         On auth pages (login, setup-password), there is no navigation to show.
    ====================================================================== -->
    {#if !isAuthPage}
    <header
      class="
        md:hidden
        flex items-center gap-2 px-3 h-12
        bg-surface border-b border-border
        shrink-0
      "
      aria-label={ui('nav.mobile_nav_aria', engine.settings.language)}
    >

      <!-- Hamburger: opens the mobile sidebar drawer -->
      <button
        class="btn-ghost p-2 -ml-1 shrink-0"
        onclick={handleOpenMobile}
        title={ui('nav.open_navigation', engine.settings.language)}
        aria-label={ui('nav.open_navigation', engine.settings.language)}
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
            {#each ancestorCrumbs as crumb}
              <span class="truncate">{crumb}</span>
              <!--
                Separator between each ancestor crumb AND between the last ancestor
                and the current page title. A single unconditional `›` per crumb
                achieves this cleanly:
                  1 ancestor:  "Campaigns ›" + "Vault"
                  2 ancestors: "Campaigns ›" + "Realm Name ›" + "Vault"
                Previously there was an additional {#if i < length-1} block that
                rendered a SECOND separator for all non-last ancestors, producing
                e.g. "Campaigns ›› Realm Name ›" (double chevron). Removed.
              -->
              <span class="shrink-0" aria-hidden="true">›</span>
            {/each}
          </nav>
        {/if}
        <!-- Current page title -->
        <h1 class="text-sm font-semibold text-text-primary truncate">{pageTitle}</h1>
      </div>

    </header>
    {/if}

    <!-- ======================================================================
         SCROLLABLE CONTENT AREA
         `flex-1 overflow-y-auto` fills remaining height and enables vertical
         scrolling for long pages. Content components add their own padding.
         `focus:outline-none` prevents a focus ring on the container itself
         (the main element is not interactive).
    ====================================================================== -->
    <main class="flex-1 overflow-y-auto" id="main-content">
      <!--
        {#key $page.url.pathname} — WHY THIS IS REQUIRED

        In the version of Svelte 5 used by this project, changing the snippet
        prop passed to {@render children()} does NOT automatically destroy the
        previously rendered DOM before mounting the new one. Instead the new
        page's DOM is appended after the old one, causing every page since the
        initial /campaigns visit to stack vertically in the content area.

        {#key expression} is the explicit Svelte primitive for "destroy the
        entire subtree when the key changes and create a fresh one". Keying on
        the URL pathname means every client-side navigation tears down the
        previous page component tree and mounts the new one cleanly — exactly
        the unmount/remount cycle that {@render children()} alone was failing
        to perform.

        WHY pathname AND NOT the full URL (including search/hash)?
        · Tab switches on the character sheet use goto(url, { replaceState: true })
          where only the ?tab=… query param changes. The pathname stays the same,
          so {#key} does NOT re-mount on tab changes — component state is preserved.
        · True navigations (/campaigns → /campaigns/[id] → /vault → /character/…)
          all change the pathname, so they always get a clean mount.
      -->
      {#key $page.url.pathname}
        {@render children()}
      {/key}
    </main>

  </div>

</div>

{/if}<!-- localeReady -->
