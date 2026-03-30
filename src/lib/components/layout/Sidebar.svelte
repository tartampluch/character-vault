<!--
  @file src/lib/components/layout/Sidebar.svelte
  @description Application navigation sidebar.

  LAYOUT STRUCTURE:
    1. Header   — logo + "Character Vault" title + collapse button
    2. User     — avatar + name (clickable → dropdown: Change Password, Logout)
    3. Nav      — navigation links (vertically scrollable)
    4. Footer   — theme icon + language selector (same compact row)

  NAV ITEMS:
    Campaigns — always visible; navigates to /campaigns.
                In expanded mode: shows a collapsible "Pinned Campaigns" section below.
    Vault     — always visible; navigates to /vault (global vault across all campaigns).
                In expanded mode: shows a collapsible "Pinned Characters" section below.
    Character — contextual: only when a character is loaded.
    GM Tools  — section separator + Content Editor + Campaign Settings (GM only, in campaign).

  RESPONSIVE BEHAVIOR:
    Desktop (≥1024px): fixed-height left column, expanded (icon+label) or collapsed (icon-only).
    Tablet (768–1023px): always icon-only.
    Mobile (<768px): fixed overlay drawer, hidden by default.

  FLAGS:
    Language flags are rendered with flag-icons CSS classes (`.fi .fi-{code}`).
    The LANG_FLAGS map translates BCP-47 language codes to ISO 3166-1 alpha-2
    country codes. Add entries here when new locale files are introduced.

  PROPS:
    collapsed  — icon-only mode (desktop/tablet)
    mobileOpen — mobile drawer open state
    onCollapse — toggle collapsed (desktop only)
    onClose    — close mobile drawer
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { sidebarPinsStore } from '$lib/engine/SidebarPinsStore.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import ThemeLanguagePicker from '$lib/components/ui/ThemeLanguagePicker.svelte';
  import { logout } from '$lib/api/userApi';
  import {
    IconCampaign,
    IconVault,
    IconCharacter,
    IconEdit,
    IconSettings,
    IconCollapse,
    IconExpand,
    IconClose,
    IconAdmin,
    IconKey,
    IconLogout,
    IconChevronDown,
    IconChevronUp,
    IconPin,
    IconPinOff,
  } from '$lib/components/ui/icons';
  import ChangePasswordModal from '$lib/components/admin/ChangePasswordModal.svelte';
  import RenameModal         from '$lib/components/admin/RenameModal.svelte';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------

  interface Props {
    collapsed: boolean;
    mobileOpen: boolean;
    onCollapse: () => void;
    onClose: () => void;
  }

  let { collapsed, mobileOpen, onCollapse, onClose }: Props = $props();

  // ---------------------------------------------------------------------------
  // MOBILE VIEWPORT TRACKING
  // ---------------------------------------------------------------------------

  let isBelowLg = $state(false);
  let isBelowMd = $state(false);

  $effect(() => {
    if (typeof window === 'undefined') return;

    const mqlLg = window.matchMedia('(max-width: 1023.98px)');
    isBelowLg = mqlLg.matches;
    const handlerLg = (e: MediaQueryListEvent) => { isBelowLg = e.matches; };
    mqlLg.addEventListener('change', handlerLg);

    const mqlMd = window.matchMedia('(max-width: 767.98px)');
    isBelowMd = mqlMd.matches;
    const handlerMd = (e: MediaQueryListEvent) => { isBelowMd = e.matches; };
    mqlMd.addEventListener('change', handlerMd);

    return () => {
      mqlLg.removeEventListener('change', handlerLg);
      mqlMd.removeEventListener('change', handlerMd);
    };
  });

  const shouldBeInert        = $derived(isBelowMd && !mobileOpen);
  const isTablet             = $derived(isBelowLg && !isBelowMd);
  const effectivelyCollapsed = $derived(collapsed || isTablet);

  // ---------------------------------------------------------------------------
  // PINS — initialize for current user on mount
  // ---------------------------------------------------------------------------

  onMount(() => {
    if (sessionContext.currentUserId) {
      sidebarPinsStore.initForUser(sessionContext.currentUserId);
    }
  });

  // Re-init when user ID changes (e.g. after login completes).
  $effect(() => {
    const uid = sessionContext.currentUserId;
    if (uid) sidebarPinsStore.initForUser(uid);
  });

  // ---------------------------------------------------------------------------
  // DERIVED STATE
  // ---------------------------------------------------------------------------

  const pathname       = $derived($page.url.pathname);
  const campaignId     = $derived(sessionContext.activeCampaignId);
  const activeCampaign = $derived(
    campaignId ? campaignStore.getCampaign(campaignId) : undefined
  );
  const characterId    = $derived(engine.activeCharacterId);
  const isGM           = $derived(sessionContext.isGameMaster);

  /** First letter of the display name (uppercase) used as avatar initials. */
  const userInitial = $derived(
    sessionContext.currentUserDisplayName
      ? sessionContext.currentUserDisplayName.charAt(0).toUpperCase()
      : '?'
  );

  // ---------------------------------------------------------------------------
  // USER DROPDOWN
  // ---------------------------------------------------------------------------

  let showUserMenu            = $state(false);
  let showChangePasswordModal = $state(false);
  let showRenameModal         = $state(false);

  function toggleUserMenu(): void { showUserMenu = !showUserMenu; }
  function closeUserMenu(): void  { showUserMenu = false; }

  function openChangePassword(): void {
    showUserMenu = false;
    showChangePasswordModal = true;
  }

  function openRename(): void {
    showUserMenu = false;
    showRenameModal = true;
  }

  async function handleLogout(): Promise<void> {
    showUserMenu = false;
    await logout();
    await goto('/login');
  }

  $effect(() => {
    if (!showUserMenu) return;
    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target?.closest('[data-user-menu]')) showUserMenu = false;
    }
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  });

  // ---------------------------------------------------------------------------
  // COLLAPSIBLE PIN SECTIONS
  // ---------------------------------------------------------------------------

  let campaignSectionOpen  = $state(true);
  let characterSectionOpen = $state(true);

  // ---------------------------------------------------------------------------
  // PINNED CAMPAIGN LABELS
  // ---------------------------------------------------------------------------

  /**
   * Returns the display title for a pinned campaign by ID.
   * Falls back to the raw ID if the campaign is not loaded yet.
   */
  function pinnedCampaignLabel(id: string): string {
    const c = campaignStore.getCampaign(id);
    if (!c) return id;
    const t = c.title;
    if (!t) return id;
    if (typeof t === 'string') {
      try { return engine.t(JSON.parse(t) as Record<string, string>); }
      catch { return t; }
    }
    return engine.t(t as Record<string, string>);
  }

  /**
   * Returns the display name for a pinned character by ID.
   * Falls back to the raw ID.
   */
  function pinnedCharacterLabel(id: string): string {
    const c = engine.allVaultCharacters.find(v => v.id === id);
    return c?.name ?? id;
  }

  // ---------------------------------------------------------------------------
  // SIDEBAR ROOT CLASSES
  // ---------------------------------------------------------------------------

  const asideClass = $derived(
    [
      'flex flex-col h-screen bg-surface border-r border-border',
      'transition-all duration-200 ease-in-out shrink-0',
      'fixed inset-y-0 left-0 z-40',
      mobileOpen ? 'translate-x-0 w-64 shadow-xl' : '-translate-x-full w-64',
      'md:relative md:translate-x-0 md:shadow-none md:w-16',
      'lg:relative lg:translate-x-0 lg:shadow-none',
      collapsed ? 'lg:w-16' : 'lg:w-64',
    ].join(' ')
  );

  // ---------------------------------------------------------------------------
  // NAV LINK HELPER
  // ---------------------------------------------------------------------------

  function isActive(href: string): boolean {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  function navLinkClass(href: string): string {
    const base =
      'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ' +
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

<!-- ============================================================================
     SIDEBAR ROOT
============================================================================ -->
<aside
  class={asideClass}
  aria-label={ui('nav.app_nav_aria', engine.settings.language)}
  inert={shouldBeInert ? true : undefined}
>

  <!-- =========================================================================
       HEADER — Logo + Title + Collapse button
  ========================================================================== -->
  <div class="flex items-center border-b border-border shrink-0
              {collapsed && !mobileOpen ? 'justify-center px-1 py-3' : 'justify-between px-3 py-3'}">

    {#if !collapsed || mobileOpen}
      <a
        href="/"
        class="flex items-center gap-2 min-w-0 text-text-primary hover:text-accent transition-colors duration-150"
        title={ui('app.title', engine.settings.language)}
      >
        <svg
          width="28" height="28" viewBox="0 0 28 28" fill="none"
          xmlns="http://www.w3.org/2000/svg"
          class="shrink-0 text-accent" aria-hidden="true"
        >
          <path d="M14 2L4 7V14C4 19.5 8.5 24.7 14 26C19.5 24.7 24 19.5 24 14V7L14 2Z"
            fill="currentColor" opacity="0.15"/>
          <path d="M14 2L4 7V14C4 19.5 8.5 24.7 14 26C19.5 24.7 24 19.5 24 14V7L14 2Z"
            stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
          <path d="M10 14L13 17L18 11"
            stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        {#if !effectivelyCollapsed}
          <span class="font-semibold text-base truncate">{ui('app.title', engine.settings.language)}</span>
        {/if}
      </a>
    {/if}

    <!-- Desktop collapse/expand toggle (lg+ only) -->
    <button
      class="hidden lg:flex btn-ghost p-1.5 shrink-0"
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

    <!-- Mobile close drawer button -->
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

  <!-- =========================================================================
       USER SECTION — avatar + name, clickable dropdown menu
  ========================================================================== -->
  <div class="relative px-2 py-2 border-b border-border shrink-0" data-user-menu>
    <button
      type="button"
      class="flex items-center gap-2 w-full rounded-md px-2 py-2
             hover:bg-surface-alt transition-colors duration-150
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      onclick={toggleUserMenu}
      title="{sessionContext.currentUserDisplayName} — {ui('user.menu_label', engine.settings.language)}"
      aria-label="{sessionContext.currentUserDisplayName} — {ui('user.menu_label', engine.settings.language)}"
      aria-expanded={showUserMenu}
      aria-haspopup="menu"
    >
      <!-- Avatar circle (role-colored) -->
      <div
        class="
          shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
          {isGM
            ? 'bg-accent-100 text-accent-700 dark:bg-accent-900 dark:text-accent-300'
            : 'bg-surface-alt text-text-secondary border border-border'}
        "
        aria-hidden="true"
      >
        {userInitial}
      </div>

      {#if !effectivelyCollapsed}
        <div class="min-w-0 flex-1 text-left">
          <p class="text-xs font-medium text-text-primary truncate">
            {sessionContext.currentUserDisplayName || '…'}
          </p>
          <p class="text-[10px] text-text-muted">
            {isGM ? ui('nav.role_gm', engine.settings.language) : ui('nav.role_player', engine.settings.language)}
          </p>
        </div>
        {#if showUserMenu}
          <IconChevronUp size={12} class="shrink-0 text-text-muted" aria-hidden="true" />
        {:else}
          <IconChevronDown size={12} class="shrink-0 text-text-muted" aria-hidden="true" />
        {/if}
      {/if}
    </button>

    <!-- Dropdown menu -->
    {#if showUserMenu}
      <div
        role="menu"
        class="
          absolute left-1 top-full mt-1 z-50
          min-w-[12rem]
          bg-surface border border-border rounded-lg shadow-lg
          overflow-hidden py-1
        "
      >
        <button
          type="button"
          role="menuitem"
          class="flex items-center gap-2 w-full px-3 py-2 text-xs text-text-secondary
                 hover:bg-surface-alt hover:text-text-primary transition-colors"
          onclick={openRename}
        >
          <IconEdit size={14} class="shrink-0" aria-hidden="true" />
          {ui('user.rename', engine.settings.language)}
        </button>

        <button
          type="button"
          role="menuitem"
          class="flex items-center gap-2 w-full px-3 py-2 text-xs text-text-secondary
                 hover:bg-surface-alt hover:text-text-primary transition-colors"
          onclick={openChangePassword}
        >
          <IconKey size={14} class="shrink-0" aria-hidden="true" />
          {ui('user.change_password', engine.settings.language)}
        </button>

        <div class="border-t border-border my-1" aria-hidden="true"></div>

        <button
          type="button"
          role="menuitem"
          class="flex items-center gap-2 w-full px-3 py-2 text-xs text-text-secondary
                 hover:bg-surface-alt hover:text-red-400 transition-colors"
          onclick={handleLogout}
        >
          <IconLogout size={14} class="shrink-0" aria-hidden="true" />
          {ui('user.logout', engine.settings.language)}
        </button>
      </div>
    {/if}
  </div>

  <!-- =========================================================================
       NAVIGATION LINKS — middle section, vertically scrollable
  ========================================================================== -->
  <nav
    class="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-0.5"
    aria-label={ui('nav.main_navigation_aria', engine.settings.language)}
  >

    <!-- ── 1. CAMPAIGNS — always visible ─────────────────────────────────── -->
    <div class="flex items-center">
      <a
        href="/campaigns"
        class="{navLinkClass('/campaigns')} flex-1"
        title={ui('nav.campaigns', engine.settings.language)}
      >
        <IconCampaign size={20} class="shrink-0" aria-hidden="true" />
        {#if !effectivelyCollapsed}
          <span class="truncate flex-1">{ui('nav.campaigns', engine.settings.language)}</span>
        {/if}
      </a>

      <!-- Collapse/expand pinned campaigns section (expanded sidebar only) -->
      {#if !effectivelyCollapsed && sidebarPinsStore.pinnedCampaignIds.length > 0}
        <button
          type="button"
          class="p-1 rounded text-text-muted hover:text-text-primary transition-colors shrink-0"
          onclick={() => { campaignSectionOpen = !campaignSectionOpen; }}
          aria-label={campaignSectionOpen ? 'Collapse pinned campaigns' : 'Expand pinned campaigns'}
          title={campaignSectionOpen ? 'Collapse pinned campaigns' : 'Expand pinned campaigns'}
        >
          {#if campaignSectionOpen}
            <IconChevronUp size={12} aria-hidden="true" />
          {:else}
            <IconChevronDown size={12} aria-hidden="true" />
          {/if}
        </button>
      {/if}
    </div>

    <!-- Pinned campaigns collapsible section (expanded sidebar only) -->
    {#if !effectivelyCollapsed && sidebarPinsStore.pinnedCampaignIds.length > 0 && campaignSectionOpen}
      <div class="ml-2 pl-3 border-l border-border space-y-0.5">
        <p class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {ui('nav.pinned_campaigns', engine.settings.language)}
        </p>
        {#each sidebarPinsStore.pinnedCampaignIds as pinId}
          <div class="flex items-center gap-1 group/pin">
            <a
              href="/campaigns/{pinId}"
              class="flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-xs text-text-secondary
                     hover:bg-surface-alt hover:text-text-primary transition-colors truncate
                     {isActive('/campaigns/' + pinId) ? 'text-accent' : ''}"
              title={pinnedCampaignLabel(pinId)}
            >
              <IconCampaign size={13} class="shrink-0 opacity-60" aria-hidden="true" />
              <span class="truncate">{pinnedCampaignLabel(pinId)}</span>
            </a>
            <button
              type="button"
              class="p-1 rounded opacity-0 group-hover/pin:opacity-100 text-text-muted
                     hover:text-red-400 transition-all shrink-0"
              onclick={() => sidebarPinsStore.unpinCampaign(pinId)}
              aria-label="{ui('nav.unpin_campaign', engine.settings.language)}: {pinnedCampaignLabel(pinId)}"
              title={ui('nav.unpin_campaign', engine.settings.language)}
            >
              <IconPinOff size={11} aria-hidden="true" />
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- ── 2. VAULT — always visible ─────────────────────────────────────── -->
    <div class="flex items-center">
      <a
        href="/vault"
        class="{navLinkClass('/vault')} flex-1"
        title={ui('vault.global_title', engine.settings.language)}
      >
        <IconVault size={20} class="shrink-0" aria-hidden="true" />
        {#if !effectivelyCollapsed}
          <span class="truncate flex-1">{ui('vault.global_title', engine.settings.language)}</span>
        {/if}
      </a>

      <!-- Collapse/expand pinned characters section (expanded sidebar only) -->
      {#if !effectivelyCollapsed && sidebarPinsStore.pinnedCharacterIds.length > 0}
        <button
          type="button"
          class="p-1 rounded text-text-muted hover:text-text-primary transition-colors shrink-0"
          onclick={() => { characterSectionOpen = !characterSectionOpen; }}
          aria-label={characterSectionOpen ? 'Collapse pinned characters' : 'Expand pinned characters'}
          title={characterSectionOpen ? 'Collapse pinned characters' : 'Expand pinned characters'}
        >
          {#if characterSectionOpen}
            <IconChevronUp size={12} aria-hidden="true" />
          {:else}
            <IconChevronDown size={12} aria-hidden="true" />
          {/if}
        </button>
      {/if}
    </div>

    <!-- Pinned characters collapsible section (expanded sidebar only) -->
    {#if !effectivelyCollapsed && sidebarPinsStore.pinnedCharacterIds.length > 0 && characterSectionOpen}
      <div class="ml-2 pl-3 border-l border-border space-y-0.5">
        <p class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {ui('nav.pinned_characters', engine.settings.language)}
        </p>
        {#each sidebarPinsStore.pinnedCharacterIds as pinId}
          <div class="flex items-center gap-1 group/pin">
            <a
              href="/character/{pinId}?tab=core"
              class="flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-xs text-text-secondary
                     hover:bg-surface-alt hover:text-text-primary transition-colors truncate
                     {isActive('/character/' + pinId) ? 'text-accent' : ''}"
              title={pinnedCharacterLabel(pinId)}
            >
              <IconCharacter size={13} class="shrink-0 opacity-60" aria-hidden="true" />
              <span class="truncate">{pinnedCharacterLabel(pinId)}</span>
            </a>
            <button
              type="button"
              class="p-1 rounded opacity-0 group-hover/pin:opacity-100 text-text-muted
                     hover:text-red-400 transition-all shrink-0"
              onclick={() => sidebarPinsStore.unpinCharacter(pinId)}
              aria-label="{ui('nav.unpin_character', engine.settings.language)}: {pinnedCharacterLabel(pinId)}"
              title={ui('nav.unpin_character', engine.settings.language)}
            >
              <IconPinOff size={11} aria-hidden="true" />
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- ── 3. CHARACTER SHEET — only when a character is loaded ──────────── -->
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

    <!-- ── GM TOOLS — visible only to Game Masters inside a campaign ──────── -->
    {#if isGM && campaignId}
      <div class="pt-2 pb-1">
        {#if !effectivelyCollapsed}
          <p class="px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            {ui('nav.gm_tools', engine.settings.language)}
          </p>
        {:else}
          <div class="border-t border-border mx-1"></div>
        {/if}
      </div>

      <!-- Content Editor -->
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

      <!-- Campaign Settings -->
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

    <!-- ── ADMIN TOOLS — admin role only ─────────────────────────────────── -->
    {#if sessionContext.isAdmin}
      <div class="pt-2 pb-1">
        {#if !effectivelyCollapsed}
          <p class="px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            {ui('admin.nav.section_title', engine.settings.language)}
          </p>
        {:else}
          <div class="border-t border-border mx-1"></div>
        {/if}
      </div>

      <a
        href="/admin/users"
        class={navLinkClass('/admin/users')}
        title={ui('admin.nav.user_management', engine.settings.language)}
      >
        <IconAdmin size={20} class="shrink-0" aria-hidden="true" />
        {#if !effectivelyCollapsed}
          <span class="truncate">{ui('admin.nav.user_management', engine.settings.language)}</span>
        {/if}
      </a>
    {/if}

  </nav>

  <!-- =========================================================================
       FOOTER — Theme toggle + Language picker (shared component)
  ========================================================================== -->
  <div class="shrink-0 border-t border-border px-2 py-2">
    <ThemeLanguagePicker showLabel={!effectivelyCollapsed} dropdownUp={true} />
  </div>

</aside>

<!-- Change Password modal — mounted outside <aside> to avoid z-index issues -->
<ChangePasswordModal
  open={showChangePasswordModal}
  onClose={() => (showChangePasswordModal = false)}
/>

<!-- Rename (display name) modal — outside <aside> for the same reason -->
<RenameModal
  open={showRenameModal}
  onClose={() => (showRenameModal = false)}
/>
