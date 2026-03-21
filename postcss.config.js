/**
 * @file postcss.config.js
 * @description PostCSS configuration for Character Vault.
 *
 * This file is auto-detected by Vite and applied to ALL CSS processed by the
 * build pipeline, including:
 *   - Global CSS imports (src/app.css)
 *   - Svelte component <style> blocks
 *   - Any CSS module files
 *
 * PLUGINS:
 *   1. @tailwindcss/postcss — Tailwind CSS v4 PostCSS plugin.
 *      Processes `@import "tailwindcss"`, `@theme`, `@apply`, and all
 *      Tailwind directives. This is the v4 replacement for the old
 *      `tailwindcss` PostCSS plugin used in v3.
 *
 *   2. autoprefixer — Adds vendor prefixes based on the Browserslist config
 *      (or defaults). Runs AFTER Tailwind so prefixes are applied to the
 *      final generated CSS, not to intermediate @apply rules.
 *
 * NOTE: No separate tailwind.config.ts is needed for Tailwind v4. The theme
 * configuration lives in src/app.css using @theme / @theme inline blocks —
 * see that file for the full design system definition.
 */
export default {
	plugins: {
		'@tailwindcss/postcss': {},
		autoprefixer: {}
	}
};
