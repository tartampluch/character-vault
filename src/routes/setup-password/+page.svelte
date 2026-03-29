<!--
  @file src/routes/setup-password/+page.svelte
  @description First-login password activation page (Phase 22.6).

  WHEN THIS PAGE IS SHOWN:
    After a successful no-password login (new account or admin bootstrap),
    the backend returns `needs_password_setup: true`. The layout guard in
    +layout.svelte detects this and redirects here before the user can access
    any other page.

  FLOW:
    1. User enters a new password + confirmation.
    2. Client validates: non-empty, ≥ 8 characters, both fields match.
    3. Calls PUT /api/auth/setup-password via userApi.setupPassword().
    4. On success: clears sessionContext.needsPasswordSetup, navigates to /campaigns.
    5. On error: displays a localised error banner.

  DIRECT-ACCESS GUARD:
    If the user navigates directly to /setup-password without needing setup
    (needsPasswordSetup is false), they are redirected to /campaigns immediately.
    This prevents the page from being used as a general password-change form.

  DESIGN:
    Matches the login page visual style (card on centred background) so there
    is no jarring layout shift between login → setup.
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { setupPassword, ApiError } from '$lib/api/userApi';

  const lang = $derived(engine.settings.language);

  // ── State ──────────────────────────────────────────────────────────────────
  let newPassword     = $state('');
  let confirmPassword = $state('');
  let error           = $state('');
  let isLoading       = $state(false);

  // ── Validation ─────────────────────────────────────────────────────────────

  /**
   * Returns a human-readable validation error string, or '' if the form is valid.
   * Evaluated reactively so the submit button can enable/disable immediately.
   */
  const validationError = $derived((): string => {
    if (newPassword.length === 0)        return ui('setup_password.val_enter',   lang);
    if (newPassword.length < 8)          return ui('setup_password.val_min8',    lang);
    if (confirmPassword.length === 0)    return ui('setup_password.val_confirm', lang);
    if (newPassword !== confirmPassword) return ui('setup_password.val_mismatch',lang);
    return '';
  });

  const canSubmit = $derived(!isLoading && validationError() === '');

  // ── Direct-access guard ────────────────────────────────────────────────────
  // If the session does not require password setup (e.g. the user bookmarked
  // this URL after already completing setup), redirect to the campaign hub.
  onMount(() => {
    if (!sessionContext.needsPasswordSetup) {
      goto('/campaigns');
    }
  });

  // ── Submit handler ─────────────────────────────────────────────────────────

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = '';

    // Final client-side guard (also enforced by server).
    const ve = validationError();
    if (ve) { error = ve; return; }

    isLoading = true;
    try {
      await setupPassword(newPassword);

      // Clear the setup flag so the layout guard stops redirecting.
      sessionContext.clearPasswordSetup();

      // Navigate to the campaign hub — the user is now fully set up.
      await goto('/campaigns');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          // Session flag was not set — the account already has a password.
          // Redirect to campaigns; this page should not have been shown.
          await goto('/campaigns');
          return;
        }
        error = err.message;
      } else {
        error = ui('common.error_unexpected', lang);
        console.error('[SetupPassword] unexpected error:', err);
      }
    } finally {
      isLoading = false;
    }
  }
</script>

<svelte:head>
  <title>{ui('setup_password.subtitle', lang)} — Character Vault</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center px-4 bg-background">
  <div class="w-full max-w-sm">

    <!-- Header -->
    <div class="text-center mb-8">
      <h1 class="text-2xl font-bold text-text-primary mb-1">{ui('app.title', lang)}</h1>
      <p class="text-sm text-text-muted">{ui('setup_password.subtitle', lang)}</p>
    </div>

    <!-- Card -->
    <div class="card p-6 flex flex-col gap-4">

      <!-- Info banner -->
      <div class="px-3 py-2 rounded border border-accent/30 bg-accent/10 text-sm text-text-secondary">
        {ui('setup_password.info', lang)}
      </div>

      <!-- Error banner -->
      {#if error}
        <div class="px-3 py-2 rounded border border-red-700/40 bg-red-950/20 text-red-400 text-sm" role="alert">
          {error}
        </div>
      {/if}

      <!-- Setup form -->
      <form onsubmit={handleSubmit} class="flex flex-col gap-4" novalidate>

        <!-- New password -->
        <div class="flex flex-col gap-1.5">
          <label for="new-password" class="text-xs font-medium text-text-secondary">
            {ui('setup_password.new_label', lang)}
          </label>
          <input
            id="new-password"
            type="password"
            bind:value={newPassword}
            autocomplete="new-password"
            required
            disabled={isLoading}
            class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary
                   placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50
                   focus:border-accent transition-colors disabled:opacity-50"
            placeholder={ui('setup_password.placeholder_min8', lang)}
          />
        </div>

        <!-- Confirm password -->
        <div class="flex flex-col gap-1.5">
          <label for="confirm-password" class="text-xs font-medium text-text-secondary">
            {ui('setup_password.confirm_label', lang)}
          </label>
          <input
            id="confirm-password"
            type="password"
            bind:value={confirmPassword}
            autocomplete="new-password"
            required
            disabled={isLoading}
            class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary
                   placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50
                   focus:border-accent transition-colors disabled:opacity-50"
            placeholder={ui('setup_password.placeholder_repeat', lang)}
          />
          <!-- Live mismatch hint -->
          {#if confirmPassword.length > 0 && newPassword !== confirmPassword}
            <p class="text-xs text-red-400 mt-0.5">{ui('setup_password.mismatch_hint', lang)}</p>
          {/if}
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          class="btn-primary w-full mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? ui('common.saving', lang) : ui('setup_password.submit', lang)}
        </button>

      </form>
    </div>

  </div>
</div>
