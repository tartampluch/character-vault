import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

/**
 * @file vite.config.ts
 * @description Vite configuration for the Character Vault SvelteKit application.
 *
 * PHP API PROXY (Phase 14.7):
 *   During local development, the SvelteKit dev server runs on port 5173 and the
 *   PHP server runs on a different port (default: 8080).
 *
 *   Without a proxy, fetch calls to `/api/...` from the browser would fail due to
 *   CORS restrictions (different origin = different port). The CORS middleware in
 *   `api/middleware.php` whitelists localhost:5173, but this only helps for actual
 *   cross-origin requests. Proxying is cleaner:
 *
 *   HOW THE PROXY WORKS:
 *     1. The browser makes a request to http://localhost:5173/api/campaigns
 *     2. Vite's dev server intercepts requests matching the `/api` prefix
 *     3. Vite forwards the request to PHP_API_URL (e.g., http://localhost:8080)
 *        → the PHP server receives: http://localhost:8080/api/campaigns
 *     4. PHP processes the request and returns the response
 *     5. Vite forwards the response back to the browser
 *     6. The browser sees a same-origin response (port 5173) — no CORS issues
 *
 *   DEVELOPMENT WORKFLOW:
 *     Terminal 1: npm run dev          (SvelteKit dev server on port 5173)
 *     Terminal 2: php -S localhost:8080 -t api api/index.php  (PHP server)
 *
 *   PHP_API_URL CONFIGURATION:
 *     - Default: http://localhost:8080 (standard local PHP server)
 *     - Override via environment variable: PHP_API_URL=http://localhost:8080 npm run dev
 *     - Example for different port: PHP_API_URL=http://127.0.0.1:9090 npm run dev
 *
 *   PRODUCTION:
 *     In production, the SvelteKit app and PHP server are typically co-located
 *     (same domain, different paths) so no proxy is needed. Apache/nginx handles
 *     routing: requests to /api/* go to PHP, everything else to SvelteKit.
 *
 *   SECURITY NOTE:
 *     The proxy only applies to the DEVELOPMENT server. Production deployments
 *     must configure the web server (Apache/nginx) for routing. Never expose the
 *     proxy configuration to production.
 *
 * @see api/index.php for the PHP router.
 * @see api/middleware.php for CORS configuration.
 * @see ARCHITECTURE.md Phase 14.7 for the specification.
 */

// The PHP development server URL.
// Configurable via environment variable to support different local setups.
const PHP_API_URL = process.env['PHP_API_URL'] || 'http://localhost:8080';

export default defineConfig({
	plugins: [sveltekit()],

	test: {
		/**
		 * Vitest configuration for unit tests.
		 *
		 * TEST LOCATION:
		 *   - src/tests/*.test.ts — frontend engine + utility tests
		 *
		 * ENVIRONMENT:
		 *   - 'node' for pure TypeScript utilities (mathParser, diceEngine, etc.)
		 *   - Svelte components would need 'jsdom', but we're testing pure functions here.
		 *
		 * ALIASES:
		 *   The $lib alias must be configured so tests can import from src/lib/...
		 */
		environment: 'node',
		globals: true,
		include: ['src/tests/**/*.test.ts'],
		alias: {
			'$lib': new URL('./src/lib', import.meta.url).pathname,
		},
	},

	server: {
		proxy: {
			/**
			 * Proxy all /api/* requests to the PHP development server.
			 *
			 * OPTIONS:
			 *   - target: The PHP server URL (default: http://localhost:8080)
			 *   - changeOrigin: Rewrite the Origin header to match the PHP server's
			 *     expected origin (prevents host-based rejection on strict PHP configs)
			 *   - secure: false — disable SSL verification for local dev (no HTTPS)
			 *   - rewrite: NOT needed here because the PHP server's router expects
			 *     the full /api/* path. If the PHP server is at /api/index.php
			 *     and the requests are /api/campaigns, no path rewriting is needed.
			 */
			'/api': {
				target: PHP_API_URL,
				changeOrigin: true,
				secure: false,
			},
		},
	},
});
