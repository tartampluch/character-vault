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

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
