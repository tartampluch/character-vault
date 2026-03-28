/**
 * @file src/routes/+layout.ts
 *
 * Disable server-side rendering for the entire application.
 *
 * WHY:
 *   Character Vault is a fully authenticated app — every meaningful page
 *   requires the user to be logged in, so there is no SEO benefit to SSR.
 *
 *   More importantly, SSR causes a "locale flash": the server cannot read the
 *   user's `cv_language` cookie via `document.cookie` (unavailable in Node.js),
 *   so `readLanguageCookie()` always returns `'en'` during SSR, and the
 *   full page is rendered in English and sent to the browser. When the client
 *   then hydrates with the correct language (e.g. French from the cookie),
 *   Svelte re-renders the UI — causing a visible flash of English content.
 *
 *   Disabling SSR means the browser receives an empty HTML shell and renders
 *   the app entirely on the client. `readLanguageCookie()` and
 *   `loadUiLocaleFromCache()` both have access to browser APIs (`document`,
 *   `localStorage`), so the correct language is applied before the first paint.
 *
 *   On a warm cache (subsequent visits): the locale is restored synchronously
 *   from localStorage → the app renders directly in the user's language with
 *   zero flash and zero spinner.
 *
 *   On a cold cache (first ever visit or expired cache): a full-screen spinner
 *   is shown while the locale JSON is fetched, then content renders in the
 *   correct language.
 */
export const ssr = false;
