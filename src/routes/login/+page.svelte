<!--
  @file src/routes/login/+page.svelte
  @description Login page — authenticates against POST /api/auth/login.

  FLOW:
    1. User submits username + password.
    2. Calls POST /api/auth/login → PHP creates a session cookie.
    3. Calls GET  /api/auth/me    → populates sessionContext + CSRF token.
    4. Redirects to `returnTo` query param or the campaign hub (/campaigns).

  Phase 14.2 — real PHP session auth replaces the mock SessionContext.

  LANGUAGE STRATEGY:
    The login page is outside the main app layout (no sidebar language dropdown).
    We still want it to respect the user's stored language preference.

    - `lang` is `$state` initialized to `'en'`.
    - A `$effect` reads `localStorage` after mount and updates `lang`.
    - A `storage` event listener reacts instantly if the user changes the
      language in another tab while the login page is open.
    - `engine.settings.language` is also watched (covers the case where the
      user navigates directly from within the app, where the engine is loaded).
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui, loadUiLocale } from '$lib/i18n/ui-strings';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { themeManager } from '$lib/stores/ThemeManager.svelte';
  import { IconThemeSystem, IconThemeLight, IconThemeDark } from '$lib/components/ui/icons';

  const LS_KEY = 'cv_user_language';

  const returnTo = $derived(($page.url.searchParams.get('returnTo')) ?? '/campaigns');

  let username  = $state('');
  let password  = $state('');
  let error     = $state('');
  let isLoading = $state(false);

  /**
   * Reactive language.
   * Initialized to 'en' for SSR safety; updated from localStorage after mount.
   * Also tracks engine.settings.language when the engine is loaded (in-app navigation).
   */
  let lang = $state('en');

  /** Read the stored language preference from localStorage (client only). */
  function readStoredLang(): string {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(LS_KEY);
        if (stored) return stored;
      }
    } catch { /* SSR / private browsing */ }
    return 'en';
  }

  /**
   * On mount: discover server locale files so the language dropdown is populated.
   *
   * AppShell.onMount also calls loadExternalLocales(), but AppShell is the parent
   * component so its onMount fires AFTER the login page renders. Calling it here
   * ensures the dropdown appears immediately after the locale API responds, without
   * depending on the parent's lifecycle order.
   *
   * After discovery, bumpDataLoaderVersion() forces engine.availableLanguages
   * (a $derived on dataLoaderVersion) to recompute, which in turn updates the
   * `availableLangs` derived on this page and causes the dropdown to render.
   */
  $effect(() => {
    (async () => {
      await dataLoader.loadExternalLocales();
      // Sync the dedicated locales version counter so engine.availableLanguages
      // (and therefore the language dropdown) re-evaluates with the new codes.
      engine.bumpLocalesVersion();
    })();
  });

  /**
   * After mount: pick up the stored preference and set up a storage event
   * listener so the page reacts if the user changes language elsewhere.
   */
  $effect(() => {
    // Initialize themeManager so the toggle works on the login page
    themeManager.init();

    // Prefer the engine's live language (handles in-app navigation without full reload)
    const engineLang = engine.settings.language;
    if (engineLang && engineLang !== 'en') {
      lang = engineLang;
    } else {
      lang = readStoredLang();
    }

    // React to storage changes (e.g. language dropdown in another tab)
    function onStorage(e: StorageEvent) {
      if (e.key === LS_KEY && e.newValue) lang = e.newValue;
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  });

  // Also track engine.settings.language reactively — covers SPA navigation
  $effect(() => {
    const el = engine.settings.language;
    if (el) lang = el;
  });

  /** The icon config for the current theme preference. */
  const themeState = $derived({
    icon: themeManager.preference === 'dark'  ? IconThemeDark  :
          themeManager.preference === 'light' ? IconThemeLight :
          IconThemeSystem,
  });

  /** Available languages — at minimum ['en'], expanded if locales are loaded. */
  const availableLangs = $derived(engine.availableLanguages);

  async function changeLanguage(code: string) {
    await loadUiLocale(code);
    engine.settings.language = code;
    lang = code;
    try { localStorage.setItem(LS_KEY, code); } catch { /* SSR / private */ }
  }

  async function handleLogin(e: SubmitEvent) {
    e.preventDefault();
    error     = '';
    isLoading = true;

    try {
      const loginResp = await fetch('/api/auth/login', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        // Password may be empty for no-password accounts (new users / admin bootstrap).
        body:        JSON.stringify({ username: username.trim(), password }),
      });

      if (loginResp.status === 401) {
        error = ui('login.error_invalid', lang);
        return;
      }
      if (loginResp.status === 403) {
        // Account suspended or expired (7-day no-login window elapsed).
        const body = await loginResp.json().catch(() => ({})) as { error?: string };
        if (body.error === 'AccountExpired') {
          error = 'This account was not activated within 7 days and has been suspended. Contact an administrator.';
        } else {
          error = 'This account has been suspended. Contact an administrator.';
        }
        return;
      }
      if (loginResp.status === 429) {
        error = ui('login.error_too_many', lang);
        return;
      }
      if (!loginResp.ok) {
        error = ui('login.error_failed', lang).replace('{status}', String(loginResp.status));
        return;
      }

      // Read needs_password_setup directly from the login response.
      // This is more reliable than checking sessionContext after loadFromServer()
      // because it is available immediately, before the session is re-fetched.
      const loginData = await loginResp.json() as { needs_password_setup?: boolean };
      const needsSetup = loginData.needs_password_setup === true;

      // Populate sessionContext (sets role, needsPasswordSetup, csrfToken, etc.).
      await sessionContext.loadFromServer();

      // Phase 22.6: If the account requires a password to be set, redirect to
      // the setup page instead of the original returnTo destination.
      if (needsSetup) {
        await goto('/setup-password');
      } else {
        await goto(decodeURIComponent(returnTo));
      }
    } catch (err) {
      error = ui('login.error_server', lang);
      console.error('[Login] fetch error:', err);
    } finally {
      isLoading = false;
    }
  }
