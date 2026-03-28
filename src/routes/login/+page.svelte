<!--
  @file src/routes/login/+page.svelte
  @description Login page — authenticates against POST /api/auth/login.

  FLOW:
    1. User submits username + password.
    2. Calls POST /api/auth/login → PHP creates a session cookie.
    3. Calls GET  /api/auth/me    → populates sessionContext + CSRF token.
    4. Redirects to `returnTo` query param or the campaign hub (/campaigns).

  LANGUAGE / THEME:
    Both controls are delegated to <ThemeLanguagePicker dropdownUp={false} />.
    The component reads the `cv_language` cookie on mount and applies the stored
    preference if the locale is already available, or waits until it loads.

    Locale discovery (loadExternalLocales) is called here (not in AppShell,
    which fires after this page renders) so the language dropdown is populated
    immediately when the API responds.

    All UI strings in the form use `engine.settings.language` directly — this
    is kept in sync by ThemeLanguagePicker when the user or cookie changes it.
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { dataLoader } from '$lib/engine/DataLoader';
  import ThemeLanguagePicker from '$lib/components/ui/ThemeLanguagePicker.svelte';

  const returnTo = $derived(($page.url.searchParams.get('returnTo')) ?? '/campaigns');

  let username  = $state('');
  let password  = $state('');
  let error     = $state('');
  let isLoading = $state(false);

  /** Reactive language shorthand — just reads from the engine singleton. */
  const lang = $derived(engine.settings.language);

  /**
   * Discover server locale files so the language dropdown is populated before
   * the user interacts with it.  AppShell also calls this, but AppShell is a
   * parent component whose onMount fires after child pages; calling it here
   * ensures the dropdown appears without waiting for the parent lifecycle.
   */
  $effect(() => {
    (async () => {
      await dataLoader.loadExternalLocales();
      engine.bumpLocalesVersion();
    })();
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
      if (loginResp.status === 403) {
        const body = await loginResp.json().catch(() => ({})) as { error?: string };
        error = body.error === 'AccountExpired'
          ? 'This account was not activated within 7 days and has been suspended. Contact an administrator.'
          : 'This account has been suspended. Contact an administrator.';
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

      const loginData = await loginResp.json() as { needs_password_setup?: boolean };
      const needsSetup = loginData.needs_password_setup === true;

      await sessionContext.loadFromServer();

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

  <div class="w-full max-w-sm flex flex-col gap-4">

    <!-- Header -->
    <div class="text-center">
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
          {isLoading ? ui('login.signing_in', lang) : ui('login.sign_in', lang)}
        </button>

      </form>
    </div>

    <!--
      Theme + Language controls — centered below the card.
      showLabel=true  : flag + full language name (default).
      dropdownUp=true : dropdown opens upward so it doesn't clip at the bottom.
      w-fit mx-auto   : shrinks to content width and centers in the column.
    -->
    <div class="mx-auto w-52">
      <ThemeLanguagePicker dropdownUp={true} />
    </div>

  </div>
</div>
