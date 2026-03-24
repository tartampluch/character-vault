<!--
  @file src/routes/login/+page.svelte
  @description Login page — authenticates against POST /api/auth/login.

  FLOW:
    1. User submits username + password.
    2. Calls POST /api/auth/login → PHP creates a session cookie.
    3. Calls GET  /api/auth/me    → populates sessionContext + CSRF token.
    4. Redirects to `returnTo` query param or the campaign hub (/campaigns).

  Phase 14.2 — real PHP session auth replaces the mock SessionContext.
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';

  // Redirect destination — the page the user was trying to reach before being
  // sent here by SessionContext.loadFromServer().
  const returnTo = $derived(($page.url.searchParams.get('returnTo')) ?? '/campaigns');

  let username  = $state('');
  let password  = $state('');
  let error     = $state('');
  let isLoading = $state(false);

  async function handleLogin(e: SubmitEvent) {
    e.preventDefault();
    error     = '';
    isLoading = true;

    try {
      // 1. Authenticate — PHP creates the session cookie.
      const loginResp = await fetch('/api/auth/login', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ username: username.trim(), password }),
      });

      if (loginResp.status === 401) {
        error = 'Invalid username or password.';
        return;
      }
      if (loginResp.status === 429) {
        error = 'Too many login attempts. Please wait 15 minutes.';
        return;
      }
      if (!loginResp.ok) {
        error = `Login failed (HTTP ${loginResp.status}). Please try again.`;
        return;
      }

      // 2. Populate reactive session state + CSRF token.
      await sessionContext.loadFromServer();

      // 3. Navigate to the originally intended destination.
      await goto(decodeURIComponent(returnTo));
    } catch (err) {
      error = 'Could not reach the server. Is the PHP API running?';
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
      <p class="text-sm text-text-muted">Sign in to continue</p>
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
          <label for="username" class="text-xs font-medium text-text-secondary">Username</label>
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
          <label for="password" class="text-xs font-medium text-text-secondary">Password</label>
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
          {isLoading ? 'Signing in…' : 'Sign In'}
        </button>

      </form>
    </div>

    <!-- Dev hint -->
    <p class="text-center text-xs text-text-muted mt-4">
      Dev accounts: <code class="bg-surface-alt px-1 rounded">gm / gm</code> or
      <code class="bg-surface-alt px-1 rounded">player / player</code>
      — run <code class="bg-surface-alt px-1 rounded">php api/seed.php</code> to create them.
    </p>

  </div>
</div>
