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
	import { themeManager } from '$lib/stores/ThemeManager.svelte';

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

	onMount(() => {
		// Initialize theme: reads cookie, resolves system preference, attaches
		// OS preference listener. Safe to call — idempotent (guarded by init flag).
		themeManager.init();
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
-->
<AppShell>
	{@render children()}
</AppShell>
