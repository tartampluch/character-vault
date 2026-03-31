import adapter from '@sveltejs/adapter-static';

/**
 * @type {import('@sveltejs/kit').Config}
 *
 * SPA MODE — NO NODE.JS SERVER
 * ─────────────────────────────
 * Character Vault is built as a fully static Single-Page Application.
 * The SvelteKit build output is a folder of HTML/CSS/JS files served directly
 * by the PHP built-in server or Apache/nginx.  There is no Node.js server at
 * runtime.
 *
 * `fallback: 'index.html'`
 *   Any URL that has no matching pre-rendered file is served `index.html`.
 *   The SvelteKit client-side router handles the route in the browser.
 *   This is the standard configuration for SPA deployments.
 *
 * `ssr = false` (set in src/routes/+layout.ts)
 *   No Svelte component tree is rendered on the server side.  The browser
 *   receives an empty HTML shell and renders the entire application.
 *
 * DEPLOYMENT
 *   PHP built-in server:
 *     php -S localhost:8080 -t build/
 *   Apache VirtualHost:
 *     DocumentRoot /path/to/build
 *     FallbackResource /index.html
 *   nginx:
 *     root /path/to/build;
 *     try_files $uri /index.html;
 *   `/api/*` routes must be proxied/handled separately by the PHP router.
 */
const config = {
	kit: {
		adapter: adapter({
			/** SPA fallback: serve index.html for any path without a static file. */
			fallback: 'index.html',
		}),
	},
	vitePlugin: {
		dynamicCompileOptions: ({ filename }) =>
			filename.includes('node_modules') ? undefined : { runes: true },
	},
};

export default config;
