/**
 * @file src/lib/utils/languageCookie.ts
 * @description Cookie-based persistence for the user's language preference.
 *
 * DESIGN:
 *   Mirrors the ThemeManager cookie pattern: a simple key/value browser cookie
 *   (path=/, max-age=1 year, SameSite=Lax) stores a BCP-47 language code.
 *
 *   The language cookie is shared between the login page and the in-app sidebar.
 *   It is written whenever the user explicitly selects a language, and read on
 *   mount to restore the preference across sessions.
 *
 * UNAVAILABLE LANGUAGE HANDLING:
 *   Some languages (e.g. 'fr') are only available after a campaign is loaded
 *   because their locale files are served from `/api/locales` (which requires
 *   campaign rule sources). On pages where the locale has not yet loaded (e.g.
 *   the login page before any campaign is selected), the stored code may not be
 *   present in `engine.availableLanguages`.
 *
 *   Contract:
 *     • Read the cookie freely — always returns the raw stored code or 'en'.
 *     • NEVER write the cookie during a fallback (unavailable language) —
 *       the stored preference must survive until the locale becomes available.
 *     • Write ONLY when the user explicitly selects a language.
 *
 * @see src/lib/stores/ThemeManager.svelte.ts  for the identical cookie pattern.
 */

/** Browser cookie name for the persisted language preference. */
export const LANG_COOKIE_NAME = 'cv_language';

/** Cookie lifetime: 1 year in seconds. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Read the stored language preference from the browser cookie.
 *
 * @returns A BCP-47 language code (e.g. 'fr'), or 'en' if no cookie is set.
 */
export function readLanguageCookie(): string {
  if (typeof document === 'undefined') return 'en';
  for (const entry of document.cookie.split(';')) {
    const [key, value] = entry.trim().split('=');
    if (key === LANG_COOKIE_NAME && value) {
      return decodeURIComponent(value);
    }
  }
  // Legacy: also check localStorage for apps that stored the preference there.
  try {
    const ls = localStorage.getItem('cv_user_language');
    if (ls) return ls;
  } catch { /* SSR / private browsing */ }
  return 'en';
}

/**
 * Persist the user's language selection to a browser cookie.
 *
 * Call this ONLY when the user explicitly selects a language — never when
 * falling back to 'en' because the desired language is not yet available.
 *
 * @param code - BCP-47 language code to persist (e.g. 'fr').
 */
export function writeLanguageCookie(code: string): void {
  if (typeof document === 'undefined') return;
  document.cookie =
    `${LANG_COOKIE_NAME}=${encodeURIComponent(code)}` +
    `; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  // Also clear the legacy localStorage key if it exists.
  try { localStorage.removeItem('cv_user_language'); } catch { /* ignore */ }
}
