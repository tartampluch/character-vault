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
  import { ui } from '$lib/i18n/ui-strings';

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
   * After mount: pick up the stored preference and set up a storage event
   * listener so the page reacts if the user changes language elsewhere.
   */
  $effect(() => {
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

  async function handleLogin(e: SubmitEvent) {
    e.preventDefault();
    error     = '';
    isLoading = true;

    try {
      const loginResp = await fetch('/api/auth/login', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ username: username.trim(), password }),
      });

      if (loginResp.status === 401) {
        error = ui('login.error_invalid', lang);
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

      await sessionContext.loadFromServer();
      await goto(decodeURIComponent(returnTo));
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
          disabled={isLoading || !username.trim() || !password}
          class="btn-primary w-full mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? ui('login.signing_in', lang) : ui('login.sign_in', lang)}
        </button>

      </form>
    </div>

    <!-- Dev hint (translated) -->
    <p class="text-center text-xs text-text-muted mt-4">
      {#each ui('login.dev_hint', lang).split(/(\{gm\}|\{player\}|\{cmd\})/) as part}
        {#if part === '{gm}'}
          <code class="bg-surface-alt px-1 rounded">gm / gm</code>
        {:else if part === '{player}'}
          <code class="bg-surface-alt px-1 rounded">player / player</code>
        {:else if part === '{cmd}'}
          <code class="bg-surface-alt px-1 rounded">php api/seed.php</code>
        {:else}
          {part}
        {/if}
      {/each}
    </p>

  </div>
</div>