</script>

<svelte:head>
  <title>Sign In — Character Vault</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center px-4 bg-background">

  <!-- Theme + Language controls (top-right corner) -->
  <div class="fixed top-3 right-3 flex items-center gap-1 z-10">
    <!-- Theme toggle -->
    <button
      class="btn-ghost p-2 text-text-muted hover:text-text-primary"
      onclick={() => themeManager.cycle()}
      title="{themeManager.preference}"
      aria-label="Toggle theme"
      type="button"
    >
      <themeState.icon size={18} aria-hidden="true" />
    </button>
    <!-- Language selector -->
    {#if availableLangs.length > 1}
      <select
        class="text-xs py-1 px-1.5 rounded-md border border-border bg-surface text-text-primary
               cursor-pointer hover:border-accent focus-visible:border-accent
               focus-visible:outline-none transition-colors"
        value={lang}
        onchange={async (e) => changeLanguage((e.target as HTMLSelectElement).value)}
        aria-label="Select language"
      >
        {#each availableLangs as code}
          <option value={code}>{engine.getLanguageDisplayName(code)}</option>
        {/each}
      </select>
    {/if}
  </div>

  <div class="w-full max-w-sm">

    <!-- Header -->
    <div class="text-center mb-8">
      <h1 class="text-2xl font-bold text-text-primary mb-1">Character Vault</h1>
      <p class="text-sm text-text-muted">{ui('login.title', lang)}</p>
    </div>

    <!-- Card -->
    <div class="card p-6 flex flex-col gap-4">

      <!-- Error banner -->
      {#if error}
        <div class="px-3 py-2 rounded border border-red-700/40 bg-red-950/20 text-red-400 text-sm" role="alert">
          {error}
        </div>
      {/if}

      <!-- Login form -->
      <form onsubmit={handleLogin} class="flex flex-col gap-4" novalidate>

        <div class="flex flex-col gap-1.5">
          <label for="username" class="text-xs font-medium text-text-secondary">{ui('login.username', lang)}</label>
          <input
            id="username"
            type="text"
            bind:value={username}
            autocomplete="username"
            required
            disabled={isLoading}
            class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary
                   placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50
                   focus:border-accent transition-colors disabled:opacity-50"
            placeholder="e.g. gm"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="password" class="text-xs font-medium text-text-secondary">{ui('login.password', lang)}</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            autocomplete="current-password"
            required
            disabled={isLoading}
            class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary
                   placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50
                   focus:border-accent transition-colors disabled:opacity-50"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !username.trim()}
          class="btn-primary w-full mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <!-- Password field is intentionally not required for no-password accounts
               (new users / admin bootstrap). The server validates credentials. -->
          {isLoading ? ui('login.signing_in', lang) : ui('login.sign_in', lang)}
        </button>

      </form>
    </div>

  </div>
</div>
