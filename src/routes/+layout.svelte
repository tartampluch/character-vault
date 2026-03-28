<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	/**
	 * Global CSS entry point — must be imported in the root layout so that
	 * Tailwind's base reset, theme tokens, and component classes are available
	 * across the entire application. PostCSS (@tailwindcss/postcss plugin) and
	 * autoprefixer process this file during the Vite build.
	 *
	 * This import also serves as the Tailwind v4 configuration entry point
	 * (src/app.css contains @theme, @custom-variant, and @layer directives).
	 */
	import '../app.css';

	/**
	 * ThemeManager initialization — Phase 19.2.
	 *
	 * We import the singleton and call init() from onMount() so that browser APIs
	 * (document.cookie, window.matchMedia) are available. The root layout is the
	 * correct place to do this because it wraps every page in the application.
	 *
	 * TIMING:
	 *   - Before first paint: src/app.html inline script applies the class
	 *     synchronously to prevent FOWT (Flash Of Wrong Theme).
	 *   - After hydration: ThemeManager.init() takes over, re-reads the cookie,
	 *     and attaches the matchMedia listener for 'system' mode OS changes.
	 *   - The two mechanisms are complementary — the script handles the initial
	 *     paint, ThemeManager handles runtime interactivity.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { themeManager } from '$lib/stores/ThemeManager.svelte';
	import { sessionContext } from '$lib/engine/SessionContext.svelte';

	/**
	 * AppShell — Phase 19.4.
	 *
	 * The AppShell wraps every page in the application with:
	 *   - A collapsible sidebar navigation (Sidebar.svelte)
	 *   - A mobile-first top bar with hamburger menu
	 *   - A scrollable main content area
	 *
	 * It owns the sidebar collapsed/mobile state and persists it in a cookie.
	 * The {children} slot is rendered inside the AppShell's content area.
	 */
	import AppShell from '$lib/components/layout/AppShell.svelte';

	let { children } = $props();

	onMount(async () => {
		// Initialize theme: reads cookie, resolves system preference, attaches
		// OS preference listener. Safe to call — idempotent (guarded by init flag).
		themeManager.init();

		// Phase 14.2: Bootstrap the PHP session.
		// Calls GET /api/auth/me to populate sessionContext with the logged-in
		// user's identity and CSRF token.
		// If not logged in (401), redirects to /login — UNLESS we're already there
		// (avoids infinite redirect loop on the login page itself).
		if (!$page.url.pathname.startsWith('/login')) {
			await sessionContext.loadFromServer();
		}
	});

	/**
	 * Phase 22.6 — Password-setup redirect guard.
	 *
	 * Runs reactively whenever `sessionContext.needsPasswordSetup` changes.
	 * If the flag is true and the user is not already on the setup or login pages,
	 * redirect to /setup-password so they cannot access any other page.
	 *
	 * WHY $effect (not onMount)?
	 *   The flag becomes true AFTER login completes (set by loadFromServer()
	 *   which is called inside handleLogin() on the login page). At that point
	 *   the layout's onMount has already run. A reactive $effect re-fires
	 *   whenever the reactive dependency changes, so it catches the flag change
	 *   regardless of when the navigation occurs.
	 *
	 * GUARD EXCLUSIONS:
	 *   /login         — the user is in the process of authenticating.
	 *   /setup-password — already on the correct page, no redirect needed.
	 */
	$effect(() => {
		const path = $page.url.pathname;
		if (
			sessionContext.needsPasswordSetup &&
			!path.startsWith('/setup-password') &&
			!path.startsWith('/login')
		) {
			goto('/setup-password');
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<!--
  Every page in the application is wrapped in the AppShell layout.
  The AppShell renders the sidebar, mobile top bar, and scrollable content
  area. Individual pages are rendered via the {children} slot inside the
  content area.

  Phase 19.4 — AppShell replaces the bare {@render children()} call that was
  here in previous phases. The AppShell itself uses {@render children()} internally
  to insert the page content into the correct slot.

  WHY {children} SHORTHAND INSTEAD OF <AppShell>{@render children()}</AppShell>?

  In Svelte 5, writing:
    <AppShell>
      {@render children()}
    </AppShell>
  creates a STABLE IMPLICIT SNIPPET whose function reference never changes.
  AppShell's internal `{@render children()}` tracks that stable reference as its
  reactive dependency.  When SvelteKit swaps the routing snippet on navigation,
  AppShell's reactive block never sees a reference change — the old page DOM is
  NOT torn down, and the new page renders as additional DOM appended below it.
  Result: both the campaign list and the campaign detail are simultaneously in the
  DOM (the exact "content appearing under the list" bug).

  Passing the routing snippet DIRECTLY as a prop:
    <AppShell {children} />
  makes AppShell's reactive `{@render children()}` track the routing snippet
  reference itself. Every client-side navigation produces a new routing snippet
  reference, the reactive block fires, the old DOM is unmounted, and the new page
  renders in its place — the intended behaviour.
-->
<AppShell {children} />
