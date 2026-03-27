<!--
  @file src/lib/components/layout/Sidebar.svelte
  @description Application navigation sidebar — Phase 19.4.

  RESPONSIVE BEHAVIOR:
    Desktop (≥1024px):
      - Sits as a fixed-height left column in the AppShell flex row.
      - Default state: EXPANDED — shows icon (20px) + text label.
      - Collapse button (left-pointing chevrons) shrinks to ICON-ONLY mode (64px wide).
      - The preference is persisted in the `sidebar_collapsed` cookie.

    Tablet (768px–1023px):
      - Same layout as desktop but ALWAYS icon-only (no collapse toggle needed;
        it would collapse to the same state anyway). Cookie is still honoured so
        that returning to desktop preserves the user's choice.

    Mobile (<768px):
      - The sidebar is rendered but HIDDEN by default (`-translate-x-full`).
      - When `mobileOpen` is true (set by AppShell's hamburger button), it slides
        in as an overlay drawer from the left, covering the content underneath.
      - A semi-transparent backdrop is rendered by AppShell (not here) to allow
        tap-outside-to-close behaviour.

  NAVIGATION LINKS:
    All links are derived from the current SvelteKit `$page` state to highlight
    the active route with an accent indicator. Links that require context
    (Vault, Character, GM tools) are shown conditionally.

    Link visibility rules:
      1. Campaigns — always visible
      2. Vault — visible only when `activeCampaignId` is set
      3. Character Sheet — visible when `engine.activeCharacterId` is set
      4. GM Dashboard — visible only when `activeCampaignId` is set AND `isGameMaster`
      5. Settings — visible only when `activeCampaignId` is set AND `isGameMaster`

  ACTIVE STATE:
    A nav link is "active" when `page.url.pathname` starts with the link's href.
    Active links receive: accent-tinted background + left border accent line.

  SLOT POSITIONS:
    - Top: App logo/title
    - Middle: Navigation links (vertically scrollable if many)
    - Bottom (pinned): ThemeToggle + user/session info

  PROPS:
    collapsed  — whether icon-only mode is active (desktop/tablet)
    mobileOpen — whether the mobile drawer is open (mobile)
    onCollapse — callback to toggle collapsed state (desktop only)
    onClose    — callback to close the mobile drawer

  WHY PROPS INSTEAD OF INTERNAL STATE?
    AppShell owns the sidebar state (collapsed + mobileOpen) because:
      - AppShell manages the cookie read/write for initial state.
      - AppShell renders the mobile backdrop (outside the sidebar DOM node).
      - AppShell adjusts the content margin based on sidebar width.
    Sidebar is thus a pure "presentational" component driven by props.
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { ui, loadUiLocale } from '$lib/i18n/ui-strings';
  import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
  import {
    IconCampaign,
    IconVault,
    IconCharacter,
    IconGMDashboard,
    IconEdit,
    IconSettings,
    IconCollapse,
    IconExpand,
    IconClose,
    IconHome,
    IconAdmin,
    IconKey,
  } from '$lib/components/ui/icons';
  import ChangePasswordModal from '$lib/components/admin/ChangePasswordModal.svelte';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------

  interface Props {
    /** Icon-only mode (desktop/tablet). When true, labels are hidden. */
    collapsed: boolean;
    /** Mobile-only: whether the slide-in drawer is open. */
    mobileOpen: boolean;
    /** Called when the user clicks the collapse/expand toggle (desktop). */
    onCollapse: () => void;
    /** Called when the user closes the mobile drawer (X button or backdrop). */
    onClose: () => void;
  }

  let { collapsed, mobileOpen, onCollapse, onClose }: Props = $props();

  // ---------------------------------------------------------------------------
  // MOBILE VIEWPORT TRACKING (for `inert` attribute)
  // ---------------------------------------------------------------------------

  /**
   * Tracks whether the viewport is below the `lg` breakpoint (1024px).
   * Used to determine tablet mode (768–1023px) for sidebar behavior.
   */
  let isBelowLg = $state(false);

  /**
   * Tracks whether the viewport is below the `md` breakpoint (768px), i.e. mobile.
   * On mobile, the sidebar is a hidden overlay drawer — it should be `inert` when
   * closed to prevent keyboard users from Tab-navigating into invisible links.
   * At tablet (768–1023px), the sidebar is always visible as an icon-only column,
   * so `inert` must NOT be set there.
   */
  let isBelowMd = $state(false);

  $effect(() => {
    if (typeof window === 'undefined') return;

    // lg breakpoint: 1024px
    const mqlLg = window.matchMedia('(max-width: 1023.98px)');
    isBelowLg = mqlLg.matches;
    const handlerLg = (e: MediaQueryListEvent) => { isBelowLg = e.matches; };
    mqlLg.addEventListener('change', handlerLg);

    // md breakpoint: 768px
    const mqlMd = window.matchMedia('(max-width: 767.98px)');
    isBelowMd = mqlMd.matches;
    const handlerMd = (e: MediaQueryListEvent) => { isBelowMd = e.matches; };
    mqlMd.addEventListener('change', handlerMd);

    return () => {
      mqlLg.removeEventListener('change', handlerLg);
      mqlMd.removeEventListener('change', handlerMd);
    };
  });

  /**
   * When true, the `inert` attribute is applied to the sidebar `<aside>` element.
   * Only mobile (<768px) requires `inert` — the drawer is hidden off-screen there.
   * At tablet (768–1023px) the sidebar is always visible (inline column), so never inert.
   */
  const shouldBeInert = $derived(isBelowMd && !mobileOpen);

  /**
   * Whether the sidebar should behave as icon-only (no labels visible).
   * True when:
   *  - `collapsed` prop is true (user explicitly collapsed on desktop), OR
   *  - viewport is tablet (768–1023px), where the sidebar is always icon-only.
   * This derived value is used in the template instead of raw `collapsed` to ensure
   * labels are never shown at tablet width even if the `collapsed` cookie is false.
   */
  const isTablet = $derived(isBelowLg && !isBelowMd);
  const effectivelyCollapsed = $derived(collapsed || isTablet);

  // ---------------------------------------------------------------------------
  // DERIVED VALUES
  // ---------------------------------------------------------------------------

  /**
   * The current URL pathname — used to highlight the active navigation link.
   * Svelte 5 reactivity: `$page` is a store; `$page.url.pathname` auto-tracks.
   */
  const pathname = $derived($page.url.pathname);

  /**
   * Campaign context: the active campaign ID from the session.
   * When null, campaign-scoped links (Vault, GM tools) are hidden.
   */
  const campaignId = $derived(sessionContext.activeCampaignId);

  /**
   * The active campaign object — used to display the campaign name in nav links.
   * `getCampaign()` returns `undefined` if `campaignId` is null or not found.
   */
  const activeCampaign = $derived(
    campaignId ? campaignStore.getCampaign(campaignId) : undefined
  );

  /**
   * The active character ID from the engine.
   * Drives the "Character Sheet" nav link visibility.
   */
  const characterId = $derived(engine.activeCharacterId);

  // Change Password modal state — accessible from the sidebar footer.
  let showChangePasswordModal = $state(false);

  /**
   * Whether the current user is a Game Master.
   * Controls GM-only link visibility (GM Dashboard, Settings).
   */
  const isGM = $derived(sessionContext.isGameMaster);

  // ---------------------------------------------------------------------------
  // SIDEBAR ROOT CLASSES
  // ---------------------------------------------------------------------------

  /**
   * Compute the aside element's class string.
   *
   * On mobile (< lg): fixed overlay drawer. Translation based on `mobileOpen`.
   * On desktop (lg+): normal flow column, width switches on `collapsed`.
   * `transition-all duration-200` animates both the width change (desktop) and
   * the translate transition (mobile).
   */
  const asideClass = $derived(
    [
      // Base layout and visual styles
      'flex flex-col h-screen bg-surface border-r border-border',
      'overflow-x-hidden overflow-y-auto',
      'transition-all duration-200 ease-in-out shrink-0',
      // Mobile (<768px): fixed overlay drawer
      'fixed inset-y-0 left-0 z-40',
      // Mobile: reveal/hide via translate
      mobileOpen ? 'translate-x-0 w-64 shadow-xl' : '-translate-x-full w-64',
      // Tablet (768–1023px): always-visible icon-only column (md overrides fixed/translate).
      // w-16 = 64px, always icon-only at this breakpoint regardless of `collapsed` cookie.
      'md:relative md:translate-x-0 md:shadow-none md:w-16',
      // Desktop (≥1024px): override tablet — normal flow, width depends on collapsed state.
      // lg:w-16 / lg:w-64 override md:w-16 at desktop.
      'lg:relative lg:translate-x-0 lg:shadow-none',
      collapsed ? 'lg:w-16' : 'lg:w-64',
    ].join(' ')
  );

  // ---------------------------------------------------------------------------
  // NAVIGATION LINK HELPER
  // ---------------------------------------------------------------------------

  /**
   * Determines whether a nav link should be highlighted as "active".
   *
   * A link is active when the current pathname starts with the link's href.
   * This "starts-with" approach correctly highlights parent routes when viewing
   * child routes (e.g., `/campaigns` is active when viewing `/campaigns/123/vault`).
   *
   * Exception: The root `/` link must be an exact match to avoid being always active.
   *
   * @param href - The navigation target path.
   * @returns True when the link should be styled as active.
   */
  function isActive(href: string): boolean {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  /**
   * Shared CSS classes for each navigation link.
   *
   * Base state: ghost button — icon + label in rest state.
   * Active state: accent-tinted background + left accent border.
   * Collapsed: when `collapsed` is true, the label span is hidden via CSS,
   * and the link becomes a narrow icon-only button (no overflow).
   *
   * @param href - The href to check against current pathname.
   * @returns The appropriate Tailwind class string.
   */
  function navLinkClass(href: string): string {
    const base =
      'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ' +
      // min-h-[44px] satisfies WCAG 2.5.5 on coarse-pointer devices.
      // The global `@media (pointer: coarse)` anchor rule excludes links that contain
      // `text-*` classes (to spare pure inline text links from getting 44px height).
      // Nav links intentionally carry `text-sm`, so we must set the minimum height
      // explicitly here to guarantee compliance on touch devices.
      'min-h-[44px] transition-colors duration-150 w-full ' +
      'hover:bg-surface-alt hover:text-text-primary ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50';

    const active =
      'bg-accent-50 text-accent-700 border-l-2 border-accent ' +
      'dark:bg-accent-950 dark:text-accent-300 dark:border-accent-400';

    const inactive = 'text-text-secondary border-l-2 border-transparent';

    return `${base} ${isActive(href) ? active : inactive}`;
  }
</script>

<!--
  SIDEBAR ROOT ELEMENT

  Two rendering contexts:
    1. Desktop/tablet (lg:*): positioned as a normal flex column inside AppShell.
       Width transitions between 256px (w-64) and 64px (w-16) on collapse.
    2. Mobile: fixed overlay drawer. Hidden (translate-x-full) by default,
       slides in (translate-x-0) when mobileOpen is true.

  The `inert` attribute disables all interactions (keyboard, pointer) when
  the mobile sidebar is hidden — prevents users from Tab-navigating into
  invisible links. Removed when the drawer is open.

  Note: We render a single sidebar element and use CSS to switch it between
  the two modes (normal-flow vs fixed overlay). This avoids rendering it twice.
-->
<aside
  class={asideClass}
  aria-label="Application navigation"
  inert={shouldBeInert ? true : undefined}
>

  <!-- ==========================================================================
       SIDEBAR HEADER — Logo / App Title + Collapse Button (desktop)
  =========================================================================== -->
  <div class="flex items-center justify-between px-3 py-4 border-b border-border shrink-0">

    <!--
      App logo + title.
      When collapsed on desktop, the title text is clipped via the sidebar's
      overflow-x-hidden + fixed width. We explicitly hide it to prevent partial
      text rendering.
    -->
    <a
      href="/"
      class="flex items-center gap-2 min-w-0 text-text-primary hover:text-accent transition-colors duration-150"
      title="Character Vault"
    >
      <!-- Abstract vault/shield icon using SVG (no external asset needed) -->
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        class="shrink-0 text-accent"
        aria-hidden="true"
      >
        <path
          d="M14 2L4 7V14C4 19.5 8.5 24.7 14 26C19.5 24.7 24 19.5 24 14V7L14 2Z"
          fill="currentColor"
          opacity="0.15"
        />
        <path
          d="M14 2L4 7V14C4 19.5 8.5 24.7 14 26C19.5 24.7 24 19.5 24 14V7L14 2Z"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
        <path
          d="M10 14L13 17L18 11"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>

      <!--
        App title — hidden in collapsed mode (desktop) and always hidden on tablet
        (icon-only). `overflow-hidden` on the aside clips text that overflows the
        64px width, but we conditionally hide it to avoid unnecessary DOM nodes.
      -->
      {#if !effectivelyCollapsed}
        <span class="font-semibold text-base truncate">{ui('app.title', engine.settings.language)}</span>
      {/if}
    </a>

    <!-- Desktop-only: collapse/expand toggle button (hidden on tablet — always icon-only there) -->
    <div class="hidden lg:flex items-center">
      <button
        class="btn-ghost p-1.5 ml-1 shrink-0"
        onclick={onCollapse}
        title={collapsed ? ui('nav.expand_sidebar', engine.settings.language) : ui('nav.collapse_sidebar', engine.settings.language)}
        aria-label={collapsed ? ui('nav.expand_sidebar', engine.settings.language) : ui('nav.collapse_sidebar', engine.settings.language)}
        type="button"
      >
        {#if collapsed}
          <IconExpand size={16} aria-hidden="true" />
        {:else}
          <IconCollapse size={16} aria-hidden="true" />
        {/if}
      </button>
    </div>

    <!-- Mobile-only: close drawer button (hidden at tablet+ where sidebar is always visible) -->
    <button
      class="md:hidden btn-ghost p-1.5 ml-1 shrink-0"
      onclick={onClose}
      title={ui('nav.close_navigation', engine.settings.language)}
      aria-label={ui('nav.close_navigation', engine.settings.language)}
      type="button"
    >
      <IconClose size={20} aria-hidden="true" />
    </button>
  </div>

  <!-- ==========================================================================
       NAVIGATION LINKS — Middle section, vertically scrollable
  =========================================================================== -->
  <nav class="flex-1 overflow-y-auto py-3 px-2 space-y-0.5" aria-label="Main navigation">

    <!--
      Each link follows the pattern:
        - Lucide icon (20px, shrink-0 prevents squish when label is hidden)
        - Text label in a <span> that can be conditionally shown/hidden
        - Optional badge for contextual info (level, campaign name)

      The `title` attribute on each link provides a tooltip in icon-only mode,
      improving usability when labels are hidden.
    -->

    <!-- 1. CAMPAIGNS — always visible -->
    <a href="/campaigns" class={navLinkClass('/campaigns')} title={ui('nav.campaigns', engine.settings.language)}>
      <IconCampaign size={20} class="shrink-0" aria-hidden="true" />
      {#if !effectivelyCollapsed}
        <span class="truncate">{ui('nav.campaigns', engine.settings.language)}</span>
      {/if}
    </a>

    <!--
      2. CHARACTER VAULT — contextual: only when inside a campaign.
      Shows the campaign name as a subtitle (icon-only: only icon + tooltip).
    -->
    {#if campaignId}
      <a
        href="/campaigns/{campaignId}/vault"
        class={navLinkClass('/campaigns/' + campaignId + '/vault')}
        title={activeCampaign ? `${ui('nav.vault', engine.settings.language)} — ${activeCampaign.title}` : ui('app.title', engine.settings.language)}
      >
        <IconVault size={20} class="shrink-0" aria-hidden="true" />
        {#if !effectivelyCollapsed}
          <span class="truncate">
            {ui('nav.vault', engine.settings.language)}
            {#if activeCampaign}
              <span class="block text-xs text-text-muted font-normal truncate">
                {activeCampaign.title}
              </span>
            {/if}
          </span>
        {/if}
      </a>
    {/if}

    <!--
      3. CHARACTER SHEET — only when a character is loaded in the engine.
      Shows the character name as a subtitle.
    -->
    {#if characterId}
      <a
        href="/character/{characterId}"
        class={navLinkClass('/character/' + characterId)}
        title={engine.character.name ?? ui('nav.character_sheet', engine.settings.language)}
      >
        <IconCharacter size={20} class="shrink-0" aria-hidden="true" />
        {#if !effectivelyCollapsed}
          <span class="truncate">
            {ui('nav.character', engine.settings.language)}
            <span class="block text-xs text-text-muted font-normal truncate">
              {engine.character.name}
            </span>
          </span>
        {/if}
      </a>
    {/if}

    <!--
      GM-ONLY SECTION — divider + GM tools, visible only to Game Masters
      who are inside a campaign context.
    -->
    {#if isGM && campaignId}
      <!-- Visual divider separating player nav from GM tools -->
      <div class="pt-2 pb-1">
        {#if !effectivelyCollapsed}
          <p class="px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            {ui('nav.gm_tools', engine.settings.language)}
          </p>
        {:else}
          <div class="border-t border-border mx-1"></div>
        {/if}
      </div>

      <!-- 4. GM DASHBOARD -->
      <a
        href="/campaigns/{campaignId}/gm-dashboard"
        class={navLinkClass('/campaigns/' + campaignId + '/gm-dashboard')}
        title={ui('nav.gm_dashboard', engine.settings.language)}
      >
        <IconGMDashboard size={20} class="shrink-0" aria-hidden="true" />
        {#if !effectivelyCollapsed}
          <span class="truncate">{ui('nav.gm_dashboard', engine.settings.language)}</span>
        {/if}
      </a>

      <!-- 5. CONTENT EDITOR — Phase 21 (homebrew authoring) -->
      <a
        href="/campaigns/{campaignId}/content-editor"
        class={navLinkClass('/campaigns/' + campaignId + '/content-editor')}
        title={ui('nav.content_editor', engine.settings.language)}
      >
        <IconEdit size={20} class="shrink-0" aria-hidden="true" />
        {#if !effectivelyCollapsed}
          <span class="truncate">{ui('nav.content_editor', engine.settings.language)}</span>
        {/if}
      </a>

      <!-- 6. CAMPAIGN SETTINGS -->
      <a
        href="/campaigns/{campaignId}/settings"
        class={navLinkClass('/campaigns/' + campaignId + '/settings')}
        title={ui('nav.campaign_settings', engine.settings.language)}
      >
        <IconSettings size={20} class="shrink-0" aria-hidden="true" />
        {#if !effectivelyCollapsed}
          <span class="truncate">{ui('nav.settings', engine.settings.language)}</span>
        {/if}
      </a>
    {/if}

    <!-- ── ADMIN TOOLS (Phase 22 — admin role only) ─────────────────────────
         The admin panel is independent of the active campaign. It is visible
         whenever the logged-in user has role='admin', regardless of which
         campaign (if any) is currently active.
    -->
    {#if sessionContext.isAdmin}
      <div class="pt-2 pb-1">
        {#if !effectivelyCollapsed}
          <p class="px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Admin
          </p>
        {:else}
          <div class="border-t border-border mx-1"></div>
        {/if}
      </div>

      <a
        href="/admin/users"
        class={navLinkClass('/admin/users')}
        title="User Management"
      >
        <IconAdmin size={20} class="shrink-0" aria-hidden="true" />
        {#if !effectivelyCollapsed}
          <span class="truncate">User Management</span>
        {/if}
      </a>
    {/if}

  </nav>

  <!-- ==========================================================================
       SIDEBAR FOOTER — Theme toggle + user/session info (pinned to bottom)
  =========================================================================== -->
  <div class="shrink-0 border-t border-border px-2 py-3 space-y-1">

    <!-- Theme toggle button — uses existing ThemeToggle component (Phase 19.2) -->
    <div class="flex items-center">
      <ThemeToggle showLabel={!effectivelyCollapsed} />
    </div>

    <!-- Language switcher — dropdown populated from loaded rule files -->
    <div class="flex items-center gap-1 px-1 py-0.5">
      {#if effectivelyCollapsed}
        <!-- Icon-only mode: compact language badge showing active code -->
        <button
          class="flex items-center justify-center w-full h-8 rounded-md text-xs font-bold
                 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
          onclick={async () => {
            const langs = engine.availableLanguages;
            const idx  = langs.indexOf(engine.settings.language);
            const code = langs[(idx + 1) % langs.length];
            await loadUiLocale(code);
            engine.settings.language = code;
          }}
          title="{ui('lang.select_tooltip', engine.settings.language)}"
          aria-label="{ui('lang.select_tooltip', engine.settings.language)}"
          type="button"
        >
          {engine.settings.language.toUpperCase()}
        </button>
      {:else}
        <!-- Expanded mode: dropdown select -->
        <label
          for="sidebar-lang-select"
          class="text-[10px] text-text-muted uppercase tracking-wider mr-1 shrink-0"
        >{ui('lang.label', engine.settings.language)}</label>
        <select
          id="sidebar-lang-select"
          class="flex-1 text-xs py-1 px-1.5 rounded-md border border-border
                 bg-surface text-text-primary cursor-pointer
                 hover:border-accent focus-visible:border-accent focus-visible:outline-none
                 transition-colors"
          value={engine.settings.language}
          onchange={async (e) => {
            const code = (e.target as HTMLSelectElement).value;
            await loadUiLocale(code);
            engine.settings.language = code;
          }}
          aria-label="{ui('lang.select_tooltip', engine.settings.language)}"
          title="{ui('lang.select_tooltip', engine.settings.language)}"
        >
          {#each engine.availableLanguages as lang}
            <!-- engine.getLanguageDisplayName() resolves via:
                 1. ui('lang.{code}') — ui-strings.ts / loaded locale
                 2. dataLoader.getLocaleDisplayName() — native name from /api/locales
                 3. code.toUpperCase() — last resort
                 Centralised in the engine so no fallback logic lives in .svelte. -->
            <option value={lang}>{engine.getLanguageDisplayName(lang)}</option>
          {/each}
        </select>
      {/if}
    </div>

    <!--
      User / session indicator:
      - Collapsed: shows a single user icon (role-specific color).
      - Expanded: shows display name + role badge.

      The role badge changes color: GM → accent, Player → neutral gray.
      This helps users immediately identify which role they're browsing as.

      NOTE: In mock mode (Phase 6.1), a "Switch Role" affordance appears to
      allow testing GM vs Player views. In Phase 14 (PHP auth), this section
      shows only the read-only user info (no switching allowed from client).
    -->
    <div class="flex items-center gap-2 px-1 py-1.5 rounded-md min-w-0">
      <!--
        Role-colored avatar circle — consistent even in icon-only mode.
        GM: accent color for instant visual identification.
        Player: neutral gray
      -->
      <div
        class="
          shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
          {isGM
            ? 'bg-accent-100 text-accent-700 dark:bg-accent-900 dark:text-accent-300'
            : 'bg-surface-alt text-text-secondary border border-border'}
        "
        title="{sessionContext.currentUserDisplayName} ({isGM ? ui('nav.role_gm', engine.settings.language) : ui('nav.role_player', engine.settings.language)})"
        aria-label="Current user: {sessionContext.currentUserDisplayName}"
      >
        {sessionContext.currentUserDisplayName.charAt(0).toUpperCase()}
      </div>

      {#if !effectivelyCollapsed}
        <div class="min-w-0 flex-1">
          <p class="text-xs font-medium text-text-primary truncate">
            {sessionContext.currentUserDisplayName}
          </p>
          <p class="text-xs text-text-muted">
            {isGM ? ui('nav.role_gm', engine.settings.language) : ui('nav.role_player', engine.settings.language)}
          </p>
        </div>

        <!--
          DEV-ONLY: Role switch buttons.
          These are visible only in development mode to test GM vs Player views.
          In production (Phase 14), authentication is server-side and cannot be
          spoofed from the client.

          Svelte logic: We check the build-time constant `import.meta.env.DEV`.
        -->
        {#if import.meta.env.DEV}
          <button
            class="btn-ghost p-1 text-xs shrink-0"
            onclick={() => {
              if (isGM) {
                sessionContext.switchToPlayer();
              } else {
                sessionContext.switchToGM();
              }
            }}
            title={isGM ? ui('nav.switch_to_player', engine.settings.language) : ui('nav.switch_to_gm', engine.settings.language)}
            aria-label={isGM ? ui('nav.switch_to_player', engine.settings.language) : ui('nav.switch_to_gm', engine.settings.language)}
            type="button"
          >
            {isGM ? `→ ${ui('nav.role_player', engine.settings.language)}` : `→ ${ui('nav.role_gm', engine.settings.language)}`}
          </button>
        {/if}
      {/if}
    </div>

    <!--
      Change Password button — available to all authenticated users.
      Collapsed mode: key icon only (tooltip shows action).
      Expanded mode: key icon + "Change Password" label.
    -->
    <button
      type="button"
      class="flex items-center gap-2 w-full px-1 py-1 rounded-md text-xs
             text-text-muted hover:text-text-secondary hover:bg-surface-alt
             transition-colors focus:outline-none focus-visible:ring-2
             focus-visible:ring-accent/50"
      onclick={() => (showChangePasswordModal = true)}
      title="Change Password"
      aria-label="Change Password"
    >
      <IconKey size={14} class="shrink-0" aria-hidden="true" />
      {#if !effectivelyCollapsed}
        <span>Change Password</span>
      {/if}
    </button>

  </div>

</aside>

<!-- Change Password modal — mounted outside <aside> to avoid z-index issues -->
<ChangePasswordModal
  open={showChangePasswordModal}
  onClose={() => (showChangePasswordModal = false)}
/>
