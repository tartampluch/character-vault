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

{@render children()}
